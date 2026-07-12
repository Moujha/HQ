-- Add 'tbc' (to be confirmed) as a valid payment status
-- TBC payments appear only on the potential curve in the intermittence graph

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
  CHECK (status IN ('provisoire','facturé','cachet_en_attente','payé','tbc'));
