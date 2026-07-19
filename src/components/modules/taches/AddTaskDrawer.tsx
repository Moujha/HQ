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
import { notifyRole, shouldNotifyRole } from "@/lib/notify";

const schema = z.object({
  title: z.string().min(1, "Requis"),
  description: z.string().optional(),
  assignee_role: z.enum(["manager", "artist", "both"]),
  priority: z.enum(["normal", "urgent"]),
  deadline: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: () => void;
}

const MANAGER_ROLE_OPTIONS = [
  { value: "manager", label: "Manager" },
  { value: "artist", label: "Artiste" },
  { value: "both", label: "Tous" },
] as const;

const ARTIST_ROLE_OPTIONS = [
  { value: "artist", label: "Moi" },
  { value: "both", label: "Tous" },
] as const;

export function AddTaskDrawer({ open, onOpenChange, onSuccess }: Props) {
  const { profile } = useAuth();
  const isArtist = profile?.role === "artist";
  const [busy, setBusy] = useState(false);

  const { register, handleSubmit, watch, reset, setValue, formState: { errors } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: { assignee_role: isArtist ? "artist" : "manager", priority: "normal" },
    });

  const roleOptions = isArtist ? ARTIST_ROLE_OPTIONS : MANAGER_ROLE_OPTIONS;

  const submit = async (data: FormValues) => {
    setBusy(true);
    try {
      const { error } = await supabase.from("tasks").insert({
        title: data.title,
        description: data.description || null,
        assignee_role: data.assignee_role,
        priority: data.priority,
        deadline: data.deadline || null,
      });
      if (error) throw error;

      if (profile?.role) {
        const recipient = shouldNotifyRole(profile.role, data.assignee_role);
        if (recipient) {
          void notifyRole({
            recipientRole: recipient,
            title: "Nouvelle tâche",
            body: data.title,
            url: "/taches",
          });
        }
      }

      toast.success("Tâche créée");
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
          <DrawerTitle className="font-display text-xl">Nouvelle tâche</DrawerTitle>
        </DrawerHeader>

        <form onSubmit={handleSubmit(submit)} className="px-4 pb-8 space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Titre</Label>
            <Input id="task-title" placeholder="ex: Envoyer contrat à la salle" {...register("title")} />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-desc">
              Description <span className="text-muted-foreground font-normal">— optionnel</span>
            </Label>
            <Input id="task-desc" placeholder="Détails..." {...register("description")} />
          </div>

          <div className="space-y-1.5">
            <Label>Assigné à</Label>
            <div className="flex gap-2">
              {roleOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setValue("assignee_role", opt.value)}
                  className={`flex-1 rounded-full border py-2 text-xs font-medium transition ${
                    watch("assignee_role") === opt.value
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
            <Label>Priorité</Label>
            <div className="flex gap-2">
              {(["normal", "urgent"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setValue("priority", p)}
                  className={`flex-1 rounded-full border py-2 text-xs font-medium capitalize transition ${
                    watch("priority") === p
                      ? p === "urgent"
                        ? "border-red-500 bg-red-500/10 text-red-400"
                        : "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {p === "normal" ? "Normal" : "Urgent"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-deadline">
              Échéance <span className="text-muted-foreground font-normal">— optionnel</span>
            </Label>
            <Input id="task-deadline" type="date" {...register("deadline")} />
          </div>

          <Button type="submit" className="w-full rounded-full" size="lg" disabled={busy}>
            {busy ? "Création…" : "Créer la tâche"}
          </Button>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
