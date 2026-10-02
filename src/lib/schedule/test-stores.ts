import type { ScheduleDoc, Store } from "./types.ts";

/**
 * Scappoose (1165) and West Linn (4900) closed for good and are no longer in HI_SCHOOL_STORES. A few fill and cover-plan tests
 * were written around those two locations (a float near Estacada, a far float), so they add them back here as test-only stores.
 */
export const CLOSED_TEST_STORES: Store[] = [
  { code: "SCA", lat: 45.7548, lng: -122.8756, name: "Scappoose Hi-School Pharmacy", address: "33454 SW Chinook Plaza, Scappoose, OR 97056", phone: "(503) 543-6316", hours: "Mon–Fri 9:00 AM–6:00 PM (lunch 12:30–1:30); Sat 9:00 AM–2:00 PM; Sun closed", holidayNote: "No chainwide schedule published; call ahead", satOpen: true, sunOpen: false },
  { code: "WL", lat: 45.3651, lng: -122.6123, name: "West Linn Hi-School Pharmacy", address: "5639 Hood St, West Linn, OR 97068", phone: "(503) 656-0306", hours: "Mon–Fri 9:00 AM–6:00 PM (lunch 12:30–1:30); Sat 9:00 AM–2:00 PM; Sun closed", holidayNote: "No chainwide schedule published; call ahead", satOpen: true, sunOpen: false },
] as Store[];

export function withClosedTestStores(doc: ScheduleDoc): ScheduleDoc {
  return { ...doc, stores: [...doc.stores, ...CLOSED_TEST_STORES.map((s) => ({ ...s }))] };
}
