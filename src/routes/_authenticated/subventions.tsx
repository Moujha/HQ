import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { useCollection } from "@/hooks/use-collection";
import { AppHeader } from "@/components/app/AppHeader";
import { GrantCard, type GrantCardData } from "@/components/modules/subventions/GrantCard";
import { AddGrantDrawer } from "@/components/modules/subventions/AddGrantDrawer";

export const Route = createFileRoute("/_authenticated/subventions")({
  component: SubventionsPage,
});

const STATUS_GROUPS = [
  { key: "actif", label: "En cours", statuses: ["à_instruire", "dossier_en_cours", "en_attente"] },
  { key: "déposé", label: "Déposé", statuses: ["déposé"] },
  { key: "terminé", label: "Terminé", statuses: ["obtenu", "refusé", "inéligible"] },
] as const;

function SubventionsPage() {
  const [addOpen, setAddOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState<"actif" | "déposé" | "terminé">("actif");

  const { data: grants, refresh } = useCollection<GrantCardData>("grants", {
    order: { column: "created_at", ascending: false },
  });

  const currentGroup = STATUS_GROUPS.find((g) => g.key === activeGroup)!;
  const visible = useMemo(
    () => grants.filter((g) => (currentGroup.statuses as readonly string[]).includes(g.status)),
    [grants, currentGroup]
  );

  const totalObtenu = grants
    .filter((g) => g.status === "obtenu")
    .reduce((sum, g) => sum + (g.montant_max ?? 0), 0);

  return (
    <>
      <AppHeader title="Subventions" backTo="/" />

      <div className="px-4 pt-4 pb-24 space-y-4">
        {/* Summary */}
        <div className="rounded-2xl border border-border bg-card px-5 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Obtenu</p>
            <p className="mt-0.5 font-display text-2xl font-bold text-green-400">
              {totalObtenu.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground space-y-0.5">
            <p>{grants.filter((g) => ["à_instruire", "dossier_en_cours"].includes(g.status)).length} en instruction</p>
            <p>{grants.filter((g) => g.status === "déposé").length} déposé{grants.filter((g) => g.status === "déposé").length !== 1 ? "s" : ""}</p>
          </div>
        </div>

        {/* Group tabs */}
        <div className="flex gap-2">
          {STATUS_GROUPS.map((g) => {
            const count = grants.filter((gr) => (g.statuses as readonly string[]).includes(gr.status)).length;
            return (
              <button
                key={g.key}
                onClick={() => setActiveGroup(g.key)}
                className={`flex-1 rounded-full border py-1.5 text-xs font-medium transition ${
                  activeGroup === g.key
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                {g.label} {count > 0 && <span className="opacity-60">({count})</span>}
              </button>
            );
          })}
        </div>

        {/* Grant cards */}
        <div className="space-y-2">
          {visible.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Aucune subvention dans cette catégorie.
            </p>
          )}
          {visible.map((g) => (
            <GrantCard key={g.id} grant={g} />
          ))}
        </div>
      </div>

      <button
        onClick={() => setAddOpen(true)}
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-50 grid h-14 w-14 place-items-center rounded-full bg-foreground text-background shadow-lg transition active:scale-95"
        aria-label="Nouvelle subvention"
      >
        <Plus className="h-6 w-6" />
      </button>

      <AddGrantDrawer open={addOpen} onOpenChange={setAddOpen} onSuccess={refresh} />
    </>
  );
}
