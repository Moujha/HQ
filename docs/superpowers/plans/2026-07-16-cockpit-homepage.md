# Cockpit Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current `/` redirect-to-`/finance` with a real cockpit homepage that summarizes all 6 feature modules (Finance, Cachets, Tâches, Calendrier, Tracks, Subventions) in a 2-column tile grid, each tile linking to its full page.

**Architecture:** `/` becomes `src/routes/_authenticated/index.tsx`, inheriting the existing auth guard + `BottomNav` shell. Each tile fetches its own data via the existing `useCollection` hook and reuses each destination page's existing computation (from `src/lib/cachets.ts`, `src/lib/fees.ts`, a newly-extracted `src/lib/calendrier.ts`) rather than introducing a new aggregation layer. Three RLS policies are widened so the artist role — who gets read-only access across the whole app — can read `tracks`, `grants`, and `management_fees` (today blocked entirely for that role).

**Tech Stack:** TanStack Start (file-based routing), React 19 + TypeScript, Supabase (Postgres + RLS), Tailwind v4, lucide-react icons, Vitest (scoped to `src/lib/**/*.test.ts` per `vitest.config.ts` — no component/page tests anywhere in this codebase).

## Global Constraints

- `GOAL_CACHETS = 43` and `GOAL_HOURS = 507` already exist in `src/lib/cachets.ts` — import them, never redefine.
- RLS changes must be **additive only**: add new `FOR SELECT ... USING (true)` policies; do not modify or drop the existing manager-only `FOR ALL` policies on `tracks`, `grants`, `management_fees`. This is the same pattern already used for `events_select` in `supabase/migrations/20260709000003_rls.sql`.
- Never modify an existing migration file — always add a new one (per `CLAUDE.md`).
- Only `src/lib/**/*.test.ts` is covered by `vitest.config.ts`. Do not write test files for React components/routes — no other module in this codebase has one.
- No new TanStack Start route `loader`. Every existing page fetches data client-side via `useCollection`; the cockpit follows the same pattern.
- The route path `/` can only be owned by one route file at a time — deleting `src/routes/index.tsx` and adding `src/routes/_authenticated/index.tsx` must happen together (Task 4), otherwise the router's codegen will error on a duplicate path.
- French copy throughout, matching the rest of the app (e.g. "reste dû", "en attente", "déclarés SACEM").

---

### Task 1: Widen RLS so the artist role can read tracks, grants, and management_fees

**Files:**
- Create: `supabase/migrations/20260716000001_cockpit_readonly_rls.sql`

**Interfaces:**
- Consumes: nothing (pure SQL migration).
- Produces: three additional permissive SELECT policies that later tasks' artist-role queries rely on to return real rows instead of empty sets.

- [ ] **Step 1: Write the migration**

```sql
-- Additive read-only access for the artist role, needed so the cockpit
-- homepage can show real Tracks/Subventions/Finance data to the artist.
-- These are ADDITIONAL permissive policies — the existing manager-only
-- FOR ALL policies on these tables are untouched, so INSERT/UPDATE/DELETE
-- still require current_user_role() = 'manager'. Postgres ORs permissive
-- policies for the same command, same pattern as events_select.
CREATE POLICY "tracks_select_all" ON tracks FOR SELECT TO authenticated USING (true);
CREATE POLICY "grants_select_all" ON grants FOR SELECT TO authenticated USING (true);
CREATE POLICY "fees_select_all" ON management_fees FOR SELECT TO authenticated USING (true);
```

- [ ] **Step 2: Verify the migration only adds policies**

Run: `git diff --stat` and `cat supabase/migrations/20260716000001_cockpit_readonly_rls.sql`
Expected: one new file, three `CREATE POLICY` statements, no `DROP POLICY` or `ALTER` touching the existing `tracks_all` / `grants_all` / `fees_all` policies (those stay in `20260709000003_rls.sql`, untouched).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260716000001_cockpit_readonly_rls.sql
git commit -m "feat(rls): widen artist read access to tracks, grants, and management_fees"
```

---

### Task 2: Extract shared "next event" logic into `src/lib/calendrier.ts`

**Files:**
- Create: `src/lib/calendrier.ts`
- Create: `src/lib/__tests__/calendrier.test.ts`
- Modify: `src/routes/_authenticated/calendrier.tsx`

**Interfaces:**
- Consumes: `EventLineData` type from `@/components/modules/calendrier/EventLine` (fields: `id`, `title`, `event_date`, `location`, `type`, `status: "confirmé" | "TBC" | "annulé"`, `payments`).
- Produces: `ConcertPayment` type, `CALENDAR_SOURCES`, `paymentToCalendarEntry(p): EventLineData`, `mergeCalendarItems(events, payments): EventLineData[]`, `computeNextEvent(events, payments): EventLineData | undefined` — Task 4's Calendrier tile imports `computeNextEvent` and `ConcertPayment` directly.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/calendrier.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { addDays, subDays } from "date-fns";
import {
  computeNextEvent,
  mergeCalendarItems,
  paymentToCalendarEntry,
  type ConcertPayment,
} from "../calendrier";
import type { EventLineData } from "@/components/modules/calendrier/EventLine";

const iso = (d: Date) => d.toISOString().split("T")[0];
const future = (days: number) => iso(addDays(new Date(), days));
const past = (days: number) => iso(subDays(new Date(), days));

const makeEvent = (overrides: Partial<EventLineData> = {}): EventLineData => ({
  id: "e1",
  title: "Concert Test",
  event_date: future(10),
  location: null,
  type: "concert",
  status: "confirmé",
  payments: null,
  ...overrides,
});

const makePayment = (overrides: Partial<ConcertPayment> = {}): ConcertPayment => ({
  id: "p1",
  notes: "Booking Test",
  source: "booking",
  amount: 500,
  payment_date: future(5),
  status: "cachet_en_attente",
  event_id: null,
  ...overrides,
});

describe("paymentToCalendarEntry", () => {
  it("maps provisoire status to TBC", () => {
    expect(paymentToCalendarEntry(makePayment({ status: "provisoire" })).status).toBe("TBC");
  });

  it("maps any other status to confirmé", () => {
    expect(paymentToCalendarEntry(makePayment({ status: "payé" })).status).toBe("confirmé");
  });

  it("uses notes as title, falling back to source", () => {
    expect(paymentToCalendarEntry(makePayment({ notes: "Ma résidence" })).title).toBe("Ma résidence");
    expect(paymentToCalendarEntry(makePayment({ notes: null, source: "booking" })).title).toBe("booking");
  });

  it("marks résidence source as résidence type, everything else as concert", () => {
    expect(paymentToCalendarEntry(makePayment({ source: "résidence" })).type).toBe("résidence");
    expect(paymentToCalendarEntry(makePayment({ source: "booking" })).type).toBe("concert");
  });
});

describe("mergeCalendarItems", () => {
  it("includes standalone concert payments not yet linked to an event", () => {
    const payment = makePayment({ event_id: null, payment_date: future(3) });
    const result = mergeCalendarItems([], [payment]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(payment.id);
  });

  it("excludes payments already linked to an event", () => {
    const payment = makePayment({ event_id: "e1" });
    expect(mergeCalendarItems([], [payment])).toHaveLength(0);
  });

  it("excludes payments outside CALENDAR_SOURCES", () => {
    const payment = makePayment({ source: "label", event_id: null });
    expect(mergeCalendarItems([], [payment])).toHaveLength(0);
  });

  it("excludes payments without a payment_date", () => {
    const payment = makePayment({ payment_date: null, event_id: null });
    expect(mergeCalendarItems([], [payment])).toHaveLength(0);
  });

  it("sorts events and standalone payments together by date ascending", () => {
    const later = makeEvent({ id: "later", event_date: future(20) });
    const sooner = makePayment({ id: "sooner", payment_date: future(2), event_id: null });
    const result = mergeCalendarItems([later], [sooner]);
    expect(result.map((r) => r.id)).toEqual(["sooner", "later"]);
  });
});

describe("computeNextEvent", () => {
  it("returns the earliest future non-annulé event", () => {
    const soon = makeEvent({ id: "soon", event_date: future(2) });
    const later = makeEvent({ id: "later", event_date: future(20) });
    expect(computeNextEvent([later, soon], [])?.id).toBe("soon");
  });

  it("excludes past events", () => {
    const pastEvent = makeEvent({ event_date: past(2) });
    expect(computeNextEvent([pastEvent], [])).toBeUndefined();
  });

  it("excludes annulé events, falling through to the next one", () => {
    const cancelled = makeEvent({ id: "cancelled", event_date: future(1), status: "annulé" });
    const valid = makeEvent({ id: "valid", event_date: future(5) });
    expect(computeNextEvent([cancelled, valid], [])?.id).toBe("valid");
  });

  it("includes a standalone concert payment ahead of a later event", () => {
    const event = makeEvent({ id: "event", event_date: future(20) });
    const payment = makePayment({ id: "payment", payment_date: future(3), event_id: null });
    expect(computeNextEvent([event], [payment])?.id).toBe("payment");
  });

  it("returns undefined when nothing matches", () => {
    expect(computeNextEvent([], [])).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/lib/__tests__/calendrier.test.ts`
Expected: FAIL — `Cannot find module '../calendrier'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/calendrier.ts`:

```ts
import type { EventLineData } from "@/components/modules/calendrier/EventLine";

export interface ConcertPayment {
  id: string;
  notes: string | null;
  source: string;
  amount: number;
  payment_date: string | null;
  status: "provisoire" | "facturé" | "cachet_en_attente" | "payé" | "tbc";
  event_id: string | null;
}

export const CALENDAR_SOURCES = ["booking", "résidence", "répétition", "figuration"];

// Adapt a standalone booking/résidence payment to the EventLineData shape
export function paymentToCalendarEntry(p: ConcertPayment): EventLineData {
  return {
    id: p.id,
    title: p.notes ?? p.source,
    event_date: p.payment_date!,
    location: null,
    type: p.source === "résidence" ? "résidence" : "concert",
    status: p.status === "provisoire" ? "TBC" : "confirmé",
    payments: [{ id: p.id, status: p.status, amount: p.amount }],
  };
}

export function mergeCalendarItems(
  events: EventLineData[],
  payments: ConcertPayment[]
): EventLineData[] {
  const standaloneConcerts = payments
    .filter(
      (p) =>
        CALENDAR_SOURCES.includes(p.source) &&
        p.event_id === null &&
        p.payment_date !== null
    )
    .map(paymentToCalendarEntry);

  const merged = [...events, ...standaloneConcerts];
  return merged.sort((a, b) => a.event_date.localeCompare(b.event_date));
}

export function computeNextEvent(
  events: EventLineData[],
  payments: ConcertPayment[]
): EventLineData | undefined {
  const today = new Date().toISOString().split("T")[0];
  return mergeCalendarItems(events, payments).find(
    (e) => e.event_date >= today && e.status !== "annulé"
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/lib/__tests__/calendrier.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Refactor `calendrier.tsx` to use the shared module**

In `src/routes/_authenticated/calendrier.tsx`:

Replace this block (current lines 22-43):

```ts
interface ConcertPayment {
  id: string;
  notes: string | null;
  source: string;
  amount: number;
  payment_date: string | null;
  status: "provisoire" | "facturé" | "cachet_en_attente" | "payé" | "tbc";
  event_id: string | null;
}

// Adapt a standalone booking/résidence payment to the EventLineData shape
function paymentToCalendarEntry(p: ConcertPayment): EventLineData {
  return {
    id: p.id,
    title: p.notes ?? p.source,
    event_date: p.payment_date!,
    location: null,
    type: p.source === "résidence" ? "résidence" : "concert",
    status: p.status === "provisoire" ? "TBC" : "confirmé",
    payments: [{ id: p.id, status: p.status, amount: p.amount }],
  };
}
```

with:

```ts
import { mergeCalendarItems, type ConcertPayment } from "@/lib/calendrier";
```

(add this import near the top with the other imports — remove the now-unused `paymentToCalendarEntry`/interface block entirely).

Then replace this block (current lines 72-91):

```ts
  // Booking/résidence payments not yet attached to an event row
  const CALENDAR_SOURCES = ["booking", "résidence", "répétition", "figuration"];
  const standaloneConcerts = useMemo(
    () =>
      allPayments
        .filter(
          (p) =>
            CALENDAR_SOURCES.includes(p.source) &&
            p.event_id === null &&
            p.payment_date !== null
        )
        .map(paymentToCalendarEntry),
    [allPayments]
  );

  // Merge and sort by date
  const allItems = useMemo(() => {
    const merged = [...events, ...standaloneConcerts];
    return merged.sort((a, b) => a.event_date.localeCompare(b.event_date));
  }, [events, standaloneConcerts]);
```

with:

```ts
  // Merge events with standalone booking/résidence payments, sorted by date
  const allItems = useMemo(() => mergeCalendarItems(events, allPayments), [events, allPayments]);
```

The rest of the file (`visible`, `nextEvent`, JSX) is unchanged — it already reads from `allItems`.

- [ ] **Step 6: Verify no regressions**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

Run: `pnpm exec vitest run`
Expected: all existing tests still pass (this refactor touches no other lib file).

- [ ] **Step 7: Commit**

```bash
git add src/lib/calendrier.ts src/lib/__tests__/calendrier.test.ts src/routes/_authenticated/calendrier.tsx
git commit -m "refactor(calendrier): extract next-event merge logic into src/lib/calendrier.ts"
```

---

### Task 3: Add the generic `CockpitTile` component

**Files:**
- Create: `src/components/app/CockpitTile.tsx`

**Interfaces:**
- Consumes: nothing project-specific — a presentational component.
- Produces: `CockpitTile` component with props `{ to, label, icon, headline, detail?, accent? }`, used 6 times in Task 4.

- [ ] **Step 1: Write the component**

```tsx
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

interface CockpitTileProps {
  to: string;
  label: string;
  icon: LucideIcon;
  headline: string;
  detail?: string;
  accent?: "default" | "amber" | "green";
}

const ACCENT_CLASS: Record<NonNullable<CockpitTileProps["accent"]>, string> = {
  default: "text-foreground",
  amber: "text-amber-400",
  green: "text-green-400",
};

export function CockpitTile({
  to,
  label,
  icon: Icon,
  headline,
  detail,
  accent = "default",
}: CockpitTileProps) {
  return (
    <Link
      to={to}
      className="rounded-2xl border border-border bg-card px-4 py-4 transition active:scale-[0.98]"
    >
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground font-medium">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </div>
      <p className={`mt-1.5 font-display text-2xl font-bold truncate ${ACCENT_CLASS[accent]}`}>
        {headline}
      </p>
      {detail && <p className="mt-0.5 text-xs text-muted-foreground truncate">{detail}</p>}
    </Link>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm exec tsc --noEmit`
Expected: no errors. (No unit test — this is a presentational component; no component/page in this codebase has one, per `vitest.config.ts` scoping to `src/lib/**/*.test.ts` only.)

- [ ] **Step 3: Commit**

```bash
git add src/components/app/CockpitTile.tsx
git commit -m "feat(cockpit): add generic CockpitTile component"
```

---

### Task 4: Build the cockpit homepage route

**Files:**
- Delete: `src/routes/index.tsx`
- Create: `src/routes/_authenticated/index.tsx`

**Interfaces:**
- Consumes: `CockpitTile` (Task 3); `countValidCachets`, `countValidHours`, `GOAL_CACHETS`, `GOAL_HOURS`, `type PaymentForCachets` from `@/lib/cachets`; `computeResteDu`, `type ManagementFeeForCalc`, `type ExpenseForCalc` from `@/lib/fees`; `computeNextEvent`, `type ConcertPayment` from `@/lib/calendrier` (Task 2); `type EventLineData` from `@/components/modules/calendrier/EventLine`; `useAuth`, `useCollection`, `supabase`, `AppHeader`.
- Produces: the route at path `/`. No other task/component consumes this file.

- [ ] **Step 1: Delete the old redirect route**

```bash
rm src/routes/index.tsx
```

- [ ] **Step 2: Write the new cockpit route**

Create `src/routes/_authenticated/index.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Wallet, Music2, CheckSquare, Calendar, Disc3, Landmark } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app/AppHeader";
import { CockpitTile } from "@/components/app/CockpitTile";
import {
  countValidCachets,
  countValidHours,
  GOAL_CACHETS,
  GOAL_HOURS,
  type PaymentForCachets,
} from "@/lib/cachets";
import { computeResteDu, type ManagementFeeForCalc, type ExpenseForCalc } from "@/lib/fees";
import { computeNextEvent, type ConcertPayment } from "@/lib/calendrier";
import type { EventLineData } from "@/components/modules/calendrier/EventLine";

export const Route = createFileRoute("/_authenticated/")({
  component: CockpitPage,
});

// ── Finance tile ────────────────────────────────────────────────

interface FeeWithPayment extends ManagementFeeForCalc {
  payment: { payment_date: string | null; status: string } | null;
}

interface ArtistSummary {
  reste_du: number;
}

function ManagerFinanceTile() {
  const { profile } = useAuth();
  const commissionStart = profile?.commission_start_date ?? "2025-01-01";

  const { data: fees } = useCollection<FeeWithPayment>("management_fees", {
    select:
      "id, commission_due, status, already_paid_to_manager, is_commissionable, payment:payments(payment_date, status)",
  });
  const { data: expenses } = useCollection<ExpenseForCalc>("expenses", {
    select: "id, amount, status",
  });

  const filteredFees = fees.filter((f) => {
    if (f.payment?.status === "annulé") return false;
    const payDate = f.payment?.payment_date;
    return !payDate || payDate >= commissionStart;
  });
  const resteDu = computeResteDu(filteredFees, expenses);

  return (
    <CockpitTile
      to="/finance"
      label="Finance"
      icon={Wallet}
      headline={resteDu.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
      detail="reste dû"
      accent={resteDu > 0 ? "amber" : "default"}
    />
  );
}

function ArtistFinanceTile() {
  const { profile } = useAuth();
  const [summary, setSummary] = useState<ArtistSummary | null>(null);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from("artist_fee_summary")
      .select("reste_du")
      .eq("artist_id", profile.id)
      .maybeSingle()
      .then(({ data }) => setSummary(data));
  }, [profile]);

  const resteDu = summary?.reste_du ?? 0;

  return (
    <CockpitTile
      to="/finance"
      label="Finance"
      icon={Wallet}
      headline={resteDu.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
      detail="reste dû à ton manager"
      accent={resteDu > 0 ? "amber" : "default"}
    />
  );
}

// ── Cachets tile ────────────────────────────────────────────────

type CachetPayment = PaymentForCachets & { source: string };

function CachetsTile() {
  const { data: payments } = useCollection<CachetPayment>("payments", {
    select:
      "id, status, counts_for_intermittence, expires_at, payment_date, amount, hours, batch_id, source, batch:payment_batches(batch_count)",
  });

  const cachets = payments.filter((p) => p.source !== "sacem");
  const validCount = countValidCachets(cachets);
  const validHours = countValidHours(cachets);

  return (
    <CockpitTile
      to="/finance/cachets"
      label="Cachets"
      icon={Music2}
      headline={`${validCount} / ${GOAL_CACHETS}`}
      detail={`${validHours} / ${GOAL_HOURS} h`}
    />
  );
}

// ── Tâches tile ─────────────────────────────────────────────────

interface TaskForCount {
  id: string;
  status: "à_faire" | "en_cours" | "fait";
  assignee_role: "manager" | "artist" | "both";
}

function TachesTile() {
  const { profile } = useAuth();
  const { data: tasks } = useCollection<TaskForCount>("tasks", {
    select: "id, status, assignee_role",
  });

  const todoCount = tasks.filter(
    (t) => t.status !== "fait" && (profile?.role !== "artist" || t.assignee_role !== "manager")
  ).length;

  return (
    <CockpitTile
      to="/taches"
      label="Tâches"
      icon={CheckSquare}
      headline={`${todoCount}`}
      detail={todoCount > 0 ? "en attente" : "à jour"}
    />
  );
}

// ── Calendrier tile ─────────────────────────────────────────────

function CalendrierTile() {
  const { data: events } = useCollection<EventLineData>("events", {
    select: "id, title, event_date, location, type, status, payments(id, status, amount)",
  });
  const { data: payments } = useCollection<ConcertPayment>("payments", {
    select: "id, notes, source, amount, payment_date, status, event_id",
  });

  const nextEvent = computeNextEvent(events, payments);

  return (
    <CockpitTile
      to="/calendrier"
      label="Calendrier"
      icon={Calendar}
      headline={nextEvent ? nextEvent.title : "Aucun événement"}
      detail={
        nextEvent
          ? new Date(nextEvent.event_date).toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "long",
            }) + (nextEvent.location ? ` · ${nextEvent.location}` : "")
          : undefined
      }
    />
  );
}

// ── Tracks tile ───────────────────────────────────────────────────

interface TrackForCount {
  id: string;
  sacem_status: string;
}

function TracksTile() {
  const { data: tracks } = useCollection<TrackForCount>("tracks", {
    select: "id, sacem_status",
  });
  const declared = tracks.filter((t) => t.sacem_status === "déclaré").length;

  return (
    <CockpitTile
      to="/tracks"
      label="Tracks"
      icon={Disc3}
      headline={`${tracks.length} titres`}
      detail={`${declared} déclarés SACEM`}
    />
  );
}

// ── Subventions tile ──────────────────────────────────────────────

interface GrantForCount {
  id: string;
  status: "à_instruire" | "dossier_en_cours" | "déposé" | "obtenu" | "refusé" | "en_attente" | "inéligible";
  montant_max: number | null;
}

function SubventionsTile() {
  const { data: grants } = useCollection<GrantForCount>("grants", {
    select: "id, status, montant_max",
  });
  const totalObtenu = grants
    .filter((g) => g.status === "obtenu")
    .reduce((sum, g) => sum + (g.montant_max ?? 0), 0);
  const enInstruction = grants.filter((g) =>
    ["à_instruire", "dossier_en_cours"].includes(g.status)
  ).length;

  return (
    <CockpitTile
      to="/subventions"
      label="Subventions"
      icon={Landmark}
      headline={totalObtenu.toLocaleString("fr-FR", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      })}
      detail={enInstruction > 0 ? `${enInstruction} en instruction` : "obtenu"}
    />
  );
}

// ── Page ──────────────────────────────────────────────────────────

function CockpitPage() {
  const { profile } = useAuth();
  const isManager = profile?.role === "manager";

  return (
    <>
      <AppHeader title="Cockpit" />
      <div className="px-4 pt-4 pb-24 grid grid-cols-2 gap-3">
        {isManager ? <ManagerFinanceTile /> : <ArtistFinanceTile />}
        <CachetsTile />
        <TachesTile />
        <CalendrierTile />
        <TracksTile />
        <SubventionsTile />
      </div>
    </>
  );
}
```

Note: if `Disc3` or `Landmark` aren't exported by the installed `lucide-react` version, `tsc`/the build in Step 3 will fail with a clear "has no exported member" error — substitute any equivalent icon already used elsewhere in the app (e.g. `Music2` is already imported for Cachets, so pick a visually distinct one for Tracks/Subventions).

- [ ] **Step 3: Verify it builds**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

Run: `pnpm build`
Expected: build succeeds — this also exercises TanStack Router's file-based route codegen, which would error on a duplicate `/` route if Step 1's deletion were missed.

- [ ] **Step 4: Commit**

```bash
git add src/routes/index.tsx src/routes/_authenticated/index.tsx
git commit -m "feat(cockpit): add homepage summarizing all 6 modules at /"
```

---

### Task 5: Wire up navigation to and from the cockpit

**Files:**
- Modify: `src/routes/auth.tsx`
- Modify: `src/routes/_authenticated/onboarding.tsx`
- Modify: `src/routes/_authenticated/finance/index.tsx`
- Modify: `src/routes/_authenticated/taches.tsx`
- Modify: `src/routes/_authenticated/calendrier.tsx`
- Modify: `src/routes/_authenticated/tracks.tsx`
- Modify: `src/routes/_authenticated/subventions.tsx`

**Interfaces:**
- Consumes: `AppHeader`'s existing `backTo?: string` prop (`src/components/app/AppHeader.tsx`) — no changes to `AppHeader` itself.
- Produces: nothing consumed by later tasks (this is the last task).

- [ ] **Step 1: Land on `/` after sign-in instead of `/finance`**

In `src/routes/auth.tsx`, replace (line 24):

```ts
    if (!loading && user) navigate({ to: "/finance", replace: true });
```

with:

```ts
    if (!loading && user) navigate({ to: "/", replace: true });
```

- [ ] **Step 2: Land on `/` after onboarding instead of `/finance`**

In `src/routes/_authenticated/onboarding.tsx`, there are 4 occurrences of `navigate({ to: "/finance", replace: true });` — replace all 4 with `navigate({ to: "/", replace: true });`:
- Line 23 (the "already onboarded" redirect effect)
- Line 55 (artist "C'est fait, continuer" button)
- Line 65 (artist "Ignorer pour l'instant" button)
- Line 90 (manager `confirm()` after saving `commission_start_date`)

- [ ] **Step 3: Add a way back to the cockpit from each top-level page**

In `src/routes/_authenticated/finance/index.tsx`, replace (line 118):

```tsx
      <AppHeader title="Finance" />
```

with:

```tsx
      <AppHeader title="Finance" backTo="/" />
```

In `src/routes/_authenticated/taches.tsx`, replace (line 52):

```tsx
      <AppHeader title="Tâches" />
```

with:

```tsx
      <AppHeader title="Tâches" backTo="/" />
```

In `src/routes/_authenticated/calendrier.tsx`, replace (line 103):

```tsx
      <AppHeader title="Calendrier" />
```

with:

```tsx
      <AppHeader title="Calendrier" backTo="/" />
```

In `src/routes/_authenticated/tracks.tsx`, replace (line 35):

```tsx
      <AppHeader title="Tracks" />
```

with:

```tsx
      <AppHeader title="Tracks" backTo="/" />
```

In `src/routes/_authenticated/subventions.tsx`, replace (line 39):

```tsx
      <AppHeader title="Subventions" />
```

with:

```tsx
      <AppHeader title="Subventions" backTo="/" />
```

(`finance/cachets.tsx` and `finance/fees.tsx` are intentionally left unchanged — they keep `backTo="/finance"`, their correct parent page.)

- [ ] **Step 4: Verify no regressions**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

Run: `pnpm exec vitest run`
Expected: all tests still pass (this task touches no `src/lib` file).

- [ ] **Step 5: Commit**

```bash
git add src/routes/auth.tsx src/routes/_authenticated/onboarding.tsx src/routes/_authenticated/finance/index.tsx src/routes/_authenticated/taches.tsx src/routes/_authenticated/calendrier.tsx src/routes/_authenticated/tracks.tsx src/routes/_authenticated/subventions.tsx
git commit -m "feat(cockpit): navigate to / after auth/onboarding, add backTo from each module"
```
