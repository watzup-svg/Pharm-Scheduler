// Browser-side mirror storage: a tiny key-value layer over IndexedDB (OPFS is blocked on file://), plus an in-memory twin for tests.
//   kv       : 'handle' (linked file handle), 'snap' (full saved-format bytes), 'meta'
//   journal  : one entry per committed change set, key = rev
//   ckpt     : safety copies (last good file saves, mirrors that were set aside), key = string
export type KvStoreName = "kv" | "journal" | "ckpt";

export interface Kv {
  get(store: KvStoreName, key: string | number): Promise<unknown>;
  put(store: KvStoreName, key: string | number, value: unknown): Promise<void>;
  del(store: KvStoreName, key: string | number): Promise<void>;
  /** Delete every key <= `key`. */
  delUpTo(store: KvStoreName, key: number): Promise<void>;
  all(store: KvStoreName): Promise<{ key: string | number; value: unknown }[]>;
  clear(store: KvStoreName): Promise<void>;
}

/** The browser refused a write because storage is full (name differs by browser; Firefox also uses a numeric code). */
export const isQuotaError = (e: unknown): boolean => {
  const x = e as { name?: string; code?: number; message?: string } | null;
  return x?.name === "QuotaExceededError" || x?.name === "NS_ERROR_DOM_QUOTA_REACHED" || x?.code === 22 || /quota/i.test(x?.message ?? "");
};

const isHandle = (v: unknown): boolean => typeof (v as { getFile?: unknown })?.getFile === "function";

export function idbMem(): Kv & { _failPuts?: boolean } {
  const s = new Map<string, Map<string | number, unknown>>();
  const st = (n: string) => {
    let m = s.get(n);
    if (!m) s.set(n, (m = new Map()));
    return m;
  };
  const self: Kv & { _failPuts?: boolean } = {
    async get(n, k) { return st(n).get(k); },
    async put(n, k, v) {
      if (self._failPuts) throw new Error("storage full (injected)");
      // Real IDB clones; FS handles clone natively in Chromium, so tests keep the object as is.
      st(n).set(k, isHandle(v) ? v : structuredClone(v));
    },
    async del(n, k) { st(n).delete(k); },
    async delUpTo(n, k) { for (const x of [...st(n).keys()]) if (typeof x === "number" && x <= k) st(n).delete(x); },
    async all(n) {
      return [...st(n).entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([key, value]) => ({ key, value }));
    },
    async clear(n) { st(n).clear(); },
  };
  return self;
}

export function idbReal(indexedDB: IDBFactory, name = "hischool-scheduler-v3"): Kv {
  const STORES: KvStoreName[] = ["kv", "journal", "ckpt"];
  let dbp: Promise<IDBDatabase> | null = null;
  const open = () => (dbp ??= new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => STORES.forEach((s) => r.result.createObjectStore(s));
    r.onsuccess = () => { const d = r.result; d.onclose = () => { dbp = null; }; d.onversionchange = () => { d.close(); dbp = null; }; res(d); };
    r.onerror = () => { dbp = null; rej(r.error); };
    r.onblocked = () => { dbp = null; rej(new Error("The browser storage is busy in another window.")); };
  }));
  const tx = async <T>(n: KvStoreName, mode: IDBTransactionMode, fn: (o: IDBObjectStore) => IDBRequest | undefined): Promise<T> => {
    const db = await open();
    return new Promise<T>((res, rej) => {
      // 'strict' makes the browser flush to disk before oncomplete: an acknowledged edit survives a crash.
      let t: IDBTransaction;
      let q: IDBRequest | undefined;
      let out: unknown;
      try {
        t = db.transaction(n, mode, { durability: "strict" });
        q = fn(t.objectStore(n));
      } catch (e) { dbp = null; rej(e); return; } // closed connection or a synchronous quota error: reopen next time
      if (q) q.onsuccess = () => { out = q.result; };
      t.oncomplete = () => res(out as T);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error ?? new Error("storage transaction aborted"));
    });
  };
  return {
    get: (n, k) => tx(n, "readonly", (o) => o.get(k)),
    put: async (n, k, v) => { await tx(n, "readwrite", (o) => o.put(v, k)); },
    del: async (n, k) => { await tx(n, "readwrite", (o) => o.delete(k)); },
    delUpTo: async (n, k) => { await tx(n, "readwrite", (o) => o.delete(IDBKeyRange.upperBound(k))); },
    clear: async (n) => { await tx(n, "readwrite", (o) => o.clear()); },
    async all(n) {
      const keys = await tx<(string | number)[]>(n, "readonly", (o) => o.getAllKeys());
      const vals = await tx<unknown[]>(n, "readonly", (o) => o.getAll());
      return keys.map((key, i) => ({ key, value: vals[i] }));
    },
  };
}
