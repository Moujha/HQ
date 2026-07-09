import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Music2 } from "lucide-react";

export interface TrackLineData {
  id: string;
  title: string;
  release_date: string | null;
  is_commissionable: boolean;
  sacem_status: "non_déclaré" | "programme_en_draft" | "déclaré" | "étranger" | "non_applicable";
  sacem_declared_at: string | null;
  notes: string | null;
}

const SACEM_LABEL: Record<string, string> = {
  non_déclaré: "Non déclaré",
  programme_en_draft: "Draft",
  déclaré: "Déclaré",
  étranger: "Étranger",
  non_applicable: "N/A",
};

const SACEM_CLASS: Record<string, string> = {
  non_déclaré: "text-muted-foreground bg-muted",
  programme_en_draft: "text-amber-400 bg-amber-400/10",
  déclaré: "text-green-400 bg-green-400/10",
  étranger: "text-blue-400 bg-blue-400/10",
  non_applicable: "text-muted-foreground bg-muted",
};

export function TrackLine({ track }: { track: TrackLineData }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Music2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="truncate text-sm font-medium text-foreground">{track.title}</p>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            {track.release_date && (
              <span>
                {format(new Date(track.release_date), "d MMM yyyy", { locale: fr })}
              </span>
            )}
            {!track.is_commissionable && (
              <span className="text-amber-400">· hors commission</span>
            )}
            {track.notes && (
              <span className="truncate max-w-[12rem]">· {track.notes}</span>
            )}
          </div>
        </div>

        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-medium ${
            SACEM_CLASS[track.sacem_status] ?? ""
          }`}
        >
          {SACEM_LABEL[track.sacem_status]}
        </span>
      </div>
    </div>
  );
}
