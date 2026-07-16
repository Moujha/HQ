import { describe, it, expect } from "vitest";
import { addDays, subDays } from "date-fns";
import {
  computeNextEvent,
  mergeCalendarItems,
  paymentToCalendarEntry,
  type ConcertPayment,
} from "../calendrier";
import type { EventLineData } from "@/components/modules/calendrier/EventLine";

const iso = (d: Date) => d.toISOString().split("T")[0];
const future = (days: number) => iso(addDays(new Date(), days));
const past = (days: number) => iso(subDays(new Date(), days));

const makeEvent = (overrides: Partial<EventLineData> = {}): EventLineData => ({
  id: "e1",
  title: "Concert Test",
  event_date: future(10),
  location: null,
  type: "concert",
  status: "confirmé",
  payments: null,
  ...overrides,
});

const makePayment = (overrides: Partial<ConcertPayment> = {}): ConcertPayment => ({
  id: "p1",
  notes: "Booking Test",
  source: "booking",
  amount: 500,
  payment_date: future(5),
  status: "cachet_en_attente",
  event_id: null,
  ...overrides,
});

describe("paymentToCalendarEntry", () => {
  it("maps provisoire status to TBC", () => {
    expect(paymentToCalendarEntry(makePayment({ status: "provisoire" })).status).toBe("TBC");
  });

  it("maps any other status to confirmé", () => {
    expect(paymentToCalendarEntry(makePayment({ status: "payé" })).status).toBe("confirmé");
  });

  it("uses notes as title, falling back to source", () => {
    expect(paymentToCalendarEntry(makePayment({ notes: "Ma résidence" })).title).toBe("Ma résidence");
    expect(paymentToCalendarEntry(makePayment({ notes: null, source: "booking" })).title).toBe("booking");
  });

  it("marks résidence source as résidence type, everything else as concert", () => {
    expect(paymentToCalendarEntry(makePayment({ source: "résidence" })).type).toBe("résidence");
    expect(paymentToCalendarEntry(makePayment({ source: "booking" })).type).toBe("concert");
  });
});

describe("mergeCalendarItems", () => {
  it("includes standalone concert payments not yet linked to an event", () => {
    const payment = makePayment({ event_id: null, payment_date: future(3) });
    const result = mergeCalendarItems([], [payment]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(payment.id);
  });

  it("excludes payments already linked to an event", () => {
    const payment = makePayment({ event_id: "e1" });
    expect(mergeCalendarItems([], [payment])).toHaveLength(0);
  });

  it("excludes payments outside CALENDAR_SOURCES", () => {
    const payment = makePayment({ source: "label", event_id: null });
    expect(mergeCalendarItems([], [payment])).toHaveLength(0);
  });

  it("excludes payments without a payment_date", () => {
    const payment = makePayment({ payment_date: null, event_id: null });
    expect(mergeCalendarItems([], [payment])).toHaveLength(0);
  });

  it("sorts events and standalone payments together by date ascending", () => {
    const later = makeEvent({ id: "later", event_date: future(20) });
    const sooner = makePayment({ id: "sooner", payment_date: future(2), event_id: null });
    const result = mergeCalendarItems([later], [sooner]);
    expect(result.map((r) => r.id)).toEqual(["sooner", "later"]);
  });
});

describe("computeNextEvent", () => {
  it("returns the earliest future non-annulé event", () => {
    const soon = makeEvent({ id: "soon", event_date: future(2) });
    const later = makeEvent({ id: "later", event_date: future(20) });
    expect(computeNextEvent([later, soon], [])?.id).toBe("soon");
  });

  it("excludes past events", () => {
    const pastEvent = makeEvent({ event_date: past(2) });
    expect(computeNextEvent([pastEvent], [])).toBeUndefined();
  });

  it("excludes annulé events, falling through to the next one", () => {
    const cancelled = makeEvent({ id: "cancelled", event_date: future(1), status: "annulé" });
    const valid = makeEvent({ id: "valid", event_date: future(5) });
    expect(computeNextEvent([cancelled, valid], [])?.id).toBe("valid");
  });

  it("includes a standalone concert payment ahead of a later event", () => {
    const event = makeEvent({ id: "event", event_date: future(20) });
    const payment = makePayment({ id: "payment", payment_date: future(3), event_id: null });
    expect(computeNextEvent([event], [payment])?.id).toBe("payment");
  });

  it("returns undefined when nothing matches", () => {
    expect(computeNextEvent([], [])).toBeUndefined();
  });
});
