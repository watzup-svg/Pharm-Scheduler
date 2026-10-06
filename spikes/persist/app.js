// Demo UI + test hooks. Bundled (esbuild, IIFE) into the single HTML. `initSqlJs` and `__WASM_B64__` are inlined before this.
import { createStore, fsaBackend, downloadBackend, idbReal } from './adapter.js';
import { seed } from './seed.js';

const $ = (id) => document.getElementById(id);
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function boot() {
  const tw = performance.now();
  const SQL = await initSqlJs({ wasmBinary: b64(window.__WASM_B64__).buffer });
  SQL_READY.t = performance.now() - tw;
  const probe = new SQL.Database(); probe.exec('select 1'); probe.close();
  SQL_READY.firstQuery = performance.now(); // ms since navigation start

  const hasFsa = 'showSaveFilePicker' in window && 'showOpenFilePicker' in window;
  const testFs = window.__TEST_FS__; // tests may inject picker shims backed by OPFS / fakes
  const fs = testFs ?? (hasFsa && !location.hash.includes('fallback') ? fsaBackend(window) : downloadBackend(document));
  let opfs = null; try { opfs = await navigator.storage.getDirectory(); } catch {}
  const store = createStore({ SQL, fs, idb: idbReal(indexedDB), opfs, debounceMs: window.__DEBOUNCE__ ?? 2000, onError: (...a) => console.warn(...a) });
  window.spike = { SQL, store, seed, fs, hasFsa };

  const ui = () => {
    const s = store.status(); const d = store.db;
    $('status').textContent = JSON.stringify(s) + (d ? ' rows=' + d.exec('select count(*) from assignments')[0].values[0][0] : ' (no db)');
  };
  const act = (id, fn) => ($(id).onclick = async () => { try { $('msg').textContent = JSON.stringify(await fn(), (k, v) => (k.startsWith('_') ? undefined : v)); } catch (e) { $('msg').textContent = 'ERR ' + e.message; } ui(); });
  act('new', async () => { store.newDb(); await store.mirror(); return 'new'; });
  act('open', () => store.open());
  act('save', async () => { const r = await store.save(); return r.reason === 'no-handle' ? (fs.pickSave ? store.saveAs() : store.download()) : r; });
  act('saveas', () => (fs.pickSave ? store.saveAs() : store.download()));
  act('download', () => store.download());
  act('reconnect', () => store.reconnect());
  act('add', () => store.run("INSERT OR REPLACE INTO assignments VALUES (date('now'), ?, 1, 'day')", [Math.floor(Math.random() * 60) + 1], { op: 'assign', entity: 'assignment' }));
  act('ckpt', () => store.checkpoint('Checkpoint ' + new Date().toLocaleTimeString()));
  act('revert', () => store.revert(store.listCheckpoints().at(-1).id));
  const r = await store.resume(); window.spike.resumed = r; $('msg').textContent = JSON.stringify(r, (k, v) => (k.startsWith('_') ? undefined : v));
  if (r.state === 'needs-permission') $('reconnect').hidden = false;
  ui(); window.spike.ready = true;
}
const SQL_READY = (window.SQL_READY = {});
boot().catch((e) => { window.__bootError = String(e.stack || e); $('msg').textContent = 'BOOT ERROR ' + e; });
