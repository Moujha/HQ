import { useState, useEffect } from "react";
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

const schema = z.object({
  title: z.string().min(1, "Requis"),
  release_date: z.string().optional(),
  is_commissionable: z.boolean(),
  sacem_status: z.enum(["non_déclaré", "programme_en_draft", "déclaré", "étranger", "non_applicable"]),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const SACEM_OPTIONS = [
  { value: "non_déclaré", label: "Non déclaré" },
  { value: "programme_en_draft", label: "Draft" },
  { value: "déclaré", label: "Déclaré" },
  { value: "étranger", label: "Étranger" },
  { value: "non_applicable", label: "N/A" },
] as const;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: () => void;
}

export function AddTrackDrawer({ open, onOpenChange, onSuccess }: Props) {
  const [busy, setBusy] = useState(false);
  const { profile } = useAuth();

  const { register, handleSubmit, watch, reset, setValue, formState: { errors } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: { is_commissionable: true, sacem_status: "non_déclaré" },
    });

  const releaseDate = watch("release_date");

  useEffect(() => {
    if (!releaseDate || !profile?.commission_start_date) return;
    setValue("is_commissionable", releaseDate >= profile.commission_start_date);
  }, [releaseDate, profile?.commission_start_date, setValue]);

  const submit = async (data: FormValues) => {
    setBusy(true);
    try {
      const { error } = await supabase.from("tracks").insert({
        title: data.title,
        release_date: data.release_date || null,
        is_commissionable: data.is_commissionable,
        sacem_status: data.sacem_status,
        notes: data.notes || null,
      });
      if (error) throw error;
      toast.success("Track ajouté");
      reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const isCommissionable = watch("is_commissionable");

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="font-display text-xl">Nouveau track</DrawerTitle>
        </DrawerHeader>

        <form onSubmit={handleSubmit(submit)} className="px-4 pb-8 space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="track-title">Titre</Label>
            <Input id="track-title" placeholder="ex: Comme d'habitude" {...register("title")} />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="track-release">Date de sortie <span className="text-muted-foreground font-normal">— optionnel</span></Label>
            <Input id="track-release" type="date" {...register("release_date")} />
          </div>

          <div className="space-y-1.5">
            <Label>Statut SACEM</Label>
            <div className="flex flex-wrap gap-2">
              {SACEM_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setValue("sacem_status", opt.value)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    watch("sacem_status") === opt.value
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Commissionnable</p>
              <p className="text-xs text-muted-foreground">Inclus dans le calcul des fees</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isCommissionable}
              onClick={() => setValue("is_commissionable", !isCommissionable)}
              className={`relative h-6 w-11 rounded-full transition ${isCommissionable ? "bg-green-500" : "bg-muted"}`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  isCommissionable ? "left-[calc(100%-1.375rem)]" : "left-0.5"
                }`}
              />
            </button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="track-notes">Notes <span className="text-muted-foreground font-normal">— optionnel</span></Label>
            <Input id="track-notes" placeholder="ex: feat. Artiste X" {...register("notes")} />
          </div>

          <Button type="submit" className="w-full rounded-full" size="lg" disabled={busy}>
            {busy ? "Ajout…" : "Ajouter le track"}
          </Button>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
