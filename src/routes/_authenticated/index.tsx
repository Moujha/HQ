import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { Wallet, Music2, CheckSquare, Calendar, Disc3, Landmark } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/app/AppHeader";
import { CockpitTile } from "@/components/app/CockpitTile";
import { NotificationsToggle } from "@/components/app/NotificationsToggle";
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
        <NotificationsToggle />
      </div>
    </>
  );
}
