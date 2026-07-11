import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { computeResteDu, computeControlRate } from "@/lib/fees";
import { AppHeader } from "@/components/app/AppHeader";
import { FeeLine, type FeeLineData } from "@/components/modules/fees/FeeLine";
import { VersementDrawer } from "@/components/modules/fees/VersementDrawer";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated/finance/fees")({
  component: FeesPage,
});

interface ExpenseRow {
  id: string;
  amount: number;
  status: "à_rembourser" | "remboursée";
}

interface ArtistSummary {
  artist_id: string;
  total_due: number;
  total_paid: number;
  ndf_pending: number;
  reste_du: number;
}

function ManagerFeesView() {
  const { profile } = useAuth();
  const [versementOpen, setVersementOpen] = useState(false);

  const { data: fees, refresh: refreshFees } = useCollection<FeeLineData>("management_fees", {
    select: "*, payment:payments(notes, source, amount, payment_date, deductible_expenses)",
    order: { column: "created_at", ascending: false },
  });

  const { data: expenses, refresh: refreshExpenses } = useCollection<ExpenseRow>("expenses", {
    order: { column: "created_at", ascending: false },
  });

  const commissionStart = profile?.commission_start_date ?? "2025-01-01";

  const filteredFees = useMemo(
    () =>
      fees.filter((f) => {
        const payDate = f.payment?.payment_date;
        return !payDate || payDate >= commissionStart;
      }),
    [fees, commissionStart]
  );

  const resteDu = computeResteDu(filteredFees, expenses);
  const totalEncaisse = filteredFees.reduce((sum, f) => sum + (f.payment?.amount ?? 0), 0);
  const controlRate = computeControlRate(filteredFees, totalEncaisse);

  const commissionDueTotal = filteredFees
    .filter((f) => f.status === "due")
    .reduce((sum, f) => sum + f.commission_due, 0);
  const ndfTotal = expenses
    .filter((e) => e.status === "à_rembourser")
    .reduce((sum, e) => sum + e.amount, 0);
  const alreadyPaid = filteredFees.reduce((sum, f) => sum + f.already_paid_to_manager, 0);

  return (
    <>
      <AppHeader title="Fees" subtitle={`depuis ${commissionStart}`} backTo="/finance" />

      <div className="px-4 pt-4 pb-6 space-y-4">
        {/* Hero card */}
        <div className="rounded-2xl border border-border bg-card px-5 py-4 space-y-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Reste dû
            </p>
            <p className="mt-1 font-display text-5xl font-bold text-foreground">
              {resteDu.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
            </p>
          </div>

          {/* Breakdown */}
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/50 p-3 text-xs">
            <div>
              <p className="text-muted-foreground">Commission due</p>
              <p className="mt-0.5 font-semibold text-amber-400">
                {commissionDueTotal.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">NDF</p>
              <p className="mt-0.5 font-semibold text-foreground">
                {ndfTotal.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Déjà versé</p>
              <p className="mt-0.5 font-semibold text-green-400">
                {alreadyPaid.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
              </p>
            </div>
          </div>

          {/* Control rate */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              Taux de contrôle · total encaissé{" "}
              {totalEncaisse.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
            </span>
            <span className="font-semibold text-foreground">
              {(controlRate * 100).toFixed(1)} %
            </span>
          </div>

          <button
            onClick={() => setVersementOpen(true)}
            className="w-full rounded-full border border-border bg-background py-2.5 text-sm font-medium text-foreground transition hover:bg-muted"
          >
            Enregistrer un versement
          </button>
        </div>

        {/* Fee lines */}
        <div className="space-y-2">
          {filteredFees.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Aucune ligne de commission.
            </p>
          )}
          {filteredFees.map((f) => (
            <FeeLine key={f.id} fee={f} />
          ))}
        </div>
      </div>

      <VersementDrawer
        open={versementOpen}
        onOpenChange={setVersementOpen}
        totalDue={resteDu}
        onSuccess={() => { refreshFees(); refreshExpenses(); }}
      />
    </>
  );
}

function ArtistFeesView() {
  const { profile } = useAuth();
  const [summary, setSummary] = useState<ArtistSummary | null>(null);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from("artist_fee_summary")
      .select("*")
      .eq("artist_id", profile.id)
      .maybeSingle()
      .then(({ data }) => setSummary(data));
  }, [profile]);

  return (
    <>
      <AppHeader title="Fees" backTo="/finance" />
      <div className="px-4 pt-4 pb-6">
        <div className="rounded-2xl border border-border bg-card px-5 py-6 text-center">
          <p className="text-sm text-muted-foreground">Montant dû à ton manager</p>
          <p className="mt-3 font-display text-5xl font-bold text-foreground">
            {summary
              ? summary.reste_du.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })
              : "—"}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Mis à jour en temps réel
          </p>
        </div>
      </div>
    </>
  );
}

function FeesPage() {
  const { profile } = useAuth();
  if (profile?.role === "artist") return <ArtistFeesView />;
  return <ManagerFeesView />;
}
