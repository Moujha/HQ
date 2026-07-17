import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCollection } from "@/hooks/use-collection";
import { AppHeader } from "@/components/app/AppHeader";
import { TaskLine, type TaskLineData } from "@/components/modules/taches/TaskLine";
import { AddTaskDrawer } from "@/components/modules/taches/AddTaskDrawer";

export const Route = createFileRoute("/_authenticated/taches")({
  component: TachesPage,
});

type FilterKey = "à_faire" | "en_cours" | "fait" | "tous";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "à_faire", label: "À faire" },
  { key: "en_cours", label: "En cours" },
  { key: "tous", label: "Tous" },
  { key: "fait", label: "Fait" },
];

function TachesPage() {
  const { profile } = useAuth();
  const [filter, setFilter] = useState<FilterKey>("à_faire");
  const [addOpen, setAddOpen] = useState(false);

  const { data: tasks, refresh } = useCollection<TaskLineData>("tasks", {
    order: { column: "created_at", ascending: false },
  });

  const visible = useMemo(() => {
    let list = tasks;
    // Artist only sees their tasks
    if (profile?.role === "artist") {
      list = list.filter((t) => t.assignee_role === "artist" || t.assignee_role === "both");
    }
    if (filter !== "tous") {
      list = list.filter((t) => t.status === filter);
    }
    return list;
  }, [tasks, filter, profile]);

  const todoCount = tasks.filter(
    (t) =>
      t.status !== "fait" &&
      (profile?.role !== "artist" || t.assignee_role !== "manager")
  ).length;

  return (
    <>
      <AppHeader title="Tâches" backTo="/" />

      <div className="px-4 pt-4 pb-24 space-y-4">
        {/* Summary chip */}
        {todoCount > 0 && (
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{todoCount}</span>{" "}
            tâche{todoCount !== 1 ? "s" : ""} en attente
          </p>
        )}

        {/* Filter pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                filter === f.key
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Task list */}
        <div className="space-y-2">
          {visible.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {filter === "fait" ? "Aucune tâche terminée." : "Aucune tâche en cours."}
            </p>
          )}
          {visible.map((t) => (
            <TaskLine key={t.id} task={t} onSuccess={refresh} />
          ))}
        </div>
      </div>

      {/* FAB — manager only */}
      {profile?.role === "manager" && (
        <button
          onClick={() => setAddOpen(true)}
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-50 grid h-14 w-14 place-items-center rounded-full bg-foreground text-background shadow-lg transition active:scale-95"
          aria-label="Nouvelle tâche"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      <AddTaskDrawer open={addOpen} onOpenChange={setAddOpen} onSuccess={refresh} />
    </>
  );
}
