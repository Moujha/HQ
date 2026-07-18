# Cross-Role Push Notifications — Design

## Problem

The manager and artist have no way to know when the other side has done something relevant — a new payment, a task update, a new subvention. The user wants: the artist notified when the manager creates/edits a finance item, task, or subvention; the manager notified when the artist creates/edits a task.

Investigation before designing found:

1. **The push-delivery mechanism already exists**, complete, as unused scaffolding carried over from this project's original template (`git log` traces it to the initial bootstrap commit): a pure Web Crypto VAPID + RFC 8291 implementation (`src/lib/webpush.server.ts`), subscribe/unsubscribe server functions and client helpers (`src/lib/push.functions.ts`, `src/lib/push-client.ts`), a `dispatchPush({ recipientRole, title, body?, url? })` server function that sends to every device of every user holding a role, a service worker (`public/push-sw.js`) that displays the notification, and a full opt-in toggle component (`src/components/app/NotificationsToggle.tsx`). None of it is wired to fire on anything, the toggle is never rendered anywhere in the app, and the VAPID keys it needs are not configured (`.env` only has empty placeholders in `.env.example`).
2. **Artists cannot create or edit tasks today** — the "new task" button only renders for the manager role, and RLS only allows the manager to `INSERT`/`UPDATE` on `tasks`. This has to be fixed first for "the manager is notified when the artist creates/edits a task" to mean anything.
3. **Grants have no edit UI at all** — only creation. So there's no "edit a subvention" event to hook a notification into.

## Goals

- A single shared helper, `notifyRole`, that both writes an in-app notification (feeds the existing bell icon) and sends a push, called explicitly at each relevant mutation point.
- Artist can create a task (assigned to themselves or `both`) and advance the status of any task assigned to them or `both` — mirroring the manager's existing capability, scoped to tasks that involve the artist.
- Notification trigger matrix (exact events, recipients, copy) — see Architecture.
- Real VAPID keys generated and documented for the user to add to Cloudflare Pages env vars (cannot be done by the agent — requires dashboard access).
- The existing, previously-unreachable `NotificationsToggle` opt-in UI placed at the bottom of the cockpit homepage.

## Non-goals

- No database triggers or Supabase webhooks — this stays 100% consistent with the existing pattern where every write in this app is a direct client-to-Supabase call, not server-side-triggered side effects. `notifyRole` is called explicitly, same as any other follow-up action (e.g. `window.dispatchEvent(new Event("mc-refresh"))`).
- No notification on intermediate payment status transitions (`provisoire`→`cachet_en_attente`→`facturé`) — only on creation and the transitions to `payé`/`annulé`, to avoid spamming the artist during a rapid swipe session.
- No edit-notification for grants — no edit UI exists to hook into; building one is out of scope here.
- No new settings page — the toggle goes on the existing cockpit homepage since there's nowhere else for it yet.
- No change to `dispatchPush`/`sendWebPush`/the service worker itself — that code is already correct and complete; this work only calls it.

## Architecture

### `src/lib/notify.ts` (new)

```ts
export type Role = "manager" | "artist";

export interface NotifyParams {
  recipientRole: Role;
  title: string;
  body?: string;
  url?: string;
}

export async function notifyRole({ recipientRole, title, body, url }: NotifyParams): Promise<void>
```

Implementation:
1. Insert `{ recipient_role: recipientRole, title, body: body ?? null }` into `notifications` (feeds the bell — `AppHeader.tsx` already reads this table filtered by `recipient_role`).
2. Call the existing `dispatchPush({ data: { recipientRole, title, body, url } })` server function (already handles "send to every device of every user with this role," already handles stale-subscription cleanup).

Both steps are best-effort: failures are caught and logged to console, never thrown — a notification failing must never block or roll back the actual business action (the payment/task/grant write already succeeded by the time `notifyRole` is called). This matches the existing fire-and-forget pattern already used for `window.dispatchEvent(new Event("mc-refresh"))` elsewhere in the codebase.

### Trigger matrix and call sites

| Event | File | Recipient | Title/body pattern |
|---|---|---|---|
| Payment created | `AddRevenueSheet.tsx` (`submitForm`, after successful insert) | `artist` | "Nouveau revenu" / "{notes or source} — {amount}€" |
| Payment → `payé` | `src/lib/cachets.ts` (`writePaymentStatus`, when `status === "payé"`) **and** `EditPaymentDrawer.tsx` (`submit`, when `data.status === "payé"` and it changed) | `artist` | "Paiement reçu" / "{notes} — {amount}€" |
| Payment → `annulé` | same two call sites, when status is/becomes `"annulé"` | `artist` | "Paiement annulé" / "{notes}" |
| Task created | `AddTaskDrawer.tsx` (`submit`, after successful insert) | the role that isn't the actor, only if `assignee_role` is `"both"` or equals that role | "Nouvelle tâche" / "{title}" |
| Task status changed | `TaskLine.tsx` (`cycleStatus`, after successful update) | same rule as above | "Tâche mise à jour" / "{title} → {new status label}" |
| Grant created | `AddGrantDrawer.tsx` (after successful insert) | `artist` | "Nouvelle subvention" / "{title}" |

For the two payment call sites, `writePaymentStatus` (in `src/lib/cachets.ts`) is the single function backing every swipe interaction across Cachets/Finance — hooking it there covers all swipe-driven status changes in one place. `EditPaymentDrawer.tsx`'s manual save path writes directly via `supabase.from("payments").update(...)` (bypassing `writePaymentStatus`), so it needs its own check for whether `status` changed to `payé`/`annulé` in that same submit handler. Both places compare against the payment's previous status (already available as a prop/local variable) to fire only on an actual transition, not on every save.

For tasks, the "notify the non-actor role, only if relevant" rule is symmetric and identical at both call sites:

```ts
const actorRole = profile.role; // "manager" | "artist"
const otherRole = actorRole === "manager" ? "artist" : "manager";
if (task.assignee_role === "both" || task.assignee_role === otherRole) {
  void notifyRole({ recipientRole: otherRole, title, body });
}
```

This never notifies the actor's own role, and never notifies a role that has no stake in the task (e.g. the artist never gets pinged about a manager-only task).

### RLS changes (new migration)

**`tasks`** — widen `tasks_write` (INSERT) and `tasks_update` (UPDATE), which are currently `USING/WITH CHECK (current_user_role() = 'manager')` only:

```sql
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
```

(`tasks_select`/`tasks_delete` are untouched — delete stays manager-only, select already allows the artist to see their own/both tasks.)

**`notifications`** — widen `notifs_insert`, currently manager-only:

```sql
DROP POLICY IF EXISTS "notifs_insert" ON notifications;
CREATE POLICY "notifs_insert" ON notifications FOR INSERT TO authenticated
  WITH CHECK (true);
```

(Any authenticated user can insert a notification row for either role — low-stakes, since `notifs_select` already restricts who can *read* which rows by `recipient_role`, and there's no sensitive data in a notification beyond a title/body string.)

### UI changes

**`taches.tsx`**: the FAB (`{profile?.role === "manager" && (...)}`) becomes unconditional — both roles get it.

**`AddTaskDrawer.tsx`**: `ROLE_OPTIONS` becomes role-aware — the manager still sees all three (`Manager`/`Artiste`/`Tous`), the artist only sees two (`Moi` → `artist`, `Tous` → `both`). The component needs the current role (via `useAuth`) to filter this list and to default `assignee_role` sensibly per role (manager defaults to `"manager"` as today; artist defaults to `"artist"`).

**Cockpit homepage** (`src/routes/_authenticated/index.tsx`): `<NotificationsToggle />` rendered once, after the 2×2 tile grid, for both roles (the component already handles its own unsupported/denied/ios-not-installed states internally — no role-gating needed here beyond "always show it").

### VAPID key generation

A VAPID key pair is an ECDSA P-256 key: a public key (base64url, shipped to the browser) and a private key (JWK, server-only secret). Generated once with a short Node/Web Crypto script, output as the three env values the code already expects (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_JWK`, `VAPID_SUBJECT`). The implementer generates these and reports them; the user must then set them in the Cloudflare Pages dashboard (same place as `SUPABASE_SERVICE_ROLE_KEY` etc.) and in local `.env` for local testing — this last step cannot be done by the agent. `src/lib/push-client.ts`'s hardcoded `VAPID_PUBLIC_KEY` constant (currently a leftover placeholder key from the template) is updated to the newly-generated public key so client and server agree.

## Testing

- `src/lib/notify.ts` is not unit-testable in the traditional sense (it's two side-effecting calls, no pure logic) — no test file, consistent with how `writePaymentStatus` itself (also a thin side-effecting wrapper) has no test today.
- The task-notification "who gets notified" rule (actor/assignee logic) is pure and worth a unit test — extracted as a small pure function (e.g. `shouldNotifyRole(actorRole, assigneeRole): Role | null`) in `src/lib/notify.ts`, tested in `src/lib/__tests__/notify.test.ts`, per this codebase's `vitest.config.ts` scoping (`src/lib/**/*.test.ts`).
- No test for the RLS changes (no DB test harness in this codebase, verified by manual read-through, same as every prior migration this session).

## Manual verification

Same as every prior feature this session: after deploy, `curl` the HTML shell, extract the content-hashed JS bundles, grep for distinctive new strings (e.g. "Nouvelle tâche" notification copy, `NotificationsToggle`'s "Notifications push" label appearing on the homepage bundle) — no browser automation available in this environment. Actually receiving a push cannot be verified this way (requires a real device with a saved subscription and configured VAPID keys) — that part is on the user to test after setting the Cloudflare env vars.
