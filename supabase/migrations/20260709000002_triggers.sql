-- ============================================================
-- Trigger 1: Set expires_at = payment_date + 12 months
-- Fires on INSERT and UPDATE of payments
-- ============================================================
CREATE OR REPLACE FUNCTION set_payment_expires_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.payment_date IS NOT NULL AND NEW.status = 'payé' THEN
    NEW.expires_at := NEW.payment_date + INTERVAL '12 months';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_payment_expires_at ON payments;
CREATE TRIGGER trg_set_payment_expires_at
  BEFORE INSERT OR UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_payment_expires_at();

-- ============================================================
-- Trigger 2: Auto-create management_fees row on payment INSERT
-- ============================================================
CREATE OR REPLACE FUNCTION create_management_fee()
RETURNS TRIGGER AS $$
DECLARE
  v_is_commissionable bool := true;
  v_rate              numeric := 0.15;
  v_net_base          numeric;
  v_commission        numeric;
BEGIN
  -- Inherit is_commissionable from linked track (if any)
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
    CASE WHEN NEW.status = 'payé' THEN 'due' ELSE 'projetée' END
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_create_management_fee ON payments;
CREATE TRIGGER trg_create_management_fee
  AFTER INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION create_management_fee();

-- ============================================================
-- Trigger 3: Sync fee status when payment transitions to 'payé'
-- ============================================================
CREATE OR REPLACE FUNCTION sync_fee_status_on_payment_update()
RETURNS TRIGGER AS $$
DECLARE
  v_net_base   numeric;
  v_commission numeric;
BEGIN
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

DROP TRIGGER IF EXISTS trg_sync_fee_status ON payments;
CREATE TRIGGER trg_sync_fee_status
  AFTER UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION sync_fee_status_on_payment_update();

-- ============================================================
-- Trigger 4: updated_at timestamp on payments
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payments_updated_at ON payments;
CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
