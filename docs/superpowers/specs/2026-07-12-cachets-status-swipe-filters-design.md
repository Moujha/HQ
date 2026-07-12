# Cachets — statut Annulé, swipe de statut, filtres/tri/recherche

*2026-07-12*

## Contexte

La page `/finance/cachets` a aujourd'hui un statut fermé (`provisoire`/`tbc`, `facturé`, `cachet_en_attente`, `payé`) sans moyen de marquer un cachet comme annulé, un changement de statut qui oblige à ouvrir la bottom sheet d'édition, et un bloc de filtres simpliste (4 pills : Tous/Actifs/Provisoires/Expirés) sans recherche ni tri.

Objectif : ajouter un statut `annulé`, permettre de changer de statut par swipe (façon Tinder) directement sur la liste, et remplacer le bloc de filtres par 3 composants (filtres multi-select en bottom sheet, tri par date, recherche par intitulé).

## 1. Statut `annulé`

- Migration SQL (`supabase/migrations/20260712000001_payment_annule_status.sql`), même pattern que `20260711000001_payment_tbc_status.sql` : drop + recreate la contrainte CHECK sur `payments.status` pour inclure `'annulé'`.
- Soft-delete uniquement : le paiement n'est jamais supprimé, juste marqué `annulé`. Visible seulement si le filtre Statut "Annulé" est explicitement coché (voir section 3).
- Exclu de tous les calculs financiers/intermittence, au même titre que `tbc` aujourd'hui :
  - `src/lib/cachets.ts` : `isValidAt`, `countValidHours`, `expiringWithin`, `collectUpcoming`, boucle `currentActive` de `computeProjection` — ajouter `annulé` à chaque exclusion existante de `tbc`.
  - `src/components/modules/cachets/IntermittenceGraph.tsx` : retirer `annulé` de `ALL_STATUSES` et `CONFIRMED_STATUSES` (disparaît complètement du graphique, y compris de la courbe potentielle).
  - `src/routes/_authenticated/finance/index.tsx` : la query `management_fees` sélectionne déjà `payment:payments(payment_date)` → étendre à `payment:payments(payment_date, status)` et exclure `f.payment?.status === "annulé"` dans `filteredFees`, pour que le "reste dû" ignore les commissions liées à des cachets annulés.
  - `src/components/modules/calendrier/EventLine.tsx` : `deriveDisplayStatus` fait un `reduce` sur `PAYMENT_RANK` pour choisir le statut le "moins avancé" parmi les paiements liés à un événement. `annulé` n'existe pas dans `PAYMENT_RANK`, donc filtrer les paiements `annulé` du tableau avant le `reduce` (sinon ils seraient traités comme rang 0 par défaut, ce qui fausserait l'affichage). Fix nécessaire pour ne pas casser cette page en réutilisant le même type de statut.

## 2. Renommage du label `cachet_en_attente`

"En attente" → **"Confirmé"**, dans les 5 endroits qui affichent ce statut de paiement :
`CachetRow.tsx`, `EditPaymentDrawer.tsx`, `RevenueLine.tsx`, `EventLine.tsx`, `AddRevenueSheet.tsx`.

Ne pas toucher aux autres "En attente" du repo (`NotificationsToggle.tsx`, `AddGrantDrawer.tsx`, `constants.ts` `en_attente`) — statuts différents (notifications push, subventions), sans lien avec les paiements.

Ordre canonique (confirmé avec l'utilisateur, cohérent avec `PAYMENT_RANK` déjà existant dans `EventLine.tsx`) :

```
Annulé  ←→  TBC  ←→  Confirmé  ←→  Facturé  ←→  Payé
(provisoire/tbc → cachet_en_attente → facturé → payé, + annulé en position -1)
```

## 3. Swipe façon Tinder sur `CachetRow`

- Nouvelle dépendance : **framer-motion** (pas encore utilisée dans le projet). Nécessaire pour `drag="x"`, rotation liée à la position du drag, et détection de vélocité au relâchement — hors scope de la réimplémenter à la main proprement.
- Actif uniquement si `isManager` ; pour l'artiste, `CachetRow` reste un bouton simple (comportement actuel, pas de `drag`).
- Pendant le drag : la carte suit le doigt horizontalement + légère rotation, un badge de fond apparaît (vert "→ Confirmé" en swipant à droite depuis TBC, rouge "← Annulé" en swipant à gauche depuis TBC, etc.), opacité proportionnelle à la distance.
- Seuil de commit : distance ≥ ~35% de la largeur de la carte OU vélocité de relâchement suffisante. En dessous : snap-back en spring, aucun changement.
- Au commit : update optimiste local + écriture Supabase (`status` + gestion `expires_at`/`management_fees` déjà gérée par les triggers SQL existants) + `toast.success` avec action "Annuler" (5s pour revenir en arrière, ré-écrit l'ancien statut si cliqué).
- Bornes : à `Payé` (bout droit) swipe droite → résistance, rien ne se passe. À `Annulé` (bout gauche) swipe gauche → résistance, rien ne se passe. Swipe droite depuis `Annulé` → retour à `TBC`.
- `EditPaymentDrawer.tsx` : ajouter `annulé` aux `STATUS_OPTIONS` (et au schema zod) pour que le statut reste éditable manuellement aussi (pas uniquement via swipe — utile au clavier/souris ou pour un changement qui saute plusieurs étapes d'un coup).

## 4. Filtres / Tri / Recherche

Remplace entièrement le bloc de pills `Tous/Actifs/Provisoires/Expirés` par une ligne unique :

```
┌───────────────────┐┌─────┐┌─────┐
│ 🔍 Rechercher...   ││ ▤ 2 ││ ↓  │
└───────────────────┘└─────┘└─────┘
```

- **Recherche** : filtre live sur `payment.notes` (insensible casse/accents), combinée en AND avec les autres filtres.
- **Bouton Filtres** (badge = nombre total de filtres actifs) : ouvre une bottom sheet (`Drawer`, réutilise le composant déjà utilisé par `AddRevenueSheet`/`EditPaymentDrawer`) avec 3 groupes de chips multi-select :
  - **Statut** : TBC, Confirmé, Facturé, Payé, Annulé
  - **Territoire** : France, Étranger
  - **Type** : les 9 valeurs de `source` (Concert, Répétition, Formation, Accompagnement, Figuration, Résidence, Clip, Track, Label)
  - Application instantanée (pas de bouton "Valider" séparé) ; lien "Réinitialiser" pour tout vider.
  - Sémantique : OR à l'intérieur d'un groupe, AND entre groupes.
  - **Défaut** : aucun filtre Statut coché = tout affiché **sauf Annulé** (il faut cocher "Annulé" explicitement pour le voir apparaître dans la liste).
- **Bouton Tri** : toggle asc/desc sur `payment_date`, icône qui change de sens. Défaut : décroissant (le plus récent d'abord, comme aujourd'hui).
- Le graphique d'intermittence et l'alerte "expire dans 60 jours" en haut de page continuent de se baser sur `cachets` (toutes les données, hors `sacem`) **non filtré par la recherche/les filtres UI** — seuls exclus les statuts déjà hors-calcul (`tbc`, `annulé`) via `src/lib/cachets.ts`. Les filtres de cette section n'affectent que la liste de lignes affichées en dessous.

## Fichiers impactés

- `supabase/migrations/20260712000001_payment_annule_status.sql` (nouveau)
- `src/lib/cachets.ts`
- `src/components/modules/cachets/CachetRow.tsx` (swipe + labels + style annulé)
- `src/components/modules/cachets/EditPaymentDrawer.tsx` (label + option annulé)
- `src/components/modules/cachets/IntermittenceGraph.tsx`
- `src/components/modules/finance/RevenueLine.tsx` (label)
- `src/components/modules/finance/AddRevenueSheet.tsx` (label)
- `src/components/modules/calendrier/EventLine.tsx` (label + fix `deriveDisplayStatus`)
- `src/routes/_authenticated/finance/cachets.tsx` (nouveau bloc recherche/filtres/tri, retrait de l'ancien)
- `src/routes/_authenticated/finance/index.tsx` (exclusion `annulé` du reste dû)
- `package.json` (ajout `framer-motion`)
- Nouveau composant : `src/components/modules/cachets/CachetFilterSheet.tsx` (bottom sheet de filtres)

## Vérification

- `pnpm test` (tests existants sur `src/lib/cachets.ts` + nouveaux cas pour `annulé`)
- `pnpm exec tsc --noEmit`
- Test manuel via `pnpm dev` : swiper un cachet dans les deux sens jusqu'aux bornes, vérifier le toast + annulation, vérifier que le graphique/l'alerte ignorent les cachets annulés, tester la recherche + les 3 groupes de filtres + le tri.
