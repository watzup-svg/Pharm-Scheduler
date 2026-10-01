import { DEFAULT_PRINT_PREFS } from "./types.ts";
import type { Grid, ScheduleDoc, SlotId } from "./types.ts";
import { normalizeTimeOff } from "./pto.ts";

function put(grid: Grid, store: string, slot: SlotId, days: number[], name: string) {
  if (!grid[store]) grid[store] = {};
  const row = grid[store][slot] ?? {};
  for (const d of days) row[String(d)] = name;
  grid[store][slot] = row;
}

const WK = [1, 2, 3, 4, 8, 9, 10, 11, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 28, 29, 30];
const EST_OPEN_JANE = [1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 17, 18, 19, 21, 22, 23, 24, 25, 26, 28, 29, 30];
const TOM = [1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 14, 15, 16, 17, 19, 21, 22, 23, 24, 25, 26, 28, 29, 30];
const SCA_OPEN = [1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24, 25, 26, 28, 29, 30];
const WL_OPEN = WK;

export function createSample(): ScheduleDoc {
  const grid: Grid = {};
  put(grid, "EST", "pharmacist", EST_OPEN_JANE, "Jane Smith");
  put(grid, "EST", "pharmacist2", [14, 15], "Susan Brown");

  put(grid, "MOL", "pharmacist", TOM, "Tom Reyes");
  put(grid, "MOL", "pharmacist2", [4], "Jane Smith");
  put(grid, "MOL", "pharmacist2", [18], "Chris Hale");

  put(grid, "SCA", "pharmacist", SCA_OPEN, "Priya Nair");

  put(grid, "WL", "pharmacist", WL_OPEN, "Mark Chen");

  return {
    format: "hischool-schedule",
    version: 2,
    year: 2026,
    month: 9,
    stores: [
      {
        code: "EST",
        name: "Estacada",
        satOpen: true,
        sunOpen: false,
        address: "325 S Broadway St, Estacada, OR 97023",
      },
      {
        code: "MOL",
        name: "Molalla",
        satOpen: true,
        sunOpen: false,
        address: "111 Robbins St, Molalla, OR 97038",
      },
      {
        code: "SCA",
        name: "Scappoose",
        satOpen: true,
        sunOpen: false,
        address: "51601 Columbia River Hwy, Scappoose, OR 97056",
      },
      {
        code: "WL",
        name: "West Linn",
        satOpen: false,
        sunOpen: false,
        address: "22000 Willamette Dr, West Linn, OR 97068",
      },
    ],
    people: [
      { name: "Jane Smith", role: "Pharmacist", home: "EST", lead: false, phone: "", color: "" },
      { name: "Tom Reyes", role: "Pharmacist", home: "MOL", lead: false, phone: "", color: "" },
      { name: "Priya Nair", role: "Pharmacist", home: "SCA", lead: false, phone: "", color: "" },
      { name: "Mark Chen", role: "Pharmacist", home: "WL", lead: false, phone: "", color: "" },
      { name: "Susan Brown", role: "Float Pharmacist", home: "EST", lead: false, phone: "", color: "" },
      { name: "Chris Hale", role: "Float Pharmacist", home: "MOL", lead: false, phone: "", color: "" },
    ],
    holidays: [
      { date: "2026-09-07", store: "ALL", label: "Labor Day", repeat: false },
      { date: "2026-12-25", store: "ALL", label: "Christmas", repeat: true },
    ],
    timeOff: [
      normalizeTimeOff({
        name: "Jane Smith",
        dates: ["2026-09-14", "2026-09-15"],
        note: "SAMPLE — unplaced",
      }),
    ],
    grid,
    pattern: {},
    dayNotes: {},
    printPrefs: { ...DEFAULT_PRINT_PREFS },
  };
}

export const SAMPLE_FILE_NAME = "HiSchool_Pharmacy_September_2026.hisp.json";
