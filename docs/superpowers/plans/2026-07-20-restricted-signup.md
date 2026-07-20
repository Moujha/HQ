# Restricted Signup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock signup so only `paul.bourdon.pro@gmail.com` can register as manager, and only emails the manager has explicitly invited can register as artist — enforced server-side, not just in the UI.

**Architecture:** A Supabase "Before User Created" Auth Hook (a Postgres function) rejects any signup whose email isn't the manager email or a `pending` row in a new `artist_invites` table. The existing `handle_new_user()` trigger (which only runs after a signup the hook already allowed) derives the profile's role purely from the email — never from client-supplied metadata — and marks the matching invite `consumed`. A new manager-only `/invitations` page lets the manager add/revoke invite emails.

**Tech Stack:** TanStack Start (React 19 + TypeScript), Supabase (Postgres + RLS + Auth), Tailwind v4 + shadcn/ui, react-hook-form + zod, Vitest.

## Global Constraints

- Manager email, hardcoded exactly as: `paul.bourdon.pro@gmail.com`.
- All email comparisons (hook, trigger, invite storage/upsert) are case-insensitive and trimmed: compare/store as `lower(trim(email))` in SQL, `email.trim().toLowerCase()` in TypeScript.
- No email is ever sent for an invite (per design: simple allowlist, no Resend integration). The manager communicates the email to the artist manually.
- New migration file only — never edit an existing file in `supabase/migrations/`.
- RLS on any new table follows the existing `current_user_role() = 'manager'` helper pattern already used elsewhere in `supabase/migrations/20260709000003_rls.sql`.
- `src/integrations/supabase/types.ts` is marked "automatically generated" but there is no Supabase CLI in this dev environment — it must be hand-edited to match the exact block shape used by existing tables (see Task 2).
- After this plan is fully implemented, two manual steps are owed to Paul (do not attempt to perform them yourself — they require Dashboard access this environment doesn't have): (1) run the new migration via the Supabase Dashboard SQL Editor, (2) wire the Before User Created Auth Hook to the new function via Authentication → Hooks in the Supabase Dashboard, selecting `public.restrict_signup`.

---

## File Structure

- **Create** `supabase/migrations/20260720000001_restricted_signup.sql` — `artist_invites` table + RLS, `restrict_signup` hook function, updated `handle_new_user()`.
- **Modify** `src/integrations/supabase/types.ts` — add the `artist_invites` table type block.
- **Create** `src/lib/invites.ts` — `normalizeInviteEmail`, the one pure/testable piece of logic in this feature.
- **Create** `src/lib/__tests__/invites.test.ts` — Vitest coverage for the above.
- **Create** `src/routes/_authenticated/invitations.tsx` — manager-only invite management page.
- **Modify** `src/components/app/AppHeader.tsx` — add a manager-only header icon linking to `/invitations`.
- **Modify** `src/routes/auth.tsx` — copy tweak (`"Créer un compte manager"` → `"Créer un compte"`), no logic change.
- **Regenerate** `src/routeTree.gen.ts` — TanStack Router's file-based routing regenerates this automatically on `pnpm dev`/`pnpm build`; it's tracked in git and must be committed alongside the new route.

---

### Task 1: Database migration — invites table, signup hook, role derivation

**Files:**
- Create: `supabase/migrations/20260720000001_restricted_signup.sql`

**Interfaces:**
- Produces: table `public.artist_invites` with columns `id uuid`, `email text UNIQUE`, `status text` (`'pending' | 'consumed' | 'revoked'`), `invited_by uuid`, `created_at timestamptz`, `consumed_at timestamptz | null`.
- Produces: Postgres function `public.restrict_signup(event jsonb) RETURNS jsonb` — the Before User Created hook target.
- Modifies: existing function `public.handle_new_user()` (referenced by the existing `on_auth_user_created` trigger — `CREATE OR REPLACE` updates its behavior without touching the trigger itself).

There is no local Supabase instance or CLI in this dev environment (per project convention — see `CLAUDE.md`), so this task has no automated test run. Verification is a careful read-through of the SQL for syntax/logic correctness; functional verification happens after Paul runs the migration and wires the hook manually (tracked as the plan's final manual steps).

- [ ] **Step 1: Write the migration file**

```sql
-- Restrict signup: only the manager email may register as manager,
-- only emails with a pending artist_invites row may register as artist.
-- See docs/superpowers/specs/2026-07-20-restricted-signup-design.md

-- ============================================================
-- artist_invites
-- ============================================================
CREATE TABLE IF NOT EXISTS artist_invites (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       text NOT NULL UNIQUE,
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
```

- [ ] **Step 2: Re-read the file for syntax correctness**

Check specifically: every `CREATE POLICY`/`CREATE FUNCTION` has a matching `DROP POLICY IF EXISTS`/`CREATE OR REPLACE` (idempotent re-run safety, matching the rest of `supabase/migrations/`); the `GRANT`/`REVOKE` lines target `supabase_auth_admin` (the role Supabase Auth hooks execute as); `SECURITY DEFINER SET search_path = public` is present on both functions (required — see the comment on the original `handle_new_user()` in `20260709000001_schema_base.sql`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260720000001_restricted_signup.sql
git commit -m "feat(auth): restrict signup to manager email + invited artist emails"
```

---

### Task 2: Generated types — add `artist_invites`

**Files:**
- Modify: `src/integrations/supabase/types.ts:453` (insert immediately after the `notifications` table block closes, before the `Tables` object's closing brace)

**Interfaces:**
- Consumes: nothing.
- Produces: `Database["public"]["Tables"]["artist_invites"]` with `Row`/`Insert`/`Update` shapes matching Task 1's schema — Task 4 relies on `supabase.from("artist_invites")` type-checking against this.

- [ ] **Step 1: Insert the table type block**

In `src/integrations/supabase/types.ts`, find this exact existing block (currently lines 427–454):

```typescript
      notifications: {
        Row: {
          id: string
          recipient_role: "manager" | "artist" | "both"
          title: string
          body: string | null
          is_read: boolean
          created_at: string
        }
        Insert: {
          id?: string
          recipient_role: "manager" | "artist" | "both"
          title: string
          body?: string | null
          is_read?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          recipient_role?: "manager" | "artist" | "both"
          title?: string
          body?: string | null
          is_read?: boolean
          created_at?: string
        }
        Relationships: []
      }
    }
```

Replace it with (adding the new block right before the `Tables` object's closing `}`):

```typescript
      notifications: {
        Row: {
          id: string
          recipient_role: "manager" | "artist" | "both"
          title: string
          body: string | null
          is_read: boolean
          created_at: string
        }
        Insert: {
          id?: string
          recipient_role: "manager" | "artist" | "both"
          title: string
          body?: string | null
          is_read?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          recipient_role?: "manager" | "artist" | "both"
          title?: string
          body?: string | null
          is_read?: boolean
          created_at?: string
        }
        Relationships: []
      }
      artist_invites: {
        Row: {
          id: string
          email: string
          status: "pending" | "consumed" | "revoked"
          invited_by: string | null
          created_at: string
          consumed_at: string | null
        }
        Insert: {
          id?: string
          email: string
          status?: "pending" | "consumed" | "revoked"
          invited_by?: string | null
          created_at?: string
          consumed_at?: string | null
        }
        Update: {
          id?: string
          email?: string
          status?: "pending" | "consumed" | "revoked"
          invited_by?: string | null
          created_at?: string
          consumed_at?: string | null
        }
        Relationships: []
      }
    }
```

- [ ] **Step 2: Typecheck**

Run: `eval "$(/opt/homebrew/bin/brew shellenv)" && pnpm exec tsc --noEmit`
Expected: no new errors (the file compiles — this table isn't referenced by any other code yet, so this step is purely a syntax sanity check on the hand-edit).

- [ ] **Step 3: Commit**

```bash
git add src/integrations/supabase/types.ts
git commit -m "feat(auth): add artist_invites to generated Supabase types"
```

---

### Task 3: Email normalization helper (TDD)

**Files:**
- Create: `src/lib/invites.ts`
- Test: `src/lib/__tests__/invites.test.ts`

**Interfaces:**
- Produces: `normalizeInviteEmail(email: string): string` — used by Task 4's invite form submit handler to match the SQL side's `lower(trim(email))` normalization exactly.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { normalizeInviteEmail } from "../invites";

describe("normalizeInviteEmail", () => {
  it("lowercases the email", () => {
    expect(normalizeInviteEmail("Paul@Example.com")).toBe("paul@example.com");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeInviteEmail("  paul@example.com  ")).toBe("paul@example.com");
  });

  it("leaves already-normalized input unchanged", () => {
    expect(normalizeInviteEmail("paul@example.com")).toBe("paul@example.com");
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `eval "$(/opt/homebrew/bin/brew shellenv)" && pnpm test -- invites.test.ts`
Expected: FAIL — `src/lib/invites.ts` does not exist / `normalizeInviteEmail` is not exported.

- [ ] **Step 3: Implement**

```typescript
export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}
```

- [ ] **Step 4: Run the test, confirm it passes**

Run: `eval "$(/opt/homebrew/bin/brew shellenv)" && pnpm test -- invites.test.ts`
Expected: PASS — 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/invites.ts src/lib/__tests__/invites.test.ts
git commit -m "feat(auth): add normalizeInviteEmail helper"
```

---

### Task 4: Invitations page + header entry point

**Files:**
- Create: `src/routes/_authenticated/invitations.tsx`
- Modify: `src/components/app/AppHeader.tsx`
- Regenerate: `src/routeTree.gen.ts` (via `pnpm dev`/`pnpm build`, not hand-edited)

**Interfaces:**
- Consumes: `normalizeInviteEmail` from `src/lib/invites.ts` (Task 3); `Database["public"]["Tables"]["artist_invites"]` typing from `src/integrations/supabase/types.ts` (Task 2); `useAuth()` (`user`, `profile`, `loading` — `src/hooks/use-auth.tsx`); `useCollection<T>(table, opts)` (`src/hooks/use-collection.ts`); `AppHeader` (`src/components/app/AppHeader.tsx`).
- Produces: route `/invitations`.

- [ ] **Step 1: Create the invitations route**

```tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { AppHeader } from "@/components/app/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { supabase } from "@/integrations/supabase/client";
import { normalizeInviteEmail } from "@/lib/invites";

export const Route = createFileRoute("/_authenticated/invitations")({
  component: InvitationsPage,
});

interface ArtistInvite {
  id: string;
  email: string;
  status: "pending" | "consumed" | "revoked";
  created_at: string;
}

const schema = z.object({
  email: z.string().email("Email invalide"),
});
type FormValues = z.infer<typeof schema>;

const STATUS_LABEL: Record<ArtistInvite["status"], string> = {
  pending: "En attente",
  consumed: "Utilisée",
  revoked: "Révoquée",
};

const STATUS_VARIANT: Record<ArtistInvite["status"], "secondary" | "outline" | "destructive"> = {
  pending: "secondary",
  consumed: "outline",
  revoked: "destructive",
};

function InvitationsPage() {
  const navigate = useNavigate();
  const { profile, loading, user } = useAuth();
  const [busy, setBusy] = useState(false);
  const { data: invites, refresh } = useCollection<ArtistInvite>("artist_invites");

  useEffect(() => {
    if (!loading && profile && profile.role !== "manager") {
      navigate({ to: "/", replace: true });
    }
  }, [loading, profile, navigate]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  if (loading || !profile || profile.role !== "manager") return null;

  const submit = async (data: FormValues) => {
    setBusy(true);
    try {
      const email = normalizeInviteEmail(data.email);
      const { error } = await supabase.from("artist_invites").upsert(
        {
          email,
          status: "pending",
          invited_by: user!.id,
          created_at: new Date().toISOString(),
          consumed_at: null,
        },
        { onConflict: "email" },
      );
      if (error) throw error;
      toast.success("Invitation créée");
      reset();
      refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Impossible de créer l'invitation");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    const { error } = await supabase.from("artist_invites").update({ status: "revoked" }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  };

  return (
    <>
      <AppHeader title="Invitations" backTo="/" />
      <div className="px-4 pt-4 pb-24 space-y-6">
        <form
          onSubmit={handleSubmit(submit)}
          className="space-y-3 rounded-2xl border border-border bg-card p-4"
        >
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email de l'artiste</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="artiste@example.com"
              {...register("email")}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <p className="text-xs text-muted-foreground">
            Communique cet email à l'artiste — il pourra créer son compte avec.
          </p>
          <Button type="submit" className="w-full rounded-full" disabled={busy}>
            Envoyer l'invitation
          </Button>
        </form>

        <div className="space-y-2">
          {invites.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aucune invitation pour l'instant.
            </p>
          )}
          {invites.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{inv.email}</p>
                <Badge variant={STATUS_VARIANT[inv.status]} className="mt-1">
                  {STATUS_LABEL[inv.status]}
                </Badge>
              </div>
              {inv.status === "pending" && (
                <button
                  onClick={() => revoke(inv.id)}
                  className="shrink-0 text-xs font-medium text-destructive underline underline-offset-4"
                >
                  Révoquer
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Add the header entry point**

In `src/components/app/AppHeader.tsx`, change the import line:

```typescript
import { Bell, ChevronLeft, LogOut } from "lucide-react";
```
to:
```typescript
import { Bell, ChevronLeft, LogOut, UserPlus } from "lucide-react";
```

And add `Link` is already imported from `@tanstack/react-router` (line 2) — reuse it. Insert a new button between the closing `</Sheet>` and the sign-out `<button>` (currently lines 107–115):

```tsx
          </Sheet>

          {profile?.role === "manager" && (
            <Link
              to="/invitations"
              aria-label="Invitations"
              className="grid min-h-11 min-w-11 place-items-center rounded-full border border-border bg-card text-muted-foreground"
            >
              <UserPlus className="h-[1.1rem] w-[1.1rem]" aria-hidden="true" />
            </Link>
          )}

          <button
            onClick={signOut}
            className="grid min-h-11 min-w-11 place-items-center rounded-full border border-border bg-card text-muted-foreground"
            aria-label="Déconnexion"
          >
            <LogOut className="h-[1.1rem] w-[1.1rem]" aria-hidden="true" />
          </button>
```

- [ ] **Step 3: Regenerate the route tree**

Run: `eval "$(/opt/homebrew/bin/brew shellenv)" && pnpm dev` (let it run ~10s to trigger route-file discovery, then stop it with Ctrl-C)
Expected: `src/routeTree.gen.ts` is modified on disk to include a `/invitations` route entry (check with `git diff src/routeTree.gen.ts` — should show `AuthenticatedInvitationsRouteImport` / `'/invitations'` additions analogous to the existing `/onboarding` entries).

- [ ] **Step 4: Typecheck**

Run: `eval "$(/opt/homebrew/bin/brew shellenv)" && pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual browser verification**

Run: `eval "$(/opt/homebrew/bin/brew shellenv)" && pnpm dev`, open the printed local URL, sign in with the manager account.
Verify: a new icon (person with a plus) appears in the header next to the bell; clicking it navigates to `/invitations`; submitting an email (e.g. `test-artist@example.com`) shows a success toast and the email appears in the list below with an "En attente" badge; clicking "Révoquer" changes its badge to "Révoquée" and removes the revoke button.
(There is no artist test account to verify the redirect-away-if-not-manager behavior live — it uses the same `useEffect`-based redirect pattern as `src/routes/_authenticated/route.tsx`'s onboarding redirect, so it's covered by code review rather than a live check.)

- [ ] **Step 6: Commit**

```bash
git add src/routes/_authenticated/invitations.tsx src/components/app/AppHeader.tsx src/routeTree.gen.ts
git commit -m "feat(auth): add manager-only artist invitations page"
```

---

### Task 5: Auth page copy tweak

**Files:**
- Modify: `src/routes/auth.tsx:74`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — copy-only change.

- [ ] **Step 1: Update the signup-mode subtitle**

In `src/routes/auth.tsx`, change:

```tsx
            {mode === "signin" ? "Connexion à ton espace" : "Créer un compte manager"}
```
to:
```tsx
            {mode === "signin" ? "Connexion à ton espace" : "Créer un compte"}
```

- [ ] **Step 2: Manual verification**

With `pnpm dev` running (from Task 4, or restart it), open `/auth`, click "Créer un compte" to switch to signup mode.
Verify: the subtitle now reads "Créer un compte" instead of "Créer un compte manager".

- [ ] **Step 3: Commit**

```bash
git add src/routes/auth.tsx
git commit -m "fix(auth): drop manager-specific wording from signup copy"
```

---

## Self-Review

**Spec coverage:**
- Manager email restriction → Task 1 (`restrict_signup` hook + `handle_new_user`).
- Artist invite gating → Task 1 (same hook, `artist_invites` lookup).
- Clear rejection error → Task 1 (`restrict_signup`'s error message, surfaced automatically by `auth.tsx`'s existing catch block — no client change needed there beyond Task 5's copy).
- Case-insensitive/trimmed matching → Task 1 (SQL `lower(trim(...))`) and Task 3 (`normalizeInviteEmail`, used in Task 4's submit handler).
- Re-invite via upsert, not unique-constraint error → Task 4 (`upsert(..., { onConflict: "email" })`).
- `/invitations` manager-only page → Task 4.
- Header entry point, manager-only → Task 4.
- Auth copy neutralized → Task 5.
- No existing accounts to migrate → confirmed in spec, no task needed.
- Manual steps (run migration, wire hook) → captured in Global Constraints and restated at the end of Task 1.

**Placeholder scan:** no TBD/TODO; every step has literal code or an exact command with expected output.

**Type consistency:** `ArtistInvite["status"]` (`"pending" | "consumed" | "revoked"`) matches the `Database["public"]["Tables"]["artist_invites"]["Row"]["status"]` type added in Task 2, which matches the SQL `CHECK` constraint in Task 1. `normalizeInviteEmail` (Task 3) is imported and used with the exact name in Task 4. `useCollection<ArtistInvite>("artist_invites")` and `supabase.from("artist_invites")` both reference the same table name introduced in Task 1/2.
