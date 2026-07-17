import { describe, it, expect } from "vitest";
import {
  applyFeesFilters,
  sortFeesByDate,
  countActiveFeesFilters,
  EMPTY_FEES_FILTERS,
  type FeesFilters,
} from "../feesFilters";

interface TestFee {
  id: string;
  status: string;
  payment: { notes: string | null; source: string; payment_date: string | null } | null;
}

const make = (overrides: Partial<TestFee> = {}): TestFee => ({
  id: "f1",
  status: "due",
  payment: { notes: "Concert Test", source: "booking", payment_date: "2026-01-15" },
  ...overrides,
});

describe("countActiveFeesFilters", () => {
  it("counts selected statuses", () => {
    expect(countActiveFeesFilters(EMPTY_FEES_FILTERS)).toBe(0);
    expect(countActiveFeesFilters({ search: "", statuses: ["due", "versée"] })).toBe(2);
  });
});

describe("applyFeesFilters", () => {
  it("returns all fees when filters are empty", () => {
    const fees = [make({ id: "a" }), make({ id: "b", status: "projetée" })];
    expect(applyFeesFilters(fees, EMPTY_FEES_FILTERS)).toHaveLength(2);
  });

  it("filters by status", () => {
    const fees = [make({ id: "a", status: "due" }), make({ id: "b", status: "versée" })];
    const filters: FeesFilters = { search: "", statuses: ["due"] };
    const result = applyFeesFilters(fees, filters);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
  });

  it("matches multiple selected statuses", () => {
    const fees = [
      make({ id: "a", status: "due" }),
      make({ id: "b", status: "versée" }),
      make({ id: "c", status: "projetée" }),
    ];
    const filters: FeesFilters = { search: "", statuses: ["due", "versée"] };
    expect(applyFeesFilters(fees, filters).map((f) => f.id)).toEqual(["a", "b"]);
  });

  it("searches by payment notes, case/accent-insensitive", () => {
    const fees = [make({ payment: { notes: "Concert à Toulouse", source: "booking", payment_date: null } })];
    expect(applyFeesFilters(fees, { search: "toulouse", statuses: [] })).toHaveLength(1);
    expect(applyFeesFilters(fees, { search: "TOULOUSE", statuses: [] })).toHaveLength(1);
    expect(applyFeesFilters(fees, { search: "nantes", statuses: [] })).toHaveLength(0);
  });

  it("falls back to payment source when notes is null", () => {
    const fees = [make({ payment: { notes: null, source: "label", payment_date: null } })];
    expect(applyFeesFilters(fees, { search: "label", statuses: [] })).toHaveLength(1);
  });

  it("returns empty when payment is null and search is non-empty", () => {
    const fees = [make({ payment: null })];
    expect(applyFeesFilters(fees, { search: "concert", statuses: [] })).toHaveLength(0);
  });

  it("returns everything except annulée when no status filter is set", () => {
    const fees = [make({ id: "a", status: "due" }), make({ id: "b", status: "annulée" })];
    const result = applyFeesFilters(fees, EMPTY_FEES_FILTERS);
    expect(result.map((f) => f.id)).toEqual(["a"]);
  });

  it("includes annulée when explicitly selected in the status filter", () => {
    const fees = [make({ id: "a", status: "due" }), make({ id: "b", status: "annulée" })];
    const result = applyFeesFilters(fees, { search: "", statuses: ["annulée"] });
    expect(result.map((f) => f.id)).toEqual(["b"]);
  });
});

describe("sortFeesByDate", () => {
  it("sorts descending by default (ascending=false)", () => {
    const fees = [
      make({ id: "old", payment: { notes: null, source: "booking", payment_date: "2025-01-01" } }),
      make({ id: "new", payment: { notes: null, source: "booking", payment_date: "2026-01-01" } }),
    ];
    expect(sortFeesByDate(fees, false).map((f) => f.id)).toEqual(["new", "old"]);
  });

  it("sorts ascending when requested", () => {
    const fees = [
      make({ id: "new", payment: { notes: null, source: "booking", payment_date: "2026-01-01" } }),
      make({ id: "old", payment: { notes: null, source: "booking", payment_date: "2025-01-01" } }),
    ];
    expect(sortFeesByDate(fees, true).map((f) => f.id)).toEqual(["old", "new"]);
  });

  it("treats null payment_date as earliest", () => {
    const fees = [
      make({ id: "dated", payment: { notes: null, source: "booking", payment_date: "2026-01-01" } }),
      make({ id: "nodate", payment: null }),
    ];
    expect(sortFeesByDate(fees, true).map((f) => f.id)).toEqual(["nodate", "dated"]);
  });

  it("does not mutate the input array", () => {
    const fees = [
      make({ id: "a", payment: { notes: null, source: "booking", payment_date: "2025-01-01" } }),
      make({ id: "b", payment: { notes: null, source: "booking", payment_date: "2026-01-01" } }),
    ];
    const original = [...fees];
    sortFeesByDate(fees, true);
    expect(fees).toEqual(original);
  });
});
