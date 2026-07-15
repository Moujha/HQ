# Finance page — swipe, search/filter/sort, click-to-edit parity with Cachets

*2026-07-15*

## Contexte

La page `/finance/cachets` a récemment gagné : un statut `annulé`, un swipe façon Tinder pour changer de statut, une recherche + feuille de filtres multi-select + tri par date (remplaçant l'ancien bloc de pills), l'auto-sauvegarde à la fermeture de la bottom sheet d'édition, et une largeur de sheet verrouillée. La page `/finance` (vue globale de tous les revenus, pas seulement les cachets) n'a rien de tout ça : sa liste (`RevenueLine`) n'est ni swipeable ni cliquable, et son bloc de filtres est l'ancien système de pills (Tous/Cachets/Tracks/Label/À venir).

Objectif : porter ces fonctionnalités sur `/finance`, avec une différence importante — cette page affiche aussi les paiements `source='sacem'`, qui depuis l'audit data ont un modèle de commission différent (calculée via `payment_lines`, pas directement sur le paiement). Modifier le statut ou le montant d'un paiement SACEM par swipe/édition casserait ce calcul.

## 1. Extraction du geste swipe (`SwipeableRow`)

Nouveau composant `src/components/app/SwipeableRow.tsx`, extrait de la logique actuelle de `CachetRow.tsx` (drag framer-motion, distinction tap/drag via `onDragStart`/`onTap`, snap-back, labels de fond révélés au drag). Signature :

```ts
interface SwipeableRowProps {
  children: React.ReactNode;
  swipeEnabled?: boolean;       // false → rendu en <button> simple, pas de drag
  onClick?: () => void;
  nextLabel: string | null;     // null = borne atteinte, pas de swipe droite
  prevLabel: string | null;     // null = borne atteinte, pas de swipe gauche
  onCommitRight?: () => void;
  onCommitLeft?: () => void;
}
```

`CachetRow.tsx` est refactorisé pour utiliser `SwipeableRow` (aucun changement de comportement, juste extraction — la carte "reveal" verte/rouge, le seuil de 160px/900px/s, `dragSnapToOrigin`, tout est repris tel quel).

## 2. Logique de statut partagée (`src/lib/cachets.ts`)

`STATUS_ORDER`, `orderIndex`, `nextStatus`, `previousStatus`, `STATUS_LABEL`, et un nouvel helper `writePaymentStatus(id, status)` (l'update Supabase + `dispatchEvent("mc-refresh")`, identique au `writeStatus` actuel de `cachets.tsx`) déménagent de `CachetRow.tsx` vers `src/lib/cachets.ts` — c'est la lib "statut de paiement" partagée, pas un composant d'affichage. `CachetRow.tsx` et `RevenueLine.tsx` importent depuis là. `cachets.tsx` (la route) met à jour son import de `STATUS_LABEL`/`nextStatus`/`previousStatus` en conséquence.

## 3. `RevenueLine.tsx` — swipe + clic pour éditer

- Nouveau prop `interactive?: boolean` (défaut `true`).
- `interactive=false` (réservé aux paiements `source==='sacem'`) : rendu en `<div>` (pas `<button>`, pas de sémantique cliquable), affichage inchangé sinon.
- `interactive=true` : le contenu est enveloppé dans `<SwipeableRow>` avec `swipeEnabled` (manager uniquement, comme Cachets), `onClick` (ouvre `EditPaymentDrawer`), et les next/prev calculés via `nextStatus`/`previousStatus`/`STATUS_LABEL` partagés.
- `RevenueLineData.status` s'élargit pour inclure `"tbc"` (cohérence de type avec les fonctions partagées — ce statut existe déjà en base, `RevenueLine` doit pouvoir l'afficher sans planter si une ligne l'a).

`EditPaymentDrawer` n'a besoin d'aucune modification : ses `SOURCE_OPTIONS` couvrent déjà toutes les valeurs de `source` non-SACEM utilisées sur la page Finance.

## 4. Barre recherche/filtres/tri partagée (`SearchFilterSortBar`)

Le bloc `[🔍 recherche][▤ Filtres (n)][↕ Date]` de `cachets.tsx` est dupliqué à l'identique sur Finance — extrait en composant partagé `src/components/app/SearchFilterSortBar.tsx` (props : `search`, `onSearchChange`, `activeFilterCount`, `onFilterClick`, `sortAsc`, `onSortToggle`). `cachets.tsx` est mis à jour pour l'utiliser (pas de changement visuel).

## 5. `CachetFilterSheet.tsx` — types de source configurables

Nouveau prop optionnel `sourceOptions` (défaut : les 9 valeurs actuelles). La page Finance passe une liste de 10 (les 9 + `{ value: "sacem", label: "SACEM" }`), pour pouvoir filtrer/chercher les lignes SACEM même si elles ne sont pas interactives.

## 6. `finance/index.tsx` — remplacement complet du bloc de filtres

- Suppression de `FinanceFilter`/`FILTER_LABELS`/la ligne de pills.
- État `filters: CachetFilters`, `filterSheetOpen`, `sortAsc` (identique au pattern de `cachets.tsx`).
- `FullPayment` s'élargit pour inclure `territory` explicitement (déjà présent en base via `select: "*"`, juste absent du type TS — nécessaire pour satisfaire `CachetForFilter`).
- Le filtre "À venir" disparaît en tant qu'onglet dédié : cocher TBC/Confirmé dans Statut couvre le même besoin, de façon cohérente avec le reste de l'app. Par défaut (aucun filtre Statut coché), `annulé` reste caché comme sur Cachets.
- `editPayment` state + `<EditPaymentDrawer>` ajoutés (actuellement absents de cette page).
- `handleSwipeStatusChange` reprend le pattern de `cachets.tsx`, en s'appuyant sur `writePaymentStatus` partagé.
- Le graphique d'intermittence n'est pas ajouté ici — resté spécifique à `/finance/cachets`.

## Fichiers impactés

- `src/components/app/SwipeableRow.tsx` (nouveau)
- `src/components/app/SearchFilterSortBar.tsx` (nouveau)
- `src/lib/cachets.ts` (déplacement de la logique de statut + `writePaymentStatus`)
- `src/components/modules/cachets/CachetRow.tsx` (refactor pour utiliser `SwipeableRow` + import statut partagé)
- `src/components/modules/finance/RevenueLine.tsx` (swipe + clic + prop `interactive`)
- `src/components/modules/cachets/CachetFilterSheet.tsx` (prop `sourceOptions`)
- `src/routes/_authenticated/finance/cachets.tsx` (mise à jour des imports statut + utilisation de `SearchFilterSortBar`, pas de changement de comportement)
- `src/routes/_authenticated/finance/index.tsx` (réécriture du bloc filtres + ajout édition/swipe)

## Vérification

- `pnpm test` (tests existants sur `src/lib/cachets.ts` — la relocalisation ne doit rien casser) + nouveaux cas si pertinents pour `nextStatus`/`previousStatus` déplacés
- `pnpm exec tsc --noEmit`
- Test manuel via `pnpm dev` (avec les vraies credentials Supabase) : sur `/finance`, vérifier qu'une ligne SACEM n'est ni swipeable ni cliquable, qu'une ligne normale l'est (swipe + clic → sheet → fermeture auto-save), que la recherche/filtre/tri fonctionnent, et que `/finance/cachets` n'a subi aucune régression visuelle ou fonctionnelle après le refactor.
