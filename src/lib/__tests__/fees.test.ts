import { describe, it, expect } from "vitest";
import { computeResteDu, computeControlRate } from "../fees";

type Fee = Parameters<typeof computeResteDu>[0][number];
type Expense = Parameters<typeof computeResteDu>[1][number];

const makeFee = (overrides: Partial<Fee> = {}): Fee => ({
  id: "f1",
  commission_due: 100,
  status: "due",
  already_paid_to_manager: 0,
  is_commissionable: true,
  ...overrides,
});

const makeExpense = (overrides: Partial<Expense> = {}): Expense => ({
  id: "e1",
  amount: 50,
  status: "à_rembourser",
  ...overrides,
});

describe("computeResteDu", () => {
  it("returns commission_due when no expenses and no payments made", () => {
    expect(computeResteDu([makeFee()], [])).toBe(100);
  });

  it("adds NDF to commission_due", () => {
    expect(computeResteDu([makeFee()], [makeExpense()])).toBe(150);
  });

  it("subtracts already_paid_to_manager", () => {
    expect(computeResteDu([makeFee({ already_paid_to_manager: 40 })], [])).toBe(60);
  });

  it("ignores projetée fees in total", () => {
    const projected = makeFee({ status: "projetée", commission_due: 200 });
    expect(computeResteDu([projected], [])).toBe(0);
  });

  it("ignores versée fees in total", () => {
    const paid = makeFee({ status: "versée", commission_due: 200 });
    expect(computeResteDu([paid], [])).toBe(0);
  });

  it("ignores remboursée expenses", () => {
    const done = makeExpense({ status: "remboursée" });
    expect(computeResteDu([makeFee()], [done])).toBe(100);
  });

  it("returns 0 for empty arrays", () => {
    expect(computeResteDu([], [])).toBe(0);
  });

  it("handles multiple fees and expenses", () => {
    const fees = [makeFee({ commission_due: 80 }), makeFee({ commission_due: 20, already_paid_to_manager: 10 })];
    const expenses = [makeExpense({ amount: 30 }), makeExpense({ amount: 20, status: "remboursée" })];
    // due = 80 + 20 = 100, ndf = 30, paid = 10 → 120
    expect(computeResteDu(fees, expenses)).toBe(120);
  });
});

describe("computeControlRate", () => {
  it("returns proportion of total fees over total encaissé", () => {
    const fees = [makeFee({ commission_due: 15 })];
    expect(computeControlRate(fees, 100)).toBeCloseTo(0.15);
  });

  it("returns 0 when totalEncaisse is 0", () => {
    expect(computeControlRate([makeFee()], 0)).toBe(0);
  });

  it("includes all fees regardless of status", () => {
    const fees = [
      makeFee({ commission_due: 10, status: "due" }),
      makeFee({ commission_due: 5, status: "projetée" }),
    ];
    expect(computeControlRate(fees, 100)).toBeCloseTo(0.15);
  });
});
