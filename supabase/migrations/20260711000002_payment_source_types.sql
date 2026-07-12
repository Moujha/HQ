-- Extend payments.source to include additional cachet types
DO $$
DECLARE constraint_name text;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'payments' AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%booking%';
  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE payments DROP CONSTRAINT ' || quote_ident(constraint_name);
  END IF;
END $$;

ALTER TABLE payments
  ADD CONSTRAINT payments_source_check
  CHECK (source IN ('label','booking','clip','track','résidence','figuration','sacem','répétition','formation','accompagnement'));
