-- Allow the artist role to create and update tasks that involve them
-- (assignee_role 'artist' or 'both'), and allow either role to insert a
-- notification row for the other — needed for cross-role push notifications.
-- See docs/superpowers/specs/2026-07-18-push-notifications-design.md
DROP POLICY IF EXISTS "tasks_write"  ON tasks;
DROP POLICY IF EXISTS "tasks_update" ON tasks;
CREATE POLICY "tasks_write" ON tasks FOR INSERT TO authenticated
  WITH CHECK (
    current_user_role() = 'manager'
    OR assignee_role IN ('artist', 'both')
  );
CREATE POLICY "tasks_update" ON tasks FOR UPDATE TO authenticated
  USING (
    current_user_role() = 'manager'
    OR assignee_role IN ('artist', 'both')
  );

DROP POLICY IF EXISTS "notifs_insert" ON notifications;
CREATE POLICY "notifs_insert" ON notifications FOR INSERT TO authenticated
  WITH CHECK (true);
