import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { countValidCachets, expiringWithin } from "@/lib/cachets";
import { AppHeader } from "@/components/app/AppHeader";
import { CachetRow, type PaymentRow } from "@/components/modules/cachets/CachetRow";
import { AddPaymentDrawer } from "@/components/modules/cachets/AddPaymentDrawer";

export const Route = createFileRoute("/_authenticated/cachets")({
  component: CachetsPage,
});

type Filter = "tous" | "actifs" | "provisoires" | "expirés";

const FILTER_LABELS: Record<Filter, string> = {
  tous: "Tous",
  actifs: "Actifs",
  provisoires: "Provisoires",
  expirés: "Expirés",
};

function CachetsPage() {
  const { profile } = useAuth();
  const isManager = profile?.role === "manager";
  const [filter, setFilter] = useState<Filter>("tous");
  const [addOpen, setAddOpen] = useState(false);

  const { data: allPayments, refresh } = useCollection<PaymentRow & { batch: { batch_count: number } | null }>("payments", {
    select: "*, batch:payment_batches(batch_count)",
    order: { column: "payment_date", ascending: false },
  });

  const now = new Date();

  const filtered = useMemo(() => {
    switch (filter) {
      case "actifs":
        return allPayments.filter(
          (p) => p.status === "payé" && p.expires_at && new Date(p.expires_at) > now
        );
      case "provisoires":
        return allPayments.filter((p) => p.status === "provisoire" || p.status === "cachet_en_attente");
      case "expirés":
        return allPayments.filter(
          (p) => p.status === "payé" && p.expires_at && new Date(p.expires_at) <= now
        );
      default:
        return allPayments;
    }
  }, [allPayments, filter, now]);

  const validCount = countValidCachets(allPayments);
  const expiringSoon = expiringWithin(allPayments, 60);

  return (
    <>
      <AppHeader title="Cachets" />

      <div className="px-4 pt-4 pb-6 space-y-4">
        {/* Hero */}
        <div className="rounded-2xl border border-border bg-card px-5 py-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            Cachets valides
          </p>
          <p className="mt-1 font-display text-5xl font-bold text-foreground">
            {validCount}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            comptabilisés pour l'intermittence
          </p>

          {expiringSoon.length > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
              <p className="text-xs text-amber-400">
                {expiringSoon.length === 1
                  ? "1 cachet expire dans les 60 prochains jours"
                  : `${expiringSoon.length} cachets expirent dans les 60 prochains jours`}
              </p>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
          {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
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

        {/* List */}
        <div className="space-y-2">
          {filtered.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Aucun cachet{filter !== "tous" ? ` dans cette catégorie` : ""}.
            </p>
          )}
          {filtered.map((p) => (
            <CachetRow key={p.id} payment={p} />
          ))}
        </div>
      </div>

      {/* FAB — manager only */}
      {isManager && (
        <button
          onClick={() => setAddOpen(true)}
          aria-label="Ajouter un cachet"
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-background shadow-lg transition active:scale-95"
        >
          <Plus className="h-6 w-6" aria-hidden="true" />
        </button>
      )}

      {isManager && profile && (
        <AddPaymentDrawer
          open={addOpen}
          onOpenChange={setAddOpen}
          artistProfileId={profile.id}
          onSuccess={refresh}
        />
      )}
    </>
  );
}
