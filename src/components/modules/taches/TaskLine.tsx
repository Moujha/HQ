import { useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertCircle, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export interface TaskLineData {
  id: string;
  title: string;
  description: string | null;
  assignee_role: "manager" | "artist" | "both";
  priority: "normal" | "urgent";
  status: "à_faire" | "en_cours" | "fait";
  deadline: string | null;
}

const STATUS_NEXT: Record<string, "à_faire" | "en_cours" | "fait"> = {
  à_faire: "en_cours",
  en_cours: "fait",
  fait: "à_faire",
};

const STATUS_LABEL: Record<string, string> = {
  à_faire: "À faire",
  en_cours: "En cours",
  fait: "Fait",
};

const STATUS_CLASS: Record<string, string> = {
  à_faire: "border-border bg-card text-muted-foreground",
  en_cours: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  fait: "border-green-500/30 bg-green-500/10 text-green-400",
};

const ROLE_LABEL: Record<string, string> = {
  manager: "Manager",
  artist: "Artiste",
  both: "Tous",
};

interface Props {
  task: TaskLineData;
  onSuccess?: () => void;
}

export function TaskLine({ task, onSuccess }: Props) {
  const [busy, setBusy] = useState(false);

  const cycleStatus = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const next = STATUS_NEXT[task.status];
      const { error } = await supabase
        .from("tasks")
        .update({ status: next })
        .eq("id", task.id);
      if (error) throw error;
      onSuccess?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const isOverdue =
    task.deadline &&
    task.status !== "fait" &&
    new Date(task.deadline) < new Date();

  return (
    <div
      className={`rounded-xl border bg-card px-4 py-3 ${
        task.status === "fait" ? "opacity-60" : ""
      } ${isOverdue ? "border-red-500/30" : "border-border"}`}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox cycle */}
        <button
          onClick={cycleStatus}
          disabled={busy}
          className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border transition ${
            task.status === "fait"
              ? "border-green-500 bg-green-500 text-white"
              : task.status === "en_cours"
                ? "border-amber-400 bg-amber-400/10 text-amber-400"
                : "border-border bg-card text-transparent"
          }`}
          aria-label={`Passer à: ${STATUS_LABEL[STATUS_NEXT[task.status]]}`}
        >
          {task.status !== "à_faire" && <Check className="h-3 w-3" strokeWidth={3} />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p
              className={`text-sm font-medium ${
                task.status === "fait"
                  ? "text-muted-foreground line-through"
                  : "text-foreground"
              }`}
            >
              {task.title}
            </p>
            {task.priority === "urgent" && task.status !== "fait" && (
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            )}
          </div>

          {task.description && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
              {task.description}
            </p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            <span
              className={`rounded-full border px-2 py-0.5 text-[0.6rem] font-medium ${STATUS_CLASS[task.status]}`}
            >
              {STATUS_LABEL[task.status]}
            </span>
            <span className="text-muted-foreground">
              {ROLE_LABEL[task.assignee_role]}
            </span>
            {task.deadline && (
              <span className={isOverdue ? "text-red-400" : "text-muted-foreground"}>
                · {format(new Date(task.deadline), "d MMM", { locale: fr })}
                {isOverdue && " (en retard)"}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
