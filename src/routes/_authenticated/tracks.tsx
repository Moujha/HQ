import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Plus, FileDown } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { AppHeader } from "@/components/app/AppHeader";
import { TrackLine, type TrackLineData } from "@/components/modules/tracks/TrackLine";
import { AddTrackDrawer } from "@/components/modules/tracks/AddTrackDrawer";
import { SacemImportDrawer } from "@/components/modules/tracks/SacemImportDrawer";

export const Route = createFileRoute("/_authenticated/tracks")({
  component: TracksPage,
});

type SacemFilter = "tous" | "non_déclaré" | "déclaré";

function TracksPage() {
  const { profile } = useAuth();
  const [filter, setFilter] = useState<SacemFilter>("tous");
  const [addOpen, setAddOpen] = useState(false);
  const [sacemOpen, setSacemOpen] = useState(false);

  const { data: tracks, refresh } = useCollection<TrackLineData>("tracks", {
    order: { column: "created_at", ascending: false },
  });

  const visible = useMemo(() => {
    if (filter === "tous") return tracks;
    if (filter === "non_déclaré") return tracks.filter((t) => t.sacem_status === "non_déclaré");
    return tracks.filter((t) => t.sacem_status === "déclaré");
  }, [tracks, filter]);

  return (
    <>
      <AppHeader title="Tracks" />

      <div className="px-4 pt-4 pb-24 space-y-4">
        <div className="rounded-2xl border border-border bg-card px-5 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Catalogue</p>
            <p className="mt-0.5 font-display text-2xl font-bold text-foreground">{tracks.length} titres</p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>{tracks.filter((t) => t.sacem_status === "déclaré").length} déclarés SACEM</p>
            <p>{tracks.filter((t) => t.is_commissionable).length} commissionnables</p>
          </div>
        </div>

        <div className="flex gap-2">
          {(["tous", "non_déclaré", "déclaré"] as SacemFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                filter === f
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              {f === "tous" ? "Tous" : f === "non_déclaré" ? "Non déclarés" : "Déclarés"}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {visible.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Aucun track dans le catalogue.
            </p>
          )}
          {visible.map((t) => (
            <TrackLine key={t.id} track={t} />
          ))}
        </div>
      </div>

      {profile?.role === "manager" && (
        <div className="fixed bottom-[max(env(safe-area-inset-bottom),1rem)] right-4 z-40 flex flex-col items-end gap-3">
          <button
            onClick={() => setSacemOpen(true)}
            className="grid h-12 w-12 place-items-center rounded-full bg-card border border-border text-foreground shadow-md transition active:scale-95"
            aria-label="Importer SACEM"
          >
            <FileDown className="h-5 w-5" />
          </button>
          <button
            onClick={() => setAddOpen(true)}
            className="grid h-14 w-14 place-items-center rounded-full bg-foreground text-background shadow-lg transition active:scale-95"
            aria-label="Nouveau track"
          >
            <Plus className="h-6 w-6" />
          </button>
        </div>
      )}

      <AddTrackDrawer open={addOpen} onOpenChange={setAddOpen} onSuccess={refresh} />
      <SacemImportDrawer open={sacemOpen} onOpenChange={setSacemOpen} onSuccess={refresh} />
    </>
  );
}
