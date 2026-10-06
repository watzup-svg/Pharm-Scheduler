// Persistence adapter. No DOM access: everything environment-specific is injected.
//   SQL  : the sql.js module ({Database})
//   fs   : file backend  { pickOpen(), pickSave(name), permission(handle, request), download(name, bytes) }
//   idb  : tiny KV backend { get, put, del, delUpTo, all, clear }   (IndexedDB or in-memory)
//   opfs : optional OPFS directory handle (second mirror copy), or null
// Public surface: resume open save saveAs mirror checkpoint revert (+ run, status, download, recovery/restore helpers)

const APP_ID = 0x50484152; // 'PHAR'
const SCHEMA_VERSION = 1;
const MAX_IDB_CHECKPOINTS = 10;

export const DDL = `
PRAGMA application_id=${APP_ID};
PRAGMA user_version=${SCHEMA_VERSION};
CREATE TABLE meta(k TEXT PRIMARY KEY, v);
CREATE TABLE stores(id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE pharmacists(id INTEGER PRIMARY KEY, name TEXT NOT NULL, home_store INTEGER REFERENCES stores(id));
CREATE TABLE assignments(day TEXT NOT NULL, pharmacist_id INTEGER NOT NULL, store_id INTEGER, shift TEXT NOT NULL, PRIMARY KEY(day, pharmacist_id)) WITHOUT ROWID;
CREATE TABLE change_log(id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, actor TEXT, op TEXT NOT NULL, entity TEXT, entity_id TEXT, detail TEXT);
CREATE TRIGGER change_log_no_update BEFORE UPDATE ON change_log BEGIN SELECT RAISE(ABORT,'change_log is append-only'); END;
CREATE TRIGGER change_log_no_delete BEFORE DELETE ON change_log BEGIN SELECT RAISE(ABORT,'change_log is append-only'); END;
CREATE TABLE checkpoints(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, created_at TEXT NOT NULL, rev INTEGER NOT NULL, raw_size INTEGER, blob BLOB NOT NULL);
`;

// ---------- small helpers ----------
const scalar = (d, sql, p = []) => { const r = d.exec(sql, p); return r.length ? r[0].values[0][0] : null; };
const metaGet = (d, k) => scalar(d, 'SELECT v FROM meta WHERE k=?', [k]);
const uuid = () => (globalThis.crypto?.randomUUID?.() ?? 'u' + Math.random().toString(36).slice(2) + Date.now().toString(36));
async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}
const gzip = (b) => pipe(b, new CompressionStream('gzip'));
const gunzip = (b) => pipe(b, new DecompressionStream('gzip'));
const sameBytes = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
async function readHandle(h) { const f = await h.getFile(); return new Uint8Array(await f.arrayBuffer()); }
async function writeHandle(h, bytes) {
  // FSA: createWritable() writes to a swap file; close() atomically replaces the target. abort() discards the swap.
  const w = await h.createWritable();
  try { await w.write(bytes); await w.close(); } catch (e) { try { await w.abort(); } catch {} throw e; }
}
const isAbort = (e) => e && (e.name === 'AbortError' || e.cancelled);

// ---------- KV backends ----------
export function idbMem() {
  const s = {};
  const st = (n) => (s[n] ??= new Map());
  return {
    async get(n, k) { return st(n).get(k); },
    async put(n, k, v) { st(n).set(k, typeof v?.getFile === 'function' ? v : structuredClone(v)) /* real IDB clones FS handles natively */; },
    async del(n, k) { st(n).delete(k); },
    async delUpTo(n, k) { for (const x of [...st(n).keys()]) if (x <= k) st(n).delete(x); },
    async all(n) { return [...st(n).entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([key, value]) => ({ key, value })); },
    async clear(n) { st(n).clear(); },
  };
}
export function idbReal(indexedDB, name = 'pharm-persist-spike') {
  const STORES = ['kv', 'journal', 'ckpt'];
  const dbp = new Promise((res, rej) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => STORES.forEach((s) => r.result.createObjectStore(s));
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const tx = async (n, mode, fn) => {
    const db = await dbp;
    return new Promise((res, rej) => {
      const t = db.transaction(n, mode, { durability: 'strict' });
      let out; const q = fn(t.objectStore(n));
      if (q) q.onsuccess = () => { out = q.result; };
      t.oncomplete = () => res(out); t.onerror = t.onabort = () => rej(t.error);
    });
  };
  return {
    get: (n, k) => tx(n, 'readonly', (o) => o.get(k)),
    put: (n, k, v) => tx(n, 'readwrite', (o) => o.put(v, k)),
    del: (n, k) => tx(n, 'readwrite', (o) => o.delete(k)),
    delUpTo: (n, k) => tx(n, 'readwrite', (o) => o.delete(IDBKeyRange.upperBound(k))),
    clear: (n) => tx(n, 'readwrite', (o) => o.clear()),
    async all(n) {
      const keys = await tx(n, 'readonly', (o) => o.getAllKeys());
      const vals = await tx(n, 'readonly', (o) => o.getAll());
      return keys.map((key, i) => ({ key, value: vals[i] }));
    },
  };
}

// ---------- file backends ----------
// Real File System Access backend (Chromium). Thin wrapper; cannot be automated (native picker).
export function fsaBackend(win) {
  const types = [{ description: 'Pharm Scheduler database', accept: { 'application/vnd.sqlite3': ['.sqlite', '.db'] } }];
  return {
    kind: 'fsa',
    async pickOpen() { const [handle] = await win.showOpenFilePicker({ types, multiple: false }); return { handle, name: handle.name }; },
    async pickSave(name) { return win.showSaveFilePicker({ suggestedName: name, types }); },
    async permission(h, request) {
      const o = { mode: 'readwrite' };
      let p = await h.queryPermission(o);
      if (p !== 'granted' && request) p = await h.requestPermission(o); // needs a user gesture
      return p;
    },
    download: null,
  };
}
// Fallback backend (Firefox/Safari): <input type=file> to open, Blob download to "save". No handle, no overwrite.
export function downloadBackend(doc) {
  return {
    kind: 'download',
    pickOpen() {
      return new Promise((res, rej) => {
        const i = doc.createElement('input'); i.type = 'file'; i.accept = '.sqlite,.db';
        i.onchange = async () => { const f = i.files[0]; f ? res({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }) : rej(Object.assign(new Error('cancelled'), { cancelled: true })); };
        i.click();
      });
    },
    pickSave: null,
    async permission() { return 'granted'; },
    download(name, bytes) {
      const a = doc.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.sqlite3' }));
      a.download = name; doc.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    },
  };
}

// ---------- the store ----------
export function createStore({ SQL, fs, idb, opfs = null, now = () => new Date().toISOString(), debounceMs = 2000, maxWaitMs = 30000, onError = console.error }) {
  let db = null, handle = null, fileName = 'pharm-scheduler.sqlite', rev = 0, savedRev = 0, mirrorRev = 0;
  let timer = null, firstDirty = 0, staged = null, pendingMirror = null;

  const readRev = (d) => Number(metaGet(d, 'rev'));
  function check(bytes) {
    try {
      if (bytes.length < 100 || String.fromCharCode(...bytes.slice(0, 15)) !== 'SQLite format 3') return { ok: false, error: 'not a SQLite file (bad header / truncated)' };
      const d = new SQL.Database(bytes);
      const r = scalar(d, 'PRAGMA integrity_check');
      if (r !== 'ok') { const all = d.exec('PRAGMA integrity_check')[0].values.slice(0, 3).map((x) => x[0]).join('; '); d.close(); return { ok: false, error: 'integrity_check: ' + all }; }
      if (scalar(d, 'PRAGMA application_id') !== APP_ID) { d.close(); return { ok: false, error: 'not a Pharm Scheduler database' }; }
      if (scalar(d, 'PRAGMA user_version') > SCHEMA_VERSION) { d.close(); return { ok: false, error: 'file is from a newer version of the app' }; }
      return { ok: true, db: d };
    } catch (e) { return { ok: false, error: String(e.message || e) }; }
  }
  function applyOp(d, op) {
    d.run('BEGIN');
    try {
      d.run(op.sql, op.params ?? []);
      const l = op.log ?? {};
      d.run('INSERT INTO change_log(ts,actor,op,entity,entity_id,detail) VALUES (?,?,?,?,?,?)', [l.ts ?? now(), l.actor ?? 'user', l.op ?? 'sql', l.entity ?? null, l.entity_id ?? null, l.detail ?? null]);
      d.run("UPDATE meta SET v=v+1 WHERE k='rev'");
      d.run('COMMIT');
    } catch (e) { try { d.run('ROLLBACK'); } catch {} throw e; }
  }
  function adopt(d, { savedAtRev = null } = {}) {
    db?.close(); db = d; rev = readRev(d); savedRev = savedAtRev ?? rev; mirrorRev = 0;
  }
  async function loadMirror() {
    const snap = await idb.get('kv', 'snap');
    if (snap) {
      const c = check(snap.bytes);
      if (c.ok) {
        let replayed = 0;
        for (const { value: e } of await idb.all('journal')) {
          if (e.rev <= readRev(c.db)) continue;
          try { applyOp(c.db, e); replayed++; } catch (err) { onError('journal replay failed', e.rev, err); break; }
        }
        return { db: c.db, source: 'idb', replayed, snapRev: snap.rev };
      }
    }
    if (opfs) {
      try { const c = check(await readHandle(await opfs.getFileHandle('mirror.sqlite'))); if (c.ok) return { db: c.db, source: 'opfs', replayed: 0 }; } catch {}
    }
    return null;
  }
  async function rescueList(bytes) {
    const out = [];
    for (const { key, value: v } of await idb.all('ckpt')) out.push({ source: 'idb-ckpt', id: key, name: v.name, created_at: v.created_at, rev: v.rev });
    try { // salvage the in-file checkpoints table from a damaged file, if still readable
      const d = new SQL.Database(bytes);
      for (const r of d.exec('SELECT id,name,created_at,rev FROM checkpoints ORDER BY id')[0]?.values ?? []) out.push({ source: 'file-ckpt', id: r[0], name: r[1], created_at: r[2], rev: r[3], _bytes: bytes });
      d.close();
    } catch {}
    return out;
  }
  async function refuse(reason, error, mir, bytes) {
    const ckpts = await rescueList(bytes ?? new Uint8Array(0));
    pendingMirror = mir ?? pendingMirror;
    return { state: 'refused', reason, error, offers: { mirror: mir ? { rev: readRev(mir.db), source: mir.source } : null, checkpoints: ckpts.map(({ _bytes, ...x }) => x) }, _rescueBytes: bytes };
  }
  async function finishLink(mir) {
    let bytes;
    try { bytes = await readHandle(handle); } catch (e) { return refuse('read-failed', String(e.message || e), mir); }
    const c = check(bytes);
    if (!c.ok) return refuse('integrity', c.error, mir, bytes);
    adopt(c.db);
    if (mir && metaGet(mir.db, 'db_uuid') === metaGet(db, 'db_uuid') && readRev(mir.db) > rev) {
      staged = mir;
      return { state: 'recovery-available', fileRev: rev, mirrorRev: readRev(mir.db), source: mir.source, journalReplayed: mir.replayed };
    }
    const foreign = mir && metaGet(mir.db, 'db_uuid') !== metaGet(db, 'db_uuid');
    mir?.db.close();
    await idb.clear('journal');
    return { state: 'ok', rev, note: foreign ? 'mirror belonged to another database; ignored' : undefined };
  }
  async function writeAndVerify(h) {
    const t0 = performance.now(); const bytes = db.export(); const r = rev;
    await writeHandle(h, bytes);
    const back = await readHandle(h);
    if (!sameBytes(back, bytes)) throw new Error('verify failed: file on disk differs from what was written');
    return { r, bytes: bytes.length, ms: performance.now() - t0 };
  }
  async function persistHandle(h) { try { await idb.put('kv', 'handle', h); } catch (e) { onError('cannot persist handle', e); } }
  function schedule() {
    firstDirty ||= Date.now();
    clearTimeout(timer);
    timer = setTimeout(() => mirror().catch(onError), Math.max(0, Math.min(debounceMs, firstDirty + maxWaitMs - Date.now())));
  }
  async function snapshotBytes() { // db without the checkpoints table content (no recursion)
    const t = new SQL.Database(db.export()); t.run('DELETE FROM checkpoints'); t.run('VACUUM');
    const b = t.export(); t.close(); return b;
  }

  async function mirror() {
    clearTimeout(timer); firstDirty = 0;
    const t0 = performance.now(), r = rev, bytes = db.export();
    await idb.put('kv', 'snap', { bytes, rev: r, uuid: metaGet(db, 'db_uuid'), at: now() });
    await idb.delUpTo('journal', r);
    let opfsOk = false;
    if (opfs) { try { await writeHandle(await opfs.getFileHandle('mirror.sqlite', { create: true }), bytes); opfsOk = true; } catch (e) { onError('opfs mirror', e); } }
    mirrorRev = r;
    return { rev: r, bytes: bytes.length, ms: performance.now() - t0, opfs: opfsOk };
  }

  const api = {
    get db() { return db; },
    status: () => ({ rev, savedRev, mirrorRev, dirty: rev > savedRev, hasHandle: !!handle, fileName, backend: fs.kind, recoveryPending: !!staged }),

    newDb(name = 'pharm-scheduler.sqlite') {
      const d = new SQL.Database(); d.exec(DDL);
      d.run("INSERT INTO meta VALUES ('rev',0),('db_uuid',?),('created',?)", [uuid(), now()]);
      db?.close(); db = d; rev = 0; savedRev = 0; handle = null; fileName = name; return d;
    },
    // Mutate: one transaction = statement + change_log row + rev bump. Resolves once durable in the IDB journal.
    async run(sql, params = [], log = {}) {
      if (staged) throw new Error('resolve the pending recovery first');
      const op = { sql, params, log: { ts: now(), ...log } };
      applyOp(db, op); rev = readRev(db);
      await idb.put('journal', rev, { rev, ...op });
      schedule(); return rev;
    },
    // Bulk load (seed/import): not journaled, mirrored immediately.
    async bulk(fn) { db.run('BEGIN'); try { fn(db); db.run("UPDATE meta SET v=v+1 WHERE k='rev'"); db.run('COMMIT'); } catch (e) { db.run('ROLLBACK'); throw e; } rev = readRev(db); return mirror(); },

    // Called on page load. Never prompts.
    async resume() {
      const h = await idb.get('kv', 'handle'); const mir = await loadMirror(); // FS handles are structured-cloneable into IndexedDB (Chromium)
      if (!h) { if (mir) { adopt(mir.db, { savedAtRev: 0 }); return { state: 'mirror-only', source: mir.source, rev }; } return { state: 'empty' }; }
      handle = fs.revive ? fs.revive(h) : h; fileName = handle.name;
      if ((await fs.permission(handle, false)) !== 'granted') { pendingMirror = mir; return { state: 'needs-permission', fileName, hasMirror: !!mir }; }
      return finishLink(mir);
    },
    // Must be called from a click: requests readwrite permission on the remembered handle.
    async reconnect() {
      if ((await fs.permission(handle, true)) !== 'granted') return { state: 'denied' };
      const mir = pendingMirror; pendingMirror = null; return finishLink(mir);
    },
    acceptRecovery: async () => { adopt(staged.db, { savedAtRev: readRev(db) }); staged = null; await idb.clear('journal'); await mirror(); return api.status(); },
    discardRecovery: async () => { staged.db.close(); staged = null; await idb.clear('journal'); await mirror(); return api.status(); },

    // User picks a file. Refuses (and leaves the current db untouched) if integrity fails.
    async open({ force = false } = {}) {
      if (db && rev > savedRev && !force) return { state: 'unsaved-changes' };
      let p; try { p = await fs.pickOpen(); } catch (e) { if (isAbort(e)) return { state: 'cancelled' }; throw e; }
      let bytes; try { bytes = p.handle ? await readHandle(p.handle) : p.bytes; } catch (e) { return refuse('read-failed', String(e.message || e), null); }
      const c = check(bytes);
      if (!c.ok) return refuse('integrity', c.error, await loadMirror(), bytes);
      adopt(c.db); handle = p.handle ?? null; fileName = p.name; staged = null; pendingMirror = null;
      if (handle) await persistHandle(handle); else await idb.del('kv', 'handle');
      await idb.clear('journal'); await mirror();
      return { state: 'ok', rev, linked: !!handle };
    },
    // After a refusal: adopt the mirror or a checkpoint. Detaches from the damaged file (next save must be Save As).
    async restoreFrom(offer, refusal) {
      let d;
      if (offer.source === 'mirror') { d = pendingMirror?.db; }
      else if (offer.source === 'idb-ckpt') { const v = await idb.get('ckpt', offer.id); d = check(await gunzip(v.gz)).db; }
      else if (offer.source === 'file-ckpt') { const t = new SQL.Database(refusal._rescueBytes); const blob = scalar(t, 'SELECT blob FROM checkpoints WHERE id=?', [offer.id]); t.close(); d = check(await gunzip(blob)).db; }
      if (!d) throw new Error('offer unavailable');
      adopt(d, { savedAtRev: 0 }); handle = null; pendingMirror = null; await idb.del('kv', 'handle'); await idb.clear('journal'); await mirror();
      return { state: 'restored', rev, mustSaveAs: true };
    },

    // Safest FSA save: createWritable -> swap file -> atomic replace on close(); then read back and compare.
    async save() {
      if (!handle) return { ok: false, reason: 'no-handle' };
      if ((await fs.permission(handle, false)) !== 'granted') return { ok: false, reason: 'needs-permission' };
      try { const w = await writeAndVerify(handle); savedRev = w.r; return { ok: true, bytes: w.bytes, ms: w.ms }; }
      catch (e) { return { ok: false, reason: 'write-failed', error: String(e.message || e) }; }
    },
    // New file chosen by user; becomes the current file with a NEW lineage id (so old file isn't mistaken for the mirror's source).
    async saveAs() {
      if (!fs.pickSave) return { ok: false, reason: 'unsupported' };
      let h; try { h = await fs.pickSave(fileName); } catch (e) { if (isAbort(e)) return { ok: false, reason: 'cancelled' }; throw e; }
      applyOp(db, { sql: "UPDATE meta SET v=? WHERE k='db_uuid'", params: [uuid()], log: { op: 'save-as', detail: h.name } }); rev = readRev(db);
      try { const w = await writeAndVerify(h); handle = h; fileName = h.name; savedRev = w.r; await persistHandle(h); await idb.clear('journal'); await mirror(); return { ok: true, bytes: w.bytes, ms: w.ms, name: h.name }; }
      catch (e) { return { ok: false, reason: 'write-failed', error: String(e.message || e) }; }
    },
    mirror,
    // Fallback / extra safety copy: browser download. Cannot verify the user kept it.
    download() { const bytes = db.export(); fs.download?.(fileName, bytes) ?? (() => { throw new Error('no download backend'); })(); savedRev = rev; return { bytes: bytes.length, unverified: true }; },

    async checkpoint(name) {
      const t0 = performance.now();
      const snap = await snapshotBytes(), gz = await gzip(snap), at = now(), r = rev;
      applyOp(db, { sql: 'INSERT INTO checkpoints(name,created_at,rev,raw_size,blob) VALUES (?,?,?,?,?)', params: [name, at, r, snap.length, gz], log: { op: 'checkpoint', entity: 'checkpoint', detail: name } });
      rev = readRev(db);
      const id = scalar(db, 'SELECT max(id) FROM checkpoints');
      await idb.put('ckpt', id, { id, name, created_at: at, rev: r, uuid: metaGet(db, 'db_uuid'), gz });
      const all = await idb.all('ckpt'); for (const x of all.slice(0, Math.max(0, all.length - MAX_IDB_CHECKPOINTS))) await idb.del('ckpt', x.key);
      await mirror();
      return { id, rawBytes: snap.length, gzBytes: gz.length, ms: performance.now() - t0 };
    },
    listCheckpoints: () => (db.exec('SELECT id,name,created_at,rev,raw_size,length(blob) FROM checkpoints ORDER BY id')[0]?.values ?? []).map(([id, name, created_at, rev, raw, gz]) => ({ id, name, created_at, rev, raw, gz })),
    // Replace live data with a checkpoint; keeps checkpoints and the full change_log, adds a 'revert' log row; auto-checkpoints first so it is undoable.
    async revert(id, { backup = true } = {}) {
      const blob = scalar(db, 'SELECT blob FROM checkpoints WHERE id=?', [id]); const nm = scalar(db, 'SELECT name FROM checkpoints WHERE id=?', [id]);
      if (!blob) throw new Error('no such checkpoint');
      const c = check(await gunzip(blob)); if (!c.ok) throw new Error('checkpoint is damaged: ' + c.error);
      if (backup) await api.checkpoint('Auto: before revert to ' + nm);
      const nd = c.db, maxLog = scalar(nd, 'SELECT coalesce(max(id),0) FROM change_log'), nrev = rev + 1;
      nd.run('BEGIN');
      const ins = nd.prepare('INSERT INTO checkpoints(id,name,created_at,rev,raw_size,blob) VALUES (?,?,?,?,?,?)');
      const s1 = db.prepare('SELECT id,name,created_at,rev,raw_size,blob FROM checkpoints'); while (s1.step()) ins.run(s1.get()); s1.free(); ins.free();
      const ins2 = nd.prepare('INSERT INTO change_log(id,ts,actor,op,entity,entity_id,detail) VALUES (?,?,?,?,?,?,?)');
      const s2 = db.prepare('SELECT id,ts,actor,op,entity,entity_id,detail FROM change_log WHERE id>?', [maxLog]); while (s2.step()) ins2.run(s2.get()); s2.free(); ins2.free();
      nd.run('INSERT INTO change_log(ts,actor,op,entity,detail) VALUES (?,?,?,?,?)', [now(), 'user', 'revert', 'checkpoint', nm]);
      nd.run("UPDATE meta SET v=? WHERE k='rev'", [nrev]); nd.run('COMMIT');
      db.close(); db = nd; rev = nrev;
      await mirror(); return { rev, revertedTo: nm };
    },
    _flush: async () => { clearTimeout(timer); return mirror(); },
  };
  return api;
}
