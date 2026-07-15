# Finance page parity with Cachets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the Cachets page's swipe-to-change-status, search/filter-sheet/sort, and click-to-edit to the global Finance page, while keeping SACEM entries (which now have a separate `payment_lines`-based commission model) visible but non-interactive.

**Architecture:** Extract two currently cachets-page-only pieces into shared components — the swipe gesture (`SwipeableRow`) and the search/filter/sort bar (`SearchFilterSortBar`) — plus move the status-order logic (`nextStatus`/`previousStatus`/`STATUS_LABEL`) and the `writePaymentStatus` Supabase helper from `CachetRow.tsx` into `src/lib/cachets.ts`, the project's existing shared "payment status" library. `CachetRow.tsx` and `cachets.tsx` are refactored to consume the shared pieces with no behavior change (verified before touching `RevenueLine.tsx`/`finance/index.tsx`). `CachetFilterSheet` gains a configurable `sourceOptions` prop so Finance can add a 10th "SACEM" filter option that Cachets doesn't need.

**Tech Stack:** TanStack Start + React 19 + TypeScript, `framer-motion` (already installed), Vitest (`src/lib/**/*.test.ts` only — no DOM/component test setup in this project).

## Global Constraints

- SACEM-sourced payments (`source === "sacem"`) must never be swipeable or clickable on the Finance page — rendered as a plain non-interactive `<div>`, not a `<button>`.
- The old Finance filter pills (Tous/Cachets/Tracks/Label/À venir) are fully removed. "À venir" is not reimplemented as a filter — selecting TBC/Confirmé in the Statut filter covers the same need.
- Every extraction (`SwipeableRow`, `SearchFilterSortBar`, moving status logic to `src/lib/cachets.ts`) must produce **zero behavior change** on the Cachets page — verify this before starting the Finance-specific work (Task 8 onward).
- No new automated tests outside `src/lib/**/*.test.ts` — this project's `vitest.config.ts` only covers that glob.
- Reuse existing visual patterns exactly (chip button classNames, `Drawer`/`DrawerContent` from `@/components/ui/drawer`) — no new styling decisions.
- Swipe and click-to-edit are manager-only (`isManager` gating), matching the existing Cachets pattern.

---

### Task 1: Move status logic + `writePaymentStatus` to `src/lib/cachets.ts` (TDD)

**Files:**
- Modify: `src/lib/cachets.ts`
- Test: `src/lib/__tests__/cachets.test.ts`

**Interfaces:**
- Produces: `STATUS_LABEL: Record<string, string>`, `nextStatus(status: PaymentForCachets["status"]): PaymentForCachets["status"] | null`, `previousStatus(status): PaymentForCachets["status"] | null`, `writePaymentStatus(id: string, status: PaymentForCachets["status"]): Promise<void>` — all exported from `src/lib/cachets.ts`. Consumed by Tasks 3, 4, 8, 9.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/__tests__/cachets.test.ts`, changing the import line at the top:

Current:
```ts
import { countValidCachets, expiringWithin } from "../cachets";
```

Change to:
```ts
import { countValidCachets, expiringWithin, nextStatus, previousStatus } from "../cachets";
```

Add this new `describe` block at the end of the file (after the `expiringWithin` block's closing `});`):

```ts

describe("nextStatus / previousStatus", () => {
  it("orders annulé < provisoire < cachet_en_attente < facturé < payé", () => {
    expect(nextStatus("annulé")).toBe("provisoire");
    expect(nextStatus("provisoire")).toBe("cachet_en_attente");
    expect(nextStatus("cachet_en_attente")).toBe("facturé");
    expect(nextStatus("facturé")).toBe("payé");
    expect(nextStatus("payé")).toBe(null);
  });

  it("treats tbc as an alias for provisoire", () => {
    expect(nextStatus("tbc")).toBe("cachet_en_attente");
    expect(previousStatus("tbc")).toBe("annulé");
  });

  it("clamps at both ends", () => {
    expect(nextStatus("payé")).toBe(null);
    expect(previousStatus("annulé")).toBe(null);
  });

  it("previousStatus mirrors nextStatus", () => {
    expect(previousStatus("payé")).toBe("facturé");
    expect(previousStatus("facturé")).toBe("cachet_en_attente");
    expect(previousStatus("cachet_en_attente")).toBe("provisoire");
    expect(previousStatus("provisoire")).toBe("annulé");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/__tests__/cachets.test.ts`
Expected: FAIL — `nextStatus`/`previousStatus` are not exported from `../cachets` yet.

- [ ] **Step 3: Implement the status logic + `writePaymentStatus`**

In `src/lib/cachets.ts`, change the top imports from:

```ts
import { addDays, addYears } from "date-fns";
```

to:

```ts
import { addDays, addYears } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
```

Then insert this new block immediately after the `cachetCountFor` function (i.e. right before the `// ── Projection ────────────────────────────────────────────────` comment):

```ts
// ── Status ────────────────────────────────────────────────────

export const STATUS_LABEL: Record<string, string> = {
  provisoire: "TBC",
  facturé: "Facturé",
  cachet_en_attente: "Confirmé",
  payé: "Payé",
  tbc: "TBC",
  annulé: "Annulé",
};

const STATUS_ORDER = ["annulé", "provisoire", "cachet_en_attente", "facturé", "payé"] as const;

function orderIndex(status: PaymentForCachets["status"]): number {
  const normalized = status === "tbc" ? "provisoire" : status;
  return STATUS_ORDER.indexOf(normalized as (typeof STATUS_ORDER)[number]);
}

export function nextStatus(status: PaymentForCachets["status"]): PaymentForCachets["status"] | null {
  const i = orderIndex(status);
  if (i === -1 || i >= STATUS_ORDER.length - 1) return null;
  return STATUS_ORDER[i + 1];
}

export function previousStatus(status: PaymentForCachets["status"]): PaymentForCachets["status"] | null {
  const i = orderIndex(status);
  if (i <= 0) return null;
  return STATUS_ORDER[i - 1];
}

export async function writePaymentStatus(id: string, status: PaymentForCachets["status"]) {
  const { error } = await supabase.from("payments").update({ status }).eq("id", id);
  if (error) {
    toast.error(error.message || "Erreur lors du changement de statut");
    return;
  }
  window.dispatchEvent(new Event("mc-refresh"));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/__tests__/cachets.test.ts`
Expected: all tests in this file PASS, including the new `nextStatus / previousStatus` block.

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors (nothing consumes the new exports yet, this just confirms the file itself compiles — in particular that the `@/integrations/supabase/client` import resolves).

- [ ] **Step 6: Commit**

```bash
git add src/lib/cachets.ts src/lib/__tests__/cachets.test.ts
git commit -m "feat(cachets): move status order logic and writePaymentStatus into lib/cachets"
```

---

### Task 2: `SwipeableRow` — extract the swipe gesture into a shared component

**Files:**
- Create: `src/components/app/SwipeableRow.tsx`

**Interfaces:**
- Produces: `SwipeableRow` component, props `{ children: React.ReactNode; swipeEnabled?: boolean; onClick?: () => void; nextLabel: string | null; prevLabel: string | null; onCommitRight?: () => void; onCommitLeft?: () => void; }`. Consumed by Tasks 3 and 8.
- This is a direct, faithful extraction of the swipeable branch currently inside `CachetRow.tsx` (lines ~169–226) — same thresholds, same tap/drag disambiguation, same visual reveal labels. No new behavior.

- [ ] **Step 1: Create the component**

```tsx
import { useRef } from "react";
import { motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";

const COMMIT_DISTANCE = 160;
const COMMIT_VELOCITY = 900;

interface SwipeableRowProps {
  children: React.ReactNode;
  swipeEnabled?: boolean;
  onClick?: () => void;
  /** Label shown when swiping right; null = at the end of the sequence, swipe right does nothing. */
  nextLabel: string | null;
  /** Label shown when swiping left; null = at the start of the sequence, swipe left does nothing. */
  prevLabel: string | null;
  onCommitRight?: () => void;
  onCommitLeft?: () => void;
}

export function SwipeableRow({
  children,
  swipeEnabled = false,
  onClick,
  nextLabel,
  prevLabel,
  onCommitRight,
  onCommitLeft,
}: SwipeableRowProps) {
  const hasDraggedRef = useRef(false);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-8, 8]);
  const rightLabelOpacity = useTransform(x, [0, COMMIT_DISTANCE], [0, 1]);
  const leftLabelOpacity = useTransform(x, [-COMMIT_DISTANCE, 0], [1, 0]);

  const handleDragEnd = (_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    const { offset, velocity } = info;
    const commitRight = offset.x > COMMIT_DISTANCE || velocity.x > COMMIT_VELOCITY;
    const commitLeft = offset.x < -COMMIT_DISTANCE || velocity.x < -COMMIT_VELOCITY;

    if (commitRight && nextLabel) {
      onCommitRight?.();
    } else if (commitLeft && prevLabel) {
      onCommitLeft?.();
    }
  };

  if (!swipeEnabled) {
    return (
      <button
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition active:scale-[0.98]"
      >
        {children}
      </button>
    );
  }

  return (
    <div className="relative">
      {nextLabel && (
        <motion.div
          style={{ opacity: rightLabelOpacity }}
          className="absolute inset-0 flex items-center justify-start rounded-xl bg-green-500/20 px-4"
          aria-hidden="true"
        >
          <span className="text-xs font-semibold text-green-400">→ {nextLabel}</span>
        </motion.div>
      )}
      {prevLabel && (
        <motion.div
          style={{ opacity: leftLabelOpacity }}
          className="absolute inset-0 flex items-center justify-end rounded-xl bg-red-500/20 px-4"
          aria-hidden="true"
        >
          <span className="text-xs font-semibold text-red-400">{prevLabel} ←</span>
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
        onDragStart={() => {
          hasDraggedRef.current = true;
        }}
        onDragEnd={handleDragEnd}
        onTap={() => {
          if (hasDraggedRef.current) {
            hasDraggedRef.current = false;
            return;
          }
          onClick?.();
        }}
        className="relative flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left"
      >
        {children}
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
git add src/components/app/SwipeableRow.tsx
git commit -m "feat: extract SwipeableRow, a generic swipe-to-change-status row"
```

---

### Task 3: Refactor `CachetRow.tsx` to use `SwipeableRow` + shared status logic

**Files:**
- Modify: `src/components/modules/cachets/CachetRow.tsx`

**Interfaces:**
- Consumes: `SwipeableRow` (Task 2), `STATUS_LABEL`/`nextStatus`/`previousStatus` from `@/lib/cachets` (Task 1).
- Produces: same public API as before (`CachetRow` component, `PaymentRow` type) — `STATUS_LABEL`/`nextStatus`/`previousStatus` are **no longer exported from this file** (moved to `@/lib/cachets` in Task 1; Task 4 updates the one consumer of the old export path).
- This task must produce **zero visual or behavioral change** — it's a pure refactor.

- [ ] **Step 1: Replace the full file**

Replace the entire contents of `src/components/modules/cachets/CachetRow.tsx` with:

```tsx
import { format, differenceInDays } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertTriangle } from "lucide-react";
import { BatchBadge } from "./BatchBadge";
import { SwipeableRow } from "@/components/app/SwipeableRow";
import { HOURS_PER_CACHET, STATUS_LABEL, nextStatus, previousStatus } from "@/lib/cachets";

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

const STATUS_CLASS: Record<string, string> = {
  provisoire: "text-muted-foreground bg-muted",
  facturé: "text-blue-400 bg-blue-400/10",
  cachet_en_attente: "text-amber-400 bg-amber-400/10",
  payé: "text-green-400 bg-green-400/10",
  tbc: "text-muted-foreground bg-muted",
  annulé: "text-red-400 bg-red-400/10",
};

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

  return (
    <SwipeableRow
      swipeEnabled={swipeEnabled}
      onClick={onClick}
      nextLabel={next ? STATUS_LABEL[next] : null}
      prevLabel={prev ? STATUS_LABEL[prev] : null}
      onCommitRight={() => next && onSwipeStatusChange?.(next)}
      onCommitLeft={() => prev && onSwipeStatusChange?.(prev)}
    >
      {content}
    </SwipeableRow>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: errors on `src/routes/_authenticated/finance/cachets.tsx` (it still imports `STATUS_LABEL` from this file) — this is expected and fixed in Task 4. Confirm there are no OTHER errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/modules/cachets/CachetRow.tsx
git commit -m "refactor(cachets): CachetRow uses shared SwipeableRow and lib/cachets status logic"
```

---

### Task 4: Update `cachets.tsx` route to import status logic from `lib/cachets`

**Files:**
- Modify: `src/routes/_authenticated/finance/cachets.tsx`

**Interfaces:**
- Consumes: `STATUS_LABEL`, `writePaymentStatus` from `@/lib/cachets` (Task 1).
- Fixes the typecheck error left by Task 3. Must produce **zero behavior change**.

- [ ] **Step 1: Update imports**

Current:

```ts
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { supabase } from "@/integrations/supabase/client";
import { countValidCachets, expiringWithin } from "@/lib/cachets";
import { applyCachetFilters, sortCachetsByDate, countActiveFilters, EMPTY_FILTERS, type CachetFilters } from "@/lib/cachetFilters";
import { AppHeader } from "@/components/app/AppHeader";
import { CachetRow, STATUS_LABEL, type PaymentRow } from "@/components/modules/cachets/CachetRow";
```

Change to:

```ts
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { countValidCachets, expiringWithin, STATUS_LABEL, writePaymentStatus } from "@/lib/cachets";
import { applyCachetFilters, sortCachetsByDate, countActiveFilters, EMPTY_FILTERS, type CachetFilters } from "@/lib/cachetFilters";
import { AppHeader } from "@/components/app/AppHeader";
import { CachetRow, type PaymentRow } from "@/components/modules/cachets/CachetRow";
```

(The `supabase` import is removed entirely — it was only used by the local `writeStatus` function, which this task also removes.)

- [ ] **Step 2: Remove the local `writeStatus` function and use `writePaymentStatus` instead**

Current:

```ts
async function writeStatus(id: string, status: PaymentRow["status"]) {
  const { error } = await supabase.from("payments").update({ status }).eq("id", id);
  if (error) {
    toast.error(error.message || "Erreur lors du changement de statut");
    return;
  }
  window.dispatchEvent(new Event("mc-refresh"));
}

function CachetsPage() {
```

Change to:

```ts
function CachetsPage() {
```

Then, inside `CachetsPage`, current:

```ts
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
```

Change to:

```ts
  const handleSwipeStatusChange = (payment: FullPaymentRow, next: PaymentRow["status"]) => {
    const previous = payment.status;
    writePaymentStatus(payment.id, next);
    toast.success(`Statut → ${STATUS_LABEL[next] ?? next}`, {
      action: {
        label: "Annuler",
        onClick: () => writePaymentStatus(payment.id, previous),
      },
    });
  };
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors anywhere.

- [ ] **Step 4: Run tests**

Run: `pnpm test`
Expected: same baseline as after Task 1 (this route has no test file of its own).

- [ ] **Step 5: Manual smoke check**

This task (plus Tasks 2–3) must not change Cachets page behavior. Run `pnpm dev`, open `/finance/cachets`, and confirm the page loads without console errors (full interactive swipe verification with real data happens in Task 10 — this is just a quick sanity check that the refactor didn't break the route).

- [ ] **Step 6: Commit**

```bash
git add src/routes/_authenticated/finance/cachets.tsx
git commit -m "refactor(cachets): route uses writePaymentStatus/STATUS_LABEL from lib/cachets"
```

---

### Task 5: `SearchFilterSortBar` — extract the search/filter/sort row

**Files:**
- Create: `src/components/app/SearchFilterSortBar.tsx`

**Interfaces:**
- Produces: `SearchFilterSortBar` component, props `{ search: string; onSearchChange: (value: string) => void; activeFilterCount: number; onFilterClick: () => void; sortAsc: boolean; onSortToggle: () => void; searchPlaceholder?: string; }`. Consumed by Tasks 6 and 9.
- Direct, faithful extraction of the search/filter/sort row currently inline in `cachets.tsx` (lines ~93–134). No new behavior.

- [ ] **Step 1: Create the component**

```tsx
import { Search, SlidersHorizontal, ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";

interface Props {
  search: string;
  onSearchChange: (value: string) => void;
  activeFilterCount: number;
  onFilterClick: () => void;
  sortAsc: boolean;
  onSortToggle: () => void;
  searchPlaceholder?: string;
}

export function SearchFilterSortBar({
  search,
  onSearchChange,
  activeFilterCount,
  onFilterClick,
  sortAsc,
  onSortToggle,
  searchPlaceholder = "Rechercher un intitulé…",
}: Props) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded-full border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
        />
      </div>
      <button
        type="button"
        onClick={onFilterClick}
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
        onClick={onSortToggle}
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
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/app/SearchFilterSortBar.tsx
git commit -m "feat: extract SearchFilterSortBar, a generic search+filter+sort row"
```

---

### Task 6: Update `cachets.tsx` to use `SearchFilterSortBar`

**Files:**
- Modify: `src/routes/_authenticated/finance/cachets.tsx`

**Interfaces:**
- Consumes: `SearchFilterSortBar` (Task 5). Must produce **zero visual or behavioral change**.

- [ ] **Step 1: Update the lucide-react import**

Current:

```ts
import { AlertTriangle, Plus, Search, SlidersHorizontal, ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
```

Change to:

```ts
import { AlertTriangle, Plus } from "lucide-react";
```

Add a new import line right after the `AppHeader` import:

```ts
import { AppHeader } from "@/components/app/AppHeader";
import { SearchFilterSortBar } from "@/components/app/SearchFilterSortBar";
```

- [ ] **Step 2: Replace the inline search/filter/sort JSX**

Current (the whole block between the "expiringSoon" alert and the cachet list):

```tsx
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
```

Change to:

```tsx
        <SearchFilterSortBar
          search={filters.search}
          onSearchChange={(value) => setFilters((f) => ({ ...f, search: value }))}
          activeFilterCount={activeFilterCount}
          onFilterClick={() => setFilterSheetOpen(true)}
          sortAsc={sortAsc}
          onSortToggle={() => setSortAsc((v) => !v)}
        />
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual smoke check**

Run `pnpm dev`, open `/finance/cachets`, confirm the search/filter/sort row still renders and behaves identically (search filters the list, filter button opens the sheet with a badge count, sort button toggles the arrow icon and list order).

- [ ] **Step 4: Commit**

```bash
git add src/routes/_authenticated/finance/cachets.tsx
git commit -m "refactor(cachets): use shared SearchFilterSortBar"
```

---

### Task 7: `CachetFilterSheet.tsx` — configurable `sourceOptions`

**Files:**
- Modify: `src/components/modules/cachets/CachetFilterSheet.tsx`

**Interfaces:**
- Produces: new optional prop `sourceOptions?: readonly { value: string; label: string }[]` on `CachetFilterSheet`. Defaults to the current 9 options when omitted (Cachets page passes nothing, behavior unchanged). Consumed by Task 9 (Finance page passes 10 options including SACEM).

- [ ] **Step 1: Rename the constant and add the prop**

Current:

```ts
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
```

Change to:

```ts
const DEFAULT_SOURCE_OPTIONS = [
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
  sourceOptions?: readonly { value: string; label: string }[];
}
```

- [ ] **Step 2: Use the prop (with default) in the component**

Current:

```ts
export function CachetFilterSheet({ open, onOpenChange, filters, onChange }: Props) {
  const reset = () => onChange({ ...filters, statuses: [], territories: [], sources: [] });
```

Change to:

```ts
export function CachetFilterSheet({ open, onOpenChange, filters, onChange, sourceOptions }: Props) {
  const reset = () => onChange({ ...filters, statuses: [], territories: [], sources: [] });
  const typeOptions = sourceOptions ?? DEFAULT_SOURCE_OPTIONS;
```

Current:

```tsx
          <FilterGroup
            label="Type"
            options={SOURCE_OPTIONS}
            selected={filters.sources}
            onToggle={(v) => onChange({ ...filters, sources: toggle(filters.sources, v) })}
          />
```

Change to:

```tsx
          <FilterGroup
            label="Type"
            options={typeOptions}
            selected={filters.sources}
            onToggle={(v) => onChange({ ...filters, sources: toggle(filters.sources, v) })}
          />
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual smoke check**

Run `pnpm dev`, open `/finance/cachets`, open the filter sheet, confirm the Type group still shows the same 9 options (no `sourceOptions` is passed from this page yet — Task 9 is the first caller to pass a custom list).

- [ ] **Step 5: Commit**

```bash
git add src/components/modules/cachets/CachetFilterSheet.tsx
git commit -m "feat(cachets): make CachetFilterSheet's Type options configurable"
```

---

### Task 8: `RevenueLine.tsx` — swipe, click-to-edit, `interactive` prop

**Files:**
- Modify: `src/components/modules/finance/RevenueLine.tsx`

**Interfaces:**
- Consumes: `SwipeableRow` (Task 2), `STATUS_LABEL`/`nextStatus`/`previousStatus` from `@/lib/cachets` (Task 1).
- Produces: new props on `RevenueLine`: `interactive?: boolean` (default `true`), `swipeEnabled?: boolean` (default `false`), `onSwipeStatusChange?: (next: RevenueLineData["status"]) => void`. `RevenueLineData.status` widens to include `"tbc"`.

- [ ] **Step 1: Replace the full file**

Replace the entire contents of `src/components/modules/finance/RevenueLine.tsx` with:

```tsx
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { SwipeableRow } from "@/components/app/SwipeableRow";
import { STATUS_LABEL, nextStatus, previousStatus } from "@/lib/cachets";

export interface RevenueLineData {
  id: string;
  notes: string | null;
  source: "label" | "booking" | "clip" | "track" | "résidence" | "figuration" | "sacem";
  amount: number;
  payment_date: string | null;
  status: "provisoire" | "facturé" | "cachet_en_attente" | "payé" | "tbc" | "annulé";
}

const SOURCE_LABEL: Record<string, string> = {
  booking: "Cachet",
  sacem: "SACEM",
  label: "Label",
  clip: "Clip",
  résidence: "Résidence",
  figuration: "Figuration",
  track: "Track",
};

const STATUS_CLASS: Record<string, string> = {
  provisoire: "text-amber-400 bg-amber-400/10",
  facturé: "text-blue-400 bg-blue-400/10",
  cachet_en_attente: "text-amber-400 bg-amber-400/10",
  payé: "text-green-400 bg-green-400/10",
  tbc: "text-amber-400 bg-amber-400/10",
  annulé: "text-red-400 bg-red-400/10",
};

export function RevenueLine({
  revenue,
  onClick,
  interactive = true,
  swipeEnabled = false,
  onSwipeStatusChange,
}: {
  revenue: RevenueLineData;
  onClick?: () => void;
  interactive?: boolean;
  swipeEnabled?: boolean;
  onSwipeStatusChange?: (next: RevenueLineData["status"]) => void;
}) {
  const content = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {revenue.notes ?? SOURCE_LABEL[revenue.source] ?? revenue.source}
        </p>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {revenue.payment_date
              ? format(new Date(revenue.payment_date), "d MMM yyyy", { locale: fr })
              : "Sans date"}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[0.6rem] font-medium text-muted-foreground">
            {SOURCE_LABEL[revenue.source] ?? revenue.source}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-sm font-semibold text-foreground">
          {revenue.amount.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[0.6rem] font-medium ${
            STATUS_CLASS[revenue.status] ?? ""
          }`}
        >
          {STATUS_LABEL[revenue.status] ?? revenue.status}
        </span>
      </div>
    </>
  );

  if (!interactive) {
    return (
      <div className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left">
        {content}
      </div>
    );
  }

  const next = nextStatus(revenue.status);
  const prev = previousStatus(revenue.status);

  return (
    <SwipeableRow
      swipeEnabled={swipeEnabled}
      onClick={onClick}
      nextLabel={next ? STATUS_LABEL[next] : null}
      prevLabel={prev ? STATUS_LABEL[prev] : null}
      onCommitRight={() => next && onSwipeStatusChange?.(next)}
      onCommitLeft={() => prev && onSwipeStatusChange?.(prev)}
    >
      {content}
    </SwipeableRow>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: errors in `src/routes/_authenticated/finance/index.tsx` (still calling `<RevenueLine revenue={p} />` with the old single-prop signature — fine, no new required props were added, `interactive`/`swipeEnabled`/`onSwipeStatusChange` all have safe defaults or are optional, so this should actually compile with **no errors**). Confirm no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/modules/finance/RevenueLine.tsx
git commit -m "feat(finance): RevenueLine supports swipe-to-change-status and click-to-edit"
```

---

### Task 9: `finance/index.tsx` — replace filter pills, wire swipe + edit

**Files:**
- Modify: `src/routes/_authenticated/finance/index.tsx`

**Interfaces:**
- Consumes: `SearchFilterSortBar` (Task 5), `CachetFilterSheet` with `sourceOptions` (Task 7), `RevenueLine` new props (Task 8), `STATUS_LABEL`/`writePaymentStatus`/`countValidCachets`/`countValidHours`/`type PaymentForCachets` from `@/lib/cachets` (Task 1), `applyCachetFilters`/`sortCachetsByDate`/`countActiveFilters`/`EMPTY_FILTERS`/`type CachetFilters` from `@/lib/cachetFilters` (pre-existing), `EditPaymentDrawer` (pre-existing, from Cachets).

- [ ] **Step 1: Replace the full file**

Replace the entire contents of `src/routes/_authenticated/finance/index.tsx` with:

```tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { AppHeader } from "@/components/app/AppHeader";
import { SearchFilterSortBar } from "@/components/app/SearchFilterSortBar";
import { RevenueLine, type RevenueLineData } from "@/components/modules/finance/RevenueLine";
import { AddRevenueSheet } from "@/components/modules/finance/AddRevenueSheet";
import { SacemImportDrawer } from "@/components/modules/tracks/SacemImportDrawer";
import { EditPaymentDrawer } from "@/components/modules/cachets/EditPaymentDrawer";
import { CachetFilterSheet } from "@/components/modules/cachets/CachetFilterSheet";
import {
  countValidCachets,
  countValidHours,
  STATUS_LABEL,
  writePaymentStatus,
  type PaymentForCachets,
} from "@/lib/cachets";
import {
  applyCachetFilters,
  sortCachetsByDate,
  countActiveFilters,
  EMPTY_FILTERS,
  type CachetFilters,
} from "@/lib/cachetFilters";
import { computeResteDu, type ManagementFeeForCalc, type ExpenseForCalc } from "@/lib/fees";

export const Route = createFileRoute("/_authenticated/finance/")({
  component: FinancePage,
});

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
  { value: "sacem", label: "SACEM" },
] as const;

type FullPayment = RevenueLineData & PaymentForCachets & {
  territory: "france" | "étranger";
  deductible_expenses: number;
};

interface FeeWithPayment extends ManagementFeeForCalc {
  payment: { payment_date: string | null; status: string } | null;
}

function FinancePage() {
  const { profile } = useAuth();
  const isManager = profile?.role === "manager";
  const [filters, setFilters] = useState<CachetFilters>(EMPTY_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [sortAsc, setSortAsc] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [sacemOpen, setSacemOpen] = useState(false);
  const [editPayment, setEditPayment] = useState<FullPayment | null>(null);

  const { data: allPayments, refresh: refreshPayments } = useCollection<FullPayment>(
    "payments",
    {
      select: "*, batch:payment_batches(batch_count)",
      order: { column: "payment_date", ascending: false },
    }
  );

  const { data: fees } = useCollection<FeeWithPayment>("management_fees", {
    select: "id, commission_due, status, already_paid_to_manager, is_commissionable, payment:payments(payment_date, status)",
  });

  const { data: expenses } = useCollection<ExpenseForCalc>("expenses", {});

  const commissionStart = profile?.commission_start_date ?? "2025-01-01";

  const filteredFees = useMemo(
    () =>
      fees.filter((f) => {
        if (f.payment?.status === "annulé") return false;
        const payDate = f.payment?.payment_date;
        return !payDate || payDate >= commissionStart;
      }),
    [fees, commissionStart]
  );

  const cachets = useMemo(
    () => allPayments.filter((p) => p.source !== "sacem"),
    [allPayments]
  );

  const validCount = countValidCachets(cachets);
  const validHours = countValidHours(cachets);
  const resteDu = computeResteDu(filteredFees, expenses);

  const searched = useMemo(() => applyCachetFilters(allPayments, filters), [allPayments, filters]);
  const filtered = useMemo(() => sortCachetsByDate(searched, sortAsc), [searched, sortAsc]);
  const activeFilterCount = countActiveFilters(filters);

  const handleSwipeStatusChange = (payment: FullPayment, next: FullPayment["status"]) => {
    const previous = payment.status;
    writePaymentStatus(payment.id, next);
    toast.success(`Statut → ${STATUS_LABEL[next] ?? next}`, {
      action: {
        label: "Annuler",
        onClick: () => writePaymentStatus(payment.id, previous),
      },
    });
  };

  return (
    <>
      <AppHeader title="Finance" />

      <div className="px-4 pt-4 pb-24 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/finance/cachets"
            className="rounded-2xl border border-border bg-card px-4 py-4 transition active:scale-[0.98]"
          >
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
              Cachets
            </p>
            <p className="mt-1 font-display text-2xl font-bold text-foreground">
              {validCount}
            </p>
            <p className="text-xs text-muted-foreground">{validHours} h valides</p>
          </Link>
          <Link
            to="/finance/fees"
            className="rounded-2xl border border-border bg-card px-4 py-4 transition active:scale-[0.98]"
          >
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
              Fees manager
            </p>
            <p
              className={`mt-1 font-display text-2xl font-bold ${
                resteDu > 0 ? "text-amber-400" : "text-foreground"
              }`}
            >
              {resteDu.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
            </p>
            <p className="text-xs text-muted-foreground">reste dû</p>
          </Link>
        </div>

        <SearchFilterSortBar
          search={filters.search}
          onSearchChange={(value) => setFilters((f) => ({ ...f, search: value }))}
          activeFilterCount={activeFilterCount}
          onFilterClick={() => setFilterSheetOpen(true)}
          sortAsc={sortAsc}
          onSortToggle={() => setSortAsc((v) => !v)}
        />

        {/* Revenue list */}
        <div className="space-y-2">
          {filtered.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Aucun revenu{activeFilterCount > 0 || filters.search ? " pour ces filtres" : ""}.
            </p>
          )}
          {filtered.map((p) => (
            <RevenueLine
              key={p.id}
              revenue={p}
              onClick={() => setEditPayment(p)}
              interactive={p.source !== "sacem"}
              swipeEnabled={isManager}
              onSwipeStatusChange={(next) => handleSwipeStatusChange(p, next)}
            />
          ))}
        </div>
      </div>

      {isManager && (
        <button
          onClick={() => setAddOpen(true)}
          aria-label="Ajouter un revenu"
          className="fixed bottom-[max(env(safe-area-inset-bottom),1rem)] right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-foreground text-background shadow-lg transition active:scale-95"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      <AddRevenueSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        onSacemRequested={() => setSacemOpen(true)}
        onSuccess={refreshPayments}
      />
      <SacemImportDrawer
        open={sacemOpen}
        onOpenChange={setSacemOpen}
        onSuccess={refreshPayments}
      />

      <EditPaymentDrawer
        open={editPayment !== null}
        onOpenChange={(v) => {
          if (!v) setEditPayment(null);
        }}
        payment={editPayment}
        onSuccess={refreshPayments}
      />

      <CachetFilterSheet
        open={filterSheetOpen}
        onOpenChange={setFilterSheetOpen}
        filters={filters}
        onChange={setFilters}
        sourceOptions={SOURCE_OPTIONS}
      />
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors. If there's a type error about `FullPayment` not satisfying `EditPaymentDrawer`'s `payment` prop (`PaymentRow & { batch_id: string | null }`), double-check `FullPayment`'s intersection includes every field `PaymentRow` requires — `territory` and `deductible_expenses` are added explicitly in this task's type definition specifically because `RevenueLineData` and `PaymentForCachets` don't otherwise provide them.

- [ ] **Step 3: Run tests**

Run: `pnpm test`
Expected: same baseline as prior tasks (this route has no test file of its own).

- [ ] **Step 4: Commit**

```bash
git add src/routes/_authenticated/finance/index.tsx
git commit -m "feat(finance): replace filter pills with search/filter/sort, add swipe and click-to-edit"
```

---

### Task 10: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run: `pnpm dev` (with real Supabase credentials in `.env` — needed to see live data).

- [ ] **Step 2: Verify Cachets page has zero regressions**

Navigate to `/finance/cachets`. Confirm: intermittence graph renders with readable axis labels, swipe still changes status with the undo toast, clicking a row still opens the edit sheet, closing the sheet with unsaved changes auto-saves, search/filter/sort all still work exactly as before this plan's refactors.

- [ ] **Step 3: Verify Finance page — SACEM rows are non-interactive**

Navigate to `/finance`. Find a row with the "SACEM" badge (e.g. one of the 5 "SACEM répartition ..." entries). Confirm: it does not visually respond to a tap (no active-scale animation), swiping it does nothing, and it does not open the edit sheet.

- [ ] **Step 4: Verify Finance page — everything else is interactive**

Pick a non-SACEM row (e.g. a `booking`/cachet entry). Confirm: swiping right/left changes its status with the undo toast (same behavior as Cachets), tapping it opens `EditPaymentDrawer`, and closing that sheet after an edit auto-saves.

- [ ] **Step 5: Verify search/filter/sort on Finance**

Type into the search box and confirm it filters by intitulé. Open the filter sheet and confirm the Type group has 10 options including "SACEM" (select it to confirm SACEM rows can be found even though they're not interactive). Confirm the Statut/Territoire groups work the same as on Cachets. Toggle the Date sort button and confirm the list order flips.

- [ ] **Step 6: Verify the summary cards are unaffected by filters**

While a search term or filter is active on `/finance`, confirm the "Cachets" and "Fees manager" summary cards at the top still show the same totals as before filtering (they should reflect all data, not the filtered list).

- [ ] **Step 7: Stop the dev server**

Kill the `pnpm dev` process once verification is complete.
