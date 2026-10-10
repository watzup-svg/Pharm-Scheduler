// Browser-side storage for the spike: an IndexedDB copy per database, the File System Access file, download/upload for browsers
// without file access. None of this belongs in src/domain: it touches the browser.
import type { FileSink, Mirror } from "../../src/domain/store.ts";

const PREFIX = "hspdb-mirror/";

function openDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("l");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** One IndexedDB database per schedule database id. Every put is its own strict-durability transaction and resolves only when committed. */
export class IdbMirror implements Mirror {
  private dbp: Promise<IDBDatabase> | null = null;
  readonly name: string;
  constructor(dbId: string) {
    this.name = PREFIX + dbId;
  }
  private db() {
    return (this.dbp ??= openDb(this.name));
  }
  private tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
    return this.db().then(
      (db) =>
        new Promise((resolve, reject) => {
          const t = db.transaction("l", mode, { durability: "strict" });
          const req = fn(t.objectStore("l"));
          t.oncomplete = () => resolve(req ? (req.result as T) : undefined);
          t.onerror = () => reject(t.error);
          t.onabort = () => reject(t.error ?? new Error("transaction aborted"));
        }),
    );
  }
  async load(): Promise<string[]> {
    return ((await this.tx<string[]>("readonly", (s) => s.getAll())) ?? []) as string[];
  }
  async put(from: number, lines: string[]): Promise<void> {
    await this.tx("readwrite", (s) => {
      s.delete(IDBKeyRange.lowerBound(from));
      lines.forEach((l, i) => s.put(l, from + i));
    });
  }
  async clear(): Promise<void> {
    await this.tx("readwrite", (s) => s.clear());
  }
}

/** Database ids that have a browser copy in this browser (for "recover from this browser" when the file is gone). */
export async function listMirrorIds(): Promise<string[]> {
  const dbs = (await indexedDB.databases?.()) ?? [];
  return dbs.map((d) => d.name ?? "").filter((n) => n.startsWith(PREFIX)).map((n) => n.slice(PREFIX.length)).sort();
}

/** A real file the person chose (File System Access: Chrome, Edge). Chrome writes to a hidden swap file and swaps it in on close(), so a crash mid-write leaves the old file. */
export class FsaSink implements FileSink {
  readonly handle: FileSystemFileHandle;
  constructor(handle: FileSystemFileHandle) {
    this.handle = handle;
  }
  async read() {
    const text = await (await this.handle.getFile()).text();
    return text === "" ? null : text;
  }
  async write(text: string) {
    const w = await this.handle.createWritable({ keepExistingData: false });
    await w.write(text);
    await w.close();
  }
}

/** Fallback for browsers with no file access: reads from text the person uploaded, writes by downloading a new copy. */
export class DownloadSink implements FileSink {
  constructor(private text: string | null, private fileName: string) {}
  async read() {
    return this.text;
  }
  async write(text: string) {
    const url = URL.createObjectURL(new Blob([text], { type: "application/octet-stream" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = this.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    this.text = text;
  }
}

type Picker = { showSaveFilePicker?: (o: unknown) => Promise<FileSystemFileHandle>; showOpenFilePicker?: (o: unknown) => Promise<FileSystemFileHandle[]> };
const types = [{ description: "Schedule database", accept: { "application/octet-stream": [".hspdb"] } }];

export const hasFilePicker = () => typeof (window as Picker).showSaveFilePicker === "function";
export async function pickSave(suggestedName: string) {
  return (window as Picker).showSaveFilePicker!({ suggestedName, types });
}
export async function pickOpen() {
  const [h] = await (window as Picker).showOpenFilePicker!({ types });
  return h!;
}

// Remember the chosen file between visits. Chrome asks the person to re-allow access each new session; that prompt needs a click.
function handlesDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("hspdb-handles", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("h");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function rememberHandle(h: FileSystemFileHandle) {
  const db = await handlesDb();
  await new Promise<void>((res, rej) => {
    const t = db.transaction("h", "readwrite");
    t.objectStore("h").put(h, "last");
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}
export async function recallHandle(): Promise<FileSystemFileHandle | null> {
  try {
    const db = await handlesDb();
    return await new Promise((res) => {
      const q = db.transaction("h").objectStore("h").get("last");
      q.onsuccess = () => res((q.result as FileSystemFileHandle) ?? null);
      q.onerror = () => res(null);
    });
  } catch {
    return null;
  }
}
