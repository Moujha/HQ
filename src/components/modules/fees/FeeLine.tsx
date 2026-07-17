import { format } from "date-fns";
import { fr } from "date-fns/locale";

export interface FeeLineData {
  id: string;
  net_base: number;
  commission_rate: number;
  commission_due: number;
  is_commissionable: boolean;
  status: "projetée" | "due" | "versée" | "annulée";
  already_paid_to_manager: number;
  payment: {
    notes: string | null;
    source: string;
    amount: number;
    payment_date: string | null;
    deductible_expenses: number;
  } | null;
}

const STATUS_CLASS: Record<string, string> = {
  projetée: "text-muted-foreground bg-muted",
  due: "text-amber-400 bg-amber-400/10",
  versée: "text-green-400 bg-green-400/10",
  annulée: "text-muted-foreground bg-muted line-through",
};

const STATUS_LABEL: Record<string, string> = {
  projetée: "Projetée",
  due: "Due",
  versée: "Versée",
  annulée: "Annulée",
};

export function FeeLine({ fee }: { fee: FeeLineData }) {
  const isProjected = fee.status === "projetée";

  return (
    <div
      className={`rounded-xl border border-border bg-card px-4 py-3 ${
        isProjected ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {fee.payment?.notes ?? fee.payment?.source ?? "—"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {fee.payment?.payment_date
              ? format(new Date(fee.payment.payment_date), "d MMM yyyy", { locale: fr })
              : "Sans date"}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span>
              Brut{" "}
              {fee.payment?.amount.toLocaleString("fr-FR", {
                style: "currency",
                currency: "EUR",
              })}
            </span>
            {(fee.payment?.deductible_expenses ?? 0) > 0 && (
              <span>
                − frais{" "}
                {fee.payment!.deductible_expenses.toLocaleString("fr-FR", {
                  style: "currency",
                  currency: "EUR",
                })}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {fee.is_commissionable ? (
            <span className="text-sm font-semibold text-foreground">
              {fee.commission_due.toLocaleString("fr-FR", {
                style: "currency",
                currency: "EUR",
              })}
            </span>
          ) : (
            <span className="text-sm font-medium text-muted-foreground line-through">
              {(fee.net_base * fee.commission_rate).toLocaleString("fr-FR", {
                style: "currency",
                currency: "EUR",
              })}
            </span>
          )}
          <span
            className={`rounded-full px-2 py-0.5 text-[0.6rem] font-medium ${
              STATUS_CLASS[fee.status] ?? ""
            }`}
          >
            {!fee.is_commissionable ? "Non commissionnable" : STATUS_LABEL[fee.status]}
          </span>
        </div>
      </div>
    </div>
  );
}
