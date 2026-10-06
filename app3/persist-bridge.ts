// Binds the app to the save layer in persist/. In a browser this is the real thing (sql.js + File System Access + IndexedDB);
// elsewhere (and in tests that want one) createMemoryPersist is an in-memory stand-in with the same shape.
import initSqlJs from "sql.js/dist/sql-wasm-browser.js";
// Vite inlines the WASM as a data URL, so the single HTML file works from file:// with no network.
import wasmDataUrl from "sql.js/dist/sql-wasm-browser.wasm?url";
import { createPersist, detectBackend, idbReal } from "@persist";
import { record } from "./diagnostics.ts";
import type { PersistApi, SaveStatus } from "./persist-types.ts";

export function createMemoryPersist(): PersistApi {
  let status: SaveStatus = { backend: "none", fileName: null, linked: false, unsavedChanges: 0, lastSavedAt: null, mirrorOk: false, needsPermission: false, error: null };
  const subs = new Set<() => void>();
  const bump = (patch: Partial<SaveStatus>) => { status = { ...status, ...patch }; subs.forEach((f) => f()); };
  const fail = { ok: false, reason: "unsupported" } as const;
  return {
    boot: async () => ({ state: "empty" }),
    recordCommit: async () => { bump({ unsavedChanges: status.unsavedChanges + 1 }); },
    adopt: async () => { bump({ unsavedChanges: 0 }); },
    open: async () => ({ state: "cancelled" }),
    save: async () => fail,
    saveAs: async () => fail,
    download: async () => fail,
    reconnect: async () => ({ state: "empty" }),
    restore: async () => ({ state: "cancelled" }),
    status: () => status,
    subscribe: (fn) => { subs.add(fn); return () => { subs.delete(fn); }; },
  };
}

function wasmBytes(): Uint8Array {
  const b64 = wasmDataUrl.slice(wasmDataUrl.indexOf(",") + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

type TestKnobs = { __persistDebounce?: number };

function createBrowserPersist(): PersistApi {
  const w = window as unknown as TestKnobs;
  const p = createPersist({
    SQL: () => initSqlJs({ wasmBinary: wasmBytes() }),
    fs: detectBackend(window as unknown as Parameters<typeof detectBackend>[0]),
    idb: idbReal(window.indexedDB),
    debounceMs: w.__persistDebounce ?? 2000,
    onError: (what, e) => { console.warn(`[save] ${what}`, e); record("persist", `${what}: ${String((e as Error)?.message ?? e)}`); },
  });
  // Get the latest snapshot into the browser copy when the tab is hidden or closed.
  const flush = () => { p.flush().catch((e) => record("persist", `flush failed: ${String(e?.message ?? e)}`)); };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
  window.addEventListener("pagehide", flush);
  (window as unknown as { __persist: unknown }).__persist = p; // test hook, harmless in real use
  return p;
}

const inBrowser = typeof window !== "undefined" && typeof indexedDB !== "undefined" && typeof document !== "undefined";
let current: PersistApi = inBrowser ? createBrowserPersist() : createMemoryPersist();
export const getPersist = (): PersistApi => current;
export function setPersist(p: PersistApi): void { current = p; }
