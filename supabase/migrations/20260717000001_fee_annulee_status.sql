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
