import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDemo } from "./demo.ts";
import { hintsOnGrid, personHints, stateOfStore, statesInUse } from "./hints.ts";
import { evaluate } from "./rules.ts";
import { dayRoster, filterStores, weekRanges } from "./roster.ts";
import { workloadFlags } from "./workload.ts";
import { createSample } from "./sample.ts";
import { placeName } from "./place.ts";
import { addBackup, loadBackups, saveBackups, type Backup } from "./backup.ts";

describe("state of a store", () => {
  it("reads the state from the address", () => {
    assert.equal(stateOfStore({ address: "325 S Broadway St, Estacada, OR 97023" }), "OR");
    assert.equal(stateOfStore({ address: "Cathlamet, WA" }), "WA");
    assert.equal(stateOfStore({ address: "" }), "");
    assert.equal(stateOfStore({ address: "Somewhere" }), "");
  });
  it("lists the states in use", () => {
    assert.deepEqual(statesInUse(createDemo()), ["OR", "WA"]);
  });
});

describe("availability hints", () => {
  const doc = createDemo();
  it("flag a weekday someone usually cannot work", () => {
    const hints = hintsOnGrid(doc);
    const kip = hints.find((h) => h.ref.store === "CLA" && h.ref.day === 19);
    assert.equal(kip?.hints[0]?.text, "Usually has Mondays off");
    assert.equal(hints.length, 1); // licences are hard errors now, not hints
  });
  it("say nothing when nothing is on file (the September sample)", () => {
    const sample = createSample();
    assert.deepEqual(hintsOnGrid(sample), []);
    assert.deepEqual(personHints(sample, "Jane Smith", "EST", 4), []);
  });
  it("never change what counts as ready", () => {
    const withHint = evaluate(doc);
    const stripped = evaluate({ ...doc, people: doc.people.map((p) => ({ ...p, unavailableDays: [] })) });
    assert.equal(withHint.holes, stripped.holes);
    assert.equal(withHint.doubles, stripped.doubles);
    assert.equal(withHint.closed, stripped.closed);
  });
});

describe("workload flags", () => {
  it("flags a weekday-only pharmacist who picks up a Saturday (6 days, usually 5)", () => {
    const doc = createDemo();
    const flag = workloadFlags(doc).find((f) => f.name === "Lucia Denton");
    assert.equal(flag?.kind, "week");
    assert.match(flag!.text, /6 days the week of Oct 11 \(usually 5\)/);
    assert.deepEqual(flag!.ref, { store: "EST", slot: "pharmacist2", day: 17 });
  });
  it("is quiet for ordinary schedules", () => {
    assert.deepEqual(workloadFlags(createSample()), []);
    assert.equal(workloadFlags(createDemo()).filter((f) => f.kind !== "week").length, 0);
  });
  it("flags seven days in a row when a store opens on Sunday", () => {
    let doc = createSample();
    doc = { ...doc, stores: doc.stores.map((s) => (s.code === "MOL" ? { ...s, sunOpen: true } : s)) };
    for (const d of [13, 20]) doc = placeName(doc, "MOL", "pharmacist", d, "Tom Reyes").doc;
    const run = workloadFlags(doc).find((f) => f.kind === "run");
    assert.equal(run?.name, "Tom Reyes");
    assert.match(run!.text, /10 days in a row ending Sep 17/);
  });
});

describe("by-day roster", () => {
  const doc = createDemo();
  const ev = evaluate(doc);
  it("lists every store, who is free, and who is off", () => {
    const r = dayRoster(doc, ev, 20);
    assert.equal(r.stores.length, 18);
    assert.equal(r.stores.find((s) => s.store === "MOT")?.hole, true);
    assert.ok(r.off.includes("Theo Brandvold"));
    assert.ok(!r.free.some((p) => r.off.includes(p.name)));
    const placed = new Set(r.stores.flatMap((s) => s.names));
    assert.ok(r.free.every((p) => !placed.has(p.name)));
  });
});

describe("backups", () => {
  const b = (at: number, reason: Backup["reason"], json = String(at)): Backup => ({ at, reason, fileName: "f", year: 2026, month: 10, json });
  it("keeps newest first and caps the list", () => {
    let list: Backup[] = [];
    for (let i = 0; i < 12; i++) list = addBackup(list, b(i * 1e7, "save"), { max: 8 });
    assert.equal(list.length, 8);
    assert.equal(list[0]!.at, 11 * 1e7);
  });
  it("replaces a recent autosave instead of piling them up, but keeps explicit ones", () => {
    let list = addBackup([], b(1000, "autosave", "a"));
    list = addBackup(list, b(2000, "autosave", "b"), { minGapMs: 10_000 });
    assert.equal(list.length, 1);
    list = addBackup(list, b(3000, "before-replace", "c"));
    list = addBackup(list, b(4000, "autosave", "d"), { minGapMs: 10_000 });
    assert.equal(list.length, 3);
  });
  it("round-trips through storage and drops the oldest when the browser is full", () => {
    const data: Record<string, string> = {};
    const roomy = { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
    assert.equal(saveBackups(roomy, [b(1, "save"), b(2, "save")]), true);
    assert.equal(loadBackups(roomy).length, 2);
    const tight = {
      getItem: () => null,
      setItem: (_k: string, v: string) => {
        if (v.length > 300) throw new Error("quota");
      },
    };
    const big = Array.from({ length: 5 }, (_, i) => b(i, "save", "x".repeat(100)));
    assert.equal(saveBackups(tight, big), true);
    assert.equal(loadBackups(undefined).length, 0);
  });
});

describe("store filter and weeks", () => {
  const doc = createDemo();
  const ev = evaluate(doc);
  it("filters by problems and by state", () => {
    assert.equal(filterStores(doc, ev, "all").length, 18);
    const problems = filterStores(doc, ev, "problems").map((s) => s.code);
    for (const code of ["CAT", "SCA", "WS", "EST", "MOL", "LEN", "RR", "WAL", "MOT", "CLA", "WOO"]) assert.ok(problems.includes(code), code);
    assert.ok(!problems.includes("FLO"));
    assert.equal(filterStores(doc, ev, "WA").length, 5);
    assert.equal(filterStores(doc, ev, "OR").length, 13);
  });
  it("cuts October 2026 into Sunday-first weeks", () => {
    assert.deepEqual(weekRanges(2026, 10), [[1, 3], [4, 10], [11, 17], [18, 24], [25, 31]]);
    assert.deepEqual(weekRanges(2026, 9)[0], [1, 5]);
  });
});
