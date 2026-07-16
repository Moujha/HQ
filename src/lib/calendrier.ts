import type { EventLineData } from "@/components/modules/calendrier/EventLine";

export interface ConcertPayment {
  id: string;
  notes: string | null;
  source: string;
  amount: number;
  payment_date: string | null;
  status: "provisoire" | "facturé" | "cachet_en_attente" | "payé" | "tbc";
  event_id: string | null;
}

export const CALENDAR_SOURCES = ["booking", "résidence", "répétition", "figuration"];

// Adapt a standalone booking/résidence payment to the EventLineData shape
export function paymentToCalendarEntry(p: ConcertPayment): EventLineData {
  return {
    id: p.id,
    title: p.notes ?? p.source,
    event_date: p.payment_date!,
    location: null,
    type: p.source === "résidence" ? "résidence" : "concert",
    status: p.status === "provisoire" ? "TBC" : "confirmé",
    payments: [{ id: p.id, status: p.status, amount: p.amount }],
  };
}

export function mergeCalendarItems(
  events: EventLineData[],
  payments: ConcertPayment[]
): EventLineData[] {
  const standaloneConcerts = payments
    .filter(
      (p) =>
        CALENDAR_SOURCES.includes(p.source) &&
        p.event_id === null &&
        p.payment_date !== null
    )
    .map(paymentToCalendarEntry);

  const merged = [...events, ...standaloneConcerts];
  return merged.sort((a, b) => a.event_date.localeCompare(b.event_date));
}

export function computeNextEvent(
  events: EventLineData[],
  payments: ConcertPayment[]
): EventLineData | undefined {
  const today = new Date().toISOString().split("T")[0];
  return mergeCalendarItems(events, payments).find(
    (e) => e.event_date >= today && e.status !== "annulé"
  );
}
