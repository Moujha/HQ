import { useCollection } from "@/hooks/use-collection";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

export function History({ entityId }: { entityId: string }) {
  const { data: all } = useCollection<any>("activity_log");
  const items = all.filter((a) => a.entity_id === entityId);

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Historique des actions
      </p>
      {items.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucune action enregistrée.</p>
      )}
      <ol className="space-y-2 border-l border-border pl-4">
        {items.map((a) => (
          <li key={a.id} className="relative">
            <span className="absolute -left-[1.32rem] top-1.5 h-2 w-2 rounded-full bg-gold" />
            <p className="text-sm text-foreground">
              <span className="font-semibold capitalize">{a.action}</span>
              {a.detail ? ` — ${a.detail}` : ""}
            </p>
            <p className="text-[0.65rem] text-muted-foreground">
              {a.user_name ?? "Membre"} ·{" "}
              {formatDistanceToNow(new Date(a.created_at), {
                addSuffix: true,
                locale: fr,
              })}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
