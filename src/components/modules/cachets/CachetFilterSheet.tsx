import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import type { CachetFilters } from "@/lib/cachetFilters";

const STATUS_OPTIONS = [
  { value: "provisoire", label: "TBC" },
  { value: "cachet_en_attente", label: "Confirmé" },
  { value: "facturé", label: "Facturé" },
  { value: "payé", label: "Payé" },
  { value: "annulé", label: "Annulé" },
] as const;

const TERRITORY_OPTIONS = [
  { value: "france", label: "France" },
  { value: "étranger", label: "Étranger" },
] as const;

const DEFAULT_SOURCE_OPTIONS = [
  { value: "booking", label: "Concert" },
  { value: "répétition", label: "Répétition" },
  { value: "formation", label: "Formation" },
  { value: "accompagnement", label: "Accompagnement" },
  { value: "figuration", label: "Figuration" },
  { value: "résidence", label: "Résidence" },
  { value: "clip", label: "Clip" },
  { value: "track", label: "Track" },
  { value: "label", label: "Label" },
] as const;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  filters: CachetFilters;
  onChange: (filters: CachetFilters) => void;
  sourceOptions?: readonly { value: string; label: string }[];
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function FilterGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: readonly { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onToggle(opt.value)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
              selected.includes(opt.value)
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-card text-muted-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CachetFilterSheet({ open, onOpenChange, filters, onChange, sourceOptions }: Props) {
  const reset = () => onChange({ ...filters, statuses: [], territories: [], sources: [] });
  const typeOptions = sourceOptions ?? DEFAULT_SOURCE_OPTIONS;

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
          <FilterGroup
            label="Statut"
            options={STATUS_OPTIONS}
            selected={filters.statuses}
            onToggle={(v) => onChange({ ...filters, statuses: toggle(filters.statuses, v) })}
          />
          <FilterGroup
            label="Territoire"
            options={TERRITORY_OPTIONS}
            selected={filters.territories}
            onToggle={(v) => onChange({ ...filters, territories: toggle(filters.territories, v) })}
          />
          <FilterGroup
            label="Type"
            options={typeOptions}
            selected={filters.sources}
            onToggle={(v) => onChange({ ...filters, sources: toggle(filters.sources, v) })}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
