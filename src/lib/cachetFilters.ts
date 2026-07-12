export interface CachetForFilter {
  id: string;
  notes: string | null;
  status: string;
  territory: "france" | "étranger";
  source: string;
  payment_date: string | null;
}

export interface CachetFilters {
  search: string;
  statuses: string[];
  territories: string[];
  sources: string[];
}

export const EMPTY_FILTERS: CachetFilters = {
  search: "",
  statuses: [],
  territories: [],
  sources: [],
};

export function countActiveFilters(filters: CachetFilters): number {
  return filters.statuses.length + filters.territories.length + filters.sources.length;
}

function normalizeForSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function applyCachetFilters<T extends CachetForFilter>(
  payments: T[],
  filters: CachetFilters
): T[] {
  const search = normalizeForSearch(filters.search.trim());

  return payments.filter((p) => {
    if (filters.statuses.length > 0) {
      if (!filters.statuses.includes(p.status)) return false;
    } else if (p.status === "annulé") {
      return false;
    }

    if (filters.territories.length > 0 && !filters.territories.includes(p.territory)) {
      return false;
    }

    if (filters.sources.length > 0 && !filters.sources.includes(p.source)) {
      return false;
    }

    if (search && !normalizeForSearch(p.notes ?? "").includes(search)) {
      return false;
    }

    return true;
  });
}

export function sortCachetsByDate<T extends { payment_date: string | null }>(
  payments: T[],
  ascending: boolean
): T[] {
  return [...payments].sort((a, b) => {
    const ta = a.payment_date ? new Date(a.payment_date).getTime() : 0;
    const tb = b.payment_date ? new Date(b.payment_date).getTime() : 0;
    return ascending ? ta - tb : tb - ta;
  });
}
