// Node-side file and mirror, used by the crash tests. The browser equivalents are in browser-io.ts.
import { appendFileSync, closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, writeFileSync, writeSync } from "node:fs";
import { dirname, basename, join } from "node:path";
import type { FileSink, Mirror } from "../../src/domain/store.ts";

function fsyncDir(dir: string) {
  try {
    const fd = openSync(dir, "r");
    fsyncSync(fd);
    closeSync(fd);
  } catch {
    /* not every platform lets you fsync a directory */
  }
}

/** Write to a temp file in the same folder, flush it, then rename over the target. A reader sees the old file or the new file, never half. */
export class AtomicFileSink implements FileSink {
  readonly path: string;
  constructor(path: string) {
    this.path = path;
  }
  async read() {
    return existsSync(this.path) ? readFileSync(this.path, "utf8") : null;
  }
  async write(text: string) {
    const tmp = join(dirname(this.path), `.${basename(this.path)}.${process.pid}.tmp`);
    const fd = openSync(tmp, "w");
    writeSync(fd, text);
    fsyncSync(fd);
    closeSync(fd);
    renameSync(tmp, this.path);
    fsyncDir(dirname(this.path));
  }
}

/** The worst case: truncate and rewrite in place. Used to show what a non-atomic sink can leave behind. */
export class InPlaceFileSink implements FileSink {
  readonly path: string;
  constructor(path: string) {
    this.path = path;
  }
  async read() {
    return existsSync(this.path) ? readFileSync(this.path, "utf8") : null;
  }
  async write(text: string) {
    writeFileSync(this.path, text);
  }
}

/** A mirror kept as an append-only file, flushed on every put: stands in for IndexedDB in the Node tests. */
export class FileMirror implements Mirror {
  readonly path: string;
  constructor(path: string) {
    this.path = path;
  }
  private current(): string[] {
    if (!existsSync(this.path)) return [];
    const t = readFileSync(this.path, "utf8");
    // A torn last line (killed mid-append) is dropped, as IndexedDB would drop an uncommitted transaction.
    return t.split("\n").slice(0, -1).map((l) => `${l}\n`);
  }
  async load() {
    return this.current();
  }
  async put(from: number, lines: string[]) {
    const have = this.current();
    if (from === have.length) {
      const fd = openSync(this.path, "a");
      writeSync(fd, lines.join(""));
      fsyncSync(fd);
      closeSync(fd);
    } else {
      writeFileSync(this.path, [...have.slice(0, from), ...lines].join(""));
    }
  }
  async clear() {
    writeFileSync(this.path, "");
  }
}

export { appendFileSync };
