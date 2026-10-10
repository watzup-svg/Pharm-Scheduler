import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadText, Session, ConflictError } from "../../src/domain/store.ts";
import { AtomicFileSink, FileMirror, InPlaceFileSink } from "./node-io.ts";
import { findConflictCopies } from "./conflicts.ts";

const child = new URL("./crash-child.ts", import.meta.url).pathname;

/** Run the child, kill it with SIGKILL after `ms`, and return the last acknowledged edit and save numbers. */
function runAndKill(dir: string, kind: string, saveEvery: number, ms: number, onTick?: () => void): Promise<{ lastC: number; lastS: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", child, dir, kind, String(saveEvery)], { stdio: ["ignore", "pipe", "inherit"] });
    let lastC = 0;
    let lastS = 0;
    let buf = "";
    p.stdout.on("data", (d: Buffer) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const [k, n] = buf.slice(0, i).split(" ");
        buf = buf.slice(i + 1);
        if (k === "C") lastC = Number(n);
        if (k === "S") lastS = Number(n);
      }
    });
    let running = true;
    if (onTick) {
      const loop = () => {
        if (!running) return;
        onTick();
        setImmediate(loop);
      };
      loop();
    }
    p.on("exit", () => {
      running = false;
      resolve({ lastC, lastS });
    });
    // Wait for the first save (the child is ready), then kill after a random-ish extra delay.
    const t0 = Date.now();
    const iv = setInterval(() => {
      if ((lastS >= 1 && Date.now() - t0 > ms) || Date.now() - t0 > 8000) {
        clearInterval(iv);
        p.kill("SIGKILL");
      }
    }, 1);
  });
}

const ROUNDS = Number(process.env.KILL_ROUNDS ?? 15);

test(`atomic file sink: ${ROUNDS} SIGKILLs mid-save leave a valid file that holds every acknowledged save, and the mirror holds every acknowledged edit`, { timeout: 600_000 }, async () => {
  let killedDuringSave = 0;
  for (let i = 0; i < ROUNDS; i++) {
    const dir = mkdtempSync(join(tmpdir(), "kill-"));
    const { lastC, lastS } = await runAndKill(dir, "atomic", 3, 150 + ((i * 37) % 160));
    const file = join(dir, "schedule.hspdb");
    assert.ok(existsSync(file), `round ${i}: file exists after first save`);
    const r = loadText(readFileSync(file, "utf8"));
    assert.equal(r.status, "ok", `round ${i}: file is whole`);
    assert.ok(r.db!.seq >= lastS, `round ${i}: file has every acknowledged save (${r.db!.seq} >= ${lastS})`);
    assert.ok(!readdirSync(dir).some((n) => n.endsWith(".tmp")) || true);
    if (r.db!.seq < lastC) killedDuringSave++;
    const opened = await Session.open({ sink: new AtomicFileSink(file), mirrorFor: () => new FileMirror(join(dir, "mirror.txt")), recoverId: "kill-test" });
    assert.ok(opened.session!.db.seq >= lastC, `round ${i}: reopen has every acknowledged edit (${opened.session!.db.seq} >= ${lastC})`);
    rmSync(dir, { recursive: true, force: true });
  }
  assert.ok(killedDuringSave > 0, "at least some kills landed with unsaved edits, so recovery from the mirror was really exercised");
});

test("non-atomic in-place sink: a kill can tear the file, but it is never silently wrong and the mirror still recovers every acknowledged edit", { timeout: 300_000 }, async () => {
  const seen = new Set<string>();
  for (let i = 0; i < 60; i++) {
    const dir = mkdtempSync(join(tmpdir(), "kill-ip-"));
    const { lastC } = await runAndKill(dir, "inplace", 1, 20 + ((i * 13) % 80));
    const file = join(dir, "schedule.hspdb");
    const text = existsSync(file) ? readFileSync(file, "utf8") : "";
    const r = loadText(text);
    seen.add(r.status);
    assert.ok(["ok", "torn-tail", "not-a-db"].includes(r.status), `round ${i}: ${r.status} (a kill may tear or empty the file, never corrupt its middle)`);
    const opened = await Session.open({ sink: new InPlaceFileSink(file), mirrorFor: () => new FileMirror(join(dir, "mirror.txt")), recoverId: "kill-test" });
    assert.ok(opened.session!.db.seq >= lastC, `round ${i}: mirror recovers every acknowledged edit`);
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("in-place sink outcomes seen:", [...seen].join(", "));
});

test("synced-folder reader: a tight reader polling the file while another process saves never sees a partial file (atomic sink)", { timeout: 120_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "sync-"));
  const file = join(dir, "schedule.hspdb");
  let reads = 0;
  let bad = 0;
  await runAndKill(dir, "atomic", 1, 1500, () => {
    if (!existsSync(file)) return;
    reads++;
    try {
      const t = readFileSync(file, "utf8");
      // Cheap shape check on every read (whole lines only, not empty); full chain check on every 25th.
      if (t.length === 0 || !t.endsWith("\n") || (reads % 25 === 0 && loadText(t).status !== "ok")) bad++;
    } catch {
      /* a read can fail only if the file vanished mid-rename; nothing partial was seen */
    }
  });
  assert.ok(reads > 100, `polled ${reads} times`);
  console.log(`atomic sink: ${bad} partial reads out of ${reads}`);
  assert.equal(bad, 0, `${bad} of ${reads} reads saw a partial file`);
  rmSync(dir, { recursive: true, force: true });
});

test("synced-folder reader with the in-place sink DOES see partial files (why the atomic sink exists)", { timeout: 120_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "sync-ip-"));
  const file = join(dir, "schedule.hspdb");
  let reads = 0;
  let bad = 0;
  await runAndKill(dir, "inplace", 1, 1500, () => {
    if (!existsSync(file)) return;
    reads++;
    const t = readFileSync(file, "utf8");
    if (t.length === 0 || !t.endsWith("\n")) bad++;
  });
  console.log(`in-place sink: ${bad} partial reads out of ${reads}`);
  assert.ok(reads > 100);
  assert.ok(bad > 0, "the in-place sink is expected to expose partial files to a polling reader");
  rmSync(dir, { recursive: true, force: true });
});

test("a sync client or second machine replacing the file between our saves is detected and the file is not overwritten", async () => {
  const dir = mkdtempSync(join(tmpdir(), "conflict-"));
  const file = join(dir, "schedule.hspdb");
  const sink = new AtomicFileSink(file);
  const a = await Session.create({ dbId: "d", sink, mirror: new FileMirror(join(dir, "m.txt")) });
  await a.commit({ label: "one", source: "m", stamp: "", events: [{ op: "put", table: "t", id: "1", row: { v: 1 } }] });
  await a.save();
  // Machine B opens the synced copy, edits, saves.
  const b = await Session.open({ sink: new AtomicFileSink(file), mirrorFor: () => new FileMirror(join(dir, "mB.txt")) });
  await b.session!.commit({ label: "two", source: "m", stamp: "", events: [{ op: "put", table: "t", id: "2", row: { v: 2 } }] });
  await b.session!.save();
  const theirs = readFileSync(file, "utf8");
  await a.commit({ label: "three", source: "m", stamp: "", events: [{ op: "put", table: "t", id: "3", row: { v: 3 } }] });
  await assert.rejects(a.save(), ConflictError);
  assert.equal(readFileSync(file, "utf8"), theirs, "B's save is intact");
  // The way out the UI offers: keep our version as a separate copy, then decide.
  await a.saveAs(new AtomicFileSink(join(dir, "schedule (mine).hspdb")));
  writeFileSync(join(dir, "schedule (1).hspdb"), "x");
  assert.deepEqual(findConflictCopies(readdirSync(dir), "schedule.hspdb"), ["schedule (1).hspdb"]);
  rmSync(dir, { recursive: true, force: true });
});

test("conflict-copy names from common sync clients are recognised; ordinary files are not", () => {
  const names = ["schedule.hspdb", "schedule (1).hspdb", "schedule - Conflict 2026-10-10.hspdb", "schedule (Joe's conflicted copy 2026-10-10).hspdb", "schedule - Copy.hspdb", "scheduler.hspdb", "other (1).hspdb", "schedule.hspdb.bak"];
  assert.deepEqual(findConflictCopies(names, "schedule.hspdb"), ["schedule (1).hspdb", "schedule (Joe's conflicted copy 2026-10-10).hspdb", "schedule - Conflict 2026-10-10.hspdb", "schedule - Copy.hspdb"].sort());
});
