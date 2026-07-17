# Fees Manager: Add NDF + Search/Filter/Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a way to create `expenses` (NDF) rows from the UI — currently impossible, the 4 existing rows were inserted directly in the database — and bring `/finance/fees`'s fee list up to the same search/filter/sort UX already used on `/finance` and `/finance/cachets`.

**Architecture:** A new `AddExpenseDrawer` (single-step form, manager-only, reached via a new FAB) inserts into `expenses`. A new `src/lib/feesFilters.ts` (mirroring the existing `src/lib/cachetFilters.ts` pattern) plus a new `FeesFilterSheet` component (mirroring `CachetFilterSheet`) get wired into `ManagerFeesView`, reusing the already-shared `SearchFilterSortBar`. `ArtistFeesView` is untouched.

**Tech Stack:** TanStack Start, React 19 + TypeScript, Supabase, Tailwind v4, Vitest (scoped to `src/lib/**/*.test.ts`).

## Global Constraints

- Only `src/lib/**/*.test.ts` is covered by `vitest.config.ts` — no component/route test files.
- `computeResteDu`/`computeControlRate` in `src/lib/fees.ts` are never modified — this work only adds data-entry and list-browsing UI, it does not touch any calculation.
- Summary figures on `/finance/fees` (`resteDu`, `commissionDueTotal`, `ndfTotal`, `alreadyPaid`, `controlRate`) must keep computing from the unfiltered `filteredFees`/`expenses` — never from the search/filter/sort-narrowed list. This is the same rule already followed on `/finance` (summary cards stay stable while the list below is filtered).
- `ArtistFeesView` (the artist-role branch of the Fees page) is not touched by this plan.
- French copy throughout.

---

### Task 1: `src/lib/feesFilters.ts` — search/filter/sort for fees

**Files:**
- Create: `src/lib/feesFilters.ts`
- Create: `src/lib/__tests__/feesFilters.test.ts`

**Interfaces:**
- Consumes: nothing project-specific — a standalone lib module.
- Produces: `FeesFilters`, `EMPTY_FEES_FILTERS`, `countActiveFeesFilters`, `applyFeesFilters`, `sortFeesByDate` — Task 3 imports all five into `ManagerFeesView`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/feesFilters.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  applyFeesFilters,
  sortFeesByDate,
  countActiveFeesFilters,
  EMPTY_FEES_FILTERS,
  type FeesFilters,
} from "../feesFilters";

interface TestFee {
  id: string;
  status: string;
  payment: { notes: string | null; source: string; payment_date: string | null } | null;
}

const make = (overrides: Partial<TestFee> = {}): TestFee => ({
  id: "f1",
  status: "due",
  payment: { notes: "Concert Test", source: "booking", payment_date: "2026-01-15" },
  ...overrides,
});

describe("countActiveFeesFilters", () => {
  it("counts selected statuses", () => {
    expect(countActiveFeesFilters(EMPTY_FEES_FILTERS)).toBe(0);
    expect(countActiveFeesFilters({ search: "", statuses: ["due", "versée"] })).toBe(2);
  });
});

describe("applyFeesFilters", () => {
  it("returns all fees when filters are empty", () => {
    const fees = [make({ id: "a" }), make({ id: "b", status: "projetée" })];
    expect(applyFeesFilters(fees, EMPTY_FEES_FILTERS)).toHaveLength(2);
  });

  it("filters by status", () => {
    const fees = [make({ id: "a", status: "due" }), make({ id: "b", status: "versée" })];
    const filters: FeesFilters = { search: "", statuses: ["due"] };
    const result = applyFeesFilters(fees, filters);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
  });

  it("matches multiple selected statuses", () => {
    const fees = [
      make({ id: "a", status: "due" }),
      make({ id: "b", status: "versée" }),
      make({ id: "c", status: "projetée" }),
    ];
    const filters: FeesFilters = { search: "", statuses: ["due", "versée"] };
    expect(applyFeesFilters(fees, filters).map((f) => f.id)).toEqual(["a", "b"]);
  });

  it("searches by payment notes, case/accent-insensitive", () => {
    const fees = [make({ payment: { notes: "Concert à Toulouse", source: "booking", payment_date: null } })];
    expect(applyFeesFilters(fees, { search: "toulouse", statuses: [] })).toHaveLength(1);
    expect(applyFeesFilters(fees, { search: "TOULOUSE", statuses: [] })).toHaveLength(1);
    expect(applyFeesFilters(fees, { search: "nantes", statuses: [] })).toHaveLength(0);
  });

  it("falls back to payment source when notes is null", () => {
    const fees = [make({ payment: { notes: null, source: "label", payment_date: null } })];
    expect(applyFeesFilters(fees, { search: "label", statuses: [] })).toHaveLength(1);
  });

  it("returns empty when payment is null and search is non-empty", () => {
    const fees = [make({ payment: null })];
    expect(applyFeesFilters(fees, { search: "concert", statuses: [] })).toHaveLength(0);
  });
});

describe("sortFeesByDate", () => {
  it("sorts descending by default (ascending=false)", () => {
    const fees = [
      make({ id: "old", payment: { notes: null, source: "booking", payment_date: "2025-01-01" } }),
      make({ id: "new", payment: { notes: null, source: "booking", payment_date: "2026-01-01" } }),
    ];
    expect(sortFeesByDate(fees, false).map((f) => f.id)).toEqual(["new", "old"]);
  });

  it("sorts ascending when requested", () => {
    const fees = [
      make({ id: "new", payment: { notes: null, source: "booking", payment_date: "2026-01-01" } }),
      make({ id: "old", payment: { notes: null, source: "booking", payment_date: "2025-01-01" } }),
    ];
    expect(sortFeesByDate(fees, true).map((f) => f.id)).toEqual(["old", "new"]);
  });

  it("treats null payment_date as earliest", () => {
    const fees = [
      make({ id: "dated", payment: { notes: null, source: "booking", payment_date: "2026-01-01" } }),
      make({ id: "nodate", payment: null }),
    ];
    expect(sortFeesByDate(fees, true).map((f) => f.id)).toEqual(["nodate", "dated"]);
  });

  it("does not mutate the input array", () => {
    const fees = [
      make({ id: "a", payment: { notes: null, source: "booking", payment_date: "2025-01-01" } }),
      make({ id: "b", payment: { notes: null, source: "booking", payment_date: "2026-01-01" } }),
    ];
    const original = [...fees];
    sortFeesByDate(fees, true);
    expect(fees).toEqual(original);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/lib/__tests__/feesFilters.test.ts`
Expected: FAIL — `Cannot find module '../feesFilters'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/feesFilters.ts`. Its `normalizeForSearch` is copied verbatim from the existing `src/lib/cachetFilters.ts` (same accent/case-insensitive search behavior, same regex — do not retype the combining-diacritics character by hand, copy-paste this exact code block):

```ts
export interface FeesFilters {
  search: string;
  statuses: string[];
}

export const EMPTY_FEES_FILTERS: FeesFilters = { search: "", statuses: [] };

export function countActiveFeesFilters(filters: FeesFilters): number {
  return filters.statuses.length;
}

function normalizeForSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

interface FeeForFilter {
  status: string;
  payment: { notes: string | null; source: string } | null;
}

export function applyFeesFilters<T extends FeeForFilter>(
  fees: T[],
  filters: FeesFilters
): T[] {
  const search = normalizeForSearch(filters.search.trim());

  return fees.filter((f) => {
    if (filters.statuses.length > 0 && !filters.statuses.includes(f.status)) {
      return false;
    }

    if (search) {
      const label = f.payment?.notes ?? f.payment?.source ?? "";
      if (!normalizeForSearch(label).includes(search)) return false;
    }

    return true;
  });
}

interface FeeForSort {
  payment: { payment_date: string | null } | null;
}

export function sortFeesByDate<T extends FeeForSort>(
  fees: T[],
  ascending: boolean
): T[] {
  return [...fees].sort((a, b) => {
    const ta = a.payment?.payment_date ? new Date(a.payment.payment_date).getTime() : 0;
    const tb = b.payment?.payment_date ? new Date(b.payment.payment_date).getTime() : 0;
    return ascending ? ta - tb : tb - ta;
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/lib/__tests__/feesFilters.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Verify no regressions**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

Run: `pnpm exec vitest run`
Expected: all tests pass (this task adds a file, touches nothing existing).

- [ ] **Step 6: Commit**

```bash
git add src/lib/feesFilters.ts src/lib/__tests__/feesFilters.test.ts
git commit -m "feat(fees): add search/filter/sort lib for the fees list"
```

---

### Task 2: `AddExpenseDrawer` and `FeesFilterSheet` components

**Files:**
- Create: `src/components/modules/fees/AddExpenseDrawer.tsx`
- Create: `src/components/modules/fees/FeesFilterSheet.tsx`

**Interfaces:**
- Consumes: `FeesFilters` type from `@/lib/feesFilters` (Task 1) — used by `FeesFilterSheet`'s props.
- Produces: `AddExpenseDrawer` (props `{ open, onOpenChange, onSuccess? }`) and `FeesFilterSheet` (props `{ open, onOpenChange, filters, onChange }`) — both imported by Task 3's `ManagerFeesView`.

- [ ] **Step 1: Write `AddExpenseDrawer`**

Create `src/components/modules/fees/AddExpenseDrawer.tsx`:

```tsx
import { useState } from "react";
import { toast } from "sonner";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

type ExpenseStatus = "à_rembourser" | "remboursée";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: () => void;
}

export function AddExpenseDrawer({ open, onOpenChange, onSuccess }: Props) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ExpenseStatus>("à_rembourser");
  const [busy, setBusy] = useState(false);

  function reset() {
    setAmount("");
    setDescription("");
    setStatus("à_rembourser");
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = parseFloat(amount);
    if (!v || v <= 0) return toast.error("Montant invalide");
    if (!description.trim()) return toast.error("Description requise");

    setBusy(true);
    try {
      const { error } = await supabase.from("expenses").insert({
        amount: v,
        description: description.trim(),
        status,
        payment_id: null,
      });
      if (error) throw error;

      toast.success("Dépense ajoutée");
      reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de l'ajout");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="font-display text-xl">Ajouter une dépense</DrawerTitle>
        </DrawerHeader>
        <form onSubmit={submit} className="px-4 pb-8 space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="expense-amount">Montant (€)</Label>
            <Input
              id="expense-amount"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expense-description">Description</Label>
            <Input
              id="expense-description"
              placeholder="ex: Paiement musicien"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label>Statut</Label>
            <div className="flex gap-2">
              {(
                [
                  { value: "à_rembourser", label: "À rembourser" },
                  { value: "remboursée", label: "Remboursée" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStatus(opt.value)}
                  className={`flex-1 rounded-full border py-2 text-xs font-medium transition ${
                    status === opt.value
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <Button type="submit" className="w-full rounded-full" size="lg" disabled={busy}>
            {busy ? "Ajout…" : "Ajouter"}
          </Button>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 2: Write `FeesFilterSheet`**

Create `src/components/modules/fees/FeesFilterSheet.tsx`:

```tsx
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import type { FeesFilters } from "@/lib/feesFilters";

const STATUS_OPTIONS = [
  { value: "projetée", label: "Projetée" },
  { value: "due", label: "Due" },
  { value: "versée", label: "Versée" },
] as const;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  filters: FeesFilters;
  onChange: (filters: FeesFilters) => void;
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function FeesFilterSheet({ open, onOpenChange, filters, onChange }: Props) {
  const reset = () => onChange({ ...filters, statuses: [] });

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
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Statut</p>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onChange({ ...filters, statuses: toggle(filters.statuses, opt.value) })}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                    filters.statuses.includes(opt.value)
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 3: Verify it builds**

Run: `pnpm exec tsc --noEmit`
Expected: no errors. (No test files for these two components — presentational/data-entry components, matching every other drawer/sheet in this codebase.)

- [ ] **Step 4: Commit**

```bash
git add src/components/modules/fees/AddExpenseDrawer.tsx src/components/modules/fees/FeesFilterSheet.tsx
git commit -m "feat(fees): add AddExpenseDrawer and FeesFilterSheet components"
```

---

### Task 3: Wire search/filter/sort + Add NDF into `/finance/fees`

**Files:**
- Modify: `src/routes/_authenticated/finance/fees.tsx`

**Interfaces:**
- Consumes: `SearchFilterSortBar` (`@/components/app/SearchFilterSortBar`, pre-existing, already used on `/finance` and `/finance/cachets`); `FeesFilters`, `EMPTY_FEES_FILTERS`, `applyFeesFilters`, `sortFeesByDate`, `countActiveFeesFilters` from `@/lib/feesFilters` (Task 1); `AddExpenseDrawer`, `FeesFilterSheet` (Task 2).
- Produces: nothing consumed elsewhere — this is the last task.

- [ ] **Step 1: Replace `ManagerFeesView` in the file**

In `src/routes/_authenticated/finance/fees.tsx`, replace the imports at the top of the file — from:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { computeResteDu, computeControlRate } from "@/lib/fees";
import { AppHeader } from "@/components/app/AppHeader";
import { FeeLine, type FeeLineData } from "@/components/modules/fees/FeeLine";
import { VersementDrawer } from "@/components/modules/fees/VersementDrawer";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
```

to:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { computeResteDu, computeControlRate } from "@/lib/fees";
import {
  applyFeesFilters,
  sortFeesByDate,
  countActiveFeesFilters,
  EMPTY_FEES_FILTERS,
  type FeesFilters,
} from "@/lib/feesFilters";
import { AppHeader } from "@/components/app/AppHeader";
import { SearchFilterSortBar } from "@/components/app/SearchFilterSortBar";
import { FeeLine, type FeeLineData } from "@/components/modules/fees/FeeLine";
import { VersementDrawer } from "@/components/modules/fees/VersementDrawer";
import { AddExpenseDrawer } from "@/components/modules/fees/AddExpenseDrawer";
import { FeesFilterSheet } from "@/components/modules/fees/FeesFilterSheet";
import { supabase } from "@/integrations/supabase/client";
```

Then replace the entire `ManagerFeesView` function with:

```tsx
function ManagerFeesView() {
  const { profile } = useAuth();
  const [versementOpen, setVersementOpen] = useState(false);
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [filters, setFilters] = useState<FeesFilters>(EMPTY_FEES_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [sortAsc, setSortAsc] = useState(false);

  const { data: fees, refresh: refreshFees } = useCollection<FeeLineData>("management_fees", {
    select: "*, payment:payments(notes, source, amount, payment_date, deductible_expenses)",
    order: { column: "created_at", ascending: false },
  });

  const { data: expenses, refresh: refreshExpenses } = useCollection<ExpenseRow>("expenses", {
    order: { column: "created_at", ascending: false },
  });

  const commissionStart = profile?.commission_start_date ?? "2025-01-01";

  const filteredFees = useMemo(
    () =>
      fees.filter((f) => {
        const payDate = f.payment?.payment_date;
        return !payDate || payDate >= commissionStart;
      }),
    [fees, commissionStart]
  );

  const resteDu = computeResteDu(filteredFees, expenses);
  const totalEncaisse = filteredFees.reduce((sum, f) => sum + (f.payment?.amount ?? 0), 0);
  const controlRate = computeControlRate(filteredFees, totalEncaisse);

  const commissionDueTotal = filteredFees
    .filter((f) => f.status === "due")
    .reduce((sum, f) => sum + f.commission_due, 0);
  const ndfTotal = expenses
    .filter((e) => e.status === "à_rembourser")
    .reduce((sum, e) => sum + e.amount, 0);
  const alreadyPaid = filteredFees.reduce((sum, f) => sum + f.already_paid_to_manager, 0);

  const searched = useMemo(() => applyFeesFilters(filteredFees, filters), [filteredFees, filters]);
  const displayedFees = useMemo(() => sortFeesByDate(searched, sortAsc), [searched, sortAsc]);
  const activeFilterCount = countActiveFeesFilters(filters);

  return (
    <>
      <AppHeader title="Fees" subtitle={`depuis ${commissionStart}`} backTo="/finance" />

      <div className="px-4 pt-4 pb-24 space-y-4">
        {/* Hero card */}
        <div className="rounded-2xl border border-border bg-card px-5 py-4 space-y-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Reste dû
            </p>
            <p className="mt-1 font-display text-5xl font-bold text-foreground">
              {resteDu.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
            </p>
          </div>

          {/* Breakdown */}
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/50 p-3 text-xs">
            <div>
              <p className="text-muted-foreground">Commission due</p>
              <p className="mt-0.5 font-semibold text-amber-400">
                {commissionDueTotal.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">NDF</p>
              <p className="mt-0.5 font-semibold text-foreground">
                {ndfTotal.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Déjà versé</p>
              <p className="mt-0.5 font-semibold text-green-400">
                {alreadyPaid.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
              </p>
            </div>
          </div>

          {/* Control rate */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              Taux de contrôle · total encaissé{" "}
              {totalEncaisse.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
            </span>
            <span className="font-semibold text-foreground">
              {(controlRate * 100).toFixed(1)} %
            </span>
          </div>

          <button
            onClick={() => setVersementOpen(true)}
            className="w-full rounded-full border border-border bg-background py-2.5 text-sm font-medium text-foreground transition hover:bg-muted"
          >
            Enregistrer un versement
          </button>
        </div>

        <SearchFilterSortBar
          search={filters.search}
          onSearchChange={(value) => setFilters((f) => ({ ...f, search: value }))}
          activeFilterCount={activeFilterCount}
          onFilterClick={() => setFilterSheetOpen(true)}
          sortAsc={sortAsc}
          onSortToggle={() => setSortAsc((v) => !v)}
        />

        {/* Fee lines */}
        <div className="space-y-2">
          {displayedFees.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Aucune ligne de commission{activeFilterCount > 0 || filters.search ? " pour ces filtres" : ""}.
            </p>
          )}
          {displayedFees.map((f) => (
            <FeeLine key={f.id} fee={f} />
          ))}
        </div>
      </div>

      <button
        onClick={() => setAddExpenseOpen(true)}
        aria-label="Ajouter une dépense"
        className="fixed bottom-[max(env(safe-area-inset-bottom),1rem)] right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-foreground text-background shadow-lg transition active:scale-95"
      >
        <Plus className="h-6 w-6" />
      </button>

      <VersementDrawer
        open={versementOpen}
        onOpenChange={setVersementOpen}
        totalDue={resteDu}
        onSuccess={() => { refreshFees(); refreshExpenses(); }}
      />

      <AddExpenseDrawer
        open={addExpenseOpen}
        onOpenChange={setAddExpenseOpen}
        onSuccess={refreshExpenses}
      />

      <FeesFilterSheet
        open={filterSheetOpen}
        onOpenChange={setFilterSheetOpen}
        filters={filters}
        onChange={setFilters}
      />
    </>
  );
}
```

Everything else in the file (`ExpenseRow`/`ArtistSummary` interfaces, `ArtistFeesView`, `FeesPage`) is unchanged — copy it verbatim from the current file.

- [ ] **Step 2: Verify it builds**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

Run: `pnpm build`
Expected: build succeeds.

Run: `pnpm exec vitest run`
Expected: all tests pass (this task touches no `src/lib` file).

- [ ] **Step 3: Commit**

```bash
git add src/routes/_authenticated/finance/fees.tsx
git commit -m "feat(fees): wire search/filter/sort and Add NDF FAB into the fees page"
```
