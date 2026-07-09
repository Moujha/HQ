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
  event_date: z.string().min(1, "Requis"),
  location: z.string().optional(),
  type: z.enum(["concert", "répétition", "résidence", "autre"]),
  status: z.enum(["confirmé", "TBC", "annulé"]),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: () => void;
}

const TYPE_OPTIONS = [
  { value: "concert", label: "🎤 Concert" },
  { value: "répétition", label: "🎸 Répétition" },
  { value: "résidence", label: "🏠 Résidence" },
  { value: "autre", label: "📅 Autre" },
] as const;

export function AddEventDrawer({ open, onOpenChange, onSuccess }: Props) {
  const [busy, setBusy] = useState(false);

  const { register, handleSubmit, watch, reset, setValue, formState: { errors } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: { type: "concert", status: "TBC" },
    });

  const submit = async (data: FormValues) => {
    setBusy(true);
    try {
      const { error } = await supabase.from("events").insert({
        title: data.title,
        event_date: data.event_date,
        location: data.location || null,
        type: data.type,
        status: data.status,
      });
      if (error) throw error;
      toast.success("Événement ajouté");
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
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="font-display text-xl">Nouvel événement</DrawerTitle>
        </DrawerHeader>

        <form onSubmit={handleSubmit(submit)} className="px-4 pb-8 space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="event-title">Titre</Label>
            <Input id="event-title" placeholder="ex: Concert La Cigale" {...register("title")} />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="event-date">Date</Label>
              <Input id="event-date" type="date" {...register("event_date")} />
              {errors.event_date && <p className="text-xs text-destructive">{errors.event_date.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event-location">Lieu</Label>
              <Input id="event-location" placeholder="Paris" {...register("location")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Type</Label>
            <div className="flex flex-wrap gap-2">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setValue("type", opt.value)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    watch("type") === opt.value
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
            <Label>Statut</Label>
            <div className="flex gap-2">
              {(["TBC", "confirmé", "annulé"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setValue("status", s)}
                  className={`flex-1 rounded-full border py-2 text-xs font-medium transition ${
                    watch("status") === s
                      ? s === "confirmé"
                        ? "border-green-500 bg-green-500/10 text-green-400"
                        : s === "annulé"
                          ? "border-red-500/30 bg-red-500/10 text-red-400"
                          : "border-amber-500/30 bg-amber-500/10 text-amber-400"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <Button type="submit" className="w-full rounded-full" size="lg" disabled={busy}>
            {busy ? "Ajout…" : "Ajouter l'événement"}
          </Button>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
