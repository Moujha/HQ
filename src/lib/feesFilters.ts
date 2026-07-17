export interface FeesFilters {
  search: string;
  statuses: string[];
}

export const EMPTY_FEES_FILTERS: FeesFilters = { search: "", statuses: [] };

export function countActiveFeesFilters(filters: FeesFilters): number {
  return filters.statuses.length;
}

function normalizeForSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

interface FeeForFilter {
  status: string;
  payment: { notes: string | null; source: string } | null;
}

export function applyFeesFilters<T extends FeeForFilter>(
  fees: T[],
  filters: FeesFilters
): T[] {
  const search = normalizeForSearch(filters.search.trim());

  return fees.filter((f) => {
    if (filters.statuses.length > 0) {
      if (!filters.statuses.includes(f.status)) return false;
    } else if (f.status === "annulée") {
      return false;
    }

    if (search) {
      const label = f.payment?.notes ?? f.payment?.source ?? "";
      if (!normalizeForSearch(label).includes(search)) return false;
    }

    return true;
  });
}

interface FeeForSort {
  payment: { payment_date: string | null } | null;
}

export function sortFeesByDate<T extends FeeForSort>(
  fees: T[],
  ascending: boolean
): T[] {
  return [...fees].sort((a, b) => {
    const ta = a.payment?.payment_date ? new Date(a.payment.payment_date).getTime() : 0;
    const tb = b.payment?.payment_date ? new Date(b.payment.payment_date).getTime() : 0;
    return ascending ? ta - tb : tb - ta;
  });
}
