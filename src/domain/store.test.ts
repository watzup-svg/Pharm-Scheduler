import test from "node:test";
import assert from "node:assert/strict";
import { MemoryMirror, MemorySink } from "./memory-io.ts";

const only = (m: MemoryMirror) => () => m;
import { ConflictError, Session } from "./store.ts";
import { stateHash, type DbEvent } from "./db.ts";

const put = (id: string, v: number): DbEvent => ({ op: "put", table: "a", id, row: { v } });
const ed = (id: string, v: number) => ({ label: `edit ${id}`, source: "manual", stamp: "s", events: [put(id, v)] });

test("every acknowledged change set survives a lost tab: nothing saved, reopen from the browser copy", async () => {
  const sink = new MemorySink();
  const mirror = new MemoryMirror();
  const s = await Session.create({ dbId: "d1", sink, mirror });
  await s.commit(ed("1", 1));
  await s.commit(ed("2", 2));
  await s.checkpoint("cp", "s");
  await s.commit(ed("3", 3));
  assert.equal(sink.text, null, "never saved");
  const { session, report } = await Session.open({ sink, mirrorFor: only(mirror), recoverId: "d1" });
  assert.equal(report.from, "mirror");
  assert.equal(report.recovered, 3);
  assert.equal(stateHash(session!.db.tables), stateHash(s.db.tables));
  assert.equal(session!.db.checkpoints.length, 1);
  assert.equal(session!.unsavedLines, session!.text().split("\n").length - 1, "all still unsaved");
});

test("cleared site data: the file alone reopens everything, and rebuilds the browser copy", async () => {
  const sink = new MemorySink();
  const s = await Session.create({ dbId: "d1", sink, mirror: new MemoryMirror() });
  await s.commit(ed("1", 1));
  await s.save();
  const fresh = new MemoryMirror();
  const { session, report } = await Session.open({ sink, mirrorFor: only(fresh) });
  assert.equal(report.from, "file");
  assert.equal(session!.db.seq, 1);
  assert.equal(fresh.lines.join(""), sink.text);
});

test("a stale browser copy never overrides a newer file", async () => {
  const sink = new MemorySink();
  const mirror = new MemoryMirror();
  const s = await Session.create({ dbId: "d1", sink, mirror });
  await s.commit(ed("1", 1));
  await s.save();
  const stale = [...mirror.lines];
  await s.commit(ed("2", 2));
  await s.save();
  mirror.lines = stale;
  const { session, report } = await Session.open({ sink, mirrorFor: only(mirror) });
  assert.equal(report.from, "file");
  assert.equal(session!.db.seq, 2);
});

test("an outside edit is refused, not overwritten", async () => {
  const sink = new MemorySink();
  const s = await Session.create({ dbId: "d1", sink, mirror: new MemoryMirror() });
  await s.commit(ed("1", 1));
  await s.save();
  await s.commit(ed("2", 2));
  const theirs = sink.text + "extra\n"; // a sync client or another machine changed the file
  sink.text = theirs;
  await assert.rejects(s.save(), (e) => e instanceof ConflictError && e.externalText === theirs);
  assert.equal(sink.text, theirs, "file untouched");
  assert.equal(s.unsavedLines, 1, "our change is still pending, not lost");
});

test("a mirror write that fails leaves memory exactly as before", async () => {
  const mirror = new MemoryMirror();
  const s = await Session.create({ dbId: "d1", sink: new MemorySink(), mirror });
  await s.commit(ed("1", 1));
  const before = stateHash(s.db.tables);
  mirror.failNext = true;
  await assert.rejects(s.commit(ed("2", 2)));
  assert.equal(stateHash(s.db.tables), before);
  assert.equal(s.db.seq, 1);
  await s.commit(ed("3", 3));
  assert.equal(s.db.seq, 2);
  const { session } = await Session.open({ sink: new MemorySink(), mirrorFor: only(mirror), recoverId: "d1" });
  assert.equal(stateHash(session!.db.tables), stateHash(s.db.tables));
});

test("file and browser copy that each hold changes the other lacks are reported, not merged", async () => {
  const sinkA = new MemorySink();
  const mirrorA = new MemoryMirror();
  const a = await Session.create({ dbId: "d1", sink: sinkA, mirror: mirrorA });
  await a.commit(ed("1", 1));
  await a.save();
  const fileAtFork = sinkA.text;
  // Machine B continued from the same file and saved; machine A kept editing in its browser.
  const mirrorB = new MemoryMirror();
  const { session: b } = await Session.open({ sink: new MemorySink(fileAtFork), mirrorFor: only(mirrorB) });
  const sinkB = new MemorySink(fileAtFork);
  await b!.commit(ed("B", 9));
  await b!.saveAs(sinkB);
  await a.commit(ed("A", 8));
  const { session, report, mirrorText } = await Session.open({ sink: sinkB, mirrorFor: only(mirrorA) });
  assert.equal(report.diverged, true);
  assert.equal(session!.db.tables.a!.B!.v, 9);
  assert.ok(mirrorText && mirrorText.includes("\n"));
});

test("browser copies are kept per database: opening one file never touches another database's unsaved changes", async () => {
  const mirrors = new Map<string, MemoryMirror>();
  const mirrorFor = (id: string) => mirrors.get(id) ?? (mirrors.set(id, new MemoryMirror()), mirrors.get(id)!);
  const sinkA = new MemorySink();
  const a = await Session.create({ dbId: "A", sink: sinkA, mirror: mirrorFor("A") });
  await a.commit(ed("1", 1)); // never saved
  const sinkB = new MemorySink();
  const b = await Session.create({ dbId: "B", sink: sinkB, mirror: mirrorFor("B") });
  await b.commit(ed("9", 9));
  await b.save();
  const before = mirrorFor("A").lines.join("");
  const opened = await Session.open({ sink: sinkB, mirrorFor });
  assert.equal(opened.session!.db.id, "B");
  assert.equal(mirrorFor("A").lines.join(""), before, "A's unsaved copy is untouched");
  const back = await Session.open({ sink: new MemorySink(), mirrorFor, recoverId: "A" });
  assert.equal(back.report.from, "mirror");
  assert.equal(back.session!.db.seq, 1);
});

test("save as writes a copy, repoints the session, leaves the old file alone", async () => {
  const one = new MemorySink();
  const two = new MemorySink();
  const s = await Session.create({ dbId: "d1", sink: one, mirror: new MemoryMirror() });
  await s.commit(ed("1", 1));
  await s.save();
  const oldText = one.text;
  await s.commit(ed("2", 2));
  await s.saveAs(two);
  assert.equal(one.text, oldText);
  assert.equal(two.text, s.text());
  await s.commit(ed("3", 3));
  await s.save();
  assert.equal(two.text, s.text());
  assert.equal(one.text, oldText);
});

test("a damaged file opens read-only up to the last good record and refuses edits", async () => {
  const sink = new MemorySink();
  const s = await Session.create({ dbId: "d1", sink, mirror: new MemoryMirror() });
  for (let i = 1; i <= 6; i++) await s.commit(ed(String(i), i));
  await s.save();
  const t = sink.text!;
  const bad = t.slice(0, t.length / 2) + "#" + t.slice(t.length / 2 + 1);
  const { session, report } = await Session.open({ sink: new MemorySink(bad), mirrorFor: only(new MemoryMirror()) });
  assert.equal(report.fileStatus, "corrupt");
  assert.equal(session!.readOnly, true);
  await assert.rejects(session!.commit(ed("x", 1)), /read-only/);
});

test("commits queued together are logged in order", async () => {
  const s = await Session.create({ dbId: "d1", sink: new MemorySink(), mirror: new MemoryMirror() });
  await Promise.all([1, 2, 3, 4, 5].map((i) => s.commit(ed(String(i), i))));
  assert.deepEqual(s.db.log.map((c) => c.label), ["edit 1", "edit 2", "edit 3", "edit 4", "edit 5"]);
});
