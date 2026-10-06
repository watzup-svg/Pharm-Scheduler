// Test doubles: an in-memory FileSystemFileHandle with swap-file semantics and fault injection, a fake file backend, and the practice world.
import { readFileSync } from "node:fs";
import initSqlJs from "sql.js";
import { api, importV2 } from "../../domain/src/index.ts";
import type { World } from "../../domain/src/index.ts";
import type { FileBackend, HandleLike } from "../backends.ts";
import { createPersist } from "../core.ts";
import type { PersistDeps } from "../core.ts";
import { idbMem } from "../idb.ts";
import type { Kv } from "../idb.ts";
import type { SqlJs } from "../sql-types.ts";

export const SQL: SqlJs = await initSqlJs();

const cat = (cs: Uint8Array[]) => {
  const o = new Uint8Array(cs.reduce((n, c) => n + c.length, 0));
  let p = 0;
  for (const c of cs) { o.set(c, p); p += c.length; }
  return o;
};

export class FakeHandle implements HandleLike {
  name: string;
  data: Uint8Array;
  failMid = false;
  corruptOnClose = false;
  perm: "granted" | "prompt" | "denied" = "granted";
  constructor(name: string, data: Uint8Array = new Uint8Array(0)) { this.name = name; this.data = data; }
  async getFile() { const d = this.data; return { arrayBuffer: async () => d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) as ArrayBuffer }; }
  async createWritable() {
    const chunks: Uint8Array[] = [];
    return {
      write: async (b: Uint8Array) => { if (this.failMid) throw new Error("disk full (injected)"); chunks.push(new Uint8Array(b)); },
      close: async () => { this.data = cat(chunks); if (this.corruptOnClose) this.data = this.data.slice(0, this.data.length - 10); },
      abort: async () => {},
    };
  }
  async queryPermission() { return this.perm; }
  async requestPermission() { if (this.perm === "prompt") this.perm = "granted"; return this.perm; }
}

export type FakeFs = FileBackend & { next: FakeHandle | null; saveTarget: FakeHandle | null; downloads: [string, Uint8Array][]; cancel: boolean };

export function mkFs(kind: "fsa" | "download" = "fsa"): FakeFs {
  const fs: FakeFs = {
    kind, next: null, saveTarget: null, downloads: [], cancel: false,
    async pickOpen() {
      if (fs.cancel) throw Object.assign(new Error("cancelled"), { name: "AbortError" });
      if (kind === "download") return { name: fs.next!.name, bytes: fs.next!.data };
      return { handle: fs.next!, name: fs.next!.name };
    },
    pickSave: kind === "fsa" ? async () => { if (fs.cancel) throw Object.assign(new Error("cancelled"), { name: "AbortError" }); return fs.saveTarget!; } : null,
    async permission(h, req) {
      const fh = h as FakeHandle;
      if (fh.perm === "prompt" && req) fh.perm = "granted";
      return fh.perm;
    },
    download: kind === "download" ? (n, b) => { fs.downloads.push([n, b]); } : null,
  };
  return fs;
}

export function mk(fs: FileBackend, idb: Kv = idbMem(), extra: Partial<PersistDeps> = {}) {
  let n = 0;
  return createPersist({ SQL, fs, idb, debounceMs: 1e9, maxWaitMs: 1e9, onError: () => {}, uuid: () => `uuid-${++n}-${Math.random().toString(36).slice(2, 8)}`, ...extra });
}

export function practice(): World {
  const demo = JSON.parse(readFileSync(new URL("../../fixtures/demo-v2.json", import.meta.url), "utf8"));
  const dt = JSON.parse(readFileSync(new URL("../../fixtures/drive-table.json", import.meta.url), "utf8"));
  return importV2([demo], { driveTable: dt.pairs }).world;
}

/** A world after real commits, an undo, a checkpoint, a revert, posting and told. Returns every intermediate commit too. */
export function busyWorld(): { world: World; commits: { world: World; cs: import("../../domain/src/index.ts").ChangeSet }[] } {
  let w = practice();
  const commits: { world: World; cs: import("../../domain/src/index.ts").ChangeSet }[] = [];
  const doCommit = (edits: Parameters<typeof api.commit>[1], label: string) => {
    const r = api.commit(w, edits, { kind: "manual", label });
    if ("refused" in r) throw new Error(r.reason);
    w = r.world;
    commits.push({ world: w, cs: r.changeSet });
  };
  const a = Object.values(w.state.assignments);
  const first = a[0]!;
  doCommit([{ t: "update", assignmentId: first.id, patch: { pinned: true } }], "pin");
  doCommit([{ t: "unavail.add", pharmacistId: first.pharmacistId, first: "2026-10-20", last: "2026-10-21", status: "Requested", type: "Vacation", note: "x" }], "time off");
  doCommit([{ t: "remove", assignmentId: a[1]!.id }], "remove");
  const u = api.undo(w, commits[2]!.cs.id);
  if ("refused" in u) throw new Error(u.reason);
  w = u.world;
  commits.push({ world: w, cs: u.changeSet });
  doCommit([{ t: "dateOverride.set", storeId: first.storeId, date: "2026-10-25", count: 0, note: "closed" }], "closed");
  w = api.checkpoint(w, "before more");
  doCommit([{ t: "place", storeId: first.storeId, pharmacistId: a[3]!.pharmacistId, date: "2026-10-30", agreed: true }], "place");
  w = api.post(w, { from: "2026-10-01", to: "2026-10-31" }, "2026-10-06").world;
  w = api.markTold(w, [{ pharmacistId: first.pharmacistId, date: first.date }]);
  return { world: w, commits };
}
