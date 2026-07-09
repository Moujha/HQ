import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { AppHeader } from "@/components/app/AppHeader";
import { EventLine, type EventLineData } from "@/components/modules/calendrier/EventLine";
import { AddEventDrawer } from "@/components/modules/calendrier/AddEventDrawer";

export const Route = createFileRoute("/_authenticated/calendrier")({
  component: CalendrierPage,
});

type FilterKey = "à_venir" | "passé" | "tous";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "à_venir", label: "À venir" },
  { key: "tous", label: "Tous" },
  { key: "passé", label: "Passé" },
];

function CalendrierPage() {
  const { profile } = useAuth();
  const [filter, setFilter] = useState<FilterKey>("à_venir");
  const [addOpen, setAddOpen] = useState(false);

  const { data: events, refresh } = useCollection<EventLineData>("events", {
    order: { column: "event_date", ascending: true },
  });

  const today = new Date().toISOString().split("T")[0];

  const visible = useMemo(() => {
    if (filter === "à_venir") return events.filter((e) => e.event_date >= today);
    if (filter === "passé") return events.filter((e) => e.event_date < today);
    return events;
  }, [events, filter, today]);

  const nextEvent = events.find((e) => e.event_date >= today && e.status !== "annulé");

  return (
    <>
      <AppHeader title="Calendrier" />

      <div className="px-4 pt-4 pb-24 space-y-4">
        {nextEvent && (
          <div className="rounded-2xl border border-border bg-card px-5 py-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Prochain événement
            </p>
            <p className="mt-1 font-display text-xl font-bold text-foreground">
              {nextEvent.title}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {new Date(nextEvent.event_date).toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              {nextEvent.location && ` · ${nextEvent.location}`}
            </p>
          </div>
        )}

        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                filter === f.key
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {visible.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Aucun événement.
            </p>
          )}
          {visible.map((e) => (
            <EventLine key={e.id} event={e} />
          ))}
        </div>
      </div>

      {profile?.role === "manager" && (
        <button
          onClick={() => setAddOpen(true)}
          className="fixed bottom-[max(env(safe-area-inset-bottom),1rem)] right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-foreground text-background shadow-lg transition active:scale-95"
          aria-label="Nouvel événement"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      <AddEventDrawer open={addOpen} onOpenChange={setAddOpen} onSuccess={refresh} />
    </>
  );
}
