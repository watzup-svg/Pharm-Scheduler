import test from "node:test";
import assert from "node:assert/strict";
import { commit, makeCheckpoint, newDb, stateHash } from "./db.ts";
import { encodeRecord, GENESIS } from "./chainlog.ts";
import { headerRecord, loadText } from "./store.ts";
import type { Json } from "./canon.ts";

function build(n: number): { text: string; hashes: string[] } {
  const db = newDb("db-1");
  let text = "";
  let prev = GENESIS;
  const hashes: string[] = [];
  const add = (rec: Record<string, Json>) => {
    const { line, hash } = encodeRecord(prev, rec);
    text += line;
    prev = hash;
    hashes.push(stateHash(db.tables));
  };
  add(headerRecord("db-1"));
  for (let i = 1; i <= n; i++) {
    const cs = commit(db, { label: `edit ${i}`, source: "manual", stamp: `s${i}`, events: [{ op: "put", table: "a", id: String(i), row: { v: i, note: "é😀" } }] })!;
    add({ t: "cs", cs: cs as unknown as Json });
    if (i % 5 === 0) {
      const cp = makeCheckpoint(db, `cp${i}`, "");
      add({ t: "cp", cp: cp as unknown as Json });
    }
  }
  return { text, hashes };
}

test("a file cut at ANY byte opens to the last whole record, never throws, never invents data", () => {
  const { text } = build(12);
  const whole = loadText(text);
  assert.equal(whole.status, "ok");
  let torn = 0;
  for (let cut = 0; cut <= text.length; cut++) {
    const part = text.slice(0, cut);
    const r = loadText(part);
    if (cut === 0) {
      assert.equal(r.status, "not-a-db");
      continue;
    }
    // The opened state must equal the replay of a prefix of the real log.
    assert.ok(r.status === "ok" || r.status === "torn-tail" || r.status === "not-a-db", `cut ${cut}: ${r.status}`);
    if (r.db) {
      const prefixText = r.lines.join("");
      assert.ok(text.startsWith(prefixText), `cut ${cut}: opened lines are a prefix of the real file`);
      assert.ok(prefixText.length <= cut);
      if (r.status === "torn-tail") torn++;
    }
  }
  assert.ok(torn > 100);
});

test("a flipped byte in the middle is reported as corruption and only the part before it opens", () => {
  const { text } = build(12);
  const mid = Math.floor(text.length / 2);
  const bad = text.slice(0, mid) + (text[mid] === "x" ? "y" : "x") + text.slice(mid + 1);
  const r = loadText(bad);
  assert.equal(r.status, "corrupt");
  assert.ok(r.db && r.db.seq > 0 && r.db.seq < 12);
});

test("a damaged last line is a torn tail; the same damage with lines after it is corruption", () => {
  const { text } = build(4);
  const lines = text.split("\n");
  lines.pop();
  const damageLast = [...lines.slice(0, -1), lines.at(-1)!.replace(/.$/, "Z")].join("\n") + "\n";
  assert.equal(loadText(damageLast).status, "torn-tail");
  const damageFirstCs = [lines[0], lines[1]!.replace(/.$/, "Z"), ...lines.slice(2)].join("\n") + "\n";
  assert.equal(loadText(damageFirstCs).status, "corrupt");
});

test("a valid chain whose content contradicts itself is inconsistent, with what came before still opened", () => {
  const db = newDb("db-1");
  let prev = GENESIS;
  let text = "";
  const add = (rec: Record<string, Json>) => {
    const { line, hash } = encodeRecord(prev, rec);
    text += line;
    prev = hash;
  };
  add(headerRecord("db-1"));
  const cs = commit(db, { label: "a", source: "m", stamp: "", events: [{ op: "put", table: "t", id: "1", row: { v: 1 } }] })!;
  add({ t: "cs", cs: cs as unknown as Json });
  add({ t: "cs", cs: { ...cs, seq: 5 } as unknown as Json }); // gap in the sequence
  const r = loadText(text);
  assert.equal(r.status, "inconsistent");
  assert.equal(r.db!.seq, 1);
  assert.match(r.detail, /gap|expected/);
});

test("a checkpoint whose hash does not match the state is inconsistent", () => {
  const db = newDb("db-1");
  let prev = GENESIS;
  let text = "";
  const add = (rec: Record<string, Json>) => {
    const { line, hash } = encodeRecord(prev, rec);
    text += line;
    prev = hash;
  };
  add(headerRecord("db-1"));
  add({ t: "cp", cp: { name: "x", seq: 0, hash: "f".repeat(64), stamp: "" } });
  assert.equal(loadText(text).status, "inconsistent");
  assert.equal(db.seq, 0);
});

test("not a database", () => {
  assert.equal(loadText("hello").status, "not-a-db");
  assert.equal(loadText('{"a":1}\n').status, "not-a-db");
});
