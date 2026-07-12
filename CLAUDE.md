# BLOU FEET Management App — Contexte Claude Code

App de management pour l'artiste BLOU FEET (manager : Paul Bourdon).  
Remplace 2 Google Sheets + 1 Notion + suivi WhatsApp par une PWA mobile-first.

## Stack technique

- **Framework** : TanStack Start (SSR) + React 19 + TypeScript
- **Styling** : Tailwind v4 + shadcn/ui
- **Backend/DB/Auth** : Supabase (Postgres + RLS + auth)
- **Hébergement** : Cloudflare Pages (Advanced Mode — `_worker.js`)
- **Build** : Vite + `scripts/bundle-worker.mjs` (esbuild pour le worker CF)
- **Emails** : Resend + react-email
- **Tests** : Vitest

## URLs de production

- App : https://hq-bgl.pages.dev
- Supabase projet : voir `src/integrations/supabase/client.ts` pour l'URL

## Variables d'environnement requises (CF Pages dashboard)

- `SUPABASE_URL` — URL publique du projet Supabase
- `SUPABASE_PUBLISHABLE_KEY` — clé anon publique
- `SUPABASE_SERVICE_ROLE_KEY` — clé service (secret, JAMAIS dans le code)
- `VITE_SUPABASE_URL` — même valeur que SUPABASE_URL (préfixé VITE_ pour le client-side)
- `VITE_SUPABASE_PUBLISHABLE_KEY` — même valeur que SUPABASE_PUBLISHABLE_KEY
- `NODE_VERSION` — `22` (TanStack Start requiert Node >=22.12.0)

## Architecture Cloudflare Pages (points critiques)

### `src/server.ts`
Worker CF principal. Responsabilités :
1. Copie les bindings CF (`env.*`) dans `process.env` (CF Workers ne le fait pas automatiquement)
2. Sert les assets statiques via `env.ASSETS.fetch()` avant de passer au SSR
3. Enveloppe le handler TanStack Start
4. `normalizeCatastrophicSsrResponse` intercepte les 500 JSON que h3 génère pour les erreurs non catchées

### `scripts/bundle-worker.mjs`
Bundle `dist/server/server.js` → `dist/client/_worker.js` via esbuild.  
**Contient un banner critique** : polyfill `require()` pour les packages CJS qui font `require("util")` etc.  
CF Workers ne définit pas `require` globalement même avec `nodejs_compat` — sans ce banner, esbuild's `__require` shim lève "Dynamic require of X is not supported".

### `wrangler.toml`
`nodejs_compat` flag + `pages_build_output_dir = "dist/client"`.  
Ne PAS supprimer — CF Pages le lit pour les compatibility flags.

### Build
```bash
pnpm build   # = vite build && node scripts/bundle-worker.mjs
```

## Modèle de données (tables principales)

```
profiles          — utilisateurs (role: manager | artist)
tracks            — catalogue des morceaux (is_commissionable, sacem_status, release_date)
events            — dates bookées (concert, répétition, résidence...)
payment_batches   — regroupement de cachets (ex: "5 cachets groupés")
payments          — table centrale : cachets, factures, SACEM, fees artiste
                    statuts: provisoire → facturé → cachet_en_attente → payé
                    source: booking | label | clip | track | résidence | figuration
                    expires_at = payment_date + 12 mois (intermittence)
management_fees   — créées auto par trigger sur payments INSERT
                    commission = 15% de (amount - deductible_expenses)
                    seulement si payment.source est commissionable ET track.is_commissionable
subventions       — aides (CNM, SACEM, ADAMI...) avec statut et deadlines
tasks             — tâches de management
```

Migrations dans `supabase/migrations/` — toujours ajouter un nouveau fichier, ne jamais modifier l'existant.

## Routes et pages implémentées

```
/                    → redirect vers /finance si connecté, sinon /auth
/auth                → login/signup
/onboarding          → saisie du nom et rôle au premier login
/finance             → page principale : résumé financier + liste des revenus
/finance/cachets     → sous-page cachets/intermittence
/finance/fees        → sous-page management fees
/tracks              → catalogue des morceaux
/calendrier          → calendrier des dates (placeholder)
/taches              → tâches (placeholder)
/subventions         → subventions (placeholder)
```

## Composants partagés clés

- `src/components/AppHeader.tsx` — header avec prop `backTo` pour la navigation retour
- `src/components/RevenueLine.tsx` — ligne de revenu réutilisable dans Finance
- `src/components/AddRevenueSheet.tsx` — sheet multi-étapes pour ajouter un revenu
- `src/components/BottomNav.tsx` — navigation bas de page (Finance, Tracks, Tâches, Calendrier)

## Ce qui reste à construire (V1)

Pages placeholder à implémenter :
- `/calendrier` — affichage et création d'événements bookés
- `/taches` — suivi des décisions/tâches de management
- `/subventions` — kanban des aides par statut

Fonctionnalités manquantes :
- Rapprochement SACEM (import de bordereaux, lier les lignes aux tracks)
- Profil artiste avec accès restreint (l'artiste voit ses propres données)
- Notifications (Web Push + email via Resend)
- Import/export (migration depuis les Google Sheets)

## Commandes utiles

```bash
pnpm dev          # dev local
pnpm build        # build prod (vite + esbuild bundle worker)
pnpm test         # vitest
```

## Plan produit complet

`plan_app_management_bloufeet.md` à la racine — document de specs complet avec modèle de données, edge cases métier, roadmap. À lire pour comprendre les règles métier (cachets groupés, calcul commission, cycle de vie SACEM, etc.).
