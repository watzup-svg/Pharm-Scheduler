import "../lib/safe-storage.ts";
import { AUTOFILE_KEY, archiveNow, backupNow, readAutoFile, readAutosave } from "./persistence.ts";
import { toast } from "sonner";
import { create } from "zustand";
import { loadBackups } from "../lib/schedule/backup.ts";
import { suggestedMonthFileName } from "../lib/schedule/coverage.ts";
import {
  AUTOSAVE_KEY,
  isAbort,
  openLocalFile,
  parseDoc,
  saveLocalFile,
  serializeDoc,
  type FileHandle,
} from "../lib/schedule/file.ts";
import { clearLeftoverDay, clearNameOnStoreDay, holeSteps, keepDouble as keepDoubleFn, storeLabel, weekdayDay, type FixStep } from "../lib/schedule/fix.ts";
import {
  applyPerson,
  applyStore,
  removePersonDoc,
  removeStoreDoc,
} from "../lib/schedule/identity.ts";
import { applyNextMonthPlan, type NextMonthPlan } from "../lib/schedule/next-month.ts";
import { keepOpenPtoDates, normalizeTimeOff, timeOffDates } from "../lib/schedule/pto.ts";
import { driveKey } from "../lib/schedule/geo.ts";
import { duplicateDates } from "../lib/schedule/timeoff-view.ts";
import { createSample, SAMPLE_FILE_NAME } from "../lib/schedule/sample.ts";
import { blankMonthWithStores } from "../lib/schedule/stores.ts";
import { createDemo, DEMO_FILE_NAME } from "../lib/schedule/demo.ts";
import {
  assignRange as assignRangeFn,
  captureFirstWeek,
  clearPatternStore,
  clearRange as clearRangeFn,
  copyPatternStore,
  copyWeekdayColumn,
  fillOpenDaysInSlot,
  setPatternCell,
  stampTypicalWeek,
  stampWeekday as stampWeekdayFn,
  type PlannedPlace,
} from "../lib/schedule/stamp.ts";
import { dropName, type DragPayload } from "../lib/schedule/drag.ts";
import { getCell } from "../lib/schedule/grid.ts";
import { isoDate } from "../lib/schedule/calendar.ts";
import { unlicensedAt } from "../lib/schedule/licence.ts";
import { callInSickDoc } from "../lib/schedule/sick.ts";
import { acceptKeys, openProblemKeys, pruneAccepted, unacceptKeys } from "../lib/schedule/accept.ts";
import { closeStoreDayDoc, reopenStoreDayDoc } from "../lib/schedule/closure.ts";
import { importGridText, type ImportResult } from "../lib/schedule/grid-import.ts";
import { monthKey } from "../lib/schedule/archive.ts";
import { PRINTED_KEY, snapshotOf } from "../lib/schedule/changes.ts";
import type { TimeOffStatus } from "../lib/schedule/types.ts";
import { dropSameStoreRepeats, isOpenDay, placeName, swapCells } from "../lib/schedule/place.ts";
import { applyCoverPlan as applyCoverPlanDoc, type CoverMove } from "../lib/schedule/cover-plan.ts";
import { evaluate } from "../lib/schedule/rules.ts";
import { applyPlaces as applyPlacesFn, clipFromCells, pasteClip as pasteClipFn, type GridClip } from "../lib/schedule/sheet.ts";
import type {
  CellRef,
  DroppedPlacement,
  Evaluation,
  Holiday,
  Person,
  PrintPrefs,
  ScheduleDoc,
  SlotId,
  SlotKind,
  Store,
  TimeOff,
} from "../lib/schedule/types.ts";

function clone<T>(v: T): T {
  return structuredClone(v);
}

const INITIAL_DOC = createSample();

type StoreShape = {
  doc: ScheduleDoc;
  evaluation: Evaluation;
  dirty: boolean;
  fileName: string;
  handle: FileHandle | null;
  undoStack: ScheduleDoc[];
  redoStack: ScheduleDoc[];
  clipboard: string;
  gridClip: GridClip | null;
  lastDrops: DroppedPlacement[];
  lastNewHoles: FixStep[];
  lastMonth: ScheduleDoc | null;
  initials: boolean;
  view: "grid" | "person";
  findName: string;
  lastAutosaveAt: number | null;
  /** When the month was last written out: to a real file, or as a download. */
  lastSavedAt: number | null;
  savedTo: "file" | "download" | null;
  autoFileSave: boolean;
  hydrated: boolean;
};

/** Every document the app holds passes here: a person in both rows of one store-day is cleared down to one, and said. */
function evaluated(raw: ScheduleDoc): { doc: ScheduleDoc; evaluation: Evaluation } {
  const { doc, removed } = dropSameStoreRepeats(raw);
  if (removed.length) {
    const r = removed[0]!;
    const first = `${r.name} was listed twice at ${storeLabel(doc, r.store)} on ${weekdayDay(doc, r.day)}`;
    toast(removed.length === 1 ? `${first}. The second entry was removed.` : `${first}, and ${removed.length - 1} more like it. The second entries were removed.`);
  }
  return { doc, evaluation: evaluate(doc) };
}

function withUndo(
  set: (p: Partial<StoreShape> | ((s: StoreShape) => Partial<StoreShape>)) => void,
  get: () => StoreShape,
  patch: (doc: ScheduleDoc) => ScheduleDoc,
  extra?: Partial<StoreShape>,
) {
  const { doc, undoStack } = get();
  const prev = clone(doc);
  // An accepted problem only stays accepted while the same problem is still there.
  const next = pruneAccepted(patch(clone(doc)));
  set({
    ...evaluated(next),
    dirty: true,
    undoStack: [...undoStack.slice(-49), prev],
    redoStack: [],
    ...extra,
  });
}

export type ScheduleState = {
  doc: ScheduleDoc;
  evaluation: Evaluation;
  dirty: boolean;
  fileName: string;
  handle: FileHandle | null;
  undoStack: ScheduleDoc[];
  redoStack: ScheduleDoc[];
  clipboard: string;
  gridClip: GridClip | null;
  lastDrops: DroppedPlacement[];
  lastNewHoles: FixStep[];
  lastMonth: ScheduleDoc | null;
  initials: boolean;
  view: "grid" | "person";
  findName: string;
  lastAutosaveAt: number | null;
  lastSavedAt: number | null;
  savedTo: "file" | "download" | null;
  autoFileSave: boolean;
  hydrated: boolean;
  setAutoFileSave: (on: boolean) => void;
  /** Write to the open file when there is one and there are unsaved changes. Returns whether it wrote. */
  autoSaveToFile: () => Promise<boolean>;
  restoreBackup: (at: number) => boolean;
  /** Add several pharmacists in one undo step. Names already on the roster are skipped. */
  addPeople: (people: Person[]) => number;
  /** Put names on one store-day in one undo step. Shut days are refused. */
  placeNames: (store: string, day: number, entries: { slot: SlotId; name: string }[]) => "ok" | "shut" | "unlicensed" | "nothing";
  clearLeftovers: (items: { store: string; day: number }[]) => void;
  setYear: (year: number) => void;
  setMonth: (month: number) => void;
  setYearMonth: (year: number, month: number) => void;
  setCell: (store: string, slot: SlotId, day: number, name: string) => void;
  addPerson: (person: Person) => string | null;
  updatePerson: (fromName: string, person: Person) => string | null;
  removePerson: (name: string) => void;
  addStore: (store: Store) => string | null;
  updateStore: (fromCode: string, store: Store) => string | null;
  removeStore: (code: string) => void;
  addHoliday: (holiday: Holiday) => string | null;
  removeHoliday: (index: number) => void;
  addTimeOff: (row: TimeOff) => string | null;
  removeTimeOff: (index: number) => void;
  /** Set (or with null clear) the drive time between two stores, in minutes. One undo step. */
  setDriveMinutes: (a: string, b: string, minutes: number | null) => void;
  setDriveMiles: (a: string, b: string, miles: number | null) => void;
  importDriveMiles: (pairs: Record<string, number>, minutes?: Record<string, number>) => void;
  /** The per-mile rate (null clears it) for mileage pay. */
  setMileageRate: (rate: number | null) => void;
  /** Add the same days for several people in one undo step. Closed days and days already logged are skipped. */
  addTimeOffMany: (input: { names: string[]; dates: string[]; note: string; status: "approved" | "requested" }) => {
    added: number;
    skippedClosed: number;
    skippedDuplicate: number;
    error: string | null;
  };
  /** Change one entry's person, days or note. One undo step. */
  updateTimeOff: (index: number, patch: { name?: string; dates?: string[]; note?: string }) => string | null;
  setTimeOffStatus: (index: number, status: TimeOffStatus) => void;
  /** Log the days as sick time off and take the person off those shifts, in one undo step. */
  callInSick: (name: string, days: number[], note?: string) => void;
  /** Accept problems instead of fixing them (one undo step). Licenses cannot be accepted. */
  acceptProblems: (keys: string[]) => void;
  unacceptProblems: (keys: string[]) => void;
  /** Accept everything that still blocks printing, except licenses. Returns how many. */
  acceptAllOpen: () => number;
  /** Close a store for a day, with a reason that prints on the poster, and take everyone off that day. */
  closeStoreDay: (store: string, day: number, reason: string) => void;
  reopenStoreDay: (store: string, day: number) => void;
  /** Name stores by their letters or by their store number, everywhere. */
  setStoreLabels: (mode: "code" | "number") => void;
  /** Place several names at once (for "Fill the month"), refusing what typing would refuse. One undo step. */
  placeMany: (list: { store: string; slot: SlotId; day: number; name: string }[]) => number;
  /** Apply a cover plan as one undoable step. Returns "ok", or the reason it was refused (nothing changes then). */
  applyCoverPlan: (moves: CoverMove[], day: number, opens?: string[]) => string;
  /** Add holidays in one undo step. Ones already there (same date and store) are skipped. Returns how many were added. */
  addHolidays: (list: Holiday[]) => number;
  /** Paste a spreadsheet block. One undo step. Never overwrites. */
  importGrid: (text: string) => ImportResult;
  /** Open a month kept in this browser (see File, Earlier months). */
  openArchived: (json: string, fileName: string) => boolean;
  /** Remember what was printed, so later changes can be listed. */
  recordPrinted: (stores?: string[]) => void;
  /** Bumps whenever something is recorded as printed, so screens showing print status refresh. */
  printedTick: number;
  openFile: () => Promise<"opened" | "cancelled" | "error">;
  saveFile: (saveAs?: boolean) => Promise<"saved" | "cancelled" | "error">;
  loadSample: () => void;
  /** Every Hi-School pharmacy, same month, nobody placed. Add pharmacists on the People page. */
  startWithAllStores: (target?: { year: number; month: number }) => void;
  /** October 2026 for all 18 pharmacies with invented pharmacists and planted problems. */
  loadDemo: () => void;
  restoreAutosave: () => boolean;
  applyNextMonth: (plan: NextMonthPlan) => void;
  undo: () => void;
  redo: () => void;
  copyName: (name: string) => void;
  copyRange: (cells: CellRef[]) => void;
  cutRange: (cells: CellRef[]) => void;
  pasteClip: (at: CellRef) => DroppedPlacement[];
  pasteInto: (store: string, slot: SlotId, day: number) => void;
  pasteCells: (cells: { ref: CellRef; name: string }[]) => DroppedPlacement[];
  swap: (a: CellRef, b: CellRef) => void;
  applyDrop: (to: CellRef, payload: DragPayload, copy: boolean, range?: CellRef[]) => void;
  applyPlaces: (places: PlannedPlace[], skipPto?: boolean) => DroppedPlacement[];
  stampWeekday: (weekday: number, store?: string, skipPto?: boolean, kinds?: SlotKind[]) => DroppedPlacement[];
  stampWeek: (store?: string, skipPto?: boolean, kinds?: SlotKind[]) => DroppedPlacement[];
  copyColumn: (day: number) => DroppedPlacement[];
  fillSlot: (ref: CellRef, skipPto?: boolean) => DroppedPlacement[];
  captureWeek: (store?: string, kinds?: SlotKind[]) => void;
  copyPattern: (from: string, to: string) => void;
  clearPattern: (store: string) => void;
  setPattern: (store: string, slot: SlotId, weekday: number, name: string) => void;
  setNote: (store: string, day: number, note: string) => void;
  setPrintPrefs: (prefs: Partial<PrintPrefs>) => void;
  clearRange: (cells: CellRef[]) => void;
  assignRange: (cells: CellRef[], name: string, emptyOnly?: boolean, skipPto?: boolean) => DroppedPlacement[];
  dismissDrops: () => void;
  dismissNewHoles: () => void;
  setInitials: (v: boolean) => void;
  setView: (v: "grid" | "person") => void;
  setFindName: (name: string) => void;
  persistAutosave: () => void;
  hydrateFromStorage: () => void;
  clearLeftover: (store: string, day: number) => void;
  keepDouble: (name: string, day: number, keepStore: string) => void;
  clearNameDay: (store: string, day: number, name: string) => void;
};

function blankPerson(person: Person): Person {
  return {
    ...person,
    name: person.name.trim(),
    home: person.home?.trim() || "—",
    lead: person.role === "Pharmacy Technician" ? person.lead : false,
    phone: person.phone?.trim() ?? "",
    color: person.color ?? "",
  };
}

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  ...evaluated(INITIAL_DOC),
  dirty: false,
  printedTick: 0,
  fileName: SAMPLE_FILE_NAME,
  handle: null,
  undoStack: [],
  redoStack: [],
  clipboard: "",
  gridClip: null,
  lastDrops: [],
  lastNewHoles: [],
  lastMonth: null,
  initials: false,
  view: "grid",
  findName: "",
  lastAutosaveAt: null,
  lastSavedAt: null,
  savedTo: null,
  autoFileSave: readAutoFile(),
  hydrated: false,

  setYear: (year) =>
    withUndo(set, get, (doc) => ({ ...doc, year: Math.min(2100, Math.max(2000, year)) })),
  setMonth: (month) =>
    withUndo(set, get, (doc) => ({ ...doc, month: Math.min(12, Math.max(1, month)) })),
  setYearMonth: (year, month) =>
    withUndo(set, get, (doc) => ({
      ...doc,
      year: Math.min(2100, Math.max(2000, year)),
      month: Math.min(12, Math.max(1, month)),
    })),

  setCell: (store, slot, day, name) => {
    withUndo(set, get, (doc) => placeName(doc, store, slot, day, name).doc);
  },

  addPerson: (person) => {
    const next = blankPerson(person);
    if (!next.name) return "Name is required.";
    if (next.name.length > 80) return "Name is too long (80 letters at most).";
    if (!next.home || next.home === "—") return "Choose a home store.";
    if (next.role !== "Pharmacist" && next.role !== "Float Pharmacist") {
      return "Only pharmacists are on this schedule.";
    }
    const { doc } = get();
    if (doc.people.some((p) => p.name.toLowerCase() === next.name.toLowerCase())) {
      return "That name is already on the roster.";
    }
    withUndo(set, get, (d) => ({ ...d, people: [...d.people, next] }));
    return null;
  },

  updatePerson: (fromName, person) => {
    const next = blankPerson(person);
    if (!next.name) return "Name is required.";
    if (!next.home || next.home === "—") return "Choose a home store.";
    if (next.role !== "Pharmacist" && next.role !== "Float Pharmacist") {
      return "Only pharmacists are on this schedule.";
    }
    const { doc } = get();
    if (
      next.name.toLowerCase() !== fromName.toLowerCase() &&
      doc.people.some((p) => p.name.toLowerCase() === next.name.toLowerCase())
    ) {
      return "That name is already on the roster.";
    }
    withUndo(set, get, (d) => applyPerson(d, fromName, next));
    return null;
  },

  removePerson: (name) => {
    withUndo(set, get, (d) => removePersonDoc(d, name));
  },

  addStore: (store) => {
    const code = store.code.trim().toUpperCase();
    const name = store.name.trim();
    if (!code) return "Store code is required.";
    if (!/^[A-Z0-9]{2,6}$/.test(code)) return "Use 2–6 letters or numbers for the code.";
    if (!name) return "Store name is required.";
    const { doc } = get();
    if (doc.stores.some((s) => s.code === code)) return "That code is already used.";
    withUndo(set, get, (d) => ({
      ...d,
      stores: [...d.stores, { ...store, code, name, address: (store.address ?? "").trim() }],
    }));
    return null;
  },

  updateStore: (fromCode, store) => {
    const code = store.code.trim().toUpperCase();
    const name = store.name.trim();
    if (!code) return "Store code is required.";
    if (!/^[A-Z0-9]{2,6}$/.test(code)) return "Use 2–6 letters or numbers for the code.";
    if (!name) return "Store name is required.";
    const { doc } = get();
    if (code !== fromCode && doc.stores.some((s) => s.code === code)) {
      return "That code is already used.";
    }
    withUndo(set, get, (d) =>
      applyStore(d, fromCode, { ...store, code, name, address: (store.address ?? "").trim() }),
    );
    return null;
  },

  removeStore: (code) => {
    withUndo(set, get, (d) => removeStoreDoc(d, code));
  },

  addHoliday: (holiday) => {
    if (!holiday.date) return "Date is required.";
    if (!holiday.store) return "Choose ALL or a store.";
    withUndo(set, get, (d) => ({
      ...d,
      holidays: [...d.holidays, { ...holiday, label: holiday.label.trim() }],
    }));
    return null;
  },

  removeHoliday: (index) => {
    withUndo(set, get, (d) => ({ ...d, holidays: d.holidays.filter((_, i) => i !== index) }));
  },

  addTimeOff: (row) => {
    if (!row.name) return "Choose a person.";
    const { doc } = get();
    const normalized = normalizeTimeOff(row);
    const raw = timeOffDates(normalized);
    if (!raw.length) return "Choose at least one day.";
    const { kept } = keepOpenPtoDates(doc, normalized.name, raw);
    if (!kept.length) return "Those days are closed at their home store.";
    const next = normalizeTimeOff({ ...normalized, dates: kept, note: normalized.note });
    withUndo(set, get, (d) => ({ ...d, timeOff: [...d.timeOff, next] }));
    return null;
  },

  addTimeOffMany: ({ names, dates, note, status }) => {
    const { doc } = get();
    if (!names.length) return { added: 0, skippedClosed: 0, skippedDuplicate: 0, error: "Choose at least one person." };
    if (!dates.length) return { added: 0, skippedClosed: 0, skippedDuplicate: 0, error: "Choose at least one day." };
    const rows: TimeOff[] = [];
    let skippedClosed = 0;
    let skippedDuplicate = 0;
    const today = new Date().toISOString().slice(0, 10);
    for (const name of names) {
      const { kept, skipped } = keepOpenPtoDates(doc, name, dates);
      skippedClosed += skipped.length;
      const dup = new Set(duplicateDates(doc, name, kept));
      skippedDuplicate += dup.size;
      const fresh = kept.filter((d) => !dup.has(d));
      if (!fresh.length) continue;
      rows.push(
        normalizeTimeOff({ name, dates: fresh, note, ...(status === "requested" ? { status: "requested" as const, requestedOn: today } : {}) }),
      );
    }
    if (!rows.length) {
      return {
        added: 0,
        skippedClosed,
        skippedDuplicate,
        error: skippedDuplicate ? "Those days are already logged." : "Those days are closed at their home store.",
      };
    }
    withUndo(set, get, (d) => ({ ...d, timeOff: [...d.timeOff, ...rows] }));
    return { added: rows.length, skippedClosed, skippedDuplicate, error: null };
  },

  updateTimeOff: (index, patch) => {
    const { doc } = get();
    const cur = doc.timeOff[index];
    if (!cur) return "That entry is gone.";
    const name = patch.name ?? cur.name;
    const raw = patch.dates ?? timeOffDates(cur);
    const { kept } = keepOpenPtoDates(doc, name, raw);
    if (!kept.length) return "Those days are closed at their home store.";
    const next = normalizeTimeOff({ ...cur, name, dates: kept, from: undefined, to: undefined, note: patch.note ?? cur.note });
    withUndo(set, get, (d) => ({ ...d, timeOff: d.timeOff.map((t, i) => (i === index ? next : t)) }));
    return null;
  },

  setDriveMinutes: (a, b, minutes) => {
    const key = driveKey(a, b);
    withUndo(set, get, (d) => {
      const next = { ...(d.driveMinutes ?? {}) };
      if (minutes == null) delete next[key];
      else next[key] = Math.max(1, Math.min(1440, Math.round(minutes)));
      const { driveMinutes: _drop, ...rest } = d;
      return Object.keys(next).length ? { ...rest, driveMinutes: next } : rest;
    });
  },

  setDriveMiles: (a, b, miles) => {
    const key = driveKey(a, b);
    withUndo(set, get, (d) => {
      const next = { ...(d.driveMiles ?? {}) };
      if (miles == null) delete next[key];
      else next[key] = Math.max(0.1, Math.min(2000, Math.round(miles * 10) / 10));
      const { driveMiles: _drop, ...rest } = d;
      return Object.keys(next).length ? { ...rest, driveMiles: next } : rest;
    });
  },

  importDriveMiles: (pairs, minutes = {}) => {
    if (!Object.keys(pairs).length && !Object.keys(minutes).length) return;
    withUndo(set, get, (d) => ({
      ...d,
      ...(Object.keys(pairs).length ? { driveMiles: { ...(d.driveMiles ?? {}), ...pairs } } : {}),
      ...(Object.keys(minutes).length ? { driveMinutes: { ...(d.driveMinutes ?? {}), ...minutes } } : {}),
    }));
  },

  setMileageRate: (rate) => {
    withUndo(set, get, (d) => {
      const { mileage: _drop, ...rest } = d;
      const next = { ...(d.mileage ?? {}) };
      if (rate == null) delete next.rate;
      else next.rate = Math.max(0, Math.min(10, Math.round(rate * 1000) / 1000));
      return Object.keys(next).length ? { ...rest, mileage: next } : rest;
    });
  },

  removeTimeOff: (index) => {
    withUndo(set, get, (d) => ({ ...d, timeOff: d.timeOff.filter((_, i) => i !== index) }));
  },

  acceptProblems: (keys) => {
    withUndo(set, get, (d) => acceptKeys(d, keys));
  },

  unacceptProblems: (keys) => {
    withUndo(set, get, (d) => unacceptKeys(d, keys));
  },

  acceptAllOpen: () => {
    const keys = openProblemKeys(get().doc, get().evaluation);
    if (keys.length) withUndo(set, get, (d) => acceptKeys(d, keys));
    return keys.length;
  },

  closeStoreDay: (store, day, reason) => {
    withUndo(set, get, (d) => closeStoreDayDoc(d, store, day, reason));
  },

  setStoreLabels: (mode) => {
    withUndo(set, get, (d) => {
      const { storeLabels: _old, ...rest } = d;
      return mode === "number" ? { ...rest, storeLabels: "number" as const } : rest;
    });
  },

  reopenStoreDay: (store, day) => {
    withUndo(set, get, (d) => reopenStoreDayDoc(d, store, day));
  },

  placeMany: (list) => {
    let placed = 0;
    if (!list.length) return 0;
    withUndo(set, get, (doc) =>
      list.reduce((d, e) => {
        const r = placeName(d, e.store, e.slot, e.day, e.name);
        if (r.ok) placed += 1;
        return r.doc;
      }, doc),
    );
    return placed;
  },

  applyCoverPlan: (moves, day, opens) => {
    const res = applyCoverPlanDoc(get().doc, { moves, opens }, day);
    if (!res.ok) return res.problem ?? "That plan can't be applied";
    withUndo(set, get, () => res.doc);
    return "ok";
  },

  callInSick: (name, days, note) => {
    withUndo(set, get, (d) => callInSickDoc(d, name, days, note));
  },

  setTimeOffStatus: (index, status) => {
    withUndo(set, get, (d) => ({
      ...d,
      timeOff: d.timeOff.map((t, i) => {
        if (i !== index) return t;
        const { status: _drop, ...rest } = t;
        return status === "approved" ? rest : { ...rest, status };
      }),
    }));
  },

  addHolidays: (list) => {
    const have = new Set(get().doc.holidays.map((h) => `${h.date}|${h.store}`));
    const fresh = list.filter((h) => h.date && h.store && !have.has(`${h.date}|${h.store}`));
    if (!fresh.length) return 0;
    withUndo(set, get, (d) => ({ ...d, holidays: [...d.holidays, ...fresh] }));
    return fresh.length;
  },

  importGrid: (text) => {
    const result = importGridText(get().doc, text);
    if (result.placed > 0) withUndo(set, get, () => result.doc);
    return result;
  },

  openArchived: (json, fileName) => {
    try {
      const doc = parseDoc(json);
      backupNow(get().doc, get().fileName, "before-replace");
      set({
        ...evaluated(doc),
        dirty: true,
        fileName,
        handle: null,
        undoStack: [],
        redoStack: [],
        lastMonth: null,
        lastDrops: [],
        lastNewHoles: [],
        hydrated: true,
      });
      return true;
    } catch {
      return false;
    }
  },

  recordPrinted: (stores) => {
    if (typeof localStorage === "undefined") return;
    try {
      const { doc } = get();
      const ym = monthKey(doc.year, doc.month);
      const raw = localStorage.getItem(PRINTED_KEY);
      const all = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      const fresh = snapshotOf(doc, Date.now(), ym);
      const old = all[ym] as { grid?: ScheduleDoc["grid"] } | undefined;
      if (stores && old?.grid) {
        // Only the pages that went out are now "as printed"; the rest keep what they had.
        const grid = { ...old.grid };
        for (const code of stores) if (fresh.grid[code]) grid[code] = fresh.grid[code]!;
        else delete grid[code];
        fresh.grid = grid;
      } else if (stores) {
        fresh.grid = Object.fromEntries(stores.filter((c) => fresh.grid[c]).map((c) => [c, fresh.grid[c]!]));
      }
      all[ym] = fresh;
      localStorage.setItem(PRINTED_KEY, JSON.stringify(all));
      set({ printedTick: get().printedTick + 1 });
    } catch {
      /* a convenience */
    }
  },

  openFile: async () => {
    try {
      const { text, name, handle } = await openLocalFile();
      const doc = parseDoc(text);
      backupNow(get().doc, get().fileName, "before-replace");
      set({
        ...evaluated(doc),
        dirty: false,
        fileName: name,
        handle,
        undoStack: [],
        redoStack: [],
        lastMonth: null,
        lastDrops: [],
        lastNewHoles: [],
        hydrated: true,
      });
      return "opened";
    } catch (err) {
      if (isAbort(err)) return "cancelled";
      return "error";
    }
  },

  saveFile: async (saveAs = false) => {
    const { doc, fileName, handle } = get();
    try {
      const result = await saveLocalFile(serializeDoc(doc), fileName, handle, saveAs);
      set({
        dirty: false,
        fileName: result.name,
        handle: result.handle,
        lastDrops: [],
        lastNewHoles: [],
        lastSavedAt: Date.now(),
        savedTo: result.handle ? "file" : "download",
      });
      backupNow(doc, result.name, "save");
      archiveNow(doc, result.name);
      return "saved";
    } catch (err) {
      if (isAbort(err)) return "cancelled";
      return "error";
    }
  },

  loadSample: () => {
    backupNow(get().doc, get().fileName, "before-replace");
    set({
      ...evaluated(createSample()),
      dirty: false,
      fileName: SAMPLE_FILE_NAME,
      handle: null,
      undoStack: [],
      redoStack: [],
      lastMonth: null,
      lastDrops: [],
      lastNewHoles: [],
      hydrated: true,
    });
  },

  loadDemo: () => {
    backupNow(get().doc, get().fileName, "before-replace");
    set({
      ...evaluated(createDemo()),
      dirty: false,
      fileName: DEMO_FILE_NAME,
      handle: null,
      undoStack: [],
      redoStack: [],
      lastMonth: null,
      lastDrops: [],
      lastNewHoles: [],
      hydrated: true,
    });
  },

  startWithAllStores: (target) => {
    const { doc } = get();
    backupNow(doc, get().fileName, "before-replace");
    // A fresh start names stores by number, as the district manager prefers.
    const blank = { ...blankMonthWithStores(doc), storeLabels: "number" as const };
    const next = target ? { ...blank, year: target.year, month: target.month } : blank;
    set({
      ...evaluated(next),
      dirty: true,
      fileName: suggestedMonthFileName(next.year, next.month),
      handle: null,
      undoStack: [],
      redoStack: [],
      lastMonth: null,
      lastDrops: [],
      lastNewHoles: [],
      hydrated: true,
    });
  },

  restoreAutosave: () => {
    const saved = readAutosave();
    if (!saved) return false;
    backupNow(get().doc, get().fileName, "before-replace");
    set({
      ...evaluated(saved.doc),
      dirty: saved.dirty,
      fileName: saved.fileName,
      handle: null,
      undoStack: [],
      redoStack: [],
      lastMonth: null,
      lastDrops: [],
      lastNewHoles: [],
      lastAutosaveAt: Date.now(),
      hydrated: true,
    });
    return true;
  },

  applyNextMonth: (plan) => {
    const { doc } = get();
    backupNow(doc, get().fileName, "before-replace");
    archiveNow(doc, get().fileName, true);
    const prev = clone(doc);
    withUndo(
      set,
      get,
      (d) => applyNextMonthPlan(d, plan),
      {
        lastMonth: prev,
        lastDrops: plan.dropped,
        fileName: suggestedMonthFileName(plan.year, plan.month),
        handle: null,
      },
    );
    const next = get();
    set({ lastNewHoles: holeSteps(next.doc, next.evaluation) });
  },

  undo: () => {
    const { undoStack, doc, redoStack, dirty } = get();
    const prev = undoStack[undoStack.length - 1];
    if (!prev) return;
    set({
      ...evaluated(prev),
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, clone(doc)],
      dirty: undoStack.length > 1 || dirty,
      lastNewHoles: [],
    });
  },

  redo: () => {
    const { redoStack, doc, undoStack } = get();
    const next = redoStack[redoStack.length - 1];
    if (!next) return;
    set({
      ...evaluated(next),
      redoStack: redoStack.slice(0, -1),
      undoStack: [...undoStack, clone(doc)],
      dirty: true,
      lastNewHoles: [],
    });
  },

  copyName: (name) => set({ clipboard: name, gridClip: null }),

  copyRange: (cells) => {
    const { doc } = get();
    const clip = clipFromCells(doc, cells);
    const named = cells.map((c) => getCell(doc.grid, c.store, c.slot, c.day).trim()).find(Boolean) ?? "";
    set({ clipboard: named, gridClip: clip });
  },

  cutRange: (cells) => {
    const { doc } = get();
    const clip = clipFromCells(doc, cells);
    const named = cells.map((c) => getCell(doc.grid, c.store, c.slot, c.day).trim()).find(Boolean) ?? "";
    set({ clipboard: named, gridClip: clip });
    withUndo(set, get, (d) => clearRangeFn(d, cells));
  },

  pasteClip: (at) => {
    const { gridClip, clipboard } = get();
    let dropped: DroppedPlacement[] = [];
    withUndo(set, get, (doc) => {
      if (gridClip && gridClip.entries.length) {
        const res = pasteClipFn(doc, at, gridClip);
        dropped = res.dropped;
        return res.doc;
      }
      return placeName(doc, at.store, at.slot, at.day, clipboard).doc;
    });
    set({ lastDrops: dropped });
    return dropped;
  },

  pasteInto: (store, slot, day) => {
    const { clipboard } = get();
    withUndo(set, get, (doc) => placeName(doc, store, slot, day, clipboard).doc);
  },

  pasteCells: (cells) => {
    let dropped: DroppedPlacement[] = [];
    withUndo(set, get, (doc) => {
      let next = doc;
      const drops: DroppedPlacement[] = [];
      for (const cell of cells) {
        const placed = placeName(next, cell.ref.store, cell.ref.slot, cell.ref.day, cell.name);
        if (!placed.ok) {
          drops.push({
            name: cell.name,
            store: cell.ref.store,
            slotShort: cell.ref.slot,
            fromDay: cell.ref.day,
            fromWeekday: "",
            occurrence: 0,
            toDay: cell.ref.day,
            toWeekday: "",
            reason: "shut",
          });
        } else next = placed.doc;
      }
      dropped = drops;
      return next;
    });
    set({ lastDrops: dropped });
    return dropped;
  },

  swap: (a, b) => {
    withUndo(set, get, (doc) => swapCells(doc, a, b));
  },

  applyDrop: (to, payload, copy, range = []) => {
    withUndo(set, get, (doc) => dropName(doc, to, payload, copy, range));
  },

  applyPlaces: (places, skipPto) => {
    let dropped: DroppedPlacement[] = [];
    withUndo(set, get, (doc) => {
      const res = applyPlacesFn(doc, places, skipPto);
      dropped = res.dropped;
      return res.doc;
    });
    set({ lastDrops: dropped });
    return dropped;
  },

  stampWeekday: (weekday, store, skipPto, kinds) => {
    let dropped: DroppedPlacement[] = [];
    withUndo(set, get, (doc) => {
      const res = stampWeekdayFn(doc, weekday, store, skipPto, kinds);
      dropped = res.dropped;
      return res.doc;
    });
    set({ lastDrops: dropped });
    return dropped;
  },

  stampWeek: (store, skipPto, kinds) => {
    let dropped: DroppedPlacement[] = [];
    withUndo(set, get, (doc) => {
      const res = stampTypicalWeek(doc, store, skipPto, kinds);
      dropped = res.dropped;
      return res.doc;
    });
    set({ lastDrops: dropped });
    return dropped;
  },

  copyColumn: (day) => {
    let dropped: DroppedPlacement[] = [];
    withUndo(set, get, (doc) => {
      const res = copyWeekdayColumn(doc, day);
      dropped = res.dropped;
      return res.doc;
    });
    set({ lastDrops: dropped });
    return dropped;
  },

  fillSlot: (ref, skipPto) => {
    let dropped: DroppedPlacement[] = [];
    withUndo(set, get, (doc) => {
      const res = fillOpenDaysInSlot(doc, ref, skipPto);
      dropped = res.dropped;
      return res.doc;
    });
    set({ lastDrops: dropped });
    return dropped;
  },

  captureWeek: (store, kinds) => {
    withUndo(set, get, (doc) => ({ ...doc, pattern: captureFirstWeek(doc, store, kinds) }));
  },

  copyPattern: (from, to) => {
    withUndo(set, get, (doc) => ({ ...doc, pattern: copyPatternStore(doc.pattern, from, to) }));
  },

  clearPattern: (store) => {
    withUndo(set, get, (doc) => ({ ...doc, pattern: clearPatternStore(doc.pattern, store) }));
  },

  setPattern: (store, slot, weekday, name) => {
    withUndo(set, get, (doc) => ({
      ...doc,
      pattern: setPatternCell(doc.pattern, store, slot, weekday, name),
    }));
  },

  setNote: (store, day, note) => {
    withUndo(set, get, (doc) => {
      const row = { ...(doc.dayNotes[store] ?? {}) };
      if (note.trim()) row[String(day)] = note.trim();
      else delete row[String(day)];
      return { ...doc, dayNotes: { ...doc.dayNotes, [store]: row } };
    });
  },

  setPrintPrefs: (prefs) => {
    withUndo(set, get, (doc) => ({ ...doc, printPrefs: { ...doc.printPrefs, ...prefs } }));
  },

  clearRange: (cells) => {
    withUndo(set, get, (doc) => clearRangeFn(doc, cells));
  },

  assignRange: (cells, name, emptyOnly, skipPto) => {
    let dropped: DroppedPlacement[] = [];
    withUndo(set, get, (doc) => {
      const res = assignRangeFn(doc, cells, name, emptyOnly, skipPto);
      dropped = res.dropped;
      return res.doc;
    });
    set({ lastDrops: dropped });
    return dropped;
  },

  dismissDrops: () => set({ lastDrops: [] }),
  dismissNewHoles: () => set({ lastNewHoles: [] }),
  setInitials: (v) => set({ initials: v }),
  setView: (v) => set({ view: v }),
  setFindName: (name) => set({ findName: name }),

  persistAutosave: () => {
    const { doc, fileName, dirty, hydrated } = get();
    if (!hydrated) return;
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ doc, fileName, dirty }));
      set({ lastAutosaveAt: Date.now() });
      if (dirty) backupNow(doc, fileName, "autosave");
      archiveNow(doc, fileName, true);
    } catch {
      /* quota */
    }
  },

  hydrateFromStorage: () => {
    if (get().hydrated) return;
    const saved = readAutosave();
    if (!saved) {
      set({ hydrated: true });
      return;
    }
    set({
      ...evaluated(saved.doc),
      dirty: saved.dirty,
      fileName: saved.fileName,
      handle: null,
      undoStack: [],
      redoStack: [],
      lastMonth: null,
      lastDrops: [],
      lastNewHoles: [],
      lastAutosaveAt: Date.now(),
      hydrated: true,
    });
  },

  setAutoFileSave: (on) => {
    try {
      localStorage.setItem(AUTOFILE_KEY, on ? "1" : "0");
    } catch {
      /* ignore */
    }
    set({ autoFileSave: on });
  },

  autoSaveToFile: async () => {
    const { handle, dirty, autoFileSave } = get();
    if (!autoFileSave || !handle || !dirty) return false;
    return (await get().saveFile(false)) === "saved";
  },

  restoreBackup: (at) => {
    if (typeof localStorage === "undefined") return false;
    const found = loadBackups(localStorage).find((b) => b.at === at);
    if (!found) return false;
    try {
      const doc = parseDoc(found.json);
      backupNow(get().doc, get().fileName, "before-replace");
      set({
        ...evaluated(doc),
        dirty: true,
        fileName: found.fileName,
        handle: null,
        undoStack: [],
        redoStack: [],
        lastMonth: null,
        lastDrops: [],
        lastNewHoles: [],
        hydrated: true,
      });
      return true;
    } catch {
      return false;
    }
  },

  placeNames: (store, day, entries) => {
    if (!entries.length) return "nothing";
    if (!isOpenDay(get().doc, store, day)) return "shut";
    if (entries.some((e) => unlicensedAt(get().doc, e.name, store, isoDate(get().doc.year, get().doc.month, day)))) return "unlicensed";
    // Empty the rows being written first, so swapping the two rows of a store-day is not refused as "already here".
    withUndo(set, get, (doc) => entries.reduce((d, e) => placeName(d, store, e.slot, day, e.name).doc, entries.reduce((d, e) => placeName(d, store, e.slot, day, "").doc, doc)));
    return "ok";
  },

  addPeople: (people) => {
    const have = new Set(get().doc.people.map((p) => p.name.toLowerCase()));
    const fresh = people.filter((p) => !have.has(p.name.toLowerCase()));
    if (!fresh.length) return 0;
    withUndo(set, get, (d) => ({ ...d, people: [...d.people, ...fresh.map(blankPerson)] }));
    return fresh.length;
  },

  clearLeftovers: (items) => {
    withUndo(set, get, (doc) => items.reduce((d, it) => clearLeftoverDay(d, it.store, it.day), doc));
  },

  clearLeftover: (store, day) => {
    withUndo(set, get, (doc) => clearLeftoverDay(doc, store, day));
  },

  keepDouble: (name, day, keepStore) => {
    withUndo(set, get, (doc) => keepDoubleFn(doc, name, day, keepStore));
  },

  clearNameDay: (store, day, name) => {
    withUndo(set, get, (doc) => clearNameOnStoreDay(doc, store, day, name));
  },
}));
