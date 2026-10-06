// persistence-torture: model-based fuzz of the save layer (persist/core.ts) with injected faults, using the persist/test fakes (in-memory file handle, in-memory IndexedDB).
// Faults: write fails mid-save, writer silently corrupts the file, browser storage full (idb _failPuts), process killed at any point (a new Persist on the same storage), file permission revoked, browser copy stale.
// Model: `cur` = what the user sees; `acked` = the newest world the mirror reported durable (recordCommit resolved and status().mirrorOk); `fileWorld` = the last world saved to the file.
// After every kill + boot the recovered world must equal `acked` (or, for "recovery", the file must equal `fileWorld` and the offered browser copy `acked`). A failed save must leave the file bytes untouched.
// Replay one sequence: node --experimental-strip-types --no-warnings scripts/v3-pressure/suites/persistence-torture.ts --level low --case seq-3
import { api } from "../../../domain/src/index.ts";
import type { Edit, World } from "../../../domain/src/index.ts";
import { exportWorld, loadBytes, sameSaved } from "../../../persist/codec.ts";
import { idbMem } from "../../../persist/idb.ts";
import type { BootResult } from "../../../app3/persist-types.ts";
import { FakeHandle, SQL, mk, mkFs, practice } from "../../../persist/test/fakes.ts";
import { Invariant, parseArgs, pick3, rng, runSuite, type Case, type Rng } from "../lib.ts";

const args = parseArgs();
const L = args.level;
const strip = (w: World): World => ({ ...w, session: { proposal: null, scenario: null } });
const eq = (a: World, b: World) => sameSaved(strip(a), strip(b));
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

function randomEdit(w: World, r: Rng): Edit {
  const asg = Object.keys(w.state.assignments), phs = Object.keys(w.state.pharmacists), stores = Object.keys(w.state.stores);
  const k = r.int(5);
  const date = `2026-10-${String(1 + r.int(28)).padStart(2, "0")}`;
  if (k === 0 && asg.length) return { t: "update", assignmentId: r.pick(asg), patch: { pinned: r.chance(0.5) } };
  if (k === 1) return { t: "unavail.add", pharmacistId: r.pick(phs), first: date, last: date, status: "Requested", type: "Vacation" };
  if (k === 2 && asg.length) return { t: "remove", assignmentId: r.pick(asg) };
  if (k === 3) return { t: "dateOverride.set", storeId: r.pick(stores), date, count: r.int(3), note: "t" };
  return { t: "place", storeId: r.pick(stores), pharmacistId: r.pick(phs), date };
}

function sequenceCase(n: number, steps: number): Case {
  const id = `seq-${n}`;
  return {
    id,
    async run(ctx) {
      const r = rng(n * 977 + 5);
      const linked = n % 4 !== 3; // every 4th sequence runs on the download fallback (no file handle)
      const fs = mkFs(linked ? "fsa" : "download");
      const idb = idbMem();
      let p = mk(fs, idb);
      const log: string[] = [];
      const replay = `node --experimental-strip-types --no-warnings scripts/v3-pressure/suites/persistence-torture.ts --level ${L} --case ${id}`;
      const fail = (inv: string, msg: string): never => { throw new Invariant(inv, msg, { replay, actions: log }); };
      const base = practice();
      let cur = base;
      let acked: World = base;
      let fileWorld: World | null = null;
      let handle: FakeHandle | null = null;
      await p.adopt(base, "Seq.sqlite");
      if (linked) { handle = new FakeHandle("seq.sqlite"); fs.saveTarget = handle; const s = await p.saveAs(base); if (!s.ok) fail("saveAs", `initial saveAs failed: ${JSON.stringify(s)}`); fileWorld = base; }
      const counts: Record<string, number> = {};
      const bump = (k: string) => { counts[k] = (counts[k] ?? 0) + 1; };
      let quota = false;

      const checkBoot = (b: BootResult, what: string) => {
        if (b.state === "world") {
          if (linked && fileWorld && !eq(b.world, acked) && !eq(b.world, fileWorld)) fail("boot-wrong-world", `${what}: booted world matches neither the last durable browser copy (${acked.journal.changeSets.length} change sets) nor the file (${fileWorld.journal.changeSets.length}); got ${b.world.journal.changeSets.length}`);
          if (!linked && !eq(b.world, acked)) fail("boot-lost-work", `${what}: browser-only copy came back with ${b.world.journal.changeSets.length} change sets, last durable had ${acked.journal.changeSets.length}`);
          if (linked && fileWorld && eq(b.world, fileWorld) && !eq(acked, fileWorld) && acked.journal.changeSets.length > fileWorld.journal.changeSets.length) fail("boot-silently-dropped-work", `${what}: file loaded and ${acked.journal.changeSets.length - fileWorld.journal.changeSets.length} durable browser-side change set(s) were dropped without a recovery offer`);
        } else if (b.state === "recovery") {
          if (!eq(b.world, fileWorld!)) fail("recovery-file", `${what}: recovery's file side differs from the last saved file`);
          if (!eq(b.mirrorWorld, acked)) fail("recovery-mirror", `${what}: recovery's browser side has ${b.mirrorWorld.journal.changeSets.length} change sets, last durable had ${acked.journal.changeSets.length}`);
        } else if (b.state === "empty") fail("boot-empty", `${what}: nothing came back though a schedule was adopted`);
        else if (b.state === "refused") fail("boot-refused", `${what}: ${b.reason}: ${b.error}`);
      };
      const afterBoot = async (b: BootResult, what: string): Promise<void> => {
        if (b.state === "needs-permission") { bump("permission"); handle!.perm = "granted"; const b2 = await p.reconnect(); log.push(`  reconnect -> ${b2.state}`); b = b2; }
        checkBoot(b, what);
        if (b.state === "recovery") {
          const pick = r.chance(0.5) ? "mirror" : "file";
          const o = await p.resolveRecovery!(pick);
          log.push(`  resolveRecovery(${pick}) -> ${o.state}`);
          if (o.state !== "world") fail("recovery-resolve", `resolveRecovery(${pick}) gave ${o.state}`);
          cur = o.world;
          if (pick === "file") { acked = fileWorld!; if (p.status().unsavedChanges !== 0) fail("status", `after choosing the file the status still shows ${p.status().unsavedChanges} unsaved change(s)`); }
          else { acked = b.mirrorWorld; if (p.status().unsavedChanges === 0) fail("status", "after choosing the browser copy the status shows nothing unsaved"); }
          return;
        }
        if (b.state === "world") { cur = b.world; acked = b.world; if (linked && fileWorld && !eq(b.world, fileWorld)) { /* unsaved work restored from the browser copy */ } }
      };

      for (let step = 0; step < steps; step++) {
        const roll = r.next();
        const tag = `#${step}`;
        try {
          if (roll < 0.42) {
            const e = randomEdit(cur, r);
            const c = api.commit(cur, [e], { kind: "manual", label: "t" });
            if ("refused" in c) { log.push(`${tag} commit refused`); continue; }
            cur = c.world; bump("commit");
            let threw = false;
            try { await p.recordCommit(cur, c.changeSet); } catch { threw = true; }
            log.push(`${tag} commit ${c.changeSet.id} quota=${quota} -> ${threw ? "recordCommit rejected" : "ok"} mirrorOk=${p.status().mirrorOk}`);
            if (quota && !threw && p.status().mirrorOk) fail("quota-silent", `${tag}: storage was full yet recordCommit resolved and the status says the browser copy is fine`);
            if (threw && p.status().mirrorOk) fail("quota-status", `${tag}: recordCommit rejected but status().mirrorOk is still true`);
            if (!threw && p.status().mirrorOk) acked = cur;
            if (threw && p.status().unsavedChanges < 1) fail("quota-status", `${tag}: a commit that could not be kept shows no unsaved change`);
          } else if (roll < 0.50) {
            if (!linked) { const d = await p.download(cur); log.push(`${tag} download -> ${d.ok}`); if (!d.ok) fail("download", `download failed: ${JSON.stringify(d)}`); continue; }
            const before = handle!.data;
            const rr = await p.save(cur);
            bump("save"); log.push(`${tag} save -> ${rr.ok ? "ok" : rr.reason}`);
            if (!rr.ok) fail("save-failed", `a plain save failed: ${JSON.stringify(rr)}`);
            fileWorld = cur;
            if (p.status().unsavedChanges !== 0) fail("status", `after a successful save ${p.status().unsavedChanges} change(s) still show as unsaved`);
            const back = loadBytes(SQL, handle!.data);
            if (!back.ok || !eq(back.world, cur)) fail("save-content", `the saved file does not load back to the saved world (${back.ok ? "different content" : back.error})`);
            void before;
          } else if (roll < 0.56 && linked) {
            const before = handle!.data;
            const mode = r.pick(["failMid", "corrupt"] as const);
            if (mode === "failMid") handle!.failMid = true;
            else {
              // a writer that damages exactly one write (the one being verified); the put-back of the old file then goes through cleanly
              const hh = handle!; const orig = hh.createWritable.bind(hh);
              hh.createWritable = async () => { const w = await orig(); const c = w.close; w.close = async () => { await c(); hh.corruptOnClose = false; hh.createWritable = orig; }; return w; };
              hh.corruptOnClose = true;
            }
            const rr = await p.save(cur);
            handle!.failMid = false; handle!.corruptOnClose = false;
            bump("save-" + mode); log.push(`${tag} save(${mode}) -> ${rr.ok ? "OK?!" : rr.reason}`);
            if (rr.ok) fail("save-lied", `${mode}: save reported success though the write was damaged`);
            if (!same(handle!.data, before)) fail("save-damaged-file", `${mode}: a failed save changed the file on disk (${before.length} -> ${handle!.data.length} bytes)`);
            const lb = loadBytes(SQL, handle!.data);
            if (!lb.ok || !eq(lb.world, fileWorld!)) fail("save-damaged-file", `${mode}: after a failed save the file no longer loads to the last saved world`);
            if (cur.journal.changeSets.length > fileWorld!.journal.changeSets.length && p.status().unsavedChanges < 1) fail("status", `${mode}: failed save but nothing shows as unsaved`);
            if (!p.status().error) fail("status", `${mode}: failed save left no error message for the user`);
          } else if (roll < 0.62) {
            quota = !quota; (idb as { _failPuts?: boolean })._failPuts = quota; log.push(`${tag} quota=${quota}`); bump("quota");
            if (!quota) { try { await p.flush(); } catch { /* still failing is fine */ } if (p.status().mirrorOk) acked = cur; }
          } else if (roll < 0.68) {
            let threw = false;
            try { await p.flush(); } catch { threw = true; }
            log.push(`${tag} flush quota=${quota} -> ${threw ? "rejected" : "ok"}`);
            if (quota && !threw && p.status().mirrorOk) fail("quota-silent", `${tag}: flush resolved with storage full`);
            if (!threw && p.status().mirrorOk) acked = cur;
          } else if (roll < 0.74) {
            const cs = cur.journal.changeSets[cur.journal.changeSets.length - 1];
            if (!cs || cs.kind === "undo") continue;
            const u = api.undo(cur, cs.id);
            if ("refused" in u) { log.push(`${tag} undo refused`); continue; }
            cur = u.world; bump("undo");
            let threw = false; try { await p.recordCommit(cur, u.changeSet); } catch { threw = true; }
            log.push(`${tag} undo ${cs.id} -> ${threw ? "rejected" : "ok"}`);
            if (!threw && p.status().mirrorOk) acked = cur;
          } else if (roll < 0.78) {
            const w2 = api.checkpoint(cur, `cp${step}`);
            cur = w2; bump("checkpoint");
            let threw = false; try { await p.adopt(cur); } catch { threw = true; }
            log.push(`${tag} checkpoint+adopt -> ${threw ? "rejected" : "ok"}`);
            if (!threw && p.status().mirrorOk) acked = cur;
          } else {
            // kill: the process dies right here (nothing flushed), a fresh Persist boots on the same storage
            const revoke = linked && r.chance(0.3);
            if (revoke) handle!.perm = "prompt";
            quota = false; (idb as { _failPuts?: boolean })._failPuts = false;
            p = mk(fs, idb);
            const b = await p.boot();
            bump("kill"); log.push(`${tag} KILL${revoke ? " (permission revoked)" : ""} -> boot ${b.state}`);
            await afterBoot(b, `${tag} boot`);
          }
        } catch (e) {
          if (e instanceof Invariant) throw e;
          fail("persist-threw", `${tag}: the save layer threw ${(e as Error)?.name}: ${(e as Error)?.message}`);
        }
      }
      ctx.note(`${steps} steps: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")}`);
      for (const [k, v] of Object.entries(counts)) ctx.metric(k, v);
    },
  };
}

/** The file and the browser copy diverged (two windows). Pass if the other side's work is recoverable; flag a known open issue if it is silently dropped. */
const twoWriters: Case = {
  id: "stale-copy-two-windows",
  async run(ctx) {
    const fs = mkFs();
    const idbA = idbMem();
    const h = new FakeHandle("shared.sqlite");
    fs.saveTarget = h;
    const base = practice();
    const a = mk(fs, idbA);
    await a.adopt(base, "shared.sqlite");
    if (!(await a.saveAs(base)).ok) throw new Invariant("setup", "saveAs failed");
    const r = rng(11);
    // window A makes an edit that stays only in its browser copy
    const c1 = api.commit(base, [randomEdit(base, r)], { kind: "manual", label: "A" });
    if ("refused" in c1) throw new Invariant("setup", "commit refused");
    await a.recordCommit(c1.world, c1.changeSet);
    // window B opens the same file (older rev), makes two other edits and saves them
    const idbB = idbMem();
    const b = mk(fs, idbB);
    fs.next = h;
    const o = await b.open();
    if (o.state !== "world") throw new Invariant("setup", `B could not open: ${o.state}`);
    let wb = o.world;
    for (let i = 0; i < 2; i++) { const c = api.commit(wb, [randomEdit(wb, r)], { kind: "manual", label: "B" + i }); if (!("refused" in c)) { wb = c.world; await b.recordCommit(wb, c.changeSet); } }
    if (!(await b.save(wb)).ok) throw new Invariant("setup", "B could not save");
    // window A is closed and reopened
    const a2 = mk(fs, idbA);
    const boot = await a2.boot();
    const kept = (await idbA.all("ckpt")).some((x) => (x.value as { kind: string }).kind === "set-aside");
    const offered = boot.state === "recovery" || kept;
    ctx.note(`A's unsaved edit after B saved: boot ${boot.state}, ${offered ? "recoverable" : "NOT recoverable"}`);
    if (!offered) ctx.known("Two windows on one file: the older window's unsaved edits are dropped without a recovery offer (docs/v3/HARDENING.md open item 4, last writer wins).");
  },
};

const seqs = pick3(L, 8, 30, 90);
const steps = pick3(L, 160, 260, 400);
const cases: Case[] = [twoWriters, ...Array.from({ length: seqs }, (_, i) => sequenceCase(i + 1, steps))];
void exportWorld;
await runSuite("persistence-torture", cases, args);
