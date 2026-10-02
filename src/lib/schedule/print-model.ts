import { acceptedItems } from "./accept.ts";
import { storeTag } from "./label.ts";
import { closuresInMonth } from "./closure.ts";
import { shortStoreName } from "./fix.ts";
import { effectiveTimeOff } from "./employment.ts";
import { awayFromHome } from "./dashboard.ts";
import {
  daysInMonth,
  holidayMatches,
  isoDate,
  isStoreOpen,
  monthName,
  pad2,
  weekdaySun0,
  WEEKDAYS,
} from "./calendar.ts";
import { personColorHex } from "./color.ts";
import { daysWorked, postedStamp, storeHoursLine } from "./coverage.ts";
import { covering, saturdaysWorked } from "./dashboard.ts";
import { getCell, namesOnStoreDay } from "./grid.ts";
import { personOnPto } from "./pto.ts";
import { RPH_SLOTS, SLOTS } from "./slots.ts";
import type { ScheduleDoc } from "./types.ts";

export { WEEKDAYS };

export type StoreDayCell = {
  day: number | null;
  closed: boolean;
  /** Why a closed day is closed ("Short-staffed", "Labor Day"). Empty for ordinary Sundays and other weekly closings. */
  reason: string;
  lines: string[];
  note: string;
  nameColors: string[];
};

export type EmployeeDayCell = {
  day: number | null;
  mark: string;
  cover: boolean;
};

export type StorePosterModel = {
  kind: "store";
  code: string;
  /** The store's letters or its number, as chosen for the district. */
  tag: string;
  name: string;
  address: string;
  year: number;
  month: number;
  monthLabel: string;
  weeks: StoreDayCell[][];
  filename: string;
  hours: string;
  posted: string;
  /** The poster changed after it was last printed, so it says "Revised" instead of "Posted". */
  revised?: boolean;
  /** Clean copy: names and days only. */
  clean?: boolean;
};

export type EmployeeCalendarModel = {
  kind: "employee";
  name: string;
  role: string;
  home: string;
  /** The home store as the district names stores (letters or number). */
  homeTag: string;
  days: number;
  saturdays: number;
  phone: string;
  year: number;
  month: number;
  monthLabel: string;
  weeks: EmployeeDayCell[][];
  filename: string;
  posted: string;
  /** Clean copy: store and day only. */
  clean?: boolean;
};

export type DistrictDay = {
  day: number;
  closed: boolean;
  names: string[];
};

export type DistrictSheetModel = {
  kind: "district";
  year: number;
  month: number;
  monthLabel: string;
  filename: string;
  posted: string;
  stores: { code: string; tag: string; name: string; days: DistrictDay[] }[];
  holes: { store: string; tag: string; day: number }[];
  /** Decisions printed at the foot of the district page: accepted problems and stores closed on purpose. */
  exceptions: string[];
  /** Clean copy: no red cells, no list of holes or decisions. */
  clean?: boolean;
};

export type PrintModel = StorePosterModel | EmployeeCalendarModel | DistrictSheetModel;

export function calendarWeeks(year: number, month: number): (number | null)[][] {
  const days = daysInMonth(year, month);
  const lead = weekdaySun0(year, month, 1);
  const cells: (number | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function storePdfName(code: string, year: number, month: number): string {
  return `${code}-${year}-${pad2(month)}.pdf`;
}

export function firstNames(names: string[]): string[] {
  return names.map((n) => n.trim().split(/\s+/)[0] ?? "").filter(Boolean);
}

/** Role, home, days worked, Saturdays, and phone when the person has one. */
export function employeeHeaderMeta(model: EmployeeCalendarModel): string {
  // The role already says "Float Pharmacist", so the home store is just "home 1109".
  const home = model.home === "—" ? "no home" : `home ${model.homeTag}`;
  const bits = [model.role, home, `${model.days} days`, `${model.saturdays} Sat`];
  if (model.phone.trim()) bits.push(model.phone.trim());
  bits.push(`Posted ${model.posted}`);
  return bits.join(" · ");
}

export function employeePdfName(name: string, year: number, month: number): string {
  const slug = name.trim().replace(/\s+/g, "-");
  return `${slug}-${year}-${pad2(month)}.pdf`;
}

export function filledSlotLines(
  doc: ScheduleDoc,
  storeCode: string,
  day: number,
): string[] {
  const lines: string[] = [];
  for (const slot of SLOTS) {
    const name = getCell(doc.grid, storeCode, slot.id, day).trim();
    if (!name) continue;
    lines.push(`${slot.short}: ${name}`);
  }
  return lines;
}

export function posterLines(doc: ScheduleDoc, storeCode: string, day: number): string[] {
  const lines: string[] = [];
  for (const slot of SLOTS) {
    const name = getCell(doc.grid, storeCode, slot.id, day).trim();
    if (!name) continue;
    const home = awayFromHome(doc, name, storeCode);
    lines.push(home ? `${slot.short}: ${name} (from ${storeTag(doc, home)})` : `${slot.short}: ${name}`);
  }
  return lines;
}

function posterColors(doc: ScheduleDoc, storeCode: string, day: number): string[] {
  const colors: string[] = [];
  for (const slot of SLOTS) {
    const name = getCell(doc.grid, storeCode, slot.id, day).trim();
    if (!name) continue;
    const person = doc.people.find((p) => p.name === name);
    colors.push(personColorHex(name, person?.color));
  }
  return colors;
}

export function employeeMark(doc: ScheduleDoc, name: string, day: number): string {
  const hits: string[] = [];
  for (const store of doc.stores) {
    for (const placed of namesOnStoreDay(doc.grid, store.code, day)) {
      if (placed === name) hits.push(store.code);
    }
  }
  if (hits.length >= 2) return "DBL";
  if (hits.length === 1) return hits[0] ?? "OFF";
  const date = isoDate(doc.year, doc.month, day);
  const off = personOnPto(effectiveTimeOff(doc), name, date);
  return off ? "PTO" : "OFF";
}

export function buildStorePoster(doc: ScheduleDoc, code: string): StorePosterModel | null {
  const store = doc.stores.find((s) => s.code === code);
  if (!store) return null;
  const days = daysInMonth(doc.year, doc.month);
  const weeks = calendarWeeks(doc.year, doc.month).map((week) =>
    week.map((day) => {
      if (day == null) return { day: null, closed: false, reason: "", lines: [], note: "", nameColors: [] };
      const open = isStoreOpen(store, doc.year, doc.month, day, days, doc.holidays);
      const note = doc.dayNotes[store.code]?.[String(day)] ?? "";
      if (!open) {
        const h = holidayMatches(doc.holidays, store.code, isoDate(doc.year, doc.month, day));
        return { day, closed: true, reason: h?.label ?? "", lines: ["CLOSED"], note: "", nameColors: [] };
      }
      const lines = posterLines(doc, store.code, day);
      const nameColors = posterColors(doc, store.code, day);
      return { day, closed: false, reason: "", lines, note, nameColors };
    }),
  );
  return {
    kind: "store",
    code: store.code,
    tag: storeTag(doc, store.code),
    name: store.name,
    address: store.address ?? "",
    year: doc.year,
    month: doc.month,
    monthLabel: `${monthName(doc.year, doc.month)} ${doc.year}`,
    weeks,
    filename: storePdfName(store.code, doc.year, doc.month),
    hours: storeHoursLine(store.satOpen, store.sunOpen, store.closedWeekdays),
    posted: postedStamp(),
  };
}

export function buildEmployeeCalendar(
  doc: ScheduleDoc,
  name: string,
): EmployeeCalendarModel | null {
  const person = doc.people.find((p) => p.name === name);
  if (!person) return null;
  const weeks = calendarWeeks(doc.year, doc.month).map((week) =>
    week.map((day) => {
      if (day == null) return { day: null, mark: "", cover: false };
      const raw = employeeMark(doc, person.name, day);
      const isStore = raw !== "DBL" && raw !== "OFF" && raw !== "PTO" && raw !== "";
      const cover = isStore && covering(doc, person.name, raw);
      // The store shows by its letters or its number, whichever the district chose.
      return { day, mark: isStore ? storeTag(doc, raw) : raw, cover };
    }),
  );
  return {
    kind: "employee",
    name: person.name,
    role: person.role,
    home: person.home,
    homeTag: person.home === "—" ? person.home : storeTag(doc, person.home),
    days: daysWorked(doc, person.name),
    saturdays: saturdaysWorked(doc, person.name),
    phone: person.phone ?? "",
    year: doc.year,
    month: doc.month,
    monthLabel: `${monthName(doc.year, doc.month)} ${doc.year}`,
    weeks,
    filename: employeePdfName(person.name, doc.year, doc.month),
    posted: postedStamp(),
  };
}

export function buildDistrictSheet(doc: ScheduleDoc): DistrictSheetModel {
  const days = daysInMonth(doc.year, doc.month);
  const holes: { store: string; tag: string; day: number }[] = [];
  const acceptedList = acceptedItems(doc);
  const acceptedHoles = new Set(acceptedList.filter((a) => a.kind === "hole").map((a) => `${a.store}|${a.day}`));
  const stores = doc.stores.map((store) => {
    const row: DistrictDay[] = [];
    for (let day = 1; day <= days; day++) {
      const closed = !isStoreOpen(store, doc.year, doc.month, day, days, doc.holidays);
      const names = RPH_SLOTS.map((slot) => getCell(doc.grid, store.code, slot, day).trim()).filter(Boolean);
      if (!closed && !names.length) holes.push({ store: store.code, tag: storeTag(doc, store.code), day });
      row.push({ day, closed, names });
    }
    return { code: store.code, tag: storeTag(doc, store.code), name: store.name, days: row };
  });
  return {
    kind: "district",
    year: doc.year,
    month: doc.month,
    monthLabel: `${monthName(doc.year, doc.month)} ${doc.year}`,
    filename: `District-${doc.year}-${pad2(doc.month)}.pdf`,
    posted: postedStamp(),
    stores,
    holes: holes.filter((h) => !acceptedHoles.has(`${h.store}|${h.day}`)),
    exceptions: [
      ...closuresInMonth(doc).map((c) => `${shortStoreName(doc.stores.find((s) => s.code === c.store)?.name ?? c.store)} closed ${monthName(doc.year, doc.month).slice(0, 3)} ${c.day}: ${c.label}`),
      ...acceptedList.map((a) => `${a.label} (left as is)`),
    ],
  };
}

export function packPageCount(
  storeCount: number,
  employeeCount: number,
  twoUp: boolean,
  district = false,
): number {
  const empPages = twoUp ? Math.ceil(employeeCount / 2) : employeeCount;
  return (district ? 1 : 0) + storeCount + empPages;
}

export type PackPage =
  | { id: string; label: string; kicker: string; kind: "store"; model: StorePosterModel }
  | { id: string; label: string; kicker: string; kind: "employee"; model: EmployeeCalendarModel }
  | { id: string; label: string; kicker: string; kind: "district"; model: DistrictSheetModel }
  | {
      id: string;
      label: string;
      kicker: string;
      kind: "twoUp";
      a: EmployeeCalendarModel;
      b: EmployeeCalendarModel;
    };

/** Pages in the same order as the PDF pack: district, stores, then employees. */
export function packPages(models: PrintModel[], twoUp: boolean): PackPage[] {
  const district = models.filter((m): m is DistrictSheetModel => m.kind === "district");
  const stores = models.filter((m): m is StorePosterModel => m.kind === "store");
  const employees = models.filter((m): m is EmployeeCalendarModel => m.kind === "employee");
  const pages: PackPage[] = [];
  for (const d of district) {
    pages.push({
      id: "district",
      label: "District pharmacists",
      kicker: "District one-pager",
      kind: "district",
      model: d,
    });
  }
  for (const s of stores) {
    pages.push({
      id: `store-${s.code}`,
      label: `${s.tag} · ${s.name}`,
      kicker: "Store poster",
      kind: "store",
      model: s,
    });
  }
  if (twoUp) {
    for (let i = 0; i < employees.length; i += 2) {
      const a = employees[i]!;
      const b = employees[i + 1];
      if (b) {
        pages.push({
          id: `two-${a.name}-${b.name}`,
          label: `${a.name} + ${b.name}`,
          kicker: "Two-up letter",
          kind: "twoUp",
          a,
          b,
        });
      } else {
        pages.push({
          id: `emp-${a.name}`,
          label: a.name,
          kicker: "Employee calendar",
          kind: "employee",
          model: a,
        });
      }
    }
  } else {
    for (const e of employees) {
      pages.push({
        id: `emp-${e.name}`,
        label: e.name,
        kicker: "Employee calendar",
        kind: "employee",
        model: e,
      });
    }
  }
  return pages;
}


/** A poster line such as "RPh: Jane Smith (from EST)" split into its parts, so both the page and the PDF can set the name large. */
export function parsePosterLine(line: string): { second: boolean; name: string; away: string } {
  const m = /^(RPh2?):\s*(.*?)(?:\s*\(from ([A-Za-z0-9]+)\))?$/.exec(line);
  if (!m) return { second: false, name: line, away: "" };
  return { second: m[1] === "RPh2", name: m[2] ?? "", away: m[3] ?? "" };
}

/** "OR" or "WA" from a street address, or "". */
export function stateFromAddress(address: string): string {
  return /,\s*([A-Z]{2})(?:\s+\d{5})?\s*$/.exec(address)?.[1] ?? "";
}

/**
 * A clean copy: only who works where, and when. No "from" notes, day notes, closure reasons, "Revised", time off, cover,
 * twice or off marks, and no list of holes or decisions. The facts are the same; the commentary is left off.
 * It changes nothing in the schedule and is not a way around the problem check.
 */
export function cleanModel<T extends PrintModel>(model: T): T {
  if (model.kind === "store") {
    return {
      ...model,
      revised: false,
      clean: true,
      weeks: model.weeks.map((week) =>
        week.map((cell) => ({ ...cell, note: "", reason: "", lines: cell.lines.map((l) => l.replace(/\s*\(from [^)]*\)\s*$/, "")) })),
      ),
    } as T;
  }
  if (model.kind === "employee") {
    return {
      ...model,
      clean: true,
      weeks: model.weeks.map((week) =>
        week.map((cell) => (["DBL", "OFF", "PTO"].includes(cell.mark) ? { ...cell, mark: "", cover: false } : { ...cell, cover: false })),
      ),
    } as T;
  }
  return { ...model, clean: true, holes: [], exceptions: [] } as T;
}
