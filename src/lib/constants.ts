// Domain constants, labels and visual mappings for Maison Caviar.

export type Role = "manager" | "artist";

export const ROLE_LABEL: Record<string, string> = {
  manager: "Adrien · Manager",
  artist: "Meryl · Artiste",
};

export const ROLE_SHORT: Record<string, string> = {
  manager: "Adrien",
  artist: "Meryl",
};

export const DECISION_CATEGORIES = [
  "Booking",
  "Presse",
  "Marque",
  "Feat",
  "Partenariat",
  "Admin",
  "Fan",
  "Autre",
] as const;

export const DECISION_SOURCES = ["email", "manuel", "veille", "autre"] as const;

export const PRIORITIES = ["faible", "moyen", "élevé", "urgent"] as const;
export const PRIORITY_LABEL: Record<string, string> = {
  faible: "Faible",
  moyen: "Moyen",
  "élevé": "Élevé",
  urgent: "Urgent",
};

export const DECISION_STATUSES = [
  "en_attente",
  "interessee",
  "pas_interessee",
  "a_discuter",
  "repondu",
  "archive",
] as const;

export const DECISION_STATUS_LABEL: Record<string, string> = {
  en_attente: "En attente",
  interessee: "Intéressée",
  pas_interessee: "Pas intéressée",
  a_discuter: "À discuter",
  repondu: "Répondu",
  archive: "Archivé",
};

export const TASK_STATUSES = ["a_faire", "en_cours", "en_attente", "termine"] as const;
export const TASK_STATUS_LABEL: Record<string, string> = {
  a_faire: "À faire",
  en_cours: "En cours",
  en_attente: "En attente",
  termine: "Terminé",
};

export const VEILLE_PLATFORMS = [
  "Web",
  "Presse",
  "Instagram",
  "TikTok",
  "YouTube",
  "Spotify",
  "Radio",
  "Autre",
] as const;

export const VEILLE_IMPORTANCE = ["faible", "moyen", "élevé"] as const;
export const VEILLE_STATUSES = ["nouveau", "vu", "important", "a_traiter", "archive"] as const;
export const VEILLE_STATUS_LABEL: Record<string, string> = {
  nouveau: "Nouveau",
  vu: "Vu",
  important: "Important",
  a_traiter: "À traiter",
  archive: "Archivé",
};

export function priorityClasses(p: string): string {
  switch (p) {
    case "urgent":
      return "bg-destructive/15 text-destructive border-destructive/30";
    case "élevé":
      return "bg-gold/15 text-gold border-gold/30";
    case "moyen":
      return "bg-accent text-accent-foreground border-border";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export function decisionStatusClasses(s: string): string {
  switch (s) {
    case "interessee":
      return "bg-success/15 text-success border-success/30";
    case "pas_interessee":
      return "bg-destructive/15 text-destructive border-destructive/30";
    case "a_discuter":
      return "bg-gold/15 text-gold border-gold/30";
    case "repondu":
      return "bg-accent text-accent-foreground border-border";
    case "archive":
      return "bg-muted text-muted-foreground border-border";
    default:
      return "bg-secondary text-secondary-foreground border-border";
  }
}

export function importanceClasses(s: string): string {
  switch (s) {
    case "élevé":
      return "bg-destructive/15 text-destructive border-destructive/30";
    case "moyen":
      return "bg-gold/15 text-gold border-gold/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}
