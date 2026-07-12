# Finance Redesign — Design Spec

## Goal

Remplacer les onglets Cachets + Fees + Factures par un unique onglet **Finance** qui centralise tous les revenus (passés ou à venir), avec un funnel d'ajout smooth multi-étapes et des sous-pages dédiées Cachets et Fees.

## Architecture

### Navigation (BottomNav)

**Manager (avant):** Cachets · Fees · Factures · Tâches · [Plus: Agenda, Tracks, Subventions]  
**Manager (après):** Finance · Tâches · Agenda · [Plus: Tracks, Subventions]

**Artist (après) :** `/finance/cachets` · Tâches · Agenda — le lien Cachets dans l'artist nav pointe sur `/finance/cachets`

### Routes

| Ancienne route | Nouvelle route | Action |
|---|---|---|
| `/cachets` | `/finance/cachets` | Renommer + déplacer |
| `/fees` | `/finance/fees` | Renommer + déplacer |
| `/factures` | supprimée | "Facturé" devient un statut de paiement |
| — | `/finance` | Nouvelle page principale |

Structure fichiers TanStack Router :
```
src/routes/_authenticated/
  finance/
    index.tsx          → /finance  (page principale)
    cachets.tsx        → /finance/cachets
    fees.tsx           → /finance/fees
```
Pas de `route.tsx` dans le dossier finance — chaque page est indépendante (pas de layout partagé).

---

## Page Finance (`/finance`)

### Composants

**Header :** `AppHeader title="Finance"`

**Cartes de navigation (2 colonnes) :**
- Carte Cachets : `N cachets validés · X heures` → tap → `/finance/cachets`
- Carte Fees : `XX € reste dû` → tap → `/finance/fees`

**Chips de filtre (défilement horizontal) :**  
`Tous` · `Cachets` · `SACEM` · `Label` · `Clip` · `Résidence` · `À venir`

`À venir` = revenus avec `payment_date > today` ou `status IN ('provisoire', 'cachet_en_attente')`.

**Liste revenus :** composant `RevenueLine` partagé — titre, source badge, date, montant, statut chip.

**FAB "+" :** fixe en bas à droite, ouvre `AddRevenueSheet`.

### Données

```ts
// Liste principale
useCollection("payments", {
  select: "*, batch:payment_batches(batch_count)",
  order: { column: "payment_date", ascending: false },
})

// Pour les cartes de navigation
useCollection("management_fees", { select: "*, payment:payments(payment_date)" })
useCollection("expenses", {})
// → computeResteDu(fees, expenses) pour la carte Fees
// → countValidCachets(payments) + countValidHours(payments) pour la carte Cachets
```

Filtrage côté client par chip sélectionnée.

---

## Sous-page Cachets (`/finance/cachets`)

- IntermittenceGraph : timeline area chart (Recharts) de -13 mois à +6 mois
  - Courbe bleue "Confirmés" = payé + cachet_en_attente + facturé + provisoire
  - Courbe pointillée "TBC" = tbc uniquement
  - ReferenceDot visible sur la date du jour avec valeur
  - Objectif 53 cachets affiché en ligne horizontale
- Chips : `Actifs` · `Provisoires` · `Expirés`
- Liste `CachetRow` : affiche N cachets (pas le montant €) + badge statut
  - Batch rows : 1 cachet affiché par ligne (batch_count pour le compteur global uniquement)
  - Heures : visibles si counts_for_intermittence = true
- Edit drawer au clic sur une ligne : toggle Cachets / Heures, tous les types source
- FAB "+" → `AddRevenueSheet` (sans initialType — l'utilisateur choisit le type)
- Header avec bouton `←` retour vers `/finance`

---

## Sous-page Fees (`/finance/fees`)

Reprend intégralement la logique actuelle de `/fees` :
- Hero card : Reste dû, Commission due, NDF, Déjà versé
- Taux de contrôle
- Liste `FeeLine`
- Bouton "Enregistrer un versement"
- Header avec bouton `←` retour vers `/finance`

---

## Funnel d'ajout — `AddRevenueSheet`

Bottom sheet multi-étapes. Pas de drawer classique — chaque étape remplace le contenu avec une transition slide.

### Étape 0 — Méthode

| Option | Action |
|---|---|
| ✏️ Saisie manuelle | → Étape 1 |
| 📄 Import SACEM CSV | → Ferme la sheet, ouvre `SacemImportDrawer` existant |
| 🏦 Relevé bancaire | Désactivé · badge "Bientôt" |
| 📸 Photo / OCR | Désactivé · badge "Bientôt" |

### Étape 1 — Type de revenu

Grille 2 colonnes, 9 types :

| Valeur DB | Label UI | Emoji | Intermittence |
|---|---|---|---|
| `booking` | Concert / Spectacle | 🎤 | ✓ |
| `répétition` | Répétition | 🎸 | ✓ |
| `formation` | Formation / Atelier | 🎓 | ✓ |
| `accompagnement` | Accompagnement | 🎹 | ✓ |
| `figuration` | Figuration | 🎬 | ✓ |
| `résidence` | Résidence | 🏠 | ✓ |
| `clip` | Clip | 📹 | ✓ |
| `track` | Nouvelle track | 🎵 | ✗ |
| `label` | Label / Droits | 🏷 | ✗ |

`INTERMITTENCE_TYPES` = tous sauf `track` et `label`. Sélectionner un type non-intermittence pré-coche `counts_for_intermittence = false`.

**Cas spécial `track`** : à la soumission, insère automatiquement un enregistrement dans la table `tracks` avec `title = notes`, `sacem_status = 'non_déclaré'`, `is_commissionable = true`.

### Étape 2 — Montant & date

Champs :
- Intitulé (requis)
- Montant € (requis, positif)
- Date de paiement (optionnel)
- Statut : `TBC` (stocké `provisoire`) · `En attente` · `Payé`

### Étape 3 — Détails (conditionnelle selon type)

**Si INTERMITTENCE_TYPE (booking, répétition, formation, accompagnement, figuration, résidence, clip) :**
- Toggle **Cachets / Heures** : en mode Cachets, stepper ×1, affiche `N cachets · N×12 h` ; en mode Heures, stepper libre
- Nombre de cachets en lot (stepper, `batch_count`) — **booking uniquement**
- Territoire France / Étranger — **booking uniquement** (auto-off intermittence si étranger)
- Toggle "Compte pour l'intermittence"
- Dépenses déductibles (optionnel)

**Si `track` ou `label` :**
- Dépenses déductibles (optionnel) seulement

### Étape 4 — Récapitulatif

Affiche tous les champs saisis. Bouton **Enregistrer**.

À la confirmation :
1. Si `batch_count > 1` → insère d'abord dans `payment_batches`
2. Insère dans `payments`
3. Toast succès, ferme la sheet, `refresh()`

### Navigation inter-étapes

- Barre de progression (4 points) en haut
- Bouton `←` retour à l'étape précédente (sans perte de données)
- Bouton `Suivant →` valide l'étape courante avant d'avancer (validation Zod par étape)

---

## Commissionabilité des tracks

Règle : une track est `is_commissionable = true` si sa `release_date >= profile.commission_start_date`.

Application :
- À la **création manuelle** d'une track (AddTrackDrawer) : si `release_date` renseignée et `>= commission_start_date`, pré-coche `is_commissionable`. Le manager peut toujours l'écraser.
- À l'**import SACEM** (SacemImportDrawer) : les tracks auto-créées restent `is_commissionable = false` par défaut (pas de release_date connue) — le manager met à jour manuellement.
- Via **AddRevenueSheet type "track"** : track créée automatiquement avec `is_commissionable = true`, `sacem_status = 'non_déclaré'`. Aucun `track_id` lié au payment (à lier manuellement si besoin).

Aucun changement de schéma DB requis.

## Statuts paiement — sémantique UI

| Valeur DB | Label UI | Badge | Inclus dans compteur cachets |
|---|---|---|---|
| `tbc` | TBC | gris | ✗ (courbe pointillée seulement) |
| `provisoire` | TBC | gris | ✓ (confirmés) |
| `cachet_en_attente` | En attente | ambre | ✓ |
| `facturé` | Facturé | bleu | ✓ |
| `payé` | Payé | vert | ✓ |

`provisoire` et `tbc` affichent le même badge "TBC" mais ont une sémantique différente : `provisoire` = date réservée (compté), `tbc` = hypothétique (non compté).

## Identification artiste (artist_id)

`artist_id` dans payments = `profile.id` de l'utilisateur connecté (quel que soit son rôle). Dans ce contexte mono-utilisateur, le manager Paul gère ses propres cachets — son `profile.id` est le bon `artist_id`. Pas de requête cross-profile nécessaire.

---

## Composants nouveaux / modifiés

| Fichier | Nature |
|---|---|
| `src/routes/_authenticated/finance/index.tsx` | Nouveau |
| `src/routes/_authenticated/finance/cachets.tsx` | Déplacé depuis `cachets.tsx` |
| `src/routes/_authenticated/finance/fees.tsx` | Déplacé depuis `fees.tsx` |
| `src/routes/_authenticated/factures.tsx` | Supprimé |
| `src/components/app/BottomNav.tsx` | Modifié — Finance remplace 3 onglets |
| `src/components/modules/finance/RevenueLine.tsx` | Nouveau |
| `src/components/modules/finance/AddRevenueSheet.tsx` | Nouveau |

Les composants existants `CachetRow`, `FeeLine`, `IntermittenceGraph`, `SacemImportDrawer`, etc. sont réutilisés sans modification.

---

## Hors scope (phase 2)

- Import relevé bancaire CSV
- Import photo / OCR
- Lien revenu → track (hors SACEM)
- Vue détail d'un revenu SACEM (breakdown payment_lines)

## Note Agenda (spec séparé à venir)

L'Agenda est un onglet primaire pour l'artiste (et secondaire pour le manager). Il doit inclure une **synchronisation bidirectionnelle avec Google Calendar** (Gmail). Le champ `events.gcal_event_id` existe déjà en DB pour stocker l'ID de l'event GCal. La sync GCal fera l'objet d'un spec dédié.
