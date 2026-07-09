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

const schema = z.object({
  title: z.string().min(1, "Requis"),
  organisme: z.string().optional(),
  categorie: z.string().optional(),
  status: z.enum(["à_instruire", "dossier_en_cours", "déposé", "obtenu", "refusé", "en_attente", "inéligible"]),
  priority: z.enum(["haute", "moyenne", "basse"]).optional(),
  montant_max: z.coerce.number().positive().optional(),
  deadline_depot: z.string().optional(),
  lien_dossier: z.string().url("URL invalide").optional().or(z.literal("")),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: () => void;
}

const STATUS_OPTIONS = [
  { value: "à_instruire", label: "À instruire" },
  { value: "dossier_en_cours", label: "En cours" },
  { value: "déposé", label: "Déposé" },
  { value: "en_attente", label: "En attente" },
  { value: "obtenu", label: "Obtenu" },
  { value: "refusé", label: "Refusé" },
  { value: "inéligible", label: "Inéligible" },
] as const;

export function AddGrantDrawer({ open, onOpenChange, onSuccess }: Props) {
  const [busy, setBusy] = useState(false);

  const { register, handleSubmit, watch, reset, setValue, formState: { errors } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: { status: "à_instruire" },
    });

  const submit = async (data: FormValues) => {
    setBusy(true);
    try {
      const { error } = await supabase.from("grants").insert({
        title: data.title,
        organisme: data.organisme || null,
        categorie: data.categorie || null,
        status: data.status,
        priority: data.priority || null,
        montant_max: data.montant_max ?? null,
        deadline_depot: data.deadline_depot || null,
        lien_dossier: data.lien_dossier || null,
        notes: data.notes || null,
      });
      if (error) throw error;
      toast.success("Subvention ajoutée");
      reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92dvh]">
        <DrawerHeader>
          <DrawerTitle className="font-display text-xl">Nouvelle subvention</DrawerTitle>
        </DrawerHeader>

        <form onSubmit={handleSubmit(submit)} className="overflow-y-auto px-4 pb-8 space-y-5 no-scrollbar">
          <div className="space-y-1.5">
            <Label htmlFor="grant-title">Titre / dispositif</Label>
            <Input id="grant-title" placeholder="ex: CNM - Aide à la production" {...register("title")} />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="grant-organisme">Organisme</Label>
              <Input id="grant-organisme" placeholder="CNM, SCPP..." {...register("organisme")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grant-montant">Montant max (€)</Label>
              <Input id="grant-montant" type="number" placeholder="5000" {...register("montant_max")} />
            </div>
          </div>

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

          <div className="space-y-1.5">
            <Label>Priorité <span className="text-muted-foreground font-normal">— optionnel</span></Label>
            <div className="flex gap-2">
              {(["haute", "moyenne", "basse"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setValue("priority", watch("priority") === p ? undefined : p)}
                  className={`flex-1 rounded-full border py-2 text-xs font-medium capitalize transition ${
                    watch("priority") === p
                      ? p === "haute"
                        ? "border-red-500 bg-red-500/10 text-red-400"
                        : p === "moyenne"
                          ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                          : "border-border bg-foreground text-background"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="grant-deadline">Date limite de dépôt <span className="text-muted-foreground font-normal">— optionnel</span></Label>
            <Input id="grant-deadline" type="date" {...register("deadline_depot")} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="grant-lien">Lien dossier <span className="text-muted-foreground font-normal">— optionnel</span></Label>
            <Input id="grant-lien" type="url" placeholder="https://..." {...register("lien_dossier")} />
            {errors.lien_dossier && <p className="text-xs text-destructive">{errors.lien_dossier.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="grant-notes">Notes <span className="text-muted-foreground font-normal">— optionnel</span></Label>
            <Input id="grant-notes" placeholder="Informations complémentaires..." {...register("notes")} />
          </div>

          <Button type="submit" className="w-full rounded-full" size="lg" disabled={busy}>
            {busy ? "Ajout…" : "Ajouter la subvention"}
          </Button>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
