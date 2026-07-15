import { format, differenceInDays } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertTriangle } from "lucide-react";
import { BatchBadge } from "./BatchBadge";
import { SwipeableRow } from "@/components/app/SwipeableRow";
import { HOURS_PER_CACHET, STATUS_LABEL, nextStatus, previousStatus } from "@/lib/cachets";

export interface PaymentRow {
  id: string;
  notes: string | null;
  source: string;
  amount: number;
  payment_date: string | null;
  expires_at: string | null;
  status: "provisoire" | "facturé" | "cachet_en_attente" | "payé" | "tbc" | "annulé";
  territory: "france" | "étranger";
  counts_for_intermittence: boolean;
  deductible_expenses: number;
  hours: number;
  batch_id: string | null;
  batch: { batch_count: number } | null;
}

const STATUS_CLASS: Record<string, string> = {
  provisoire: "text-muted-foreground bg-muted",
  facturé: "text-blue-400 bg-blue-400/10",
  cachet_en_attente: "text-amber-400 bg-amber-400/10",
  payé: "text-green-400 bg-green-400/10",
  tbc: "text-muted-foreground bg-muted",
  annulé: "text-red-400 bg-red-400/10",
};

export function CachetRow({
  payment,
  onClick,
  swipeEnabled = false,
  onSwipeStatusChange,
}: {
  payment: PaymentRow;
  onClick?: () => void;
  swipeEnabled?: boolean;
  onSwipeStatusChange?: (next: PaymentRow["status"]) => void;
}) {
  const expiresAt = payment.expires_at ? new Date(payment.expires_at) : null;
  const daysLeft = expiresAt ? differenceInDays(expiresAt, new Date()) : null;
  const expiringSoon = daysLeft != null && daysLeft >= 0 && daysLeft <= 60;
  const expired = daysLeft != null && daysLeft < 0;

  // Batch rows each represent 1 cachet (batch_count is for the global counter, not per-row display).
  // Non-batch: derive from hours (form stores N cachets as N × 12h).
  const cachetCount = payment.batch_id != null
    ? 1
    : Math.max(1, Math.round(payment.hours / HOURS_PER_CACHET));

  const next = nextStatus(payment.status);
  const prev = previousStatus(payment.status);

  const content = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {payment.notes ?? payment.source}
          </span>
          {payment.batch && <BatchBadge count={payment.batch.batch_count} />}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-xs text-muted-foreground">
            {payment.payment_date
              ? format(new Date(payment.payment_date), "d MMM yyyy", { locale: fr })
              : "Sans date"}
          </span>
          {payment.counts_for_intermittence && (
            <span className="text-xs text-muted-foreground">· {payment.hours * cachetCount} h</span>
          )}
          {payment.territory === "étranger" && (
            <span className="text-xs text-muted-foreground">· 🌍 Étranger</span>
          )}
          {!payment.counts_for_intermittence && (
            <span className="flex items-center gap-0.5 text-xs text-amber-400">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              hors intermittence
            </span>
          )}
          {expiringSoon && (payment.status === "payé" || payment.status === "cachet_en_attente") && (
            <span className="text-xs text-amber-400">
              · expire dans {daysLeft}j
            </span>
          )}
          {expired && payment.status === "payé" && (
            <span className="text-xs text-muted-foreground line-through">
              · expiré
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-sm font-semibold text-foreground">
          {cachetCount} cachet{cachetCount > 1 ? "s" : ""}
        </span>
        <span className="text-xs text-muted-foreground">
          {payment.amount.toLocaleString("fr-FR", {
            style: "currency",
            currency: "EUR",
          })}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[0.6rem] font-medium ${
            STATUS_CLASS[payment.status] ?? ""
          }`}
        >
          {STATUS_LABEL[payment.status] ?? payment.status}
        </span>
      </div>
    </>
  );

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
