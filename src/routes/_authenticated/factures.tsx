import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useCallback } from "react";
import { useCollection } from "@/hooks/use-collection";
import { AppHeader } from "@/components/app/AppHeader";
import { FactureLine, type FactureLineData } from "@/components/modules/factures/FactureLine";

export const Route = createFileRoute("/_authenticated/factures")({
  component: FacturesPage,
});

const SELECT = "id, notes, source, amount, payment_date, status";

function FacturesPage() {
  const { data: factures, refresh: refreshFactures } = useCollection<FactureLineData>("payments", {
    select: SELECT,
    filter: { status: "facturé" },
    order: { column: "payment_date", ascending: false },
  });

  const { data: pending, refresh: refreshPending } = useCollection<FactureLineData>("payments", {
    select: SELECT,
    filter: { status: "cachet_en_attente" },
    order: { column: "created_at", ascending: false },
  });

  const refresh = useCallback(() => {
    refreshFactures();
    refreshPending();
  }, [refreshFactures, refreshPending]);

  const totalEncours = useMemo(
    () => factures.reduce((sum, p) => sum + p.amount, 0),
    [factures]
  );

  return (
    <>
      <AppHeader title="Factures" />

      <div className="px-4 pt-4 pb-6 space-y-4">
        {/* Hero */}
        <div className="rounded-2xl border border-border bg-card px-5 py-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            Total en cours
          </p>
          <p className="mt-1 font-display text-4xl font-bold text-foreground">
            {totalEncours.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {factures.length} facture{factures.length !== 1 ? "s" : ""} en attente de paiement
          </p>
        </div>

        {/* Facturés */}
        <div className="space-y-2">
          {factures.length === 0 && pending.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Aucune facture en cours.
            </p>
          )}
          {factures.map((f) => (
            <FactureLine key={f.id} facture={f} onSuccess={refresh} />
          ))}
        </div>

        {/* Cachets en attente de contrat */}
        {pending.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium px-1">
              En attente de contrat
            </p>
            {pending.map((f) => (
              <FactureLine key={f.id} facture={f} onSuccess={refresh} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
