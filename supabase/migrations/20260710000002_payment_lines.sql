-- ============================================================
-- 1. Add sacem_code to tracks (unique index, nullable)
-- ============================================================
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS sacem_code text;
CREATE UNIQUE INDEX IF NOT EXISTS tracks_sacem_code_idx
  ON tracks(sacem_code) WHERE sacem_code IS NOT NULL;

-- ============================================================
-- 2. Extend payments.source to include 'sacem'
-- ============================================================
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_source_check;
ALTER TABLE payments ADD CONSTRAINT payments_source_check
  CHECK (source IN ('label','booking','clip','track','résidence','figuration','sacem'));

-- ============================================================
-- 3. Create payment_lines (replaces sacem_statement_lines)
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_lines (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id        uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  track_id          uuid REFERENCES tracks(id) ON DELETE SET NULL,
  sacem_code        text,
  raw_title         text NOT NULL,
  support_type      text NOT NULL DEFAULT 'streaming'
    CHECK (support_type IN ('streaming','plateforme_web','live','radio_tv','sync','autre')),
  amount            numeric(10,2) NOT NULL,
  is_commissionable bool NOT NULL DEFAULT false,
  created_at        timestamptz DEFAULT now()
);

-- ============================================================
-- 4. Update create_management_fee trigger:
--    SACEM payments start with fee=0; recalculated from lines
-- ============================================================
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
      CASE WHEN NEW.status = 'payé' THEN 'due' ELSE 'projetée' END
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
    payment_id, net_base, commission_rate, is_commissionable, commission_due, status
  ) VALUES (
    NEW.id, v_net_base, v_rate, v_is_commissionable, v_commission,
    CASE WHEN NEW.status = 'payé' THEN 'due' ELSE 'projetée' END
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 5. Trigger on payment_lines: recalculate SACEM fee
-- ============================================================
CREATE OR REPLACE FUNCTION recalculate_sacem_fee()
RETURNS TRIGGER AS $$
DECLARE
  v_payment_id uuid;
  v_net_base   numeric;
BEGIN
  v_payment_id := COALESCE(NEW.payment_id, OLD.payment_id);

  IF NOT EXISTS (
    SELECT 1 FROM payments WHERE id = v_payment_id AND source = 'sacem'
  ) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_net_base
  FROM payment_lines
  WHERE payment_id = v_payment_id AND is_commissionable = true;

  UPDATE management_fees
  SET
    net_base          = v_net_base,
    commission_due    = v_net_base * commission_rate,
    is_commissionable = (v_net_base > 0)
  WHERE payment_id = v_payment_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recalculate_sacem_fee ON payment_lines;
CREATE TRIGGER trg_recalculate_sacem_fee
  AFTER INSERT OR UPDATE OR DELETE ON payment_lines
  FOR EACH ROW EXECUTE FUNCTION recalculate_sacem_fee();

-- ============================================================
-- 6. Drop old SACEM tables (re-imported via CSV importer)
-- ============================================================
DROP TABLE IF EXISTS sacem_statement_lines CASCADE;
DROP TABLE IF EXISTS sacem_statements CASCADE;
