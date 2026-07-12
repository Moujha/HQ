# Cachets: statut Annulé, swipe de statut, filtres/tri/recherche — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `annulé` payment status, let managers change a cachet's status by swiping the row (Tinder-style), and replace the cachets page's filter pills with a search bar + multi-select filter sheet + date sort toggle.

**Architecture:** Data-layer change (new CHECK constraint value + exclusion from every financial/intermittence calculation in `src/lib/cachets.ts`) flows up through small, focused UI changes: a label rename repeated across 5 display components, a new pure-function filter/sort module (`src/lib/cachetFilters.ts`, unit-tested — the project's vitest config only covers `src/lib/**/*.test.ts`, so filter logic must live there to be testable), a new `CachetFilterSheet` bottom sheet component, and a `framer-motion`-powered drag gesture added to `CachetRow`.

**Tech Stack:** TanStack Start + React 19 + TypeScript, Supabase (Postgres), Tailwind v4, `vaul` (Drawer/bottom sheet), `sonner` (toast), Vitest (node environment, `src/lib/**/*.test.ts` only — no component/DOM tests in this project), new dependency `framer-motion@^12.42.2`.

## Global Constraints

- Every mutation goes through the existing `supabase` client from `@/integrations/supabase/client`, matching the pattern already used in `EditPaymentDrawer.tsx`.
- No new automated tests outside `src/lib/**/*.test.ts` — `vitest.config.ts` only includes that glob and there is no DOM/testing-library setup in this project. Component-level correctness is checked via `pnpm exec tsc --noEmit` + manual verification (`pnpm dev`), not new test files.
- French UI copy throughout (matches existing app).
- Status swipe and the new "Annulé" status option are manager-only, matching the existing `isManager` gating pattern already used for the add button and edit drawer.
- Reuse existing visual patterns: chip buttons (`rounded-full border px-3.5 py-1.5 text-xs font-medium transition`, selected = `border-foreground bg-foreground text-background`, unselected = `border-border bg-card text-muted-foreground`) and the shared `Drawer`/`DrawerContent`/`DrawerHeader`/`DrawerTitle` from `@/components/ui/drawer`.
- Canonical status order (left → right): `annulé, provisoire (tbc alias), cachet_en_attente, facturé, payé`. Swipe right = advance one step; swipe left = go back one step; clamped at both ends.
- Label rename: `cachet_en_attente` displays as **"Confirmé"** everywhere (was "En attente"). Do not touch unrelated "En attente" labels for other domains (grants, notifications).

---

### Task 1: DB migration + generated types for `annulé` status

**Files:**
- Create: `supabase/migrations/20260712000001_payment_annule_status.sql`
- Modify: `src/integrations/supabase/types.ts` (3 occurrences of the payments status union, Row/Insert/Update)

**Interfaces:**
- Produces: `payments.status` now accepts `'annulé'` in addition to the existing 5 values, both in Postgres and in the generated TS types.

- [ ] **Step 1: Write the migration**

```sql
-- Add 'annulé' as a valid payment status (soft-cancel — never delete the row)
-- Excluded from all financial/intermittence calculations (see src/lib/cachets.ts)

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'payments'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%provisoire%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE payments DROP CONSTRAINT ' || quote_ident(constraint_name);
  END IF;
END $$;

ALTER TABLE payments
  ADD CONSTRAINT payments_status_check
  CHECK (status IN ('provisoire','facturé','cachet_en_attente','payé','tbc','annulé'));
```

Save as `supabase/migrations/20260712000001_payment_annule_status.sql`.

- [ ] **Step 2: Update generated types**

In `src/integrations/supabase/types.ts`, find the 3 lines matching this exact string (Row, Insert as `status?:`, Update as `status?:` — all inside the `payments` table definition):

```
status: "provisoire" | "facturé" | "cachet_en_attente" | "payé" | "tbc"
```
```
status?: "provisoire" | "facturé" | "cachet_en_attente" | "payé" | "tbc"
```

Replace each occurrence (there are 3 total: one `status:` and two `status?:`) by appending `| "annulé"`, e.g.:

```
status: "provisoire" | "facturé" | "cachet_en_attente" | "payé" | "tbc" | "annulé"
```
```
status?: "provisoire" | "facturé" | "cachet_en_attente" | "payé" | "tbc" | "annulé"
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors (this step only widens a union type, nothing consumes it yet).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260712000001_payment_annule_status.sql src/integrations/supabase/types.ts
git commit -m "feat(db): add annulé payment status"
```

---

### Task 2: Exclude `annulé` from cachets calculations (TDD)

**Files:**
- Modify: `src/lib/cachets.ts`
- Test: `src/lib/__tests__/cachets.test.ts`

**Interfaces:**
- Consumes: `PaymentForCachets.status` type (currently `"provisoire" | "facturé" | "cachet_en_attente" | "payé" | "tbc"`)
- Produces: `isValidAt`, `countValidHours`, `expiringWithin`, `collectUpcoming` all treat `status === "annulé"` as invalid/excluded, same tier as `"tbc"`.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/__tests__/cachets.test.ts`, inside the existing `describe("countValidCachets", ...)` block (after the `"ignores non-payé status"` test):

```ts
  it("ignores annulé status even with a valid expires_at", () => {
    expect(countValidCachets([make({ status: "annulé" })])).toBe(0);
  });
```

Add to the existing `describe("expiringWithin", ...)` block (after `"excludes non-payé"`):

```ts
  it("excludes annulé", () => {
    const p = make({ status: "annulé", expires_at: future(10) });
    expect(expiringWithin([p], 60)).toHaveLength(0);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: the 2 new tests FAIL (annulé is not yet excluded); pre-existing unrelated failures in this file (`ignores null expires_at`, `excludes non-payé`) are already-known issues, not introduced here — ignore them, just confirm the 2 new ones fail.

- [ ] **Step 3: Implement the exclusion**

In `src/lib/cachets.ts`, the `isValidAt` function currently starts:

```ts
function isValidAt(p: PaymentForCachets, date: Date): boolean {
  if (p.status === "tbc") return false;
  if (!p.counts_for_intermittence) return false;
```

Change to:

```ts
function isValidAt(p: PaymentForCachets, date: Date): boolean {
  if (p.status === "tbc" || p.status === "annulé") return false;
  if (!p.counts_for_intermittence) return false;
```

The `countValidHours` function currently filters:

```ts
  const valid = payments.filter(
    (p) =>
      p.status !== "tbc" &&
      p.counts_for_intermittence &&
      p.expires_at != null &&
      new Date(p.expires_at) > now,
  );
```

Change to:

```ts
  const valid = payments.filter(
    (p) =>
      p.status !== "tbc" &&
      p.status !== "annulé" &&
      p.counts_for_intermittence &&
      p.expires_at != null &&
      new Date(p.expires_at) > now,
  );
```

The `expiringWithin` function currently filters:

```ts
  return payments.filter(
    (p) =>
      p.status !== "tbc" &&
      p.expires_at != null &&
      new Date(p.expires_at) > now &&
      new Date(p.expires_at) <= limit
  );
```

Change to:

```ts
  return payments.filter(
    (p) =>
      p.status !== "tbc" &&
      p.status !== "annulé" &&
      p.expires_at != null &&
      new Date(p.expires_at) > now &&
      new Date(p.expires_at) <= limit
  );
```

The `collectUpcoming` function currently starts its loop body with:

```ts
  for (const p of payments) {
    if (p.status === "payé") continue;
    if (!p.counts_for_intermittence) continue;
    if (!p.payment_date) continue;
```

Change to:

```ts
  for (const p of payments) {
    if (p.status === "payé" || p.status === "annulé") continue;
    if (!p.counts_for_intermittence) continue;
    if (!p.payment_date) continue;
```

(`computeProjection`'s `currentActive` loop already only considers `p.status !== "payé"` → `continue`, so an `annulé` payment is already excluded there with no change needed.)

Finally, update the shared type in every interface that declares it — `PaymentForCachets` in `src/lib/cachets.ts`:

```ts
export interface PaymentForCachets {
  id: string;
  status: "provisoire" | "facturé" | "cachet_en_attente" | "payé" | "tbc";
```

Change to:

```ts
export interface PaymentForCachets {
  id: string;
  status: "provisoire" | "facturé" | "cachet_en_attente" | "payé" | "tbc" | "annulé";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: the 2 new tests PASS. Total pass count increases by 2 versus the baseline (pre-existing unrelated failures remain, unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cachets.ts src/lib/__tests__/cachets.test.ts
git commit -m "feat(cachets): exclude annulé status from intermittence calculations"
```

**Note (deviation from the design spec):** the spec said `IntermittenceGraph.tsx`'s `ALL_STATUSES`/`CONFIRMED_STATUSES` arrays would need `annulé` removed. On inspection, those arrays are hardcoded allow-lists (`["payé", "cachet_en_attente", "facturé", "provisoire", "tbc"]`) that never included `"annulé"` in the first place — a new status value is excluded from them by default, not included. No change to `IntermittenceGraph.tsx` is needed; this task's changes to `src/lib/cachets.ts` are sufficient to keep annulé out of the graph data.

---

### Task 3: New `cachetFilters.ts` — search/filter/sort pure functions (TDD)

**Files:**
- Create: `src/lib/cachetFilters.ts`
- Test: `src/lib/__tests__/cachetFilters.test.ts`

**Interfaces:**
- Produces:
  - `interface CachetFilters { search: string; statuses: string[]; territories: string[]; sources: string[]; }`
  - `const EMPTY_FILTERS: CachetFilters`
  - `function countActiveFilters(filters: CachetFilters): number`
  - `function applyCachetFilters<T extends CachetForFilter>(payments: T[], filters: CachetFilters): T[]`
  - `function sortCachetsByDate<T extends { payment_date: string | null }>(payments: T[], ascending: boolean): T[]`
  - `interface CachetForFilter { id: string; notes: string | null; status: string; territory: "france" | "étranger"; source: string; payment_date: string | null; }`
- Consumed by: Task 12 (`cachets.tsx` route) and Task 11 (`CachetFilterSheet.tsx`).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/cachetFilters.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  applyCachetFilters,
  sortCachetsByDate,
  countActiveFilters,
  EMPTY_FILTERS,
  type CachetForFilter,
} from "../cachetFilters";

const make = (overrides: Partial<CachetForFilter> = {}): CachetForFilter => ({
  id: "x",
  notes: "Concert La Cigale",
  status: "payé",
  territory: "france",
  source: "booking",
  payment_date: "2026-01-01",
  ...overrides,
});

describe("applyCachetFilters", () => {
  it("returns everything except annulé when no status filter is set", () => {
    const rows = [make({ id: "a", status: "payé" }), make({ id: "b", status: "annulé" })];
    const result = applyCachetFilters(rows, EMPTY_FILTERS);
    expect(result.map((r) => r.id)).toEqual(["a"]);
  });

  it("includes annulé when explicitly selected in the status filter", () => {
    const rows = [make({ id: "a", status: "payé" }), make({ id: "b", status: "annulé" })];
    const result = applyCachetFilters(rows, { ...EMPTY_FILTERS, statuses: ["annulé"] });
    expect(result.map((r) => r.id)).toEqual(["b"]);
  });

  it("ORs multiple selected statuses", () => {
    const rows = [
      make({ id: "a", status: "payé" }),
      make({ id: "b", status: "facturé" }),
      make({ id: "c", status: "provisoire" }),
    ];
    const result = applyCachetFilters(rows, { ...EMPTY_FILTERS, statuses: ["payé", "facturé"] });
    expect(result.map((r) => r.id).sort()).toEqual(["a", "b"]);
  });

  it("ANDs territory with status", () => {
    const rows = [
      make({ id: "a", status: "payé", territory: "france" }),
      make({ id: "b", status: "payé", territory: "étranger" }),
    ];
    const result = applyCachetFilters(rows, { ...EMPTY_FILTERS, territories: ["étranger"] });
    expect(result.map((r) => r.id)).toEqual(["b"]);
  });

  it("ANDs source with the rest", () => {
    const rows = [
      make({ id: "a", source: "booking" }),
      make({ id: "b", source: "clip" }),
    ];
    const result = applyCachetFilters(rows, { ...EMPTY_FILTERS, sources: ["clip"] });
    expect(result.map((r) => r.id)).toEqual(["b"]);
  });

  it("searches notes case- and accent-insensitively", () => {
    const rows = [make({ id: "a", notes: "Concert La Cigale" }), make({ id: "b", notes: "Répétition" })];
    expect(applyCachetFilters(rows, { ...EMPTY_FILTERS, search: "cigale" }).map((r) => r.id)).toEqual(["a"]);
    expect(applyCachetFilters(rows, { ...EMPTY_FILTERS, search: "repetition" }).map((r) => r.id)).toEqual(["b"]);
  });

  it("treats null notes as empty for search", () => {
    const rows = [make({ id: "a", notes: null })];
    expect(applyCachetFilters(rows, { ...EMPTY_FILTERS, search: "x" })).toHaveLength(0);
    expect(applyCachetFilters(rows, { ...EMPTY_FILTERS, search: "" })).toHaveLength(1);
  });
});

describe("sortCachetsByDate", () => {
  it("sorts descending by default order given", () => {
    const rows = [make({ id: "a", payment_date: "2026-01-01" }), make({ id: "b", payment_date: "2026-06-01" })];
    expect(sortCachetsByDate(rows, false).map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("sorts ascending when asked", () => {
    const rows = [make({ id: "a", payment_date: "2026-06-01" }), make({ id: "b", payment_date: "2026-01-01" })];
    expect(sortCachetsByDate(rows, true).map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("treats null payment_date as oldest", () => {
    const rows = [make({ id: "a", payment_date: null }), make({ id: "b", payment_date: "2026-01-01" })];
    expect(sortCachetsByDate(rows, true).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("does not mutate the input array", () => {
    const rows = [make({ id: "a", payment_date: "2026-01-01" }), make({ id: "b", payment_date: "2026-06-01" })];
    const copy = [...rows];
    sortCachetsByDate(rows, true);
    expect(rows).toEqual(copy);
  });
});

describe("countActiveFilters", () => {
  it("counts 0 for EMPTY_FILTERS", () => {
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
  });

  it("sums statuses + territories + sources (not search)", () => {
    expect(
      countActiveFilters({ search: "x", statuses: ["payé"], territories: ["france", "étranger"], sources: [] })
    ).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/__tests__/cachetFilters.test.ts`
Expected: FAIL — `Cannot find module '../cachetFilters'`.

- [ ] **Step 3: Implement `src/lib/cachetFilters.ts`**

```ts
export interface CachetForFilter {
  id: string;
  notes: string | null;
  status: string;
  territory: "france" | "étranger";
  source: string;
  payment_date: string | null;
}

export interface CachetFilters {
  search: string;
  statuses: string[];
  territories: string[];
  sources: string[];
}

export const EMPTY_FILTERS: CachetFilters = {
  search: "",
  statuses: [],
  territories: [],
  sources: [],
};

export function countActiveFilters(filters: CachetFilters): number {
  return filters.statuses.length + filters.territories.length + filters.sources.length;
}

function normalizeForSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function applyCachetFilters<T extends CachetForFilter>(
  payments: T[],
  filters: CachetFilters
): T[] {
  const search = normalizeForSearch(filters.search.trim());

  return payments.filter((p) => {
    if (filters.statuses.length > 0) {
      if (!filters.statuses.includes(p.status)) return false;
    } else if (p.status === "annulé") {
      return false;
    }

    if (filters.territories.length > 0 && !filters.territories.includes(p.territory)) {
      return false;
    }

    if (filters.sources.length > 0 && !filters.sources.includes(p.source)) {
      return false;
    }

    if (search && !normalizeForSearch(p.notes ?? "").includes(search)) {
      return false;
    }

    return true;
  });
}

export function sortCachetsByDate<T extends { payment_date: string | null }>(
  payments: T[],
  ascending: boolean
): T[] {
  return [...payments].sort((a, b) => {
    const ta = a.payment_date ? new Date(a.payment_date).getTime() : 0;
    const tb = b.payment_date ? new Date(b.payment_date).getTime() : 0;
    return ascending ? ta - tb : tb - ta;
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/__tests__/cachetFilters.test.ts`
Expected: all tests in this file PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cachetFilters.ts src/lib/__tests__/cachetFilters.test.ts
git commit -m "feat(cachets): add search/filter/sort pure functions"
```

---

### Task 4: `EventLine.tsx` — label rename + annulé payment fix

**Files:**
- Modify: `src/components/modules/calendrier/EventLine.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks (type-level change only, matches DB constraint from Task 1).
- Produces: `EventPayment.status` now includes `"annulé"`; `deriveDisplayStatus` ignores cancelled payments when computing an event's derived status.

- [ ] **Step 1: Update the type and exclude annulé from rank derivation**

Current:

```ts
export interface EventPayment {
  id: string;
  status: "provisoire" | "facturé" | "cachet_en_attente" | "payé" | "tbc";
  amount: number;
}
```

Change to:

```ts
export interface EventPayment {
  id: string;
  status: "provisoire" | "facturé" | "cachet_en_attente" | "payé" | "tbc" | "annulé";
  amount: number;
}
```

Current:

```ts
function deriveDisplayStatus(
  eventStatus: "confirmé" | "TBC" | "annulé",
  payments: EventPayment[] | null,
): string {
  if (eventStatus === "annulé") return "annulé";
  if (!payments || payments.length === 0) return eventStatus;
  return payments.reduce((acc, p) => {
    return (PAYMENT_RANK[p.status] ?? 0) < (PAYMENT_RANK[acc] ?? 0) ? p.status : acc;
  }, payments[0].status);
}
```

Change to:

```ts
function deriveDisplayStatus(
  eventStatus: "confirmé" | "TBC" | "annulé",
  payments: EventPayment[] | null,
): string {
  if (eventStatus === "annulé") return "annulé";
  const active = (payments ?? []).filter((p) => p.status !== "annulé");
  if (active.length === 0) return eventStatus;
  return active.reduce((acc, p) => {
    return (PAYMENT_RANK[p.status] ?? 0) < (PAYMENT_RANK[acc] ?? 0) ? p.status : acc;
  }, active[0].status);
}
```

- [ ] **Step 2: Rename the `cachet_en_attente` label**

Current:

```ts
const STATUS_LABEL: Record<string, string> = {
  confirmé: "Confirmé",
  TBC: "TBC",
  annulé: "Annulé",
  tbc: "TBC",
  provisoire: "TBC",
  cachet_en_attente: "En attente",
  facturé: "Facturé",
  payé: "Payé",
};
```

Change to:

```ts
const STATUS_LABEL: Record<string, string> = {
  confirmé: "Confirmé",
  TBC: "TBC",
  annulé: "Annulé",
  tbc: "TBC",
  provisoire: "TBC",
  cachet_en_attente: "Confirmé",
  facturé: "Facturé",
  payé: "Payé",
};
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/modules/calendrier/EventLine.tsx
git commit -m "fix(calendrier): ignore annulé payments in event status derivation, rename Confirmé label"
```

---

### Task 5: `RevenueLine.tsx` — label rename + annulé support

**Files:**
- Modify: `src/components/modules/finance/RevenueLine.tsx`

- [ ] **Step 1: Widen the status type and add the annulé style/label**

Current:

```ts
export interface RevenueLineData {
  id: string;
  notes: string | null;
  source: "label" | "booking" | "clip" | "track" | "résidence" | "figuration" | "sacem";
  amount: number;
  payment_date: string | null;
  status: "provisoire" | "facturé" | "cachet_en_attente" | "payé";
}
```

Change to:

```ts
export interface RevenueLineData {
  id: string;
  notes: string | null;
  source: "label" | "booking" | "clip" | "track" | "résidence" | "figuration" | "sacem";
  amount: number;
  payment_date: string | null;
  status: "provisoire" | "facturé" | "cachet_en_attente" | "payé" | "annulé";
}
```

Current:

```ts
const STATUS_CLASS: Record<string, string> = {
  provisoire: "text-amber-400 bg-amber-400/10",
  facturé: "text-blue-400 bg-blue-400/10",
  cachet_en_attente: "text-amber-400 bg-amber-400/10",
  payé: "text-green-400 bg-green-400/10",
};

const STATUS_LABEL: Record<string, string> = {
  provisoire: "Provisoire",
  facturé: "Facturé",
  cachet_en_attente: "En attente",
  payé: "Payé",
};
```

Change to:

```ts
const STATUS_CLASS: Record<string, string> = {
  provisoire: "text-amber-400 bg-amber-400/10",
  facturé: "text-blue-400 bg-blue-400/10",
  cachet_en_attente: "text-amber-400 bg-amber-400/10",
  payé: "text-green-400 bg-green-400/10",
  annulé: "text-red-400 bg-red-400/10",
};

const STATUS_LABEL: Record<string, string> = {
  provisoire: "Provisoire",
  facturé: "Facturé",
  cachet_en_attente: "Confirmé",
  payé: "Payé",
  annulé: "Annulé",
};
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/modules/finance/RevenueLine.tsx
git commit -m "feat(finance): support annulé status in RevenueLine, rename Confirmé label"
```

---

### Task 6: `AddRevenueSheet.tsx` — label rename only

**Files:**
- Modify: `src/components/modules/finance/AddRevenueSheet.tsx`

(No `annulé` option here — you don't create a payment that's already cancelled.)

- [ ] **Step 1: Rename the label**

Current:

```ts
const STATUS_OPTIONS: { value: StatusType; label: string }[] = [
  { value: "provisoire", label: "TBC" },
  { value: "cachet_en_attente", label: "En attente" },
  { value: "payé", label: "Payé" },
];
```

Change to:

```ts
const STATUS_OPTIONS: { value: StatusType; label: string }[] = [
  { value: "provisoire", label: "TBC" },
  { value: "cachet_en_attente", label: "Confirmé" },
  { value: "payé", label: "Payé" },
];
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/modules/finance/AddRevenueSheet.tsx
git commit -m "feat(finance): rename Confirmé label in AddRevenueSheet"
```

---

### Task 7: `EditPaymentDrawer.tsx` — label rename + annulé option

**Files:**
- Modify: `src/components/modules/cachets/EditPaymentDrawer.tsx`

**Interfaces:**
- Produces: manual status editing (via the bottom sheet, independent of the swipe gesture from Task 10) now offers all 5 statuses including Annulé.

- [ ] **Step 1: Widen the zod schema**

Current:

```ts
  status: z.enum(["provisoire", "facturé", "cachet_en_attente", "payé", "tbc"]),
```

Change to:

```ts
  status: z.enum(["provisoire", "facturé", "cachet_en_attente", "payé", "tbc", "annulé"]),
```

- [ ] **Step 2: Rename the label and add the Annulé option**

Current:

```ts
const STATUS_OPTIONS = [
  { value: "provisoire", label: "TBC" },
  { value: "cachet_en_attente", label: "En attente" },
  { value: "facturé", label: "Facturé" },
  { value: "payé", label: "Payé" },
] as const;
```

Change to:

```ts
const STATUS_OPTIONS = [
  { value: "provisoire", label: "TBC" },
  { value: "cachet_en_attente", label: "Confirmé" },
  { value: "facturé", label: "Facturé" },
  { value: "payé", label: "Payé" },
  { value: "annulé", label: "Annulé" },
] as const;
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/modules/cachets/EditPaymentDrawer.tsx
git commit -m "feat(cachets): add Annulé to manual status options, rename Confirmé label"
```

---

### Task 8: `finance/index.tsx` — exclude annulé from "reste dû"

**Files:**
- Modify: `src/routes/_authenticated/finance/index.tsx`

**Interfaces:**
- Consumes: `computeResteDu(fees, expenses)` from `src/lib/fees.ts` (unchanged signature — filtering happens at the call site).

- [ ] **Step 1: Extend the fee query to also select payment status**

Current:

```ts
interface FeeWithPayment extends ManagementFeeForCalc {
  payment: { payment_date: string | null } | null;
}
```

Change to:

```ts
interface FeeWithPayment extends ManagementFeeForCalc {
  payment: { payment_date: string | null; status: string } | null;
}
```

Current:

```ts
  const { data: fees } = useCollection<FeeWithPayment>("management_fees", {
    select: "id, commission_due, status, already_paid_to_manager, is_commissionable, payment:payments(payment_date)",
  });
```

Change to:

```ts
  const { data: fees } = useCollection<FeeWithPayment>("management_fees", {
    select: "id, commission_due, status, already_paid_to_manager, is_commissionable, payment:payments(payment_date, status)",
  });
```

- [ ] **Step 2: Exclude annulé payments from the reste-dû calc**

Current:

```ts
  const filteredFees = useMemo(
    () =>
      fees.filter((f) => {
        const payDate = f.payment?.payment_date;
        return !payDate || payDate >= commissionStart;
      }),
    [fees, commissionStart]
  );
```

Change to:

```ts
  const filteredFees = useMemo(
    () =>
      fees.filter((f) => {
        if (f.payment?.status === "annulé") return false;
        const payDate = f.payment?.payment_date;
        return !payDate || payDate >= commissionStart;
      }),
    [fees, commissionStart]
  );
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/_authenticated/finance/index.tsx
git commit -m "fix(finance): exclude annulé payments from reste-dû calculation"
```

---

### Task 9: Add `framer-motion` dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add the dependency**

In `package.json`, inside `"dependencies"`, insert alphabetically after `"embla-carousel-react"` and before `"input-otp"`:

```json
    "framer-motion": "^12.42.2",
```

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: lockfile updates, `node_modules/framer-motion` present, no errors. If pnpm prompts about build scripts for a new transitive dependency, run `pnpm approve-builds` and select/approve as needed (same as was done for `esbuild` during initial environment setup).

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add framer-motion for swipe gesture"
```

---

### Task 10: `CachetRow.tsx` — label rename, annulé style, swipe gesture

**Files:**
- Modify: `src/components/modules/cachets/CachetRow.tsx`

**Interfaces:**
- Consumes: `framer-motion` (`motion`, `useMotionValue`, `useTransform`, `type PanInfo`) from Task 9.
- Produces:
  - `PaymentRow.status` includes `"annulé"`.
  - Exported `STATUS_LABEL` (was module-private) — reused by Task 12 for toast copy.
  - Exported `nextStatus(status)` / `previousStatus(status)` — pure helpers, reused by Task 12.
  - New props on `CachetRow`: `swipeEnabled?: boolean` (default `false`), `onSwipeStatusChange?: (next: PaymentRow["status"]) => void`.

- [ ] **Step 1: Replace the full file**

Replace the entire contents of `src/components/modules/cachets/CachetRow.tsx` with:

```tsx
import { motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { format, differenceInDays } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertTriangle } from "lucide-react";
import { BatchBadge } from "./BatchBadge";
import { HOURS_PER_CACHET } from "@/lib/cachets";

export interface PaymentRow {
  id: string;
  notes: string | null;
  source: string;
  amount: number;
  payment_date: string | null;
  expires_at: string | null;
  status: "provisoire" | "facturé" | "cachet_en_attente" | "payé" | "tbc" | "annulé";
  territory: "france" | "étranger";
  counts_for_intermittence: boolean;
  deductible_expenses: number;
  hours: number;
  batch_id: string | null;
  batch: { batch_count: number } | null;
}

export const STATUS_LABEL: Record<string, string> = {
  provisoire: "TBC",
  facturé: "Facturé",
  cachet_en_attente: "Confirmé",
  payé: "Payé",
  tbc: "TBC",
  annulé: "Annulé",
};

const STATUS_CLASS: Record<string, string> = {
  provisoire: "text-muted-foreground bg-muted",
  facturé: "text-blue-400 bg-blue-400/10",
  cachet_en_attente: "text-amber-400 bg-amber-400/10",
  payé: "text-green-400 bg-green-400/10",
  tbc: "text-muted-foreground bg-muted",
  annulé: "text-red-400 bg-red-400/10",
};

const STATUS_ORDER = ["annulé", "provisoire", "cachet_en_attente", "facturé", "payé"] as const;

function orderIndex(status: PaymentRow["status"]): number {
  const normalized = status === "tbc" ? "provisoire" : status;
  return STATUS_ORDER.indexOf(normalized as (typeof STATUS_ORDER)[number]);
}

export function nextStatus(status: PaymentRow["status"]): PaymentRow["status"] | null {
  const i = orderIndex(status);
  if (i === -1 || i >= STATUS_ORDER.length - 1) return null;
  return STATUS_ORDER[i + 1];
}

export function previousStatus(status: PaymentRow["status"]): PaymentRow["status"] | null {
  const i = orderIndex(status);
  if (i <= 0) return null;
  return STATUS_ORDER[i - 1];
}

const COMMIT_DISTANCE = 96;
const COMMIT_VELOCITY = 500;

export function CachetRow({
  payment,
  onClick,
  swipeEnabled = false,
  onSwipeStatusChange,
}: {
  payment: PaymentRow;
  onClick?: () => void;
  swipeEnabled?: boolean;
  onSwipeStatusChange?: (next: PaymentRow["status"]) => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-8, 8]);
  const rightLabelOpacity = useTransform(x, [0, COMMIT_DISTANCE], [0, 1]);
  const leftLabelOpacity = useTransform(x, [-COMMIT_DISTANCE, 0], [1, 0]);

  const expiresAt = payment.expires_at ? new Date(payment.expires_at) : null;
  const daysLeft = expiresAt ? differenceInDays(expiresAt, new Date()) : null;
  const expiringSoon = daysLeft != null && daysLeft >= 0 && daysLeft <= 60;
  const expired = daysLeft != null && daysLeft < 0;

  // Batch rows each represent 1 cachet (batch_count is for the global counter, not per-row display).
  // Non-batch: derive from hours (form stores N cachets as N × 12h).
  const cachetCount = payment.batch_id != null
    ? 1
    : Math.max(1, Math.round(payment.hours / HOURS_PER_CACHET));

  const next = nextStatus(payment.status);
  const prev = previousStatus(payment.status);

  const handleDragEnd = (_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    const { offset, velocity } = info;
    const commitRight = offset.x > COMMIT_DISTANCE || velocity.x > COMMIT_VELOCITY;
    const commitLeft = offset.x < -COMMIT_DISTANCE || velocity.x < -COMMIT_VELOCITY;

    if (commitRight && next) {
      onSwipeStatusChange?.(next);
    } else if (commitLeft && prev) {
      onSwipeStatusChange?.(prev);
    }
  };

  const content = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {payment.notes ?? payment.source}
          </span>
          {payment.batch && <BatchBadge count={payment.batch.batch_count} />}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-xs text-muted-foreground">
            {payment.payment_date
              ? format(new Date(payment.payment_date), "d MMM yyyy", { locale: fr })
              : "Sans date"}
          </span>
          {payment.counts_for_intermittence && (
            <span className="text-xs text-muted-foreground">· {payment.hours * cachetCount} h</span>
          )}
          {payment.territory === "étranger" && (
            <span className="text-xs text-muted-foreground">· 🌍 Étranger</span>
          )}
          {!payment.counts_for_intermittence && (
            <span className="flex items-center gap-0.5 text-xs text-amber-400">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              hors intermittence
            </span>
          )}
          {expiringSoon && (payment.status === "payé" || payment.status === "cachet_en_attente") && (
            <span className="text-xs text-amber-400">
              · expire dans {daysLeft}j
            </span>
          )}
          {expired && payment.status === "payé" && (
            <span className="text-xs text-muted-foreground line-through">
              · expiré
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-sm font-semibold text-foreground">
          {cachetCount} cachet{cachetCount > 1 ? "s" : ""}
        </span>
        <span className="text-xs text-muted-foreground">
          {payment.amount.toLocaleString("fr-FR", {
            style: "currency",
            currency: "EUR",
          })}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[0.6rem] font-medium ${
            STATUS_CLASS[payment.status] ?? ""
          }`}
        >
          {STATUS_LABEL[payment.status] ?? payment.status}
        </span>
      </div>
    </>
  );

  if (!swipeEnabled) {
    return (
      <button
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition active:scale-[0.98]"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="relative">
      {next && (
        <motion.div
          style={{ opacity: rightLabelOpacity }}
          className="absolute inset-0 flex items-center justify-start rounded-xl bg-green-500/20 px-4"
          aria-hidden="true"
        >
          <span className="text-xs font-semibold text-green-400">→ {STATUS_LABEL[next]}</span>
        </motion.div>
      )}
      {prev && (
        <motion.div
          style={{ opacity: leftLabelOpacity }}
          className="absolute inset-0 flex items-center justify-end rounded-xl bg-red-500/20 px-4"
          aria-hidden="true"
        >
          <span className="text-xs font-semibold text-red-400">{STATUS_LABEL[prev]} ←</span>
        </motion.div>
      )}
      <motion.div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") onClick?.();
        }}
        drag="x"
        dragSnapToOrigin
        style={{ x, rotate }}
        onDragEnd={handleDragEnd}
        onTap={onClick}
        className="relative flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left"
      >
        {content}
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/modules/cachets/CachetRow.tsx
git commit -m "feat(cachets): add Tinder-style swipe to change payment status"
```

---

### Task 11: `CachetFilterSheet.tsx` — new filter bottom sheet

**Files:**
- Create: `src/components/modules/cachets/CachetFilterSheet.tsx`

**Interfaces:**
- Consumes: `CachetFilters` type from `src/lib/cachetFilters.ts` (Task 3); `Drawer`/`DrawerContent`/`DrawerHeader`/`DrawerTitle` from `@/components/ui/drawer`.
- Produces: `CachetFilterSheet` component, props `{ open: boolean; onOpenChange: (v: boolean) => void; filters: CachetFilters; onChange: (filters: CachetFilters) => void; }` — consumed by Task 12.

- [ ] **Step 1: Create the component**

```tsx
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import type { CachetFilters } from "@/lib/cachetFilters";

const STATUS_OPTIONS = [
  { value: "provisoire", label: "TBC" },
  { value: "cachet_en_attente", label: "Confirmé" },
  { value: "facturé", label: "Facturé" },
  { value: "payé", label: "Payé" },
  { value: "annulé", label: "Annulé" },
] as const;

const TERRITORY_OPTIONS = [
  { value: "france", label: "France" },
  { value: "étranger", label: "Étranger" },
] as const;

const SOURCE_OPTIONS = [
  { value: "booking", label: "Concert" },
  { value: "répétition", label: "Répétition" },
  { value: "formation", label: "Formation" },
  { value: "accompagnement", label: "Accompagnement" },
  { value: "figuration", label: "Figuration" },
  { value: "résidence", label: "Résidence" },
  { value: "clip", label: "Clip" },
  { value: "track", label: "Track" },
  { value: "label", label: "Label" },
] as const;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  filters: CachetFilters;
  onChange: (filters: CachetFilters) => void;
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function FilterGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: readonly { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onToggle(opt.value)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
              selected.includes(opt.value)
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-card text-muted-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CachetFilterSheet({ open, onOpenChange, filters, onChange }: Props) {
  const reset = () => onChange({ ...filters, statuses: [], territories: [], sources: [] });

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85dvh]">
        <DrawerHeader className="flex flex-row items-center justify-between space-y-0">
          <DrawerTitle className="font-display text-xl">Filtres</DrawerTitle>
          <button
            type="button"
            onClick={reset}
            className="text-xs font-medium text-muted-foreground"
          >
            Réinitialiser
          </button>
        </DrawerHeader>

        <div className="overflow-y-auto px-4 pb-8 space-y-5 no-scrollbar">
          <FilterGroup
            label="Statut"
            options={STATUS_OPTIONS}
            selected={filters.statuses}
            onToggle={(v) => onChange({ ...filters, statuses: toggle(filters.statuses, v) })}
          />
          <FilterGroup
            label="Territoire"
            options={TERRITORY_OPTIONS}
            selected={filters.territories}
            onToggle={(v) => onChange({ ...filters, territories: toggle(filters.territories, v) })}
          />
          <FilterGroup
            label="Type"
            options={SOURCE_OPTIONS}
            selected={filters.sources}
            onToggle={(v) => onChange({ ...filters, sources: toggle(filters.sources, v) })}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/modules/cachets/CachetFilterSheet.tsx
git commit -m "feat(cachets): add multi-select filter bottom sheet"
```

---

### Task 12: `cachets.tsx` route — wire up search/filter/sort/swipe, remove old pills

**Files:**
- Modify: `src/routes/_authenticated/finance/cachets.tsx`

**Interfaces:**
- Consumes:
  - `CachetFilters`, `EMPTY_FILTERS`, `applyCachetFilters`, `sortCachetsByDate`, `countActiveFilters` from `src/lib/cachetFilters.ts` (Task 3)
  - `CachetFilterSheet` from `src/components/modules/cachets/CachetFilterSheet.tsx` (Task 11)
  - `STATUS_LABEL`, `nextStatus`/`previousStatus` re-exported by `CachetRow.tsx` (Task 10) — only `STATUS_LABEL` is actually needed here (for the toast message)
  - `CachetRow` new props `swipeEnabled`, `onSwipeStatusChange` (Task 10)

- [ ] **Step 1: Replace the full file**

Replace the entire contents of `src/routes/_authenticated/finance/cachets.tsx` with:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { AlertTriangle, Plus, Search, SlidersHorizontal, ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { supabase } from "@/integrations/supabase/client";
import { countValidCachets, expiringWithin } from "@/lib/cachets";
import { applyCachetFilters, sortCachetsByDate, countActiveFilters, EMPTY_FILTERS, type CachetFilters } from "@/lib/cachetFilters";
import { AppHeader } from "@/components/app/AppHeader";
import { CachetRow, STATUS_LABEL, type PaymentRow } from "@/components/modules/cachets/CachetRow";
import { CachetFilterSheet } from "@/components/modules/cachets/CachetFilterSheet";
import { EditPaymentDrawer } from "@/components/modules/cachets/EditPaymentDrawer";
import { IntermittenceGraph } from "@/components/modules/cachets/IntermittenceGraph";
import { AddRevenueSheet } from "@/components/modules/finance/AddRevenueSheet";

export const Route = createFileRoute("/_authenticated/finance/cachets")({
  component: CachetsPage,
});

type FullPaymentRow = PaymentRow & {
  batch_id: string | null;
  batch: { batch_count: number } | null;
};

async function writeStatus(id: string, status: PaymentRow["status"]) {
  const { error } = await supabase.from("payments").update({ status }).eq("id", id);
  if (error) {
    toast.error(error.message || "Erreur lors du changement de statut");
    return;
  }
  window.dispatchEvent(new Event("mc-refresh"));
}

function CachetsPage() {
  const { profile } = useAuth();
  const isManager = profile?.role === "manager";
  const [filters, setFilters] = useState<CachetFilters>(EMPTY_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [sortAsc, setSortAsc] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editPayment, setEditPayment] = useState<FullPaymentRow | null>(null);

  const { data: allPayments, refresh } = useCollection<FullPaymentRow>("payments", {
    select: "*, batch:payment_batches(batch_count)",
    order: { column: "payment_date", ascending: false },
  });

  const cachets = useMemo(
    () => allPayments.filter((p) => p.source !== "sacem"),
    [allPayments]
  );

  const searched = useMemo(() => applyCachetFilters(cachets, filters), [cachets, filters]);
  const filtered = useMemo(() => sortCachetsByDate(searched, sortAsc), [searched, sortAsc]);

  const validCount = countValidCachets(cachets);
  const expiringSoon = expiringWithin(cachets, 60);
  const activeFilterCount = countActiveFilters(filters);

  const handleSwipeStatusChange = (payment: FullPaymentRow, next: PaymentRow["status"]) => {
    const previous = payment.status;
    writeStatus(payment.id, next);
    toast.success(`Statut → ${STATUS_LABEL[next] ?? next}`, {
      action: {
        label: "Annuler",
        onClick: () => writeStatus(payment.id, previous),
      },
    });
  };

  return (
    <>
      <AppHeader title="Cachets" backTo="/finance" />

      <div className="px-4 pt-4 pb-6 space-y-4">
        <IntermittenceGraph count={validCount} payments={cachets} />

        {expiringSoon.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2">
            <AlertTriangle
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400"
              aria-hidden="true"
            />
            <p className="text-xs text-amber-400">
              {expiringSoon.length === 1
                ? "1 cachet expire dans les 60 prochains jours"
                : `${expiringSoon.length} cachets expirent dans les 60 prochains jours`}
            </p>
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Rechercher un intitulé…"
              className="w-full rounded-full border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
            />
          </div>
          <button
            type="button"
            onClick={() => setFilterSheetOpen(true)}
            className="relative shrink-0 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-medium text-foreground"
          >
            <span className="flex items-center gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              Filtres
            </span>
            {activeFilterCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-[0.6rem] font-semibold text-background">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setSortAsc((v) => !v)}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-medium text-foreground"
          >
            {sortAsc ? (
              <ArrowUpNarrowWide className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ArrowDownWideNarrow className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Date
          </button>
        </div>

        <div className="space-y-2">
          {filtered.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Aucun cachet{activeFilterCount > 0 || filters.search ? " pour ces filtres" : ""}.
            </p>
          )}
          {filtered.map((p) => (
            <CachetRow
              key={p.id}
              payment={p}
              onClick={() => setEditPayment(p)}
              swipeEnabled={isManager}
              onSwipeStatusChange={(next) => handleSwipeStatusChange(p, next)}
            />
          ))}
        </div>
      </div>

      {isManager && (
        <button
          onClick={() => setAddOpen(true)}
          aria-label="Ajouter un cachet"
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-background shadow-lg transition active:scale-95"
        >
          <Plus className="h-6 w-6" aria-hidden="true" />
        </button>
      )}

      <AddRevenueSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={refresh}
      />

      <EditPaymentDrawer
        open={editPayment !== null}
        onOpenChange={(v) => {
          if (!v) setEditPayment(null);
        }}
        payment={editPayment}
        onSuccess={refresh}
      />

      <CachetFilterSheet
        open={filterSheetOpen}
        onOpenChange={setFilterSheetOpen}
        filters={filters}
        onChange={setFilters}
      />
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors (`Search`, `SlidersHorizontal`, `ArrowDownWideNarrow`, `ArrowUpNarrowWide` are all confirmed present in the installed `lucide-react` version).

- [ ] **Step 3: Run full test suite**

Run: `pnpm test`
Expected: same pass/fail counts as after Task 2/3 (no new failures introduced by this route file, since it has no test coverage itself).

- [ ] **Step 4: Commit**

```bash
git add src/routes/_authenticated/finance/cachets.tsx
git commit -m "feat(cachets): replace filter pills with search, multi-select filter sheet, and date sort"
```

---

### Task 13: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run: `pnpm dev`

- [ ] **Step 2: Verify swipe behavior**

Navigate to `/finance/cachets` as a manager. For a TBC cachet: swipe right → status becomes "Confirmé", toast appears with "Annuler" action; click "Annuler" → status reverts to TBC. Swipe a TBC cachet left → status becomes "Annulé" and the row disappears from the default list (since Annulé is hidden unless the Statut filter explicitly includes it). Swipe a "Payé" cachet right → no change (already at the end). Swipe an "Annulé" cachet (with the Annulé filter enabled so it's visible) right → returns to TBC.

- [ ] **Step 3: Verify filters/search/sort**

Open the Filtres sheet, select "Annulé" under Statut → cancelled cachets appear; deselect → they disappear again. Select a Territoire/Type combination and confirm the list narrows correctly (AND across groups, OR within a group). Type into the search box and confirm it matches the "Intitulé" text. Toggle the Date sort button and confirm the list order flips.

- [ ] **Step 4: Verify cross-cutting exclusions**

On `/finance/cachets`, confirm the intermittence graph and the "expire dans 60 jours" banner numbers do not change when cachets are filtered/searched (they reflect the full unfiltered dataset minus tbc/annulé). Mark a "payé" cachet as "Annulé" via swipe, then check `/finance` (dashboard) — the "reste dû" figure should no longer include that cachet's commission.

- [ ] **Step 5: Stop the dev server**

Kill the `pnpm dev` process once verification is complete.
