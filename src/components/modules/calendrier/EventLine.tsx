import { format, isPast, isToday } from "date-fns";
import { fr } from "date-fns/locale";
import { MapPin } from "lucide-react";

export interface EventPayment {
  id: string;
  status: "provisoire" | "facturé" | "cachet_en_attente" | "payé" | "tbc";
  amount: number;
}

export interface EventLineData {
  id: string;
  title: string;
  event_date: string;
  location: string | null;
  type: "concert" | "répétition" | "résidence" | "autre" | null;
  status: "confirmé" | "TBC" | "annulé";
  payments: EventPayment[] | null;
}

// Rank from least to most advanced
const PAYMENT_RANK: Record<string, number> = {
  tbc: -1,
  provisoire: 0,
  cachet_en_attente: 1,
  facturé: 2,
  payé: 3,
};

function deriveDisplayStatus(
  eventStatus: "confirmé" | "TBC" | "annulé",
  payments: EventPayment[] | null,
): string {
  if (eventStatus === "annulé") return "annulé";
  if (!payments || payments.length === 0) return eventStatus;
  return payments.reduce((acc, p) => {
    return (PAYMENT_RANK[p.status] ?? 0) < (PAYMENT_RANK[acc] ?? 0) ? p.status : acc;
  }, payments[0].status);
}

const STATUS_CLASS: Record<string, string> = {
  confirmé: "text-green-400 bg-green-400/10",
  TBC: "text-amber-400 bg-amber-400/10",
  annulé: "text-muted-foreground bg-muted",
  tbc: "text-muted-foreground bg-muted",
  provisoire: "text-amber-400 bg-amber-400/10",
  cachet_en_attente: "text-blue-400 bg-blue-400/10",
  facturé: "text-blue-400 bg-blue-400/10",
  payé: "text-green-400 bg-green-400/10",
};

const STATUS_LABEL: Record<string, string> = {
  confirmé: "Confirmé",
  TBC: "TBC",
  annulé: "Annulé",
  tbc: "TBC",
  provisoire: "TBC",
  cachet_en_attente: "En attente",
  facturé: "Facturé",
  payé: "Payé",
};

const TYPE_EMOJI: Record<string, string> = {
  concert: "🎤",
  répétition: "🎸",
  résidence: "🏠",
  autre: "📅",
};

export function EventLine({
  event,
  onClick,
}: {
  event: EventLineData;
  onClick?: () => void;
}) {
  const date = new Date(event.event_date);
  const past = isPast(date) && !isToday(date);
  const today = isToday(date);

  const displayStatus = deriveDisplayStatus(event.status, event.payments ?? null);
  const totalAmount =
    event.payments && event.payments.length > 0
      ? event.payments.reduce((s, p) => s + p.amount, 0)
      : null;

  return (
    <button
      onClick={onClick}
      className={`w-full rounded-xl border border-border bg-card px-4 py-3 text-left transition active:scale-[0.98] ${
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
            <p
              className={`truncate text-sm font-medium ${
                event.status === "annulé"
                  ? "line-through text-muted-foreground"
                  : "text-foreground"
              }`}
            >
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

        <div className="flex shrink-0 flex-col items-end gap-1">
          {totalAmount !== null && (
            <span className="text-xs font-semibold text-foreground">
              {totalAmount.toLocaleString("fr-FR", {
                style: "currency",
                currency: "EUR",
              })}
            </span>
          )}
          <span
            className={`rounded-full px-2 py-0.5 text-[0.6rem] font-medium ${
              STATUS_CLASS[displayStatus] ?? ""
            }`}
          >
            {STATUS_LABEL[displayStatus] ?? displayStatus}
          </span>
        </div>
      </div>
    </button>
  );
}
