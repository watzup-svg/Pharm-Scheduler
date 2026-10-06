// World <-> SQLite file. SQLite is the SAVE FORMAT only: the app works on the typed domain World in memory.
// One table per domain table as (key, json), the change log append-only, the session (proposal/scenario) never saved.
import { canonical, checkIntegrity, emptySession, stateHash } from "../domain/src/index.ts";
import type { World } from "../domain/src/index.ts";
import type { ChangeSet, DomainState, Journal, NextIds, PostingSnapshot } from "../domain/src/types.ts";
import type { SqlDatabase, SqlJs } from "./sql-types.ts";

export const APP_ID = 0x50483353; // 'PH3S'
export const APP_NAME = "hischool-scheduler-v3";
export const SCHEMA_VERSION = 1;

export const KEYED_TABLES = ["stores", "pharmacists", "requirements", "dateOverrides", "unavailability", "assignments", "overrides", "cellCounts", "standing", "travel", "built"] as const;
type KeyedTable = (typeof KEYED_TABLES)[number];

const REQUIRED_TABLES = ["meta", ...KEYED_TABLES, "config", "nextId", "change_sets", "snapshots", "told", "checkpoints"];

export const DDL = `
PRAGMA application_id=${APP_ID};
PRAGMA user_version=${SCHEMA_VERSION};
CREATE TABLE meta(k TEXT PRIMARY KEY, v);
${KEYED_TABLES.map((t) => `CREATE TABLE ${t}(key TEXT PRIMARY KEY, json TEXT NOT NULL);`).join("\n")}
CREATE TABLE config(id INTEGER PRIMARY KEY CHECK(id = 1), json TEXT NOT NULL);
CREATE TABLE nextId(id INTEGER PRIMARY KEY CHECK(id = 1), json TEXT NOT NULL);
CREATE TABLE change_sets(seq INTEGER PRIMARY KEY, id TEXT NOT NULL, json TEXT NOT NULL);
CREATE TRIGGER change_sets_no_update BEFORE UPDATE ON change_sets BEGIN SELECT RAISE(ABORT, 'change_sets is append-only'); END;
CREATE TRIGGER change_sets_no_delete BEFORE DELETE ON change_sets BEGIN SELECT RAISE(ABORT, 'change_sets is append-only'); END;
CREATE TABLE snapshots(revision INTEGER PRIMARY KEY, json TEXT NOT NULL);
CREATE TABLE told(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE checkpoints(name TEXT PRIMARY KEY, after_change_set TEXT NOT NULL, state_hash TEXT NOT NULL);
`;

export type FileMeta = {
  appId: string;
  schemaVersion: number;
  dbUuid: string;
  /** Counts every committed change in this document's lineage. Used to tell which copy is newer. */
  rev: number;
  savedAt: string;
  stateHash: string;
};

export class CodecError extends Error {
  code: "unreadable" | "hash-mismatch";
  constructor(code: "unreadable" | "hash-mismatch", message: string) {
    super(message);
    this.name = "CodecError";
    this.code = code;
  }
}

/** The saved world has no session: proposals and scenarios are transient. */
export function savedForm(world: World): World {
  return { state: world.state, journal: world.journal, session: emptySession() };
}

export function worldToDb(SQL: SqlJs, world: World, meta: { dbUuid: string; rev: number; savedAt: string }): SqlDatabase {
  const db = new SQL.Database();
  try {
    db.exec(DDL);
    db.run("BEGIN");
    const s = world.state;
    for (const t of KEYED_TABLES) {
      const st = db.prepare(`INSERT INTO ${t}(key, json) VALUES (?, ?)`);
      for (const [k, v] of Object.entries(s[t as KeyedTable] as Record<string, unknown>)) st.run([k, JSON.stringify(v)]);
      st.free();
    }
    db.run("INSERT INTO config(id, json) VALUES (1, ?)", [JSON.stringify(s.config)]);
    db.run("INSERT INTO nextId(id, json) VALUES (1, ?)", [JSON.stringify(s.nextId)]);
    const cs = db.prepare("INSERT INTO change_sets(seq, id, json) VALUES (?, ?, ?)");
    for (const c of world.journal.changeSets) cs.run([c.seq, c.id, JSON.stringify(c)]);
    cs.free();
    const sn = db.prepare("INSERT INTO snapshots(revision, json) VALUES (?, ?)");
    for (const p of world.journal.snapshots) sn.run([p.revision, JSON.stringify(p)]);
    sn.free();
    const tl = db.prepare("INSERT INTO told(key, value) VALUES (?, ?)");
    for (const [k, v] of Object.entries(world.journal.told)) tl.run([k, v]);
    tl.free();
    const ck = db.prepare("INSERT INTO checkpoints(name, after_change_set, state_hash) VALUES (?, ?, ?)");
    for (const c of world.journal.checkpoints) ck.run([c.name, c.afterChangeSet, c.stateHash]);
    ck.free();
    const m = db.prepare("INSERT INTO meta(k, v) VALUES (?, ?)");
    m.run(["app", APP_NAME]);
    m.run(["schema_version", SCHEMA_VERSION]);
    m.run(["db_uuid", meta.dbUuid]);
    m.run(["rev", meta.rev]);
    m.run(["saved_at", meta.savedAt]);
    m.run(["state_hash", stateHash(s)]);
    m.free();
    db.run("COMMIT");
    return db;
  } catch (e) {
    db.close();
    throw e;
  }
}

export function exportWorld(SQL: SqlJs, world: World, meta: { dbUuid: string; rev: number; savedAt: string }): Uint8Array {
  const db = worldToDb(SQL, world, meta);
  try {
    return db.export();
  } finally {
    db.close();
  }
}

function rows(db: SqlDatabase, sql: string): unknown[][] {
  return db.exec(sql)[0]?.values ?? [];
}

function parse<T>(text: unknown, where: string): T {
  try {
    return JSON.parse(String(text)) as T;
  } catch {
    throw new CodecError("unreadable", `Unreadable data in ${where}`);
  }
}

export function readMeta(db: SqlDatabase): FileMeta {
  const m: Record<string, unknown> = {};
  for (const [k, v] of rows(db, "SELECT k, v FROM meta")) m[String(k)] = v;
  const need = (k: string) => {
    if (m[k] === undefined || m[k] === null) throw new CodecError("unreadable", `The file has no "${k}" entry`);
    return m[k];
  };
  return {
    appId: String(need("app")),
    schemaVersion: Number(need("schema_version")),
    dbUuid: String(need("db_uuid")),
    rev: Number(need("rev")),
    savedAt: String(need("saved_at")),
    stateHash: String(need("state_hash")),
  };
}

/** Rebuilds the World. Throws CodecError when a table is missing or a row cannot be parsed. Does not judge consistency (loadBytes does). */
export function dbToWorld(db: SqlDatabase): { world: World; meta: FileMeta } {
  const have = new Set(rows(db, "SELECT name FROM sqlite_master WHERE type = 'table'").map((r) => String(r[0])));
  const missing = REQUIRED_TABLES.filter((t) => !have.has(t));
  if (missing.length) throw new CodecError("unreadable", `The file is missing: ${missing.join(", ")}`);
  const meta = readMeta(db);
  const keyed = {} as Record<KeyedTable, Record<string, unknown>>;
  for (const t of KEYED_TABLES) {
    const o: Record<string, unknown> = {};
    // defineProperty: a hostile key such as "__proto__" must become a plain entry, not change the prototype.
    for (const [k, j] of rows(db, `SELECT key, json FROM ${t} ORDER BY rowid`)) Object.defineProperty(o, String(k), { value: parse(j, `${t} ${String(k)}`), enumerable: true, writable: true, configurable: true });
    keyed[t] = o;
  }
  const one = (t: string) => {
    const r = rows(db, `SELECT json FROM ${t} WHERE id = 1`)[0];
    if (!r) throw new CodecError("unreadable", `The file has no ${t} row`);
    return r[0];
  };
  const state = {
    ...keyed,
    config: parse(one("config"), "config"),
    nextId: parse<NextIds>(one("nextId"), "nextId"),
  } as unknown as DomainState;
  const changeSets = rows(db, "SELECT json FROM change_sets ORDER BY seq").map((r) => parse<ChangeSet>(r[0], "change_sets"));
  const snapshots = rows(db, "SELECT json FROM snapshots ORDER BY revision").map((r) => parse<PostingSnapshot>(r[0], "snapshots"));
  const told: Record<string, string> = {};
  for (const [k, v] of rows(db, "SELECT key, value FROM told ORDER BY rowid")) Object.defineProperty(told, String(k), { value: String(v), enumerable: true, writable: true, configurable: true });
  const checkpoints = rows(db, "SELECT name, after_change_set, state_hash FROM checkpoints ORDER BY rowid").map((r) => ({
    name: String(r[0]), afterChangeSet: String(r[1]), stateHash: String(r[2]),
  }));
  const journal: Journal = { changeSets, snapshots, told, checkpoints };
  return { world: { state, journal, session: emptySession() }, meta };
}

export type CheckFail = {
  ok: false;
  reason: "not-sqlite" | "integrity" | "wrong-app" | "newer" | "unsupported-version" | "unreadable" | "hash-mismatch";
  error: string;
};
export type DbOk = { ok: true; db: SqlDatabase };
export type LoadOk = { ok: true; world: World; meta: FileMeta; problems: string[] };

const SQLITE_HEADER = "SQLite format 3";

/** Header, integrity_check, application_id, user_version. Returns an open database on success. */
export function openChecked(SQL: SqlJs, bytes: Uint8Array): DbOk | CheckFail {
  if (bytes.length < 100 || String.fromCharCode(...bytes.slice(0, 15)) !== SQLITE_HEADER) {
    return { ok: false, reason: "not-sqlite", error: bytes.length === 0 ? "The file is empty." : "This is not a database file, or it was cut short." };
  }
  let db: SqlDatabase | null = null;
  try {
    db = new SQL.Database(bytes);
    const r = rows(db, "PRAGMA integrity_check");
    if (r.length !== 1 || r[0]![0] !== "ok") {
      const why = r.slice(0, 3).map((x) => String(x[0])).join("; ");
      db.close();
      return { ok: false, reason: "integrity", error: `The database check failed: ${why}` };
    }
    const app = rows(db, "PRAGMA application_id")[0]?.[0];
    if (app !== APP_ID) { db.close(); return { ok: false, reason: "wrong-app", error: "This is a database file, but not a Hi-School schedule." }; }
    const ver = Number(rows(db, "PRAGMA user_version")[0]?.[0]);
    if (ver > SCHEMA_VERSION) { db.close(); return { ok: false, reason: "newer", error: "This file was saved by a newer version of the scheduler." }; }
    if (ver < SCHEMA_VERSION) { db.close(); return { ok: false, reason: "unsupported-version", error: `This file uses an older format (${ver}) that this version cannot read.` }; }
    return { ok: true, db };
  } catch (e) {
    try { db?.close(); } catch { /* ignore */ }
    return { ok: false, reason: "integrity", error: `The file could not be read as a database: ${String((e as Error)?.message ?? e)}` };
  }
}

/** Plain-words refusal naming the first few unusable entries. */
export function damagedMessage(fatal: { table: string; key: string; problem: string }[]): string {
  const first = fatal.slice(0, 5).map((p) => `${p.table}${p.key ? ` ${p.key.slice(0, 40)}` : ""}: ${p.problem.slice(0, 80)}`).join("; ");
  return `This file has ${fatal.length} damaged ${fatal.length === 1 ? "entry" : "entries"} the scheduler cannot safely use (${first}${fatal.length > 5 ? "; ..." : ""}).`;
}

/** Full open of file bytes: checks, rebuild, hash check, consistency problems (reported, never repaired). */
export function loadBytes(SQL: SqlJs, bytes: Uint8Array): LoadOk | CheckFail {
  const c = openChecked(SQL, bytes);
  if (!c.ok) return c;
  try {
    const { world, meta } = dbToWorld(c.db);
    if (meta.appId !== APP_NAME) return { ok: false, reason: "wrong-app", error: "This is a database file, but not a Hi-School schedule." };
    const h = stateHash(world.state);
    if (h !== meta.stateHash) {
      return { ok: false, reason: "hash-mismatch", error: "The data in this file does not match the fingerprint saved with it, so it may have been changed outside the scheduler." };
    }
    const issues = checkIntegrity(world.state, world.journal);
    const fatal = issues.filter((p) => p.fatal);
    if (fatal.length) throw new CodecError("unreadable", damagedMessage(fatal));
    return { ok: true, world, meta, problems: issues.map((p) => `${p.table} ${p.key}: ${p.problem}`) };
  } catch (e) {
    if (e instanceof CodecError) return { ok: false, reason: e.code, error: e.message };
    return { ok: false, reason: "unreadable", error: `The file could not be read: ${String((e as Error)?.message ?? e)}` };
  } finally {
    c.db.close();
  }
}

/** Same as loadBytes but skips the integrity pragma and the hash check: used only to salvage what is readable from a damaged file. */
export function salvageBytes(SQL: SqlJs, bytes: Uint8Array): { world: World; meta: FileMeta } | null {
  let db: SqlDatabase | null = null;
  try {
    db = new SQL.Database(bytes);
    const r = dbToWorld(db);
    // A world that cannot be shown safely is not salvaged.
    return checkIntegrity(r.world.state, r.world.journal).some((p) => p.fatal) ? null : r;
  } catch {
    return null;
  } finally {
    try { db?.close(); } catch { /* ignore */ }
  }
}

/** Exact comparison of two worlds as saved (session ignored). */
export const sameSaved = (a: World, b: World): boolean => canonical({ s: a.state, j: a.journal }) === canonical({ s: b.state, j: b.journal });
