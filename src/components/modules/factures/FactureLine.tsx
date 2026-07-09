import { useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Check, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export interface FactureLineData {
  id: string;
  notes: string | null;
  source: string;
  amount: number;
  payment_date: string | null;
  status: "provisoire" | "facturé" | "cachet_en_attente" | "payé";
}

const SOURCE_LABEL: Record<string, string> = {
  label: "Label",
  booking: "Booking",
  clip: "Clip",
  track: "Track SACEM",
  résidence: "Résidence",
  figuration: "Figuration",
};

const STATUS_CLASS: Record<string, string> = {
  facturé: "text-blue-400 bg-blue-400/10",
  cachet_en_attente: "text-amber-400 bg-amber-400/10",
  payé: "text-green-400 bg-green-400/10",
  provisoire: "text-muted-foreground bg-muted",
};

const STATUS_LABEL: Record<string, string> = {
  facturé: "Facturé",
  cachet_en_attente: "En attente",
  payé: "Payé",
  provisoire: "Provisoire",
};

interface Props {
  facture: FactureLineData;
  onSuccess?: () => void;
}

export function FactureLine({ facture, onSuccess }: Props) {
  const [busy, setBusy] = useState(false);

  const markPaid = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const { error } = await supabase
        .from("payments")
        .update({
          status: "payé",
          payment_date: facture.payment_date ?? today,
        })
        .eq("id", facture.id);
      if (error) throw error;
      toast.success("Marqué comme payé");
      onSuccess?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const isPending = facture.status === "facturé" || facture.status === "cachet_en_attente";

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {facture.notes ?? SOURCE_LABEL[facture.source] ?? facture.source}
          </p>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              {facture.payment_date
                ? format(new Date(facture.payment_date), "d MMM yyyy", { locale: fr })
                : "Sans date"}
            </span>
            <span>·</span>
            <span>{SOURCE_LABEL[facture.source] ?? facture.source}</span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="text-sm font-semibold text-foreground">
            {facture.amount.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[0.6rem] font-medium ${
              STATUS_CLASS[facture.status] ?? ""
            }`}
          >
            {STATUS_LABEL[facture.status] ?? facture.status}
          </span>
        </div>
      </div>

      {isPending && (
        <button
          onClick={markPaid}
          disabled={busy}
          className="flex w-full items-center justify-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/10 py-2 text-xs font-medium text-green-400 transition hover:bg-green-500/20 disabled:opacity-50"
        >
          {busy ? (
            <Clock className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Marquer comme payé
        </button>
      )}
    </div>
  );
}
