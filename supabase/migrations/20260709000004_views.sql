-- Artist fee summary view: artist sees only aggregate "reste dû"
-- Never exposes management_fees table directly
CREATE OR REPLACE VIEW artist_fee_summary AS
WITH fee_totals AS (
  SELECT
    p.artist_id,
    COALESCE(SUM(mf.commission_due) FILTER (WHERE mf.status = 'due'),  0) AS commission_due,
    COALESCE(SUM(mf.already_paid_to_manager), 0)                          AS already_paid
  FROM payments p
  JOIN management_fees mf ON mf.payment_id = p.id
  GROUP BY p.artist_id
),
ndf_totals AS (
  SELECT COALESCE(SUM(amount), 0) AS ndf_pending
  FROM expenses
  WHERE status = 'à_rembourser'
)
SELECT
  ft.artist_id,
  ft.commission_due                                        AS total_due,
  ft.already_paid                                          AS total_paid,
  nt.ndf_pending,
  ft.commission_due + nt.ndf_pending - ft.already_paid    AS reste_du
FROM fee_totals ft, ndf_totals nt;
