import { describe, it, expect } from "vitest";
import { addDays, subDays, subMonths, addMonths } from "date-fns";
import { countValidCachets, expiringWithin, nextStatus, previousStatus, buildTimeline } from "../cachets";

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

  it("ignores provisoire/tbc status", () => {
    expect(countValidCachets([make({ status: "provisoire" })])).toBe(0);
    expect(countValidCachets([make({ status: "tbc" })])).toBe(0);
  });

  it("counts facturé and cachet_en_attente like payé when they have an expires_at", () => {
    expect(countValidCachets([make({ status: "facturé" })])).toBe(1);
    expect(countValidCachets([make({ status: "cachet_en_attente" })])).toBe(1);
  });

  it("counts facturé/cachet_en_attente via a 12-month payment_date window when expires_at is null", () => {
    const withinWindow = make({ status: "facturé", expires_at: null, payment_date: past(180) });
    const outsideWindow = make({ status: "cachet_en_attente", expires_at: null, payment_date: past(400) });
    expect(countValidCachets([withinWindow])).toBe(1);
    expect(countValidCachets([outsideWindow])).toBe(0);
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

describe("buildTimeline", () => {
  it("returns points sorted ascending by timestamp", () => {
    const timeline = buildTimeline([make()]);
    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i].ts).toBeGreaterThanOrEqual(timeline[i - 1].ts);
    }
  });

  it("includes an exact point for today", () => {
    const timeline = buildTimeline([make()]);
    const nowTs = Date.now();
    const closest = timeline.reduce((a, b) =>
      Math.abs(b.ts - nowTs) < Math.abs(a.ts - nowTs) ? b : a
    );
    expect(Math.abs(closest.ts - nowTs)).toBeLessThan(2000);
  });

  it("spans from ~13 months ago to ~6 months ahead", () => {
    const timeline = buildTimeline([]);
    const first = timeline[0];
    const last = timeline[timeline.length - 1];
    const thirteenMonthsAgo = subMonths(new Date(), 13).getTime();
    const sixMonthsAhead = addMonths(new Date(), 6).getTime();
    expect(Math.abs(first.ts - thirteenMonthsAgo)).toBeLessThan(24 * 60 * 60 * 1000);
    expect(Math.abs(last.ts - sixMonthsAhead)).toBeLessThan(24 * 60 * 60 * 1000);
  });

  it("counts a currently-valid payé payment as confirmed at today's point", () => {
    const timeline = buildTimeline([
      make({ status: "payé", expires_at: future(30), payment_date: past(30) }),
    ]);
    const nowTs = Date.now();
    const todayPoint = timeline.reduce((a, b) =>
      Math.abs(b.ts - nowTs) < Math.abs(a.ts - nowTs) ? b : a
    );
    expect(todayPoint.confirmed).toBe(1);
    expect(todayPoint.potential).toBe(0);
  });

  it("counts a provisoire payment as potential, not confirmed, at today's point", () => {
    const timeline = buildTimeline([
      make({ status: "provisoire", expires_at: null, payment_date: past(10) }),
    ]);
    const nowTs = Date.now();
    const todayPoint = timeline.reduce((a, b) =>
      Math.abs(b.ts - nowTs) < Math.abs(a.ts - nowTs) ? b : a
    );
    expect(todayPoint.confirmed).toBe(0);
    expect(todayPoint.potential).toBe(1);
  });

  it("deduplicates a batched payment within the same window", () => {
    const timeline = buildTimeline([
      make({
        id: "p1",
        batch_id: "b1",
        batch: { batch_count: 3 },
        status: "payé",
        expires_at: future(30),
        payment_date: past(30),
      }),
      make({
        id: "p2",
        batch_id: "b1",
        batch: { batch_count: 3 },
        status: "payé",
        expires_at: future(30),
        payment_date: past(30),
      }),
    ]);
    const nowTs = Date.now();
    const todayPoint = timeline.reduce((a, b) =>
      Math.abs(b.ts - nowTs) < Math.abs(a.ts - nowTs) ? b : a
    );
    expect(todayPoint.confirmed).toBe(3);
  });
});
