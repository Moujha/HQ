import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Minus, Plus } from "lucide-react";

const schema = z.object({
  notes: z.string().min(1, "Requis"),
  amount: z.coerce.number().positive("Montant invalide"),
  payment_date: z.string().optional(),
  source: z.enum(["label", "booking", "clip", "track", "résidence", "figuration"]),
  territory: z.enum(["france", "étranger"]),
  status: z.enum(["provisoire", "facturé", "cachet_en_attente", "payé"]),
  counts_for_intermittence: z.boolean(),
  deductible_expenses: z.coerce.number().min(0).default(0),
});

type FormValues = z.infer<typeof schema>;

const SOURCE_OPTIONS = [
  { value: "booking", label: "Booking" },
  { value: "label", label: "Label" },
  { value: "clip", label: "Clip" },
  { value: "track", label: "Track SACEM" },
  { value: "résidence", label: "Résidence" },
  { value: "figuration", label: "Figuration" },
] as const;

const STATUS_OPTIONS = [
  { value: "provisoire", label: "Provisoire" },
  { value: "cachet_en_attente", label: "En attente" },
  { value: "facturé", label: "Facturé" },
  { value: "payé", label: "Payé" },
] as const;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  artistProfileId: string;
  onSuccess?: () => void;
}

export function AddPaymentDrawer({ open, onOpenChange, artistProfileId, onSuccess }: Props) {
  const { user } = useAuth();
  const [batchCount, setBatchCount] = useState(1);
  const [busy, setBusy] = useState(false);

  const { register, handleSubmit, watch, reset, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      source: "booking",
      territory: "france",
      status: "provisoire",
      counts_for_intermittence: true,
      deductible_expenses: 0,
    },
  });

  const amount = watch("amount") ?? 0;
  const deductible = watch("deductible_expenses") ?? 0;
  const territory = watch("territory");
  const countsForIntermittence = watch("counts_for_intermittence");

  const netBase = Math.max(Number(amount) - Number(deductible), 0);
  const commissionPreview = netBase * 0.15;

  const submit = async (data: FormValues) => {
    setBusy(true);
    try {
      let batchId: string | null = null;

      if (batchCount > 1) {
        const { data: batch, error: batchErr } = await supabase
          .from("payment_batches")
          .insert({ batch_count: batchCount, label: data.notes })
          .select("id")
          .single();
        if (batchErr) throw batchErr;
        batchId = batch.id;
      }

      const { error } = await supabase.from("payments").insert({
        artist_id: artistProfileId,
        notes: data.notes,
        amount: data.amount,
        payment_date: data.payment_date || null,
        source: data.source,
        territory: data.territory,
        status: data.status,
        counts_for_intermittence: data.counts_for_intermittence,
        deductible_expenses: data.deductible_expenses,
        batch_id: batchId,
        created_by: user?.id,
      });

      if (error) throw error;

      toast.success("Cachet ajouté");
      reset();
      setBatchCount(1);
      onOpenChange(false);
      onSuccess?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de l'ajout");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92dvh]">
        <DrawerHeader>
          <DrawerTitle className="font-display text-xl">Nouveau cachet</DrawerTitle>
        </DrawerHeader>

        <form onSubmit={handleSubmit(submit)} className="overflow-y-auto px-4 pb-8 space-y-5 no-scrollbar">
          {/* Intitulé */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Intitulé</Label>
            <Input id="notes" placeholder="ex: Concert La Cigale" {...register("notes")} />
            {errors.notes && <p className="text-xs text-destructive">{errors.notes.message}</p>}
          </div>

          {/* Montant + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Montant (€)</Label>
              <Input id="amount" type="number" step="0.01" placeholder="0.00" {...register("amount")} />
              {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payment_date">Date</Label>
              <Input id="payment_date" type="date" {...register("payment_date")} />
            </div>
          </div>

          {/* Source */}
          <div className="space-y-1.5">
            <Label>Type</Label>
            <div className="flex flex-wrap gap-2">
              {SOURCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setValue("source", opt.value)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    watch("source") === opt.value
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Territoire */}
          <div className="space-y-1.5">
            <Label>Territoire</Label>
            <div className="flex gap-2">
              {(["france", "étranger"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setValue("territory", t);
                    if (t === "étranger") setValue("counts_for_intermittence", false);
                  }}
                  className={`flex-1 rounded-full border py-2 text-xs font-medium transition capitalize ${
                    territory === t
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {t === "france" ? "France" : "Étranger"}
                </button>
              ))}
            </div>
            {territory === "étranger" && (
              <p className="text-xs text-amber-400">Les cachets à l'étranger ne comptent pas pour l'intermittence en France.</p>
            )}
          </div>

          {/* Statut */}
          <div className="space-y-1.5">
            <Label>Statut</Label>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setValue("status", opt.value)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    watch("status") === opt.value
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cachets groupés */}
          <div className="space-y-1.5">
            <Label>Nombre de cachets (lot)</Label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setBatchCount(Math.max(1, batchCount - 1))}
                className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-foreground"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-8 text-center text-lg font-semibold text-foreground">{batchCount}</span>
              <button
                type="button"
                onClick={() => setBatchCount(batchCount + 1)}
                className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-foreground"
              >
                <Plus className="h-4 w-4" />
              </button>
              {batchCount > 1 && (
                <span className="text-xs text-muted-foreground">= {batchCount} cachets comptabilisés</span>
              )}
            </div>
          </div>

          {/* Intermittence toggle */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Compte pour l'intermittence</p>
              <p className="text-xs text-muted-foreground">Décoche si cachets étrangers ou hors régime</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={countsForIntermittence}
              onClick={() => setValue("counts_for_intermittence", !countsForIntermittence)}
              className={`relative h-6 w-11 rounded-full transition ${countsForIntermittence ? "bg-green-500" : "bg-muted"}`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  countsForIntermittence ? "left-[calc(100%-1.375rem)]" : "left-0.5"
                }`}
              />
            </button>
          </div>

          {/* Dépenses déductibles */}
          <div className="space-y-1.5">
            <Label htmlFor="deductible_expenses">Dépenses déductibles (€) <span className="text-muted-foreground font-normal">— optionnel</span></Label>
            <Input id="deductible_expenses" type="number" step="0.01" placeholder="0.00" {...register("deductible_expenses")} />
          </div>

          {/* Commission preview */}
          {amount > 0 && (
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">Aperçu commission</p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Base nette</span>
                  <span className="text-foreground font-medium">
                    {netBase.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Commission (15%)</span>
                  <span className="text-foreground font-semibold">
                    {commissionPreview.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
                  </span>
                </div>
              </div>
            </div>
          )}

          <Button type="submit" className="w-full rounded-full" size="lg" disabled={busy}>
            {busy ? "Enregistrement…" : "Ajouter le cachet"}
          </Button>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
