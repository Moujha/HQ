-- Restrict signup: only the manager email may register as manager,
-- only emails with a pending artist_invites row may register as artist.
-- See docs/superpowers/specs/2026-07-20-restricted-signup-design.md

-- ============================================================
-- artist_invites
-- ============================================================
CREATE TABLE IF NOT EXISTS artist_invites (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       text NOT NULL UNIQUE CHECK (email = lower(trim(email))),
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'consumed', 'revoked')),
  invited_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz
);

ALTER TABLE artist_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "artist_invites_manager_only" ON artist_invites;
CREATE POLICY "artist_invites_manager_only" ON artist_invites FOR ALL TO authenticated
  USING (current_user_role() = 'manager')
  WITH CHECK (current_user_role() = 'manager');

-- ============================================================
-- Before User Created hook: gate who may sign up.
-- Wired to this function manually via Authentication -> Hooks in the
-- Supabase Dashboard (no IaC for this in the current environment).
-- ============================================================
CREATE OR REPLACE FUNCTION public.restrict_signup(event jsonb)
RETURNS jsonb AS $$
DECLARE
  new_email text := lower(trim(event->'user'->>'email'));
BEGIN
  IF new_email = 'paul.bourdon.pro@gmail.com' THEN
    RETURN '{}'::jsonb;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.artist_invites
    WHERE email = new_email AND status = 'pending'
  ) THEN
    RETURN '{}'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'error', jsonb_build_object(
      'message', 'Cet email n''est pas autorisé à créer un compte.',
      'http_code', 403
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.restrict_signup TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.restrict_signup FROM authenticated, anon, public;

-- ============================================================
-- handle_new_user: derive role from email/invite instead of trusting
-- client-supplied metadata, and consume the matching invite. This only
-- runs after auth.users insert succeeds, i.e. after restrict_signup has
-- already allowed the signup — so it's safe to mark the invite consumed
-- here rather than inside the hook itself (avoids burning an invite on
-- a signup that fails for an unrelated reason, e.g. weak password).
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  resolved_role text;
  new_email text := lower(trim(NEW.email));
BEGIN
  IF new_email = 'paul.bourdon.pro@gmail.com' THEN
    resolved_role := 'manager';
  ELSE
    resolved_role := 'artist';
    UPDATE public.artist_invites
      SET status = 'consumed', consumed_at = now()
      WHERE email = new_email AND status = 'pending';
  END IF;

  INSERT INTO public.profiles (user_id, display_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    resolved_role
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
