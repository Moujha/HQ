import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCollection } from "@/hooks/use-collection";
import { useAuth } from "@/hooks/use-auth";
import { logActivity, notify } from "@/lib/activity";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

interface Comment {
  id: string;
  entity_type: string;
  entity_id: string;
  author_name: string | null;
  content: string;
  created_at: string;
}

export function Comments({
  entityType,
  entityId,
  entityTitle,
}: {
  entityType: string;
  entityId: string;
  entityTitle: string;
}) {
  const { user, profile } = useAuth();
  const { data: all } = useCollection<Comment>("comments", {
    column: "created_at",
    ascending: true,
  });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const comments = all.filter(
    (c) => c.entity_type === entityType && c.entity_id === entityId,
  );

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    await supabase.from("comments").insert({
      entity_type: entityType,
      entity_id: entityId,
      author_id: user?.id ?? null,
      author_name: profile?.display_name ?? null,
      content: text.trim(),
    });
    await logActivity({
      entity_type: entityType,
      entity_id: entityId,
      action: "commentaire",
      title: entityTitle,
      detail: text.trim().slice(0, 120),
      user_id: user?.id,
      user_name: profile?.display_name,
    });
    // Notifie l'autre personne (artiste <-> manager) du nouveau commentaire
    const recipientRole = profile?.role === "manager" ? "artist" : "manager";
    await notify({
      recipient_role: recipientRole,
      title: `Nouveau commentaire de ${profile?.display_name ?? "un membre"}`,
      body: `${entityTitle} — ${text.trim().slice(0, 120)}`,
      link_type: entityType,
      link_id: entityId,
      created_by: user?.id,
    });
    setText("");
    setBusy(false);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Commentaires internes
      </p>
      <div className="space-y-2">
        {comments.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucun commentaire pour l'instant.</p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-gold">
                {c.author_name ?? "Membre"}
              </span>
              <span className="text-[0.65rem] text-muted-foreground">
                {formatDistanceToNow(new Date(c.created_at), {
                  addSuffix: true,
                  locale: fr,
                })}
              </span>
            </div>
            <p className="mt-1 text-sm text-foreground">{c.content}</p>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ajouter un commentaire…"
          rows={2}
        />
        <Button
          onClick={send}
          disabled={busy || !text.trim()}
          size="sm"
          className="w-full rounded-full"
        >
          Publier
        </Button>
      </div>
    </div>
  );
}
