import { motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { format, differenceInDays } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertTriangle } from "lucide-react";
import { BatchBadge } from "./BatchBadge";
import { HOURS_PER_CACHET } from "@/lib/cachets";

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

export const STATUS_LABEL: Record<string, string> = {
  provisoire: "TBC",
  facturé: "Facturé",
  cachet_en_attente: "Confirmé",
  payé: "Payé",
  tbc: "TBC",
  annulé: "Annulé",
};

const STATUS_CLASS: Record<string, string> = {
  provisoire: "text-muted-foreground bg-muted",
  facturé: "text-blue-400 bg-blue-400/10",
  cachet_en_attente: "text-amber-400 bg-amber-400/10",
  payé: "text-green-400 bg-green-400/10",
  tbc: "text-muted-foreground bg-muted",
  annulé: "text-red-400 bg-red-400/10",
};

const STATUS_ORDER = ["annulé", "provisoire", "cachet_en_attente", "facturé", "payé"] as const;

function orderIndex(status: PaymentRow["status"]): number {
  const normalized = status === "tbc" ? "provisoire" : status;
  return STATUS_ORDER.indexOf(normalized as (typeof STATUS_ORDER)[number]);
}

export function nextStatus(status: PaymentRow["status"]): PaymentRow["status"] | null {
  const i = orderIndex(status);
  if (i === -1 || i >= STATUS_ORDER.length - 1) return null;
  return STATUS_ORDER[i + 1];
}

export function previousStatus(status: PaymentRow["status"]): PaymentRow["status"] | null {
  const i = orderIndex(status);
  if (i <= 0) return null;
  return STATUS_ORDER[i - 1];
}

const COMMIT_DISTANCE = 96;
const COMMIT_VELOCITY = 500;

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
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-8, 8]);
  const rightLabelOpacity = useTransform(x, [0, COMMIT_DISTANCE], [0, 1]);
  const leftLabelOpacity = useTransform(x, [-COMMIT_DISTANCE, 0], [1, 0]);

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

  const handleDragEnd = (_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    const { offset, velocity } = info;
    const commitRight = offset.x > COMMIT_DISTANCE || velocity.x > COMMIT_VELOCITY;
    const commitLeft = offset.x < -COMMIT_DISTANCE || velocity.x < -COMMIT_VELOCITY;

    if (commitRight && next) {
      onSwipeStatusChange?.(next);
    } else if (commitLeft && prev) {
      onSwipeStatusChange?.(prev);
    }
  };

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

  if (!swipeEnabled) {
    return (
      <button
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition active:scale-[0.98]"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="relative">
      {next && (
        <motion.div
          style={{ opacity: rightLabelOpacity }}
          className="absolute inset-0 flex items-center justify-start rounded-xl bg-green-500/20 px-4"
          aria-hidden="true"
        >
          <span className="text-xs font-semibold text-green-400">→ {STATUS_LABEL[next]}</span>
        </motion.div>
      )}
      {prev && (
        <motion.div
          style={{ opacity: leftLabelOpacity }}
          className="absolute inset-0 flex items-center justify-end rounded-xl bg-red-500/20 px-4"
          aria-hidden="true"
        >
          <span className="text-xs font-semibold text-red-400">{STATUS_LABEL[prev]} ←</span>
        </motion.div>
      )}
      <motion.div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") onClick?.();
        }}
        drag="x"
        dragSnapToOrigin
        style={{ x, rotate }}
        onDragEnd={handleDragEnd}
        onTap={onClick}
        className="relative flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left"
      >
        {content}
      </motion.div>
    </div>
  );
}
