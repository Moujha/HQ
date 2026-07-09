import { addDays } from "date-fns";

export interface PaymentForCachets {
  id: string;
  status: "provisoire" | "facturé" | "cachet_en_attente" | "payé";
  counts_for_intermittence: boolean;
  expires_at: string | null;
  payment_date: string | null;
  amount: number;
  batch: { batch_count: number } | null;
}

export function countValidCachets(payments: PaymentForCachets[]): number {
  const now = new Date();
  return payments
    .filter(
      (p) =>
        p.status === "payé" &&
        p.counts_for_intermittence &&
        p.expires_at != null &&
        new Date(p.expires_at) > now
    )
    .reduce((sum, p) => sum + (p.batch?.batch_count ?? 1), 0);
}

export function expiringWithin(
  payments: PaymentForCachets[],
  days: number
): PaymentForCachets[] {
  const now = new Date();
  const limit = addDays(now, days);
  return payments.filter(
    (p) =>
      p.status === "payé" &&
      p.expires_at != null &&
      new Date(p.expires_at) > now &&
      new Date(p.expires_at) <= limit
  );
}
