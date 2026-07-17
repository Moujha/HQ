# Fee Status Sync on Payment Cancellation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cancelling a payment (`payments.status = 'annulé'`) currently leaves its linked `management_fees` row untouched, so cancelled payments still show up on `/finance/fees` looking like active commission. Add an `'annulée'` fee status, keep it in sync via the existing payment-status trigger, repair the one currently-orphaned row, and hide `annulée` fees from the Fees list by default (matching how Cachets already hides `annulé` payments).

**Architecture:** A single new migration widens the `management_fees.status` CHECK constraint and extends two existing trigger functions (`create_management_fee`, `sync_fee_status_on_payment_update`) with `CREATE OR REPLACE FUNCTION` — no new triggers, no schema changes beyond the constraint. `src/lib/feesFilters.ts` gains the same default-hide-cancelled rule `cachetFilters.ts` already has. `FeeLine.tsx` and `FeesFilterSheet` get the new status added to their display/filter option lists.

**Tech Stack:** Supabase (Postgres + RLS + triggers), React 19 + TypeScript, Vitest (scoped to `src/lib/**/*.test.ts`).

## Global Constraints

- Never modify an existing migration file — always add a new one.
- `commission_due`/`net_base` are never zeroed when a fee becomes `annulée` — only its `status` changes, same "soft-cancel, preserve the historical number" pattern already used for cancelled payments.
- `computeResteDu`/`computeControlRate` in `src/lib/fees.ts` are not modified by this plan — both already only sum `status === "due"` fees, so an `annulée` fee is automatically excluded once its status changes.
- Only `src/lib/**/*.test.ts` is covered by `vitest.config.ts` — no component test files, no DB test harness exists in this codebase (migrations are verified by manual read-through, same as every prior status migration this session).
- French copy throughout — the fee status label is "Annulée".

---

### Task 1: Migration — `annulée` fee status + trigger sync + one-off repair

**Files:**
- Create: `supabase/migrations/20260717000001_fee_annulee_status.sql`

**Interfaces:**
- Consumes: the existing `management_fees` table and its two trigger functions (`create_management_fee`, `sync_fee_status_on_payment_update`), both defined in `supabase/migrations/20260709000002_triggers.sql` — this migration replaces their bodies via `CREATE OR REPLACE FUNCTION`, it does not touch the `CREATE TRIGGER` statements (unchanged, still bound to the same function names).
- Produces: nothing consumed by later tasks in this plan (Tasks 2 and 3 are pure frontend, independent of this migration's exact SQL).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260717000001_fee_annulee_status.sql`:

```sql
-- Add 'annulée' as a valid management_fees status, and keep fees in sync
-- when their linked payment is cancelled. See:
-- docs/superpowers/specs/2026-07-17-fee-annulee-status-design.md
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'management_fees'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%projetée%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE management_fees DROP CONSTRAINT ' || quote_ident(constraint_name);
  END IF;
END $$;

ALTER TABLE management_fees
  ADD CONSTRAINT management_fees_status_check
  CHECK (status IN ('projetée','due','versée','annulée'));

-- Insert trigger: a payment inserted already-cancelled gets an
-- already-cancelled fee, not 'projetée'.
CREATE OR REPLACE FUNCTION create_management_fee()
RETURNS TRIGGER AS $$
DECLARE
  v_is_commissionable bool := true;
  v_rate              numeric := 0.15;
  v_net_base          numeric;
  v_commission        numeric;
BEGIN
  IF NEW.track_id IS NOT NULL THEN
    SELECT is_commissionable INTO v_is_commissionable
    FROM tracks WHERE id = NEW.track_id;
  END IF;

  v_net_base   := GREATEST(NEW.amount - NEW.deductible_expenses, 0);
  v_commission := CASE WHEN v_is_commissionable THEN v_net_base * v_rate ELSE 0 END;

  INSERT INTO management_fees (
    payment_id, net_base, commission_rate,
    is_commissionable, commission_due, status
  ) VALUES (
    NEW.id, v_net_base, v_rate, v_is_commissionable, v_commission,
    CASE
      WHEN NEW.status = 'payé' THEN 'due'
      WHEN NEW.status = 'annulé' THEN 'annulée'
      ELSE 'projetée'
    END
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update trigger: keep the fee in sync when its payment's status changes —
-- cancelling a payment (from ANY prior status: projetée, due, or versée)
-- cancels its fee too.
CREATE OR REPLACE FUNCTION sync_fee_status_on_payment_update()
RETURNS TRIGGER AS $$
DECLARE
  v_net_base   numeric;
  v_commission numeric;
BEGIN
  IF NEW.status = 'annulé' AND OLD.status != 'annulé' THEN
    UPDATE management_fees
    SET status = 'annulée'
    WHERE payment_id = NEW.id;

    RETURN NEW;
  END IF;

  IF NEW.status = 'payé' AND OLD.status != 'payé' THEN
    v_net_base   := GREATEST(NEW.amount - NEW.deductible_expenses, 0);
    v_commission := v_net_base * (
      SELECT commission_rate FROM management_fees WHERE payment_id = NEW.id
    ) * (
      SELECT CASE WHEN is_commissionable THEN 1 ELSE 0 END
      FROM management_fees WHERE payment_id = NEW.id
    );

    UPDATE management_fees
    SET
      status         = 'due',
      net_base       = v_net_base,
      commission_due = v_commission
    WHERE payment_id = NEW.id;
  END IF;

  -- Also keep net_base/commission_due in sync if amount or deductible changes
  IF (NEW.amount != OLD.amount OR NEW.deductible_expenses != OLD.deductible_expenses) THEN
    UPDATE management_fees mf
    SET
      net_base       = GREATEST(NEW.amount - NEW.deductible_expenses, 0),
      commission_due = CASE WHEN mf.is_commissionable
                       THEN GREATEST(NEW.amount - NEW.deductible_expenses, 0) * mf.commission_rate
                       ELSE 0 END
    WHERE payment_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- One-off repair: fix any fee that's already orphaned (its payment is
-- already annulé, but the fee never got the memo) — e.g. the "Noize TBC"
-- row this migration was written to fix.
UPDATE management_fees mf
SET status = 'annulée'
FROM payments p
WHERE mf.payment_id = p.id
  AND p.status = 'annulé'
  AND mf.status != 'annulée';
```

- [ ] **Step 2: Verify the migration's structure**

Run: `cat supabase/migrations/20260717000001_fee_annulee_status.sql` and check by eye:
- The constraint DO block only searches for/drops a constraint matching `%projetée%` on `management_fees` (not `payments` — don't confuse this with the earlier `payments.status` migrations that used the same pattern on a different table).
- `create_management_fee`'s `CASE` has exactly 3 branches (`payé`→`due`, `annulé`→`annulée`, else `projetée`).
- `sync_fee_status_on_payment_update`'s new `annulé` branch comes **before** the existing `payé` branch and `RETURN NEW`s early — the existing `payé`-transition logic and the amount-sync block below it are otherwise byte-for-byte unchanged from `supabase/migrations/20260709000002_triggers.sql`.
- The final one-off `UPDATE` targets `management_fees mf ... FROM payments p WHERE mf.payment_id = p.id AND p.status = 'annulé' AND mf.status != 'annulée'` exactly — this is what repairs the currently-broken row when the migration is actually run.

There is no local Supabase CLI/DB in this environment to execute the migration against — this is a manual read-through verification only, same as every prior status migration this session. The user runs it via the Supabase Dashboard SQL Editor after this task is merged and deployed.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260717000001_fee_annulee_status.sql
git commit -m "feat(fees): add annulée fee status, synced when a payment is cancelled"
```

---

### Task 2: `src/lib/feesFilters.ts` — hide `annulée` fees by default

**Files:**
- Modify: `src/lib/feesFilters.ts`
- Modify: `src/lib/__tests__/feesFilters.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `applyFeesFilters`'s behavior change (default-hide `annulée`) — consumed by the already-existing `ManagerFeesView` (`src/routes/_authenticated/finance/fees.tsx`), no code change needed there since it already just calls `applyFeesFilters(filteredFees, filters)`.

- [ ] **Step 1: Write the failing tests**

In `src/lib/__tests__/feesFilters.test.ts`, add these two cases inside the existing `describe("applyFeesFilters", ...)` block (alongside the existing tests — don't remove any existing test):

```ts
  it("returns everything except annulée when no status filter is set", () => {
    const fees = [make({ id: "a", status: "due" }), make({ id: "b", status: "annulée" })];
    const result = applyFeesFilters(fees, EMPTY_FEES_FILTERS);
    expect(result.map((f) => f.id)).toEqual(["a"]);
  });

  it("includes annulée when explicitly selected in the status filter", () => {
    const fees = [make({ id: "a", status: "due" }), make({ id: "b", status: "annulée" })];
    const result = applyFeesFilters(fees, { search: "", statuses: ["annulée"] });
    expect(result.map((f) => f.id)).toEqual(["b"]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/lib/__tests__/feesFilters.test.ts`
Expected: FAIL — the new "returns everything except annulée" test fails because the current implementation has no default-hide rule (it currently returns both `a` and `b` when no status filter is set).

- [ ] **Step 3: Update the implementation**

In `src/lib/feesFilters.ts`, replace:

```ts
  return fees.filter((f) => {
    if (filters.statuses.length > 0 && !filters.statuses.includes(f.status)) {
      return false;
    }

    if (search) {
```

with:

```ts
  return fees.filter((f) => {
    if (filters.statuses.length > 0) {
      if (!filters.statuses.includes(f.status)) return false;
    } else if (f.status === "annulée") {
      return false;
    }

    if (search) {
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/lib/__tests__/feesFilters.test.ts`
Expected: PASS, 13 tests (11 existing + 2 new).

- [ ] **Step 5: Verify no regressions**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

Run: `pnpm exec vitest run`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/feesFilters.ts src/lib/__tests__/feesFilters.test.ts
git commit -m "feat(fees): hide annulée fees by default in the fees list filter"
```

---

### Task 3: `FeeLine.tsx` display + `FeesFilterSheet` filter option

**Files:**
- Modify: `src/components/modules/fees/FeeLine.tsx`
- Modify: `src/components/modules/fees/FeesFilterSheet.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed elsewhere — this is the last task.

- [ ] **Step 1: Widen `FeeLineData.status` and add the display styling**

In `src/components/modules/fees/FeeLine.tsx`, replace:

```ts
  status: "projetée" | "due" | "versée";
```

with:

```ts
  status: "projetée" | "due" | "versée" | "annulée";
```

Then replace:

```ts
const STATUS_CLASS: Record<string, string> = {
  projetée: "text-muted-foreground bg-muted",
  due: "text-amber-400 bg-amber-400/10",
  versée: "text-green-400 bg-green-400/10",
};

const STATUS_LABEL: Record<string, string> = {
  projetée: "Projetée",
  due: "Due",
  versée: "Versée",
};
```

with:

```ts
const STATUS_CLASS: Record<string, string> = {
  projetée: "text-muted-foreground bg-muted",
  due: "text-amber-400 bg-amber-400/10",
  versée: "text-green-400 bg-green-400/10",
  annulée: "text-muted-foreground bg-muted line-through",
};

const STATUS_LABEL: Record<string, string> = {
  projetée: "Projetée",
  due: "Due",
  versée: "Versée",
  annulée: "Annulée",
};
```

- [ ] **Step 2: Add the filter option**

In `src/components/modules/fees/FeesFilterSheet.tsx`, replace:

```ts
const STATUS_OPTIONS = [
  { value: "projetée", label: "Projetée" },
  { value: "due", label: "Due" },
  { value: "versée", label: "Versée" },
] as const;
```

with:

```ts
const STATUS_OPTIONS = [
  { value: "projetée", label: "Projetée" },
  { value: "due", label: "Due" },
  { value: "versée", label: "Versée" },
  { value: "annulée", label: "Annulée" },
] as const;
```

- [ ] **Step 3: Verify it builds**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

Run: `pnpm build`
Expected: build succeeds.

Run: `pnpm exec vitest run`
Expected: all tests pass (this task touches no `src/lib` file).

- [ ] **Step 4: Commit**

```bash
git add src/components/modules/fees/FeeLine.tsx src/components/modules/fees/FeesFilterSheet.tsx
git commit -m "feat(fees): display and filter the annulée fee status"
```
