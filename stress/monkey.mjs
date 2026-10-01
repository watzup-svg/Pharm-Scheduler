// Random-click stress. Usage: node stress/monkey.mjs [steps] [seed] [bigDocPath]
// Drives the built app like an impatient person: random clicks, keys, typing, resizes and back/forward. Fails on any page
// error, console error, blank screen, or a step that hangs. Prints the last actions before a failure so it can be replayed.
import fs from "node:fs";
import { BASE, launch } from "../e2e/lib.mjs";

const STEPS = Number(process.argv[2] ?? 300);
let seed = Number(process.argv[3] ?? 1);
const BIG = process.argv[4];
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const JUNK = ["", " ", "a", "Anders Kowal-Rasmussen", "🧪🧪🧪", "<b>x</b>", "x".repeat(300), "0", "-1", "99999", "2026-02-30", "'; drop table", "Fenn", "ñandú"];
const KEYS = ["Escape", "Tab", "Shift+Tab", "Enter", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End", "/", "Control+z", "Control+Shift+z", "Space", "PageDown"];
const SIZES = [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1366, height: 900 }, { width: 1920, height: 1080 }];
const ROUTES = ["", "schedule", "time-off", "people", "stores", "print", "lists", "holidays", "style"];
const SKIP = /^(Print ·|Save PDF|Download|Delete everything|Start over)/i;

const browser = await launch();
let failures = 0;
for (const device of [{ ...SIZES[1], isMobile: true, hasTouch: true }, SIZES[3]]) {
  const ctx = await browser.newContext({ viewport: { width: device.width, height: device.height }, isMobile: device.isMobile, hasTouch: device.hasTouch });
  if (BIG) { const raw = fs.readFileSync(BIG, "utf8"); await ctx.addInitScript((r) => { if (!localStorage.getItem("hischool-schedule-autosave-v3")) localStorage.setItem("hischool-trial-demo-v1", "1"); localStorage.setItem("hischool-schedule-autosave-v3", r); }, raw); }
  const page = await ctx.newPage();
  const log = [], problems = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) problems.push(`console: ${m.text().slice(0, 200)}`); });
  await page.addInitScript(() => { window.print = () => {}; window.open = () => null; });
  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForTimeout(900);
  const t0 = Date.now();
  const slowest = { ms: 0, what: "" };
  for (let i = 0; i < STEPS; i++) {
    const tStep = Date.now();
    const kind = rnd();
    let what = "";
    try {
      if (kind < 0.55) {
        const els = await page.$$('button:not([disabled]), a[href], [role="gridcell"], [role="tab"], summary, [role="menuitem"], [role="button"], label, select');
        if (els.length) {
          const el = pick(els);
          const label = ((await el.innerText().catch(() => "")) || (await el.getAttribute("aria-label")) || "").trim().slice(0, 40);
          what = `click "${label}"`;
          if (!SKIP.test(label) && (await el.isVisible())) await el.click({ timeout: 800, force: rnd() < 0.2 }).catch(() => {});
        }
      } else if (kind < 0.7) { what = "key"; const k = pick(KEYS); what += ` ${k}`; await page.keyboard.press(k).catch(() => {}); }
      else if (kind < 0.82) {
        const inputs = await page.$$('input:not([type=file]):not([type=checkbox]):not([type=radio]), textarea');
        if (inputs.length) { const el = pick(inputs); const v = pick(JUNK); what = `type ${JSON.stringify(v.slice(0, 20))}`; if (await el.isVisible()) await el.fill(v, { timeout: 800 }).catch(() => {}); }
      } else if (kind < 0.88) { const r = pick(ROUTES); what = `route #/${r}`; await page.evaluate((x) => (location.hash = `#/${x}`), r); }
      else if (kind < 0.92) { const s = pick(SIZES); what = `resize ${s.width}`; if (!device.isMobile) await page.setViewportSize(s); }
      else if (kind < 0.95) { what = "back"; await page.evaluate(() => { if (location.hash && location.hash !== "#/") history.back(); }); }
      else if (kind < 0.98) { what = "scroll"; await page.mouse.wheel(0, pick([-800, 800, 3000])).catch(() => {}); }
      else { what = "hover"; const els = await page.$$('[data-tip], [role="gridcell"]'); if (els.length) await pick(els).hover({ timeout: 500 }).catch(() => {}); }
    } catch (e) { problems.push(`driver: ${String(e).slice(0, 120)}`); }
    log.push(what);
    const dtStep = Date.now() - tStep; if (dtStep > slowest.ms) { slowest.ms = dtStep; slowest.what = what; }
    const blank = await Promise.race([
      page.evaluate(() => document.body.innerText.trim().length < 20 || !document.querySelector("#root, #app, main, header")),
      new Promise((r) => setTimeout(() => r("hang"), 20000)),
    ]);
    if (blank) problems.push(blank === "hang" ? "page hung (20 s no response)" : "blank screen");
    if (problems.length) {
      problems.push(`url: ${page.url()}`);
      failures++;
      console.log(`FAIL ${device.width}px step ${i}: ${problems.join(" | ")}`);
      console.log("  last actions:", log.slice(-8).join(" → "));
      await page.screenshot({ path: `/tmp/claude-0/-home-user/9f340de3-b3ea-5e94-9595-e34276227330/scratchpad/monkey-fail-${device.width}.png` }).catch(() => {});
      break;
    }
  }
  if (!problems.length) console.log(`ok   ${device.width}px: ${STEPS} random actions, no errors, never blank (${Math.round((Date.now() - t0) / 1000)} s; slowest step ${slowest.ms} ms: ${slowest.what})`);
  await ctx.close();
}
await browser.close();
process.exit(failures ? 1 : 0);
