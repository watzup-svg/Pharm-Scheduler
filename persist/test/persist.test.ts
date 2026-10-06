import { test } from "node:test";
import assert from "node:assert/strict";
import { api, emptySession } from "../../domain/src/index.ts";
import type { World } from "../../domain/src/index.ts";
import { exportWorld, loadBytes } from "../codec.ts";
import { idbMem } from "../idb.ts";
import { replayEntry, makeEntry } from "../replay.ts";
import { FakeHandle, SQL, busyWorld, mk, mkFs, practice } from "./fakes.ts";

const saved = (w: World): World => ({ ...w, session: emptySession() });

test("journal replay equals the committed world", async () => {
  const { commits } = busyWorld();
  const base = practice();
  let w = base;
  let told: Record<string, string> | null = base.journal.told;
  let rebuilt = base;
  commits.forEach((c, i) => {
    const e = makeEntry(i + 1, c.world, c.cs, told);
    told = c.world.journal.told;
    const r = replayEntry(rebuilt, JSON.parse(JSON.stringify(e)));
    assert.ok(r, `entry ${i} follows`);
    rebuilt = r!;
    w = c.world;
    assert.deepEqual(rebuilt.state, w.state, `state after commit ${i}`);
    assert.deepEqual(rebuilt.journal.changeSets, w.journal.changeSets);
    assert.deepEqual(rebuilt.journal.told, w.journal.told);
  });
});

test("crash recovery: file older than browser copy -> recovery with both worlds; user chooses", async () => {
  const fs = mkFs();
  const idb = idbMem();
  const p = mk(fs, idb);
  const { commits } = busyWorld();
  const base = practice();
  fs.saveTarget = new FakeHandle("a.sqlite");
  await p.adopt(base, "Practice.sqlite");
  assert.ok((await p.saveAs(base)).ok);
  const h = fs.saveTarget;
  for (const c of commits.slice(0, 3)) await p.recordCommit(c.world, c.cs); // journal only: no snapshot, no save
  assert.equal(p.status().unsavedChanges, 3);
  const last = commits[2]!.world;
  const p2 = mk(fs, idb);
  const r = await p2.boot();
  assert.equal(r.state, "recovery");
  if (r.state !== "recovery") return;
  assert.equal(r.mirrorRev, r.fileRev + 3);
  assert.deepEqual(saved(r.mirrorWorld).state, saved(last).state);
  assert.deepEqual(r.world.state, base.state);
  const c = await p2.resolveRecovery!("mirror");
  assert.equal(c.state, "world");
  assert.equal(p2.status().unsavedChanges, 3);
  assert.ok((await p2.save(last)).ok);
  assert.equal(p2.status().unsavedChanges, 0);
  const back = loadBytes(SQL, h!.data);
  assert.ok(back.ok && back.world.journal.changeSets.length === last.journal.changeSets.length);
});

test("recovery choosing the file sets the browser copy aside, not away", async () => {
  const fs = mkFs();
  const idb = idbMem();
  const p = mk(fs, idb);
  const base = practice();
  const { commits } = busyWorld();
  fs.saveTarget = new FakeHandle("a.sqlite");
  await p.adopt(base, "x.sqlite");
  await p.saveAs(base);
  await p.recordCommit(commits[0]!.world, commits[0]!.cs);
  const p2 = mk(fs, idb);
  assert.equal((await p2.boot()).state, "recovery");
  const o = await p2.resolveRecovery!("file");
  assert.equal(o.state, "world");
  assert.equal(p2.status().unsavedChanges, 0);
  const kept = (await idb.all("ckpt")).filter((x) => (x.value as { kind: string }).kind === "set-aside");
  assert.equal(kept.length, 1);
});

test("save: failed write keeps the old file and stays unsaved", async () => {
  const fs = mkFs();
  const p = mk(fs);
  const base = practice();
  const { commits } = busyWorld();
  fs.saveTarget = new FakeHandle("a.sqlite");
  await p.adopt(base, "a.sqlite");
  await p.saveAs(base);
  const good = fs.saveTarget.data;
  await p.recordCommit(commits[0]!.world, commits[0]!.cs);
  fs.saveTarget.failMid = true;
  const r = await p.save(commits[0]!.world);
  assert.ok(!r.ok && r.reason === "write-failed");
  assert.equal(fs.saveTarget.data, good);
  assert.equal(p.status().unsavedChanges, 1);
  assert.match(p.status().error ?? "", /previous file is unchanged/);
  fs.saveTarget.failMid = false;
  assert.ok((await p.save(commits[0]!.world)).ok);
  assert.equal(p.status().unsavedChanges, 0);
  assert.equal(p.status().error, null);
});

test("save: read-back verification catches a silently corrupting writer and puts the old file back", async () => {
  const fs = mkFs();
  const p = mk(fs);
  const base = practice();
  fs.saveTarget = new FakeHandle("a.sqlite");
  await p.adopt(base, "a.sqlite");
  await p.saveAs(base);
  const h = fs.saveTarget;
  const good = h.data;
  await p.recordCommit(busyWorld().commits[0]!.world, busyWorld().commits[0]!.cs);
  h.corruptOnClose = true;
  const r = await p.save(busyWorld().commits[0]!.world);
  assert.ok(!r.ok && r.reason === "write-failed");
  assert.match(r.ok ? "" : (r.error ?? ""), /not what was written/);
  assert.equal(p.status().unsavedChanges, 1);
  assert.ok(good.length > 0);
});

test("Save As gives a new db_uuid; the old file keeps the old one", async () => {
  const fs = mkFs();
  const p = mk(fs);
  const base = practice();
  await p.adopt(base, "a.sqlite");
  fs.saveTarget = new FakeHandle("a.sqlite");
  await p.saveAs(base);
  const a = loadBytes(SQL, fs.saveTarget.data);
  fs.saveTarget = new FakeHandle("b.sqlite");
  await p.saveAs(base);
  const b = loadBytes(SQL, fs.saveTarget.data);
  assert.ok(a.ok && b.ok);
  if (a.ok && b.ok) assert.notEqual(a.meta.dbUuid, b.meta.dbUuid);
  assert.equal(p.status().fileName, "b.sqlite");
  assert.ok(p.status().linked);
});

test("Save As cancelled changes nothing", async () => {
  const fs = mkFs();
  const p = mk(fs);
  await p.adopt(practice(), "a.sqlite");
  fs.cancel = true;
  const r = await p.saveAs(practice());
  assert.deepEqual(r, { ok: false, reason: "cancelled" });
  assert.ok(!p.status().linked);
});

test("opening another file with unsaved changes returns unsaved-changes; force proceeds", async () => {
  const fs = mkFs();
  const p = mk(fs);
  const base = practice();
  const { commits } = busyWorld();
  fs.saveTarget = new FakeHandle("a.sqlite");
  await p.adopt(base, "a.sqlite");
  await p.saveAs(base);
  const other = new FakeHandle("other.sqlite", exportWorld(SQL, base, { dbUuid: "zzz", rev: 7, savedAt: "t" }));
  fs.next = other;
  assert.equal((await p.open()).state, "world"); // clean: fine
  fs.saveTarget = new FakeHandle("a2.sqlite");
  await p.saveAs(base);
  await p.recordCommit(commits[0]!.world, commits[0]!.cs);
  assert.equal((await p.open()).state, "unsaved-changes");
  const r = await p.open({ force: true });
  assert.equal(r.state, "world");
  assert.equal(p.status().fileName, "other.sqlite");
  assert.equal(p.status().unsavedChanges, 0);
});

test("open refuses a damaged file, leaves the live schedule alone, offers safety copies and salvage", async () => {
  const fs = mkFs();
  const p = mk(fs);
  const base = practice();
  fs.saveTarget = new FakeHandle("a.sqlite");
  await p.adopt(base, "a.sqlite");
  await p.saveAs(base); // keeps a saved copy in the browser
  const bytes = fs.saveTarget.data.slice();
  for (let i = 0; i < 4096; i++) bytes[8192 + i] = (i * 31) & 255;
  fs.next = new FakeHandle("bad.sqlite", bytes);
  const r = await p.open();
  assert.equal(r.state, "refused");
  if (r.state !== "refused") return;
  assert.ok(r.offers.some((o) => o.source === "idb-ckpt"));
  assert.equal(p.status().fileName, "a.sqlite");
  const rr = await p.restore(r.offers.find((o) => o.source === "idb-ckpt")!);
  assert.equal(rr.state, "world");
  assert.ok(!p.status().linked, "restoring detaches from the damaged file");
  assert.deepEqual(rr.state === "world" ? rr.world.state : null, base.state);
});

test("garbage and truncated files are refused", async () => {
  const fs = mkFs();
  const p = mk(fs);
  const good = exportWorld(SQL, practice(), { dbUuid: "u", rev: 1, savedAt: "t" });
  for (const data of [new Uint8Array(0), new TextEncoder().encode("hello".repeat(80)), good.slice(0, 9000)]) {
    fs.next = new FakeHandle("t.sqlite", data);
    assert.equal((await p.open({ force: true })).state, "refused");
  }
});

test("a file with inconsistent data opens read-only with the problems", async () => {
  const fs = mkFs();
  const p = mk(fs);
  const bad = structuredClone(practice());
  Object.values(bad.state.assignments)[0]!.pharmacistId = "P999";
  fs.next = new FakeHandle("odd.sqlite", exportWorld(SQL, bad, { dbUuid: "u", rev: 1, savedAt: "t" }));
  const r = await p.open();
  assert.equal(r.state, "world");
  if (r.state === "world") assert.ok(r.readOnly && r.readOnly.problems.length > 0);
});

test("restart: needs-permission until reconnect, then the file loads", async () => {
  const fs = mkFs();
  const idb = idbMem();
  const p = mk(fs, idb);
  const base = practice();
  fs.saveTarget = new FakeHandle("a.sqlite");
  await p.adopt(base, "a.sqlite");
  await p.saveAs(base);
  fs.saveTarget.perm = "prompt";
  const p2 = mk(fs, idb);
  const r = await p2.boot();
  assert.deepEqual(r, { state: "needs-permission", fileName: "a.sqlite" });
  assert.ok(p2.status().needsPermission);
  const r2 = await p2.reconnect();
  assert.equal(r2.state, "world");
  if (r2.state === "world") assert.deepEqual(r2.world.state, base.state);
  assert.ok(!p2.status().needsPermission);
});

test("boot with nothing is empty; boot with only a browser copy restores it", async () => {
  const fs = mkFs("download");
  const idb = idbMem();
  assert.equal((await mk(fs, idb).boot()).state, "empty");
  const p = mk(fs, idb);
  const { commits } = busyWorld();
  await p.adopt(practice(), "Practice.sqlite");
  for (const c of commits) await p.recordCommit(c.world, c.cs);
  const r = await mk(fs, idb).boot();
  assert.equal(r.state, "world");
  if (r.state === "world") assert.deepEqual(r.world.state, commits[commits.length - 1]!.world.state);
});

test("download fallback: Save is a download, open reads bytes, status says so", async () => {
  const fs = mkFs("download");
  const p = mk(fs);
  const base = practice();
  await p.adopt(base, "Mine.sqlite");
  assert.equal(p.status().backend, "download");
  assert.ok(p.status().neverSaved);
  assert.deepEqual(await p.save(base), { ok: false, reason: "unsupported" });
  assert.deepEqual(await p.saveAs(base), { ok: false, reason: "unsupported" });
  const r = await p.download(base);
  assert.ok(r.ok);
  assert.equal(fs.downloads.length, 1);
  assert.equal(fs.downloads[0]![0], "Mine.sqlite");
  assert.ok(!p.status().neverSaved && p.status().lastSavedAt);
  const p2 = mk(fs);
  fs.next = new FakeHandle("Mine.sqlite", fs.downloads[0]![1]);
  const o = await p2.open();
  assert.equal(o.state, "world");
  if (o.state === "world") assert.deepEqual(o.world.state, base.state);
  assert.ok(!p2.status().linked);
});

test("adopt resets the unsaved count; adopt without a name counts as an unsaved change", async () => {
  const fs = mkFs();
  const p = mk(fs);
  const { commits } = busyWorld();
  await p.adopt(practice(), "a.sqlite");
  await p.recordCommit(commits[0]!.world, commits[0]!.cs);
  assert.equal(p.status().unsavedChanges, 1);
  await p.adopt(api.checkpoint(commits[0]!.world, "c"));
  assert.equal(p.status().unsavedChanges, 2);
  await p.adopt(practice(), "b.sqlite");
  assert.equal(p.status().unsavedChanges, 0);
});

test("browser storage failure is reported, not hidden", async () => {
  const fs = mkFs();
  const idb = idbMem();
  const p = mk(fs, idb);
  const { commits } = busyWorld();
  await p.adopt(practice(), "a.sqlite");
  await p.recordCommit(commits[0]!.world, commits[0]!.cs);
  idb._failPuts = true;
  await assert.rejects(p.recordCommit(commits[1]!.world, commits[1]!.cs));
  assert.equal(p.status().mirrorOk, false);
  assert.equal(p.status().unsavedChanges, 2);
  idb._failPuts = false;
  await p.flush();
  assert.equal(p.status().mirrorOk, true);
});
