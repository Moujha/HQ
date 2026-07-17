# Fees Manager: Add NDF + Search/Filter/Sort — Design

## Problem

Investigating a commission-total discrepancy report surfaced two real gaps on `/finance/fees` (manager view):

1. There is no UI anywhere in the app to create a new expense (`expenses` table, "NDF" — notes de frais) row. The 4 existing rows were all inserted directly in the database at some point; `VersementDrawer` (the only expense-adjacent UI on the page) only records payouts *to* the artist, it never writes to `expenses`.
2. `/finance/fees` has no search, filter, or sort — every other list page in the app (`/finance`, `/finance/cachets`) already has the search+filter-sheet+sort pattern; Fees is the odd one out.

## Goals

- Add a way to create a new `expenses` row from the UI: amount, description, status (defaults to `à_rembourser`).
- Bring `/finance/fees`'s fee list up to parity with the rest of the app: text search, a filter sheet (fee status), and date sort — same `SearchFilterSortBar` component already used on `/finance` and `/finance/cachets`.
- Manager-only, matching the existing `ManagerFeesView`/`ArtistFeesView` split — `ArtistFeesView` is untouched.

## Non-goals

- No payment-linking picker for new expenses — the 4 existing rows all have `payment_id: null`, and the form doesn't need to change that.
- No change to how "Commission due" or "Reste dû" are computed (`computeResteDu`/`computeControlRate` in `src/lib/fees.ts` stay exactly as they are) — this work only adds a way to populate `expenses` and adds list-browsing affordances, it doesn't touch the calculation.
- No territory/source filter on Fees (unlike Cachets/Finance) — just fee status, per the confirmed scope.

## Architecture

### `AddExpenseDrawer` (new component, `src/components/modules/fees/AddExpenseDrawer.tsx`)

A single-step form (not a multi-step wizard like `AddRevenueSheet` — three fields don't warrant one), following the same structural pattern as `VersementDrawer` (a `Drawer` wrapping a plain `<form>`, local `useState` per field, `supabase.from(...).insert(...)` on submit, toast + `onSuccess?.()` + close):

```ts
interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: () => void;
}
```

Fields: `amount` (number, required, >0), `description` (text, required), `status` (`"à_rembourser" | "remboursée"`, toggle pair matching the existing pill-button style, default `"à_rembourser"`). Submit inserts `{ amount, description, status, payment_id: null }` into `expenses`.

Reached via a new FAB (`+`, bottom-right, manager-only) on `/finance/fees`, matching the FAB already used on `/taches`, `/tracks`, `/subventions`, `/calendrier`. The existing "Enregistrer un versement" button inside the hero card is unchanged and stays where it is — it's a different action (settling due commission), not expense entry.

### Fees search/filter/sort

**New `src/lib/feesFilters.ts`** (mirrors `src/lib/cachetFilters.ts`'s shape and behavior exactly, scoped to `FeeLineData`):

```ts
export interface FeesFilters {
  search: string;
  statuses: string[]; // "projetée" | "due" | "versée"
}

export const EMPTY_FEES_FILTERS: FeesFilters = { search: "", statuses: [] };

export function countActiveFeesFilters(filters: FeesFilters): number;

export function applyFeesFilters<T extends { status: string; payment: { notes: string | null; source: string } | null }>(
  fees: T[],
  filters: FeesFilters
): T[];

export function sortFeesByDate<T extends { payment: { payment_date: string | null } | null }>(
  fees: T[],
  ascending: boolean
): T[];
```

`applyFeesFilters` reuses the identical accent/case-insensitive search normalization already in `cachetFilters.ts` (NFD-normalize + lowercase), matching against `fee.payment?.notes ?? fee.payment?.source ?? ""` — the same fallback `FeeLine.tsx` already displays. Unlike `applyCachetFilters`, there's no default-hide rule (fees have no `annulé`-equivalent status to hide by default).

**New `FeesFilterSheet` component** (`src/components/modules/fees/FeesFilterSheet.tsx`), structurally identical to `CachetFilterSheet` but with a single filter group:

```ts
const STATUS_OPTIONS = [
  { value: "projetée", label: "Projetée" },
  { value: "due", label: "Due" },
  { value: "versée", label: "Versée" },
] as const;
```

**`ManagerFeesView` changes** (`src/routes/_authenticated/finance/fees.tsx`): add `filters`/`filterSheetOpen`/`sortAsc` state (same pattern as `finance/index.tsx`), render `<SearchFilterSortBar>` between the hero card and the fee list, apply `applyFeesFilters` then `sortFeesByDate` to `filteredFees` before mapping to `<FeeLine>`. The existing `filteredFees` (commission-start-date + `annulé`-payment exclusion) stays as the base list that search/filter/sort narrow further — summary figures (`resteDu`, `commissionDueTotal`, `ndfTotal`, `alreadyPaid`, `controlRate`) keep computing from the unfiltered `filteredFees`/`expenses`, never from the search/filter-narrowed list — same rule already followed on `/finance` (summary cards stay stable while the list below is filtered).

## Testing

- `applyFeesFilters`/`sortFeesByDate`/`countActiveFeesFilters` get unit tests in a new `src/lib/__tests__/feesFilters.test.ts`, per `vitest.config.ts`'s `src/lib/**/*.test.ts` scope.
- `AddExpenseDrawer` and `FeesFilterSheet` are not unit-tested — no component in this codebase has one.

## Manual verification

Same as every prior feature this session: after deploy, `curl` the HTML shell, extract the content-hashed JS bundle, grep for distinctive new strings — no browser automation available in this environment.
