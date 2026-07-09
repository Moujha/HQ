# Design — App de management BLOU FEET
*Rédigé le 09/07/2026 — Paul Bourdon / Claude Code*

---

## Contexte

Remplacement de 2 Google Sheets (Cachets, Suivi financier/Management fees) + 1 base Notion (Subventions) + suivi WhatsApp par une seule PWA mobile-first. Deux utilisateurs : Paul (manager, accès total) et l'artiste (accès restreint).

Spec métier de référence : `plan_app_management_bloufeet.md` (section 5 pour les edge cases complets).

---

## Stack

| Couche | Choix | Raison |
|---|---|---|
| Framework | TanStack Start + Vite | Repris de la référence Maison Caviar Hub-2 — SSR, file-based routing, même DX que Next.js |
| UI | Tailwind v4 + shadcn/ui (Radix) | Déjà installé dans la référence, tous les composants disponibles |
| BDD + Auth | Supabase (Postgres + Auth + Storage) | Même projet Supabase existant (`liqobqcwljryuatknsvt`) |
| PWA | vite-plugin-pwa | Déjà configuré dans la référence |
| Push | Web Push (VAPID) | Repris de la référence — iOS PWA, Android, desktop |
| Email | Resend (direct) | Remplace `@lovable.dev/email-js` — gratuit jusqu'à 3k/mois |
| Dates | date-fns | Calculs d'expiration +12 mois, formatage FR |
| Forms | react-hook-form + zod | Déjà dans la référence |
| Icons | lucide-react | Déjà dans la référence |

**Base de départ** : fork de `Maison Caviar Hub-2`. On retire les dépendances `@lovable.dev/*` et la logique métier (décisions/veille/exécution). On conserve : auth, bottom nav, push, PWA, dark theme, composants shadcn, `use-collection.ts`, `use-auth.tsx`, `PullToRefresh`, email templates.

**Dépendances retirées** : `@lovable.dev/cloud-auth-js`, `@lovable.dev/email-js`, `@lovable.dev/webhooks-js`, `@lovable.dev/vite-tanstack-config` (remplacé par config Vite standard).

---

## Design visuel

- **Thème** : Dark Pro, inspiré Qonto — fond `#0a0a0a`, cards `#141414`, borders `#1a1a1a`
- **Accent principal** : blanc (`#ffffff`) pour les actions primaires — sobre, pas de couleur d'accentuation forte
- **Sémantique couleur** : vert `#4ade80` (actif/payé), ambre `#f59e0b` (alerte/provisoire), rouge destructif (erreur), gris `#666` (inactif/archivé)
- **Typographie** : Space Grotesk (display/chiffres) + Manrope (corps) — repris de la référence
- **Radius** : `0.75rem` (cartes), `1.5rem` (modales/drawers), `9999px` (badges)

---

## Navigation

**Mobile (primary)** — bottom nav fixe, `safe-area-inset-bottom` géré :

| Rôle | Tab 1 | Tab 2 | Tab 3 | Tab 4 | Tab 5 |
|---|---|---|---|---|---|
| Manager | Cachets | Fees | Factures | Tâches | ··· |
| Artiste | Cachets | Tâches | Calendrier | ··· | — |

Le tab "···" ouvre un sheet avec les modules secondaires (Calendrier, Tracks, Subventions pour le manager).

**Desktop** — sidebar gauche fixe, 190px, groupée :
- Groupe **Finances** : Cachets · Fees · Factures
- Groupe **Organisation** : Tâches · Calendrier
- Groupe **Catalogue** : Tracks · Subventions

Le layout responsive bascule sidebar ↔ bottom nav via `useIsMobile()` (hook existant dans la référence, breakpoint `768px`).

---

## Structure de fichiers

```
src/
  routes/
    _authenticated/
      route.tsx            # guard auth + onboarding redirect (repris référence)
      cachets.tsx          # Module 1 — priorité Phase 1
      fees.tsx             # Module 2 — priorité Phase 1
      factures.tsx
      taches.tsx
      calendrier.tsx
      tracks.tsx
      subventions.tsx
    auth.tsx               # Login + magic link artiste (repris référence)
    index.tsx              # Redirect → /cachets (manager) ou /cachets (artiste)
  components/
    app/
      BottomNav.tsx        # Adapté — nouveaux onglets, même pattern role-aware
      AppHeader.tsx        # Repris référence
      PullToRefresh.tsx    # Repris référence
      Sidebar.tsx          # Nouveau — desktop uniquement
    modules/
      cachets/
        CachetList.tsx
        CachetRow.tsx
        AddPaymentDrawer.tsx
        BatchBadge.tsx
      fees/
        FeesDashboard.tsx
        FeeLine.tsx
        VersementDrawer.tsx
      factures/
      taches/
      tracks/
  hooks/
    use-auth.tsx           # Repris référence — Profile.role = 'manager' | 'artist'
    use-collection.ts      # Repris référence — realtime + cache localStorage
    use-mobile.tsx         # Repris référence
  lib/
    push-client.ts         # Repris référence
    webpush.server.ts      # Repris référence
    fees.ts                # Calculs commission (net_base, commission_due, reste_dû)
    cachets.ts             # Calculs expiration, count_valides
    email-templates/
      cachet-expiration.tsx
      fee-due.tsx
  integrations/
    supabase/
      client.ts            # Repris référence (adapté vars d'env)
      client.server.ts     # Repris référence
      types.ts             # Régénéré via `supabase gen types`
supabase/
  migrations/
    001_schema_base.sql    # Tables + triggers + RLS
    002_views.sql          # artist_fee_summary view
```

---

## Modèle de données

### Tables Phase 1

```sql
-- Profils utilisateurs
profiles (
  id uuid PK,
  user_id uuid → auth.users UNIQUE,
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('manager', 'artist')),
  onboarded bool DEFAULT false,
  commission_start_date date DEFAULT '2025-01-01'
)

-- Lots de cachets groupés (optionnel par payment)
payment_batches (
  id uuid PK,
  label text,
  batch_count int NOT NULL DEFAULT 1,  -- nombre de cachets dans le lot
  created_at timestamptz DEFAULT now()
)

-- Table centrale — cachets, droits SACEM, factures converties
payments (
  id uuid PK,
  artist_id uuid → profiles NOT NULL,
  track_id uuid → tracks,              -- NULL si pas un track SACEM
  batch_id uuid → payment_batches,     -- NULL si cachet simple
  event_id uuid → events,
  amount numeric(10,2) NOT NULL,
  payment_date date,
  expires_at date,                     -- calculé par trigger : payment_date + 12 mois
  status text NOT NULL CHECK (status IN ('provisoire','facturé','cachet_en_attente','payé')),
  source text NOT NULL CHECK (source IN ('label','booking','clip','track','résidence','figuration')),
  territory text NOT NULL DEFAULT 'france' CHECK (territory IN ('france','étranger')),
  counts_for_intermittence bool NOT NULL DEFAULT true,
  deductible_expenses numeric(10,2) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid → auth.users,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
)

-- Commission générée automatiquement (trigger INSERT sur payments)
management_fees (
  id uuid PK,
  payment_id uuid → payments UNIQUE NOT NULL,
  net_base numeric(10,2) NOT NULL DEFAULT 0,       -- positionné par trigger create_management_fee()
  commission_rate numeric(4,3) NOT NULL DEFAULT 0.15,
  is_commissionable bool NOT NULL DEFAULT true,
  commission_due numeric(10,2) NOT NULL DEFAULT 0,  -- positionné par trigger
  status text NOT NULL DEFAULT 'projetée' CHECK (status IN ('projetée','due','versée')),
  already_paid_to_manager numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
)

-- NDF du manager
expenses (
  id uuid PK,
  payment_id uuid → payments,          -- optionnel, lié à une date précise
  amount numeric(10,2) NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'à_rembourser' CHECK (status IN ('à_rembourser','remboursée')),
  tricount_ref text,
  created_at timestamptz DEFAULT now()
)

-- Catalogue des morceaux
tracks (
  id uuid PK,
  title text NOT NULL,
  release_date date,
  is_commissionable bool NOT NULL DEFAULT true,
  is_commissionable_since date,        -- date de la dernière décision
  sacem_status text NOT NULL DEFAULT 'non_déclaré'
    CHECK (sacem_status IN ('non_déclaré','programme_en_draft','déclaré','étranger','non_applicable')),
  sacem_declared_at date,
  notes text,
  created_at timestamptz DEFAULT now()
)

-- Bordereaux SACEM importés
sacem_statements (
  id uuid PK,
  period text NOT NULL,                -- ex: "2026-T1"
  imported_at timestamptz DEFAULT now(),
  source_file text
)

sacem_statement_lines (
  id uuid PK,
  statement_id uuid → sacem_statements NOT NULL,
  track_id uuid → tracks,              -- NULL si pas encore rapproché
  raw_title text NOT NULL,             -- intitulé brut tel que SACEM l'écrit
  amount numeric(10,2) NOT NULL,
  matched bool NOT NULL DEFAULT false,
  UNIQUE (statement_id, raw_title)     -- empêche import en double
)

-- Événements / dates bookées
events (
  id uuid PK,
  title text NOT NULL,
  event_date date NOT NULL,
  location text,
  type text CHECK (type IN ('concert','répétition','résidence','autre')),
  status text NOT NULL DEFAULT 'TBC' CHECK (status IN ('confirmé','TBC','annulé')),
  gcal_event_id text,                  -- Google Calendar sync (Phase 2)
  created_at timestamptz DEFAULT now()
)

-- Tâches / décisions
tasks (
  id uuid PK,
  title text NOT NULL,
  description text,
  assignee_role text NOT NULL CHECK (assignee_role IN ('manager','artist','both')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','urgent')),
  status text NOT NULL DEFAULT 'à_faire' CHECK (status IN ('à_faire','en_cours','fait')),
  deadline date,
  payment_id uuid → payments,
  created_at timestamptz DEFAULT now()
)

-- Subventions (repris schéma Notion)
grants (
  id uuid PK,
  title text NOT NULL,
  organisme text,
  categorie text,
  status text NOT NULL DEFAULT 'à_instruire'
    CHECK (status IN ('à_instruire','dossier_en_cours','déposé','obtenu','refusé','en_attente','inéligible')),
  priority text CHECK (priority IN ('haute','moyenne','basse')),
  montant_max numeric(10,2),
  deadline_depot date,
  date_depot date,
  resultat_attendu text,
  structure_required bool NOT NULL DEFAULT false,
  lien_dossier text,
  notes text,
  created_at timestamptz DEFAULT now()
)

-- Push subscriptions (repris référence)
push_subscriptions (
  id uuid PK,
  user_id uuid → auth.users,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz DEFAULT now()
)
```

### Triggers Postgres

```sql
-- 1. Calcul automatique de expires_at sur INSERT/UPDATE de payments
CREATE OR REPLACE FUNCTION set_payment_expires_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.payment_date IS NOT NULL AND NEW.status = 'payé' THEN
    NEW.expires_at := NEW.payment_date + INTERVAL '12 months';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Création automatique de management_fees sur INSERT de payments
CREATE OR REPLACE FUNCTION create_management_fee()
RETURNS TRIGGER AS $$
DECLARE
  v_is_commissionable bool := true;
  v_rate numeric := 0.15;
  v_net_base numeric;
  v_commission numeric;
BEGIN
  -- Hériter is_commissionable du track si lié
  IF NEW.track_id IS NOT NULL THEN
    SELECT is_commissionable INTO v_is_commissionable
    FROM tracks WHERE id = NEW.track_id;
  END IF;

  v_net_base := GREATEST(NEW.amount - NEW.deductible_expenses, 0);
  v_commission := CASE WHEN v_is_commissionable THEN v_net_base * v_rate ELSE 0 END;

  INSERT INTO management_fees (payment_id, net_base, commission_rate, is_commissionable, commission_due, status)
  VALUES (NEW.id, v_net_base, v_rate, v_is_commissionable, v_commission,
    CASE WHEN NEW.status = 'payé' THEN 'due' ELSE 'projetée' END);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Mise à jour du statut fee quand le payment passe à 'payé'
CREATE OR REPLACE FUNCTION sync_fee_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'payé' AND OLD.status != 'payé' THEN
    UPDATE management_fees SET status = 'due' WHERE payment_id = NEW.id;
    -- Recalculer expires_at
    NEW.expires_at := NEW.payment_date + INTERVAL '12 months';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Vue artiste (RLS + View)

```sql
-- Vue pour l'artiste : uniquement le total dû, pas les lignes
-- Les NDF sont globales (pas filtrées par payment) car mono-artiste
CREATE VIEW artist_fee_summary AS
WITH fee_totals AS (
  SELECT
    p.artist_id,
    SUM(mf.commission_due) FILTER (WHERE mf.status = 'due')  AS commission_due,
    SUM(mf.already_paid_to_manager)                           AS already_paid
  FROM payments p
  JOIN management_fees mf ON mf.payment_id = p.id
  GROUP BY p.artist_id
),
ndf_totals AS (
  SELECT COALESCE(SUM(amount), 0) AS ndf_pending
  FROM expenses
  WHERE status = 'à_rembourser'
)
SELECT
  ft.artist_id,
  ft.commission_due                                           AS total_due,
  ft.already_paid                                             AS total_paid,
  nt.ndf_pending,
  ft.commission_due + nt.ndf_pending - ft.already_paid       AS reste_du
FROM fee_totals ft, ndf_totals nt;
```

### RLS Policies clés

```sql
-- payments : artiste voit uniquement ses lignes
CREATE POLICY "artist sees own payments"
ON payments FOR SELECT
TO authenticated
USING (
  (SELECT role FROM profiles WHERE user_id = auth.uid()) = 'manager'
  OR artist_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
);

-- management_fees : artiste bloqué (lit via artist_fee_summary view)
CREATE POLICY "manager only on fees"
ON management_fees FOR ALL
TO authenticated
USING ((SELECT role FROM profiles WHERE user_id = auth.uid()) = 'manager');

-- tasks : artiste voit uniquement ses tâches
CREATE POLICY "artist sees assigned tasks"
ON tasks FOR SELECT
TO authenticated
USING (
  (SELECT role FROM profiles WHERE user_id = auth.uid()) = 'manager'
  OR assignee_role IN ('artist', 'both')
);

-- grants, tracks, expenses : manager uniquement
-- (policies similaires, USING role = 'manager')
```

---

## Calculs métier

Tous encapsulés dans `src/lib/fees.ts` et `src/lib/cachets.ts` — jamais dupliqués entre l'UI et le backend.

```typescript
// src/lib/cachets.ts
export function countValidCachets(payments: Payment[]): number {
  const now = new Date();
  return payments
    .filter(p => p.status === 'payé' && p.counts_for_intermittence)
    .filter(p => p.expires_at && new Date(p.expires_at) > now)
    .reduce((sum, p) => sum + (p.batch?.batch_count ?? 1), 0);
}

export function expiringWithin(payments: Payment[], days: number): Payment[] {
  const now = new Date();
  const limit = addDays(now, days);
  return payments.filter(p =>
    p.status === 'payé' &&
    p.expires_at &&
    new Date(p.expires_at) > now &&
    new Date(p.expires_at) <= limit
  );
}

// src/lib/fees.ts
export function computeResteDu(fees: ManagementFee[], expenses: Expense[]): number {
  const commissionDue = fees
    .filter(f => f.status === 'due')
    .reduce((sum, f) => sum + f.commission_due, 0);
  const ndf = expenses
    .filter(e => e.status === 'à_rembourser')
    .reduce((sum, e) => sum + e.amount, 0);
  const alreadyPaid = fees
    .reduce((sum, f) => sum + f.already_paid_to_manager, 0);
  return commissionDue + ndf - alreadyPaid;
}

export function computeControlRate(fees: ManagementFee[], totalEncaisse: number): number {
  if (totalEncaisse === 0) return 0;
  const totalFee = fees.reduce((sum, f) => sum + f.commission_due, 0);
  return totalFee / totalEncaisse;
}
```

---

## UX — Modules prioritaires Phase 1

### Cachets

**Vue principale** :
- Hero : compteur "X cachets valides" (36px bold) + barre de progression acquis/projection
- Alerte ambre si ≥1 cachet expire dans 60 jours
- Filtres : Tous · Actifs · Provisoires · Expirés
- Liste : chaque ligne affiche intitulé, date, territoire, statut badge, badge "Lot × N" si batch, warning inline "hors intermittence FR" si `counts_for_intermittence=false`
- FAB "+ Ajouter" bottom right

**Drawer d'ajout** (bottom sheet) :
- Type : Cachet / Droits SACEM / Facture / Résidence (pill selector)
- Montant + Date paiement (côte à côte)
- Intitulé libre
- Territoire : France / Étranger (pill selector)
- Cachets groupés : stepper (× 1 par défaut)
- Dépenses déductibles : champ libre optionnel
- Preview commission calculée en temps réel au bas du form avant enregistrement
- Statut initial : `provisoire` par défaut, changeable

**Edge cases gérés** :
- Lot de cachets : `batch_count` saisi dans le stepper, stocké dans `payment_batches`
- TBC sans date : `payment_date` null accepté si statut = `provisoire`
- Territoire étranger → warning sur `counts_for_intermittence` mais l'utilisateur décide
- Conversion facture → cachet : bouton "Convertir en cachet" sur les lignes `facturé`

### Fees & Commission

**Dashboard manager** :
- Hero : "Reste dû" en grand + décomposition en 3 sous-chiffres (commission due / NDF / déjà versé)
- Taux de contrôle + total encaissé depuis `commission_start_date`
- Liste des dernières lignes : montant brut, déductible, commission calculée, statut (projetée / due / versée)
- Lignes non-commissionnables : montant barré + "0 € fee" — visible mais neutralisé
- CTA "Enregistrer un versement" → drawer : montant versé, date, note libre → met à jour `already_paid_to_manager` et passe les lignes dues à `versée`

**Vue artiste** :
- Un seul chiffre "X € dus à ton manager" (depuis `artist_fee_summary` view)
- Pas de détail des lignes, pas des NDF, pas du taux

**Edge cases gérés** :
- Ligne projetée (statut `projetée`) : affiché en gris, non inclus dans "reste dû"
- `commission_start_date` configurable dans Réglages — pas codé en dur
- Import bordereau SACEM : upload CSV → parsing → écran de rapprochement track par track avec confirmation manuelle → `sacem_statement_lines` créées → `management_fees` mises à jour selon `is_commissionable` du track

---

## Auth & Rôles

**Flux** :
1. Paul crée son compte (email + mdp) → profile `role=manager`, onboarding pour saisir `commission_start_date`
2. Paul invite l'artiste depuis Réglages → Supabase envoie lien magique → profile `role=artist` créé automatiquement
3. Onboarding artiste : 1 écran "Installe l'app sur ton téléphone" (instructions iOS Add to Home Screen / Android) — non bloquant

**Sécurité** :
- Permissions dans Postgres (RLS), pas dans le code React
- `management_fees` jamais exposée à l'artiste — uniquement via `artist_fee_summary` view
- Contrats (Phase 2) : accès exclusif manager, jamais dans les policies artiste

---

## Notifications

| Déclencheur | Canal | Destinataire |
|---|---|---|
| Cachet expire dans 60 jours | Push + email | Manager |
| Nouveau paiement ajouté | Push | Artiste |
| Tâche assignée à l'artiste | Push | Artiste |
| Tâche marquée "fait" par l'artiste | Push | Manager |
| Deadline subvention dans 7 jours | Email | Manager |

Implémentation : reprise de `push.functions.ts` + `webpush.server.ts` de la référence. Ajout de crons Supabase Edge Functions pour les alertes temporelles (expiration cachets, deadlines subventions).

---

## Phase 1 — Périmètre exact

| Module | Inclus Phase 1 |
|---|---|
| Auth (manager + artiste) | ✓ |
| Cachets + calcul expiration | ✓ |
| Management fees + dashboard reste dû | ✓ |
| Factures (cycle de vie complet) | ✓ |
| Tâches | ✓ |
| Calendrier (saisie manuelle, sans sync GCal) | ✓ |
| Tracks (catalogue + is_commissionable) | ✓ |
| Import bordereau SACEM | ✓ |
| Subventions (repris Notion) | ✓ |
| Push notifications (alertes cachets, tâches) | ✓ |
| Migration données sheets existants | ✓ (script d'import CSV) |
| Sync Google Calendar | Phase 2 |
| Extraction IA contrats (PDF) | Phase 2 |
| Intégration neobank | Phase 3 |
| WhatsApp Business API | Phase 3+ |

---

## Ce qu'on ne fait pas (YAGNI)

- Pas de multi-artiste : l'app est mono-artiste (BLOU FEET). Le champ `artist_id` existe pour la complétude du schéma, pas pour un futur onboarding multi-tenant.
- Pas de système de facturation automatique : les factures sont créées manuellement.
- Pas d'IA sur les cachets : le parsing SACEM se fait manuellement avec confirmation, pas automatiquement.
- Pas de comptabilité : l'app donne les chiffres pour l'expert-comptable, elle ne remplace pas un logiciel de compta.
