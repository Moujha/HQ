import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { AlertTriangle, Plus, Search, SlidersHorizontal, ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { countValidCachets, expiringWithin, STATUS_LABEL, writePaymentStatus } from "@/lib/cachets";
import { applyCachetFilters, sortCachetsByDate, countActiveFilters, EMPTY_FILTERS, type CachetFilters } from "@/lib/cachetFilters";
import { AppHeader } from "@/components/app/AppHeader";
import { CachetRow, type PaymentRow } from "@/components/modules/cachets/CachetRow";
import { CachetFilterSheet } from "@/components/modules/cachets/CachetFilterSheet";
import { EditPaymentDrawer } from "@/components/modules/cachets/EditPaymentDrawer";
import { IntermittenceGraph } from "@/components/modules/cachets/IntermittenceGraph";
import { AddRevenueSheet } from "@/components/modules/finance/AddRevenueSheet";

export const Route = createFileRoute("/_authenticated/finance/cachets")({
  component: CachetsPage,
});

type FullPaymentRow = PaymentRow & {
  batch_id: string | null;
  batch: { batch_count: number } | null;
};

function CachetsPage() {
  const { profile } = useAuth();
  const isManager = profile?.role === "manager";
  const [filters, setFilters] = useState<CachetFilters>(EMPTY_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [sortAsc, setSortAsc] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editPayment, setEditPayment] = useState<FullPaymentRow | null>(null);

  const { data: allPayments, refresh } = useCollection<FullPaymentRow>("payments", {
    select: "*, batch:payment_batches(batch_count)",
    order: { column: "payment_date", ascending: false },
  });

  const cachets = useMemo(
    () => allPayments.filter((p) => p.source !== "sacem"),
    [allPayments]
  );

  const searched = useMemo(() => applyCachetFilters(cachets, filters), [cachets, filters]);
  const filtered = useMemo(() => sortCachetsByDate(searched, sortAsc), [searched, sortAsc]);

  const validCount = countValidCachets(cachets);
  const expiringSoon = expiringWithin(cachets, 60);
  const activeFilterCount = countActiveFilters(filters);

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

  return (
    <>
      <AppHeader title="Cachets" backTo="/finance" />

      <div className="px-4 pt-4 pb-6 space-y-4">
        <IntermittenceGraph count={validCount} payments={cachets} />

        {expiringSoon.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2">
            <AlertTriangle
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400"
              aria-hidden="true"
            />
            <p className="text-xs text-amber-400">
              {expiringSoon.length === 1
                ? "1 cachet expire dans les 60 prochains jours"
                : `${expiringSoon.length} cachets expirent dans les 60 prochains jours`}
            </p>
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Rechercher un intitulé…"
              className="w-full rounded-full border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
            />
          </div>
          <button
            type="button"
            onClick={() => setFilterSheetOpen(true)}
            className="relative shrink-0 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-medium text-foreground"
          >
            <span className="flex items-center gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              Filtres
            </span>
            {activeFilterCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-[0.6rem] font-semibold text-background">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setSortAsc((v) => !v)}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-medium text-foreground"
          >
            {sortAsc ? (
              <ArrowUpNarrowWide className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ArrowDownWideNarrow className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Date
          </button>
        </div>

        <div className="space-y-2">
          {filtered.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Aucun cachet{activeFilterCount > 0 || filters.search ? " pour ces filtres" : ""}.
            </p>
          )}
          {filtered.map((p) => (
            <CachetRow
              key={p.id}
              payment={p}
              onClick={() => setEditPayment(p)}
              swipeEnabled={isManager}
              onSwipeStatusChange={(next) => handleSwipeStatusChange(p, next)}
            />
          ))}
        </div>
      </div>

      {isManager && (
        <button
          onClick={() => setAddOpen(true)}
          aria-label="Ajouter un cachet"
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-background shadow-lg transition active:scale-95"
        >
          <Plus className="h-6 w-6" aria-hidden="true" />
        </button>
      )}

      <AddRevenueSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={refresh}
      />

      <EditPaymentDrawer
        open={editPayment !== null}
        onOpenChange={(v) => {
          if (!v) setEditPayment(null);
        }}
        payment={editPayment}
        onSuccess={refresh}
      />

      <CachetFilterSheet
        open={filterSheetOpen}
        onOpenChange={setFilterSheetOpen}
        filters={filters}
        onChange={setFilters}
      />
    </>
  );
}
