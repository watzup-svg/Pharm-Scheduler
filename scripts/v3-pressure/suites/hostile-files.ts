// hostile-files: take valid saved files made by persist/codec, damage them thousands of seeded ways, and load them.
// The loader must REFUSE (ok:false or a CodecError) or LOAD a world whose reported problems equal checkIntegrity and that the domain can still evaluate. Never an uncaught throw, never a slow load.
// Journal damage is not covered by the state fingerprint: a file whose journal was altered but still loads is counted (metric journalAltered) and the journal is exercised (undo/checkpoint) to make sure it cannot crash the app.
// Replay one damaged file: node --experimental-strip-types --no-warnings scripts/v3-pressure/suites/hostile-files.ts --level low --case bitflip --iter 17
import fs from "node:fs";
import path from "node:path";
import { api, canonical, checkIntegrity, stateHash } from "../../../domain/src/index.ts";
import type { World } from "../../../domain/src/index.ts";
import { CodecError, exportWorld, loadBytes, salvageBytes, sameSaved } from "../../../persist/codec.ts";
import { SQL, busyWorld, practice } from "../../../persist/test/fakes.ts";
import { Invariant, genWorld, parseArgs, pick3, rng, runSuite, type Case, type CaseCtx, type Rng } from "../lib.ts";

const args = parseArgs();
const L = args.level;
const META = { dbUuid: "hostile-uuid", rev: 5, savedAt: "2026-10-06T10:00:00.000Z" };
const LOAD_BUDGET_MS = 8000;
const clone = <T>(x: T): T => structuredClone(x);

const bases: { name: string; world: World; bytes: Uint8Array }[] = [];
{
  const busy = busyWorld().world;
  const gen = (() => { const w = genWorld({ seed: 3, stores: 18, days: 14 }); const a = Object.values(w.state.assignments)[0]!; const c = api.commit(w, [{ t: "update", assignmentId: a.id, patch: { pinned: true } }], { kind: "manual", label: "pin" }); return "refused" in c ? w : c.world; })();
  for (const [name, world] of [["practice", practice()], ["busy", busy], ["gen18", gen]] as const) bases.push({ name, world, bytes: exportWorld(SQL, world, META) });
}
const baseOf = (r: Rng) => bases[r.int(bases.length)]!;

type Mut = { bytes: Uint8Array; desc: string; base: (typeof bases)[number] };
type Mutator = (r: Rng) => Mut;

function withDb(bytes: Uint8Array, f: (db: InstanceType<typeof SQL.Database>) => void): Uint8Array {
  const db = new SQL.Database(bytes);
  try { f(db); return db.export(); } finally { db.close(); }
}
const dropTriggers = (db: InstanceType<typeof SQL.Database>) => { for (const row of db.exec("SELECT name FROM sqlite_master WHERE type='trigger'")[0]?.values ?? []) db.run(`DROP TRIGGER ${String(row[0])}`); };
const TABLES = ["stores", "pharmacists", "requirements", "dateOverrides", "unavailability", "assignments", "overrides", "cellCounts", "standing", "travel", "built", "config", "nextId", "change_sets", "snapshots", "told", "checkpoints", "meta"];
const JSON_TABLES = ["stores", "pharmacists", "requirements", "dateOverrides", "unavailability", "assignments", "overrides", "cellCounts", "standing", "travel", "built", "config", "nextId", "change_sets", "snapshots"];

const mutators: Record<string, Mutator> = {
  truncate(r) {
    const b = baseOf(r);
    const n = r.chance(0.4) ? Math.max(0, Math.floor(r.int(b.bytes.length) / 4096) * 4096 + (r.chance(0.5) ? 0 : r.int(4096))) : r.int(b.bytes.length);
    return { bytes: b.bytes.slice(0, Math.min(n, b.bytes.length)), desc: `${b.name} truncated to ${n} of ${b.bytes.length} bytes`, base: b };
  },
  bitflip(r) {
    const b = baseOf(r);
    const x = b.bytes.slice();
    const n = 1 + r.int(16);
    const at: string[] = [];
    for (let i = 0; i < n; i++) { const p = r.chance(0.2) ? r.int(Math.min(120, x.length)) : r.int(x.length); x[p] = x[p]! ^ (1 << r.int(8)); at.push(String(p)); }
    return { bytes: x, desc: `${b.name} ${n} bit flip(s) at byte ${at.slice(0, 6).join(",")}`, base: b };
  },
  "page-garbage"(r) {
    const b = baseOf(r);
    const x = b.bytes.slice();
    const pages = Math.max(1, Math.floor(x.length / 4096));
    const k = 1 + r.int(3);
    const desc: string[] = [];
    for (let i = 0; i < k; i++) {
      const pg = r.int(pages), mode = r.int(3);
      for (let j = 0; j < 4096 && pg * 4096 + j < x.length; j++) x[pg * 4096 + j] = mode === 0 ? 0 : mode === 1 ? 255 : r.int(256);
      desc.push(`p${pg}:${["zero", "ff", "random"][mode]}`);
    }
    return { bytes: x, desc: `${b.name} pages ${desc.join(" ")}`, base: b };
  },
  header(r) {
    const b = baseOf(r);
    const x = b.bytes.slice();
    const k = 1 + r.int(4);
    for (let i = 0; i < k; i++) x[r.int(100)] = r.int(256);
    return { bytes: x, desc: `${b.name} header bytes changed`, base: b };
  },
  version(r) {
    const b = baseOf(r);
    const choice = r.int(8);
    const out = withDb(b.bytes, (db) => {
      if (choice === 0) db.run(`PRAGMA user_version=${r.pick([0, 2, 99, -1, 2147483647])}`);
      else if (choice === 1) db.run(`PRAGMA application_id=${r.pick([0, 1, 1347376979 + 1, -5])}`);
      else if (choice === 2) db.run(`UPDATE meta SET v=${r.pick([0, 2, 99, -1, "'x'", "NULL"])} WHERE k='schema_version'`);
      else if (choice === 3) db.run(`UPDATE meta SET v=${r.pick(["'other-app'", "''", "NULL", "5"])} WHERE k='app'`);
      else if (choice === 4) db.run(`UPDATE meta SET v=${r.pick(["'zz'", "''", "NULL", "-1", "1e308", "'NaN'"])} WHERE k='rev'`);
      else if (choice === 5) db.run(`DELETE FROM meta WHERE k='${r.pick(["state_hash", "db_uuid", "saved_at", "rev", "app", "schema_version"])}'`);
      else if (choice === 6) db.run(`UPDATE meta SET v='${"x".repeat(1 + r.int(200000))}' WHERE k='${r.pick(["db_uuid", "saved_at", "state_hash"])}'`);
      else db.run("UPDATE meta SET v=NULL");
    });
    return { bytes: out, desc: `${b.name} version/meta variant ${choice}`, base: b };
  },
  "empty-tables"(r) {
    const b = baseOf(r);
    const pickT = r.shuffle(TABLES).slice(0, 1 + r.int(4));
    const out = withDb(b.bytes, (db) => { dropTriggers(db); for (const t of pickT) db.run(`DELETE FROM ${t}`); });
    return { bytes: out, desc: `${b.name} emptied ${pickT.join(",")}`, base: b };
  },
  "missing-tables"(r) {
    const b = baseOf(r);
    const t = r.pick(TABLES);
    const out = withDb(b.bytes, (db) => { dropTriggers(db); db.run(`DROP TABLE ${t}`); });
    return { bytes: out, desc: `${b.name} dropped table ${t}`, base: b };
  },
  "huge-strings"(r) {
    const b = baseOf(r);
    const t = r.pick(JSON_TABLES);
    const size = r.pick([100_000, 1_000_000, 4_000_000]);
    const mode = r.int(3);
    const out = withDb(b.bytes, (db) => {
      dropTriggers(db);
      const filler = "A".repeat(size);
      if (mode === 0) db.run(`UPDATE ${t} SET json = '${filler}' WHERE rowid = (SELECT min(rowid) FROM ${t})`);
      else if (mode === 1) db.run(`UPDATE ${t} SET json = '{"id":"${filler}"}' WHERE rowid = (SELECT max(rowid) FROM ${t})`);
      else db.run(`UPDATE ${t} SET json = '[' || json || ',"${filler}"]' WHERE rowid = (SELECT min(rowid) FROM ${t})`);
    });
    return { bytes: out, desc: `${b.name} ${size} byte string in ${t} (mode ${mode})`, base: b };
  },
  "duplicate-keys"(r) {
    const b = baseOf(r);
    const flavor = r.int(3);
    const t = r.pick(["stores", "pharmacists", "assignments", "unavailability", "standing", "travel", "requirements"]);
    const out = withDb(b.bytes, (db) => {
      dropTriggers(db);
      if (flavor === 0) {
        // the same JSON member twice with different values
        const row = db.exec(`SELECT key, json FROM ${t} ORDER BY rowid LIMIT 1`)[0]?.values[0];
        if (row) { const j = String(row[1]); const m = j.match(/"(\w+)":("[^"]*"|\d+)/); if (m) db.run(`UPDATE ${t} SET json = ? WHERE key = ?`, [j.slice(0, -1) + `,"${m[1]}":${m[2]!.startsWith('"') ? '"DUP"' : "424242"}}`, String(row[0])]); }
      } else if (flavor === 1) {
        // the same key twice in a table without the primary key (last one wins when read back by rowid)
        db.run(`ALTER TABLE ${t} RENAME TO ${t}_old`);
        db.run(`CREATE TABLE ${t}(key TEXT, json TEXT NOT NULL)`);
        db.run(`INSERT INTO ${t} SELECT key, json FROM ${t}_old`);
        db.run(`INSERT INTO ${t} SELECT key, json FROM ${t}_old WHERE rowid <= 3`);
        db.run(`DROP TABLE ${t}_old`);
      } else {
        // a row whose key does not match the id inside its JSON
        db.run(`UPDATE ${t} SET key = key || 'X' WHERE rowid = (SELECT min(rowid) FROM ${t})`);
      }
    });
    return { bytes: out, desc: `${b.name} duplicate keys in ${t} (flavor ${flavor})`, base: b };
  },
  "json-shape"(r) {
    const b = baseOf(r);
    const t = r.pick(JSON_TABLES);
    const repl = r.pick(["[]", "null", '"x"', "{}", "42", "true", '{"id":null}', "[1,2,3]", "{", '{"a":', "\u0000", "undefined", "NaN", "{\"__proto__\":{\"x\":1}}", "{\"constructor\":{\"prototype\":{\"y\":1}}}"]);
    const all = r.chance(0.3);
    const out = withDb(b.bytes, (db) => { dropTriggers(db); db.run(`UPDATE ${t} SET json = ? ${all ? "" : "WHERE rowid = (SELECT min(rowid) FROM " + t + ")"}`, [repl]); });
    return { bytes: out, desc: `${b.name} ${all ? "every" : "first"} ${t} row json -> ${JSON.stringify(repl)}`, base: b };
  },
  "journal-damage"(r) {
    const b = baseOf(r);
    const flavor = r.int(5);
    const out = withDb(b.bytes, (db) => {
      dropTriggers(db);
      if (flavor === 0) db.run("UPDATE change_sets SET json = replace(json, '\"events\":[', '\"events\":[null,') WHERE seq = (SELECT max(seq) FROM change_sets)");
      else if (flavor === 1) db.run("UPDATE change_sets SET json = replace(json, '\"key\":\"', '\"key\":\"zz') WHERE seq = (SELECT max(seq) FROM change_sets)");
      else if (flavor === 2) db.run("UPDATE change_sets SET json = '{\"id\":\"C99\",\"seq\":99,\"kind\":\"manual\",\"label\":\"x\"}' WHERE seq = (SELECT max(seq) FROM change_sets)");
      else if (flavor === 3) db.run("UPDATE change_sets SET json = replace(json, '\"after\"', '\"aftr\"')");
      else db.run("UPDATE change_sets SET id = id || 'dup'");
    });
    return { bytes: out, desc: `${b.name} journal damage flavor ${flavor}`, base: b };
  },
  // Hash-consistent damage: the state itself is wrong, then saved properly, so the fingerprint matches. The loader must still not hand the app something that crashes it.
  "state-shape"(r) {
    const b = baseOf(r);
    const w = clone(b.world);
    const s = w.state as unknown as Record<string, Record<string, Record<string, unknown>>>;
    const tables = ["stores", "pharmacists", "requirements", "unavailability", "assignments", "standing", "travel", "dateOverrides", "cellCounts", "overrides"];
    const n = 1 + r.int(3);
    const desc: string[] = [];
    for (let i = 0; i < n; i++) {
      const t = r.pick(tables);
      const rows = s[t] ? Object.keys(s[t]!) : [];
      if (!rows.length) continue;
      const k = r.pick(rows);
      const row = s[t]![k] as Record<string, unknown>;
      const fields = Object.keys(row);
      const f = r.pick(fields);
      const m = r.int(7);
      if (m === 0) delete row[f];
      else if (m === 1) row[f] = null;
      else if (m === 2) row[f] = typeof row[f] === "string" ? 7 : "seven";
      else if (m === 3) row[f] = typeof row[f] === "string" ? "9999-99-99" : -1;
      else if (m === 4) row[f] = typeof row[f] === "string" ? "S-nope" : 1e9;
      else if (m === 5) row[f] = [];
      else delete s[t]![k];
      desc.push(`${t}.${k}.${f}#${m}`);
    }
    let bytes: Uint8Array;
    try { bytes = exportWorld(SQL, w, META); } catch { return { bytes: b.bytes, desc: `${b.name} (unwritable mutation ${desc.join(" ")}, used the original)`, base: b }; }
    return { bytes, desc: `${b.name} state ${desc.join(" ")}`, base: b };
  },
  "huge-state"(r) {
    const b = baseOf(r);
    const w = clone(b.world);
    const size = r.pick([200_000, 2_000_000]);
    const st = Object.values(w.state.stores)[0]!;
    st.name = "N".repeat(size);
    const ph = Object.values(w.state.pharmacists)[0]!;
    ph.name = "é🙂".repeat(size / 4);
    return { bytes: exportWorld(SQL, w, META), desc: `${b.name} legal state with ${size}-char names`, base: b };
  },
};

const outcomeCounts: Record<string, number> = {};
const sampleDir = path.join(args.out, "hostile");
let saved = 0;

function probe(m: Mut, className: string, i: number, replay: string): { kind: string; journalAltered: boolean } {
  const fail = (inv: string, msg: string): never => {
    let f = "(not saved)";
    if (saved < 5) { saved++; fs.mkdirSync(sampleDir, { recursive: true }); f = path.join(sampleDir, `${className}-${i}.sqlite`); fs.writeFileSync(f, m.bytes); f = path.relative(process.cwd(), f); }
    throw new Invariant(inv, `${m.desc}: ${msg} (file: ${f})`, { replay });
  };
  const t0 = performance.now();
  let res: ReturnType<typeof loadBytes> | null = null;
  try { res = loadBytes(SQL, m.bytes); }
  catch (e) {
    if (e instanceof CodecError) return { kind: "refused:CodecError-thrown", journalAltered: false };
    return fail("uncaught-throw", `loadBytes threw ${(e as Error)?.name}: ${(e as Error)?.message}`);
  }
  const ms = performance.now() - t0;
  if (ms > LOAD_BUDGET_MS) fail("slow-load", `loading took ${Math.round(ms)} ms (limit ${LOAD_BUDGET_MS})`);
  // the salvage path (used for a refused file) must never throw either
  try { const s = salvageBytes(SQL, m.bytes); if (s && (typeof s.world !== "object" || !s.world.state)) fail("salvage-shape", "salvageBytes returned a world without state"); }
  catch (e) { if (!(e instanceof Invariant)) fail("uncaught-throw", `salvageBytes threw ${(e as Error)?.message}`); else throw e; }
  if (!res.ok) {
    if (!["not-sqlite", "integrity", "wrong-app", "newer", "unsupported-version", "unreadable", "hash-mismatch"].includes(res.reason)) fail("bad-refusal", `unknown refusal reason ${res.reason}`);
    if (!res.error || res.error.length < 5) fail("bad-refusal", "refusal without a message");
    return { kind: `refused:${res.reason}`, journalAltered: false };
  }
  // loaded: it must be self-consistent and usable
  const issues = checkIntegrity(res.world.state).map((p) => `${p.table} ${p.key}: ${p.problem}`);
  if (canonical(issues) !== canonical(res.problems)) fail("problems-mismatch", `loader reported ${res.problems.length} problem(s) but checkIntegrity finds ${issues.length}`);
  if (stateHash(res.world.state) !== res.meta.stateHash) fail("hash-lie", "loaded world does not match the fingerprint it reports");
  const readOnly = issues.length > 0;
  const use = (what: string, f: () => void) => { try { f(); } catch (e) { fail(readOnly ? "loaded-readonly-unusable" : "loaded-unusable", `file loaded${readOnly ? " read-only" : ""} but ${what} then threw ${(e as Error)?.name}: ${String((e as Error)?.message).slice(0, 160)}`); } };
  use("api.evaluate", () => api.evaluate(res!.world.state, "2026-10-06", { range: { from: "2026-10-01", to: "2026-10-31" } }));
  const cs = res.world.journal.changeSets;
  if (!readOnly && cs.length) use("api.undo of the last change set", () => { api.undo(res!.world, cs[cs.length - 1]!.id); });
  if (!readOnly) use("api.checkpoint and post", () => { api.post(api.checkpoint(res!.world, "t"), { from: "2026-10-01", to: "2026-10-31" }, "2026-10-06"); });
  const journalAltered = !sameSaved(res.world, m.base.world) && canonical(res.world.state) === canonical(m.base.world.state);
  return { kind: readOnly ? "loaded-readonly" : canonical(res.world.state) === canonical(m.base.world.state) ? "loaded-identical" : "loaded-different", journalAltered };
}

function hostileCase(className: string, idx: number, n: number): Case {
  return {
    id: className,
    budgetMs: 60000 + n * 400,
    run(ctx: CaseCtx) {
      const mut = mutators[className]!;
      const kinds: Record<string, number> = {};
      let journalAltered = 0, ran = 0;
      saved = 0;
      const bad = new Map<string, { n: number; first: Invariant }>();
      const only = args.raw.iter !== undefined ? Number(args.raw.iter) : null;
      for (let i = only ?? 0; i < (only !== null ? only + 1 : n); i++) {
        fs.mkdirSync(args.out, { recursive: true });
        fs.writeFileSync(path.join(args.out, "hostile-files.current"), `${className} iter ${i}\n`);
        const replay = `node --experimental-strip-types --no-warnings scripts/v3-pressure/suites/hostile-files.ts --level ${L} --case ${className} --iter ${i}`;
        const r = rng(idx * 100003 + i * 7 + 1);
        const m = mut(r);
        let p: { kind: string; journalAltered: boolean };
        try { p = probe(m, className, i, replay); }
        catch (e) {
          if (!(e instanceof Invariant)) throw e;
          const g = bad.get(e.invariant) ?? { n: 0, first: e };
          g.n++; bad.set(e.invariant, g);
          if (only !== null) console.log(`${m.desc} -> FAIL ${e.invariant}`);
          continue;
        }
        kinds[p.kind] = (kinds[p.kind] ?? 0) + 1;
        outcomeCounts[p.kind] = (outcomeCounts[p.kind] ?? 0) + 1;
        if (p.journalAltered) journalAltered++;
        ran++;
        if (only !== null) console.log(`${m.desc} -> ${p.kind}`);
      }
      if (bad.size) {
        const first = [...bad.values()][0]!.first;
        const total = [...bad.values()].reduce((a, g) => a + g.n, 0);
        throw new Invariant(first.invariant, `${total} of ${ran} damaged files broke the loader: ${[...bad].map(([k, g]) => `${k} x${g.n}`).join(", ")}. First: ${first.message}`, { replay: first.replay, actions: [...bad].map(([k, g]) => `${k} x${g.n}: ${g.first.message.slice(0, 260)}  REPLAY: ${g.first.replay}`) });
      }
      ctx.note(`${ran} files: ${Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ")}${journalAltered ? `; ${journalAltered} loaded with an ALTERED JOURNAL (journal is not covered by the fingerprint)` : ""}`);
      ctx.metric("files", ran);
      ctx.metric("journalAltered", journalAltered);
    },
  };
}

const per = pick3(L, 120, 600, 2500);
const names = Object.keys(mutators);
const cases = names.map((c, i) => hostileCase(c, i, c === "huge-strings" ? Math.max(10, Math.floor(per / 12)) : c === "huge-state" ? Math.max(6, Math.floor(per / 40)) : per));
await runSuite("hostile-files", cases, args);
