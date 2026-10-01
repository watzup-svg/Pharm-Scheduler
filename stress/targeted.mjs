// Targeted stress: big document timing, damaged/blocked storage, rapid undo, long names.
import fs from "node:fs";
import { BASE, check, failed, launch } from "../e2e/lib.mjs";
const browser = await launch();
const KEY = "hischool-schedule-autosave-v3";
const big = fs.readFileSync("/tmp/big-doc.json", "utf8");
const mk = async (init, size = { width: 1366, height: 900 }) => {
  const ctx = await browser.newContext({ viewport: size });
  if (init) await ctx.addInitScript(init.fn, init.arg);
  const page = await ctx.newPage(); const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  return { ctx, page, errs };
};
const body = (p) => p.evaluate(() => document.body.innerText.trim().length);

// 1. big document: does it load, how long per screen
{
  const { ctx, page, errs } = await mk({ fn: (r) => { localStorage.setItem("hischool-trial-demo-v1", "1"); localStorage.setItem("hischool-schedule-autosave-v3", r); }, arg: big });
  const t = Date.now(); await page.goto(BASE, { waitUntil: "load" }); await page.waitForSelector("[data-rc]", { timeout: 15000 }).catch(() => {});
  const rows = await page.locator('[role="rowheader"]').count();
  check("big doc: 40 store rows on the district grid", rows === 40, `rows=${rows}`);
  check(`big doc: first paint ${Date.now() - t} ms`, Date.now() - t < 6000);
  for (const r of ["schedule", "time-off", "people", "stores", "print", "lists", "holidays"]) {
    const t1 = Date.now(); await page.evaluate((x) => (location.hash = `#/${x}`), r); await page.waitForTimeout(100);
    await page.waitForFunction(() => document.body.innerText.length > 100, null, { timeout: 15000 }).catch(() => {});
    const ms = Date.now() - t1; check(`big doc: /${r} ready in ${ms} ms`, ms < 4000);
  }
  // the first problem opens the day panel; stepping to the next problem and the next day must stay quick
  await page.evaluate(() => (location.hash = "#/schedule")); await page.waitForTimeout(500);
  const t2 = Date.now(); await page.getByRole("button", { name: /Show the first/ }).first().click(); await page.getByRole("dialog").waitFor({ timeout: 8000 }).catch(() => {});
  check(`big doc: day panel opens in ${Date.now() - t2} ms`, Date.now() - t2 < 2500);
  for (let i = 0; i < 5; i++) {
    const t3 = Date.now(); await page.getByRole("dialog").getByRole("button", { name: /^Next ·/ }).click(); await page.waitForTimeout(50);
    check(`big doc: step to next problem #${i + 1} in ${Date.now() - t3} ms`, Date.now() - t3 < 2000);
  }
  await page.keyboard.press("Escape");
  const t4 = Date.now(); await page.evaluate(() => (location.hash = "#/")); await page.locator("[data-rc]").nth(300).hover(); await page.waitForTimeout(100);
  check(`big doc: back to District and hover a cell in ${Date.now() - t4} ms`, Date.now() - t4 < 3500);
  check("big doc: no page errors", errs.length === 0, errs[0]);
  const heap = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0);
  check(`big doc: JS heap ${Math.round(heap / 1e6)} MB`, heap < 400e6);
  await ctx.close();
}
// 2. damaged autosave: garbage, empty object, truncated, wrong types
for (const [label, val] of [["garbage", "{{{not json"], ["empty object", "{}"], ["doc is null", JSON.stringify({ doc: null })], ["no stores", JSON.stringify({ doc: { stores: [], people: [] } })], ["truncated", big.slice(0, 5000)], ["numbers for names", JSON.stringify({ doc: { year: "x", month: 99, stores: [{ code: 1 }], people: 5 } })]]) {
  const { ctx, page, errs } = await mk({ fn: (v) => { localStorage.setItem("hischool-trial-demo-v1", "1"); localStorage.setItem("hischool-schedule-autosave-v3", v); }, arg: val });
  await page.goto(BASE, { waitUntil: "load" }); await page.waitForTimeout(1000);
  check(`damaged autosave (${label}): app still starts with content`, (await body(page)) > 50 && errs.length === 0, errs[0] ?? "blank");
  await ctx.close();
}
// 3. storage blocked / full
{
  const { ctx, page, errs } = await mk({ fn: () => { Object.defineProperty(window, "localStorage", { get() { throw new DOMException("denied", "SecurityError"); } }); Object.defineProperty(window, "sessionStorage", { get() { throw new DOMException("denied", "SecurityError"); } }); } });
  await page.goto(BASE, { waitUntil: "load" }); await page.waitForTimeout(1200);
  check("storage blocked: app still starts", (await body(page)) > 50, errs[0] ?? "blank");
  await ctx.close();
}
{
  const { ctx, page, errs } = await mk({ fn: () => { Storage.prototype.setItem = () => { throw new DOMException("full", "QuotaExceededError"); }; } });
  await page.goto(BASE, { waitUntil: "load" }); await page.waitForTimeout(1000);
  await page.getByRole("link", { name: "Schedule" }).first().click().catch(() => {});
  await page.waitForTimeout(500);
  check("storage full: app keeps working", (await body(page)) > 50 && errs.length === 0, errs[0]);
  await ctx.close();
}
// 4. rapid undo/redo and repeated edits through the UI
{
  const { ctx, page, errs } = await mk(null);
  await page.goto(BASE, { waitUntil: "load" }); await page.waitForTimeout(900);
  const first = page.getByRole("button", { name: /Show the first/ }).first();
  await first.click(); await page.waitForTimeout(300);
  for (let i = 0; i < 60; i++) { await page.keyboard.press(i % 2 ? "Control+z" : "Control+Shift+z"); }
  await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  check("60 rapid undo/redo presses: no errors, still rendered", errs.length === 0 && (await body(page)) > 50, errs[0]);
  await ctx.close();
}
// 5. very long names through the whole page set
{
  const long = "Bartholomew-Maximilian Featherstonehaugh-Cholmondeley-Wolfeschlegelsteinhausen";
  const doc = JSON.parse(big); doc.doc.people.slice(0, 20).forEach((p, i) => (p.name = `${long} ${i}`)); doc.doc.stores.slice(0, 5).forEach((s) => (s.name = `${long} Hi-School Pharmacy`)); doc.doc.grid = {};
  const { ctx, page, errs } = await mk({ fn: (r) => { localStorage.setItem("hischool-trial-demo-v1", "1"); localStorage.setItem("hischool-schedule-autosave-v3", r); }, arg: JSON.stringify(doc) }, { width: 360, height: 800 });
  for (const r of ["", "schedule", "people", "stores", "time-off", "print"]) {
    await page.goto(`${BASE}#/${r}`, { waitUntil: "load" }); await page.waitForTimeout(600);
    const side = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    check(`very long names @360 /${r}: no sideways scroll`, !side);
  }
  check("very long names: no page errors", errs.length === 0, errs[0]);
  await ctx.close();
}
await browser.close();
console.log(failed() ? `\n${failed()} FAILED` : "\ntargeted stress: all passed");
process.exit(failed() ? 1 : 0);
