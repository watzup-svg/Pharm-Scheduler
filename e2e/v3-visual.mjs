// Screenshot regression for the practice month: every screen and key state at 1366x800, fixed clock (6 Oct 2026), reduced motion, animations
// and transitions off, mouse parked, system fonts as they are. Each picture is compared with e2e/baselines/<name>.png by a pure-JS pixel diff
// (e2e/support/png.mjs, node:zlib only): a pixel differs when a channel is off by more than 24/255; the shot fails when more than 0.1% of its
// pixels differ. On failure the new picture and a diff (differences in red) are written to test-logs/visual/ and a compact list is printed.
//
//   node e2e/v3-visual.mjs                       compare
//   UPDATE_BASELINES=1 node e2e/v3-visual.mjs    write the baselines (do this on purpose, look at the pictures, commit them)
//   ONLY=wall node e2e/v3-visual.mjs             only shots whose name contains "wall"
//   VISUAL_ADVISORY=1                            report differences as "warn" instead of failing (for machines whose fonts differ from the baselines)
// Baselines are per rendering engine and machine class: they come from Chromium on Linux. Other engines skip this suite.
import fs from "node:fs";
import path from "node:path";
import { launch, serveV3, openApp, check, failed } from "./v3-lib.mjs";
import { evaluate } from "../domain/src/index.ts";
import { decodePng, diffImages, encodePng } from "./support/png.mjs";
import { flowContext, root } from "./support/flow.mjs";

if (process.env.BROWSER && process.env.BROWSER !== "chromium") { console.log("skip pixel baselines are for Chromium"); process.exit(0); }

const UPDATE = process.env.UPDATE_BASELINES === "1";
const ADVISORY = process.env.VISUAL_ADVISORY === "1";
const ONLY = process.env.ONLY ?? "";
const THRESHOLD = 24;
const MAX_RATIO = 0.001;
const BASE = path.join(root, "e2e", "baselines");
const OUT = path.join(root, "test-logs", "visual");
fs.mkdirSync(BASE, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const browser = await launch();
const srv = await serveV3();
const ctx = await flowContext(browser, { viewport: { width: 1366, height: 800 }, shim: false });
const { page, errors } = await openApp(browser, srv.base, { context: ctx });
await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important;caret-color:transparent!important}" });
await page.evaluate(() => { const a = window.__v3.app.getState(); a.setAsOf("2026-10-06"); a.setWindow("2026-10-01", "2026-10-31"); a.setView("wall"); a.setAxis("store"); a.clearNotice(); });
await page.waitForSelector('[role="gridcell"]');

const app = (fn, arg) => page.evaluate(fn, arg);
const header = page.locator("header");
/** Everything quiet: no hover, no toast, fonts loaded, two frames drawn. */
async function settle() {
  await page.mouse.move(2, 2);
  await app(() => window.__v3.app.getState().clearNotice());
  await page.evaluate(() => document.fonts.ready);
  await app(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60)))));
}
const nav = async (label) => { await header.getByRole("button", { name: new RegExp(`^${label}`) }).click(); };
const reset = async (view = "wall", axis = "store") => {
  await app(([v, a]) => { const s = window.__v3.app.getState(); s.select(null); s.setDrawer(false); s.setOutForm(false); s.setAxis(a); s.setView(v); }, [view, axis]);
  await page.evaluate(() => { document.querySelector(".w-scroll")?.scrollTo(0, 0); document.querySelectorAll("main .overflow-auto").forEach((e) => e.scrollTo(0, 0)); });
};
const pref = async (item) => { await header.getByRole("button", { name: "File menu" }).click(); await page.getByRole("menuitem", { name: item }).click(); };
const allGaps = async () => {
  const w = await app(() => { const a = window.__v3.app.getState(); return { state: a.world.state, asOf: a.asOf, win: a.window }; });
  const ev = evaluate(w.state, w.asOf, { range: w.win });
  return Object.values(ev.cells).filter((c) => c.open > 0 && c.date >= w.asOf).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.storeId < b.storeId ? -1 : 1));
};
const firstGap = async () => (await allGaps())[0];

const shots = [
  ["overview", async () => { await reset("overview"); }],
  ["wall-stores", async () => { await reset("wall", "store"); }],
  ["wall-people", async () => { await reset("wall", "pharmacist"); }],
  ["wall-key", async () => { await reset("wall", "store"); await page.getByRole("button", { name: "Key" }).click(); }],
  ["inspector-cell", async () => {
    await reset("wall", "store");
    const g = await firstGap();
    await page.locator(`[role="gridcell"][data-store="${g.storeId}"][data-date="${g.date}"]`).click();
  }],
  ["inspector-person-day", async () => {
    await reset("wall", "pharmacist");
    await page.locator('[role="gridcell"][data-r="2"][data-c="9"]').click();
  }],
  ["out-form", async () => { await reset("wall", "store"); await app(() => window.__v3.app.getState().setOutForm(true)); }],
  ["timeoff", async () => { await reset("timeoff"); }],
  ["timeoff-day", async () => { await reset("timeoff"); await page.locator('[data-date="2026-10-13"]').click(); }],
  ["plan", async () => { await reset("plan"); }],
  ...[["stores", "Stores"], ["pharmacists", "People"], ["patterns", "Patterns"], ["holidays", "Holidays"], ["dates", "Dates"], ["travel", "Travel"], ["rules", "Rules"], ["checks", "Check"]].map(([id, label]) => [`setup-${id}`, async () => {
    await reset("setup");
    await page.getByRole("tab", { name: label, exact: true }).click();
  }]),
  ["drawer-queue", async () => { await reset("wall", "store"); await app(() => window.__v3.app.getState().setDrawer(true, "queue")); }],
  ["drawer-tell", async () => { await reset("wall", "store"); await app(() => window.__v3.app.getState().setDrawer(true, "tell")); }],
  ["drawer-history", async () => { await reset("wall", "store"); await app(() => window.__v3.app.getState().setDrawer(true, "history")); }],
  ["file-menu", async () => { await reset("wall", "store"); await header.getByRole("button", { name: "File menu" }).click(); }],
  ["tools-menu", async () => { await reset("wall", "store"); await page.getByRole("button", { name: "Tools" }).click(); }],
  ["proposal-bar", async () => {
    await reset("wall", "store");
    // the first open day with a cover option, opened as a preview (ghost marks on the wall, Proposal Bar at the bottom)
    for (const g of (await allGaps()).slice(0, 14)) {
      const opened = await app(async ([sid, date]) => {
        const a = window.__v3.app.getState();
        await a.runRepair([{ storeId: sid, date }], false);
        const o = window.__v3.app.getState().repairResult?.result.options[0];
        if (!o) return false;
        window.__v3.app.getState().previewRepair(o);
        return !!window.__v3.app.getState().world.session.proposal;
      }, [g.storeId, g.date]);
      if (opened) return;
    }
    throw new Error("no open day in the practice month has a cover option");
  }],
  ["print-before-posting", async () => { await reset("print"); }],
  ["print-posted", async () => { await reset("print"); await page.locator("[data-post]").click(); await page.waitForSelector("[data-revision='1']"); }],
  ["high-contrast", async () => { await reset("wall", "store"); await pref("High contrast"); }],
  ["high-contrast-print", async () => { await reset("print"); }],
  ["larger-text", async () => { await pref("High contrast"); await reset("wall", "store"); await pref("Larger text"); }],
  ["larger-text-timeoff", async () => { await reset("timeoff"); }],
  ["overview-problems", async () => {
    // last on purpose: this loads a different world, and the shots above are of the practice month
    await app(() => document.documentElement.classList.remove("text-large", "contrast"));
    await app(() => window.__v3.loadProblems());
    await app(() => { const a = window.__v3.app.getState(); a.setAsOf("2026-10-06"); a.setWindow("2026-10-01", "2026-10-31"); });
    await reset("overview");
  }],
];
// The proposal bar must be gone and the toggles back before anything that follows.
const after = {
  "proposal-bar": async () => { await app(() => { const a = window.__v3.app.getState(); if (a.world.session.proposal) a.discardProposal(); window.__v3.app.setState({ repairResult: null }); }); },
  "file-menu": async () => { await page.keyboard.press("Escape"); },
  "tools-menu": async () => { await page.keyboard.press("Escape"); },
  "wall-key": async () => { await page.keyboard.press("Escape"); },
};

const results = [];
for (const [name, setup] of shots) {
  if (ONLY && !name.includes(ONLY)) continue;
  let png;
  try {
    await setup();
    await settle();
    png = await page.screenshot({ type: "png", animations: "disabled", caret: "hide" });
  } catch (e) {
    check(`${name}: captured`, false, String(e?.message ?? e).split("\n")[0]);
    continue;
  }
  const file = path.join(BASE, `${name}.png`);
  if (UPDATE) {
    fs.writeFileSync(file, png);
    console.log(`wrote ${path.relative(root, file)} (${(png.length / 1024).toFixed(0)} KB)`);
  } else if (!fs.existsSync(file)) {
    check(`${name}: has a baseline`, false, "missing; run UPDATE_BASELINES=1 node e2e/v3-visual.mjs and look at the picture");
    fs.writeFileSync(path.join(OUT, `${name}.actual.png`), png);
  } else {
    const want = decodePng(fs.readFileSync(file));
    const got = decodePng(png);
    const d = diffImages(got, want, THRESHOLD);
    const pct = d.sizeMismatch ? 100 : d.ratio * 100;
    const bad = d.sizeMismatch || d.ratio > MAX_RATIO;
    results.push({ name, pct, bbox: d.bbox, size: d.sizeMismatch ? `${got.width}x${got.height} vs ${want.width}x${want.height}` : "" });
    if (bad) {
      fs.writeFileSync(path.join(OUT, `${name}.actual.png`), png);
      fs.copyFileSync(file, path.join(OUT, `${name}.baseline.png`));
      if (d.diff) fs.writeFileSync(path.join(OUT, `${name}.diff.png`), encodePng(d.diff));
    }
    if (bad && ADVISORY) console.log(`warn ${name}: ${pct.toFixed(3)}% of pixels differ (advisory)`);
    else check(`${name}: matches its baseline (${pct.toFixed(3)}% differ, limit ${MAX_RATIO * 100}%)`, !bad, d.sizeMismatch ? `size ${results.at(-1).size}` : `box ${d.bbox?.join(",")}; see test-logs/visual/${name}.diff.png`);
  }
  await (after[name]?.() ?? Promise.resolve());
}

if (UPDATE) console.log(`\n${shots.length} baselines written to e2e/baselines/. Look at them, then commit.`);
else {
  const bad = results.filter((r) => r.pct / 100 > MAX_RATIO);
  if (bad.length) {
    console.log("\nvisual differences (actual, baseline and diff are in test-logs/visual/):");
    for (const r of bad) console.log(`  ${r.name.padEnd(28)} ${r.pct.toFixed(3).padStart(8)}%  box ${r.bbox?.join(",") ?? ""} ${r.size}`);
    console.log("If the change is intended: UPDATE_BASELINES=1 node e2e/v3-visual.mjs, look at the new pictures, commit e2e/baselines/.");
  }
  const worst = results.reduce((m, r) => Math.max(m, r.pct), 0);
  console.log(`\n${results.length} pictures compared, largest difference ${worst.toFixed(4)}%`);
}
check("no console errors while taking the pictures", errors.length === 0, errors.join(" | "));
await browser.close();
srv.close();
process.exit(failed() ? 1 : 0);
