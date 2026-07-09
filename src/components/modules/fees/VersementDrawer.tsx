import { useState } from "react";
import { toast } from "sonner";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  totalDue: number;
  onSuccess?: () => void;
}

export function VersementDrawer({ open, onOpenChange, totalDue, onSuccess }: Props) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = parseFloat(amount);
    if (!v || v <= 0) return toast.error("Montant invalide");
    setBusy(true);
    try {
      // Fetch all "due" fees ordered oldest first and distribute the payment
      const { data: dueFees, error } = await supabase
        .from("management_fees")
        .select("id, commission_due, already_paid_to_manager")
        .eq("status", "due")
        .order("created_at", { ascending: true });

      if (error) throw error;

      let remaining = v;
      for (const fee of dueFees ?? []) {
        if (remaining <= 0) break;
        const owed = fee.commission_due - fee.already_paid_to_manager;
        const paying = Math.min(owed, remaining);
        const newPaid = fee.already_paid_to_manager + paying;
        const newStatus = newPaid >= fee.commission_due ? "versée" : "due";

        const { error: updateErr } = await supabase
          .from("management_fees")
          .update({
            already_paid_to_manager: newPaid,
            status: newStatus,
          })
          .eq("id", fee.id);

        if (updateErr) throw updateErr;
        remaining -= paying;
      }

      toast.success("Versement enregistré");
      setAmount("");
      setNote("");
      onOpenChange(false);
      onSuccess?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur lors du versement");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="font-display text-xl">Enregistrer un versement</DrawerTitle>
        </DrawerHeader>
        <form onSubmit={submit} className="px-4 pb-8 space-y-5">
          <div className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Reste dû actuellement</p>
            <p className="mt-1 font-display text-2xl font-bold text-foreground">
              {totalDue.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="versement-amount">Montant versé (€)</Label>
            <Input
              id="versement-amount"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="versement-date">Date</Label>
            <Input
              id="versement-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="versement-note">Note <span className="text-muted-foreground font-normal">— optionnel</span></Label>
            <Input
              id="versement-note"
              placeholder="ex: virement 15/07"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <Button type="submit" className="w-full rounded-full" size="lg" disabled={busy}>
            {busy ? "Enregistrement…" : "Confirmer le versement"}
          </Button>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
