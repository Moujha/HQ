import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

interface CockpitTileProps {
  to: string;
  label: string;
  icon: LucideIcon;
  headline: string;
  detail?: string;
  accent?: "default" | "amber" | "green";
}

const ACCENT_CLASS: Record<NonNullable<CockpitTileProps["accent"]>, string> = {
  default: "text-foreground",
  amber: "text-amber-400",
  green: "text-green-400",
};

export function CockpitTile({
  to,
  label,
  icon: Icon,
  headline,
  detail,
  accent = "default",
}: CockpitTileProps) {
  return (
    <Link
      to={to}
      className="rounded-2xl border border-border bg-card px-4 py-4 transition active:scale-[0.98]"
    >
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground font-medium">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </div>
      <p className={`mt-1.5 font-display text-2xl font-bold truncate ${ACCENT_CLASS[accent]}`}>
        {headline}
      </p>
      {detail && <p className="mt-0.5 text-xs text-muted-foreground truncate">{detail}</p>}
    </Link>
  );
}
