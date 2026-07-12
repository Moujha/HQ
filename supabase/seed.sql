-- ============================================================
-- BLOU FEET — seed data (historical data from Excel files)
-- Run once in Supabase SQL Editor after applying migrations.
-- ============================================================

-- ============================================================
-- 0. Safety guard
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE role = 'manager') THEN
    RAISE EXCEPTION 'No manager profile found. Create your account first, then run this seed.';
  END IF;
END $$;

-- ============================================================
-- 1. TRACKS
-- ============================================================
INSERT INTO tracks (title, sacem_status, is_commissionable, is_commissionable_since, release_date, created_at) VALUES
  -- Catalogue historique (non commissionnable — droits SACEM précèdent la gestion)
  ('J''Crois Pas Qu''On Devrait Se Voir', 'déclaré',       false, NULL,         NULL,         now()),
  ('Laisse Le Temps Faire',               'déclaré',       false, NULL,         NULL,         now()),
  ('Martini',                             'déclaré',       false, NULL,         NULL,         now()),
  ('Martini Instrumental',                'déclaré',       false, NULL,         NULL,         now()),
  ('Martini Sped Up',                     'déclaré',       false, NULL,         NULL,         now()),
  ('Martini VHS',                         'déclaré',       false, NULL,         NULL,         now()),
  ('Ne M''En Veux Pas',                   'déclaré',       false, NULL,         NULL,         now()),
  ('Pas Ma Faute',                        'déclaré',       false, NULL,         NULL,         now()),
  ('Sables Mouvants',                     'déclaré',       false, NULL,         NULL,         now()),
  ('Une Fois Pas Deux',                   'déclaré',       false, NULL,         NULL,         now()),
  ('Adrenaline',                          'déclaré',       false, NULL,         NULL,         now()),
  ('Ambre',                               'déclaré',       false, NULL,         NULL,         now()),
  ('Cordyceps',                           'déclaré',       false, NULL,         NULL,         now()),
  -- Titres commissionnable (gérés depuis la signature avec ZABETH)
  ('yakoi!',                              'déclaré',       true,  '2025-01-01', '2025-07-25', now()),
  ('big big town',                        'déclaré',       true,  '2025-01-01', '2025-12-04', now()),
  ('plucemek!',                           'déclaré',       true,  '2026-01-01', '2026-01-15', now()),
  ('j''peux oublier',                     'déclaré',       true,  '2026-01-01', '2026-01-16', now()),
  ('la porte du cimetière',               'non_déclaré',   true,  '2026-01-01', '2026-01-17', now()),
  ('toi toi toi',                         'déclaré',       true,  '2026-01-01', '2026-01-18', now()),
  ('fleur de peau',                       'non_déclaré',   true,  '2026-01-01', '2026-01-19', now()),
  ('Maladresse (ft. SKABE)',              'non_déclaré',   true,  '2026-01-01', NULL,         now()),
  ('joli visage',                         'non_déclaré',   true,  '2026-01-01', '2026-06-24', now())
ON CONFLICT DO NOTHING;

-- ============================================================
-- 2. PAYMENT BATCHES
-- ============================================================
INSERT INTO payment_batches (id, label, batch_count, created_at) VALUES
  ('00000000-0000-0000-0001-000000000001', 'Unifest — répétition + showcase',   2, '2025-10-01 00:00:00+00'),
  ('00000000-0000-0000-0001-000000000002', 'GP Explorer — répétition + showcase', 2, '2025-10-03 00:00:00+00'),
  ('00000000-0000-0000-0001-000000000003', 'MaMa Thomann — répétition + showcase', 2, '2025-10-15 00:00:00+00'),
  ('00000000-0000-0000-0001-000000000004', '5 cachets track janvier 2026', 5, '2026-01-15 00:00:00+00')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 3. PAYMENTS
-- Triggers auto-create management_fees and set expires_at.
-- artist_id is resolved dynamically from the manager profile.
-- ============================================================
DO $$
DECLARE
  v_artist_id    uuid;
  v_yakoi_id     uuid;
  v_bbt_id       uuid;
  v_plucemek_id  uuid;
  v_jpeux_id     uuid;
  v_laporte_id   uuid;
  v_toitoitoi_id uuid;
  v_fleurdepeau_id uuid;
BEGIN
  SELECT id INTO v_artist_id  FROM profiles WHERE role = 'manager' LIMIT 1;
  SELECT id INTO v_yakoi_id      FROM tracks WHERE title = 'yakoi!'                LIMIT 1;
  SELECT id INTO v_bbt_id        FROM tracks WHERE title = 'big big town'          LIMIT 1;
  SELECT id INTO v_plucemek_id   FROM tracks WHERE title = 'plucemek!'             LIMIT 1;
  SELECT id INTO v_jpeux_id      FROM tracks WHERE title = 'j''peux oublier'       LIMIT 1;
  SELECT id INTO v_laporte_id    FROM tracks WHERE title = 'la porte du cimetière' LIMIT 1;
  SELECT id INTO v_toitoitoi_id  FROM tracks WHERE title = 'toi toi toi'           LIMIT 1;
  SELECT id INTO v_fleurdepeau_id FROM tracks WHERE title = 'fleur de peau'        LIMIT 1;

  -- ── 2025 : Dali Tour (Premières parties) ──────────────────────────
  INSERT INTO payments (artist_id, amount, payment_date, status, source, territory,
                        counts_for_intermittence, notes, created_at)
  VALUES
    (v_artist_id, 383.93, '2025-02-28', 'payé', 'booking', 'france', true,
     'Lyon Dali - Transbordeur', now()),
    (v_artist_id, 122.00, '2025-03-14', 'payé', 'booking', 'france', true,
     'Lille Dali - Splendid', now()),
    (v_artist_id, 116.45, '2025-03-26', 'payé', 'booking', 'france', true,
     'Marseilles Dali - Espace Julien', now()),
    (v_artist_id, 116.34, '2025-03-27', 'payé', 'booking', 'france', true,
     'Nimes Dali - Paloma', now()),
    (v_artist_id, 119.01, '2025-04-20', 'payé', 'booking', 'france', true,
     'Paris William - Maroquinerie', now()),
    -- Genève : étranger, versé sans facture, Qt=0 → pas d'équivalent cachet
    (v_artist_id, 200.00, '2025-05-15', 'payé', 'booking', 'étranger', false,
     'Genève Dali — versé à BF sans facture le 15/05/2025', now()),
    (v_artist_id, 150.00, '2025-05-23', 'payé', 'booking', 'france', true,
     'Les ondées', now());

  -- ── Avance ZABETH tranche 1 ────────────────────────────────────────
  INSERT INTO payments (artist_id, amount, payment_date, status, source, territory,
                        counts_for_intermittence, notes, created_at)
  VALUES
    (v_artist_id, 5000.00, '2025-06-03', 'payé', 'label', 'france', false,
     'Avance ZABETH tranche 1 — 50% à signature contrat', now());

  -- ── yakoi! — clip + tracks ─────────────────────────────────────────
  INSERT INTO payments (artist_id, track_id, amount, payment_date, status, source, territory,
                        counts_for_intermittence, notes, created_at)
  VALUES
    (v_artist_id, v_yakoi_id, 253.55, '2025-07-25', 'payé', 'clip', 'france', true,
     'yakoi! — clip', now()),
    (v_artist_id, v_yakoi_id, 300.00, '2025-08-10', 'payé', 'track', 'france', true,
     'yakoi! — cachet track #1', now()),
    (v_artist_id, v_yakoi_id, 300.00, '2025-08-10', 'payé', 'track', 'france', true,
     'yakoi! — cachet track #2', now());

  -- ── Unifest (étranger) — batch ────────────────────────────────────
  INSERT INTO payments (artist_id, batch_id, amount, payment_date, status, source, territory,
                        counts_for_intermittence, notes, created_at)
  VALUES
    (v_artist_id, '00000000-0000-0000-0001-000000000001',
     450.00, '2025-10-01', 'payé', 'booking', 'étranger', true,
     'Unifest — répétition', now()),
    (v_artist_id, '00000000-0000-0000-0001-000000000001',
     850.00, '2025-10-02', 'payé', 'booking', 'étranger', true,
     'Unifest — showcase', now());

  -- ── GP Explorer — batch ───────────────────────────────────────────
  INSERT INTO payments (artist_id, batch_id, amount, payment_date, status, source, territory,
                        counts_for_intermittence, notes, created_at)
  VALUES
    (v_artist_id, '00000000-0000-0000-0001-000000000002',
     190.00, '2025-10-03', 'payé', 'booking', 'france', true,
     'GP Explorer — répétition', now()),
    (v_artist_id, '00000000-0000-0000-0001-000000000002',
     690.00, '2025-10-04', 'payé', 'booking', 'france', true,
     'GP Explorer — showcase', now());

  -- ── MaMa Thomann — batch ─────────────────────────────────────────
  INSERT INTO payments (artist_id, batch_id, amount, payment_date, status, source, territory,
                        counts_for_intermittence, notes, created_at)
  VALUES
    (v_artist_id, '00000000-0000-0000-0001-000000000003',
     450.00, '2025-10-15', 'payé', 'booking', 'france', true,
     'MaMa Thomann — répétition', now()),
    (v_artist_id, '00000000-0000-0000-0001-000000000003',
     2050.00, '2025-10-17', 'payé', 'booking', 'france', true,
     'MaMa Thomann — showcase', now());

  -- ── big big town — clip + track ───────────────────────────────────
  INSERT INTO payments (artist_id, track_id, amount, payment_date, status, source, territory,
                        counts_for_intermittence, notes, created_at)
  VALUES
    (v_artist_id, v_bbt_id, 253.55, '2025-12-04', 'payé', 'clip', 'france', true,
     'Big Big Town — clip', now()),
    (v_artist_id, v_bbt_id, 300.00, '2025-12-05', 'payé', 'track', 'france', true,
     'Big Big Town — cachet track', now());

  -- ── Fin 2025 / facturé ────────────────────────────────────────────
  INSERT INTO payments (artist_id, amount, payment_date, status, source, territory,
                        counts_for_intermittence, notes, created_at)
  VALUES
    (v_artist_id, 150.00, '2025-12-09', 'facturé', 'booking', 'étranger', true,
     'Blowsom - AB Club — payé à VEGA, en attente de cachet', now()),
    -- Supersonic : répétition + train iNOUÏS déduits → commission_base = 0
    (v_artist_id, 400.00, '2026-01-07', 'facturé', 'booking', 'france', true,
     'Supersonic Aaaaah — répétition + train iNOUÏS déduits', now());

  -- ── 5 cachets track janvier 2026 — batch ─────────────────────────
  INSERT INTO payments (artist_id, track_id, batch_id, amount, payment_date, status, source, territory,
                        counts_for_intermittence, notes, created_at)
  VALUES
    (v_artist_id, v_plucemek_id, '00000000-0000-0000-0001-000000000004',
     300.00, '2026-01-15', 'payé', 'track', 'france', true, 'plucemek!', now()),
    (v_artist_id, v_jpeux_id, '00000000-0000-0000-0001-000000000004',
     300.00, '2026-01-16', 'payé', 'track', 'france', true, 'j''peux oublier', now()),
    (v_artist_id, v_laporte_id, '00000000-0000-0000-0001-000000000004',
     300.00, '2026-01-17', 'payé', 'track', 'france', true, 'la porte du cimetière', now()),
    (v_artist_id, v_toitoitoi_id, '00000000-0000-0000-0001-000000000004',
     300.00, '2026-01-18', 'payé', 'track', 'france', true, 'toi toi toi', now()),
    (v_artist_id, v_fleurdepeau_id, '00000000-0000-0000-0001-000000000004',
     300.00, '2026-01-19', 'payé', 'track', 'france', true, 'fleur de peau', now());

  -- ── Avance ZABETH tranche 2 ────────────────────────────────────────
  INSERT INTO payments (artist_id, amount, payment_date, status, source, territory,
                        counts_for_intermittence, notes, created_at)
  VALUES
    (v_artist_id, 5000.00, '2026-02-04', 'payé', 'label', 'france', false,
     'Avance ZABETH tranche 2 — 50% à sortie 6e titre', now());

  -- ── Premières parties aupinard ─────────────────────────────────────
  INSERT INTO payments (artist_id, amount, payment_date, status, source, territory,
                        counts_for_intermittence, notes, created_at)
  VALUES
    (v_artist_id, 500.00, '2026-03-14', 'payé', 'booking', 'france', true,
     'Aupinard — 1ère partie Nice', now()),
    (v_artist_id, 200.00, '2026-04-03', 'payé', 'booking', 'france', true,
     'Aupinard — 1ère partie Paris', now()),
    (v_artist_id, 300.00, '2026-04-24', 'payé', 'booking', 'france', true,
     'Chantier des Francopholies — accompagnement', now());

  -- ── Cachet en attente ─────────────────────────────────────────────
  INSERT INTO payments (artist_id, amount, payment_date, status, source, territory,
                        counts_for_intermittence, notes, created_at)
  VALUES
    (v_artist_id, 500.00, '2026-05-28', 'facturé', 'booking', 'france', true,
     'Montreuil - Le Chinois — facturé par VEGA, en attente de cachet', now()),
    (v_artist_id, 1700.00, '2026-06-05', 'cachet_en_attente', 'booking', 'france', true,
     'Chalouz — festival', now()),
    (v_artist_id, 253.55, '2026-06-24', 'cachet_en_attente', 'clip', 'france', true,
     'Clip joli visage', now()),
    (v_artist_id, 140.00, '2026-07-10', 'cachet_en_attente', 'résidence', 'france', true,
     'Francos (répétition) — 2 cachets/jour pris en charge par le FAIR', now()),
    (v_artist_id, 140.00, '2026-07-11', 'cachet_en_attente', 'résidence', 'france', true,
     'Francos (répétition) — 2 cachets/jour pris en charge par le FAIR', now()),
    (v_artist_id, 350.00, '2026-07-14', 'cachet_en_attente', 'booking', 'france', true,
     'Festival des Francopholies', now()),
    (v_artist_id, 400.00, '2026-09-10', 'provisoire', 'booking', 'france', true,
     'Noize TBC — à confirmer cet été', now()),
    (v_artist_id, 400.00, '2026-09-15', 'cachet_en_attente', 'booking', 'france', true,
     'La Java', now()),
    (v_artist_id, 300.00, '2026-10-24', 'cachet_en_attente', 'booking', 'france', true,
     'Première partie Folies — facture à convertir en cachet', now());

  -- Fix Supersonic : deductible_expenses set post-insert (trigger recalculates commission)
  UPDATE payments
  SET deductible_expenses = 400.00
  WHERE artist_id = v_artist_id
    AND notes LIKE 'Supersonic Aaaaah%'
    AND payment_date = '2026-01-07';

END $$;

-- ============================================================
-- 4. SACEM STATEMENTS
-- ============================================================
INSERT INTO sacem_statements (id, period, imported_at, source_file) VALUES
  ('00000000-0000-0000-0002-000000000670', 'SACEM 670 — Q1 2025', '2025-04-04 00:00:00+00', 'Suivi financier_BLOU FEET.xlsx'),
  ('00000000-0000-0000-0002-000000000671', 'SACEM 671 — Q2/Q3 2025', '2025-07-04 00:00:00+00', 'Suivi financier_BLOU FEET.xlsx'),
  ('00000000-0000-0000-0002-000000000672', 'SACEM 672 — Q3 2025', '2025-10-06 00:00:00+00', 'Suivi financier_BLOU FEET.xlsx'),
  ('00000000-0000-0000-0002-000000000673', 'SACEM 673 — Jan 2026', '2026-01-07 00:00:00+00', 'Suivi financier_BLOU FEET.xlsx'),
  ('00000000-0000-0000-0002-000000000674', 'SACEM 674 — Avr 2026', '2026-04-07 00:00:00+00', 'Suivi financier_BLOU FEET.xlsx')
ON CONFLICT DO NOTHING;

-- SACEM 670 lines
INSERT INTO sacem_statement_lines (statement_id, raw_title, amount, matched) VALUES
  ('00000000-0000-0000-0002-000000000670', 'J''Crois Pas Qu''On Devrait Se Voir',  32.73, false),
  ('00000000-0000-0000-0002-000000000670', 'Laisse Le Temps Faire',                20.46, false),
  ('00000000-0000-0000-0002-000000000670', 'Martini',                               3.40, false),
  ('00000000-0000-0000-0002-000000000670', 'Martini - Instrumental',                0.04, false),
  ('00000000-0000-0000-0002-000000000670', 'Martini - Sped Up',                     0.18, false),
  ('00000000-0000-0000-0002-000000000670', 'Martini - Vhs',                         0.08, false),
  ('00000000-0000-0000-0002-000000000670', 'Ne M''En Veux Pas',                   126.65, false),
  ('00000000-0000-0000-0002-000000000670', 'Pas Ma Faute',                         36.88, false),
  ('00000000-0000-0000-0002-000000000670', 'Sables Mouvants',                      41.10, false),
  ('00000000-0000-0000-0002-000000000670', 'Une Fois Pas Deux',                    64.41, false)
ON CONFLICT DO NOTHING;

-- SACEM 671 lines
INSERT INTO sacem_statement_lines (statement_id, raw_title, amount, matched) VALUES
  ('00000000-0000-0000-0002-000000000671', 'Adrenaline',                            3.53, false),
  ('00000000-0000-0000-0002-000000000671', 'Ambre',                                88.26, false),
  ('00000000-0000-0000-0002-000000000671', 'J''Crois Pas Qu''On Devrait Se Voir', 118.84, false),
  ('00000000-0000-0000-0002-000000000671', 'Laisse Le Temps Faire',                28.63, false),
  ('00000000-0000-0000-0002-000000000671', 'Martini',                               6.20, false),
  ('00000000-0000-0000-0002-000000000671', 'Martini - Instrumental',                0.02, false),
  ('00000000-0000-0000-0002-000000000671', 'Martini - Sped Up',                     0.04, false),
  ('00000000-0000-0000-0002-000000000671', 'Martini - Vhs',                         0.04, false),
  ('00000000-0000-0000-0002-000000000671', 'Ne M''En Veux Pas',                   140.75, false),
  ('00000000-0000-0000-0002-000000000671', 'Pas Ma Faute',                         38.86, false),
  ('00000000-0000-0000-0002-000000000671', 'Sables Mouvants',                      43.52, false),
  ('00000000-0000-0000-0002-000000000671', 'Une Fois Pas Deux',                    95.48, false)
ON CONFLICT DO NOTHING;

-- SACEM 672 lines
INSERT INTO sacem_statement_lines (statement_id, raw_title, amount, matched) VALUES
  ('00000000-0000-0000-0002-000000000672', 'Adrenaline',                            7.81, false),
  ('00000000-0000-0000-0002-000000000672', 'Ambre',                               146.13, false),
  ('00000000-0000-0000-0002-000000000672', 'Cordyceps',                            62.43, false),
  ('00000000-0000-0000-0002-000000000672', 'J''Crois Pas Qu''On Devrait Se Voir', 107.99, false),
  ('00000000-0000-0000-0002-000000000672', 'Laisse Le Temps Faire',                23.60, false),
  ('00000000-0000-0000-0002-000000000672', 'Martini',                               5.70, false),
  ('00000000-0000-0000-0002-000000000672', 'Martini - Instrumental',                0.04, false),
  ('00000000-0000-0000-0002-000000000672', 'Martini - Sped Up',                     0.18, false),
  ('00000000-0000-0000-0002-000000000672', 'Martini - Vhs',                         0.04, false),
  ('00000000-0000-0000-0002-000000000672', 'Ne M''En Veux Pas',                   121.27, false),
  ('00000000-0000-0000-0002-000000000672', 'Pas Ma Faute',                         40.07, false),
  ('00000000-0000-0000-0002-000000000672', 'Sables Mouvants',                      35.91, false),
  ('00000000-0000-0000-0002-000000000672', 'Une Fois Pas Deux',                    67.27, false)
ON CONFLICT DO NOTHING;

-- SACEM 673 lines (Yakoi commissionnable)
INSERT INTO sacem_statement_lines (statement_id, raw_title, amount, matched) VALUES
  ('00000000-0000-0000-0002-000000000673', 'Ambre',                               130.89, false),
  ('00000000-0000-0000-0002-000000000673', 'Ne M''En Veux Pas',                   104.14, false),
  ('00000000-0000-0000-0002-000000000673', 'J''Crois Pas Qu''On Devrait Se Voir',  83.72, false),
  ('00000000-0000-0000-0002-000000000673', 'Une Fois Pas Deux',                    59.07, false),
  ('00000000-0000-0000-0002-000000000673', 'Pas Ma Faute',                         39.63, false),
  ('00000000-0000-0000-0002-000000000673', 'Cordyceps',                            36.25, false),
  ('00000000-0000-0000-0002-000000000673', 'Sables Mouvants',                      35.25, false),
  ('00000000-0000-0000-0002-000000000673', 'Laisse Le Temps Faire',                18.00, false),
  ('00000000-0000-0000-0002-000000000673', 'Yakoi',                                15.74, false),
  ('00000000-0000-0000-0002-000000000673', 'Martini',                               4.69, false),
  ('00000000-0000-0000-0002-000000000673', 'Adrenaline',                            1.29, false),
  ('00000000-0000-0000-0002-000000000673', 'Martini Sped Up',                       0.20, false),
  ('00000000-0000-0000-0002-000000000673', 'Martini Instrumental',                  0.04, false),
  ('00000000-0000-0000-0002-000000000673', 'Part Live',                            30.95, false)
ON CONFLICT DO NOTHING;

-- SACEM 674 lines
INSERT INTO sacem_statement_lines (statement_id, raw_title, amount, matched) VALUES
  ('00000000-0000-0000-0002-000000000674', 'Ambre - Track',                       159.74, false),
  ('00000000-0000-0000-0002-000000000674', 'Ambre - Spectacle',                    31.58, false),
  ('00000000-0000-0000-0002-000000000674', 'Ne M''En Veux Pas - Track',           115.33, false),
  ('00000000-0000-0000-0002-000000000674', 'Ne M''En Veux Pas - Spectacle',        17.80, false),
  ('00000000-0000-0000-0002-000000000674', 'Cordyceps - Track',                   129.89, false),
  ('00000000-0000-0000-0002-000000000674', 'J''Crois Pas Qu''On Devrait Se Voir - Track', 89.52, false),
  ('00000000-0000-0000-0002-000000000674', 'J''Crois Pas Qu''On Devrait Se Voir - Spectacle', 5.48, false),
  ('00000000-0000-0000-0002-000000000674', 'Yakoi - Track',                        74.63, false),
  ('00000000-0000-0000-0002-000000000674', 'Yakoi - Spectacle',                    12.32, false),
  ('00000000-0000-0000-0002-000000000674', 'Une Fois Pas Deux - Track',            58.95, false),
  ('00000000-0000-0000-0002-000000000674', 'Une Fois Pas Deux - Spectacle',         5.48, false),
  ('00000000-0000-0000-0002-000000000674', 'Pas Ma Faute - Track',                 37.11, false),
  ('00000000-0000-0000-0002-000000000674', 'Pas Ma Faute - Spectacle',              5.48, false),
  ('00000000-0000-0000-0002-000000000674', 'Sables Mouvants - Track',              35.65, false),
  ('00000000-0000-0000-0002-000000000674', 'Sables Mouvants - Spectacle',           5.48, false),
  ('00000000-0000-0000-0002-000000000674', 'Laisse Le Temps Faire - Track',        18.59, false),
  ('00000000-0000-0000-0002-000000000674', 'Laisse Le Temps Faire - Spectacle',     5.48, false),
  ('00000000-0000-0000-0002-000000000674', 'Martini - Track',                       4.13, false),
  ('00000000-0000-0000-0002-000000000674', 'Adrenaline - Track',                    1.11, false),
  ('00000000-0000-0000-0002-000000000674', 'Martini Sped Up - Track',               0.06, false)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 5. EXPENSES — NDF Paul (frais manager)
-- ============================================================
INSERT INTO expenses (amount, description, status, created_at) VALUES
  (300.00, 'Achat carte son',                                       'remboursée', '2026-01-17 00:00:00+00'),
  (500.00, 'Paiement musicien Thomas D''Angelo (Supersonic + autres)', 'remboursée', '2026-02-04 00:00:00+00'),
  (400.00, 'Paiement musicien Malo Kerouillé',                       'remboursée', '2026-02-04 00:00:00+00'),
  (150.00, 'Paiement invité scène Wilson Hinh (Cumulus)',            'remboursée', '2026-02-04 00:00:00+00');

-- ============================================================
-- 6. VERSEMENT COMMISSION — 1 329,60 € versé le 2025-07-01
-- Distribué de façon greedy sur les fees les plus anciennes (payé).
-- ============================================================
DO $$
DECLARE
  v_budget   numeric := 1329.60;
  v_remaining numeric := 1329.60;
  rec        record;
  v_pay      numeric;
BEGIN
  -- Iterate over management_fees ordered by payment_date ascending
  FOR rec IN
    SELECT mf.id, mf.commission_due
    FROM management_fees mf
    JOIN payments p ON mf.payment_id = p.id
    WHERE p.status = 'payé'
      AND mf.commission_due > 0
    ORDER BY p.payment_date ASC, p.created_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_pay := LEAST(rec.commission_due, v_remaining);
    UPDATE management_fees
    SET already_paid_to_manager = v_pay,
        status = CASE WHEN v_pay >= commission_due THEN 'versée' ELSE 'due' END
    WHERE id = rec.id;
    v_remaining := v_remaining - v_pay;
  END LOOP;
END $$;
