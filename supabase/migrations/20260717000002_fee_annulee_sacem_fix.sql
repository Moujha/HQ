-- Fix 20260717000001_fee_annulee_status.sql: its CREATE OR REPLACE of
-- create_management_fee() was based on the pre-SACEM version of the
-- function (from 20260709000002_triggers.sql), silently dropping the
-- SACEM branch added later by 20260710000002_payment_lines.sql (SACEM
-- payments must start their fee at net_base=0, commission_due=0,
-- is_commissionable=false; the real commission is computed separately by
-- recalculate_sacem_fee() via payment_lines). This restores that branch,
-- while keeping the 'annulée' status support added by 20260717000001.
CREATE OR REPLACE FUNCTION create_management_fee()
RETURNS TRIGGER AS $$
DECLARE
  v_is_commissionable bool := true;
  v_rate              numeric := 0.15;
  v_net_base          numeric;
  v_commission        numeric;
BEGIN
  IF NEW.source = 'sacem' THEN
    INSERT INTO management_fees (
      payment_id, net_base, commission_rate, is_commissionable, commission_due, status
    ) VALUES (
      NEW.id, 0, v_rate, false, 0,
      CASE
        WHEN NEW.status = 'payé' THEN 'due'
        WHEN NEW.status = 'annulé' THEN 'annulée'
        ELSE 'projetée'
      END
    );
    RETURN NEW;
  END IF;

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
