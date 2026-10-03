import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { loadBackups } from "../lib/schedule/backup.ts";
import { AUTOSAVE_KEY } from "../lib/schedule/file.ts";
import { getCell, setCellValue } from "../lib/schedule/grid.ts";
import { evaluate, issueKey } from "../lib/schedule/rules.ts";
import { createSample, SAMPLE_FILE_NAME } from "../lib/schedule/sample.ts";
import { isoDate } from "../lib/schedule/calendar.ts";
import { namePlacements } from "../lib/schedule/coverage.ts";
import { entriesOf, summarize } from "../lib/schedule/timeoff-view.ts";
import { getPatternCell } from "../lib/schedule/stamp.ts";
import { useScheduleStore } from "./schedule-store.ts";

function ensureLocalStorage() {
  if (typeof globalThis.localStorage !== "undefined") return;
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => {
      data.set(k, String(v));
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
}

ensureLocalStorage();

function resetStore() {
  const doc = createSample();
  localStorage.clear();
  useScheduleStore.setState({
    doc,
    evaluation: evaluate(doc),
    dirty: false,
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
    hydrated: false,
  });
}

describe("schedule store", () => {
  beforeEach(() => {
    resetStore();
  });

  it("hydrate ignores a blank autosave and keeps the sample hole and double", () => {
    const empty = { ...createSample(), stores: [] as const, people: [] as const, grid: {} };
    localStorage.setItem(
      AUTOSAVE_KEY,
      JSON.stringify({ doc: empty, fileName: "blank.hisp.json", dirty: false }),
    );
    useScheduleStore.getState().hydrateFromStorage();
    const s = useScheduleStore.getState();
    assert.equal(s.hydrated, true);
    assert.ok(s.doc.people.length > 0);
    assert.equal(getCell(s.doc.grid, "EST", "pharmacist", 1), "Jane Smith");
    assert.equal(getCell(s.doc.grid, "EST", "pharmacist", 16), "");
    assert.equal(s.evaluation.holes, 1);
    assert.equal(s.evaluation.doubles, 1);
    assert.equal(s.evaluation.staffClosed, 0);
    assert.equal(s.evaluation.closed, 0);
    assert.equal(s.evaluation.ready, false);
    assert.equal(s.fileName, SAMPLE_FILE_NAME);
  });

  it("hydrate ignores a leftover v2 autosave key", () => {
    const empty = { ...createSample(), stores: [] as const, people: [] as const, grid: {} };
    localStorage.setItem(
      "hischool-schedule-autosave-v2",
      JSON.stringify({ doc: empty, fileName: "old.hisp.json", dirty: false }),
    );
    useScheduleStore.getState().hydrateFromStorage();
    const s = useScheduleStore.getState();
    assert.equal(s.hydrated, true);
    assert.equal(getCell(s.doc.grid, "EST", "pharmacist", 1), "Jane Smith");
    assert.equal(s.evaluation.holes, 1);
    assert.equal(s.evaluation.staffClosed, 0);
  });

  it("undo after clear leftover restores Mark", () => {
    const base = createSample();
    const seeded = {
      ...base,
      grid: setCellValue(base.grid, "WL", "pharmacist", 5, "Mark Chen"),
    };
    useScheduleStore.setState({ doc: seeded, evaluation: evaluate(seeded) });
    const store = useScheduleStore.getState();
    assert.equal(getCell(store.doc.grid, "WL", "pharmacist", 5), "Mark Chen");
    assert.equal(store.evaluation.byKey[issueKey("WL", 5)]?.leftover, true);
    store.clearLeftover("WL", 5);
    const cleared = useScheduleStore.getState();
    assert.equal(getCell(cleared.doc.grid, "WL", "pharmacist", 5), "");
    assert.equal(cleared.evaluation.byKey[issueKey("WL", 5)]?.leftover, false);
    cleared.undo();
    const restored = useScheduleStore.getState();
    assert.equal(getCell(restored.doc.grid, "WL", "pharmacist", 5), "Mark Chen");
    assert.equal(restored.evaluation.byKey[issueKey("WL", 5)]?.leftover, true);
  });

  it("delete person via the store strips the grid", () => {
    useScheduleStore.getState().removePerson("Susan Brown");
    const s = useScheduleStore.getState();
    assert.equal(s.doc.people.some((p) => p.name === "Susan Brown"), false);
    assert.equal(getCell(s.doc.grid, "EST", "pharmacist2", 14), "");
    assert.equal(getCell(s.doc.grid, "EST", "pharmacist", 1), "Jane Smith");
  });

  it("recode store via the store moves pattern and dayNotes", () => {
    const store = useScheduleStore.getState();
    store.setPattern("EST", "pharmacist", 1, "Jane Smith");
    store.setNote("EST", 1, "flu clinic");
    store.updateStore("EST", {
      code: "ESTA",
      name: "Estacada",
      satOpen: true,
      sunOpen: false,
      address: "325 S Broadway St, Estacada, OR 97023",
    });
    const s = useScheduleStore.getState();
    assert.equal(s.doc.stores.some((x) => x.code === "EST"), false);
    assert.ok(s.doc.grid.ESTA);
    assert.equal(s.doc.grid.EST, undefined);
    assert.equal(getPatternCell(s.doc.pattern, "ESTA", "pharmacist", 1), "Jane Smith");
    assert.equal(s.doc.pattern.EST, undefined);
    assert.equal(s.doc.dayNotes.ESTA?.["1"], "flu clinic");
    assert.equal(s.doc.people.find((p) => p.name === "Jane Smith")?.home, "ESTA");
    assert.equal(s.doc.people.find((p) => p.name === "Susan Brown")?.home, "ESTA");
    assert.equal(s.evaluation.byKey[issueKey("ESTA", 20)]?.leftover, false);
  });

  it("applyDrop move is one undo and does not auto-fill other holes", () => {
    const store = useScheduleStore.getState();
    store.applyDrop(
      { store: "EST", slot: "pharmacist", day: 16 },
      { name: "Jane Smith", from: { store: "EST", slot: "pharmacist", day: 1 } },
      false,
    );
    const moved = useScheduleStore.getState();
    assert.equal(getCell(moved.doc.grid, "EST", "pharmacist", 16), "Jane Smith");
    assert.equal(getCell(moved.doc.grid, "EST", "pharmacist", 1), "");
    assert.equal(getCell(moved.doc.grid, "EST", "pharmacist", 2), "Jane Smith");
    assert.equal(moved.undoStack.length, 1);
    moved.undo();
    const restored = useScheduleStore.getState();
    assert.equal(getCell(restored.doc.grid, "EST", "pharmacist", 16), "");
    assert.equal(getCell(restored.doc.grid, "EST", "pharmacist", 1), "Jane Smith");
  });

  it("cut then paste a pharmacist block as a rectangle", () => {
    const store = useScheduleStore.getState();
    const cells = [
      { store: "EST" as const, slot: "pharmacist" as const, day: 1 },
      { store: "EST" as const, slot: "pharmacist" as const, day: 2 },
    ];
    store.cutRange(cells);
    assert.equal(getCell(useScheduleStore.getState().doc.grid, "EST", "pharmacist", 1), "");
    // Jane already works row 1 on the 8th and 9th; empty it so the paste is not refused as "already here".
    for (const day of [8, 9]) store.setCell("EST", "pharmacist", day, "");
    store.pasteClip({ store: "EST", slot: "pharmacist2", day: 8 });
    const next = useScheduleStore.getState();
    assert.equal(getCell(next.doc.grid, "EST", "pharmacist2", 8), "Jane Smith");
    assert.equal(getCell(next.doc.grid, "EST", "pharmacist2", 9), "Jane Smith");
    assert.equal(getCell(next.doc.grid, "EST", "pharmacist", 1), "");
    assert.equal(getCell(next.doc.grid, "EST", "pharmacist", 16), "");
  });

  it("clears every closed-day name in one undo step, and never invents a placement", () => {
    const st = useScheduleStore.getState();
    st.loadDemo();
    const before = useScheduleStore.getState();
    assert.equal(before.evaluation.closed, 3);
    const items = before.evaluation.issues.filter((i) => i.leftover).map((i) => ({ store: i.store, day: i.day }));
    const filled = Object.values(before.doc.grid).flatMap((g) => Object.values(g ?? {})).reduce((n, row) => n + Object.keys(row ?? {}).length, 0);
    before.clearLeftovers(items);
    const after = useScheduleStore.getState();
    assert.equal(after.evaluation.closed, 0);
    assert.equal(after.evaluation.holes, before.evaluation.holes); // shut days are not holes
    const filledAfter = Object.values(after.doc.grid).flatMap((g) => Object.values(g ?? {})).reduce((n, row) => n + Object.keys(row ?? {}).length, 0);
    assert.equal(filledAfter, filled - 3);
    after.undo();
    assert.equal(useScheduleStore.getState().evaluation.closed, 3);
  });

  it("backs the month up before loading something over it, and restores it", () => {
    const st = useScheduleStore.getState();
    assert.equal(loadBackups(localStorage).length, 0);
    st.loadDemo();
    const list = loadBackups(localStorage);
    assert.equal(list.length, 1);
    assert.equal(list[0]!.reason, "before-replace");
    assert.equal(list[0]!.month, 9); // the sample that was replaced
    assert.equal(useScheduleStore.getState().doc.month, 10);
    assert.equal(useScheduleStore.getState().restoreBackup(list[0]!.at), true);
    assert.equal(useScheduleStore.getState().doc.month, 9);
    assert.equal(useScheduleStore.getState().evaluation.holes, 1);
    assert.equal(loadBackups(localStorage).length >= 2, true); // and the demo was kept too
  });

  it("a month with stores but no people survives a reload", () => {
    const st = useScheduleStore.getState();
    st.startWithAllStores();
    st.persistAutosave();
    useScheduleStore.setState({ hydrated: false, dirty: false });
    useScheduleStore.getState().hydrateFromStorage();
    assert.equal(useScheduleStore.getState().doc.stores.length, 16);
    assert.equal(useScheduleStore.getState().doc.people.length, 0);
  });

  it("save records when and where it went, and keeps a backup", async () => {
    const st = useScheduleStore.getState();
    st.setCell("EST", "pharmacist", 16, "Susan Brown");
    assert.equal(useScheduleStore.getState().dirty, true);
    (globalThis as { window?: unknown }).window = { showSaveFilePicker: undefined };
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ click() {}, remove() {}, set href(_v: string) {}, set download(_v: string) {} }),
      body: { appendChild() {} },
    };
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => "blob:x";
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};
    const res = await useScheduleStore.getState().saveFile(false);
    assert.equal(res, "saved");
    const after = useScheduleStore.getState();
    assert.equal(after.dirty, false);
    assert.equal(after.savedTo, "download");
    assert.ok(after.lastSavedAt && after.lastSavedAt > 0);
    assert.equal(loadBackups(localStorage).some((b) => b.reason === "save"), true);
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { document?: unknown }).document;
  });

  it("starts a blank month for a chosen month, not just the open one", () => {
    useScheduleStore.getState().startWithAllStores({ year: 2026, month: 11 });
    const st = useScheduleStore.getState();
    assert.equal(st.doc.month, 11);
    assert.equal(st.doc.stores.length, 16);
    assert.match(st.fileName, /November_2026/);
  });
});

describe("schedule store: newer actions", () => {
  beforeEach(() => {
    resetStore();
  });

  it("callInSick is one undo step: the days are logged and the shifts left open, then all of it comes back", () => {
    const s = useScheduleStore;
    const who = getCell(s.getState().doc.grid, "EST", "pharmacist", 1) || getCell(s.getState().doc.grid, "EST", "pharmacist", 2);
    const day = getCell(s.getState().doc.grid, "EST", "pharmacist", 1) ? 1 : 2;
    assert.ok(who);
    const before = JSON.stringify(s.getState().doc);
    s.getState().callInSick(who, [day]);
    assert.equal(getCell(s.getState().doc.grid, "EST", "pharmacist", day), "");
    assert.ok(s.getState().doc.timeOff.some((t) => t.name === who && t.note === "Called in sick"));
    s.getState().undo();
    assert.equal(JSON.stringify(s.getState().doc), before);
  });

  it("addHolidays skips repeats and is one undo step", () => {
    const s = useScheduleStore;
    const rows = [
      { date: "2026-09-07", store: "ALL", label: "Labor Day", repeat: false },
      { date: "2026-11-26", store: "ALL", label: "Thanksgiving", repeat: false },
    ];
    const n1 = s.getState().addHolidays(rows);
    const n2 = s.getState().addHolidays(rows);
    assert.equal(n2, 0);
    assert.ok(n1 >= 1);
    const undos = s.getState().undoStack.length;
    s.getState().undo();
    assert.equal(s.getState().undoStack.length, undos - 1);
    assert.equal(s.getState().doc.holidays.some((h) => h.label === "Thanksgiving"), false);
  });

  it("rejecting approved time off leaves the schedule alone and undo restores it", () => {
    const s = useScheduleStore;
    s.getState().addTimeOff({ name: s.getState().doc.people[0]!.name, dates: ["2026-09-09"], from: "2026-09-09", to: "2026-09-09", note: "" });
    const i = s.getState().doc.timeOff.length - 1;
    const grid = s.getState().doc.grid;
    s.getState().setTimeOffStatus(i, "declined");
    assert.equal(s.getState().doc.timeOff[i]!.status, "declined");
    assert.deepEqual(s.getState().doc.grid, grid);
    s.getState().undo();
    assert.equal(s.getState().doc.timeOff[i]!.status, undefined);
  });

  it("approving and declining a request only changes its status", () => {
    const s = useScheduleStore;
    s.getState().addTimeOff({ name: s.getState().doc.people[0]!.name, dates: ["2026-09-08"], from: "2026-09-08", to: "2026-09-08", note: "", status: "requested", requestedOn: "2026-09-01" });
    const i = s.getState().doc.timeOff.length - 1;
    assert.equal(s.getState().doc.timeOff[i]!.status, "requested");
    s.getState().setTimeOffStatus(i, "approved");
    assert.equal(s.getState().doc.timeOff[i]!.status, undefined);
    s.getState().setTimeOffStatus(i, "declined");
    assert.equal(s.getState().doc.timeOff[i]!.status, "declined");
  });

  it("Undo approval returns an approved entry to Requests, stops it counting, and moves nobody", () => {
    const s = useScheduleStore;
    const doc0 = s.getState().doc;
    const placed = doc0.people.map((p) => ({ p, hits: namePlacements(doc0, p.name) })).find((x) => x.hits.length)!;
    const day = placed.hits[0]!.day;
    const date = isoDate(doc0.year, doc0.month, day);
    s.getState().addTimeOff({ name: placed.p.name, dates: [date], from: date, to: date, note: "", requestedOn: date });
    const i = s.getState().doc.timeOff.length - 1;
    assert.ok(summarize(s.getState().doc).stillScheduled >= 1, "approved time off flags the placed shift");
    assert.equal(summarize(s.getState().doc).waiting, 0);
    const gridBefore = JSON.stringify(s.getState().doc.grid);
    s.getState().setTimeOffStatus(i, "requested");
    const d = s.getState().doc;
    assert.equal(d.timeOff[i]!.status, "requested");
    assert.equal(summarize(d).stillScheduled, 0, "no longer counts, so the warning clears");
    assert.equal(summarize(d).waiting, 1, "it is back on Requests");
    assert.equal(JSON.stringify(d.grid), gridBefore, "nobody is moved");
    assert.equal(d.timeOff.length, i + 1, "not removed");
  });

  it("Sick is recorded as approved and appears in the time off list", () => {
    const s = useScheduleStore;
    const doc0 = s.getState().doc;
    const placed = doc0.people.map((p) => ({ p, hits: namePlacements(doc0, p.name) })).find((x) => x.hits.length)!;
    s.getState().callInSick(placed.p.name, [placed.hits[0]!.day]);
    const e = entriesOf(s.getState().doc).find((x) => x.t.name === placed.p.name && /sick/i.test(x.t.note));
    assert.ok(e, "listed");
    assert.equal(e!.status, "approved");
    s.getState().setTimeOffStatus(e!.index, "requested");
    assert.equal(entriesOf(s.getState().doc).find((x) => x.index === e!.index)!.status, "requested");
  });

  it("automatic archive copies never keep the sample or practice month", () => {
    const s = useScheduleStore;
    s.setState({ hydrated: true });
    s.getState().persistAutosave();
    assert.equal(localStorage.getItem("hischool-schedule-archive-v1"), null);
    s.setState({ fileName: "MyRealMonth.hisp.json" });
    s.getState().persistAutosave();
    assert.ok(localStorage.getItem("hischool-schedule-archive-v1"));
  });
});

describe("schedule store: accepting and closing", () => {
  beforeEach(() => {
    resetStore();
  });

  it("accept is one undo step, and editing the problem away drops the accept", () => {
    const s = useScheduleStore;
    // make a hole: clear a filled open day
    const name = getCell(s.getState().doc.grid, "EST", "pharmacist", 2) || getCell(s.getState().doc.grid, "EST", "pharmacist", 1);
    const day = getCell(s.getState().doc.grid, "EST", "pharmacist", 2) ? 2 : 1;
    s.getState().setCell("EST", "pharmacist", day, "");
    assert.ok(name);
    const holes = s.getState().evaluation.holes;
    assert.ok(holes >= 1);
    s.getState().acceptProblems([`hole|EST|${day}`]);
    assert.equal(s.getState().evaluation.holes, holes - 1);
    assert.equal(s.getState().evaluation.accepted, 1);
    s.getState().undo();
    assert.equal(s.getState().evaluation.holes, holes);
    s.getState().acceptProblems([`hole|EST|${day}`]);
    s.getState().setCell("EST", "pharmacist", day, name);
    assert.equal(s.getState().doc.accepted, undefined); // filled: the accept is gone
    s.getState().setCell("EST", "pharmacist", day, "");
    assert.equal(s.getState().evaluation.holes, holes); // and does not quietly come back
  });

  it("acceptAllOpen accepts everything but licenses, in one step", () => {
    const s = useScheduleStore;
    s.getState().setCell("EST", "pharmacist", 1, "");
    s.getState().setCell("EST", "pharmacist", 2, "");
    const n = s.getState().acceptAllOpen();
    assert.ok(n >= 2);
    assert.equal(s.getState().evaluation.holes, 0);
    s.getState().undo();
    assert.ok(s.getState().evaluation.holes >= 2);
  });

  it("closing a store for a day is one undo step and keeps the reason", () => {
    const s = useScheduleStore;
    s.getState().closeStoreDay("EST", 2, "Short-staffed");
    assert.equal(s.getState().doc.holidays.some((h) => h.closure && h.label === "Short-staffed" && h.store === "EST"), true);
    assert.equal(getCell(s.getState().doc.grid, "EST", "pharmacist", 2), "");
    s.getState().undo();
    assert.equal(s.getState().doc.holidays.some((h) => h.closure), false);
  });
});

describe("schedule store: time off for several people", () => {
  beforeEach(() => {
    ensureLocalStorage();
    localStorage.clear();
    useScheduleStore.getState().loadDemo();
  });

  it("adds one entry per person in one undo step and refuses duplicates", () => {
    const st = useScheduleStore.getState();
    const names = st.doc.people.filter((p) => p.role === "Pharmacist").slice(0, 3).map((p) => p.name);
    const dates = ["2026-10-06"];
    const before = st.doc.timeOff.length;
    const r = st.addTimeOffMany({ names, dates, note: "event", status: "approved" });
    assert.equal(r.error, null);
    assert.equal(r.added, 3);
    assert.equal(useScheduleStore.getState().doc.timeOff.length, before + 3);
    const again = useScheduleStore.getState().addTimeOffMany({ names, dates, note: "", status: "approved" });
    assert.equal(again.added, 0);
    assert.ok(again.error);
    useScheduleStore.getState().undo();
    assert.equal(useScheduleStore.getState().doc.timeOff.length, before);
  });

  it("edits an entry's days and note", () => {
    const st = useScheduleStore.getState();
    const i = st.doc.timeOff.findIndex((t) => !t.status);
    assert.ok(i >= 0);
    const err = st.updateTimeOff(i, { dates: ["2026-10-07"], note: "moved" });
    assert.equal(err, null);
    const t = useScheduleStore.getState().doc.timeOff[i]!;
    assert.deepEqual(t.dates, ["2026-10-07"]);
    assert.equal(t.note, "moved");
  });
});
