# Fee Status Sync on Payment Cancellation — Design

## Problem

Cancelling a payment (setting `payments.status = 'annulé'`, e.g. via the Cachets swipe/edit UI) does not update its linked `management_fees` row at all. The fee stays in whatever state it was already in — confirmed live: a payment cancelled via the Cachets page still has a `management_fees` row reporting `status: "projetée"`, `commission_due: 60€`, visible on `/finance/fees` looking like an active projected commission for money that will never arrive.

Root cause: `sync_fee_status_on_payment_update` (the trigger that keeps `management_fees` in sync with its `payments` row) only reacts when a payment transitions **to** `'payé'`. Nothing handles a transition to `'annulé'`, and there is no `'annulée'` fee status to transition into in the first place.

## Goals

- Add an `'annulée'` status to `management_fees`, matching the existing "soft-cancel via explicit status, never delete, exclude from calculations" pattern already used for `payments.status = 'annulé'` and `events.status = 'annulé'`.
- Whenever a payment transitions to `'annulé'` — from *any* prior status (`projetée` fees, but also already-`due` or already-`versée` ones) — its linked fee becomes `'annulée'` automatically. Confirmed with the user: both the simple case (fee never billed) and the rarer case (commission already invoiced or already paid out, then the underlying payment is retroactively cancelled) get the same automatic treatment.
- Repair the one currently-orphaned fee row as part of the same migration (a payment already sits at `annulé` with a fee that never got updated).
- Fees page: `'annulée'` fees are hidden from the list by default (mirroring how Cachets hides `annulé` payments by default), selectable via the filter sheet, and styled clearly as cancelled when shown.

## Non-goals

- `commission_due`/`net_base` are **not** zeroed when a fee becomes `annulée` — the historical number is preserved (same reasoning as why a cancelled payment keeps its `amount`), only its `status` changes so calculations exclude it.
- No change to `computeResteDu`/`computeControlRate` themselves — both already only sum `status === "due"` fees for the commission figure, so an `annulée` fee is automatically excluded from "Commission due" the moment its status changes; no calculation code needs to change.
- No UI to manually re-activate an `annulée` fee — if a cancelled payment is later un-cancelled (status set back to something else), that's a separate payment-status change already handled by the existing swipe/edit flow; whether the fee should un-cancel too is out of scope for this fix (the current bug is one-directional: cancel a payment, its fee never follows).

## Architecture

### Migration

New file, `supabase/migrations/20260717000001_fee_annulee_status.sql`:

1. Widen `management_fees.status`'s CHECK constraint from `('projetée','due','versée')` to `('projetée','due','versée','annulée')`, using the same drop-by-introspection-then-recreate-by-name pattern already used for the `payments.status` constraint migrations (`20260711000001_payment_tbc_status.sql`, `20260712000001_payment_annule_status.sql`).

2. Replace `sync_fee_status_on_payment_update` (`CREATE OR REPLACE FUNCTION`, same trigger, no `DROP TRIGGER`/`CREATE TRIGGER` needed since the trigger itself is unchanged, only its function body) — add a new branch at the top of the function body:

   ```sql
   IF NEW.status = 'annulé' AND OLD.status != 'annulé' THEN
     UPDATE management_fees
     SET status = 'annulée'
     WHERE payment_id = NEW.id;
     RETURN NEW;
   END IF;
   ```

   Placed before the existing `IF NEW.status = 'payé' AND OLD.status != 'payé' THEN ...` branch, with an early `RETURN NEW` so the existing "keep net_base/commission_due in sync if amount changed" block below doesn't also fire in the same statement (a cancelled payment's amount isn't relevant anymore). This is a pure addition — the existing `payé` branch and the amount-sync block are untouched.

3. Replace `create_management_fee` (the insert trigger's function) — widen the `status` assignment on `INSERT`:

   ```sql
   CASE
     WHEN NEW.status = 'payé' THEN 'due'
     WHEN NEW.status = 'annulé' THEN 'annulée'
     ELSE 'projetée'
   END
   ```

   (was: `CASE WHEN NEW.status = 'payé' THEN 'due' ELSE 'projetée' END`) — covers the edge case of a payment inserted already-cancelled (e.g. a historical import).

4. One-off repair, in the same migration:

   ```sql
   UPDATE management_fees mf
   SET status = 'annulée'
   FROM payments p
   WHERE mf.payment_id = p.id
     AND p.status = 'annulé'
     AND mf.status != 'annulée';
   ```

   This immediately fixes the currently-orphaned "Noize TBC" fee row (and any other payment/fee pair in the same state) the moment the migration is applied — no separate one-off script needed.

### `FeeLine.tsx`

Widen `FeeLineData.status` to `"projetée" | "due" | "versée" | "annulée"`. Add to `STATUS_CLASS`/`STATUS_LABEL`:

```ts
annulée: "text-muted-foreground bg-muted line-through",
```
```ts
annulée: "Annulée",
```

(reusing the existing `opacity-60` treatment the component already applies to `projetée` rows would under-distinguish "not yet due" from "cancelled" — the `line-through` on the status pill makes cancelled visually distinct at a glance, same idea as the strikethrough already used for non-commissionable amounts in this same component.)

### `src/lib/feesFilters.ts`

`applyFeesFilters` gains the same default-hide rule `applyCachetFilters` already has for `annulé` payments:

```ts
if (filters.statuses.length > 0) {
  if (!filters.statuses.includes(f.status)) return false;
} else if (f.status === "annulée") {
  return false;
}
```

(replacing the current unconditional `if (filters.statuses.length > 0 && !filters.statuses.includes(f.status)) return false;`)

### `FeesFilterSheet`

Add a 4th status option: `{ value: "annulée", label: "Annulée" }`.

## Testing

- `src/lib/__tests__/feesFilters.test.ts` gets new cases: default-hides `annulée` fees when no status filter is selected; shows them when `"annulée"` is explicitly selected — mirroring the existing `cachetFilters.test.ts` coverage for the equivalent `annulé` payment behavior.
- No migration-level automated test (this codebase has no DB test harness — every prior status migration this session was verified by manual read-through, same here).
- `FeeLine.tsx`/`FeesFilterSheet` are not unit-tested — no component in this codebase has one.

## Manual verification

Same as every prior feature this session: after deploy, `curl` the HTML shell, extract the content-hashed JS bundle, grep for distinctive new strings ("Annulée" fee label) — no browser automation available in this environment. Additionally, since this is a DB migration, it must actually be **run** against the live Supabase project after deploy (per the earlier discovery this session that migrations aren't automatically applied) — the user will need to run it via the Supabase Dashboard SQL Editor, same as the `annulé` payment-status fix earlier today.
