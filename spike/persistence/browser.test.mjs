// Browser checks for the persistence spike, run against the built single file. `npm run spike:persistence && node spike/persistence/browser.test.mjs`
// Uses the Chromium that is installed (PLAYWRIGHT_BROWSERS_PATH). Everything is opened as file:// except section D, which needs http://localhost for a private file area.
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";

const html = resolve("dist-persistence-spike/index.html");
const fileUrl = "file://" + html;
const exe = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium";
const results = [];
const pass = (name, extra = "") => { results.push(`ok   ${name}${extra ? "  " + extra : ""}`); console.log(results.at(-1)); };

async function launch(dir) {
  return chromium.launchPersistentContext(dir, { executablePath: exe, args: ["--no-sandbox"], acceptDownloads: true });
}

// A. reload keeps everything (browser copy), checkpoint + revert are change sets
{
  const dir = mkdtempSync(join(tmpdir(), "pw-a-"));
  const ctx = await launch(dir);
  const p = await ctx.newPage();
  await p.goto(fileUrl);
  const id = await p.evaluate(() => h.newDb());
  await p.evaluate(() => h.edits(300));
  await p.evaluate(() => h.checkpoint("before"));
  await p.evaluate(() => h.edits(50));
  const before = await p.evaluate(() => h.state());
  await p.evaluate(() => h.revert("before"));
  const reverted = await p.evaluate(() => h.state());
  assert.equal(reverted.seq, before.seq + 1, "revert is one more change set");
  const final = reverted;
  await p.reload();
  assert.deepEqual(await p.evaluate(() => h.listMirrorIds()), [id]);
  const rep = await p.evaluate((id) => h.recoverFromBrowser(id), id);
  assert.equal(rep.from, "mirror");
  const after = await p.evaluate(() => h.state());
  assert.equal(after.seq, final.seq);
  assert.equal(after.hash, final.hash);
  pass("A reload from a double-clicked file recovers every change from the browser copy", `(${final.seq} change sets)`);

  // B. Save a copy (download), clear ALL site data, reopen by upload
  const dl = p.waitForEvent("download");
  await p.evaluate(() => h.saveAs(new (class { async read() { return null; } async write(t) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([t])); a.download = "copy.hspdb"; a.click(); } })()));
  const download = await dl;
  const saved = join(dir, "copy.hspdb");
  await download.saveAs(saved);
  const text = readFileSync(saved, "utf8");
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Storage.clearDataForOrigin", { origin: "file://", storageTypes: "all" });
  await p.reload();
  assert.deepEqual(await p.evaluate(() => h.listMirrorIds()), [], "site data really is gone");
  const rep2 = await p.evaluate((t) => h.openText(t, "copy.hspdb"), text);
  assert.equal(rep2.fileStatus, "ok");
  const restored = await p.evaluate(() => h.state());
  assert.equal(restored.hash, final.hash);
  assert.equal(restored.seq, final.seq);
  assert.equal(restored.checkpoints, 1);
  pass("B after clearing all site data, the downloaded file reopens to the identical state", `(${Math.round(text.length / 1024)} KB)`);

  // B2. a torn download (cut anywhere) still opens to the last whole record
  const cut = text.slice(0, Math.floor(text.length * 0.6));
  const rep3 = await p.evaluate((t) => h.openText(t, "cut.hspdb"), cut);
  assert.equal(rep3.fileStatus, "torn-tail");
  assert.ok((await p.evaluate(() => h.state())).seq > 0);
  pass("B2 a file cut off partway opens to the last whole change set and says so");

  // E. timings at a realistic size
  const bench = await p.evaluate(() => h.bench());
  console.log("   bench", JSON.stringify(bench));
  results.push("   bench " + JSON.stringify(bench));
  assert.ok(bench.editMsP95 < 100, `p95 durable edit ${bench.editMsP95} ms`);
  pass("E durable edit stays fast at 17,000 rows", `median ${bench.editMsMedian.toFixed(1)} ms, p95 ${bench.editMsP95.toFixed(1)} ms`);
  await ctx.close();
  rmSync(dir, { recursive: true, force: true });
}

// C. kill -9 the whole browser mid-edit, five times, and recover every acknowledged edit
{
  for (let round = 1; round <= 5; round++) {
    const dir = mkdtempSync(join(tmpdir(), "pw-kill-"));
    let ctx = await launch(dir);
    let p = await ctx.newPage();
    let lastC = 0;
    p.on("console", (m) => { const t = m.text(); if (t.startsWith("C ")) lastC = Number(t.slice(2)); });
    await p.goto(fileUrl);
    const id = await p.evaluate(() => h.newDb());
    p.evaluate(async () => { for (;;) { const s = await h.edits(1); console.log("C " + s); } }).catch(() => {});
    const target = 20 + round * 15;
    while (lastC < target) await new Promise((r) => setTimeout(r, 5));
    for (const line of execSync("ps -eo pid=,args=").toString().split("\n")) {
      const m = line.trim().match(/^(\d+)\s+(.*)$/);
      if (m && m[2].includes(`--user-data-dir=${dir}`) && !m[2].includes("--type=")) process.kill(Number(m[1]), "SIGKILL"); // the browser's main process; its helpers die with it
    }
    await new Promise((r) => setTimeout(r, 500));
    await ctx.close().catch(() => {});
    ctx = await launch(dir);
    p = await ctx.newPage();
    await p.goto(fileUrl);
    assert.deepEqual(await p.evaluate(() => h.listMirrorIds()), [id]);
    const rep = await p.evaluate((id) => h.recoverFromBrowser(id), id);
    const st = await p.evaluate(() => h.state());
    assert.equal(rep.mirrorStatus === "ok" || rep.mirrorStatus === "torn-tail", true);
    assert.ok(st.seq >= lastC, `round ${round}: recovered ${st.seq} change sets, last acknowledged ${lastC}`);
    assert.ok(st.seq <= lastC + 3, `round ${round}: nothing invented (${st.seq} vs ${lastC})`);
    await ctx.close();
    rmSync(dir, { recursive: true, force: true });
  }
  pass("C kill -9 of the browser mid-edit x5: every acknowledged change set recovered, none invented");
}

// D. File System Access sink against a real FileSystemFileHandle (the browser's private file area on http://localhost; the picker itself needs a human)
{
  const srv = createServer((_, res) => { res.setHeader("content-type", "text/html"); res.end(readFileSync(html)); });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const url = `http://localhost:${srv.address().port}/`;
  const dir = mkdtempSync(join(tmpdir(), "pw-d-"));
  const ctx = await launch(dir);
  const p = await ctx.newPage();
  await p.goto(url);
  const r = await p.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const fh = await root.getFileHandle("schedule.hspdb", { create: true });
    await h.newDb();
    await h.edits(20);
    await h.saveToHandle(fh);
    await h.edits(5);
    const s1 = await h.save();
    // Another writer (a second tab, or a sync client) replaces the file.
    const other = await fh.createWritable();
    await other.write((await (await fh.getFile()).text()) + "tampered\n");
    await other.close();
    await h.edits(2);
    const s2 = await h.save();
    const onDisk = await (await fh.getFile()).text();
    const stillTampered = onDisk.endsWith("tampered\n");
    // Take the file as it is (the torn extra line is dropped) and open it.
    const rep = await h.openHandle(fh);
    return { s1, s2, stillTampered, rep, state: h.state() };
  });
  assert.equal(r.s1, "saved");
  assert.equal(r.s2, "conflict");
  assert.equal(r.stillTampered, true, "refused save did not overwrite");
  assert.equal(r.rep.fileStatus, "torn-tail");
  pass("D FileSystemFileHandle sink: save, outside-edit refused without overwriting, torn tail opens", `(OPFS handle; real picker not exercised)`);
  await ctx.close();
  srv.close();
  rmSync(dir, { recursive: true, force: true });
}

console.log("\n" + results.join("\n"));
