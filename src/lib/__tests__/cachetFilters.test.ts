import { describe, it, expect } from "vitest";
import {
  applyCachetFilters,
  sortCachetsByDate,
  countActiveFilters,
  EMPTY_FILTERS,
  type CachetForFilter,
} from "../cachetFilters";

const make = (overrides: Partial<CachetForFilter> = {}): CachetForFilter => ({
  id: "x",
  notes: "Concert La Cigale",
  status: "payé",
  territory: "france",
  source: "booking",
  payment_date: "2026-01-01",
  ...overrides,
});

describe("applyCachetFilters", () => {
  it("returns everything except annulé when no status filter is set", () => {
    const rows = [make({ id: "a", status: "payé" }), make({ id: "b", status: "annulé" })];
    const result = applyCachetFilters(rows, EMPTY_FILTERS);
    expect(result.map((r) => r.id)).toEqual(["a"]);
  });

  it("includes annulé when explicitly selected in the status filter", () => {
    const rows = [make({ id: "a", status: "payé" }), make({ id: "b", status: "annulé" })];
    const result = applyCachetFilters(rows, { ...EMPTY_FILTERS, statuses: ["annulé"] });
    expect(result.map((r) => r.id)).toEqual(["b"]);
  });

  it("ORs multiple selected statuses", () => {
    const rows = [
      make({ id: "a", status: "payé" }),
      make({ id: "b", status: "facturé" }),
      make({ id: "c", status: "provisoire" }),
    ];
    const result = applyCachetFilters(rows, { ...EMPTY_FILTERS, statuses: ["payé", "facturé"] });
    expect(result.map((r) => r.id).sort()).toEqual(["a", "b"]);
  });

  it("ANDs territory with status", () => {
    const rows = [
      make({ id: "a", status: "payé", territory: "france" }),
      make({ id: "b", status: "payé", territory: "étranger" }),
    ];
    const result = applyCachetFilters(rows, { ...EMPTY_FILTERS, territories: ["étranger"] });
    expect(result.map((r) => r.id)).toEqual(["b"]);
  });

  it("ANDs source with the rest", () => {
    const rows = [
      make({ id: "a", source: "booking" }),
      make({ id: "b", source: "clip" }),
    ];
    const result = applyCachetFilters(rows, { ...EMPTY_FILTERS, sources: ["clip"] });
    expect(result.map((r) => r.id)).toEqual(["b"]);
  });

  it("searches notes case- and accent-insensitively", () => {
    const rows = [make({ id: "a", notes: "Concert La Cigale" }), make({ id: "b", notes: "Répétition" })];
    expect(applyCachetFilters(rows, { ...EMPTY_FILTERS, search: "cigale" }).map((r) => r.id)).toEqual(["a"]);
    expect(applyCachetFilters(rows, { ...EMPTY_FILTERS, search: "repetition" }).map((r) => r.id)).toEqual(["b"]);
  });

  it("treats null notes as empty for search", () => {
    const rows = [make({ id: "a", notes: null })];
    expect(applyCachetFilters(rows, { ...EMPTY_FILTERS, search: "x" })).toHaveLength(0);
    expect(applyCachetFilters(rows, { ...EMPTY_FILTERS, search: "" })).toHaveLength(1);
  });
});

describe("sortCachetsByDate", () => {
  it("sorts descending by default order given", () => {
    const rows = [make({ id: "a", payment_date: "2026-01-01" }), make({ id: "b", payment_date: "2026-06-01" })];
    expect(sortCachetsByDate(rows, false).map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("sorts ascending when asked", () => {
    const rows = [make({ id: "a", payment_date: "2026-06-01" }), make({ id: "b", payment_date: "2026-01-01" })];
    expect(sortCachetsByDate(rows, true).map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("treats null payment_date as oldest", () => {
    const rows = [make({ id: "a", payment_date: null }), make({ id: "b", payment_date: "2026-01-01" })];
    expect(sortCachetsByDate(rows, true).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("does not mutate the input array", () => {
    const rows = [make({ id: "a", payment_date: "2026-01-01" }), make({ id: "b", payment_date: "2026-06-01" })];
    const copy = [...rows];
    sortCachetsByDate(rows, true);
    expect(rows).toEqual(copy);
  });
});

describe("countActiveFilters", () => {
  it("counts 0 for EMPTY_FILTERS", () => {
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
  });

  it("sums statuses + territories + sources (not search)", () => {
    expect(
      countActiveFilters({ search: "x", statuses: ["payé"], territories: ["france", "étranger"], sources: [] })
    ).toBe(3);
  });
});
