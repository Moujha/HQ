import { addDays, addYears, subMonths } from "date-fns";

export interface PaymentForCachets {
  id: string;
  status: "provisoire" | "facturé" | "cachet_en_attente" | "payé" | "tbc" | "annulé";
  counts_for_intermittence: boolean;
  expires_at: string | null;
  payment_date: string | null;
  amount: number;
  hours: number;
  batch_id: string | null;
  batch: { batch_count: number } | null;
}

/**
 * Count valid cachets for intermittence.
 * - Unbatched payment = 1 cachet
 * - Batch: count batch_count once per batch_id (deduplicates multi-payment batches)
 */
function isValidAt(p: PaymentForCachets, date: Date): boolean {
  if (p.status === "tbc" || p.status === "annulé") return false;
  if (!p.counts_for_intermittence) return false;
  if (p.expires_at) return new Date(p.expires_at) > date;
  if (p.payment_date) {
    const pd = new Date(p.payment_date);
    return pd >= subMonths(date, 12) && pd <= date;
  }
  return false;
}

export function countValidCachets(payments: PaymentForCachets[]): number {
  const now = new Date();
  const seenBatches = new Set<string>();
  let total = 0;
  for (const p of payments) {
    if (!isValidAt(p, now)) continue;
    if (p.batch_id == null) {
      total += cachetCountFor(p);
    } else if (!seenBatches.has(p.batch_id)) {
      seenBatches.add(p.batch_id);
      total += cachetCountFor(p);
    }
  }
  return total;
}

export const GOAL_CACHETS = 53;
export const GOAL_HOURS = 507;
export const HOURS_PER_CACHET = 12;

/** Derive cachet count from a payment (batch takes precedence over hours). */
export function cachetCountFor(p: { batch_id: string | null; batch: { batch_count: number } | null; hours: number }): number {
  if (p.batch_id != null) return p.batch?.batch_count ?? 1;
  return Math.max(1, Math.round(p.hours / HOURS_PER_CACHET));
}

/**
 * Sum hours across valid cachets. Each payment carries its own `hours` value.
 * Batched payments multiply hours × batch_count (counted once per batch_id).
 */
export function countValidHours(payments: PaymentForCachets[]): number {
  const now = new Date();
  const valid = payments.filter(
    (p) =>
      p.status !== "tbc" &&
      p.status !== "annulé" &&
      p.counts_for_intermittence &&
      p.expires_at != null &&
      new Date(p.expires_at) > now,
  );

  const seenBatches = new Set<string>();
  let total = 0;
  for (const p of valid) {
    if (p.batch_id == null) {
      total += p.hours;
    } else if (!seenBatches.has(p.batch_id)) {
      seenBatches.add(p.batch_id);
      total += (p.batch?.batch_count ?? 1) * p.hours;
    }
  }
  return total;
}

// ── Projection ────────────────────────────────────────────────

export interface ProjectionResult {
  /** Extra cachets from confirmed pipeline (cachet_en_attente / facturé). */
  confirmedCount: number;
  /** Extra cachets from provisional pipeline (provisoire). */
  provisionalCount: number;
  /** Extra hours from confirmed pipeline. */
  confirmedHours: number;
  /** Extra hours from provisional pipeline. */
  provisionalHours: number;
  /**
   * Date the 53-cachet goal is reached with confirmed cachets only.
   * null = not reachable with current confirmed pipeline.
   */
  confirmedReachDate: Date | null;
  /**
   * Date the goal is reached if all provisional cachets also materialise.
   * null = still not reachable even with all provisional.
   */
  maxReachDate: Date | null;
}

function collectUpcoming(payments: PaymentForCachets[]): {
  confirmed: Array<{ date: Date; count: number; hours: number }>;
  provisional: Array<{ date: Date; count: number; hours: number }>;
} {
  const confirmed: Array<{ date: Date; count: number; hours: number }> = [];
  const provisional: Array<{ date: Date; count: number; hours: number }> = [];
  const seenBatches = new Set<string>();

  for (const p of payments) {
    if (p.status === "payé" || p.status === "annulé") continue;
    if (!p.counts_for_intermittence) continue;
    if (!p.payment_date) continue;

    const isConfirmed = p.status === "cachet_en_attente" || p.status === "facturé";
    const date = new Date(p.payment_date);
    if (!isConfirmed && date <= new Date()) continue;

    let count = 1;
    let hours = p.hours;
    if (p.batch_id != null) {
      if (seenBatches.has(p.batch_id)) continue;
      seenBatches.add(p.batch_id);
      count = p.batch?.batch_count ?? 1;
      hours = p.hours * count;
    }

    const item = { date, count, hours };
    if (isConfirmed) confirmed.push(item);
    else provisional.push(item);
  }

  return { confirmed, provisional };
}

/**
 * Simulate the timeline and return the first date we hit `goal` cachets,
 * accounting for the rolling 12-month expiry window.
 */
function simulateReachDate(
  current: Array<{ expiresAt: Date; count: number }>,
  upcoming: Array<{ date: Date; count: number }>,
  goal: number,
): Date | null {
  const now = new Date();
  const sorted = [...upcoming].sort((a, b) => a.date.getTime() - b.date.getTime());

  if (current.reduce((s, c) => s + c.count, 0) >= goal) return now;

  let active = [...current];

  for (const uc of sorted) {
    active = active.filter((c) => c.expiresAt > uc.date);
    active.push({ expiresAt: addYears(uc.date, 1), count: uc.count });

    if (active.reduce((s, c) => s + c.count, 0) >= goal) return uc.date;
  }

  return null;
}

export function computeProjection(payments: PaymentForCachets[]): ProjectionResult {
  const now = new Date();
  const { confirmed, provisional } = collectUpcoming(payments);

  const currentActive: Array<{ expiresAt: Date; count: number }> = [];
  const seenBatches = new Set<string>();
  for (const p of payments) {
    if (p.status !== "payé" || !p.counts_for_intermittence || !p.expires_at) continue;
    const expiresAt = new Date(p.expires_at);
    if (expiresAt <= now) continue;

    let count = 1;
    if (p.batch_id != null) {
      if (seenBatches.has(p.batch_id)) continue;
      seenBatches.add(p.batch_id);
      count = p.batch?.batch_count ?? 1;
    }
    currentActive.push({ expiresAt, count });
  }

  return {
    confirmedCount: confirmed.reduce((s, c) => s + c.count, 0),
    provisionalCount: provisional.reduce((s, c) => s + c.count, 0),
    confirmedHours: confirmed.reduce((s, c) => s + c.hours, 0),
    provisionalHours: provisional.reduce((s, c) => s + c.hours, 0),
    confirmedReachDate: simulateReachDate(currentActive, confirmed, GOAL_CACHETS),
    maxReachDate: simulateReachDate(
      currentActive,
      [...confirmed, ...provisional],
      GOAL_CACHETS,
    ),
  };
}

export function expiringWithin(
  payments: PaymentForCachets[],
  days: number
): PaymentForCachets[] {
  const now = new Date();
  const limit = addDays(now, days);
  return payments.filter(
    (p) =>
      p.status !== "tbc" &&
      p.status !== "annulé" &&
      p.expires_at != null &&
      new Date(p.expires_at) > now &&
      new Date(p.expires_at) <= limit
  );
}
