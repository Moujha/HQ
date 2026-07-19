import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Minus, Plus } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { notifyRole } from "@/lib/notify";
import type { PaymentRow } from "./CachetRow";

const schema = z.object({
  notes: z.string().min(1, "Requis"),
  amount: z.coerce.number().positive("Montant invalide"),
  payment_date: z.string().optional(),
  source: z.enum(["label", "booking", "clip", "track", "résidence", "figuration", "répétition", "formation", "accompagnement"]),
  territory: z.enum(["france", "étranger"]),
  status: z.enum(["provisoire", "facturé", "cachet_en_attente", "payé", "tbc", "annulé"]),
  counts_for_intermittence: z.boolean(),
  deductible_expenses: z.coerce.number().min(0),
  hours: z.coerce.number().min(1),
});

type FormValues = z.infer<typeof schema>;

type HoursMode = "cachets" | "heures";

const SOURCE_OPTIONS = [
  { value: "booking",        label: "Concert / Spectacle" },
  { value: "répétition",     label: "Répétition" },
  { value: "formation",      label: "Formation / Atelier" },
  { value: "accompagnement", label: "Accompagnement" },
  { value: "figuration",     label: "Figuration" },
  { value: "résidence",      label: "Résidence" },
  { value: "clip",           label: "Clip" },
  { value: "track",          label: "Track SACEM" },
  { value: "label",          label: "Label / Droits" },
] as const;

const STATUS_OPTIONS = [
  { value: "provisoire", label: "TBC" },
  { value: "cachet_en_attente", label: "Confirmé" },
  { value: "facturé", label: "Facturé" },
  { value: "payé", label: "Payé" },
  { value: "annulé", label: "Annulé" },
] as const;

const HOURS_PER_CACHET = 12;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payment: PaymentRow & { batch_id: string | null } | null;
  onSuccess?: () => void;
}

export function EditPaymentDrawer({ open, onOpenChange, payment, onSuccess }: Props) {
  const [busy, setBusy] = useState(false);
  const [hoursMode, setHoursMode] = useState<HoursMode>("cachets");

  const { register, handleSubmit, watch, reset, setValue, formState: { errors, isDirty } } =
    useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!payment) return;
    const h = payment.hours;
    const inferredMode: HoursMode = h > 0 && h % HOURS_PER_CACHET === 0 ? "cachets" : "heures";
    setHoursMode(inferredMode);
    reset({
      notes: payment.notes ?? "",
      amount: payment.amount,
      payment_date: payment.payment_date ?? undefined,
      source: payment.source as FormValues["source"],
      territory: payment.territory,
      status: (payment.status === "tbc" ? "provisoire" : payment.status) as FormValues["status"],
      counts_for_intermittence: payment.counts_for_intermittence,
      deductible_expenses: payment.deductible_expenses,
      hours: h,
    });
  }, [payment, reset]);

  const amount = watch("amount") ?? 0;
  const deductible = watch("deductible_expenses") ?? 0;
  const territory = watch("territory");
  const countsForIntermittence = watch("counts_for_intermittence");
  const hours = watch("hours") ?? HOURS_PER_CACHET;

  const cachetCount = Math.max(1, Math.round(hours / HOURS_PER_CACHET));

  const netBase = Math.max(Number(amount) - Number(deductible), 0);
  const commissionPreview = netBase * 0.15;

  const setCachetCount = (n: number) => {
    setValue("hours", Math.max(1, n) * HOURS_PER_CACHET);
  };

  const switchToMode = (mode: HoursMode) => {
    if (mode === "cachets" && hoursMode === "heures") {
      // Round current hours to nearest cachet
      setValue("hours", Math.max(1, Math.round(hours / HOURS_PER_CACHET)) * HOURS_PER_CACHET);
    }
    setHoursMode(mode);
  };

  const submit = async (data: FormValues) => {
    if (!payment) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("payments")
        .update({
          notes: data.notes,
          amount: data.amount,
          payment_date: data.payment_date || null,
          source: data.source,
          territory: data.territory,
          status: data.status,
          counts_for_intermittence: data.counts_for_intermittence,
          deductible_expenses: data.deductible_expenses,
          hours: data.hours,
        })
        .eq("id", payment.id);

      if (error) throw error;

      if (data.status !== payment.status && (data.status === "payé" || data.status === "annulé")) {
        void notifyRole({
          recipientRole: "artist",
          title: data.status === "payé" ? "Paiement reçu" : "Paiement annulé",
          body:
            data.status === "payé"
              ? `${data.notes} — ${data.amount.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}`
              : data.notes,
          url: "/finance",
        });
      }

      toast.success("Cachet modifié");
      window.dispatchEvent(new Event("mc-refresh"));
      onSuccess?.();
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de la modification");
    } finally {
      setBusy(false);
    }
  };

  // Swiping the sheet away or tapping the backdrop should save (like closing a note),
  // not silently discard edits. Only auto-saves if something actually changed.
  const handleOpenChange = (v: boolean) => {
    if (!v && isDirty) {
      void handleSubmit(submit)();
      return;
    }
    onOpenChange(v);
  };

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent className="max-h-[92dvh] overflow-x-hidden">
        <DrawerHeader>
          <DrawerTitle className="font-display text-xl">Modifier le cachet</DrawerTitle>
        </DrawerHeader>

        <form onSubmit={handleSubmit(submit)} className="overflow-y-auto overflow-x-hidden px-4 pb-8 space-y-5 no-scrollbar">
          {/* Intitulé */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-notes">Intitulé</Label>
            <Input id="edit-notes" placeholder="ex: Concert La Cigale" {...register("notes")} />
            {errors.notes && <p className="text-xs text-destructive">{errors.notes.message}</p>}
          </div>

          {/* Montant + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-amount">Montant (€)</Label>
              <Input id="edit-amount" type="number" step="0.01" placeholder="0.00" {...register("amount")} />
              {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-date">Date</Label>
              <Input id="edit-date" type="date" {...register("payment_date")} />
            </div>
          </div>

          {/* Cachets / Heures */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Durée</Label>
              <div className="flex rounded-full border border-border bg-card p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => switchToMode("cachets")}
                  className={`rounded-full px-3 py-1 font-medium transition ${
                    hoursMode === "cachets"
                      ? "bg-foreground text-background"
                      : "text-muted-foreground"
                  }`}
                >
                  Cachets
                </button>
                <button
                  type="button"
                  onClick={() => switchToMode("heures")}
                  className={`rounded-full px-3 py-1 font-medium transition ${
                    hoursMode === "heures"
                      ? "bg-foreground text-background"
                      : "text-muted-foreground"
                  }`}
                >
                  Heures
                </button>
              </div>
            </div>

            {hoursMode === "cachets" ? (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCachetCount(cachetCount - 1)}
                  disabled={cachetCount <= 1}
                  className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-foreground disabled:opacity-40"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <div className="text-center">
                  <span className="text-lg font-semibold text-foreground">{cachetCount}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    cachet{cachetCount > 1 ? "s" : ""} · {cachetCount * HOURS_PER_CACHET} h
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setCachetCount(cachetCount + 1)}
                  className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-foreground"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setValue("hours", Math.max(1, hours - 1))}
                  className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-foreground"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <div className="text-center">
                  <span className="text-lg font-semibold text-foreground">{hours}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground">heures</span>
                </div>
                <button
                  type="button"
                  onClick={() => setValue("hours", hours + 1)}
                  className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-foreground"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            )}
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
            <Label htmlFor="edit-deductible">
              Dépenses déductibles (€){" "}
              <span className="text-muted-foreground font-normal">— optionnel</span>
            </Label>
            <Input
              id="edit-deductible"
              type="number"
              step="0.01"
              placeholder="0.00"
              {...register("deductible_expenses")}
            />
          </div>

          {/* Commission preview */}
          {amount > 0 && (
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">
                Aperçu commission
              </p>
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
            {busy ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
