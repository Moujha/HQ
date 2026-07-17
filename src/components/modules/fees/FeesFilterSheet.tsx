import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import type { FeesFilters } from "@/lib/feesFilters";

const STATUS_OPTIONS = [
  { value: "projetée", label: "Projetée" },
  { value: "due", label: "Due" },
  { value: "versée", label: "Versée" },
  { value: "annulée", label: "Annulée" },
] as const;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  filters: FeesFilters;
  onChange: (filters: FeesFilters) => void;
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function FeesFilterSheet({ open, onOpenChange, filters, onChange }: Props) {
  const reset = () => onChange({ ...filters, statuses: [] });

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85dvh]">
        <DrawerHeader className="flex flex-row items-center justify-between space-y-0">
          <DrawerTitle className="font-display text-xl">Filtres</DrawerTitle>
          <button
            type="button"
            onClick={reset}
            className="text-xs font-medium text-muted-foreground"
          >
            Réinitialiser
          </button>
        </DrawerHeader>

        <div className="overflow-y-auto px-4 pb-8 space-y-5 no-scrollbar">
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Statut</p>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onChange({ ...filters, statuses: toggle(filters.statuses, opt.value) })}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                    filters.statuses.includes(opt.value)
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
