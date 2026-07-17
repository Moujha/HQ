import { useState } from "react";
import { toast } from "sonner";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

type ExpenseStatus = "à_rembourser" | "remboursée";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: () => void;
}

export function AddExpenseDrawer({ open, onOpenChange, onSuccess }: Props) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ExpenseStatus>("à_rembourser");
  const [busy, setBusy] = useState(false);

  function reset() {
    setAmount("");
    setDescription("");
    setStatus("à_rembourser");
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = parseFloat(amount);
    if (!v || v <= 0) return toast.error("Montant invalide");
    if (!description.trim()) return toast.error("Description requise");

    setBusy(true);
    try {
      const { error } = await supabase.from("expenses").insert({
        amount: v,
        description: description.trim(),
        status,
        payment_id: null,
      });
      if (error) throw error;

      toast.success("Dépense ajoutée");
      reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de l'ajout");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="font-display text-xl">Ajouter une dépense</DrawerTitle>
        </DrawerHeader>
        <form onSubmit={submit} className="px-4 pb-8 space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="expense-amount">Montant (€)</Label>
            <Input
              id="expense-amount"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expense-description">Description</Label>
            <Input
              id="expense-description"
              placeholder="ex: Paiement musicien"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label>Statut</Label>
            <div className="flex gap-2">
              {(
                [
                  { value: "à_rembourser", label: "À rembourser" },
                  { value: "remboursée", label: "Remboursée" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStatus(opt.value)}
                  className={`flex-1 rounded-full border py-2 text-xs font-medium transition ${
                    status === opt.value
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <Button type="submit" className="w-full rounded-full" size="lg" disabled={busy}>
            {busy ? "Ajout…" : "Ajouter"}
          </Button>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
