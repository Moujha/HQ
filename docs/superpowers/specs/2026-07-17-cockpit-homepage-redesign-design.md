# Cockpit Homepage Redesign — Design

## Problem

The cockpit homepage shipped on 2026-07-16 (`docs/superpowers/specs/2026-07-16-cockpit-homepage-design.md`) as a plain 2-column grid of 6 uniform tiles, reached only by typing `/` or a back-arrow from another page — there's no bottom-nav entry for it. Feedback after using it in production:

1. The design isn't visual enough for a homepage — it should feel like a real dashboard, filling the screen with clear hierarchy, not 6 same-sized boxes.
2. The Calendrier tile is too small/plain to be useful at a glance.
3. Where relevant, tiles should show a graph, not just a number.
4. There's no way to reach the homepage from the bottom nav — it should be the primary entry point.

## Goals

- Restructure `BottomNav` so `Home` (`/`) is a primary tab for both roles, reached in one tap from anywhere.
- To make room, `Calendrier` moves out of the primary tabs into the "Plus" sheet for both roles (the artist doesn't have a "Plus" sheet today — one is added, containing only Calendrier).
- Redesign the homepage into a "bento" layout, validated with the user via mockups in the visual companion:
  - **Calendrier hero card** — large, single-focus card showing the next event (title, date, location).
  - **Cachets hero card** — cachets/hours numbers plus a compact sparkline-style graph (confirmed vs. TBC trend), reusing the existing intermittence timeline logic rather than re-deriving it.
  - **2×2 grid below** — Finance, Tâches, Tracks, Subventions, using the existing `CockpitTile` component unchanged.

## Non-goals

- No change to any destination page's own content or behavior (Finance, Cachets, Tâches, Calendrier, Tracks, Subventions pages are untouched — only the *homepage's* presentation and the *bottom nav* change).
- No change to the RLS/data layer shipped in the previous cockpit plan — the same `useCollection` queries and lib functions (`countValidCachets`, `countValidHours`, `computeResteDu`, `computeNextEvent`) still back the tiles.
- No new page or route — `/` keeps its current data-fetching approach (client-side `useCollection`, no loader), just a different arrangement and two new hero-card presentations.

## Architecture

### 1. `BottomNav` restructuring (`src/components/app/BottomNav.tsx`)

Add a `Home` tab and move `Calendrier` into "Plus" for both roles:

```ts
const HOME = { to: "/", label: "Accueil", icon: Home } as const;
const FINANCE = { to: "/finance", label: "Finance", icon: Wallet } as const;
const CACHETS = { to: "/finance/cachets", label: "Cachets", icon: Music2 } as const;
const TACHES = { to: "/taches", label: "Tâches", icon: CheckSquare } as const;

const MANAGER_PRIMARY = [HOME, FINANCE, TACHES] as const;
const ARTIST_PRIMARY = [HOME, CACHETS, TACHES] as const;

const MANAGER_MORE = [
  { to: "/calendrier", label: "Agenda" },
  { to: "/tracks", label: "Tracks" },
  { to: "/subventions", label: "Subventions" },
] as const;

const ARTIST_MORE = [
  { to: "/calendrier", label: "Agenda" },
] as const;
```

The standalone `CALENDRIER` constant (with its `Calendar` icon) is removed entirely — it's no longer used in any primary tab list, and "Plus" sheet items don't render icons (matching the existing `Tracks`/`Subventions` entries, which never had one).

**"Plus" sheet becomes available to both roles**, not just manager: the `{isManager && <Sheet>...}` guard is removed, and the sheet's content list is `isManager ? MANAGER_MORE : ARTIST_MORE`.

**Active-tab detection needs a fix for `Home`.** Today's logic is:

```ts
const active = t.to === "/finance" ? pathname.startsWith("/finance") : pathname.startsWith(t.to);
```

`startsWith("/")` matches every path, so `Home` would show as active everywhere. Extended to a 3-way check:

```ts
const active =
  t.to === "/finance" ? pathname.startsWith("/finance")
  : t.to === "/" ? pathname === "/"
  : pathname.startsWith(t.to);
```

**"Plus" sheet grid columns.** The existing sheet renders `MANAGER_MORE` in a fixed `grid-cols-3`. With the artist's new `ARTIST_MORE` holding only one item, a fixed 3-column grid would leave two empty cells. The column count becomes conditional on list length: `grid-cols-3` when there are 3 items (manager), `grid-cols-1` when there's 1 (artist).

### 2. Extract the intermittence timeline into `src/lib/cachets.ts`

The Cachets hero card's sparkline needs the same "confirmed vs. TBC over time" data `IntermittenceGraph.tsx` already computes for the full graph on `/finance/cachets` (its internal `buildTimeline`/`countInWindow` functions, plus the `CONFIRMED_STATUSES`/`TBC_STATUSES` partition). Recomputing that a second, slightly different way for the homepage would repeat the exact kind of duplication that caused the graph/summary-card mismatches earlier this project — so it's extracted once, into the already-tested `src/lib/cachets.ts`, and both the full graph and the new hero card consume the same function.

`src/lib/cachets.ts` already has a private `CONFIRMED_CACHET_STATUSES` (`["payé", "cachet_en_attente", "facturé"]`) backing `isValidAt`. The extraction adds:

```ts
export interface TimelinePoint {
  ts: number;
  confirmed: number;
  potential: number;
}

export function buildTimeline(payments: PaymentForCachets[]): TimelinePoint[]
```

reusing the existing `CONFIRMED_CACHET_STATUSES` for the "confirmed" bucket and adding a `TBC_STATUSES = ["provisoire", "tbc"] as const` for the "potential" bucket — the exact same partition `IntermittenceGraph.tsx` already uses, just relocated. `IntermittenceGraph.tsx` is refactored to import `buildTimeline`/`TimelinePoint` instead of defining them inline (behavior-preserving, same pattern as the `calendrier.tsx` → `src/lib/calendrier.ts` extraction in the previous plan).

### 3. Homepage layout (`src/routes/_authenticated/index.tsx`)

The existing tile sub-components (`ManagerFinanceTile`, `ArtistFinanceTile`, `TachesTile`, `TracksTile`, `SubventionsTile`) are unchanged. `CachetsTile` and `CalendrierTile` are replaced by two hero-card presentations, and the page layout changes from a flat 2-column grid of 6 to:

```tsx
<CalendrierHeroCard />
<CachetsHeroCard />
<div className="grid grid-cols-2 gap-3">
  {isManager ? <ManagerFinanceTile /> : <ArtistFinanceTile />}
  <TachesTile />
  <TracksTile />
  <SubventionsTile />
</div>
```

**`CalendrierHeroCard`** — same data as before (`computeNextEvent` over the same two `useCollection` queries), rendered as a large single-focus card (bigger title/date typography than a `CockpitTile`), matching the validated mockup. Still links to `/calendrier`.

**`CachetsHeroCard`** — same `countValidCachets`/`countValidHours` numbers as before, plus a compact Recharts `AreaChart` fed by `buildTimeline` (Task above): no `XAxis`/`YAxis`/`Tooltip`/legend rendered (it's a decorative trend indicator, not the full analytical graph already available on `/finance/cachets`), same two-series stacking (`confirmed` as base, `potential` stacked on top via matching `stackId`) as the full graph, at a small fixed height (e.g. 40px). Still links to `/finance/cachets`.

Both hero cards and the four grid tiles keep the same reactive "starts empty/zero, fills in as `useCollection` resolves" behavior as every other page — no new loading state.

## Testing

- `buildTimeline`'s extraction into `src/lib/cachets.ts` gets unit tests in `src/lib/__tests__/cachets.test.ts`, per the same `vitest.config.ts` scoping (`src/lib/**/*.test.ts` only) used throughout this project. No component/route test files, matching every other page in this codebase.
- `BottomNav.tsx` and the two new hero-card presentations are not unit-tested — no component in this codebase has one.

## Manual verification

Same as every prior feature this session: after deploy, `curl` the HTML shell, extract the content-hashed JS bundle, and grep it for distinctive strings (e.g. the "Accueil" nav label, hero-card copy) — no browser automation is available in this environment.
