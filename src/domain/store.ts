// A database plus its file text: load from text, append records, open from a file and a crash-recovery mirror.
import { canon, type Json } from "./canon.ts";
import { encodeRecord, GENESIS, parseLog, type ParseStatus, type Record_ } from "./chainlog.ts";
import { makeCheckpoint, newDb, replayInto, revertToCheckpoint, commit, stateHash, type ChangeSet, type Checkpoint, type Db, type DbEvent } from "./db.ts";

export const FORMAT = "hspdb";
export const FORMAT_VERSION = 1;

export type LoadStatus = ParseStatus | "inconsistent" | "not-a-db";
export type Loaded = { status: LoadStatus; db: Db | null; lines: string[]; lastHash: string; hashes: string[]; detail: string };

export function headerRecord(dbId: string): Record_ {
  return { t: "hdr", fmt: FORMAT, v: FORMAT_VERSION, id: dbId };
}

/** Read a whole file's text. `inconsistent` means the chain is intact but the content contradicts itself: open read-only and offer a diagnostic. */
export function loadText(text: string): Loaded {
  const p = parseLog(text);
  const hdr = p.records[0];
  if (!hdr || hdr.t !== "hdr" || hdr.fmt !== FORMAT || typeof hdr.id !== "string") {
    return { status: "not-a-db", db: null, lines: [], lastHash: GENESIS, hashes: [], detail: "This is not a schedule database file." };
  }
  if (hdr.v !== FORMAT_VERSION) return { status: "not-a-db", db: null, lines: [], lastHash: GENESIS, hashes: [], detail: `Unknown file version ${String(hdr.v)}.` };
  const db = newDb(hdr.id);
  let status: LoadStatus = p.status;
  let detail = p.status === "ok" ? "" : p.status === "torn-tail" ? "The end of the file was cut off; everything before it is intact." : "A record in the middle of the file is damaged; only what comes before it was opened.";
  let good = 1;
  for (let i = 1; i < p.records.length; i++) {
    const r = p.records[i]!;
    try {
      if (r.t === "cs") replayInto(db, r.cs as unknown as ChangeSet);
      else if (r.t === "cp") {
        const cp = r.cp as unknown as Checkpoint;
        if (cp.seq !== db.seq || cp.hash !== stateHash(db.tables)) throw new Error(`checkpoint "${cp.name}" does not match the state it names`);
        db.checkpoints.push(cp);
      } else throw new Error(`unknown record type ${String(r.t)}`);
      good = i + 1;
    } catch (e) {
      status = "inconsistent";
      detail = `Record ${i + 1} contradicts the ones before it: ${(e as Error).message}`;
      break;
    }
  }
  const lines = p.validText.split("\n").slice(0, good).map((l) => `${l}\n`);
  return { status, db, lines, lastHash: p.hashes[good - 1] ?? GENESIS, hashes: p.hashes.slice(0, good), detail };
}

export interface FileSink {
  /** Whole file text, or null if there is no file yet. */
  read(): Promise<string | null>;
  /** Replace the whole file. Must not leave a half-written file visible if the process dies: write elsewhere, then swap. */
  write(text: string): Promise<void>;
}

/** The browser-side copy kept after every change set, so a crash or a forgotten save loses nothing that was acknowledged. */
export interface Mirror {
  load(): Promise<string[]>;
  /** Store `lines` starting at line index `from`; anything at or after `from` is replaced. Must be durable when it resolves. */
  put(from: number, lines: string[]): Promise<void>;
  clear(): Promise<void>;
}

export class ConflictError extends Error {
  readonly externalText: string;
  constructor(externalText: string) {
    super("The file changed outside this program since it was opened or last saved.");
    this.externalText = externalText;
  }
}

export type OpenReport = {
  from: "file" | "mirror" | "new";
  fileStatus: LoadStatus | "missing";
  mirrorStatus: LoadStatus | "empty";
  /** Change sets that were only in the browser copy (not yet saved to the file). */
  recovered: number;
  /** The file and the browser copy both have changes the other lacks. Nothing was merged. */
  diverged: boolean;
  detail: string;
};

export class Session {
  private queue: Promise<unknown> = Promise.resolve();
  db: Db;
  readOnly: boolean;
  private lines: string[];
  private hashes: string[];
  private sink: FileSink | null;
  private mirror: Mirror;
  private fileText: string | null;
  private savedLines: number;
  private constructor(db: Db, lines: string[], hashes: string[], sink: FileSink | null, mirror: Mirror, fileText: string | null, savedLines: number, readOnly: boolean) {
    this.db = db;
    this.lines = lines;
    this.hashes = hashes;
    this.sink = sink;
    this.mirror = mirror;
    this.fileText = fileText;
    this.savedLines = savedLines;
    this.readOnly = readOnly;
  }

  get unsavedLines(): number {
    return this.lines.length - this.savedLines;
  }

  static async create(args: { dbId: string; sink: FileSink | null; mirror: Mirror }): Promise<Session> {
    const { line, hash } = encodeRecord(GENESIS, headerRecord(args.dbId));
    await args.mirror.clear();
    await args.mirror.put(0, [line]);
    return new Session(newDb(args.dbId), [line], [hash], args.sink, args.mirror, null, 0, false);
  }

  /**
   * Open a file plus the browser copy kept for that database. Copies are kept per database id, so opening one file never touches
   * another database's unsaved changes. `recoverId` names a browser copy to open when the file is missing or unreadable.
   */
  static async open(args: { sink: FileSink; mirrorFor: (dbId: string) => Mirror; recoverId?: string }): Promise<{ session: Session | null; report: OpenReport; mirrorText?: string }> {
    const fileText = await args.sink.read();
    const file = fileText === null ? null : loadText(fileText);
    const id = file?.db?.id ?? args.recoverId ?? null;
    const report: OpenReport = { from: "file", fileStatus: file?.status ?? "missing", mirrorStatus: "empty", recovered: 0, diverged: false, detail: "" };
    if (id === null) {
      report.from = "new";
      report.detail = file?.detail || "No database found.";
      return { session: null, report };
    }
    const mirror = args.mirrorFor(id);
    const mirrorLines = await mirror.load();
    const mir = mirrorLines.length ? loadText(mirrorLines.join("")) : null;
    report.mirrorStatus = mir?.status ?? "empty";
    const usable = (l: Loaded | null) => !!l && !!l.db && l.db.id === id && (l.status === "ok" || l.status === "torn-tail");
    const fileOk = usable(file);
    const mirOk = usable(mir);
        const make = (l: Loaded, readOnly: boolean, saved: number) => new Session(l.db!, l.lines, l.hashes, args.sink, mirror, fileText, saved, readOnly);
    if (fileOk && (!mirOk || (mir!.lines.length <= file!.lines.length && file!.hashes[mir!.lines.length - 1] === mir!.lastHash))) {
      // The file has everything the browser copy has (or there is no usable copy): the file wins and the copy is rebuilt from it.
      await mirror.clear();
      await mirror.put(0, file!.lines);
      return { session: make(file!, false, file!.lines.length), report };
    }
    if (mirOk && (!fileOk || mir!.hashes[file!.lines.length - 1] === file!.lastHash)) {
      // The browser copy extends the file (or the file is missing/unusable): recover the unsaved changes.
      const savedLines = fileOk ? file!.lines.length : 0;
      report.from = "mirror";
      report.recovered = mir!.db!.log.length - (fileOk ? file!.db!.log.length : 0);
      report.detail = fileOk ? "Unsaved changes were recovered from this browser's copy." : "The file was missing or damaged; recovered from this browser's copy.";
      return { session: make(mir!, false, savedLines), report };
    }
    if (fileOk && mirOk) {
      report.diverged = true;
      report.detail = "The file and this browser's copy each have changes the other lacks. Opened the file; the browser copy is kept for you to export.";
      return { session: make(file!, false, file!.lines.length), report, mirrorText: mirrorLines.join("") };
    }
    // Neither is usable. A corrupt or inconsistent file opens read-only up to the last good record, with a diagnostic.
    const best = file?.db ? file : mir?.db ? mir : null;
    if (best?.db) {
      report.detail = best.detail;
      return { session: make(best, true, best.lines.length), report };
    }
    report.from = "new";
    report.detail = file?.detail || "No database found.";
    return { session: null, report };
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async append(rec: Record_): Promise<void> {
    const { line, hash } = encodeRecord(this.hashes[this.hashes.length - 1]!, rec);
    const at = this.lines.length;
    await this.mirror.put(at, [line]);
    this.lines.push(line);
    this.hashes.push(hash);
  }

  private guard() {
    if (this.readOnly) throw new Error("This file opened read-only; nothing can be changed.");
  }

  /** Durable in the browser copy when this resolves. */
  commit(input: { label: string; source: string; stamp: string; events: readonly DbEvent[] }): Promise<ChangeSet | null> {
    return this.enqueue(async () => {
      this.guard();
      const before = this.db.seq;
      const cs = commit(this.db, input);
      if (!cs) return null;
      try {
        await this.append({ t: "cs", cs: cs as unknown as Json });
      } catch (e) {
        // The browser copy failed: undo the in-memory step so memory and the log never disagree.
        this.db.log.pop();
        this.db.seq = before;
        this.db.tables = replayTables(this.db);
        throw e;
      }
      return cs;
    });
  }

  checkpoint(name: string, stamp: string): Promise<Checkpoint> {
    return this.enqueue(async () => {
      this.guard();
      const cp = makeCheckpoint(this.db, name, stamp);
      try {
        await this.append({ t: "cp", cp: cp as unknown as Json });
      } catch (e) {
        this.db.checkpoints.pop();
        throw e;
      }
      return cp;
    });
  }

  revert(name: string, stamp: string): Promise<ChangeSet | null> {
    return this.enqueue(async () => {
      this.guard();
      const before = this.db.seq;
      const cs = revertToCheckpoint(this.db, name, stamp);
      if (!cs) return null;
      try {
        await this.append({ t: "cs", cs: cs as unknown as Json });
      } catch (e) {
        this.db.log.pop();
        this.db.seq = before;
        this.db.tables = replayTables(this.db);
        throw e;
      }
      return cs;
    });
  }

  text(): string {
    return this.lines.join("");
  }

  /** Write to the file. Refuses (ConflictError) if the file is no longer what we last read or wrote, rather than overwrite someone else's save. */
  save(): Promise<void> {
    return this.enqueue(async () => {
      if (!this.sink) throw new Error("No file chosen yet; use Save As.");
      const text = this.text();
      const now = await this.sink.read();
      if (now !== this.fileText) throw new ConflictError(now ?? "");
      await this.sink.write(text);
      this.fileText = text;
      this.savedLines = this.lines.length;
    });
  }

  /** A database copy to somewhere else; this session then points at the new file. The old file is untouched. */
  saveAs(sink: FileSink): Promise<void> {
    return this.enqueue(async () => {
      const text = this.text();
      await sink.write(text);
      this.sink = sink;
      this.fileText = text;
      this.savedLines = this.lines.length;
    });
  }

  stateOf(): { seq: number; hash: string } {
    return { seq: this.db.seq, hash: stateHash(this.db.tables) };
  }
}

function replayTables(db: Db): Db["tables"] {
  const fresh = newDb(db.id);
  for (const cs of db.log) replayInto(fresh, cs);
  return fresh.tables;
}

export { canon };
