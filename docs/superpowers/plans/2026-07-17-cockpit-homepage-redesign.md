# Cockpit Homepage Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the existing cockpit homepage (`src/routes/_authenticated/index.tsx`) from a flat 2-column grid of 6 uniform tiles into a "bento" layout (Calendrier hero card, Cachets hero card with a mini trend graph, then a 2×2 grid of the remaining 4 modules), and make the homepage the primary bottom-nav entry for both roles by moving Calendrier into the "Plus" sheet.

**Architecture:** Extract the intermittence timeline builder (`buildTimeline`) out of `IntermittenceGraph.tsx` into the already-tested `src/lib/cachets.ts`, so the homepage's new Cachets hero card and the full `/finance/cachets` graph share one implementation instead of two. Restructure `BottomNav.tsx` to add a `Home` tab and give both roles a "Plus" sheet (manager: Calendrier/Tracks/Subventions; artist: Calendrier only). Rebuild the homepage's two "hero" presentations directly in `src/routes/_authenticated/index.tsx`, following the same inline-sub-component convention the file already uses.

**Tech Stack:** TanStack Start (file-based routing), React 19 + TypeScript, Supabase, Tailwind v4, Recharts (already used by `IntermittenceGraph.tsx`), lucide-react icons, Vitest (scoped to `src/lib/**/*.test.ts` only).

## Global Constraints

- Only `src/lib/**/*.test.ts` is covered by `vitest.config.ts` — no component/route test files anywhere in this codebase.
- `GOAL_CACHETS = 43`, `GOAL_HOURS = 507` already exist in `src/lib/cachets.ts` — import them, never redefine.
- French copy throughout, matching the rest of the app. The new nav tab is labelled **"Accueil"**, not "Home" (English) — "Home" only names the internal constant/icon in code.
- No behavior change to any destination page (Finance, Cachets, Tâches, Calendrier, Tracks, Subventions) or to the RLS/data layer — only the homepage's presentation and `BottomNav.tsx` change.
- The `buildTimeline` extraction must be **behavior-preserving**: the full graph on `/finance/cachets` must compute identical output to before.

---

### Task 1: Extract `buildTimeline` into `src/lib/cachets.ts`

**Files:**
- Modify: `src/lib/cachets.ts`
- Modify: `src/lib/__tests__/cachets.test.ts`
- Modify: `src/components/modules/cachets/IntermittenceGraph.tsx`

**Interfaces:**
- Consumes: the existing private `CONFIRMED_CACHET_STATUSES` and exported `cachetCountFor` in `src/lib/cachets.ts`.
- Produces: `export interface TimelinePoint { ts: number; confirmed: number; potential: number }` and `export function buildTimeline(payments: PaymentForCachets[]): TimelinePoint[]` — Task 3's `CachetsHeroCard` imports both.

- [ ] **Step 1: Write the failing tests**

Update the import line at the top of `src/lib/__tests__/cachets.test.ts` from:

```ts
import { describe, it, expect } from "vitest";
import { addDays, subDays } from "date-fns";
import { countValidCachets, expiringWithin, nextStatus, previousStatus } from "../cachets";
```

to:

```ts
import { describe, it, expect } from "vitest";
import { addDays, subDays, subMonths, addMonths } from "date-fns";
import { countValidCachets, expiringWithin, nextStatus, previousStatus, buildTimeline } from "../cachets";
```

Then append this new `describe` block at the end of the file (after the existing `nextStatus / previousStatus` block):

```ts
describe("buildTimeline", () => {
  it("returns points sorted ascending by timestamp", () => {
    const timeline = buildTimeline([make()]);
    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i].ts).toBeGreaterThanOrEqual(timeline[i - 1].ts);
    }
  });

  it("includes an exact point for today", () => {
    const timeline = buildTimeline([make()]);
    const nowTs = Date.now();
    const closest = timeline.reduce((a, b) =>
      Math.abs(b.ts - nowTs) < Math.abs(a.ts - nowTs) ? b : a
    );
    expect(Math.abs(closest.ts - nowTs)).toBeLessThan(2000);
  });

  it("spans from ~13 months ago to ~6 months ahead", () => {
    const timeline = buildTimeline([]);
    const first = timeline[0];
    const last = timeline[timeline.length - 1];
    const thirteenMonthsAgo = subMonths(new Date(), 13).getTime();
    const sixMonthsAhead = addMonths(new Date(), 6).getTime();
    expect(Math.abs(first.ts - thirteenMonthsAgo)).toBeLessThan(24 * 60 * 60 * 1000);
    expect(Math.abs(last.ts - sixMonthsAhead)).toBeLessThan(24 * 60 * 60 * 1000);
  });

  it("counts a currently-valid payé payment as confirmed at today's point", () => {
    const timeline = buildTimeline([
      make({ status: "payé", expires_at: future(30), payment_date: past(30) }),
    ]);
    const nowTs = Date.now();
    const todayPoint = timeline.reduce((a, b) =>
      Math.abs(b.ts - nowTs) < Math.abs(a.ts - nowTs) ? b : a
    );
    expect(todayPoint.confirmed).toBe(1);
    expect(todayPoint.potential).toBe(0);
  });

  it("counts a provisoire payment as potential, not confirmed, at today's point", () => {
    const timeline = buildTimeline([
      make({ status: "provisoire", expires_at: null, payment_date: past(10) }),
    ]);
    const nowTs = Date.now();
    const todayPoint = timeline.reduce((a, b) =>
      Math.abs(b.ts - nowTs) < Math.abs(a.ts - nowTs) ? b : a
    );
    expect(todayPoint.confirmed).toBe(0);
    expect(todayPoint.potential).toBe(1);
  });

  it("deduplicates a batched payment within the same window", () => {
    const timeline = buildTimeline([
      make({
        id: "p1",
        batch_id: "b1",
        batch: { batch_count: 3 },
        status: "payé",
        expires_at: future(30),
        payment_date: past(30),
      }),
      make({
        id: "p2",
        batch_id: "b1",
        batch: { batch_count: 3 },
        status: "payé",
        expires_at: future(30),
        payment_date: past(30),
      }),
    ]);
    const nowTs = Date.now();
    const todayPoint = timeline.reduce((a, b) =>
      Math.abs(b.ts - nowTs) < Math.abs(a.ts - nowTs) ? b : a
    );
    expect(todayPoint.confirmed).toBe(3);
  });
});
```

(`make`, `future`, `past` are the existing helpers already defined near the top of this test file — reuse them as-is, don't redefine.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/lib/__tests__/cachets.test.ts`
Expected: FAIL — `buildTimeline is not exported` (or similar) since `src/lib/cachets.ts` doesn't export it yet.

- [ ] **Step 3: Add `buildTimeline` to `src/lib/cachets.ts`**

Change the import line at the top of `src/lib/cachets.ts` from:

```ts
import { addDays, addYears, subMonths } from "date-fns";
```

to:

```ts
import { addDays, addMonths, addYears, subMonths } from "date-fns";
```

Then append this at the very end of the file (after the existing `expiringWithin` function):

```ts
// ── Timeline ──────────────────────────────────────────────────

export interface TimelinePoint {
  ts: number;
  confirmed: number;
  potential: number;
}

const TBC_STATUSES = ["provisoire", "tbc"] as const;

function countInWindow(
  payments: PaymentForCachets[],
  date: Date,
  statuses: readonly string[]
): number {
  const seen = new Set<string>();
  let total = 0;
  for (const p of payments) {
    if (!p.counts_for_intermittence) continue;
    if (!(statuses as string[]).includes(p.status)) continue;

    if (p.expires_at) {
      const expiresAt = new Date(p.expires_at);
      if (expiresAt <= date) continue;
      if (p.payment_date && new Date(p.payment_date) > date) continue;
    } else if (p.payment_date) {
      const pd = new Date(p.payment_date);
      const windowStart = subMonths(date, 12);
      if (pd < windowStart || pd > date) continue;
    } else {
      continue;
    }

    if (p.batch_id) {
      if (!seen.has(p.batch_id)) {
        seen.add(p.batch_id);
        total += cachetCountFor(p);
      }
    } else {
      total += cachetCountFor(p);
    }
  }
  return total;
}

/**
 * Build a weekly-sampled timeline of confirmed vs. TBC cachet counts, from
 * 13 months ago to 6 months from now, plus an exact "today" point (weekly
 * sampling alone rarely lands exactly on today).
 */
export function buildTimeline(payments: PaymentForCachets[]): TimelinePoint[] {
  const now = new Date();
  const start = subMonths(now, 13);
  const end = addMonths(now, 6);
  const STEP = 7;

  const points: TimelinePoint[] = [];
  let cur = start;
  while (cur <= end) {
    points.push({
      ts: cur.getTime(),
      confirmed: countInWindow(payments, cur, CONFIRMED_CACHET_STATUSES),
      potential: countInWindow(payments, cur, TBC_STATUSES),
    });
    cur = addDays(cur, STEP);
  }
  points.push({
    ts: now.getTime(),
    confirmed: countInWindow(payments, now, CONFIRMED_CACHET_STATUSES),
    potential: countInWindow(payments, now, TBC_STATUSES),
  });
  points.sort((a, b) => a.ts - b.ts);
  return points;
}
```

Note: this reuses the file's existing private `CONFIRMED_CACHET_STATUSES` constant (already defined near the top of `src/lib/cachets.ts`, backing `isValidAt`) — do not redefine it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/lib/__tests__/cachets.test.ts`
Expected: PASS, 28 tests (22 existing + 6 new).

- [ ] **Step 5: Refactor `IntermittenceGraph.tsx` to use the shared `buildTimeline`**

In `src/components/modules/cachets/IntermittenceGraph.tsx`, replace the top of the file — from the `import` statements down through the end of the local `buildTimeline` function (currently lines 1–91, ending right before `interface Props`) — with:

```tsx
import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  GOAL_CACHETS,
  GOAL_HOURS,
  countValidHours,
  buildTimeline,
  type PaymentForCachets,
} from "@/lib/cachets";
```

This removes the file's local `TimelinePoint` interface, `countInWindow` function, `CONFIRMED_STATUSES`/`TBC_STATUSES` constants, and `buildTimeline` function entirely (all now live in `src/lib/cachets.ts`), and drops the now-unused `subMonths`/`addDays`/`addMonths`/`cachetCountFor` imports. Everything below this point in the file (the `Props` interface, `IntermittenceGraph` component body, JSX) is unchanged — it already calls `buildTimeline(payments)` and references `TimelinePoint`-shaped data by inference, not by importing the type name directly, so no other line needs to change.

- [ ] **Step 6: Verify no regressions**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

Run: `pnpm exec vitest run`
Expected: all tests pass (28 in `cachets.test.ts` + the other existing suites, unaffected).

- [ ] **Step 7: Commit**

```bash
git add src/lib/cachets.ts src/lib/__tests__/cachets.test.ts src/components/modules/cachets/IntermittenceGraph.tsx
git commit -m "refactor(cachets): extract buildTimeline into src/lib/cachets.ts"
```

---

### Task 2: Restructure `BottomNav` — add Home, move Calendrier into Plus for both roles

**Files:**
- Modify: `src/components/app/BottomNav.tsx`

**Interfaces:**
- Consumes: nothing from other tasks — self-contained.
- Produces: nothing consumed by later tasks (Task 3 is independent of this file).

- [ ] **Step 1: Replace the entire file**

Overwrite `src/components/app/BottomNav.tsx` with:

```tsx
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Music2,
  Wallet,
  CheckSquare,
  Home,
  MoreHorizontal,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const HOME = { to: "/", label: "Accueil", icon: Home } as const;
const FINANCE = { to: "/finance", label: "Finance", icon: Wallet } as const;
const CACHETS = { to: "/finance/cachets", label: "Cachets", icon: Music2 } as const;
const TACHES = { to: "/taches", label: "Tâches", icon: CheckSquare } as const;

const MANAGER_PRIMARY = [HOME, FINANCE, TACHES] as const;
const ARTIST_PRIMARY = [HOME, CACHETS, TACHES] as const;

const MANAGER_MORE = [
  { to: "/calendrier", label: "Agenda" },
  { to: "/tracks", label: "Tracks" },
  { to: "/subventions", label: "Subventions" },
] as const;

const ARTIST_MORE = [{ to: "/calendrier", label: "Agenda" }] as const;

export function BottomNav() {
  const { profile } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [moreOpen, setMoreOpen] = useState(false);

  const isManager = profile?.role === "manager";
  const primaryTabs = isManager ? MANAGER_PRIMARY : ARTIST_PRIMARY;
  const moreItems = isManager ? MANAGER_MORE : ARTIST_MORE;

  const moreActive = moreItems.some((t) => pathname.startsWith(t.to));

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 backdrop-blur-xl"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom)] pt-1.5">
        {primaryTabs.map((t) => {
          const active =
            t.to === "/finance"
              ? pathname.startsWith("/finance")
              : t.to === "/"
                ? pathname === "/"
                : pathname.startsWith(t.to);
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1.5 text-[0.64rem] font-medium transition ${
                active ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <Icon
                className="h-5 w-5"
                strokeWidth={active ? 2.4 : 1.8}
                aria-hidden="true"
              />
              {t.label}
            </Link>
          );
        })}

        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button
              className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1.5 text-[0.64rem] font-medium transition ${
                moreActive ? "text-foreground" : "text-muted-foreground"
              }`}
              aria-label="Plus de modules"
            >
              <MoreHorizontal className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
              Plus
            </button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="rounded-t-3xl pb-[env(safe-area-inset-bottom)]"
          >
            <SheetHeader className="mb-4">
              <SheetTitle className="font-display text-lg">Modules</SheetTitle>
            </SheetHeader>
            <div className={`grid gap-3 pb-4 ${moreItems.length === 1 ? "grid-cols-1" : "grid-cols-3"}`}>
              {moreItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMoreOpen(false)}
                  className={`flex flex-col items-center justify-center gap-2 rounded-2xl border py-4 text-sm font-medium transition ${
                    pathname.startsWith(item.to)
                      ? "border-foreground/30 bg-card text-foreground"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
```

Key differences from the current file, for your own sanity-check while writing this:
- New `HOME` tab (`to: "/"`, label **"Accueil"**, `Home` icon) is first in both `MANAGER_PRIMARY` and `ARTIST_PRIMARY`.
- The standalone `CALENDRIER` constant (with its `Calendar` icon) is gone — Calendrier now only appears as a label-only entry inside `MANAGER_MORE`/`ARTIST_MORE`.
- New `ARTIST_MORE` array (previously the artist role had no "Plus" sheet at all).
- The `<Sheet>` is no longer wrapped in `{isManager && (...)}` — it renders for both roles now, using `moreItems` instead of the hardcoded `MANAGER_MORE`.
- The active-tab ternary gained a third branch: `t.to === "/" ? pathname === "/" : ...` — without this, `Home` would show as active on every page, since `pathname.startsWith("/")` is true for every path.
- The "Plus" sheet's grid uses `grid-cols-1` when there's only one item (the artist's case, with just Agenda) instead of always `grid-cols-3` (which would leave two empty cells for a single item).

If `Home` isn't exported by the installed `lucide-react` version, `tsc` in Step 2 will fail with a clear "has no exported member" error — it's an extremely common icon name, but if this happens, substitute any equivalent (e.g. `Home` alternatives aren't usually needed, but note the substitution in your report if you must).

- [ ] **Step 2: Verify it builds**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/app/BottomNav.tsx
git commit -m "feat(nav): add Accueil as primary tab, move Calendrier into Plus for both roles"
```

---

### Task 3: Rebuild the homepage as a bento layout

**Files:**
- Modify: `src/routes/_authenticated/index.tsx`

**Interfaces:**
- Consumes: `buildTimeline`, `type TimelinePoint` (unused directly but implied by `buildTimeline`'s return type), `countValidCachets`, `countValidHours`, `GOAL_CACHETS`, `GOAL_HOURS`, `type PaymentForCachets` from `@/lib/cachets` (Task 1); `computeNextEvent`, `type ConcertPayment` from `@/lib/calendrier` (already existed before this plan); `CockpitTile` (unchanged, already exists).
- Produces: nothing consumed elsewhere — this is the last task.

- [ ] **Step 1: Replace the entire file**

Overwrite `src/routes/_authenticated/index.tsx` with:

```tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { Wallet, Music2, CheckSquare, Calendar, Disc3, Landmark } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app/AppHeader";
import { CockpitTile } from "@/components/app/CockpitTile";
import {
  countValidCachets,
  countValidHours,
  buildTimeline,
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

// ── Calendrier hero card ──────────────────────────────────────────

function CalendrierHeroCard() {
  const { data: events } = useCollection<EventLineData>("events", {
    select: "id, title, event_date, location, type, status, payments(id, status, amount)",
  });
  const { data: payments } = useCollection<ConcertPayment>("payments", {
    select: "id, notes, source, amount, payment_date, status, event_id",
  });

  const nextEvent = computeNextEvent(events, payments);

  return (
    <Link
      to="/calendrier"
      className="block rounded-2xl border border-border bg-card px-5 py-5 transition active:scale-[0.98]"
    >
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground font-medium">
        <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Prochain événement
      </div>
      {nextEvent ? (
        <>
          <p className="mt-2 font-display text-2xl font-bold text-foreground truncate">
            {nextEvent.title}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {new Date(nextEvent.event_date).toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
            {nextEvent.location && ` · ${nextEvent.location}`}
          </p>
        </>
      ) : (
        <p className="mt-2 font-display text-xl font-bold text-foreground">
          Aucun événement à venir
        </p>
      )}
    </Link>
  );
}

// ── Cachets hero card ─────────────────────────────────────────────

type CachetPayment = PaymentForCachets & { source: string };

function CachetsHeroCard() {
  const { data: payments } = useCollection<CachetPayment>("payments", {
    select:
      "id, status, counts_for_intermittence, expires_at, payment_date, amount, hours, batch_id, source, batch:payment_batches(batch_count)",
  });

  const cachets = payments.filter((p) => p.source !== "sacem");
  const validCount = countValidCachets(cachets);
  const validHours = countValidHours(cachets);
  const timeline = useMemo(() => buildTimeline(cachets), [cachets]);

  return (
    <Link
      to="/finance/cachets"
      className="block rounded-2xl border border-border bg-card px-5 py-5 transition active:scale-[0.98]"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground font-medium">
            <Music2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Cachets
          </div>
          <p className="mt-1 font-display text-2xl font-bold text-foreground">
            {validCount} <span className="text-sm font-normal text-muted-foreground">/ {GOAL_CACHETS}</span>
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {validHours} / {GOAL_HOURS} h
        </p>
      </div>
      <div className="mt-2 h-10">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={timeline} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <Area
              type="monotone"
              dataKey="confirmed"
              stackId="cachets"
              stroke="#4ade80"
              strokeWidth={2}
              fill="#4ade80"
              fillOpacity={0.15}
              dot={false}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="potential"
              stackId="cachets"
              stroke="#94a3b8"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              fill="#94a3b8"
              fillOpacity={0.08}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Link>
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
    </>
  );
}
```

What changed from the current file, for your own sanity-check:
- `Link` is now imported from `@tanstack/react-router` (both hero cards render their own `<Link>` instead of going through `CockpitTile`).
- `useMemo` added to the React import (used by `CachetsHeroCard` to memoize `buildTimeline(cachets)`).
- `AreaChart`, `Area`, `ResponsiveContainer` imported from `recharts` (already a project dependency, already used by `IntermittenceGraph.tsx`).
- `buildTimeline` added to the `@/lib/cachets` import (from Task 1).
- The old `CachetsTile`/`CalendrierTile` functions (which rendered through the generic `CockpitTile`) are replaced by `CachetsHeroCard`/`CalendrierHeroCard`, which render their own larger, bespoke card markup.
- `CockpitPage`'s JSX changes from a flat `grid-cols-2` of 6 tiles to: `CalendrierHeroCard`, then `CachetsHeroCard`, then a `grid-cols-2` of the remaining 4 (`Finance`, `Tâches`, `Tracks`, `Subventions`).
- `ManagerFinanceTile`, `ArtistFinanceTile`, `TachesTile`, `TracksTile`, `SubventionsTile`, and all their supporting interfaces (`FeeWithPayment`, `ArtistSummary`, `TaskForCount`, `TrackForCount`, `GrantForCount`) are **unchanged** — copied verbatim from the current file.

- [ ] **Step 2: Verify it builds**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

Run: `pnpm build`
Expected: build succeeds.

Run: `pnpm exec vitest run`
Expected: all tests still pass (this task touches no `src/lib` file).

- [ ] **Step 3: Commit**

```bash
git add src/routes/_authenticated/index.tsx
git commit -m "feat(cockpit): rebuild homepage as a bento layout with hero cards"
```
