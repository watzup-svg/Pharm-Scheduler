import { z } from "zod";
import { DEFAULT_PRINT_PREFS, SLOT_IDS, type Person, type ScheduleDoc, type SlotId, type TimeOff } from "./types.ts";
import { keepOpenPtoDates, normalizeTimeOff } from "./pto.ts";
import { isRphRole, RPH_SLOTS } from "./slots.ts";

const StoreSchema = z.object({
  code: z.string().min(1).max(8),
  name: z.string().min(1).max(80),
  satOpen: z.boolean(),
  closedWeekdays: z.array(z.number().int().min(1).max(5)).optional(),
  sunOpen: z.boolean(),
  address: z.string().max(160).optional().default(""),
  phone: z.string().max(40).optional(),
  hours: z.string().max(240).optional(),
  holidayNote: z.string().max(240).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  twoPharmacistDays: z.array(z.number().int().min(0).max(6)).optional(),
  number: z.string().max(12).optional(),
});

const PersonSchema = z.object({
  name: z.string().min(1).max(80),
  role: z.enum(["Pharmacist", "Float Pharmacist", "Pharmacy Technician", "Cashier"]),
  home: z.string().min(1).max(8),
  lead: z.boolean(),
  phone: z.string().max(40).optional().default(""),
  color: z.string().max(16).optional().default(""),
  licensedStates: z.array(z.string().max(4)).optional(),
  unavailableDays: z.array(z.number().int().min(0).max(6)).optional(),
  // Both are optional, and blank means "no date": available from the beginning / until further notice.
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  noSuggest: z.boolean().optional(),
});

const HolidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  store: z.string().min(1).max(8),
  label: z.string().max(80),
  repeat: z.boolean(),
  closure: z.boolean().optional(),
});

const TimeOffSchema = z.object({
  name: z.string().min(1).max(80),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal(""))
    .default(""),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal(""))
    .default(""),
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  note: z.string().max(160).optional().default(""),
  status: z.enum(["requested", "approved", "declined"]).optional(),
  requestedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const GridSchema = z.record(
  z.string(),
  z.record(z.string(), z.record(z.string(), z.string())),
);

const PrintPrefsSchema = z
  .object({
    paper: z.enum(["letter", "tabloid"]).optional(),
    typeSize: z.enum(["normal", "large"]).optional(),
    grayscale: z.boolean().optional(),
    twoUp: z.boolean().optional(),
    punch: z.boolean().optional(),
    includeStaff: z.boolean().optional(),
  })
  .optional();

const DocSchema = z.object({
  format: z.literal("hischool-schedule"),
  version: z.union([z.literal(1), z.literal(2)]),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  stores: z.array(StoreSchema),
  people: z.array(PersonSchema),
  holidays: z.array(HolidaySchema),
  timeOff: z.array(TimeOffSchema),
  grid: GridSchema,
  pattern: GridSchema.optional(),
  dayNotes: z.record(z.string(), z.record(z.string(), z.string())).optional(),
  printPrefs: PrintPrefsSchema,
  accepted: z.array(z.object({ key: z.string().min(3).max(140), at: z.string().max(40) })).optional(),
  storeLabels: z.enum(["code", "number"]).optional(),
  driveMinutes: z.record(z.string().max(40), z.number().int().min(1).max(1440)).optional(),
});

function normalizeDoc(raw: z.infer<typeof DocSchema>): ScheduleDoc {
  const people: Person[] = raw.people
    .filter((p, i, all) => all.findIndex((x) => x.name.trim().toLowerCase() === p.name.trim().toLowerCase()) === i)
    .filter((p) => isRphRole(p.role))
    .map((p) => ({
      name: p.name,
      role: p.role,
      home: p.home,
      lead: false,
      phone: p.phone ?? "",
      color: p.color ?? "",
      ...(p.licensedStates?.length ? { licensedStates: p.licensedStates } : {}),
      ...(p.unavailableDays?.length ? { unavailableDays: p.unavailableDays } : {}),
      ...(p.startsOn ? { startsOn: p.startsOn } : {}),
      ...(p.endsOn ? { endsOn: p.endsOn } : {}),
      ...(p.noSuggest ? { noSuggest: true } : {}),
    }));
  const pharmacistNames = new Set(people.map((p) => p.name));
  const grid = stripStaff(raw.grid, pharmacistNames);
  const pattern = stripStaff(raw.pattern ?? {}, pharmacistNames);
  const timeOff: TimeOff[] = raw.timeOff
    .filter((t) => pharmacistNames.has(t.name))
    .map((t) =>
      normalizeTimeOff({
        name: t.name,
        from: t.from,
        to: t.to,
        dates: t.dates,
        note: t.note,
        status: t.status,
        requestedOn: t.requestedOn,
      }),
    );
  const doc: ScheduleDoc = {
    format: "hischool-schedule",
    version: 2,
    year: raw.year,
    month: raw.month,
    // A store code or a person name can only appear once; a repeat in a hand-edited file is dropped.
    stores: raw.stores.filter((s, i, all) => all.findIndex((x) => x.code === s.code) === i).map((s) => ({
      code: s.code,
      name: s.name,
      satOpen: s.satOpen,
      ...(s.closedWeekdays?.length ? { closedWeekdays: s.closedWeekdays } : {}),
      sunOpen: s.sunOpen,
      address: s.address ?? "",
      ...(s.phone ? { phone: s.phone } : {}),
      ...(s.hours ? { hours: s.hours } : {}),
      ...(s.holidayNote ? { holidayNote: s.holidayNote } : {}),
      ...(s.lat != null && s.lng != null ? { lat: s.lat, lng: s.lng } : {}),
      ...(s.twoPharmacistDays?.length ? { twoPharmacistDays: s.twoPharmacistDays } : {}),
      ...(s.number?.trim() ? { number: s.number.trim() } : {}),
    })),
    people,
    holidays: raw.holidays.map((h) => ({ date: h.date, store: h.store, label: h.label, repeat: h.repeat, ...(h.closure ? { closure: true } : {}) })),
    timeOff,
    grid,
    pattern,
    dayNotes: raw.dayNotes ?? {},
    ...(raw.accepted?.length ? { accepted: raw.accepted } : {}),
    ...(raw.storeLabels === "number" ? { storeLabels: "number" as const } : {}),
    ...(raw.driveMinutes && Object.keys(raw.driveMinutes).length ? { driveMinutes: Object.fromEntries(Object.entries(raw.driveMinutes).filter(([k]) => k !== "__proto__")) } : {}),
    printPrefs: {
      paper: raw.printPrefs?.paper ?? DEFAULT_PRINT_PREFS.paper,
      typeSize: raw.printPrefs?.typeSize ?? DEFAULT_PRINT_PREFS.typeSize,
      grayscale: raw.printPrefs?.grayscale ?? DEFAULT_PRINT_PREFS.grayscale,
      twoUp: raw.printPrefs?.twoUp ?? DEFAULT_PRINT_PREFS.twoUp,
      punch: raw.printPrefs?.punch ?? DEFAULT_PRINT_PREFS.punch,
      includeStaff: false,
    },
  };
  // A from–to range (version 1) expands into dates here. Days the home store is closed are dropped,
  // the same as when time off is added by hand. Rows that already list dates are left as saved.
  doc.timeOff = doc.timeOff.map((row, i) => {
    const source = raw.timeOff.filter((t) => pharmacistNames.has(t.name))[i];
    if (source?.dates?.length) return row;
    const { kept } = keepOpenPtoDates(doc, row.name, row.dates);
    return normalizeTimeOff({ name: row.name, dates: kept, note: row.note, status: row.status, requestedOn: row.requestedOn });
  });
  return doc;
}

function stripStaff(
  grid: z.infer<typeof GridSchema>,
  pharmacistNames: Set<string>,
): ScheduleDoc["grid"] {
  const next: ScheduleDoc["grid"] = {};
  for (const store of Object.keys(grid)) {
    const slots = grid[store] ?? {};
    for (const slot of Object.keys(slots)) {
      if (!RPH_SLOTS.includes(slot as SlotId)) continue;
      if (!SLOT_IDS.includes(slot as (typeof SLOT_IDS)[number])) continue;
      const row: Record<string, string> = {};
      for (const [day, name] of Object.entries(slots[slot] ?? {})) {
        if (pharmacistNames.has(name)) row[day] = name;
      }
      if (Object.keys(row).length) {
        next[store] = { ...next[store], [slot]: row };
      }
    }
  }
  return next;
}

export function serializeDoc(doc: ScheduleDoc): string {
  return `${JSON.stringify({ ...doc, version: 2 as const }, null, 2)}\n`;
}

export function parseDoc(text: string): ScheduleDoc {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  const parsed = DocSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("That file is not a Hi-School schedule.");
  }
  return normalizeDoc(parsed.data);
}

type Writable = { write: (data: string) => Promise<void>; close: () => Promise<void> };

export type FileHandle = {
  name: string;
  getFile: () => Promise<File>;
  createWritable: () => Promise<Writable>;
};

function pickerTypes() {
  return [
    {
      description: "Hi-School schedule",
      accept: { "application/json": [".hisp.json", ".json"] },
    },
  ];
}

export async function openLocalFile(): Promise<{
  text: string;
  name: string;
  handle: FileHandle | null;
}> {
  const w = window as Window & {
    showOpenFilePicker?: (opts: unknown) => Promise<FileHandle[]>;
  };
  if (typeof w.showOpenFilePicker === "function") {
    try {
      const [handle] = await w.showOpenFilePicker({
        types: pickerTypes(),
        multiple: false,
      });
      if (handle) {
        const file = await handle.getFile();
        return { text: await file.text(), name: file.name, handle };
      }
    } catch (err) {
      const name = (err as { name?: string }).name;
      if (name === "AbortError") throw err;
    }
  }
  return pickWithInput();
}

function pickWithInput(): Promise<{ text: string; name: string; handle: FileHandle | null }> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".hisp.json,.json,application/json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) {
        reject(Object.assign(new Error("cancelled"), { name: "AbortError" }));
        return;
      }
      resolve({ text: await file.text(), name: file.name, handle: null });
    });
    input.addEventListener("cancel", () => {
      reject(Object.assign(new Error("cancelled"), { name: "AbortError" }));
    });
    input.click();
  });
}

export async function saveLocalFile(
  json: string,
  fileName: string,
  handle: FileHandle | null,
  saveAs: boolean,
): Promise<{ name: string; handle: FileHandle | null }> {
  const w = window as Window & {
    showSaveFilePicker?: (opts: unknown) => Promise<FileHandle>;
  };
  let nextHandle = saveAs ? null : handle;
  if (!nextHandle && typeof w.showSaveFilePicker === "function") {
    try {
      nextHandle = await w.showSaveFilePicker({
        suggestedName: fileName,
        types: pickerTypes(),
      });
    } catch (err) {
      const name = (err as { name?: string }).name;
      if (name === "AbortError") throw err;
      nextHandle = null;
    }
  }
  if (nextHandle) {
    const writable = await nextHandle.createWritable();
    await writable.write(json);
    await writable.close();
    return { name: nextHandle.name || fileName, handle: nextHandle };
  }
  downloadJson(json, fileName);
  return { name: fileName, handle: null };
}

export function downloadText(text: string, fileName: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadJson(json: string, fileName: string) {
  downloadText(json, fileName.endsWith(".json") ? fileName : `${fileName}.hisp.json`, "application/json");
}

export function isAbort(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { name?: string }).name === "AbortError");
}

export const AUTOSAVE_KEY = "hischool-schedule-autosave-v3";

/** Ignore a blank or truncated autosave so it cannot wipe the month into “ready.” */
export function isUsableAutosave(doc: ScheduleDoc): boolean {
  // Stores are enough: a month with stores and nobody placed shows holes, so it can never look "ready".
  return doc.stores.length > 0;
}
