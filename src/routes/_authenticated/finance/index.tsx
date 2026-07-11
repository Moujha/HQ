import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { AppHeader } from "@/components/app/AppHeader";
import { RevenueLine, type RevenueLineData } from "@/components/modules/finance/RevenueLine";
import { AddRevenueSheet } from "@/components/modules/finance/AddRevenueSheet";
import { SacemImportDrawer } from "@/components/modules/tracks/SacemImportDrawer";
import { countValidCachets, countValidHours, type PaymentForCachets } from "@/lib/cachets";
import { computeResteDu, type ManagementFeeForCalc, type ExpenseForCalc } from "@/lib/fees";

export const Route = createFileRoute("/_authenticated/finance/")({
  component: FinancePage,
});

type FinanceFilter =
  | "tous"
  | "cachets"
  | "sacem"
  | "label"
  | "clip"
  | "résidence"
  | "à_venir";

const FILTER_LABELS: Record<FinanceFilter, string> = {
  tous: "Tous",
  cachets: "Cachets",
  sacem: "SACEM",
  label: "Label",
  clip: "Clip",
  résidence: "Résidence",
  à_venir: "À venir",
};

type FullPayment = RevenueLineData & PaymentForCachets;

interface FeeWithPayment extends ManagementFeeForCalc {
  payment: { payment_date: string | null } | null;
}

function FinancePage() {
  const { profile } = useAuth();
  const isManager = profile?.role === "manager";
  const [filter, setFilter] = useState<FinanceFilter>("tous");
  const [addOpen, setAddOpen] = useState(false);
  const [sacemOpen, setSacemOpen] = useState(false);

  const { data: allPayments, refresh: refreshPayments } = useCollection<FullPayment>(
    "payments",
    {
      select: "*, batch:payment_batches(batch_count)",
      order: { column: "payment_date", ascending: false },
    }
  );

  const { data: fees } = useCollection<FeeWithPayment>("management_fees", {
    select: "id, commission_due, status, already_paid_to_manager, is_commissionable, payment:payments(payment_date)",
  });

  const { data: expenses } = useCollection<ExpenseForCalc>("expenses", {});

  const commissionStart = profile?.commission_start_date ?? "2025-01-01";

  const filteredFees = useMemo(
    () =>
      fees.filter((f) => {
        const payDate = f.payment?.payment_date;
        return !payDate || payDate >= commissionStart;
      }),
    [fees, commissionStart]
  );

  const cachets = useMemo(
    () => allPayments.filter((p) => p.source !== "sacem"),
    [allPayments]
  );

  const validCount = countValidCachets(cachets);
  const validHours = countValidHours(cachets);
  const resteDu = computeResteDu(filteredFees, expenses);

  const now = new Date();

  const filtered = useMemo(() => {
    switch (filter) {
      case "cachets":
        return allPayments.filter((p) => p.source === "booking");
      case "sacem":
        return allPayments.filter((p) => p.source === "sacem");
      case "label":
        return allPayments.filter((p) => p.source === "label");
      case "clip":
        return allPayments.filter((p) => p.source === "clip");
      case "résidence":
        return allPayments.filter((p) => p.source === "résidence");
      case "à_venir":
        return allPayments.filter(
          (p) =>
            (p.payment_date != null && new Date(p.payment_date) > now) ||
            p.status === "provisoire" ||
            p.status === "cachet_en_attente"
        );
      default:
        return allPayments;
    }
  }, [allPayments, filter, now]);

  return (
    <>
      <AppHeader title="Finance" />

      <div className="px-4 pt-4 pb-24 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/finance/cachets"
            className="rounded-2xl border border-border bg-card px-4 py-4 transition active:scale-[0.98]"
          >
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
              Cachets
            </p>
            <p className="mt-1 font-display text-2xl font-bold text-foreground">
              {validCount}
            </p>
            <p className="text-xs text-muted-foreground">{validHours} h valides</p>
          </Link>
          <Link
            to="/finance/fees"
            className="rounded-2xl border border-border bg-card px-4 py-4 transition active:scale-[0.98]"
          >
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
              Fees manager
            </p>
            <p
              className={`mt-1 font-display text-2xl font-bold ${
                resteDu > 0 ? "text-amber-400" : "text-foreground"
              }`}
            >
              {resteDu.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
            </p>
            <p className="text-xs text-muted-foreground">reste dû</p>
          </Link>
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
          {(Object.keys(FILTER_LABELS) as FinanceFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                filter === f
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>

        {/* Revenue list */}
        <div className="space-y-2">
          {filtered.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Aucun revenu{filter !== "tous" ? " dans cette catégorie" : ""}.
            </p>
          )}
          {filtered.map((p) => (
            <RevenueLine key={p.id} revenue={p} />
          ))}
        </div>
      </div>

      {isManager && (
        <button
          onClick={() => setAddOpen(true)}
          aria-label="Ajouter un revenu"
          className="fixed bottom-[max(env(safe-area-inset-bottom),1rem)] right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-foreground text-background shadow-lg transition active:scale-95"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      <AddRevenueSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        onSacemRequested={() => setSacemOpen(true)}
        onSuccess={refreshPayments}
      />
      <SacemImportDrawer
        open={sacemOpen}
        onOpenChange={setSacemOpen}
        onSuccess={refreshPayments}
      />
    </>
  );
}
