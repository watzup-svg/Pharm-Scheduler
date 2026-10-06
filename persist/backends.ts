// File backends. The core never touches the DOM: it is handed one of these.
//   fsa      : File System Access API (Chromium). Save writes the user's file in place through a swap file.
//   download : Firefox / Safari. Open = <input type=file>, Save = a download of a copy. There is no handle and no overwrite.
export type Permission = "granted" | "prompt" | "denied";

export interface FileLike { arrayBuffer(): Promise<ArrayBuffer> }
export interface WritableLike {
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
}
/** The part of a FileSystemFileHandle this layer uses. */
export interface HandleLike {
  name: string;
  getFile(): Promise<FileLike>;
  createWritable(): Promise<WritableLike>;
  queryPermission?(o: { mode: "readwrite" }): Promise<Permission>;
  requestPermission?(o: { mode: "readwrite" }): Promise<Permission>;
}

export type Picked = { handle?: HandleLike; name: string; bytes?: Uint8Array };

export interface FileBackend {
  kind: "fsa" | "download";
  /** Rejects with an AbortError (or {cancelled:true}) when the user cancels. */
  pickOpen(): Promise<Picked>;
  pickSave: ((suggestedName: string) => Promise<HandleLike>) | null;
  /** Queries permission; with `request` it asks (needs a user gesture). */
  permission(h: HandleLike, request: boolean): Promise<Permission>;
  download: ((name: string, bytes: Uint8Array) => void) | null;
  /** Tests only: rebuild a handle from what was stored in the key-value layer. */
  revive?: (stored: unknown) => HandleLike;
}

type PickerWindow = {
  showOpenFilePicker?: (o: unknown) => Promise<HandleLike[]>;
  showSaveFilePicker?: (o: unknown) => Promise<HandleLike>;
  document: Document;
};

const PICKER_TYPES = [{ description: "Hi-School schedule", accept: { "application/vnd.sqlite3": [".sqlite", ".db"] } }];

export function fsaBackend(win: PickerWindow): FileBackend {
  return {
    kind: "fsa",
    async pickOpen() {
      const [handle] = await win.showOpenFilePicker!({ types: PICKER_TYPES, multiple: false });
      if (!handle) throw Object.assign(new Error("cancelled"), { name: "AbortError" });
      return { handle, name: handle.name };
    },
    pickSave: (name) => win.showSaveFilePicker!({ suggestedName: name, types: PICKER_TYPES }),
    async permission(h, request) {
      const o = { mode: "readwrite" as const };
      if (!h.queryPermission) return "granted";
      let p = await h.queryPermission(o);
      if (p !== "granted" && request && h.requestPermission) p = await h.requestPermission(o);
      return p;
    },
    download: null,
  };
}

export function downloadBackend(doc: Document): FileBackend {
  return {
    kind: "download",
    pickOpen() {
      return new Promise((res, rej) => {
        const i = doc.createElement("input");
        i.type = "file";
        i.accept = ".sqlite,.db";
        i.onchange = async () => {
          const f = i.files?.[0];
          if (!f) { rej(Object.assign(new Error("cancelled"), { cancelled: true })); return; }
          res({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
        };
        i.addEventListener("cancel", () => rej(Object.assign(new Error("cancelled"), { cancelled: true })));
        i.click();
      });
    },
    pickSave: null,
    async permission() { return "granted"; },
    download(name, bytes) {
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/vnd.sqlite3" }));
      const a = doc.createElement("a");
      a.href = url;
      a.download = name;
      doc.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
  };
}

/** Chromium and Edge expose both pickers; everything else gets the download path. */
export function detectBackend(win: PickerWindow): FileBackend {
  return typeof win.showOpenFilePicker === "function" && typeof win.showSaveFilePicker === "function" ? fsaBackend(win) : downloadBackend(win.document);
}
