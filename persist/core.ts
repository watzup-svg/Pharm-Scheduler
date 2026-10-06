// The save layer. Truth = the user's .sqlite file. The browser (IndexedDB) keeps a mirror so a crash or a closed tab loses nothing.
// DOM-free: the file backend, the key-value store, the clock and sql.js are injected, so the same code runs in Node tests and in the page.
import { checkIntegrity } from "../domain/src/index.ts";
import type { ChangeSet, World } from "../domain/src/index.ts";
import type { BootResult, Offer, OpenResult, PersistApi, SaveResult, SaveStatus } from "../app3/persist-types.ts";
import { exportWorld, loadBytes, salvageBytes } from "./codec.ts";
import type { LoadOk } from "./codec.ts";
import { makeEntry, replayEntry } from "./replay.ts";
import type { JournalEntry } from "./replay.ts";
import type { FileBackend, HandleLike } from "./backends.ts";
import type { Kv } from "./idb.ts";
import type { SqlJs } from "./sql-types.ts";

export type PersistDeps = {
  SQL: SqlJs | (() => Promise<SqlJs>);
  fs: FileBackend;
  idb: Kv;
  now?: () => string;
  uuid?: () => string;
  /** Snapshot mirror debounce (default 2 s) and the longest a change may wait for one (default 30 s). */
  debounceMs?: number;
  maxWaitMs?: number;
  onError?: (what: string, e: unknown) => void;
};

type SnapRecord = { bytes: Uint8Array; rev: number; uuid: string; at: string };
type StateRecord = { uuid: string; savedRev: number; lastSavedAt: string | null; fileName: string | null };
type MirrorLoad = {
  world: World; rev: number; uuid: string; savedRev: number; lastSavedAt: string | null; fileName: string | null;
  replayed: number; incomplete: boolean;
};
type CkptRecord = { bytes: Uint8Array; uuid: string; rev: number; at: string; name: string; fileName: string | null; kind: "saved" | "set-aside" };

const MAX_SAVED_COPIES = 3;
const MAX_SET_ASIDE = 5;

const msg = (e: unknown): string => String((e as { message?: unknown })?.message ?? e);
const isAbort = (e: unknown): boolean => !!e && ((e as { name?: string }).name === "AbortError" || !!(e as { cancelled?: boolean }).cancelled);
const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};
async function readHandle(h: HandleLike): Promise<Uint8Array> {
  const f = await h.getFile();
  return new Uint8Array(await f.arrayBuffer());
}
// createWritable() writes to a swap file; close() replaces the target atomically; abort() discards the swap.
async function writeHandle(h: HandleLike, bytes: Uint8Array): Promise<void> {
  const w = await h.createWritable();
  try {
    await w.write(bytes);
    await w.close();
  } catch (e) {
    try { await w.abort?.(); } catch { /* ignore */ }
    throw e;
  }
}
const defaultUuid = (): string => (globalThis.crypto?.randomUUID?.() ?? `u${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`);
const hasContent = (w: World): boolean => Object.keys(w.state.stores).length > 0 || w.journal.changeSets.length > 0;

export type Persist = PersistApi & {
  /** Write the browser snapshot now (used on tab hide and in tests). */
  flush(): Promise<void>;
};

export function createPersist(deps: PersistDeps): Persist {
  const { fs, idb } = deps;
  const now = deps.now ?? (() => new Date().toISOString());
  const newUuid = deps.uuid ?? defaultUuid;
  const debounceMs = deps.debounceMs ?? 2000;
  const maxWaitMs = deps.maxWaitMs ?? 30_000;
  const onError = deps.onError ?? ((what, e) => console.error(what, e));

  let sqlP: Promise<SqlJs> | null = null;
  const getSQL = (): Promise<SqlJs> => (sqlP ??= Promise.resolve(typeof deps.SQL === "function" ? deps.SQL() : deps.SQL));

  // ---- the document this layer is tracking ----
  let handle: HandleLike | null = null;
  let fileName: string | null = null;
  let uuid: string | null = null;
  let rev = 0;
  let savedRev = 0;
  let lastSavedAt: string | null = null;
  let lastWorld: World | null = null;
  // Mirror bookkeeping
  let baseline = false; // a snapshot for the current uuid exists in the browser
  let shadowTold: Record<string, string> | null = null; // `told` as a replay of snapshot + journal would reproduce it
  let journalGap = false;
  let mirrorOk = false;
  let needsPermission = false;
  let awaitingBoot = false;
  let error: string | null = null;
  let staged: { file: LoadOk; mir: MirrorLoad } | null = null;
  let pendingMirror: MirrorLoad | null = null;
  let stash: { mirror: MirrorLoad | null; salvage: { world: World; rev: number } | null; fileName: string | null } | null = null;
  let lastBoot: BootResult | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let firstDirty = 0;
  let chain: Promise<unknown> = Promise.resolve();

  const subs = new Set<() => void>();
  let snapshot: SaveStatus;
  const computeStatus = (): SaveStatus => {
    const neverSaved = !handle && lastSavedAt === null && lastWorld !== null && hasContent(lastWorld);
    return {
      backend: fs.kind,
      fileName,
      linked: !!handle,
      unsavedChanges: Math.max(0, rev - savedRev),
      lastSavedAt,
      mirrorOk,
      needsPermission,
      error,
      neverSaved,
      recoveryPending: !!staged,
    };
  };
  const notify = () => {
    snapshot = computeStatus();
    subs.forEach((f) => f());
  };
  snapshot = computeStatus();
  const isDirty = (): boolean => rev > savedRev || computeStatus().neverSaved === true;

  const ensureUuid = (): string => (uuid ??= newUuid());

  // ---------------- browser mirror ----------------
  async function loadMirror(): Promise<MirrorLoad | null> {
    try {
      const snap = (await idb.get("kv", "snap")) as SnapRecord | undefined;
      if (!snap) return null;
      const SQL = await getSQL();
      const r = loadBytes(SQL, snap.bytes);
      if (!r.ok) { onError("browser copy unreadable", r.error); return null; }
      let world = r.world;
      let at = r.meta.rev;
      let replayed = 0;
      let incomplete = false;
      const entries = (await idb.all("journal")).map((x) => x.value as JournalEntry).filter((e) => e.rev > at).sort((a, b) => a.rev - b.rev);
      for (const e of entries) {
        if (e.rev !== at + 1) { incomplete = true; break; }
        const w = replayEntry(world, e);
        if (!w) { incomplete = true; break; }
        world = w;
        at = e.rev;
        replayed++;
      }
      const st = (await idb.get("kv", "state")) as StateRecord | undefined;
      const same = st && st.uuid === r.meta.dbUuid;
      return {
        world, rev: at, uuid: r.meta.dbUuid, savedRev: same ? st.savedRev : 0, lastSavedAt: same ? st.lastSavedAt : null,
        fileName: same ? st.fileName : null, replayed, incomplete,
      };
    } catch (e) {
      onError("browser copy could not be read", e);
      mirrorOk = false;
      return null;
    }
  }

  async function putState(): Promise<void> {
    if (!uuid) return;
    const st: StateRecord = { uuid, savedRev, lastSavedAt, fileName };
    await idb.put("kv", "state", st);
  }

  async function doMirror(): Promise<void> {
    if (!lastWorld) return;
    const SQL = await getSQL();
    const id = ensureUuid();
    const r = rev;
    const w = lastWorld;
    const bytes = exportWorld(SQL, w, { dbUuid: id, rev: r, savedAt: now() });
    try {
      const snap: SnapRecord = { bytes, rev: r, uuid: id, at: now() };
      await idb.put("kv", "snap", snap);
      await putState();
      await idb.delUpTo("journal", r);
    } catch (e) {
      mirrorOk = false;
      error = `Could not keep a copy in this browser: ${msg(e)}`;
      notify();
      throw e;
    }
    if (!baseline) shadowTold = w.journal.told;
    baseline = true;
    journalGap = false;
    mirrorOk = true;
    if (error?.startsWith("Could not keep a copy")) error = null;
    notify();
  }

  function mirrorNow(): Promise<void> {
    if (timer) clearTimeout(timer);
    timer = null;
    firstDirty = 0;
    const run = chain.then(doMirror, doMirror);
    chain = run.catch(() => undefined);
    return run;
  }

  function schedule(delay?: number): void {
    firstDirty ||= Date.now();
    if (timer) clearTimeout(timer);
    const wait = delay ?? Math.max(0, Math.min(debounceMs, firstDirty + maxWaitMs - Date.now()));
    timer = setTimeout(() => { mirrorNow().catch((e) => onError("mirror", e)); }, wait);
    (timer as { unref?: () => void }).unref?.(); // never keep a Node process alive
  }

  async function putCkpt(key: string, rec: CkptRecord): Promise<void> {
    await idb.put("ckpt", key, rec);
    const all = (await idb.all("ckpt")).filter((x) => (x.value as CkptRecord).kind === rec.kind);
    const keep = rec.kind === "saved" ? MAX_SAVED_COPIES : MAX_SET_ASIDE;
    for (const x of all.slice(0, Math.max(0, all.length - keep))) await idb.del("ckpt", x.key);
  }
  async function keepSavedCopy(bytes: Uint8Array, at: string): Promise<void> {
    try {
      await putCkpt(`${at}|saved`, { bytes, uuid: uuid ?? "", rev, at, name: `Saved copy of ${fileName ?? "the schedule"}`, fileName, kind: "saved" });
    } catch (e) { onError("could not keep a safety copy", e); }
  }
  /** Before the browser copy of unsaved work is replaced, keep it somewhere the user can still get it. */
  async function setAside(world: World | null, why: string, srcUuid: string, srcRev: number, srcName: string | null): Promise<void> {
    if (!world) return;
    try {
      const SQL = await getSQL();
      const at = now();
      const bytes = exportWorld(SQL, world, { dbUuid: srcUuid, rev: srcRev, savedAt: at });
      await putCkpt(`${at}|set-aside`, { bytes, uuid: srcUuid, rev: srcRev, at, name: `Set aside ${why}`, fileName: srcName, kind: "set-aside" });
    } catch (e) { onError("could not set work aside", e); }
  }

  async function rememberHandle(h: HandleLike | null): Promise<void> {
    try {
      if (h) await idb.put("kv", "handle", h);
      else await idb.del("kv", "handle");
    } catch (e) {
      onError("could not remember the file", e);
      if (h) error = "Saved, but this browser could not remember where the file is, so you will need to open it again next time.";
    }
  }

  // ---------------- adopting a loaded document ----------------
  function adoptLoaded(l: { world: World; uuid: string; rev: number; savedRev: number; lastSavedAt: string | null; fileName: string | null }, h: HandleLike | null): void {
    handle = h;
    fileName = l.fileName;
    uuid = l.uuid;
    rev = l.rev;
    savedRev = l.savedRev;
    lastSavedAt = l.lastSavedAt;
    lastWorld = l.world;
    baseline = false;
    shadowTold = null;
    journalGap = false;
    needsPermission = false;
    awaitingBoot = false;
    error = null;
    staged = null;
    pendingMirror = null;
  }

  async function resetMirror(): Promise<void> {
    try { await idb.clear("journal"); } catch (e) { onError("journal", e); }
    try { await mirrorNow(); } catch { /* status carries the error */ }
  }

  function worldResult(world: World, name: string | null, problems: string[], extra: { note?: string } = {}): { state: "world"; world: World; fileName?: string; readOnly?: { problems: string[] }; note?: string } {
    return { state: "world", world, ...(name ? { fileName: name } : {}), ...(problems.length ? { readOnly: { problems } } : {}), ...extra };
  }

  // ---------------- refusing a file ----------------
  async function refuse(reason: string, errorText: string, bytes: Uint8Array | null, ctx: { boot: boolean; fileName: string | null; mirror: MirrorLoad | null }): Promise<{ state: "refused"; reason: string; error: string; offers: Offer[] }> {
    const offers: Offer[] = [];
    const mirror = ctx.mirror;
    if (mirror && (ctx.boot || !lastWorld)) offers.push({ source: "mirror", id: "mirror", name: `The copy kept in this browser${mirror.fileName ? ` (${mirror.fileName})` : ""}` });
    let salvage: { world: World; rev: number } | null = null;
    try {
      for (const x of (await idb.all("ckpt")).reverse()) {
        const v = x.value as CkptRecord;
        offers.push({ source: "idb-ckpt", id: String(x.key), name: v.name, at: v.at });
      }
    } catch (e) { onError("safety copies unavailable", e); }
    if (bytes && bytes.length > 0 && (reason === "integrity" || reason === "unreadable")) {
      const s = salvageBytes(await getSQL(), bytes);
      if (s) {
        salvage = { world: s.world, rev: s.meta.rev };
        offers.push({ source: "file-ckpt", id: "salvage", name: "What can still be read from the damaged file" });
      }
    }
    stash = { mirror, salvage, fileName: ctx.fileName };
    return { state: "refused", reason, error: errorText, offers };
  }

  // ---------------- linking to the user's file ----------------
  async function finishLink(mir: MirrorLoad | null): Promise<BootResult> {
    const h = handle!;
    const SQL = await getSQL();
    let bytes: Uint8Array;
    try { bytes = await readHandle(h); } catch (e) { return refuse("read-failed", `The file could not be read: ${msg(e)}`, null, { boot: true, fileName: h.name, mirror: mir }); }
    const r = loadBytes(SQL, bytes);
    if (!r.ok) return refuse(r.reason, r.error, bytes, { boot: true, fileName: h.name, mirror: mir });
    const fileL = { world: r.world, uuid: r.meta.dbUuid, rev: r.meta.rev, savedRev: r.meta.rev, lastSavedAt: r.meta.savedAt, fileName: h.name };
    if (mir && mir.uuid === r.meta.dbUuid && mir.rev > r.meta.rev) {
      adoptLoaded(fileL, h);
      staged = { file: r, mir };
      pendingMirror = null;
      notify();
      return { state: "recovery", fileRev: r.meta.rev, mirrorRev: mir.rev, world: r.world, mirrorWorld: mir.world };
    }
    if (mir && mir.uuid !== r.meta.dbUuid && mir.rev > mir.savedRev) await setAside(mir.world, "from another schedule", mir.uuid, mir.rev, mir.fileName);
    adoptLoaded(fileL, h);
    await keepSavedCopy(bytes, r.meta.savedAt);
    await resetMirror();
    notify();
    return worldResult(r.world, h.name, r.problems);
  }

  async function writeVerified(h: HandleLike, bytes: Uint8Array): Promise<void> {
    let prev: Uint8Array | null = null;
    try { prev = await readHandle(h); } catch { /* new or unreadable file: nothing to put back */ }
    await writeHandle(h, bytes);
    const back = await readHandle(h);
    if (!sameBytes(back, bytes)) {
      if (prev && prev.length) { try { await writeHandle(h, prev); } catch { /* best effort */ } }
      throw new Error("The file on disk is not what was written, so the save was not accepted.");
    }
  }

  // ---------------- the API ----------------
  const api: Persist = {
    async boot() {
      let h: unknown;
      let mir: MirrorLoad | null = null;
      try {
        h = await idb.get("kv", "handle");
        mirrorOk = true;
        mir = await loadMirror();
      } catch (e) {
        mirrorOk = false;
        error = `This browser's storage is not available, so nothing is kept between visits: ${msg(e)}`;
        notify();
        lastBoot = { state: "empty" };
        return lastBoot;
      }
      let r: BootResult;
      if (!h) {
        if (mir) {
          adoptLoaded(mir, null);
          const note = `Restored from the copy kept in this browser (not saved to a file yet).${mir.incomplete ? " The last few changes could not be recovered." : ""}`;
          await resetMirror();
          r = worldResult(mir.world, mir.fileName, [], { note });
        } else {
          mirrorOk = true;
          r = { state: "empty" };
        }
      } else {
        handle = fs.revive ? fs.revive(h) : (h as HandleLike);
        fileName = handle.name;
        let perm: string;
        try { perm = await fs.permission(handle, false); } catch { perm = "prompt"; }
        if (perm !== "granted") {
          needsPermission = true;
          awaitingBoot = true;
          pendingMirror = mir;
          r = { state: "needs-permission", fileName: handle.name };
        } else {
          r = await finishLink(mir);
        }
      }
      lastBoot = r;
      notify();
      return r;
    },

    async recordCommit(world: World, cs: ChangeSet) {
      ensureUuid();
      lastWorld = world;
      rev += 1;
      const myRev = rev;
      notify();
      if (!baseline) {
        // No browser baseline for this document yet (a fresh or imported world): a snapshot of this world covers the commit.
        shadowTold = world.journal.told;
        await mirrorNow();
        return;
      }
      const entry = makeEntry(myRev, world, cs, shadowTold);
      shadowTold = world.journal.told;
      try {
        await idb.put("journal", myRev, entry);
      } catch (e) {
        journalGap = true;
        mirrorOk = false;
        error = `Could not keep a copy in this browser: ${msg(e)}`;
        notify();
        schedule(0);
        throw e;
      }
      if (!journalGap) mirrorOk = true;
      schedule();
      notify();
    },

    async adopt(world: World, name?: string) {
      if (name !== undefined) {
        // A different document: keep the old one's unsaved work set aside rather than overwrite it silently.
        if (lastWorld && uuid && isDirty() && lastWorld !== world) await setAside(lastWorld, "before starting another schedule", uuid, rev, fileName);
        handle = null;
        await rememberHandle(null);
        uuid = newUuid();
        rev = 0;
        savedRev = 0;
        lastSavedAt = null;
        fileName = name;
        lastWorld = world;
        needsPermission = false;
        awaitingBoot = false;
        staged = null;
        pendingMirror = null;
        error = null;
        lastBoot = null;
        baseline = false;
        shadowTold = null;
        await resetMirror();
        notify();
        return;
      }
      // Same document, but a change that is not a change set (checkpoint, posting, told). Snapshot it at once.
      ensureUuid();
      lastWorld = world;
      rev += 1;
      shadowTold = world.journal.told;
      notify();
      try { await mirrorNow(); } catch { /* status carries the error */ }
    },

    async open(opts?: { force?: boolean }): Promise<OpenResult> {
      if (!opts?.force && isDirty()) return { state: "unsaved-changes" };
      let p;
      try { p = await fs.pickOpen(); } catch (e) {
        if (isAbort(e)) return { state: "cancelled" };
        return { state: "refused", reason: "read-failed", error: `The file could not be opened: ${msg(e)}`, offers: [] };
      }
      let bytes: Uint8Array;
      try { bytes = p.handle ? await readHandle(p.handle) : p.bytes!; } catch (e) {
        return refuse("read-failed", `The file could not be read: ${msg(e)}`, null, { boot: false, fileName: p.name, mirror: null });
      }
      const SQL = await getSQL();
      const r = loadBytes(SQL, bytes);
      if (!r.ok) {
        return refuse(r.reason, r.error, bytes, { boot: false, fileName: p.name, mirror: lastWorld ? null : await loadMirror() });
      }
      if (lastWorld && uuid && isDirty() && lastWorld !== r.world) await setAside(lastWorld, "before opening another file", uuid, rev, fileName);
      adoptLoaded({ world: r.world, uuid: r.meta.dbUuid, rev: r.meta.rev, savedRev: r.meta.rev, lastSavedAt: r.meta.savedAt, fileName: p.name }, p.handle ?? null);
      lastBoot = null;
      await rememberHandle(p.handle ?? null);
      if (p.handle) await keepSavedCopy(bytes, r.meta.savedAt);
      await resetMirror();
      notify();
      return worldResult(r.world, p.name, r.problems);
    },

    async save(world: World): Promise<SaveResult> {
      if (!handle) return { ok: false, reason: fs.kind === "fsa" ? "no-handle" : "unsupported" };
      let perm: string;
      try { perm = await fs.permission(handle, false); } catch { perm = "prompt"; }
      if (perm !== "granted") {
        needsPermission = true;
        notify();
        return { ok: false, reason: "needs-permission" };
      }
      const SQL = await getSQL();
      const at = now();
      const r = rev;
      const bytes = exportWorld(SQL, world, { dbUuid: ensureUuid(), rev: r, savedAt: at });
      try {
        await writeVerified(handle, bytes);
      } catch (e) {
        error = `Not saved: ${msg(e)} Your previous file is unchanged.`;
        notify();
        return { ok: false, reason: "write-failed", error: msg(e) };
      }
      savedRev = r;
      lastSavedAt = at;
      error = null;
      needsPermission = false;
      try { await putState(); } catch (e) { onError("state", e); }
      await keepSavedCopy(bytes, at);
      notify();
      return { ok: true, at, bytes: bytes.length };
    },

    async saveAs(world: World): Promise<SaveResult> {
      if (!fs.pickSave) return { ok: false, reason: "unsupported" };
      let h: HandleLike;
      try { h = await fs.pickSave(fileName ?? "Schedule.sqlite"); } catch (e) {
        if (isAbort(e)) return { ok: false, reason: "cancelled" };
        return { ok: false, reason: "write-failed", error: msg(e) };
      }
      const SQL = await getSQL();
      const at = now();
      const id = newUuid(); // a new lineage: an old file is never mistaken for this document's browser copy
      const r = rev;
      const bytes = exportWorld(SQL, world, { dbUuid: id, rev: r, savedAt: at });
      try {
        await writeVerified(h, bytes);
      } catch (e) {
        error = `Not saved: ${msg(e)}`;
        notify();
        return { ok: false, reason: "write-failed", error: msg(e) };
      }
      handle = h;
      fileName = h.name;
      uuid = id;
      savedRev = r;
      lastSavedAt = at;
      lastWorld = world;
      needsPermission = false;
      error = null;
      baseline = false;
      shadowTold = null;
      await rememberHandle(h);
      await keepSavedCopy(bytes, at);
      await resetMirror();
      notify();
      return { ok: true, at, bytes: bytes.length };
    },

    async download(world: World): Promise<SaveResult> {
      if (!fs.download) return { ok: false, reason: "unsupported" };
      const SQL = await getSQL();
      const at = now();
      const bytes = exportWorld(SQL, world, { dbUuid: ensureUuid(), rev, savedAt: at });
      try { fs.download(fileName ?? "Schedule.sqlite", bytes); } catch (e) { return { ok: false, reason: "write-failed", error: msg(e) }; }
      // A download is a copy the browser cannot verify. With no linked file it is the best "saved" there is; with one it changes nothing.
      if (!handle) {
        savedRev = rev;
        lastSavedAt = at;
        try { await putState(); } catch (e) { onError("state", e); }
        notify();
      }
      return { ok: true, at, bytes: bytes.length };
    },

    async reconnect(): Promise<BootResult> {
      if (!handle) return { state: "empty" };
      let perm: string;
      try { perm = await fs.permission(handle, true); } catch { perm = "denied"; }
      if (perm !== "granted") {
        error = "The browser did not give access to the file. Choose Reconnect again and allow it, or open the file.";
        notify();
        return { state: "needs-permission", fileName: handle.name };
      }
      needsPermission = false;
      error = null;
      if (!awaitingBoot) {
        // Permission lapsed mid-session: nothing to reload, the live schedule stays as it is.
        notify();
        return lastWorld ? { state: "world", world: lastWorld, note: "Reconnected." } : { state: "empty" };
      }
      awaitingBoot = false;
      const m = pendingMirror;
      pendingMirror = null;
      const r = await finishLink(m);
      lastBoot = r;
      notify();
      return r;
    },

    async resolveRecovery(choice: "file" | "mirror"): Promise<OpenResult> {
      const s = staged;
      if (!s) return { state: "cancelled" };
      if (choice === "mirror") {
        adoptLoaded({ world: s.mir.world, uuid: s.mir.uuid, rev: s.mir.rev, savedRev: s.file.meta.rev, lastSavedAt: s.file.meta.savedAt, fileName }, handle);
      } else {
        await setAside(s.mir.world, "(browser copy, newer than the file)", s.mir.uuid, s.mir.rev, fileName);
        adoptLoaded({ world: s.file.world, uuid: s.file.meta.dbUuid, rev: s.file.meta.rev, savedRev: s.file.meta.rev, lastSavedAt: s.file.meta.savedAt, fileName }, handle);
      }
      lastBoot = null;
      await resetMirror();
      notify();
      const w = lastWorld!;
      const problems = choice === "mirror" ? checkIntegrity(w.state).map((p) => `${p.table} ${p.key}: ${p.problem}`) : s.file.problems;
      return worldResult(w, fileName, problems);
    },

    async restore(offer: Offer): Promise<OpenResult> {
      if (staged && offer.source === "mirror") return api.resolveRecovery!("mirror");
      const st = stash;
      if (!st) return { state: "cancelled" };
      let world: World | null = null;
      let srcRev = 0;
      let note: string[] = [];
      if (offer.source === "mirror") {
        if (st.mirror) { world = st.mirror.world; srcRev = st.mirror.rev; }
      } else if (offer.source === "file-ckpt") {
        if (st.salvage) {
          world = st.salvage.world;
          srcRev = st.salvage.rev;
          note = ["This was recovered from a damaged file. Look it over carefully, and use Save As to keep a copy."];
        }
      } else {
        const v = (await idb.get("ckpt", String(offer.id))) as CkptRecord | undefined;
        if (v) {
          const r = loadBytes(await getSQL(), v.bytes);
          if (r.ok) { world = r.world; srcRev = r.meta.rev; }
        }
      }
      if (!world) return { state: "refused", reason: "offer-unavailable", error: "That copy is no longer available.", offers: [] };
      const problems = [...note, ...checkIntegrity(world.state).map((p) => `${p.table} ${p.key}: ${p.problem}`)];
      // Detach from the damaged file: the next save must be Save As, never an overwrite.
      const name = st.fileName ? `Recovered ${st.fileName}` : "Recovered schedule.sqlite";
      adoptLoaded({ world, uuid: newUuid(), rev: srcRev + 1, savedRev: srcRev, lastSavedAt: null, fileName: name }, null);
      stash = null;
      lastBoot = null;
      await rememberHandle(null);
      await resetMirror();
      notify();
      return worldResult(world, name, problems);
    },

    status: () => snapshot,
    subscribe(fn) {
      subs.add(fn);
      return () => { subs.delete(fn); };
    },
    lastBoot: () => lastBoot,
    async flush() {
      if (lastWorld) await mirrorNow();
    },
  };
  return api;
}

