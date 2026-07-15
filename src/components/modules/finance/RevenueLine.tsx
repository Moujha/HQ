import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { SwipeableRow } from "@/components/app/SwipeableRow";
import { STATUS_LABEL, nextStatus, previousStatus } from "@/lib/cachets";

export interface RevenueLineData {
  id: string;
  notes: string | null;
  source: "label" | "booking" | "clip" | "track" | "résidence" | "figuration" | "sacem";
  amount: number;
  payment_date: string | null;
  status: "provisoire" | "facturé" | "cachet_en_attente" | "payé" | "tbc" | "annulé";
}

const SOURCE_LABEL: Record<string, string> = {
  booking: "Cachet",
  sacem: "SACEM",
  label: "Label",
  clip: "Clip",
  résidence: "Résidence",
  figuration: "Figuration",
  track: "Track",
};

const STATUS_CLASS: Record<string, string> = {
  provisoire: "text-amber-400 bg-amber-400/10",
  facturé: "text-blue-400 bg-blue-400/10",
  cachet_en_attente: "text-amber-400 bg-amber-400/10",
  payé: "text-green-400 bg-green-400/10",
  tbc: "text-amber-400 bg-amber-400/10",
  annulé: "text-red-400 bg-red-400/10",
};

export function RevenueLine({
  revenue,
  onClick,
  interactive = true,
  swipeEnabled = false,
  onSwipeStatusChange,
}: {
  revenue: RevenueLineData;
  onClick?: () => void;
  interactive?: boolean;
  swipeEnabled?: boolean;
  onSwipeStatusChange?: (next: RevenueLineData["status"]) => void;
}) {
  const content = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {revenue.notes ?? SOURCE_LABEL[revenue.source] ?? revenue.source}
        </p>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {revenue.payment_date
              ? format(new Date(revenue.payment_date), "d MMM yyyy", { locale: fr })
              : "Sans date"}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[0.6rem] font-medium text-muted-foreground">
            {SOURCE_LABEL[revenue.source] ?? revenue.source}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-sm font-semibold text-foreground">
          {revenue.amount.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[0.6rem] font-medium ${
            STATUS_CLASS[revenue.status] ?? ""
          }`}
        >
          {STATUS_LABEL[revenue.status] ?? revenue.status}
        </span>
      </div>
    </>
  );

  if (!interactive) {
    return (
      <div className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left">
        {content}
      </div>
    );
  }

  const next = nextStatus(revenue.status);
  const prev = previousStatus(revenue.status);

  return (
    <SwipeableRow
      swipeEnabled={swipeEnabled}
      onClick={onClick}
      nextLabel={next ? STATUS_LABEL[next] : null}
      prevLabel={prev ? STATUS_LABEL[prev] : null}
      onCommitRight={() => next && onSwipeStatusChange?.(next)}
      onCommitLeft={() => prev && onSwipeStatusChange?.(prev)}
    >
      {content}
    </SwipeableRow>
  );
}
