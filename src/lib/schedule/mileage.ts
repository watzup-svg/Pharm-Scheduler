// Mileage pay: when a pharmacist works at a store other than their home store, and that store is more than FREE_MILES from the home
// store, the district manager pays the federal rate for every mile above FREE_MILES, each way. Miles are store to store (the home
// store, not an address). Cost only: nothing here blocks or places anyone; suggestions use it to prefer cheaper moves.
import { pairMiles, type MilesSource } from "./geo.ts";
import type { ScheduleDoc } from "./types.ts";

/** Miles from the home store that are not paid, each way. */
export const FREE_MILES = 20;
/**
 * The federal (IRS) standard business mileage rate, used until the district manager types their own. It changes every year:
 * check it each January at the source below and update it here (or just type the new rate on the Drive times screen).
 */
export const FEDERAL_RATE = {
  dollarsPerMile: 0.725,
  year: 2026,
  effective: "2026-01-01",
  /** IRS news release IR-2025-128, 29 Dec 2025: 72.5 cents a mile for business use of a car in 2026. */
  source: "https://www.irs.gov/newsroom/irs-sets-2026-business-standard-mileage-rate-at-725-cents-per-mile-up-25-cents",
  /** The day this number was last checked against the IRS page. */
  checked: "2026-10-02",
} as const;

/** The rate in use: the manager's own if entered, else the federal rate. */
export const rateOf = (doc: Pick<ScheduleDoc, "mileage">): number => doc.mileage?.rate ?? FEDERAL_RATE.dollarsPerMile;

export type Mileage = {
  /** One-way road miles home store to the store worked, or null when unknown. */
  oneWay: number | null;
  /** Paid miles for the day, both ways: 2 x (oneWay - free), never below 0. Null when the distance is unknown. */
  paidMiles: number | null;
  /** Dollars at the rate in use, or null when the distance is unknown. */
  dollars: number | null;
  source: MilesSource;
};

export const freeMilesOf = (doc: Pick<ScheduleDoc, "mileage">) => doc.mileage?.freeMiles ?? FREE_MILES;

/** Paid miles per day for a one-way distance. */
export function paidMilesFor(oneWay: number, free = FREE_MILES): number {
  return Math.round(2 * Math.max(0, oneWay - free) * 100) / 100;
}

/** What it costs for someone whose home store is `home` to work at `store`. Same store, or no home store: nothing to pay. */
export function mileageFor(doc: Pick<ScheduleDoc, "stores" | "driveMiles" | "mileage">, home: string | null | undefined, store: string): Mileage {
  if (!home || home === "—" || home === store) return { oneWay: 0, paidMiles: 0, dollars: 0, source: "set" };
  const pair = pairMiles(doc, home, store);
  if (pair.miles == null) return { oneWay: null, paidMiles: null, dollars: null, source: "missing" };
  const paid = paidMilesFor(pair.miles, freeMilesOf(doc));
  return { oneWay: pair.miles, paidMiles: paid, dollars: Math.round(paid * rateOf(doc) * 100) / 100, source: pair.source };
}

/** Dollar text, or the miles when no rate is entered. */
export function mileageText(m: Mileage): string {
  if (m.paidMiles == null) return "mileage unknown";
  if (m.paidMiles === 0) return "no mileage";
  const miles = `${Math.round(m.paidMiles * 10) / 10} paid mi`;
  return m.dollars != null ? `$${m.dollars.toFixed(2)} mileage (${miles})` : miles;
}
