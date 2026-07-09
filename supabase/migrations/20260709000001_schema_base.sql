-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name         text NOT NULL DEFAULT '',
  role                 text NOT NULL DEFAULT 'manager' CHECK (role IN ('manager', 'artist')),
  onboarded            bool NOT NULL DEFAULT false,
  commission_start_date date DEFAULT '2025-01-01',
  UNIQUE (user_id)
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (user_id, display_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'manager')
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- payment_batches
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_batches (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  label       text,
  batch_count int NOT NULL DEFAULT 1,
  created_at  timestamptz DEFAULT now()
);

-- ============================================================
-- tracks
-- ============================================================
CREATE TABLE IF NOT EXISTS tracks (
  id                     uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title                  text NOT NULL,
  release_date           date,
  is_commissionable      bool NOT NULL DEFAULT true,
  is_commissionable_since date,
  sacem_status           text NOT NULL DEFAULT 'non_déclaré'
    CHECK (sacem_status IN ('non_déclaré','programme_en_draft','déclaré','étranger','non_applicable')),
  sacem_declared_at      date,
  notes                  text,
  created_at             timestamptz DEFAULT now()
);

-- ============================================================
-- events
-- ============================================================
CREATE TABLE IF NOT EXISTS events (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title       text NOT NULL,
  event_date  date NOT NULL,
  location    text,
  type        text CHECK (type IN ('concert','répétition','résidence','autre')),
  status      text NOT NULL DEFAULT 'TBC' CHECK (status IN ('confirmé','TBC','annulé')),
  gcal_event_id text,
  created_at  timestamptz DEFAULT now()
);

-- ============================================================
-- payments  (central table)
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id                     uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  artist_id              uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  track_id               uuid REFERENCES tracks(id) ON DELETE SET NULL,
  batch_id               uuid REFERENCES payment_batches(id) ON DELETE SET NULL,
  event_id               uuid REFERENCES events(id) ON DELETE SET NULL,
  amount                 numeric(10,2) NOT NULL,
  payment_date           date,
  expires_at             date,
  status                 text NOT NULL DEFAULT 'provisoire'
    CHECK (status IN ('provisoire','facturé','cachet_en_attente','payé')),
  source                 text NOT NULL DEFAULT 'booking'
    CHECK (source IN ('label','booking','clip','track','résidence','figuration')),
  territory              text NOT NULL DEFAULT 'france'
    CHECK (territory IN ('france','étranger')),
  counts_for_intermittence bool NOT NULL DEFAULT true,
  deductible_expenses    numeric(10,2) NOT NULL DEFAULT 0,
  notes                  text,
  created_by             uuid REFERENCES auth.users(id),
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);

-- ============================================================
-- management_fees  (auto-created by trigger on payments INSERT)
-- ============================================================
CREATE TABLE IF NOT EXISTS management_fees (
  id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id              uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  net_base                numeric(10,2) NOT NULL DEFAULT 0,
  commission_rate         numeric(4,3) NOT NULL DEFAULT 0.15,
  is_commissionable       bool NOT NULL DEFAULT true,
  commission_due          numeric(10,2) NOT NULL DEFAULT 0,
  status                  text NOT NULL DEFAULT 'projetée'
    CHECK (status IN ('projetée','due','versée')),
  already_paid_to_manager numeric(10,2) NOT NULL DEFAULT 0,
  created_at              timestamptz DEFAULT now(),
  UNIQUE (payment_id)
);

-- ============================================================
-- expenses  (NDF — note de frais du manager)
-- ============================================================
CREATE TABLE IF NOT EXISTS expenses (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id   uuid REFERENCES payments(id) ON DELETE SET NULL,
  amount       numeric(10,2) NOT NULL,
  description  text NOT NULL,
  status       text NOT NULL DEFAULT 'à_rembourser'
    CHECK (status IN ('à_rembourser','remboursée')),
  tricount_ref text,
  created_at   timestamptz DEFAULT now()
);

-- ============================================================
-- tasks
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title         text NOT NULL,
  description   text,
  assignee_role text NOT NULL DEFAULT 'manager'
    CHECK (assignee_role IN ('manager','artist','both')),
  priority      text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('normal','urgent')),
  status        text NOT NULL DEFAULT 'à_faire'
    CHECK (status IN ('à_faire','en_cours','fait')),
  deadline      date,
  payment_id    uuid REFERENCES payments(id) ON DELETE SET NULL,
  created_at    timestamptz DEFAULT now()
);

-- ============================================================
-- grants  (subventions)
-- ============================================================
CREATE TABLE IF NOT EXISTS grants (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title             text NOT NULL,
  organisme         text,
  categorie         text,
  status            text NOT NULL DEFAULT 'à_instruire'
    CHECK (status IN ('à_instruire','dossier_en_cours','déposé','obtenu','refusé','en_attente','inéligible')),
  priority          text CHECK (priority IN ('haute','moyenne','basse')),
  montant_max       numeric(10,2),
  deadline_depot    date,
  date_depot        date,
  resultat_attendu  text,
  structure_required bool NOT NULL DEFAULT false,
  lien_dossier      text,
  notes             text,
  created_at        timestamptz DEFAULT now()
);

-- ============================================================
-- sacem_statements + lines
-- ============================================================
CREATE TABLE IF NOT EXISTS sacem_statements (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  period      text NOT NULL,
  imported_at timestamptz DEFAULT now(),
  source_file text
);

CREATE TABLE IF NOT EXISTS sacem_statement_lines (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  statement_id uuid NOT NULL REFERENCES sacem_statements(id) ON DELETE CASCADE,
  track_id     uuid REFERENCES tracks(id) ON DELETE SET NULL,
  raw_title    text NOT NULL,
  amount       numeric(10,2) NOT NULL,
  matched      bool NOT NULL DEFAULT false,
  UNIQUE (statement_id, raw_title)
);

-- ============================================================
-- push_subscriptions
-- ============================================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint   text NOT NULL UNIQUE,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- notifications  (in-app)
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_role text NOT NULL CHECK (recipient_role IN ('manager','artist','both')),
  title          text NOT NULL,
  body           text,
  is_read        bool NOT NULL DEFAULT false,
  created_at     timestamptz DEFAULT now()
);

-- index for common queries
CREATE INDEX IF NOT EXISTS idx_payments_artist_id ON payments(artist_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_expires_at ON payments(expires_at);
CREATE INDEX IF NOT EXISTS idx_management_fees_status ON management_fees(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_role ON tasks(assignee_role);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
