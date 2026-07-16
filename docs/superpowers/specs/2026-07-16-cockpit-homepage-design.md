# Cockpit Homepage — Design

## Problem

There is no real homepage. `src/routes/index.tsx` just redirects `/` to `/finance`. The user (manager) wants a single screen that gives a fast "grasp of all content" across every module — next event, cachets progress, total tracks, etc. — each leading to its full page on tap.

## Goals

- One screen summarizing all 6 feature modules: Finance, Cachets, Tâches, Calendrier, Tracks, Subventions.
- Tapping a tile navigates to that module's existing page.
- Becomes the new `/` route (replaces the current redirect-to-`/finance`).
- Shown to both roles. The artist currently has read-only access to `payments` (own rows) and `tasks` only; RLS is widened so the artist also gets read-only access to `tracks`, `grants`, and `management_fees` — matching the intended "read-only across the whole app" scope. No cockpit-specific role branching is needed as a result: every tile fetches real data for both roles, and role differences remain exactly where they already live (each destination page's own interactivity rules).
- No new BottomNav entry — the cockpit is reached via `/` directly or a back-arrow added to each module's header.

## Non-goals

- No new SQL view/RPC aggregating cross-table data. Each tile reuses the exact computation its destination page already uses, via functions in `src/lib/*`. This avoids a second, DB-side implementation of business logic (e.g. "valid cachet") that could drift from the TS version — a bug class that already happened once this session with the intermittence graph.
- No server-side route loader. Nothing else in the app fetches data via a TanStack Start loader; all pages fetch client-side via `useCollection`. The cockpit follows the same pattern for consistency.
- No loading skeletons. Tiles render reactively as `useCollection` resolves, same as every other page (starts empty/zero, fills in).

## Architecture

### Routing

- Delete `src/routes/index.tsx`.
- Add `src/routes/_authenticated/index.tsx` — `createFileRoute("/_authenticated/")`, resolves to path `/`. Inherits the `_authenticated` layout's session guard (redirects unauthenticated visitors to `/auth`) and the `BottomNav`/shell, same as every other authenticated page.
- Update post-auth redirects to land on `/` instead of `/finance`:
  - `src/routes/auth.tsx:24`
  - `src/routes/_authenticated/onboarding.tsx` (4 call sites)
- Add `backTo="/"` to the `<AppHeader>` on: `finance/index.tsx`, `taches.tsx`, `calendrier.tsx`, `tracks.tsx`, `subventions.tsx`. (`finance/cachets.tsx` and `finance/fees.tsx` keep their existing `backTo="/finance"` — that's still the correct parent.)

### Data access (RLS)

New migration `supabase/migrations/20260716000001_cockpit_readonly_rls.sql` adds three new **additional, permissive** SELECT policies (existing manager-only `FOR ALL` policies are untouched, so writes are still manager-only):

```sql
CREATE POLICY "tracks_select_all" ON tracks FOR SELECT TO authenticated USING (true);
CREATE POLICY "grants_select_all" ON grants FOR SELECT TO authenticated USING (true);
CREATE POLICY "fees_select_all" ON management_fees FOR SELECT TO authenticated USING (true);
```

This follows the existing `events_select` pattern (`FOR SELECT ... USING (true)`) rather than rewriting the existing `FOR ALL` policies, so there is no risk of accidentally loosening INSERT/UPDATE/DELETE.

### Shared logic extraction: `src/lib/calendrier.ts`

`calendrier.tsx` currently computes "next event" via a multi-step merge that has no reusable name:
1. Query `events` (with nested `payments`).
2. Query all `payments`, filter to standalone booking/résidence/répétition/figuration payments with no `event_id` yet, and adapt them into the same shape via `paymentToCalendarEntry`.
3. Merge + sort both lists by `event_date`.
4. `.find()` the first entry with `event_date >= today && status !== "annulé"`.

This is extracted into `src/lib/calendrier.ts`:

```ts
export interface ConcertPayment {
  id: string;
  notes: string | null;
  source: string;
  amount: number;
  payment_date: string | null;
  status: "provisoire" | "facturé" | "cachet_en_attente" | "payé" | "tbc";
  event_id: string | null;
}

export const CALENDAR_SOURCES = ["booking", "résidence", "répétition", "figuration"];

export function paymentToCalendarEntry(p: ConcertPayment): EventLineData { ... } // moved as-is
export function mergeCalendarItems(events: EventLineData[], payments: ConcertPayment[]): EventLineData[] { ... }
export function computeNextEvent(events: EventLineData[], payments: ConcertPayment[]): EventLineData | undefined { ... }
```

`calendrier.tsx` is updated to import and use these instead of its inline logic (behavior unchanged, just de-duplicated). The cockpit's Calendrier tile calls `computeNextEvent` directly with its own lightweight queries.

### New component: `src/components/app/CockpitTile.tsx`

A generic tile — one clear purpose (render a linked summary card), reused 6 times:

```ts
interface CockpitTileProps {
  to: string;
  label: string;
  icon: LucideIcon;
  headline: string;      // the big number/amount, pre-formatted by the caller
  detail?: string;       // small secondary line
  accent?: "default" | "amber" | "green";
}
```

### The 6 tiles (2-column grid)

| Tile | Route | Headline | Detail | Data source |
|---|---|---|---|---|
| Finance | `/finance` | Reste dû (€) | — | manager: `computeResteDu(fees, expenses)` (same query shape as `finance/fees.tsx`); artist: `artist_fee_summary.reste_du` for own `artist_id` (same as `ArtistFeesView`) |
| Cachets | `/finance/cachets` | `X / 43 cachets` | `Y / 507 h` | `countValidCachets`/`countValidHours` over non-SACEM `payments` (same shape as `finance/index.tsx`'s `cachets` query) |
| Tâches | `/taches` | `N tâches en attente` | — | same role-filtered pending count as `taches.tsx:44-48` |
| Calendrier | `/calendrier` | next event title | formatted date (+ location) | `computeNextEvent` over lightweight `events`/`payments` queries |
| Tracks | `/tracks` | `N titres` | `M déclarés SACEM` | counts over `tracks` (id, sacem_status) |
| Subventions | `/subventions` | total obtenu (€) | `N en instruction` | same aggregation as `subventions.tsx:33-51` over `grants` |

Each tile's query selects only the columns its computation needs (not the full row shape each source page selects), since the cockpit only needs aggregates, not the row list.

### Empty/zero states

No special-casing: if a value is genuinely zero (e.g. "0 tâches en attente", no next event), the tile still renders — same as the source pages already do when their own lists are empty (e.g. `taches.tsx` only shows the "en attente" line `{todoCount > 0 && ...}` — the cockpit will do the same: hide the detail line for tiles where "0" isn't informative, e.g. no Calendrier tile detail line when there's no upcoming event, showing "Aucun événement à venir" instead).

## Testing

Per `vitest.config.ts`, only `src/lib/**/*.test.ts` is exercised — consistent with every other module in this codebase, no page/component ever gets a test file. The new `computeNextEvent`/`mergeCalendarItems` extraction in `src/lib/calendrier.ts` gets unit tests (moving today's untested inline logic into a tested shared function is a net improvement). The `CockpitTile` component and the cockpit page itself are not unit-tested, matching how `CachetRow`, `RevenueLine`, etc. aren't either.

## Manual verification

Since there's no browser automation available in this environment, verification after deploy is via `curl` + bundle inspection (fetch the HTML shell, extract the content-hashed JS bundle, grep for distinctive strings), same as every prior feature this session.
