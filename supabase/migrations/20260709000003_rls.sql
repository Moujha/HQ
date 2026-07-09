-- ============================================================
-- Enable RLS on all tables
-- ============================================================
ALTER TABLE profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_batches     ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE management_fees     ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE events              ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks               ENABLE ROW LEVEL SECURITY;
ALTER TABLE grants              ENABLE ROW LEVEL SECURITY;
ALTER TABLE sacem_statements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE sacem_statement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications       ENABLE ROW LEVEL SECURITY;

-- Helper: get the role of the current authenticated user
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS text AS $$
  SELECT role FROM profiles WHERE user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- profiles: everyone reads their own, manager reads all
-- ============================================================
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR current_user_role() = 'manager');

CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- payments: manager has full access, artist sees own rows
-- ============================================================
CREATE POLICY "payments_select" ON payments FOR SELECT TO authenticated
  USING (
    current_user_role() = 'manager'
    OR artist_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "payments_insert" ON payments FOR INSERT TO authenticated
  WITH CHECK (current_user_role() = 'manager');

CREATE POLICY "payments_update" ON payments FOR UPDATE TO authenticated
  USING (current_user_role() = 'manager');

CREATE POLICY "payments_delete" ON payments FOR DELETE TO authenticated
  USING (current_user_role() = 'manager');

-- ============================================================
-- management_fees: manager only
-- ============================================================
CREATE POLICY "fees_all" ON management_fees FOR ALL TO authenticated
  USING (current_user_role() = 'manager');

-- ============================================================
-- expenses: manager only
-- ============================================================
CREATE POLICY "expenses_all" ON expenses FOR ALL TO authenticated
  USING (current_user_role() = 'manager');

-- ============================================================
-- payment_batches: manager only
-- ============================================================
CREATE POLICY "batches_all" ON payment_batches FOR ALL TO authenticated
  USING (current_user_role() = 'manager');

-- ============================================================
-- tracks: manager only
-- ============================================================
CREATE POLICY "tracks_all" ON tracks FOR ALL TO authenticated
  USING (current_user_role() = 'manager');

-- ============================================================
-- events: manager full access, artist read
-- ============================================================
CREATE POLICY "events_select" ON events FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "events_write" ON events FOR INSERT TO authenticated
  WITH CHECK (current_user_role() = 'manager');

CREATE POLICY "events_update" ON events FOR UPDATE TO authenticated
  USING (current_user_role() = 'manager');

CREATE POLICY "events_delete" ON events FOR DELETE TO authenticated
  USING (current_user_role() = 'manager');

-- ============================================================
-- tasks: manager full access, artist reads tasks assigned to them
-- ============================================================
CREATE POLICY "tasks_select" ON tasks FOR SELECT TO authenticated
  USING (
    current_user_role() = 'manager'
    OR assignee_role IN ('artist', 'both')
  );

CREATE POLICY "tasks_write" ON tasks FOR INSERT TO authenticated
  WITH CHECK (current_user_role() = 'manager');

CREATE POLICY "tasks_update" ON tasks FOR UPDATE TO authenticated
  USING (current_user_role() = 'manager');

CREATE POLICY "tasks_delete" ON tasks FOR DELETE TO authenticated
  USING (current_user_role() = 'manager');

-- ============================================================
-- grants: manager only
-- ============================================================
CREATE POLICY "grants_all" ON grants FOR ALL TO authenticated
  USING (current_user_role() = 'manager');

-- ============================================================
-- sacem: manager only
-- ============================================================
CREATE POLICY "sacem_statements_all" ON sacem_statements FOR ALL TO authenticated
  USING (current_user_role() = 'manager');

CREATE POLICY "sacem_lines_all" ON sacem_statement_lines FOR ALL TO authenticated
  USING (current_user_role() = 'manager');

-- ============================================================
-- push_subscriptions: each user manages their own
-- ============================================================
CREATE POLICY "push_own" ON push_subscriptions FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- notifications: by role
-- ============================================================
CREATE POLICY "notifs_select" ON notifications FOR SELECT TO authenticated
  USING (
    recipient_role = current_user_role()
    OR recipient_role = 'both'
  );

CREATE POLICY "notifs_insert" ON notifications FOR INSERT TO authenticated
  WITH CHECK (current_user_role() = 'manager');

CREATE POLICY "notifs_update" ON notifications FOR UPDATE TO authenticated
  USING (true);
