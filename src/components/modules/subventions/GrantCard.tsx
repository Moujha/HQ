import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ExternalLink } from "lucide-react";

export interface GrantCardData {
  id: string;
  title: string;
  organisme: string | null;
  categorie: string | null;
  status: "à_instruire" | "dossier_en_cours" | "déposé" | "obtenu" | "refusé" | "en_attente" | "inéligible";
  priority: "haute" | "moyenne" | "basse" | null;
  montant_max: number | null;
  deadline_depot: string | null;
  lien_dossier: string | null;
  notes: string | null;
}

const PRIORITY_CLASS: Record<string, string> = {
  haute: "text-red-400",
  moyenne: "text-amber-400",
  basse: "text-muted-foreground",
};

export function GrantCard({ grant }: { grant: GrantCardData }) {
  const isOverdue =
    grant.deadline_depot &&
    new Date(grant.deadline_depot) < new Date() &&
    !["obtenu", "refusé", "déposé", "inéligible"].includes(grant.status);

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{grant.title}</p>
          {grant.organisme && (
            <p className="text-xs text-muted-foreground">{grant.organisme}</p>
          )}
        </div>
        {grant.lien_dossier && (
          <a
            href={grant.lien_dossier}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Ouvrir le dossier"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {grant.montant_max != null && (
          <span className="text-foreground font-medium">
            {grant.montant_max.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })} max
          </span>
        )}
        {grant.deadline_depot && (
          <span className={isOverdue ? "text-red-400" : "text-muted-foreground"}>
            Dépôt {format(new Date(grant.deadline_depot), "d MMM", { locale: fr })}
            {isOverdue && " (dépassé)"}
          </span>
        )}
        {grant.priority && (
          <span className={PRIORITY_CLASS[grant.priority] ?? ""}>
            {grant.priority}
          </span>
        )}
      </div>

      {grant.notes && (
        <p className="text-xs text-muted-foreground line-clamp-2">{grant.notes}</p>
      )}
    </div>
  );
}
