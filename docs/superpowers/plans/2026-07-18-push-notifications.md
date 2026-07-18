# Cross-Role Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notify the artist (in-app bell + push) when the manager creates/edits a finance item, task, or subvention; notify the manager when the artist creates/edits a task. Requires first letting the artist actually create/edit tasks (currently blocked by RLS and hidden in the UI), and configuring the already-built-but-dormant push infrastructure with real VAPID keys.

**Architecture:** A new shared helper `src/lib/notify.ts` (`notifyRole` + the pure `shouldNotifyRole` rule) is called explicitly at each mutation point — no database triggers or webhooks, consistent with how every other write in this app already works. The push-delivery mechanism itself (`dispatchPush`, `sendWebPush`, the service worker) already exists and is not modified.

**Tech Stack:** Supabase (Postgres + RLS), TanStack Start server functions, React 19 + TypeScript, Web Push (VAPID + RFC 8291, already implemented in `src/lib/webpush.server.ts`), Vitest (scoped to `src/lib/**/*.test.ts`).

## Global Constraints

- No database triggers or Supabase webhooks for notifications — `notifyRole` is called explicitly at each mutation site, the same pattern already used for `window.dispatchEvent(new Event("mc-refresh"))` elsewhere in this codebase.
- A notification failure (either the `notifications` insert or the push dispatch) must never throw or block the primary action — the business write has already succeeded by the time `notifyRole` runs. Log to console, never rethrow.
- Only `src/lib/**/*.test.ts` is covered by `vitest.config.ts` — no component test files.
- `dispatchPush`, `sendWebPush`, `src/lib/push.functions.ts`, `public/push-sw.js` are not modified — they already work correctly, this plan only calls them and configures their keys.
- French copy throughout.
- Never modify an existing migration file — always add a new one.
- Generated VAPID key material is a secret — the private key must be written to local `.env` only (already gitignored), never committed, never printed in a commit message.

---

### Task 1: RLS — artist task permissions + notification insert

**Files:**
- Create: `supabase/migrations/20260718000001_task_artist_rls_and_notify_insert.sql`

**Interfaces:**
- Consumes: existing `tasks_write`/`tasks_update` policies (`supabase/migrations/20260709000003_rls.sql`) and the existing `notifs_insert` policy (same file).
- Produces: nothing consumed by later tasks' code directly — later tasks assume these RLS changes will eventually be applied (same "user must run this migration manually" caveat as every prior migration this session).

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Verify by read-through**

Run: `cat supabase/migrations/20260718000001_task_artist_rls_and_notify_insert.sql` and confirm by eye:
- `tasks_select` and `tasks_delete` are not touched (not present in this file at all) — delete stays manager-only.
- `tasks_write`'s new `WITH CHECK` still allows the manager to insert ANY `assignee_role` (the `current_user_role() = 'manager' OR ...` structure means manager is unconditionally allowed).
- `notifs_insert`'s new `WITH CHECK (true)` doesn't touch `notifs_select`/`notifs_update` (not present in this file) — reading is still restricted by `recipient_role`.

There is no local Supabase CLI/DB in this environment to run this against — manual read-through only, same as every prior migration this session. The user applies it via the Supabase Dashboard SQL Editor after this branch is deployed.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260718000001_task_artist_rls_and_notify_insert.sql
git commit -m "feat(rls): allow artist to create/update their own tasks, widen notification insert"
```

---

### Task 2: `src/lib/notify.ts` — shared notification helper

**Files:**
- Create: `src/lib/notify.ts`
- Create: `src/lib/__tests__/notify.test.ts`

**Interfaces:**
- Consumes: `dispatchPush` from `@/lib/push.functions` (already exists, signature `dispatchPush({ data: { recipientRole: "manager"|"artist", title: string, body?: string, url?: string } })`); `supabase` from `@/integrations/supabase/client`.
- Produces: `notifyRole({ recipientRole, title, body?, url? }): Promise<void>` and `shouldNotifyRole(actorRole, assigneeRole): "manager"|"artist"|null` — Tasks 3, 4, 5 import both.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/notify.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { shouldNotifyRole } from "../notify";

describe("shouldNotifyRole", () => {
  it("notifies the artist when the manager acts on a task assigned to the artist", () => {
    expect(shouldNotifyRole("manager", "artist")).toBe("artist");
  });

  it("notifies the manager when the artist acts on a task assigned to the manager", () => {
    expect(shouldNotifyRole("artist", "manager")).toBe("manager");
  });

  it("notifies the other role when the task is assigned to both", () => {
    expect(shouldNotifyRole("manager", "both")).toBe("artist");
    expect(shouldNotifyRole("artist", "both")).toBe("manager");
  });

  it("does not notify when the task doesn't involve the other role", () => {
    expect(shouldNotifyRole("manager", "manager")).toBeNull();
    expect(shouldNotifyRole("artist", "artist")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/lib/__tests__/notify.test.ts`
Expected: FAIL — `Cannot find module '../notify'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/notify.ts`:

```ts
import { supabase } from "@/integrations/supabase/client";
import { dispatchPush } from "@/lib/push.functions";

export type Role = "manager" | "artist";

export interface NotifyParams {
  recipientRole: Role;
  title: string;
  body?: string;
  url?: string;
}

/**
 * Notify a role of an event: writes an in-app notification row (feeds the
 * bell icon in AppHeader) and sends a push to every device registered for
 * that role. Best-effort — a failure here must never block the caller's
 * already-successful business write.
 */
export async function notifyRole({
  recipientRole,
  title,
  body,
  url,
}: NotifyParams): Promise<void> {
  const { error: dbError } = await supabase.from("notifications").insert({
    recipient_role: recipientRole,
    title,
    body: body ?? null,
  });
  if (dbError) {
    console.error("notifyRole: failed to insert in-app notification", dbError);
  }

  try {
    await dispatchPush({ data: { recipientRole, title, body, url } });
  } catch (err) {
    console.error("notifyRole: failed to dispatch push", err);
  }
}

/**
 * Determine who should be notified about a task event, given who performed
 * it and who the task is assigned to. Returns null if the task doesn't
 * involve the role that isn't the actor (e.g. a manager-only task doesn't
 * notify the artist).
 */
export function shouldNotifyRole(
  actorRole: Role,
  assigneeRole: "manager" | "artist" | "both"
): Role | null {
  const otherRole: Role = actorRole === "manager" ? "artist" : "manager";
  if (assigneeRole === "both" || assigneeRole === otherRole) {
    return otherRole;
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/lib/__tests__/notify.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Verify no regressions**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

Run: `pnpm exec vitest run`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/notify.ts src/lib/__tests__/notify.test.ts
git commit -m "feat(notify): add shared notifyRole helper and shouldNotifyRole rule"
```

---

### Task 3: Wire payment notifications

**Files:**
- Modify: `src/components/modules/finance/AddRevenueSheet.tsx`
- Modify: `src/routes/_authenticated/finance/cachets.tsx`
- Modify: `src/routes/_authenticated/finance/index.tsx`
- Modify: `src/components/modules/cachets/EditPaymentDrawer.tsx`

**Interfaces:**
- Consumes: `notifyRole` from `@/lib/notify` (Task 2).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Notify on payment creation**

In `src/components/modules/finance/AddRevenueSheet.tsx`, add this import alongside the others:

```ts
import { notifyRole } from "@/lib/notify";
```

Then in `submitForm`, replace:

```ts
      const { error } = await supabase.from("payments").insert({
        artist_id: artistId,
        track_id,
        source: form.type,
        notes: form.notes,
        amount: parseFloat(form.amount),
        payment_date: form.payment_date || null,
        status: form.status,
        territory: form.type === "booking" ? form.territory : ("france" as const),
        counts_for_intermittence: isIntermittence ? form.counts_for_intermittence : false,
        deductible_expenses: parseFloat(form.deductible_expenses) || 0,
        hours: isIntermittence ? form.hours : 12,
        batch_id,
        created_by: user?.id,
      });
      if (error) throw error;

      toast.success("Revenu ajouté");
```

with:

```ts
      const { error } = await supabase.from("payments").insert({
        artist_id: artistId,
        track_id,
        source: form.type,
        notes: form.notes,
        amount: parseFloat(form.amount),
        payment_date: form.payment_date || null,
        status: form.status,
        territory: form.type === "booking" ? form.territory : ("france" as const),
        counts_for_intermittence: isIntermittence ? form.counts_for_intermittence : false,
        deductible_expenses: parseFloat(form.deductible_expenses) || 0,
        hours: isIntermittence ? form.hours : 12,
        batch_id,
        created_by: user?.id,
      });
      if (error) throw error;

      void notifyRole({
        recipientRole: "artist",
        title: "Nouveau revenu",
        body: `${form.notes} — ${parseFloat(form.amount).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}`,
        url: "/finance",
      });

      toast.success("Revenu ajouté");
```

- [ ] **Step 2: Notify on swipe-driven status change to payé/annulé — Cachets page**

In `src/routes/_authenticated/finance/cachets.tsx`, add this import:

```ts
import { notifyRole } from "@/lib/notify";
```

Replace:

```ts
  const handleSwipeStatusChange = (payment: FullPaymentRow, next: PaymentRow["status"]) => {
    const previous = payment.status;
    writePaymentStatus(payment.id, next);
    toast.success(`Statut → ${STATUS_LABEL[next] ?? next}`, {
      action: {
        label: "Annuler",
        onClick: () => writePaymentStatus(payment.id, previous),
      },
    });
  };
```

with:

```ts
  const handleSwipeStatusChange = (payment: FullPaymentRow, next: PaymentRow["status"]) => {
    const previous = payment.status;
    writePaymentStatus(payment.id, next);
    if (next === "payé" || next === "annulé") {
      void notifyRole({
        recipientRole: "artist",
        title: next === "payé" ? "Paiement reçu" : "Paiement annulé",
        body:
          next === "payé"
            ? `${payment.notes} — ${payment.amount.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}`
            : payment.notes ?? undefined,
        url: "/finance/cachets",
      });
    }
    toast.success(`Statut → ${STATUS_LABEL[next] ?? next}`, {
      action: {
        label: "Annuler",
        onClick: () => writePaymentStatus(payment.id, previous),
      },
    });
  };
```

Note: `payment.notes` is typed `string | null` on `PaymentRow` — the ternary above passes `undefined` (not `null`) when absent, matching `NotifyParams.body?: string`.

- [ ] **Step 3: Notify on swipe-driven status change to payé/annulé — Finance page**

In `src/routes/_authenticated/finance/index.tsx`, add the same import:

```ts
import { notifyRole } from "@/lib/notify";
```

Replace:

```ts
  const handleSwipeStatusChange = (payment: FullPayment, next: FullPayment["status"]) => {
    const previous = payment.status;
    writePaymentStatus(payment.id, next);
    toast.success(`Statut → ${STATUS_LABEL[next] ?? next}`, {
      action: {
        label: "Annuler",
        onClick: () => writePaymentStatus(payment.id, previous),
      },
    });
  };
```

with:

```ts
  const handleSwipeStatusChange = (payment: FullPayment, next: FullPayment["status"]) => {
    const previous = payment.status;
    writePaymentStatus(payment.id, next);
    if (next === "payé" || next === "annulé") {
      void notifyRole({
        recipientRole: "artist",
        title: next === "payé" ? "Paiement reçu" : "Paiement annulé",
        body:
          next === "payé"
            ? `${payment.notes} — ${payment.amount.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}`
            : payment.notes ?? undefined,
        url: "/finance",
      });
    }
    toast.success(`Statut → ${STATUS_LABEL[next] ?? next}`, {
      action: {
        label: "Annuler",
        onClick: () => writePaymentStatus(payment.id, previous),
      },
    });
  };
```

(Note: the "Annuler" undo action deliberately does not fire a corrective notification — a manager undoing their own swipe within a few seconds is not worth a second push, per the design spec's scope.)

- [ ] **Step 4: Notify on manual edit-sheet status change to payé/annulé**

In `src/components/modules/cachets/EditPaymentDrawer.tsx`, add this import:

```ts
import { notifyRole } from "@/lib/notify";
```

Replace:

```ts
      if (error) throw error;

      toast.success("Cachet modifié");
      window.dispatchEvent(new Event("mc-refresh"));
```

with:

```ts
      if (error) throw error;

      if (data.status !== payment.status && (data.status === "payé" || data.status === "annulé")) {
        void notifyRole({
          recipientRole: "artist",
          title: data.status === "payé" ? "Paiement reçu" : "Paiement annulé",
          body:
            data.status === "payé"
              ? `${data.notes} — ${data.amount.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}`
              : data.notes,
          url: "/finance",
        });
      }

      toast.success("Cachet modifié");
      window.dispatchEvent(new Event("mc-refresh"));
```

Note: `payment.status` can be `"tbc"` (an alias the form normalizes to `"provisoire"` on load — see the `reset({...})` call in this file's `useEffect`), so `data.status` will never itself be `"tbc"`; the `!==` comparison against `payment.status` (which could still literally be the string `"tbc"` in rare cases) is intentionally loose here — if `payment.status` was `"tbc"` and the user re-saves without changing anything, `data.status` would be `"provisoire"`, which reads as "changed" and could re-fire a notification incorrectly. This edge case only matters if `data.status` also happens to be `"payé"` or `"annulé"` (it can't be — those aren't reachable from a `"tbc"` payment being saved unchanged, since the status buttons show the current value pre-selected). No fix needed; documenting why this isn't a bug worth guarding against.

- [ ] **Step 5: Verify no regressions**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

Run: `pnpm build`
Expected: build succeeds.

Run: `pnpm exec vitest run`
Expected: all tests pass (this task touches no `src/lib/**/*.test.ts`-covered file).

- [ ] **Step 6: Commit**

```bash
git add src/components/modules/finance/AddRevenueSheet.tsx src/routes/_authenticated/finance/cachets.tsx src/routes/_authenticated/finance/index.tsx src/components/modules/cachets/EditPaymentDrawer.tsx
git commit -m "feat(notify): notify artist on payment creation and payé/annulé transitions"
```

---

### Task 4: Wire task notifications + artist task creation

**Files:**
- Modify: `src/components/modules/taches/AddTaskDrawer.tsx`
- Modify: `src/components/modules/taches/TaskLine.tsx`
- Modify: `src/routes/_authenticated/taches.tsx`

**Interfaces:**
- Consumes: `notifyRole`, `shouldNotifyRole` from `@/lib/notify` (Task 2); `useAuth` from `@/hooks/use-auth` (pre-existing).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Make `AddTaskDrawer` role-aware and notify on creation**

Overwrite `src/components/modules/taches/AddTaskDrawer.tsx` with:

```tsx
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { notifyRole, shouldNotifyRole } from "@/lib/notify";

const schema = z.object({
  title: z.string().min(1, "Requis"),
  description: z.string().optional(),
  assignee_role: z.enum(["manager", "artist", "both"]),
  priority: z.enum(["normal", "urgent"]),
  deadline: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: () => void;
}

const MANAGER_ROLE_OPTIONS = [
  { value: "manager", label: "Manager" },
  { value: "artist", label: "Artiste" },
  { value: "both", label: "Tous" },
] as const;

const ARTIST_ROLE_OPTIONS = [
  { value: "artist", label: "Moi" },
  { value: "both", label: "Tous" },
] as const;

export function AddTaskDrawer({ open, onOpenChange, onSuccess }: Props) {
  const { profile } = useAuth();
  const isArtist = profile?.role === "artist";
  const [busy, setBusy] = useState(false);

  const { register, handleSubmit, watch, reset, setValue, formState: { errors } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: { assignee_role: isArtist ? "artist" : "manager", priority: "normal" },
    });

  const roleOptions = isArtist ? ARTIST_ROLE_OPTIONS : MANAGER_ROLE_OPTIONS;

  const submit = async (data: FormValues) => {
    setBusy(true);
    try {
      const { error } = await supabase.from("tasks").insert({
        title: data.title,
        description: data.description || null,
        assignee_role: data.assignee_role,
        priority: data.priority,
        deadline: data.deadline || null,
      });
      if (error) throw error;

      if (profile?.role) {
        const recipient = shouldNotifyRole(profile.role, data.assignee_role);
        if (recipient) {
          void notifyRole({
            recipientRole: recipient,
            title: "Nouvelle tâche",
            body: data.title,
            url: "/taches",
          });
        }
      }

      toast.success("Tâche créée");
      reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="font-display text-xl">Nouvelle tâche</DrawerTitle>
        </DrawerHeader>

        <form onSubmit={handleSubmit(submit)} className="px-4 pb-8 space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Titre</Label>
            <Input id="task-title" placeholder="ex: Envoyer contrat à la salle" {...register("title")} />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-desc">
              Description <span className="text-muted-foreground font-normal">— optionnel</span>
            </Label>
            <Input id="task-desc" placeholder="Détails..." {...register("description")} />
          </div>

          <div className="space-y-1.5">
            <Label>Assigné à</Label>
            <div className="flex gap-2">
              {roleOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setValue("assignee_role", opt.value)}
                  className={`flex-1 rounded-full border py-2 text-xs font-medium transition ${
                    watch("assignee_role") === opt.value
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Priorité</Label>
            <div className="flex gap-2">
              {(["normal", "urgent"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setValue("priority", p)}
                  className={`flex-1 rounded-full border py-2 text-xs font-medium capitalize transition ${
                    watch("priority") === p
                      ? p === "urgent"
                        ? "border-red-500 bg-red-500/10 text-red-400"
                        : "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {p === "normal" ? "Normal" : "Urgent"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-deadline">
              Échéance <span className="text-muted-foreground font-normal">— optionnel</span>
            </Label>
            <Input id="task-deadline" type="date" {...register("deadline")} />
          </div>

          <Button type="submit" className="w-full rounded-full" size="lg" disabled={busy}>
            {busy ? "Création…" : "Créer la tâche"}
          </Button>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
```

What changed from the current file: `useAuth`/`notifyRole`/`shouldNotifyRole` imports added; `MANAGER_ROLE_OPTIONS`/`ARTIST_ROLE_OPTIONS` replace the single `ROLE_OPTIONS`; `defaultValues.assignee_role` and the rendered `roleOptions` are now role-aware; the notification block added right after the successful insert. Everything else (schema, JSX structure, priority/deadline fields) is unchanged.

- [ ] **Step 2: Notify on task status change**

In `src/components/modules/taches/TaskLine.tsx`, add these imports alongside the existing ones:

```ts
import { useAuth } from "@/hooks/use-auth";
import { notifyRole, shouldNotifyRole } from "@/lib/notify";
```

Then replace:

```tsx
export function TaskLine({ task, onSuccess }: Props) {
  const [busy, setBusy] = useState(false);

  const cycleStatus = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const next = STATUS_NEXT[task.status];
      const { error } = await supabase
        .from("tasks")
        .update({ status: next })
        .eq("id", task.id);
      if (error) throw error;
      onSuccess?.();
```

with:

```tsx
export function TaskLine({ task, onSuccess }: Props) {
  const { profile } = useAuth();
  const [busy, setBusy] = useState(false);

  const cycleStatus = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const next = STATUS_NEXT[task.status];
      const { error } = await supabase
        .from("tasks")
        .update({ status: next })
        .eq("id", task.id);
      if (error) throw error;

      if (profile?.role) {
        const recipient = shouldNotifyRole(profile.role, task.assignee_role);
        if (recipient) {
          void notifyRole({
            recipientRole: recipient,
            title: "Tâche mise à jour",
            body: `${task.title} → ${STATUS_LABEL[next]}`,
            url: "/taches",
          });
        }
      }

      onSuccess?.();
```

(`STATUS_LABEL` already exists in this file — reuse it, don't redefine. The rest of `cycleStatus`'s `catch`/`finally` blocks and the whole JSX below are unchanged.)

- [ ] **Step 3: Show the "new task" FAB to both roles**

In `src/routes/_authenticated/taches.tsx`, replace:

```tsx
      {/* FAB — manager only */}
      {profile?.role === "manager" && (
        <button
          onClick={() => setAddOpen(true)}
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-50 grid h-14 w-14 place-items-center rounded-full bg-foreground text-background shadow-lg transition active:scale-95"
          aria-label="Nouvelle tâche"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}
```

with:

```tsx
      {/* FAB — both roles can create a task */}
      <button
        onClick={() => setAddOpen(true)}
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-50 grid h-14 w-14 place-items-center rounded-full bg-foreground text-background shadow-lg transition active:scale-95"
        aria-label="Nouvelle tâche"
      >
        <Plus className="h-6 w-6" />
      </button>
```

(Uses the FAB position already fixed in the prior "uniformize FABs" work — `bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50` — don't revert to the old broken position.)

- [ ] **Step 4: Verify no regressions**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

Run: `pnpm build`
Expected: build succeeds.

Run: `pnpm exec vitest run`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/modules/taches/AddTaskDrawer.tsx src/components/modules/taches/TaskLine.tsx src/routes/_authenticated/taches.tsx
git commit -m "feat(notify): artist can create/update tasks, notify the other role on changes"
```

---

### Task 5: Wire subvention notification

**Files:**
- Modify: `src/components/modules/subventions/AddGrantDrawer.tsx`

**Interfaces:**
- Consumes: `notifyRole` from `@/lib/notify` (Task 2).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Notify on grant creation**

Add this import:

```ts
import { notifyRole } from "@/lib/notify";
```

Replace:

```ts
      const { error } = await supabase.from("grants").insert({
        title: data.title,
        organisme: data.organisme || null,
        categorie: data.categorie || null,
        status: data.status,
        priority: data.priority || null,
        montant_max: data.montant_max ?? null,
        deadline_depot: data.deadline_depot || null,
        lien_dossier: data.lien_dossier || null,
        notes: data.notes || null,
      });
      if (error) throw error;
      toast.success("Subvention ajoutée");
```

with:

```ts
      const { error } = await supabase.from("grants").insert({
        title: data.title,
        organisme: data.organisme || null,
        categorie: data.categorie || null,
        status: data.status,
        priority: data.priority || null,
        montant_max: data.montant_max ?? null,
        deadline_depot: data.deadline_depot || null,
        lien_dossier: data.lien_dossier || null,
        notes: data.notes || null,
      });
      if (error) throw error;

      void notifyRole({
        recipientRole: "artist",
        title: "Nouvelle subvention",
        body: data.title,
        url: "/subventions",
      });

      toast.success("Subvention ajoutée");
```

(This form is only reachable from `/subventions`, which is manager-only per existing RLS — no actor role check needed, always notify the artist.)

- [ ] **Step 2: Verify no regressions**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

Run: `pnpm exec vitest run`
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/modules/subventions/AddGrantDrawer.tsx
git commit -m "feat(notify): notify artist on subvention creation"
```

---

### Task 6: Generate VAPID keys, wire the public key, surface the opt-in toggle

**Files:**
- Modify: `.env` (local only, gitignored — never committed)
- Modify: `src/lib/push-client.ts`
- Modify: `src/routes/_authenticated/index.tsx`

**Interfaces:**
- Consumes: `NotificationsToggle` from `@/components/app/NotificationsToggle` (pre-existing, unmodified).
- Produces: nothing consumed by other tasks — this is the last task.

- [ ] **Step 1: Generate a real VAPID key pair**

Create a throwaway script (do not commit it — delete it after use), e.g. `/tmp/gen-vapid.mjs`:

```js
import { webcrypto } from "node:crypto";
const { subtle } = webcrypto;

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function b64urlToBytes(s) {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

const keyPair = await subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);
const publicJwk = await subtle.exportKey("jwk", keyPair.publicKey);
const privateJwk = await subtle.exportKey("jwk", keyPair.privateKey);

const x = b64urlToBytes(publicJwk.x);
const y = b64urlToBytes(publicJwk.y);
const rawPoint = Buffer.concat([Buffer.from([0x04]), x, y]);

console.log("VAPID_PUBLIC_KEY=" + b64url(rawPoint));
console.log("VAPID_PRIVATE_JWK=" + JSON.stringify(privateJwk));
```

Run it with the project's Node (per `CLAUDE.md`, Node >=22.12.0 is already required — `webcrypto` is available without flags):

```bash
node /tmp/gen-vapid.mjs
```

Expected output: two lines, `VAPID_PUBLIC_KEY=<base64url string>` and `VAPID_PRIVATE_JWK={"kty":"EC","crv":"P-256",...}`. These values are randomly generated each run — there is no fixed expected value, just confirm the output has this shape (a non-empty base64url-looking string, and a JSON object with `kty`, `crv`, `x`, `y`, `d` fields).

Delete the script after use: `rm /tmp/gen-vapid.mjs`.

- [ ] **Step 2: Add the generated values to local `.env`**

Append to `.env` (the project root's, already gitignored):

```
VAPID_PUBLIC_KEY=<the generated VAPID_PUBLIC_KEY value from Step 1>
VAPID_PRIVATE_JWK=<the generated VAPID_PRIVATE_JWK value from Step 1, as one line>
VAPID_SUBJECT=mailto:paul.bourdon94120@gmail.com
```

Do NOT modify `.env.example` — it intentionally documents these three variable names with empty values, as a template; that's unrelated to this step.

- [ ] **Step 3: Update the client's public key constant**

In `src/lib/push-client.ts`, replace the hardcoded placeholder:

```ts
const VAPID_PUBLIC_KEY =
  "BKaNYBhLpcsgBk57Ibim6koyC9th3qpDlsooUPzSCyej1GHbJnxeC8jGvs1jM_8V4oo4icdqk2--rO_WLcapcMQ";
```

with the actual generated public key from Step 1:

```ts
const VAPID_PUBLIC_KEY =
  "<the generated VAPID_PUBLIC_KEY value from Step 1>";
```

(This must be the exact same public key as the one written to `VAPID_PUBLIC_KEY` in `.env` — client and server must agree on the same key pair for the push subscription's encryption to work.)

- [ ] **Step 4: Surface the opt-in toggle on the cockpit homepage**

In `src/routes/_authenticated/index.tsx`, add this import:

```tsx
import { NotificationsToggle } from "@/components/app/NotificationsToggle";
```

Then in `CockpitPage`'s JSX, replace:

```tsx
      <div className="px-4 pt-4 pb-24 space-y-3">
        <CalendrierHeroCard />
        <CachetsHeroCard />
        <div className="grid grid-cols-2 gap-3">
          {isManager ? <ManagerFinanceTile /> : <ArtistFinanceTile />}
          <TachesTile />
          <TracksTile />
          <SubventionsTile />
        </div>
      </div>
```

with:

```tsx
      <div className="px-4 pt-4 pb-24 space-y-3">
        <CalendrierHeroCard />
        <CachetsHeroCard />
        <div className="grid grid-cols-2 gap-3">
          {isManager ? <ManagerFinanceTile /> : <ArtistFinanceTile />}
          <TachesTile />
          <TracksTile />
          <SubventionsTile />
        </div>
        <NotificationsToggle />
      </div>
```

- [ ] **Step 5: Verify no regressions**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

Run: `pnpm build`
Expected: build succeeds.

Run: `pnpm exec vitest run`
Expected: all tests pass.

- [ ] **Step 6: Commit**

Only commit the two source files — `.env` must never be committed (it's gitignored; confirm with `git status` that it does not appear as a trackable change).

```bash
git status --short
git add src/lib/push-client.ts src/routes/_authenticated/index.tsx
git commit -m "feat(notify): wire real VAPID public key, surface the notifications opt-in toggle"
```

- [ ] **Step 7: Report the generated keys to the human**

In the final report, include the exact `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_JWK` and `VAPID_SUBJECT` values generated in Step 1 — the user must add all three to the Cloudflare Pages dashboard's environment variables (same place as `SUPABASE_SERVICE_ROLE_KEY` etc.) before push notifications will actually work in production. This is the same "you need to do this manually, I can't" pattern already established for database migrations this session.
