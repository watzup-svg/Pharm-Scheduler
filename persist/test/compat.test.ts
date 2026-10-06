// Saved-file compatibility: every file ever written by a released schema version (persist/test/fixtures/compat/) must still open
// with the CURRENT codec. Fixtures are made once per schema version by make-compat-fixtures.ts and never overwritten.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { api, evaluate, stateHash } from "../../domain/src/index.ts";
import { SCHEMA_VERSION, exportWorld, loadBytes, sameSaved } from "../codec.ts";
import { FakeHandle, SQL, mk, mkFs, practice } from "./fakes.ts";

const dir = new URL("./fixtures/compat/", import.meta.url);
const names = readdirSync(dir).filter((f) => f.endsWith(".sqlite")).sort();
const asOf = "2026-10-06";

test("the fixture folder holds a file for every scenario of the current schema version", () => {
  assert.ok(names.length >= 4, names.join());
  for (const sc of ["practice", "busy", "empty", "maximal"]) assert.ok(names.includes(`v${SCHEMA_VERSION}-${sc}.sqlite`), `missing v${SCHEMA_VERSION}-${sc}.sqlite (run make-compat-fixtures.ts after a schema bump)`);
  for (const n of names) assert.ok(readdirSync(dir).includes(n.replace(/\.sqlite$/, ".expected.json")), `${n} has no .expected.json`);
});

for (const name of names) {
  const expected = JSON.parse(readFileSync(new URL(name.replace(/\.sqlite$/, ".expected.json"), dir), "utf8")) as {
    schemaVersion: number; stateHash: string; tableCounts: Record<string, number>; journalLength: number; checkpoints: number; snapshots: number; toldEntries: number;
  };
  const bytes = new Uint8Array(readFileSync(new URL(name, dir)));

  test(`${name}: opens, matches the stored hash and counts`, () => {
    const r = loadBytes(SQL, bytes);
    assert.ok(r.ok, r.ok ? "" : `${r.reason}: ${r.error}`);
    if (!r.ok) return;
    assert.equal(r.meta.schemaVersion, expected.schemaVersion);
    assert.equal(r.meta.stateHash, expected.stateHash);
    assert.equal(stateHash(r.world.state), expected.stateHash);
    assert.equal(r.world.journal.changeSets.length, expected.journalLength);
    assert.equal(r.world.journal.checkpoints.length, expected.checkpoints);
    assert.equal(r.world.journal.snapshots.length, expected.snapshots);
    assert.equal(Object.keys(r.world.journal.told).length, expected.toldEntries);
    // Row counts as stored in the file itself.
    const db = new SQL.Database(bytes);
    for (const [t, n] of Object.entries(expected.tableCounts)) assert.equal(Number(db.exec(`SELECT count(*) FROM "${t}"`)[0]!.values[0]![0]), n, `table ${t}`);
    db.close();
    assert.deepEqual(r.problems, [], "no consistency problems in a file this version wrote");
  });

  test(`${name}: evaluate runs, undo and revert of the latest change work`, () => {
    const r = loadBytes(SQL, bytes);
    assert.ok(r.ok);
    if (!r.ok) return;
    const ev = evaluate(r.world.state, asOf);
    assert.ok(ev && typeof ev === "object");
    const last = r.world.journal.changeSets.at(-1);
    if (!last) { assert.equal(expected.journalLength, 0); return; }
    // The latest change set may itself be an undo or revert; undo it anyway, it is the most recent one and nothing follows it.
    const u = api.undo(r.world, last.id);
    assert.ok(!("refused" in u), "refused" in u ? u.reason : "");
    if ("refused" in u) return;
    assert.equal(u.world.journal.changeSets.length, expected.journalLength + 1, "undo appends, never rewrites history");
    assert.deepEqual(u.world.journal.changeSets.slice(0, expected.journalLength), r.world.journal.changeSets);
    evaluate(u.world.state, asOf);
    for (const ck of r.world.journal.checkpoints) {
      const rv = api.revertToCheckpoint(r.world, ck.name);
      // Already identical to that checkpoint (e.g. the file was saved right after a revert): a plain refusal is the right answer.
      if ("refused" in rv && /Nothing changed/.test(rv.reason) && ck.stateHash === stateHash(r.world.state)) continue;
      assert.ok(!("refused" in rv), `revert ${ck.name}: ${"refused" in rv ? rv.reason : ""}`);
      if (!("refused" in rv)) {
        assert.equal(rv.world.journal.changeSets.length, expected.journalLength + 1);
        evaluate(rv.world.state, asOf);
      }
    }
  });

  test(`${name}: re-export then reload is stable and byte-identical on a second export`, () => {
    const r = loadBytes(SQL, bytes);
    assert.ok(r.ok);
    if (!r.ok) return;
    const m = { dbUuid: r.meta.dbUuid, rev: r.meta.rev, savedAt: r.meta.savedAt };
    const again = exportWorld(SQL, r.world, m);
    const r2 = loadBytes(SQL, again);
    assert.ok(r2.ok);
    if (!r2.ok) return;
    assert.equal(r2.meta.stateHash, expected.stateHash);
    assert.equal(r2.meta.journalHash, r.meta.journalHash);
    assert.ok(sameSaved(r.world, r2.world));
    const third = exportWorld(SQL, r2.world, m);
    assert.deepEqual(Buffer.from(third), Buffer.from(again), "second export is byte-identical to the first");
  });
}

test("a file claiming a NEWER schema version is refused plainly and nothing is changed or offered to overwrite", async () => {
  const db = new SQL.Database(new Uint8Array(readFileSync(new URL(`v${SCHEMA_VERSION}-practice.sqlite`, dir))));
  db.run(`PRAGMA user_version=${SCHEMA_VERSION + 1}`);
  db.run(`UPDATE meta SET v = ${SCHEMA_VERSION + 1} WHERE k = 'schema_version'`);
  const newer = db.export();
  db.close();
  const r = loadBytes(SQL, newer);
  assert.ok(!r.ok);
  if (r.ok) return;
  assert.equal(r.reason, "newer");
  assert.match(r.error, /newer version of the scheduler/);
  // Through the real open flow: refused, the file's bytes untouched, no "what can be read" salvage offered, no destructive path.
  const fs = mkFs();
  const p = mk(fs);
  const h = new FakeHandle("future.sqlite", newer.slice());
  fs.next = h;
  const o = await p.open({ force: true });
  assert.equal(o.state, "refused");
  if (o.state !== "refused") return;
  assert.equal(o.reason, "newer");
  assert.ok(!o.offers.some((x) => x.source === "file-ckpt"), "no salvage of a file we do not understand");
  assert.deepEqual(Buffer.from(h.data), Buffer.from(newer), "the file was not touched");
  assert.ok(!p.status().linked, "not linked, so a later Save cannot overwrite it");
  const w = practice();
  fs.saveTarget = new FakeHandle("mine.sqlite");
  await p.adopt(w, "mine.sqlite");
  const again = await p.open({ force: true });
  assert.equal(again.state, "refused");
  assert.deepEqual(Buffer.from(h.data), Buffer.from(newer));
  // Older than we can read is refused with its own message (also no overwrite).
  const old = new SQL.Database(newer);
  old.run("PRAGMA user_version=0");
  const oldBytes = old.export();
  old.close();
  const ro = loadBytes(SQL, oldBytes);
  assert.ok(!ro.ok && ro.reason === "unsupported-version" && /older format/.test(ro.error));
});
