import { format, isPast, isToday } from "date-fns";
import { fr } from "date-fns/locale";
import { MapPin } from "lucide-react";

export interface EventLineData {
  id: string;
  title: string;
  event_date: string;
  location: string | null;
  type: "concert" | "répétition" | "résidence" | "autre" | null;
  status: "confirmé" | "TBC" | "annulé";
}

const STATUS_CLASS: Record<string, string> = {
  confirmé: "text-green-400 bg-green-400/10",
  TBC: "text-amber-400 bg-amber-400/10",
  annulé: "text-muted-foreground bg-muted line-through",
};

const TYPE_EMOJI: Record<string, string> = {
  concert: "🎤",
  répétition: "🎸",
  résidence: "🏠",
  autre: "📅",
};

export function EventLine({ event }: { event: EventLineData }) {
  const date = new Date(event.event_date);
  const past = isPast(date) && !isToday(date);
  const today = isToday(date);

  return (
    <div
      className={`rounded-xl border border-border bg-card px-4 py-3 ${
        past && event.status !== "annulé" ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {event.type && (
              <span className="text-base" aria-hidden="true">
                {TYPE_EMOJI[event.type]}
              </span>
            )}
            <p className={`truncate text-sm font-medium ${event.status === "annulé" ? "line-through text-muted-foreground" : "text-foreground"}`}>
              {event.title}
            </p>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className={today ? "font-semibold text-foreground" : ""}>
              {today ? "Aujourd'hui" : format(date, "EEEE d MMM yyyy", { locale: fr })}
            </span>
            {event.location && (
              <span className="flex items-center gap-0.5">
                <MapPin className="h-3 w-3" aria-hidden="true" />
                {event.location}
              </span>
            )}
          </div>
        </div>

        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-medium ${
            STATUS_CLASS[event.status] ?? ""
          }`}
        >
          {event.status}
        </span>
      </div>
    </div>
  );
}
