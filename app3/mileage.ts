// Mileage pay for one month. Pure: DomainState + "YYYY-MM" in, integer cents out. No clock, no UI.
// Imports are relative (not "@domain") so the tests run with `node --experimental-strip-types --test`.
//
// Rule (DOMAIN_SPEC section 12): for each assignment of a pharmacist away from their base store, take the one-way miles of the
// directed pair base -> store. Pay only when one-way miles are over the free miles:
//   cents = 2 x (one-way miles - free miles) x rate (cents per mile), rate = the entry with the latest effectiveFrom <= the date.
// A missing pair is unknown, never zero: it is listed apart and adds nothing to the totals.
import { cmp } from "../domain/src/dates.ts";
import type { DomainState, ISODate, MileageRate } from "../domain/src/types.ts";

export type Trip = {
  assignmentId: string;
  date: ISODate;
  storeId: string;
  oneWayMiles: number;
  /** Miles over the free miles (one way). 0 when within the free miles. */
  paidOneWayMiles: number;
  rateCents: number;
  cents: number;
};

export type MileageRow = {
  pharmacistId: string;
  name: string;
  baseStoreId: string;
  /** One entry per assignment away from base, date order. */
  trips: Trip[];
  cents: number;
};

export type UnknownTrip = {
  assignmentId: string;
  pharmacistId: string;
  name: string;
  baseStoreId: string | null;
  date: ISODate;
  storeId: string;
  /** miles: no drive pair. rate: no mileage rate in effect on that date. base: the pharmacist has no base store. */
  reason: "miles" | "rate" | "base";
};

export type MileageReport = {
  month: string;
  freeMiles: number;
  rows: MileageRow[];
  unknown: UnknownTrip[];
  totals: { cents: number; trips: number; unknown: number };
};

/** The rate with the latest effectiveFrom <= date; a later array entry wins a tie. undefined when none applies yet. */
export function rateOn(rates: readonly MileageRate[], date: ISODate): MileageRate | undefined {
  let best: MileageRate | undefined;
  for (const r of rates) if (r.effectiveFrom <= date && (!best || r.effectiveFrom >= best.effectiveFrom)) best = r;
  return best;
}

/** Round-trip pay in whole cents for one trip. 0 unless one-way miles exceed the free miles. */
export function tripCents(oneWayMiles: number, freeMiles: number, centsPerMile: number): number {
  if (!(oneWayMiles > freeMiles)) return 0;
  return Math.round(2 * (oneWayMiles - freeMiles) * centsPerMile + 1e-9);
}

export function mileageReport(state: DomainState, month: string): MileageReport {
  const free = state.config.mileageFreeMiles;
  const prefix = `${month}-`;
  const list = Object.values(state.assignments)
    .filter((a) => a.date.startsWith(prefix))
    .sort((a, b) => cmp(a.date, b.date) || cmp(a.storeId, b.storeId) || cmp(a.id, b.id));
  const byPh = new Map<string, MileageRow>();
  const unknown: UnknownTrip[] = [];
  for (const a of list) {
    const ph = state.pharmacists[a.pharmacistId];
    if (!ph) continue;
    const base = ph.baseStoreId;
    const gap = (reason: UnknownTrip["reason"]) => unknown.push({ assignmentId: a.id, pharmacistId: ph.id, name: ph.name, baseStoreId: base, date: a.date, storeId: a.storeId, reason });
    if (!base) { gap("base"); continue; }
    if (base === a.storeId) continue; // worked at home: nothing to pay
    const pair = state.travel[`${base}|${a.storeId}`];
    if (!pair) { gap("miles"); continue; }
    const rate = rateOn(state.config.mileageRates, a.date);
    if (!rate) { gap("rate"); continue; }
    const cents = tripCents(pair.miles, free, rate.centsPerMile);
    const row = byPh.get(ph.id) ?? { pharmacistId: ph.id, name: ph.name, baseStoreId: base, trips: [], cents: 0 };
    row.trips.push({
      assignmentId: a.id, date: a.date, storeId: a.storeId, oneWayMiles: pair.miles,
      paidOneWayMiles: Math.max(0, pair.miles - free), rateCents: rate.centsPerMile, cents,
    });
    row.cents += cents;
    byPh.set(ph.id, row);
  }
  const rows = [...byPh.values()].sort((a, b) => cmp(a.name, b.name) || cmp(a.pharmacistId, b.pharmacistId));
  unknown.sort((a, b) => cmp(a.name, b.name) || cmp(a.date, b.date) || cmp(a.storeId, b.storeId) || cmp(a.assignmentId, b.assignmentId));
  return {
    month, freeMiles: free, rows, unknown,
    totals: { cents: rows.reduce((n, r) => n + r.cents, 0), trips: rows.reduce((n, r) => n + r.trips.length, 0), unknown: unknown.length },
  };
}

/** "$12.34" from integer cents. */
export function dollars(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const c = Math.abs(Math.round(cents));
  return `${sign}$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
}

const csvCell = (v: string | number): string => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One line per trip, then the trips that cannot be priced (blank miles or rate, never 0), then the total. */
export function mileageCsv(state: DomainState, report: MileageReport): string {
  const code = (id: string | null) => (id ? state.stores[id]?.code ?? id : "");
  const line = (cells: (string | number)[]) => cells.map(csvCell).join(",");
  const out: string[] = [line(["Pharmacist", "Base store", "Date", "Store", "One-way miles", "Free miles", "Rate (cents per mile)", "Pay", "Note"])];
  for (const r of report.rows) {
    for (const t of r.trips) {
      out.push(line([r.name, code(r.baseStoreId), t.date, code(t.storeId), t.oneWayMiles, report.freeMiles, t.rateCents, (t.cents / 100).toFixed(2), t.cents === 0 ? "Within free miles" : ""]));
    }
  }
  for (const u of report.unknown) {
    const note = u.reason === "miles" ? "Miles not known" : u.reason === "rate" ? "No mileage rate for this date" : "No base store";
    out.push(line([u.name, code(u.baseStoreId), u.date, code(u.storeId), "", report.freeMiles, "", "", note]));
  }
  out.push(line(["Total", "", "", "", "", "", "", (report.totals.cents / 100).toFixed(2), report.totals.unknown ? `${report.totals.unknown} not counted` : ""]));
  return out.join("\n");
}
