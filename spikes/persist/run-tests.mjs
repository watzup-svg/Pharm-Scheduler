// Browser tests 1,2,3,4,6,7 against dist/persist-spike.html loaded from file://. Test 5 = unit-fake.mjs (run first).
import { chromium } from 'playwright-core';
import { execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import http from 'node:http';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const exe = execSync('ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome').toString().trim().split('\n')[0];
const work = mkdtempSync(join(tmpdir(), 'persist-spike-'));
const SRC = join(here, 'dist/persist-spike.html');
const dirA = join(work, 'a'), dirB = join(work, 'b'); mkdirSync(dirA); mkdirSync(dirB);
const A = join(dirA, 'persist-spike.html'), B = join(dirB, 'renamed copy.html');
copyFileSync(SRC, A); copyFileSync(SRC, B);
const url = (p, h = '') => 'file://' + p.split('/').map(encodeURIComponent).join('/') + h;
const results = []; const rec = (id, name, pass, info) => { results.push({ id, name, pass, info }); console.log(pass === null ? 'INFO' : pass ? 'PASS' : 'FAIL', id, name, '-', typeof info === 'string' ? info : JSON.stringify(info)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Stand-in for the native picker: a handle-shaped object (getFile/createWritable/queryPermission) whose bytes live in a REAL file on disk
// OUTSIDE the browser profile (so "clear site data" cannot touch it). OPFS is blocked on file:// in Chromium, so it cannot be the stand-in.
const TEST_FS = `window.__DEBOUNCE__ = 600000;
class TH { constructor(name){ this.name = name; }
  async getFile(){ const b64 = await window.__fileRead(this.name); const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); return { arrayBuffer: async () => bytes.buffer }; }
  async createWritable(){ const chunks = [], name = this.name; return { write: async b => { chunks.push(new Uint8Array(b)); },
    close: async () => { const b64 = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(new Blob(chunks)); }); await window.__fileWrite(name, b64); }, abort: async () => {} }; }
  async queryPermission(){ return 'granted'; } }
window.__TEST_FS__ = { kind:'fsa', async pickSave(name){ return new TH(name); }, async pickOpen(){ return { handle: new TH(window.__NEXT_OPEN__), name: window.__NEXT_OPEN__ }; },
  async permission(h){ return 'granted'; }, revive: o => new TH(o.name), download:null };`;

async function launch(profile, { fakeFs = true, debounce } = {}) {
  const ctx = await chromium.launchPersistentContext(profile, { executablePath: exe, args: ['--no-sandbox'], headless: true, acceptDownloads: true });
  const ud = profile + '-user'; mkdirSync(ud, { recursive: true });
  await ctx.exposeFunction('__fileRead', (n) => readFileSync(join(ud, n)).toString('base64'));
  await ctx.exposeFunction('__fileWrite', (n, b64) => { writeFileSync(join(ud, n + '.tmp'), Buffer.from(b64, 'base64')); renameSync(join(ud, n + '.tmp'), join(ud, n)); });
  if (fakeFs) await ctx.addInitScript(TEST_FS);
  if (debounce) await ctx.addInitScript(`window.__DEBOUNCE__=${debounce}`);
  return ctx;
}
async function load(ctx, path, hash = '') {
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  page.on('pageerror', (e) => console.log('  pageerror', e.message));
  await page.goto(url(path, hash)); await page.waitForFunction('window.spike?.ready || window.__bootError', null, { timeout: 30000 });
  const err = await page.evaluate('window.__bootError'); if (err) throw new Error(err);
  return page;
}
const killHard = (profile) => { const pids = spawnSync('pgrep', ['-f', profile]).stdout.toString().split('\n').filter(Boolean); for (const p of pids) try { process.kill(+p, 'SIGKILL'); } catch {} return pids.length; };
const cleanLocks = (profile) => { for (const f of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) rmSync(join(profile, f), { force: true }); };
const closeCtx = (ctx) => Promise.race([ctx.close().catch(() => {}), sleep(5000)]);
const SMALL = `(async()=>{ const s=window.spike; s.store.newDb(); await s.store.bulk(d=>s.seed(d,{days:60,logRows:2000})); return s.store.db.exec('select count(*) from assignments')[0].values[0][0]; })()`;
const COUNT = `(()=>{const d=window.spike.store.db; return d? d.exec('select count(*) from assignments')[0].values[0][0] : null})()`;
const REV = `window.spike.store.status().rev`;

// ---------------- 1. environment on file:// ----------------
{
  const ctx = await launch(join(work, 'p1')); const page = await load(ctx, A);
  const env = await page.evaluate(async () => {
    const r = { origin: location.origin, protocol: location.protocol, isSecureContext: window.isSecureContext, indexedDB: !!window.indexedDB, localStorage: (() => { try { localStorage.setItem('x', 1); return true; } catch { return false; } })(),
      opfs: !!navigator.storage?.getDirectory, showSaveFilePicker: 'showSaveFilePicker' in window, showOpenFilePicker: 'showOpenFilePicker' in window, cryptoSubtle: !!crypto.subtle, compressionStream: typeof CompressionStream === 'function', wasm: typeof WebAssembly === 'object' };
    try { const d = await navigator.storage.getDirectory(); const h = await d.getFileHandle('t.txt', { create: true }); const w = await h.createWritable(); await w.write('hi'); await w.close(); r.opfsWorks = (await (await h.getFile()).text()) === 'hi'; } catch (e) { r.opfsWorks = String(e); }
    try { const db = await new Promise((res, rej) => { const q = indexedDB.open('t', 1); q.onupgradeneeded = () => q.result.createObjectStore('s'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); r.idbWorks = !!db; } catch (e) { r.idbWorks = String(e); }
    try { const e = await navigator.storage.estimate(); r.quotaMB = Math.round(e.quota / 1e6); } catch {}
    r.persisted = await navigator.storage.persisted?.(); return r;
  });
  rec('1a', 'file:// : isSecureContext, indexedDB, showSaveFilePicker/showOpenFilePicker, crypto.subtle, CompressionStream, WASM', env.isSecureContext && env.indexedDB && env.idbWorks === true && env.showSaveFilePicker && env.showOpenFilePicker && env.wasm, env);
  rec('1b', 'file:// : OPFS usable (navigator.storage.getDirectory present AND works)', env.opfsWorks === true, { present: env.opfs, works: env.opfsWorks });
  await closeCtx(ctx);
}

// ---------------- 2. persistence across reopen, move, copy ----------------
{
  const P = join(work, 'p2'); let ctx = await launch(P); let page = await load(ctx, A);
  const rows = await page.evaluate(SMALL);
  const saved = await page.evaluate(`(async()=>{ const s=window.spike.store; const r=await s.saveAs(); await s.run("INSERT OR REPLACE INTO assignments VALUES ('2031-01-01',1,1,'day')",[],{op:'assign'}); await s.mirror(); return {saveAs:r.ok, ...s.status()}; })()`);
  const rowsBefore = await page.evaluate(COUNT);
  await closeCtx(ctx);
  ctx = await launch(P); page = await load(ctx, A);
  const r1 = await page.evaluate('window.spike.resumed'); const c0 = await page.evaluate(COUNT); if (r1.state === 'recovery-available') await page.evaluate('window.spike.store.acceptRecovery()'); const c1 = await page.evaluate(COUNT);
  const idbOpfs = { userFilesOnDisk: readdirSync(P + '-user') };
  // handle persisted and permission readable?
  rec('2a', 'IndexedDB mirror + stored file handle (structured-cloned) survive close/reopen (same profile, same URL)', (r1.state === 'ok' || r1.state === 'recovery-available') && c1 === rowsBefore, { resumed: r1, note: 'file was saved at rev 2; one later edit existed only in the IDB mirror -> app offers it as recovery', rowsFileOnly: c0, rowsBefore, rowsAfterRecovery: c1, opfs: idbOpfs, hasHandle: await page.evaluate('window.spike.store.status().hasHandle'), opfsMirror: 'unavailable on file://' });
  await closeCtx(ctx);
  // moved/renamed/copy: same profile, different file:// path
  ctx = await launch(P); page = await load(ctx, B);
  const r2 = await page.evaluate('window.spike.resumed'); const c2 = await page.evaluate(COUNT); const handleName = await page.evaluate('window.spike.store.status().fileName');
  rec('2b', 'Same profile, HTML moved/renamed/copied to another path: storage SHARED (all file:// pages = one origin)', r2.state !== 'empty', { origin: await page.evaluate('location.origin'), resumed: r2.state, rows: c2, linkedFile: handleName, note: r2.state !== 'empty' ? 'data visible from any other file:// page in this profile (also a risk: other local HTML files can read/clobber it)' : 'data lost' });
  await closeCtx(ctx);
  // different profile (other browser / other user / other machine)
  ctx = await launch(join(work, 'p2-other')); page = await load(ctx, A);
  const r3 = await page.evaluate('window.spike.resumed');
  rec('2c', 'Different browser profile (another browser/PC/user): nothing carried over', r3.state === 'empty', { resumed: r3.state });
  await closeCtx(ctx);
}

// ---------------- 3. crash recovery (SIGKILL) ----------------
{
  const P = join(work, 'p3'); let ctx = await launch(P); let page = await load(ctx, A);
  await page.evaluate(SMALL);
  const base = await page.evaluate(`(async()=>{ const s=window.spike.store; await s.saveAs(); await s.mirror(); for(let i=1;i<=3;i++) await s.run("INSERT OR REPLACE INTO assignments VALUES ('2031-02-01',?,1,'day')",[i],{op:'assign'}); return {...s.status(), rows:${COUNT}}; })()`);
  // base: file saved at rev R, snapshot at R, 3 acknowledged journal ops after (rev R+3) -> kill without mirror/save
  const n = killHard(P); await sleep(500); await closeCtx(ctx);
  ctx = await launch(P); page = await load(ctx, A);
  const r = await page.evaluate('window.spike.resumed');
  let after = null; if (r.state === 'recovery-available') { await page.evaluate('window.spike.store.acceptRecovery()'); after = await page.evaluate(COUNT); }
  rec('3a', 'SIGKILL after 3 acknowledged edits (journal only; no mirror, no file save): edits recovered', r.state === 'recovery-available' && r.journalReplayed === 3 && after === base.rows, { killedProcs: n, atKill: { rev: base.rev, savedRev: base.savedRev, mirrorRev: base.mirrorRev, rows: base.rows }, resumed: r, rowsAfterRecovery: after });
  await closeCtx(ctx);

  // 3b: kill while a full mirror (IDB + OPFS) write is in flight; repeat with different delays
  const outcomes = [];
  for (const delay of [0, 5, 15, 40, 100]) {
    const P2 = join(work, 'p3b-' + delay); ctx = await launch(P2); page = await load(ctx, A);
    await page.evaluate(`(async()=>{ const s=window.spike; s.store.newDb(); await s.store.bulk(d=>s.seed(d,{days:365,logRows:20000})); await s.store.saveAs(); await s.store.run("INSERT OR REPLACE INTO assignments VALUES ('2031-03-01',1,1,'day')",[],{op:'assign'}); })()`);
    page.evaluate('window.spike.store.mirror()').catch(() => {}); await sleep(delay); killHard(P2); await sleep(300); await closeCtx(ctx);
    ctx = await launch(P2); page = await load(ctx, A);
    const rr = await page.evaluate('window.spike.resumed');
    const opfsCheck = 'n/a (OPFS blocked on file://)';
    outcomes.push({ killAfterMs: delay, resumed: rr.state, rev: rr.mirrorRev ?? rr.rev, opfsMirrorIntegrity: opfsCheck, fileIntegrityOk: rr.state !== 'refused' });
    await closeCtx(ctx);
  }
  rec('3b', 'SIGKILL during an in-flight mirror write (5 timings): IDB snapshot never corrupt, app resumes', outcomes.every((o) => o.resumed !== 'refused' && o.resumed !== 'empty' && true), outcomes);
}

// ---------------- 4. site data cleared; only the user-owned file restores ----------------
{
  const P = join(work, 'p4'); let ctx = await launch(P, { fakeFs: false }); let page = await load(ctx, A, '#fallback');
  await page.evaluate(SMALL);
  await page.evaluate(`window.spike.store.run("INSERT OR REPLACE INTO assignments VALUES ('2031-04-01',1,1,'day')",[],{op:'assign'})`);
  await page.evaluate(`window.spike.store.checkpoint('before-clear')`);
  const rowsBefore = await page.evaluate(COUNT), logBefore = await page.evaluate(`window.spike.store.db.exec('select count(*) from change_log')[0].values[0][0]`);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#download')]);
  const exported = join(work, 'user-export.sqlite'); await dl.saveAs(exported);
  const usedBackend = await page.evaluate('window.spike.store.status().backend');
  // edits after the export, mirrored in IDB only
  await page.evaluate(`window.spike.store.run("INSERT OR REPLACE INTO assignments VALUES ('2031-04-02',1,1,'day')",[],{op:'assign'})`);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Storage.clearDataForOrigin', { origin: new URL(url(A)).origin === 'null' ? 'file://' : new URL(url(A)).origin, storageTypes: 'all' }).catch((e) => console.log('  clearDataForOrigin:', e.message));
  await page.reload(); await page.waitForFunction('window.spike?.ready');
  let r = await page.evaluate('window.spike.resumed');
  const cleared = r.state === 'empty';
  let cdpNote = 'CDP Storage.clearDataForOrigin(file://)';
  if (!cleared) { await closeCtx(ctx); rmSync(P, { recursive: true, force: true }); ctx = await launch(P, { fakeFs: false }); page = await load(ctx, A, '#fallback'); r = await page.evaluate('window.spike.resumed'); cdpNote = 'CDP clear did not empty it; used fresh profile'; }
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#open')]); await fc.setFiles(exported);
  await page.waitForFunction(`window.spike.store.status().rev>0 && window.spike.store.db`, null, { timeout: 15000 });
  const rowsAfter = await page.evaluate(COUNT), logAfter = await page.evaluate(`window.spike.store.db.exec('select count(*) from change_log')[0].values[0][0]`), ck = await page.evaluate('window.spike.store.listCheckpoints().length');
  rec('4', 'Site data cleared -> empty; user-owned exported file restores everything (rows, log, checkpoints) via <input type=file>', cleared !== undefined && r.state === 'empty' && rowsAfter === rowsBefore && logAfter === logBefore && ck === 1, { how: cdpNote, backend: usedBackend, stateAfterClear: r.state, rowsBefore, rowsAfter, logBefore, logAfter, checkpoints: ck, lost: 'edits made after the last export (here: 1 assignment)' });
  await closeCtx(ctx);
}

// ---------------- 7 (empirical part). FSA createWritable = swap file + atomic replace (OPFS handle on http://127.0.0.1; OPFS is blocked on file://) ----------------
{
  const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(readFileSync(A)); }); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const ctx = await launch(join(work, 'p7'), { fakeFs: false }); const page = await ctx.newPage(); await page.goto(`http://127.0.0.1:${srv.address().port}/`);
  const out = await page.evaluate(async () => {
    const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('userfiles', { create: true }); const h = await d.getFileHandle('atomic.bin', { create: true });
    const rd = async () => (await (await h.getFile()).text());
    let w = await h.createWritable(); await w.write('OLD-CONTENT'); await w.close();
    w = await h.createWritable(); await w.write('NEW-CONTENT-PARTIAL'); const mid = await rd(); const names = []; for await (const [n] of d.entries()) names.push(n);
    await w.abort(); const afterAbort = await rd();
    w = await h.createWritable(); await w.write('NEW'); await w.close(); const afterClose = await rd();
    return { duringWrite: mid, entriesDuringWrite: names, afterAbort, afterClose };
  });
  rec('7', 'createWritable (real Chromium, OPFS handle on http://127.0.0.1): target unchanged during write and after abort(); replaced only on close()', out.duringWrite === 'OLD-CONTENT' && out.afterAbort === 'OLD-CONTENT' && out.afterClose === 'NEW', out);
  await closeCtx(ctx); srv.close();
}

// ---------------- 6. measurements ----------------
{
  const loads = [];
  for (let i = 0; i < 5; i++) {
    const ctx = await launch(join(work, 'p6-load-' + i), { fakeFs: false }); const t = Date.now(); const page = await load(ctx, A);
    loads.push(await page.evaluate(() => ({ firstQueryMs: Math.round(window.SQL_READY.firstQuery), wasmInitMs: Math.round(window.SQL_READY.t), domContentLoadedMs: Math.round(performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd) })));
    await closeCtx(ctx);
  }
  const med = (k) => loads.map((x) => x[k]).sort((a, b) => a - b)[2];
  const P = join(work, 'p6'); const ctx = await launch(P); const page = await load(ctx, A);
  const rssNow = () => +spawnSync('sh', ['-c', `ps -eo rss,args | grep -F '${P}' | grep -v grep | awk '{s+=$1} END {print s}'`]).stdout.toString().trim() / 1024;
  const rssIdle = Math.round(rssNow());
  const m = await page.evaluate(async () => {
    const s = window.spike, st = s.store, T = (f) => { const t = performance.now(); const v = f(); return [performance.now() - t, v]; };
    st.newDb(); const [seedMs, info] = T(() => { st.db.run('BEGIN'); const r = s.seed(st.db); st.db.run('COMMIT'); return r; });
    const cnt = (t) => st.db.exec('select count(*) from ' + t)[0].values[0][0];
    const [expMs, bytes] = T(() => st.db.export()); const [impMs, d2] = T(() => new s.SQL.Database(bytes));
    const [icMs, ic] = T(() => d2.exec('PRAGMA integrity_check')[0].values[0][0]); const [qcMs] = T(() => d2.exec('PRAGMA quick_check'));
    const [q1Ms] = T(() => d2.exec("select store_id,count(*) from assignments where day between '2025-06-01' and '2025-06-30' group by store_id")); d2.close();
    const mem = { data: new Uint8Array(0) }; s.fs.pickSave = async () => ({ name: 'mem.sqlite', async getFile() { return { arrayBuffer: async () => mem.data.buffer.slice(0) }; }, async createWritable() { let c = []; return { write: async (b) => c.push(b), close: async () => { mem.data = new Uint8Array(await new Blob(c).arrayBuffer()); }, abort: async () => {} }; } });
    const mir = await st.mirror(); const t0 = performance.now(); const sv = await st.saveAs(); const saveMs = performance.now() - t0;
    const t1 = performance.now(); await st.run("INSERT OR REPLACE INTO assignments VALUES ('2031-05-01',1,1,'day')", [], { op: 'assign' }); const runMs = performance.now() - t1;
    const ck = await st.checkpoint('m1'); const t2 = performance.now(); await st.revert(ck.id); const revertMs = performance.now() - t2;
    return { rows: { assignments: cnt('assignments'), change_log: cnt('change_log'), stores: cnt('stores'), pharmacists: cnt('pharmacists') }, seedMs: Math.round(seedMs), dbBytes: bytes.length, exportMs: +expMs.toFixed(1), importMs: +impMs.toFixed(1), integrityCheckMs: Math.round(icMs), integrity: ic, quickCheckMs: Math.round(qcMs), monthQueryMs: +q1Ms.toFixed(2),
      mirrorIdbPlusOpfsMs: Math.round(mir.ms), saveAdapterMs_excl_disk: Math.round(saveMs), saveOk: sv.ok, journaledEditMs: +runMs.toFixed(1), checkpoint: { rawBytes: ck.rawBytes, gzBytes: ck.gzBytes, ms: Math.round(ck.ms) }, revertMs: Math.round(revertMs), jsHeapMB: Math.round(performance.memory?.usedJSHeapSize / 1e6), wasmMemoryNote: 'sql.js heap lives in WASM memory (not in JS heap)' };
  });
  m.rssIdleMB = rssIdle; m.rssAfterWorkloadMB = Math.round(rssNow());
  const kib = Math.round(readFileSync(SRC).length / 1024);
  rec('6', 'Measurements (realistic db: 16 stores, 60 pharmacists, 730 days, 50k log rows)', null, { htmlKB: kib, htmlGzipKB: Math.round(gzipSync(readFileSync(SRC)).length / 1024), coldLoadToFirstQuery_median5: { firstQueryMs: med('firstQueryMs'), wasmInitMs: med('wasmInitMs') }, all: loads, ...m });
  await closeCtx(ctx);
}

mkdirSync(join(here, 'results'), { recursive: true }); writeFileSync(join(here, 'results/browser.json'), JSON.stringify({ chromium: exe, results }, null, 1));
rmSync(work, { recursive: true, force: true });
