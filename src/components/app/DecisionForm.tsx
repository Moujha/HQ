import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { logActivity, notify } from "@/lib/activity";
import {
  DECISION_CATEGORIES,
  DECISION_SOURCES,
  PRIORITIES,
  PRIORITY_LABEL,
} from "@/lib/constants";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { withRetry, describeSupabaseError } from "@/lib/retry";

export function DecisionForm({
  open,
  onOpenChange,
  existing,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existing?: any;
}) {
  const { user, profile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<any>(
    existing ?? {
      title: "",
      category: "Booking",
      source: "manuel",
      summary: "",
      description: "",
      contact_name: "",
      contact_email: "",
      company: "",
      deadline: "",
      location: "",
      amount: "",
      priority: "moyen",
      internal_note: "",
    },
  );

  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.title.trim()) {
      toast.error("Le titre est requis");
      return;
    }
    setBusy(true);
    const payload = {
      title: f.title,
      category: f.category,
      source: f.source,
      summary: f.summary || null,
      description: f.description || null,
      contact_name: f.contact_name || null,
      contact_email: f.contact_email || null,
      company: f.company || null,
      deadline: f.deadline || null,
      location: f.location || null,
      amount: f.amount || null,
      priority: f.priority,
      internal_note: f.internal_note || null,
    };

    if (existing) {
      const { error } = await withRetry(() =>
        supabase.from("decisions").update(payload).eq("id", existing.id),
        {
          onRetry: (attempt) =>
            toast.loading(`Connexion instable, nouvelle tentative (${attempt})…`, {
              id: "decision-save",
            }),
        },
      );
      if (error) {
        toast.error("Impossible de mettre à jour la demande", {
          id: "decision-save",
          description: describeSupabaseError(error),
        });
        setBusy(false);
        return;
      }
      await logActivity({
        entity_type: "decision",
        entity_id: existing.id,
        action: "modification",
        title: f.title,
        user_id: user?.id,
        user_name: profile?.display_name,
      });
      toast.success("Demande mise à jour", { id: "decision-save" });
    } else {
      const { data, error } = await withRetry<any>(() =>
        supabase
          .from("decisions")
          .insert({ ...payload, created_by: user?.id })
          .select()
          .single(),
        {
          onRetry: (attempt) =>
            toast.loading(`Connexion instable, nouvelle tentative (${attempt})…`, {
              id: "decision-save",
            }),
        },
      );
      if (error || !data) {
        toast.error("Impossible de créer la demande", {
          id: "decision-save",
          description: describeSupabaseError(error),
        });
        setBusy(false);
        return;
      }
      await logActivity({
        entity_type: "decision",
        entity_id: data?.id,
        action: "creation",
        title: f.title,
        user_id: user?.id,
        user_name: profile?.display_name,
      });
      await notify({
        recipient_role: "artist",
        title: "Nouvelle décision à valider",
        body: f.title,
        link_type: "decision",
        link_id: data?.id,
        created_by: user?.id,
      });
      toast.success("Demande ajoutée", { id: "decision-save" });
    }
    setBusy(false);
    onOpenChange(false);
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto no-scrollbar">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {existing ? "Modifier la demande" : "Nouvelle demande"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Titre">
            <Input value={f.title} onChange={(e) => set("title", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Catégorie">
              <Selector
                value={f.category}
                onChange={(v) => set("category", v)}
                options={DECISION_CATEGORIES.map((c) => [c, c])}
              />
            </Field>
            <Field label="Source">
              <Selector
                value={f.source}
                onChange={(v) => set("source", v)}
                options={DECISION_SOURCES.map((c) => [c, c])}
              />
            </Field>
          </div>
          <Field label="Résumé court">
            <Input value={f.summary} onChange={(e) => set("summary", e.target.value)} />
          </Field>
          <Field label="Description complète">
            <Textarea
              rows={3}
              value={f.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact">
              <Input
                value={f.contact_name}
                onChange={(e) => set("contact_name", e.target.value)}
              />
            </Field>
            <Field label="Email contact">
              <Input
                value={f.contact_email}
                onChange={(e) => set("contact_email", e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Structure / société">
              <Input value={f.company} onChange={(e) => set("company", e.target.value)} />
            </Field>
            <Field label="Lieu">
              <Input value={f.location} onChange={(e) => set("location", e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Montant / budget">
              <Input value={f.amount} onChange={(e) => set("amount", e.target.value)} />
            </Field>
            <Field label="Date limite">
              <Input
                type="date"
                value={f.deadline ?? ""}
                onChange={(e) => set("deadline", e.target.value)}
              />
            </Field>
          </div>
          <Field label="Priorité">
            <Selector
              value={f.priority}
              onChange={(v) => set("priority", v)}
              options={PRIORITIES.map((p) => [p, PRIORITY_LABEL[p]])}
            />
          </Field>
          <Field label="Commentaire interne">
            <Textarea
              rows={2}
              value={f.internal_note}
              onChange={(e) => set("internal_note", e.target.value)}
            />
          </Field>
          <Button
            onClick={save}
            disabled={busy}
            size="lg"
            className="w-full rounded-full"
          >
            {existing ? "Enregistrer" : "Ajouter la demande"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function Selector({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
