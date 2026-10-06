// Writes the saved-file compatibility fixtures in persist/test/fixtures/compat/ with the CURRENT codec.
//
//   node --experimental-strip-types persist/test/make-compat-fixtures.ts
//
// ONLY run this when you intentionally bump SCHEMA_VERSION (persist/codec.ts). Then it ADDS files named
// v<N>-<scenario>.sqlite + v<N>-<scenario>.expected.json for the new version N. It refuses to overwrite a file that
// already exists: the old files are the proof that files saved by earlier versions still open. Never edit or delete them.
// (If an older version can no longer be read, the migration that reads it is what must be written, not the fixture changed.)
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { api, evaluate, seedWorld, stateHash } from "../../domain/src/index.ts";
import type { World } from "../../domain/src/index.ts";
import { SCHEMA_VERSION, exportWorld } from "../codec.ts";
import { SQL, busyWorld, practice } from "./fakes.ts";

const dir = new URL("./fixtures/compat/", import.meta.url);
const meta = { dbUuid: "compat-fixture-uuid", rev: 7, savedAt: "2026-10-06T10:00:00.000Z" };

function commit(w: World, edits: Parameters<typeof api.commit>[1], label: string): World {
  const r = api.commit(w, edits, { kind: "manual", label });
  if ("refused" in r) throw new Error(`${label}: ${r.reason}`);
  return r.world;
}

/** Everything the format can hold: history, undo, two checkpoints, a revert, posting twice, told ledger, notes, overrides, standing, travel, config, odd text. */
function maximal(): World {
  let w = busyWorld().world;
  const st = () => w.state;
  const stores = Object.values(st().stores);
  const phs = Object.values(st().pharmacists);
  const s1 = stores[0]!, s2 = stores[1]!, p1 = phs[0]!, p2 = phs[1]!;
  w = commit(w, [{ t: "store.set", store: { ...s1, name: "Café “Main”, 100% <b>&</b> 日本語 👩‍⚕️" } }], "odd store name");
  w = commit(w, [{ t: "pharmacist.set", pharmacist: { ...p1, name: "O'Brien; DROP TABLE x; --", licenses: { OR: null, WA: "2027-01-31" } } }], "odd pharmacist name");
  w = commit(w, [{ t: "travel.set", pair: { fromStoreId: s1.id, toStoreId: s2.id, minutes: 42, miles: 31.5 } }], "travel");
  w = commit(w, [{ t: "config.set", patch: { maxConsecutiveDays: 5, mileageRates: [{ effectiveFrom: "2026-01-01", centsPerMile: 70 }, { effectiveFrom: "2026-07-01", centsPerMile: 72.5 }] } }], "config");
  w = commit(w, [{ t: "requirement.set", storeId: s2.id, weekday: 3, effectiveFrom: "2026-10-01", count: 2 }], "requirement");
  w = commit(w, [{ t: "cell.set", storeId: s2.id, date: "2026-10-14", locum: 1, acceptedShort: 1 }], "cell");
  w = commit(w, [{ t: "standing.add", storeId: s2.id, pharmacistId: p2.id, recurrence: { weekdays: [2], cycleWeeks: 2, anchor: "2026-10-06", nth: [1, 3] }, effectiveFrom: "2026-10-01", effectiveTo: "2026-12-31" }], "standing");
  w = commit(w, [{ t: "unavail.add", pharmacistId: p2.id, first: "2026-10-12", last: "2026-10-16", status: "Approved", type: "Sick", note: "line1\nline2\ttab \"q\" 'q'" }], "unavail");
  w = commit(w, [{ t: "dateOverride.set", storeId: s2.id, date: "2026-10-31", count: 2, note: "clinic" }], "override date");
  w = api.checkpoint(w, "second checkpoint");
  const some = Object.values(st().assignments).find((a) => a.source === "manual" && !a.pinned);
  if (some) w = commit(w, [{ t: "update", assignmentId: some.id, patch: { partialNote: "leaves 2pm", pinned: true, agreed: true } }], "partial note");
  const rv = api.revertToCheckpoint(w, "before more");
  if ("refused" in rv) throw new Error(`revert: ${rv.reason}`);
  w = rv.world;
  w = api.post(w, { from: "2026-10-01", to: "2026-10-31" }, "2026-10-07").world;
  return w;
}

const scenarios: Record<string, () => World> = {
  practice,
  busy: () => busyWorld().world,
  empty: () => {
    const w = seedWorld({ stores: [{ id: "S1", code: "A", name: "Alpha", state: "OR", req: 1 }], pharmacists: [] });
    w.state.nextId.store = 2;
    return w;
  },
  maximal,
};

const v = `v${SCHEMA_VERSION}`;
mkdirSync(dir, { recursive: true });
for (const [name, make] of Object.entries(scenarios)) {
  const base = `${v}-${name}`;
  const bytesPath = new URL(`${base}.sqlite`, dir), jsonPath = new URL(`${base}.expected.json`, dir);
  if (existsSync(bytesPath) || existsSync(jsonPath)) { console.log(`skip ${base} (exists; fixtures are never overwritten)`); continue; }
  const w = make();
  const bytes = exportWorld(SQL, w, meta);
  const c = new SQL.Database(bytes);
  const counts: Record<string, number> = {};
  for (const [t] of c.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")[0]!.values) counts[String(t)] = Number(c.exec(`SELECT count(*) FROM "${String(t)}"`)[0]!.values[0]![0]);
  c.close();
  evaluate(w.state, "2026-10-06"); // must not throw while generating
  const expected = {
    schemaVersion: SCHEMA_VERSION,
    stateHash: stateHash(w.state),
    tableCounts: counts,
    journalLength: w.journal.changeSets.length,
    checkpoints: w.journal.checkpoints.length,
    snapshots: w.journal.snapshots.length,
    toldEntries: Object.keys(w.journal.told).length,
  };
  writeFileSync(bytesPath, bytes);
  writeFileSync(jsonPath, JSON.stringify(expected, null, 2) + "\n");
  console.log(`wrote ${base}: ${bytes.length} bytes, ${expected.journalLength} change sets`);
}
