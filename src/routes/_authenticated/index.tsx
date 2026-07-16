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
