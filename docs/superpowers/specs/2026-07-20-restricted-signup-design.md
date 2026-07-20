# Restricted signup — design spec

## Problem

Today, `/auth` lets anyone sign up with any email/password. `handle_new_user()`
defaults every new account to `role = 'manager'` unless the signup call passes
a `role` in its metadata — which the client controls, so it can't be trusted.
There is no path in the app that ever sets `role = 'artist'`. In short: anyone
who finds the URL can register and get full manager access to BLOU FEET's
finances.

The client-side `supabase.auth.signUp()` call can also be invoked directly
against the Supabase project (the anon key is public in the bundle), so
hiding or changing app UI does not close this — enforcement must happen
server-side, in Supabase itself.

## Goals

1. Only `paul.bourdon.pro@gmail.com` can ever register as `manager`.
2. Only emails the manager has explicitly invited can register as `artist`.
3. Every other signup attempt is rejected with a clear error.
4. No existing accounts to migrate (confirmed clean slate — this only gates
   new signups).

## Architecture

### Enforcement: Supabase "Before User Created" Auth Hook

A new Postgres function is registered as a **Before User Created** Auth Hook
(Authentication → Hooks in the Supabase Dashboard — a one-time manual step,
consistent with how migrations are already run manually in this project).
The hook fires before every signup and can reject it outright.

Logic (case-insensitive, trimmed email comparison throughout):

- Email equals `paul.bourdon.pro@gmail.com` → allow (manager).
- Otherwise, look up the email in `artist_invites`. If a row exists with
  `status = 'pending'` → allow (artist); the matching row is marked
  `consumed` afterward by `handle_new_user()` (see "Role assignment" below),
  not by the hook itself.
- Otherwise → raise an exception with message
  `"Cet email n'est pas autorisé à créer un compte."`, which Supabase Auth
  surfaces as the `signUp()` error. The existing `catch` block in `auth.tsx`
  already toasts `err.message`, so no client-side error-handling change is
  needed.

### Role assignment

`handle_new_user()` (the existing `AFTER INSERT ON auth.users` trigger) stops
trusting `raw_user_meta_data->>'role'` from the client. By the time it fires,
the Before User Created hook has already guaranteed the signup email is
either the manager email or a freshly-consumed artist invite, so role is
derived purely from that:

- Email equals `paul.bourdon.pro@gmail.com` → `role = 'manager'`.
- Otherwise → `role = 'artist'`.

### Data model — `artist_invites`

New table, new migration file (append-only per project convention — never
edit existing migrations):

```sql
CREATE TABLE artist_invites (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       text NOT NULL UNIQUE,       -- stored lowercase
  status      text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'consumed', 'revoked')),
  invited_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz
);

ALTER TABLE artist_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "artist_invites_manager_only" ON artist_invites FOR ALL
  TO authenticated
  USING (current_user_role() = 'manager')
  WITH CHECK (current_user_role() = 'manager');
```

Creating/re-sending an invite is an **upsert on `email`**: if a row already
exists (e.g. previously `revoked` or `consumed`, or a typo corrected), it's
reset to `pending` with a fresh `created_at`, `invited_by`, and
`consumed_at = null`, rather than erroring on the unique constraint.

### Rejected alternative

Disabling public signup entirely and building a custom server-side signup
endpoint (using the existing `createServerFn` + service-role client pattern,
calling `supabase.auth.admin.createUser()` after validating the email) would
also work, but duplicates functionality Supabase's built-in signup already
provides, for no additional security benefit over the hook. Fallback only if
Before User Created hooks turn out to be unavailable on the current Supabase
plan tier — to be verified during implementation.

## UI changes

### `/invitations` — new manager-only route

- Redirects away if `profile.role !== 'manager'` (same guard pattern as other
  manager-only surfaces).
- Form: email input + "Envoyer l'invitation" button → upserts a `pending`
  row in `artist_invites` as described above.
- List of existing invites below the form: email, status badge (en attente /
  utilisée / révoquée), created date.
- Each `pending` invite has a "Révoquer" action (`status = 'revoked'`).
- Copy makes clear no email is actually sent: something like "Communique cet
  email à l'artiste — il pourra créer son compte avec." This is a manual
  allowlist, not an emailed invite link — no Resend integration involved.

### `AppHeader`

New icon button (`UserPlus` from lucide-react) next to the notification
bell, visible only when `profile?.role === 'manager'`, linking to
`/invitations`.

### `auth.tsx`

Copy tweak only: "Créer un compte manager" → "Créer un compte" in signup
mode, since signup can now result in either role depending on which path the
hook allowed through. No other client-side logic changes — the existing
`supabase.auth.signUp()` call, loading states, and error toast all stay as
they are.

## Edge cases

- Case-insensitive/trimmed email matching everywhere (hook check, invite
  storage, upsert) — avoids a silent mismatch like `Paul@X.com` vs
  `paul@x.com`.
- Re-inviting a revoked or consumed email works via upsert, not a unique
  constraint error.
- Existing manager session/login is unaffected — the hook only fires on
  account *creation*, not sign-in.

## Testing

- Vitest coverage for the invite upsert logic (reset-to-pending behavior) if
  it's extracted into a shared helper rather than inlined in the route.
- Manual verification post-deploy (per project convention — no local
  Supabase Auth Hooks testing available): attempt signup with an
  unauthorized email (expect rejection), the manager email (expect
  `role = 'manager'`), and an invited email (expect `role = 'artist'`,
  invite flips to `consumed`).

## Manual steps owed after implementation

1. Run the new migration via the Supabase Dashboard SQL Editor.
2. Wire the Before User Created Auth Hook to the new Postgres function via
   Authentication → Hooks in the Supabase Dashboard.
