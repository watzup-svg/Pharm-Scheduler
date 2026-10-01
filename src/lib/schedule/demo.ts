import { daysInMonth, weekdaySun0 } from "./calendar.ts";
import { setCellValue } from "./grid.ts";
import { isOpenDay } from "./place.ts";
import { normalizeTimeOff } from "./pto.ts";
import { blankMonthWithStores } from "./stores.ts";
import { createSample } from "./sample.ts";
import type { Grid, Pattern, Person, ScheduleDoc, SlotId } from "./types.ts";

/**
 * Test month for all 18 pharmacies: October 2026, invented pharmacists, and problems planted on
 * purpose. Nobody here is a real person. The September sample (createSample) is untouched.
 */

const HOME: [string, string][] = [
  ["CAT", "Marisol Quenby"],
  ["CAV", "Theo Brandvold"],
  ["CLA", "Imani Fairweather"],
  ["EST", "Gideon Ashcroft"],
  ["FLO", "Lucia Denton"],
  ["IND", "Bram Okafor"],
  ["LEN", "Petra Lindqvist"],
  ["MOT", "Hollis Grey"],
  ["MOL", "Anders Kowal"],
  ["RR", "Sunita Marlow"],
  ["SCA", "Rafael Ostrander"],
  ["SHE", "Winnie Takata"],
  ["SIL", "Cormac Bell"],
  ["WAL", "Odette Rasmussen"],
  ["WL", "Jasper Lund"],
  ["WS", "Ines Calloway"],
  ["WIN", "Elliot Prewitt"],
  ["WOO", "Yara Bellamy"],
];

const FLOATS: [string, string][] = [
  ["Fenn Ritter", "MOL"],
  ["Greta Voss", "SCA"],
  ["Kip Alder", "WS"],
  ["Lena Sorensen", "IND"],
];

const YEAR = 2026;
const MONTH = 10;

const WA_HOMES = new Set(["CAT", "MOT", "WS", "WIN", "WOO"]);
/** Licences on file. Most are single-state; a few float and cross-border pharmacists hold both. */
const LICENSES: Record<string, string[]> = {
  "Ines Calloway": ["WA", "OR"],
  "Kip Alder": ["OR", "WA"],
  "Lena Sorensen": ["OR", "WA"],
};
const CANT_WORK: Record<string, number[]> = { "Kip Alder": [1] }; // Mondays
/** One license ends soon after the month, so it shows as a heads-up rather than an error. */

/** Invented numbers in the 555-01xx block reserved for fiction. */
function fakePhone(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 100;
  return `(503) 555-01${String(h).padStart(2, "0")}`;
}

function person(name: string, role: Person["role"], home: string): Person {
  return {
    name,
    role,
    home,
    lead: false,
    phone: fakePhone(name),
    color: "",
    licensedStates: LICENSES[name] ?? [WA_HOMES.has(home) ? "WA" : "OR"],
    ...(CANT_WORK[name] ? { unavailableDays: CANT_WORK[name] } : {}),
  };
}

/** Write a name straight into the grid. Used for the planted mistakes, which placeName would refuse. */
function put(grid: Grid, store: string, slot: SlotId, day: number, name: string): Grid {
  return setCellValue(grid, store, slot, day, name);
}

export function createDemo(): ScheduleDoc {
  const base = blankMonthWithStores(createSample());
  const doc: ScheduleDoc = {
    ...base,
    // Silverton usually runs two pharmacists on Saturdays. The manager chooses this per store.
    // Invented four-digit store numbers (1101, 1102 …) so the practice month can show "name stores by number". Real numbers go on the Stores page.
    stores: base.stores.map((st, i) => ({ ...st, number: String(1101 + i), ...(st.code === "SIL" ? { twoPharmacistDays: [6] } : {}) })),
    year: YEAR,
    month: MONTH,
    people: [
      ...HOME.map(([code, name]) => person(name, "Pharmacist", code)),
      ...FLOATS.map(([name, home]) => person(name, "Float Pharmacist", home)),
    ],
    holidays: [
      ...base.holidays,
      { date: "2026-10-12", store: "SCA", label: "Inventory day", repeat: false },
    ],
    timeOff: [],
  };

  // Everyone on their home store on every open day, and the same week as the typical week.
  const days = daysInMonth(YEAR, MONTH);
  let grid: Grid = {};
  const pattern: Pattern = {};
  for (const [code, name] of HOME) {
    for (let wd = 1; wd <= 6; wd++) {
      const open = Array.from({ length: days }, (_, i) => i + 1).some(
        (d) => weekdaySun0(YEAR, MONTH, d) === wd && isOpenDay(doc, code, d),
      );
      if (open) {
        pattern[code] ??= {};
        pattern[code].pharmacist ??= {};
        pattern[code].pharmacist[String(wd)] = name;
      }
    }
    for (let d = 1; d <= days; d++) {
      if (isOpenDay(doc, code, d)) grid = put(grid, code, "pharmacist", d, name);
    }
  }

  const clear = (store: string, days_: number[]) => {
    for (const d of days_) grid = put(grid, store, "pharmacist", d, "");
  };
  const cover = (store: string, day: number, name: string, slot: SlotId = "pharmacist") => {
    grid = put(grid, store, slot, day, name);
  };

  // Time off. Some is covered, some is not, and some is still on the schedule.
  const off = (name: string, dates: number[], note = "") =>
    doc.timeOff.push(
      normalizeTimeOff({
        name,
        dates: dates.map((d) => `${YEAR}-${String(MONTH).padStart(2, "0")}-${String(d).padStart(2, "0")}`),
        note,
      }),
    );

  // Anders (MOL) off the 8th and 9th. The 8th is covered by a float. On the 9th Gideon (EST) was
  // put in his place but is still at Estacada: a double.
  off("Anders Kowal", [8, 9], "Family trip");
  clear("MOL", [8, 9]);
  cover("MOL", 8, "Fenn Ritter"); // float away from home: cover, not an error
  cover("MOL", 9, "Gideon Ashcroft"); // ERROR: also at EST that day

  // Odette (WAL) off the 14th and 15th. The 15th is covered; the 14th is a hole.
  off("Odette Rasmussen", [14, 15]);
  clear("WAL", [14, 15]);
  cover("WAL", 15, "Fenn Ritter");

  // Imani (CLA) off the 19th to 21st. The 19th is covered, the 20th she is still scheduled
  // (yellow, still prints), and the 21st is a hole.
  off("Imani Fairweather", [19, 20, 21], "Conference");
  clear("CLA", [19, 21]);
  cover("CLA", 19, "Kip Alder");

  // Tuesday the 20th: six people off, so fewer pharmacists than open stores.
  off("Theo Brandvold", [20]);
  off("Winnie Takata", [20]);
  off("Bram Okafor", [20]);
  off("Hollis Grey", [20]);
  off("Sunita Marlow", [20]);
  clear("CAV", [20]);
  clear("SHE", [20]);
  clear("IND", [20]);
  clear("MOT", [20]); // hole
  clear("RR", [20]);
  cover("CAV", 20, "Greta Voss");
  cover("SHE", 20, "Fenn Ritter");
  cover("IND", 20, "Lena Sorensen"); // a float at their own home store: not cover
  cover("RR", 20, "Kip Alder");

  // Two requests waiting for a decision. They change nothing on the schedule until approved.
  const req = (name: string, dates: number[], note: string, on: string) =>
    doc.timeOff.push(
      normalizeTimeOff({
        name,
        dates: dates.map((d) => `${YEAR}-${String(MONTH).padStart(2, "0")}-${String(d).padStart(2, "0")}`),
        note,
        status: "requested",
        requestedOn: on,
      }),
    );
  req("Bram Okafor", [27, 28], "Dentist", "2026-09-28");
  req("Gideon Ashcroft", [30], "Wedding", "2026-09-29");

  // Hints, which are not errors. Elliot (WA) is out on the 13th and Fenn, who is licensed in
  // Oregon only, covers Wind River (WA). Kip usually cannot work Mondays and covers Rick's on the
  // 19th (Monday). Lucia (Florence, weekdays only) picks up Estacada's Saturday the 17th, which
  // makes her sixth day that week.
  off("Elliot Prewitt", [13], "Sick day");
  clear("WIN", [13]);
  cover("WIN", 13, "Fenn Ritter");
  cover("EST", 17, "Lucia Denton", "pharmacist2");

  // Planted mistakes that are not time off.
  cover("LEN", 6, "Petra Lindqvist", "pharmacist2"); // ERROR: in both rows of one store
  grid = put(grid, "CAT", "pharmacist", 10, "Marisol Quenby"); // ERROR: Cathlamet is closed Saturdays
  grid = put(grid, "SCA", "pharmacist", 12, "Rafael Ostrander"); // ERROR: inventory day, store closed
  grid = put(grid, "WS", "pharmacist", 18, "Ines Calloway"); // ERROR: a Sunday
  clear("EST", [24]); // hole: nobody on Saturday the 24th
  clear("WOO", [26, 27]); // holes: two days, no time off logged
  cover("WS", 27, "Kip Alder"); // fine on its own...
  cover("RR", 27, "Kip Alder"); // ERROR: ...but Kip is also at Rogue River

  // A busy Saturday with a second pharmacist, which is fine.
  cover("SIL", 10, "Fenn Ritter", "pharmacist2");

  return { ...doc, grid, pattern };
}

export const DEMO_FILE_NAME = "HiSchool_Pharmacy_October_2026_DEMO.hisp.json";
