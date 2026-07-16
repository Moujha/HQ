-- Additive read-only access for the artist role, needed so the cockpit
-- homepage can show real Tracks/Subventions/Finance data to the artist.
-- These are ADDITIONAL permissive policies — the existing manager-only
-- FOR ALL policies on these tables are untouched, so INSERT/UPDATE/DELETE
-- still require current_user_role() = 'manager'. Postgres ORs permissive
-- policies for the same command, same pattern as events_select.
CREATE POLICY "tracks_select_all" ON tracks FOR SELECT TO authenticated USING (true);
CREATE POLICY "grants_select_all" ON grants FOR SELECT TO authenticated USING (true);
CREATE POLICY "fees_select_all" ON management_fees FOR SELECT TO authenticated USING (true);
