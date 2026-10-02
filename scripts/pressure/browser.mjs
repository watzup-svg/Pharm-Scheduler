// Browser pressure tests. Usage: node scripts/pressure/with-server... (run through scripts/with-server.mjs trial) node scripts/pressure/browser.mjs <soak|storage|interrupts|screens> <level>
// Needs BASE (the runner sets it) and a built trial page. One result line; extra detail lines start with two spaces.
import { BASE, axeSource, launch } from "../../e2e/lib.mjs";
import { imp, rng } from "./lib.mjs";

const [job, level = "low"] = process.argv.slice(2);
const L = { low: 0, medium: 1, high: 2 }[level];
const pick = (a) => a[L];
const fail = [];
const note = (m) => { if (fail.length < 12) fail.push(m); };
const t0 = Date.now();
const KEY = "hischool-schedule-autosave-v3";
const { parseDoc } = await imp("src/lib/schedule/file.ts");
const browser = await launch();

async function fresh(ctxOpts = {}, init) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, ...ctxOpts });
  await ctx.addInitScript(() => { window.print = () => {}; window.open = () => null; });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { ctx, page, errors };
}
const settle = (page, ms = 700) => page.waitForTimeout(ms);
const body = (page) => page.evaluate(() => document.body.innerText.length);
const ROUTES = ["", "schedule", "time-off", "people", "stores", "holidays", "lists", "print"];

if (job === "soak") {
  // One long visit: cycle pages, click around, undo and redo, and watch the JS heap and the page's element count.
  const iters = pick([300, 1000, 3000]);
  const rnd = rng(3);
  const { ctx, page, errors } = await fresh();
  const cdp = await ctx.newCDPSession(page);
  await page.goto(BASE, { waitUntil: "load" });
  await settle(page);
  // Always measure from the same page, so a bigger page at the moment of sampling is not mistaken for growth.
  const sample = async () => { await page.keyboard.press("Escape"); await page.evaluate(() => (location.hash = "#/")); await page.waitForTimeout(400); await cdp.send("HeapProfiler.collectGarbage"); const m = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value])); return { heap: m.JSHeapUsedSize / 1e6, dom: m.Nodes, listeners: m.JSEventListeners, attached: await page.evaluate(() => document.getElementsByTagName("*").length) }; };
  await cdp.send("Performance.enable");
  let first = null, last = null;
  for (let i = 0; i < iters; i++) {
    const r = rnd();
    if (process.env.PRESSURE_TRACE) process.stdout.write(`  act ${i} ${r < 0.3 ? "route" : r < 0.7 ? "click" : r < 0.85 ? "undo" : "esc"}\n`);
    if (r < 0.3) await page.evaluate((x) => (location.hash = `#/${x}`), ROUTES[Math.floor(rnd() * ROUTES.length)]);
    else if (r < 0.7) {
      // Locators, not element handles: a handle keeps its page element alive inside the browser, which looks like a leak in the app.
      const loc = page.locator('button:not([disabled]), [role="tab"], [role="gridcell"]');
      const n = await loc.count();
      if (n) { const el = loc.nth(Math.floor(rnd() * n)); const label = (await el.innerText({ timeout: 300 }).catch(() => "")).trim(); if (!/^(Print|Save PDF|Download|Delete everything|Start over)/i.test(label)) await el.click({ timeout: 500 }).catch(() => {}); }
    }
    else if (r < 0.85) await page.keyboard.press(rnd() < 0.5 ? "Control+z" : "Control+Shift+z").catch(() => {});
    else await page.keyboard.press("Escape").catch(() => {});
    if (process.env.PRESSURE_TRACE && i % 10 === 0) { const t = await sample(); console.log(`  trace ${i} ${page.url().split("#")[1] ?? ""} heap ${t.heap.toFixed(1)} nodes ${t.dom} attached ${t.attached} listeners ${t.listeners}`); }
    if (i === Math.floor(iters * 0.4)) first = await sample(); // after warm-up (first visits to each page load code and caches)
  }
  last = await sample();
  const grow = (a, b) => (b - a) / Math.max(a, 1);
  if (grow(first.heap, last.heap) > 0.3) note(`heap grew ${(100 * grow(first.heap, last.heap)).toFixed(0)}% (${first.heap.toFixed(1)} to ${last.heap.toFixed(1)} MB)`);
  if (grow(first.dom, last.dom) > 0.25) note(`page elements grew ${(100 * grow(first.dom, last.dom)).toFixed(0)}% (${first.dom} to ${last.dom})`);
  if (grow(first.listeners, last.listeners) > 0.5) note(`event listeners grew ${first.listeners} to ${last.listeners}`);
  if (errors.length) note(`script errors: ${errors[0]}`);
  if ((await body(page)) < 50) note("blank screen at the end");
  console.log(`  ${iters} actions: heap ${first.heap.toFixed(1)} to ${last.heap.toFixed(1)} MB, elements ${first.dom} to ${last.dom}, listeners ${first.listeners} to ${last.listeners}`);
}

if (job === "storage") {
  // Browser storage full, refused, and the same month open in two tabs.
  {
    const { page, errors } = await fresh({}, () => {
      const real = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { if (String(k).startsWith("hischool-schedule-autosave")) throw new DOMException("full", "QuotaExceededError"); return real.call(this, k, v); };
    });
    await page.goto(BASE, { waitUntil: "load" }); await settle(page);
    for (const r of ["schedule", "people", "time-off"]) { await page.evaluate((x) => (location.hash = `#/${x}`), r); await settle(page, 300); const els = await page.$$('button:not([disabled])'); if (els[3]) await els[3].click({ timeout: 500 }).catch(() => {}); await page.keyboard.press("Escape"); }
    if (errors.length) note(`storage full: script error: ${errors[0]}`);
    if ((await body(page)) < 50) note("storage full: blank screen");
  }
  {
    const { page, errors } = await fresh({}, () => { Object.defineProperty(window, "localStorage", { get() { throw new DOMException("denied", "SecurityError"); } }); Object.defineProperty(window, "sessionStorage", { get() { throw new DOMException("denied", "SecurityError"); } }); });
    await page.goto(BASE, { waitUntil: "load" }); await settle(page);
    if (errors.length) note(`storage refused: script error: ${errors[0]}`);
    if ((await body(page)) < 50) note("storage refused: blank screen");
  }
  {
    const { ctx, page: a, errors } = await fresh();
    await a.goto(BASE, { waitUntil: "load" }); await settle(a);
    const b = await ctx.newPage(); b.on("pageerror", (e) => errors.push(e.message));
    await b.goto(BASE, { waitUntil: "load" }); await settle(b);
    for (const p of [a, b]) for (let i = 0; i < 5; i++) { const els = await p.$$('[role="gridcell"], button:not([disabled])'); if (els.length) await els[(i * 7) % els.length].click({ timeout: 500 }).catch(() => {}); await p.keyboard.press("Escape"); }
    await a.reload({ waitUntil: "load" }); await settle(a);
    const raw = await a.evaluate((k) => localStorage.getItem(k), KEY);
    try { if (raw) parseDoc(JSON.stringify(JSON.parse(raw).doc)); } catch (e) { note(`two tabs left a saved file that does not open: ${e.message}`); }
    if (errors.length) note(`two tabs: script error: ${errors[0]}`);
  }
  console.log("  quota full, storage refused, two tabs");
}

if (job === "interrupts") {
  // Reload in the middle of activity again and again. After each reload the saved file must open and the app must start.
  const n = pick([10, 30, 100]);
  const rnd = rng(9);
  const { page, errors } = await fresh();
  await page.goto(BASE, { waitUntil: "load" }); await settle(page);
  let bad = 0;
  for (let i = 0; i < n; i++) {
    for (let k = 0, m = 1 + Math.floor(rnd() * 5); k < m; k++) {
      const els = await page.$$('button:not([disabled]), [role="gridcell"], [role="tab"]');
      if (els.length) { const el = els[Math.floor(rnd() * els.length)]; const label = (await el.innerText().catch(() => "")).trim(); if (!/^(Print|Save PDF|Download|Delete everything|Start over)/i.test(label) && (await el.isVisible())) el.click({ timeout: 300 }).catch(() => {}); }
      await page.waitForTimeout(Math.floor(rnd() * 120));
    }
    await page.reload({ waitUntil: "load" }).catch(() => {});
    await settle(page, 350);
    const raw = await page.evaluate((k) => localStorage.getItem(k), KEY).catch(() => null);
    if (raw) { try { parseDoc(JSON.stringify(JSON.parse(raw).doc)); } catch (e) { bad++; note(`after reload ${i}: saved file does not open: ${e.message}`); } }
    if ((await body(page).catch(() => 0)) < 50) { bad++; note(`after reload ${i}: blank screen`); }
  }
  if (errors.length) note(`script errors: ${errors[0]}`);
  console.log(`  ${n} reloads in the middle of activity, ${bad} bad`);
}

if (job === "screens") {
  // Squeezed and zoomed screens, dark mode, high contrast, reduced motion. No sideways scroll, no errors, no serious axe findings.
  const routes = L === 0 ? ["", "schedule", "people", "print"] : ROUTES;
  const widths = L === 2 ? [320, 360, 390] : [320];
  const modes = [{ name: "plain" }, { name: "zoom 200%", zoom: 2 }, { name: "dark", colorScheme: "dark" }, { name: "forced colors", forcedColors: "active" }, { name: "reduced motion", reducedMotion: "reduce" }];
  const axe = axeSource();
  for (const width of widths) for (const mode of modes) for (const route of routes) {
    const { ctx, page, errors } = await fresh({ viewport: { width, height: 700 }, colorScheme: mode.colorScheme, forcedColors: mode.forcedColors, reducedMotion: mode.reducedMotion });
    await page.goto(`${BASE}#/${route}`, { waitUntil: "load" }); await settle(page, 500);
    if (mode.zoom) await page.evaluate((z) => { document.documentElement.style.zoom = String(z); }, mode.zoom);
    await settle(page, 200);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    // 200% zoom at 320 px is 160 CSS px of room; sideways scroll is expected there, so only the plain modes are held to the rule.
    if (!mode.zoom && over > 1) note(`/${route} @${width} ${mode.name}: ${over}px sideways scroll`);
    if (errors.length) note(`/${route} @${width} ${mode.name}: script error ${errors[0]}`);
    if (!mode.zoom && !mode.forcedColors) {
      await page.evaluate(axe);
      const res = await page.evaluate(() => axe.run(document, { resultTypes: ["violations"] }));
      const v = res.violations.filter((x) => x.impact === "serious" || x.impact === "critical");
      if (v.length) note(`/${route} @${width} ${mode.name}: axe ${v.map((x) => x.id).join(",")}`);
    }
    await ctx.close();
  }
  console.log(`  ${routes.length} pages x ${widths.length} widths x ${modes.length} modes`);
}

await browser.close();
console.log(`${fail.length ? "FAIL" : "ok  "} ${job} (${level}, ${((Date.now() - t0) / 1000).toFixed(0)}s)${fail.length ? " — " + fail[0] : ""}`);
for (const f of fail) console.log(`  ! ${f}`);
process.exit(fail.length ? 1 : 0);
