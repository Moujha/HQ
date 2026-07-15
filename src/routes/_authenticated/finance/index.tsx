import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { AppHeader } from "@/components/app/AppHeader";
import { SearchFilterSortBar } from "@/components/app/SearchFilterSortBar";
import { RevenueLine, type RevenueLineData } from "@/components/modules/finance/RevenueLine";
import { AddRevenueSheet } from "@/components/modules/finance/AddRevenueSheet";
import { SacemImportDrawer } from "@/components/modules/tracks/SacemImportDrawer";
import { EditPaymentDrawer } from "@/components/modules/cachets/EditPaymentDrawer";
import { CachetFilterSheet } from "@/components/modules/cachets/CachetFilterSheet";
import {
  countValidCachets,
  countValidHours,
  STATUS_LABEL,
  writePaymentStatus,
  type PaymentForCachets,
} from "@/lib/cachets";
import {
  applyCachetFilters,
  sortCachetsByDate,
  countActiveFilters,
  EMPTY_FILTERS,
  type CachetFilters,
} from "@/lib/cachetFilters";
import { computeResteDu, type ManagementFeeForCalc, type ExpenseForCalc } from "@/lib/fees";

export const Route = createFileRoute("/_authenticated/finance/")({
  component: FinancePage,
});

const SOURCE_OPTIONS = [
  { value: "booking", label: "Concert" },
  { value: "répétition", label: "Répétition" },
  { value: "formation", label: "Formation" },
  { value: "accompagnement", label: "Accompagnement" },
  { value: "figuration", label: "Figuration" },
  { value: "résidence", label: "Résidence" },
  { value: "clip", label: "Clip" },
  { value: "track", label: "Track" },
  { value: "label", label: "Label" },
  { value: "sacem", label: "SACEM" },
] as const;

type FullPayment = RevenueLineData & PaymentForCachets & {
  territory: "france" | "étranger";
  deductible_expenses: number;
};

interface FeeWithPayment extends ManagementFeeForCalc {
  payment: { payment_date: string | null; status: string } | null;
}

function FinancePage() {
  const { profile } = useAuth();
  const isManager = profile?.role === "manager";
  const [filters, setFilters] = useState<CachetFilters>(EMPTY_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [sortAsc, setSortAsc] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [sacemOpen, setSacemOpen] = useState(false);
  const [editPayment, setEditPayment] = useState<FullPayment | null>(null);

  const { data: allPayments, refresh: refreshPayments } = useCollection<FullPayment>(
    "payments",
    {
      select: "*, batch:payment_batches(batch_count)",
      order: { column: "payment_date", ascending: false },
    }
  );

  const { data: fees } = useCollection<FeeWithPayment>("management_fees", {
    select: "id, commission_due, status, already_paid_to_manager, is_commissionable, payment:payments(payment_date, status)",
  });

  const { data: expenses } = useCollection<ExpenseForCalc>("expenses", {});

  const commissionStart = profile?.commission_start_date ?? "2025-01-01";

  const filteredFees = useMemo(
    () =>
      fees.filter((f) => {
        if (f.payment?.status === "annulé") return false;
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

  const searched = useMemo(() => applyCachetFilters(allPayments, filters), [allPayments, filters]);
  const filtered = useMemo(() => sortCachetsByDate(searched, sortAsc), [searched, sortAsc]);
  const activeFilterCount = countActiveFilters(filters);

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

        <SearchFilterSortBar
          search={filters.search}
          onSearchChange={(value) => setFilters((f) => ({ ...f, search: value }))}
          activeFilterCount={activeFilterCount}
          onFilterClick={() => setFilterSheetOpen(true)}
          sortAsc={sortAsc}
          onSortToggle={() => setSortAsc((v) => !v)}
        />

        {/* Revenue list */}
        <div className="space-y-2">
          {filtered.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Aucun revenu{activeFilterCount > 0 || filters.search ? " pour ces filtres" : ""}.
            </p>
          )}
          {filtered.map((p) => (
            <RevenueLine
              key={p.id}
              revenue={p}
              onClick={() => setEditPayment(p)}
              interactive={p.source !== "sacem"}
              swipeEnabled={isManager}
              onSwipeStatusChange={(next) => handleSwipeStatusChange(p, next)}
            />
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

      <EditPaymentDrawer
        open={editPayment !== null}
        onOpenChange={(v) => {
          if (!v) setEditPayment(null);
        }}
        payment={editPayment}
        onSuccess={refreshPayments}
      />

      <CachetFilterSheet
        open={filterSheetOpen}
        onOpenChange={setFilterSheetOpen}
        filters={filters}
        onChange={setFilters}
        sourceOptions={SOURCE_OPTIONS}
      />
    </>
  );
}
