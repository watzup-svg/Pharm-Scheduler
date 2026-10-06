// Test 5: adapter logic against an in-memory fake FileSystemFileHandle (the native picker cannot be automated).
import initSqlJs from 'sql.js';
import { createStore, idbMem } from './adapter.js';
import { seed } from './seed.js';
import { writeFileSync, mkdirSync } from 'node:fs';

const SQL = await initSqlJs();
const cat = (cs) => { const o = new Uint8Array(cs.reduce((n, c) => n + c.length, 0)); let p = 0; for (const c of cs) { o.set(c, p); p += c.length; } return o; };
class FakeHandle {
  constructor(name, data = new Uint8Array(0)) { this.name = name; this.data = data; this.failMid = false; this.perm = 'granted'; this.swapWrites = 0; }
  async getFile() { const d = this.data; return { arrayBuffer: async () => d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) }; }
  async createWritable() { // swap-file semantics: nothing visible until close()
    const chunks = [], h = this;
    return { write: async (b) => { if (h.failMid) throw new Error('disk full (injected)'); chunks.push(new Uint8Array(b)); h.swapWrites++; }, close: async () => { h.data = cat(chunks); }, abort: async () => {} };
  }
}
const mkFs = (opts = {}) => ({
  kind: 'fsa', next: null, saveTarget: null, downloads: [],
  async pickOpen() { return { handle: this.next, name: this.next.name }; },
  async pickSave() { return this.saveTarget; },
  async permission(h, req) { if (h.perm === 'prompt' && req) h.perm = 'granted'; return h.perm; },
  ...opts,
});
const mk = (fs, idb = idbMem()) => createStore({ SQL, fs, idb, debounceMs: 1e9, onError: () => {} });
const results = []; let failed = 0;
const t = async (name, fn) => { try { const info = await fn(); results.push({ name, pass: true, info: info ?? '' }); console.log('PASS', name, info ?? ''); } catch (e) { failed++; results.push({ name, pass: false, info: e.message }); console.log('FAIL', name, e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const count = (s, tbl = 'assignments') => s.db.exec(`select count(*) from ${tbl}`)[0].values[0][0];
const smallSeed = (s) => s.bulk((d) => seed(d, { days: 30, logRows: 500 }));

await t('saveAs writes a verified, integrity-clean file', async () => {
  const fs = mkFs(), s = mk(fs); s.newDb(); await smallSeed(s);
  fs.saveTarget = new FakeHandle('a.sqlite'); const r = await s.saveAs();
  ok(r.ok, JSON.stringify(r)); const d = new SQL.Database(fs.saveTarget.data); ok(d.exec('pragma integrity_check')[0].values[0][0] === 'ok', 'integrity');
  ok(!s.status().dirty, 'still dirty'); return `${r.bytes} bytes`;
});
await t('save: failed mid-write leaves previous file intact and stays dirty', async () => {
  const fs = mkFs(), s = mk(fs); s.newDb(); await smallSeed(s); fs.saveTarget = new FakeHandle('a.sqlite'); await s.saveAs();
  const good = fs.saveTarget.data; await s.run('DELETE FROM assignments'); fs.saveTarget.failMid = true;
  const r = await s.save(); ok(!r.ok && r.reason === 'write-failed', JSON.stringify(r)); ok(fs.saveTarget.data === good, 'file changed'); ok(s.status().dirty, 'should stay dirty');
  fs.saveTarget.failMid = false; ok((await s.save()).ok, 'retry'); ok(new SQL.Database(fs.saveTarget.data).exec('select count(*) from assignments')[0].values[0][0] === 0, 'retry content');
});
await t('save: read-back verification detects a silently-corrupting writer', async () => {
  const fs = mkFs(), s = mk(fs); s.newDb(); await smallSeed(s); const h = new FakeHandle('a.sqlite'); fs.saveTarget = h; await s.saveAs();
  const orig = h.createWritable.bind(h); h.createWritable = async () => { const w = await orig(); const c = w.close; w.close = async () => { await c(); h.data = h.data.slice(0, h.data.length - 10); }; return w; };
  const r = await s.save(); ok(!r.ok && /verify/.test(r.error), JSON.stringify(r));
});
await t('change_log is append-only (UPDATE/DELETE rejected)', async () => {
  const s = mk(mkFs()); s.newDb(); await s.run("INSERT INTO stores VALUES (1,'x')", [], { op: 'add' });
  for (const q of ['UPDATE change_log SET op=1', 'DELETE FROM change_log']) { let threw = false; try { s.db.run(q); } catch { threw = true; } ok(threw, q); }
  ok(count(s, 'change_log') === 1, 'log row count');
});
await t('checkpoint + revert: data restored, log and checkpoints kept, revert undoable', async () => {
  const s = mk(mkFs()); s.newDb(); await smallSeed(s); const before = count(s), logBefore = count(s, 'change_log');
  const c = await s.checkpoint('v1'); await s.run('DELETE FROM assignments', [], { op: 'wipe' }); ok(count(s) === 0, 'wipe');
  const r = await s.revert(c.id); ok(count(s) === before, 'rows restored ' + count(s));
  ok(count(s, 'change_log') >= logBefore + 3, 'log kept: ' + count(s, 'change_log')); ok(s.db.exec("select count(*) from change_log where op='wipe'")[0].values[0][0] === 1, 'wipe entry kept');
  const names = s.listCheckpoints().map((x) => x.name); ok(names.length === 2 && names[1].startsWith('Auto: before revert'), names.join('|'));
  await s.revert(s.listCheckpoints()[1].id); ok(count(s) === 0, 'undo revert');
  return `ckpt ${c.rawBytes}B raw -> ${c.gzBytes}B gz`;
});
await t('reload after crash: IDB snapshot + journal recover un-saved edits newer than the file', async () => {
  const fs = mkFs(), idb = idbMem(), s = mk(fs, idb); s.newDb(); await smallSeed(s); const h = fs.saveTarget = new FakeHandle('a.sqlite'); await s.saveAs();
  for (let i = 0; i < 3; i++) await s.run("INSERT OR REPLACE INTO assignments VALUES ('2030-01-01',?,1,'day')", [i + 1], { op: 'assign' }); // journal only, no mirror/save
  const s2 = mk(fs, idb); const r = await s2.resume();
  ok(r.state === 'recovery-available' && r.mirrorRev === r.fileRev + 3 && r.journalReplayed === 3, JSON.stringify(r));
  ok(count(s2) === count(s) - 3, 'file side is older'); await s2.acceptRecovery(); ok(count(s2) === count(s), 'recovered'); ok((await s2.save()).ok, 'save after recover');
  return JSON.stringify({ fileRev: r.fileRev, mirrorRev: r.mirrorRev });
});
await t('permission lost on reopen -> needs-permission -> reconnect (user gesture)', async () => {
  const fs = mkFs(), idb = idbMem(), s = mk(fs, idb); s.newDb(); await smallSeed(s); const h = fs.saveTarget = new FakeHandle('a.sqlite'); await s.saveAs();
  h.perm = 'prompt'; const s2 = mk(fs, idb); const r = await s2.resume(); ok(r.state === 'needs-permission', JSON.stringify(r));
  const r2 = await s2.reconnect(); ok(r2.state === 'ok', JSON.stringify(r2)); ok(count(s2) === count(s));
});
await t('integrity failure: open refuses, current db untouched, offers checkpoint', async () => {
  const fs = mkFs(), idb = idbMem(), s = mk(fs, idb); s.newDb(); await s.bulk((d) => seed(d, { days: 200, logRows: 5000 })); await s.checkpoint('good');
  const h = fs.saveTarget = new FakeHandle('a.sqlite'); await s.saveAs();
  const bad = new FakeHandle('bad.sqlite', h.data.slice()); for (let i = 0; i < 4096; i++) bad.data[40960 + i] = (i * 31) & 255;
  const keep = count(s); fs.next = bad; const r = await s.open({ force: true });
  ok(r.state === 'refused' && r.reason === 'integrity', JSON.stringify(r)); ok(count(s) === keep, 'live db changed!');
  ok(r.offers.checkpoints.some((c) => c.source === 'idb-ckpt'), 'no idb ckpt offered');
  const rr = await s.restoreFrom(r.offers.checkpoints.find((c) => c.source === 'idb-ckpt'), r); ok(rr.mustSaveAs && !s.status().hasHandle);
  return `${r.error.slice(0, 60)} | offers: ${r.offers.checkpoints.map((c) => c.source).join(',')}`;
});
await t('truncated file / garbage file refused with friendly reason', async () => {
  const fs = mkFs(), s = mk(fs); s.newDb(); await smallSeed(s);
  for (const data of [new Uint8Array(0), new TextEncoder().encode('hello world'.repeat(50)), (() => { const h = fs.saveTarget = new FakeHandle('x'); return h; })() && s.db.export().slice(0, 9000)]) {
    fs.next = new FakeHandle('t.sqlite', data); const r = await s.open({ force: true }); ok(r.state === 'refused', 'not refused len ' + data.length);
  }
});
await t('open with unsaved changes asks first; saveAs gives new lineage id', async () => {
  const fs = mkFs(), s = mk(fs); s.newDb(); await smallSeed(s); fs.saveTarget = new FakeHandle('a.sqlite'); await s.saveAs();
  const u1 = s.db.exec("select v from meta where k='db_uuid'")[0].values[0][0]; await s.run('DELETE FROM assignments');
  ok((await s.open()).state === 'unsaved-changes', 'no guard'); fs.saveTarget = new FakeHandle('b.sqlite'); await s.saveAs();
  ok(s.db.exec("select v from meta where k='db_uuid'")[0].values[0][0] !== u1, 'uuid unchanged');
});
await t('fallback backend (no handles): save() reports no-handle, download() hands out bytes, open from bytes', async () => {
  const dl = []; const fs = { kind: 'download', pickSave: null, async permission() { return 'granted'; }, download: (n, b) => dl.push([n, b]), async pickOpen() { return { name: 'copy.sqlite', bytes: dl[0][1] }; } };
  const s = mk(fs); s.newDb(); await smallSeed(s);
  ok((await s.save()).reason === 'no-handle' && (await s.saveAs()).reason === 'unsupported', 'save/saveAs'); s.download(); ok(dl.length === 1 && !s.status().dirty);
  const s2 = mk(fs); const r = await s2.open(); ok(r.state === 'ok' && !r.linked && count(s2) === count(s), JSON.stringify(r));
});

mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
writeFileSync(new URL('./results/unit-fake.json', import.meta.url), JSON.stringify(results, null, 1));
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
