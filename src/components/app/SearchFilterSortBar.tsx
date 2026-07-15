import { Search, SlidersHorizontal, ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";

interface Props {
  search: string;
  onSearchChange: (value: string) => void;
  activeFilterCount: number;
  onFilterClick: () => void;
  sortAsc: boolean;
  onSortToggle: () => void;
  searchPlaceholder?: string;
}

export function SearchFilterSortBar({
  search,
  onSearchChange,
  activeFilterCount,
  onFilterClick,
  sortAsc,
  onSortToggle,
  searchPlaceholder = "Rechercher un intitulé…",
}: Props) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded-full border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
        />
      </div>
      <button
        type="button"
        onClick={onFilterClick}
        className="relative shrink-0 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-medium text-foreground"
      >
        <span className="flex items-center gap-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          Filtres
        </span>
        {activeFilterCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-[0.6rem] font-semibold text-background">
            {activeFilterCount}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={onSortToggle}
        className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-medium text-foreground"
      >
        {sortAsc ? (
          <ArrowUpNarrowWide className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <ArrowDownWideNarrow className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        Date
      </button>
    </div>
  );
}
