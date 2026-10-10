// The file format: one record per line, each line `<hash>\t<canonical json>\n`, hash = sha256(previous hash + "\t" + json).
// Appending is the only edit. A torn tail (power cut, half-synced copy) is detected and everything before it still opens;
// a bad line with good lines after it is corruption and is reported, never repaired.
import { canon, type Json } from "./canon.ts";
import { sha256 } from "./hash.ts";

export const GENESIS = "0".repeat(64);

export type Record_ = { [key: string]: Json };

export function encodeRecord(prevHash: string, rec: Record_): { line: string; hash: string } {
  const body = canon(rec);
  const hash = sha256(`${prevHash}\t${body}`);
  return { line: `${hash}\t${body}\n`, hash };
}

export type ParseStatus = "ok" | "torn-tail" | "corrupt";
export type Parsed = {
  status: ParseStatus;
  records: Record_[];
  /** hashes[i] is the chain hash after records[i]. */
  hashes: string[];
  /** The longest prefix of the text that is valid whole lines. */
  validText: string;
  /** Text after validText that was discarded (a torn tail) or is untrusted (corruption). */
  rest: string;
};

export function parseLog(text: string): Parsed {
  const records: Record_[] = [];
  const hashes: string[] = [];
  let prev = GENESIS;
  let pos = 0;
  let status: ParseStatus = "ok";
  while (pos < text.length) {
    const nl = text.indexOf("\n", pos);
    if (nl === -1) {
      status = "torn-tail";
      break;
    }
    const line = text.slice(pos, nl);
    const tab = line.indexOf("\t");
    let rec: Record_ | null = null;
    if (tab === 64) {
      const body = line.slice(65);
      if (sha256(`${prev}\t${body}`) === line.slice(0, 64)) {
        try {
          const v: unknown = JSON.parse(body);
          if (v && typeof v === "object" && !Array.isArray(v) && canon(v as Json) === body) rec = v as Record_;
        } catch {
          /* falls through to bad line */
        }
      }
    }
    if (!rec) {
      // A bad last line is a torn tail; a bad line with more lines after it is corruption.
      status = nl + 1 >= text.length ? "torn-tail" : "corrupt";
      break;
    }
    records.push(rec);
    prev = line.slice(0, 64);
    hashes.push(prev);
    pos = nl + 1;
  }
  return { status, records, hashes, validText: text.slice(0, pos), rest: text.slice(pos) };
}
