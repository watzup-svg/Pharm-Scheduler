// In-memory file and mirror, for tests and for running the domain with no storage at all.
import type { FileSink, Mirror } from "./store.ts";

export class MemorySink implements FileSink {
  writes = 0;
  text: string | null;
  constructor(text: string | null = null) {
    this.text = text;
  }
  async read() {
    return this.text;
  }
  async write(text: string) {
    this.text = text;
    this.writes++;
  }
}

export class MemoryMirror implements Mirror {
  lines: string[] = [];
  /** Set to make the next put() fail, to prove the in-memory state is rolled back. */
  failNext = false;
  async load() {
    return [...this.lines];
  }
  async put(from: number, lines: string[]) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("mirror write failed");
    }
    this.lines = [...this.lines.slice(0, from), ...lines];
  }
  async clear() {
    this.lines = [];
  }
}
