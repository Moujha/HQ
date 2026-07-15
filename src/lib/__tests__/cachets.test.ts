import { describe, it, expect } from "vitest";
import { addDays, subDays } from "date-fns";
import { countValidCachets, expiringWithin, nextStatus, previousStatus } from "../cachets";

const future = (days: number) => addDays(new Date(), days).toISOString().split("T")[0];
const past = (days: number) => subDays(new Date(), days).toISOString().split("T")[0];

type P = Parameters<typeof countValidCachets>[0][number];

const make = (overrides: Partial<P> = {}): P => ({
  id: "x",
  status: "payé",
  counts_for_intermittence: true,
  expires_at: future(30),
  payment_date: "2026-01-01",
  amount: 100,
  hours: 12,
  batch_id: null,
  batch: null,
  ...overrides,
});

describe("countValidCachets", () => {
  it("counts 1 for a valid payé payment", () => {
    expect(countValidCachets([make()])).toBe(1);
  });

  it("ignores non-payé status", () => {
    expect(countValidCachets([make({ status: "provisoire" })])).toBe(0);
    expect(countValidCachets([make({ status: "facturé" })])).toBe(0);
    expect(countValidCachets([make({ status: "cachet_en_attente" })])).toBe(0);
  });

  it("ignores annulé status even with a valid expires_at", () => {
    expect(countValidCachets([make({ status: "annulé" })])).toBe(0);
  });

  it("ignores counts_for_intermittence=false", () => {
    expect(countValidCachets([make({ counts_for_intermittence: false })])).toBe(0);
  });

  it("ignores expired cachets", () => {
    expect(countValidCachets([make({ expires_at: past(1) })])).toBe(0);
  });

  it("ignores null expires_at", () => {
    expect(countValidCachets([make({ expires_at: null })])).toBe(0);
  });

  it("counts batch_count once for a batched payment", () => {
    expect(
      countValidCachets([make({ batch_id: "b1", batch: { batch_count: 5 } })])
    ).toBe(5);
  });

  it("deduplicates multiple payments sharing the same batch_id", () => {
    // Two rows from the same batch → counts batch_count once
    expect(
      countValidCachets([
        make({ id: "p1", batch_id: "b1", batch: { batch_count: 2 } }),
        make({ id: "p2", batch_id: "b1", batch: { batch_count: 2 } }),
      ])
    ).toBe(2);
  });

  it("uses 1 when batch is null", () => {
    expect(countValidCachets([make({ batch_id: null, batch: null })])).toBe(1);
  });

  it("sums across multiple valid payments with different batches", () => {
    expect(
      countValidCachets([
        make({ id: "p1" }),
        make({ id: "p2", batch_id: "b1", batch: { batch_count: 3 } }),
      ])
    ).toBe(4);
  });

  it("returns 0 for empty array", () => {
    expect(countValidCachets([])).toBe(0);
  });
});

describe("expiringWithin", () => {
  it("returns payments expiring within N days", () => {
    const soon = make({ expires_at: future(10) });
    const later = make({ expires_at: future(90) });
    const result = expiringWithin([soon, later], 60);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(soon);
  });

  it("excludes already expired", () => {
    const expired = make({ expires_at: past(1) });
    expect(expiringWithin([expired], 60)).toHaveLength(0);
  });

  it("excludes non-payé", () => {
    const p = make({ status: "provisoire", expires_at: future(10) });
    expect(expiringWithin([p], 60)).toHaveLength(0);
  });

  it("excludes annulé", () => {
    const p = make({ status: "annulé", expires_at: future(10) });
    expect(expiringWithin([p], 60)).toHaveLength(0);
  });

  it("returns empty array when no matches", () => {
    expect(expiringWithin([], 60)).toHaveLength(0);
  });
});

describe("nextStatus / previousStatus", () => {
  it("orders annulé < provisoire < cachet_en_attente < facturé < payé", () => {
    expect(nextStatus("annulé")).toBe("provisoire");
    expect(nextStatus("provisoire")).toBe("cachet_en_attente");
    expect(nextStatus("cachet_en_attente")).toBe("facturé");
    expect(nextStatus("facturé")).toBe("payé");
    expect(nextStatus("payé")).toBe(null);
  });

  it("treats tbc as an alias for provisoire", () => {
    expect(nextStatus("tbc")).toBe("cachet_en_attente");
    expect(previousStatus("tbc")).toBe("annulé");
  });

  it("clamps at both ends", () => {
    expect(nextStatus("payé")).toBe(null);
    expect(previousStatus("annulé")).toBe(null);
  });

  it("previousStatus mirrors nextStatus", () => {
    expect(previousStatus("payé")).toBe("facturé");
    expect(previousStatus("facturé")).toBe("cachet_en_attente");
    expect(previousStatus("cachet_en_attente")).toBe("provisoire");
    expect(previousStatus("provisoire")).toBe("annulé");
  });
});
