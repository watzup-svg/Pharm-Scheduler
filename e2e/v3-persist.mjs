// Save layer in a real Chromium: browser-copy recovery after reload, Save As / recovery with a file picker shim (OPFS-backed handles),
// the download fallback, and the built single file opened from file://. The native OS pickers cannot be automated.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { launch, serveV3, openApp, check, failed } from "./v3-lib.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Pickers backed by real OPFS handles: they clone into IndexedDB, have swap-file writes and queryPermission, like real ones.
const PICKER_SHIM = `
  window.__nextOpen = null;
  window.showSaveFilePicker = async (o) => (await navigator.storage.getDirectory()).getFileHandle(o?.suggestedName || 'x.sqlite', { create: true });
  window.showOpenFilePicker = async () => [await (await navigator.storage.getDirectory()).getFileHandle(window.__nextOpen)];
`;
const NO_PICKERS = `delete window.showSaveFilePicker; delete window.showOpenFilePicker;`;

const browser = await launch();
const srv = await serveV3();
const errorsAll = [];

const worldInfo = (page) => page.evaluate(() => { const w = window.__v3.app.getState().world; return w && { cs: w.journal.changeSets.length, asg: Object.keys(w.state.assignments).length }; });
const commitOne = (page) => page.evaluate(() => {
  const s = window.__v3.app.getState();
  const a = Object.values(s.world.state.assignments)[0];
  return s.commit([{ t: "update", assignmentId: a.id, patch: { pinned: !a.pinned } }], "e2e change");
});

try {
  // ---- 1. a change survives a reload (browser copy only, no file) ----
  {
    const ctx = await browser.newContext();
    await ctx.addInitScript(PICKER_SHIM);
    const { page, errors } = await openApp(browser, srv.base, { context: ctx });
    errorsAll.push(...errors);
    const before = await worldInfo(page);
    check("practice month loaded", before && before.asg > 100, JSON.stringify(before));
    check("commit goes through", await commitOne(page));
    check("commit goes through again", await commitOne(page));
    await sleep(300);
    const st = await page.evaluate(() => window.__persist.status());
    check("status counts unsaved changes", st.unsavedChanges === 2 && st.neverSaved === true && st.mirrorOk === true, JSON.stringify(st));
    await page.close();

    const second = await openApp(browser, srv.base, { practice: false, context: ctx });
    errorsAll.push(...second.errors);
    await second.page.waitForFunction(() => window.__v3.app.getState().world, null, { timeout: 15000 }).catch(() => {});
    const after = await worldInfo(second.page);
    check("change recovered from the browser copy after reload", after && after.cs === before.cs + 2 && after.asg === before.asg, JSON.stringify({ before, after }));
    const st2 = await second.page.evaluate(() => window.__persist.status());
    check("unsaved count survives reload", st2.unsavedChanges === 2, JSON.stringify(st2));

    // ---- 2. Save As to a file, change, reload -> recovery offers file vs browser copy ----
    const r = await second.page.evaluate(async () => window.__persist.saveAs(window.__v3.app.getState().world));
    check("Save As writes and verifies the file", r.ok === true && r.bytes > 10000, JSON.stringify(r));
    const st3 = await second.page.evaluate(() => window.__persist.status());
    check("linked and clean after Save As", st3.linked && st3.unsavedChanges === 0 && !!st3.fileName, JSON.stringify(st3));
    check("one more change", await commitOne(second.page));
    await sleep(200);
    await second.page.close();

    const third = await openApp(browser, srv.base, { practice: false, context: ctx });
    errorsAll.push(...third.errors);
    await third.page.waitForFunction(() => window.__persist.lastBoot?.(), null, { timeout: 15000 });
    const boot = await third.page.evaluate(() => { const b = window.__persist.lastBoot(); return { state: b.state, fileRev: b.fileRev, mirrorRev: b.mirrorRev }; });
    check("reload offers recovery (browser copy newer than the file)", boot.state === "recovery" && boot.mirrorRev === boot.fileRev + 1, JSON.stringify(boot));
    const out = await third.page.evaluate(async () => {
      const r = await window.__persist.resolveRecovery("mirror");
      const unsaved = window.__persist.status().unsavedChanges;
      const saved = await window.__persist.save(r.world);
      return { state: r.state, unsaved, saved, after: window.__persist.status().unsavedChanges };
    });
    check("choosing the browser copy opens it with its unsaved count", out.state === "world" && out.unsaved === 1, JSON.stringify(out));
    check("then Save works and clears the unsaved count", out.saved.ok === true && out.after === 0, JSON.stringify(out));

    // ---- 3. open the saved file again (picker shim), unsaved guard ----
    const name = await third.page.evaluate(() => window.__persist.status().fileName);
    await third.page.evaluate((n) => { window.__nextOpen = n; }, name);
    const guard = await third.page.evaluate(async () => window.__persist.open());
    check("clean schedule opens a file without the guard", guard.state === "world" && !!guard.world, guard.state);
    await ctx.close();
  }

  // ---- 4. download fallback (no pickers, like Firefox / Safari) ----
  {
    const ctx = await browser.newContext({ acceptDownloads: true });
    await ctx.addInitScript(NO_PICKERS);
    const { page, errors } = await openApp(browser, srv.base, { context: ctx });
    errorsAll.push(...errors);
    const be = await page.evaluate(() => window.__persist.status().backend);
    check("no pickers -> download backend", be === "download", be);
    const [dl] = await Promise.all([
      page.waitForEvent("download"),
      page.evaluate(() => window.__persist.download(window.__v3.app.getState().world)),
    ]);
    const file = path.join(root, "dist-v3", "e2e-download.sqlite");
    await dl.saveAs(file);
    const size = fs.statSync(file).size;
    check("download hands out a database file", size > 10000 && fs.readFileSync(file).subarray(0, 15).toString() === "SQLite format 3", `${size} bytes`);
    const st = await page.evaluate(() => window.__persist.status());
    check("download counts as saved, says so, not linked", !st.linked && !st.neverSaved && !!st.lastSavedAt && st.unsavedChanges === 0, JSON.stringify(st));
    const before = await worldInfo(page);
    // import: open through the file input
    const chooser = page.waitForEvent("filechooser");
    const opening = page.evaluate(() => window.__persist.open().then((r) => ({ state: r.state, asg: r.world && Object.keys(r.world.state.assignments).length })));
    (await chooser).setFiles(file);
    const res = await opening;
    check("import through the file input restores the same schedule", res.state === "world" && res.asg === before.asg, JSON.stringify(res));
    fs.rmSync(file, { force: true });
    await ctx.close();
  }

  // ---- 5. the built file from file:// ----
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
    await page.goto("file://" + path.join(root, "dist-v3", "v3.html"));
    await page.waitForFunction(() => window.__v3, null, { timeout: 15000 });
    await page.evaluate(() => window.__v3.loadPractice());
    check("file:// boots", true);
    check("file:// commit", await commitOne(page));
    await sleep(300);
    const flush = await page.evaluate(async () => { await window.__persist.flush(); const s = window.__persist.status(); return { mirrorOk: s.mirrorOk, backend: s.backend, secure: window.isSecureContext }; });
    check("file:// sql.js (inlined wasm) writes the browser copy", flush.mirrorOk === true, JSON.stringify(flush));
    await page.reload();
    await page.waitForFunction(() => window.__v3.app.getState().world, null, { timeout: 15000 }).catch(() => {});
    check("file:// reload restores from the browser copy", !!(await worldInfo(page)));
    check("file:// no page errors", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  check("no page errors in http runs", errorsAll.length === 0, errorsAll.join(" | "));
} finally {
  await browser.close();
  srv.close();
}
const size = fs.statSync(path.join(root, "dist-v3", "v3.html")).size;
console.log(`built v3.html: ${(size / 1024).toFixed(0)} KB`);
process.exit(failed() ? 1 : 0);
