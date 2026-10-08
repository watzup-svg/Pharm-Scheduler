// browser: drives the built v3 app (dist-v3/v3.html) in Chromium. Build is run first if dist-v3 is missing or older than the sources.
//   monkey            stress/v3-monkey.mjs with seeds/actions per level; a failing seed is replayed and minimized
//   scale-*           120 stores / 500 people: load and render time, no console errors, no horizontal page scroll, view/click/keyboard time, engine runs off the main thread
//   fault-*           engine Worker killed / blocked / slow, IndexedDB puts failing or unavailable, offline (and: the app never touches the network)
//   soak              ~2000 mixed actions, sampling JS heap (after GC), DOM nodes and history size; fails on sustained growth
// Replay one case: node --experimental-strip-types --no-warnings scripts/v3-pressure/suites/browser.mjs --level low --case fault-worker-killed
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { stateHash } from "../../../domain/src/index.ts";
import { CHROME, serveV3 } from "../../../e2e/v3-lib.mjs";
import { Invariant, genWorld, parseArgs, pick3, rng, runSuite } from "../lib.ts";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const args = parseArgs();
const L = args.level;
const SELF = `node --experimental-strip-types --no-warnings scripts/v3-pressure/suites/browser.mjs --level ${L}`;
const shotDir = path.join(args.out, "screenshots");
fs.mkdirSync(shotDir, { recursive: true });

// ---------------- budgets (ms unless noted); generous on purpose: they catch regressions of 3x or more, not noise ----------------
const B = {
  loadRender: 8000, // setWorld of the big world until the grid is on screen
  viewSwitch: 1500, // one click on a top-bar tab until two frames after
  cellClick: 600,
  keyStep: 800, // one key press (the slowest single press in the run, so one noisy sample under load counts: normal is 270-360 ms, measured alone and in parallel)
  wallChange: 1000, // a wall control (week, month, People / Stores) until two frames after
  // At the largest size (60 stores x 250 people) the app itself stalls 600-870 ms while Build runs and its result is drawn (measured on the code from before the
  // suggestion work too), so these sit above that. An engine on the main thread would stall for the whole Build (7 s), which is what they are here to catch.
  frameGap: 1200, // longest main-thread stall while the engine works
  inputWhileBusy: 1000, // a UI click answered while a search runs
};
// Real use is 16-18 stores; low and medium go well past that, high is the 120-store extreme.
// Real use is 16-18 stores. Low and medium go well past that; high is 60 stores / 250 people (3x), enough to expose the super-linear
// code that hides at 18 (Improve and choices were quadratic and showed at 60). PRESSURE_EXTREME=1 runs 120 / 500 for the rare deep look.
const SCALE = process.env.PRESSURE_EXTREME ? { stores: 120, people: 500 } : pick3(L, { stores: 40, people: 150 }, { stores: 60, people: 250 }, { stores: 60, people: 250 });

// ---------------- build freshness ----------------
function newestSource() {
  let newest = 0;
  const walk = (p) => {
    let st; try { st = fs.statSync(p); } catch { return; }
    if (st.isDirectory()) { for (const f of fs.readdirSync(p)) if (f !== "node_modules" && f !== "test") walk(path.join(p, f)); }
    else if (/\.(ts|tsx|css|html|svg|json|mjs)$/.test(p) && !/\.test\./.test(p)) newest = Math.max(newest, st.mtimeMs);
  };
  for (const d of ["app3", "domain/src", "persist", "v3.html", "vite.v3.config.ts"]) walk(path.join(root, d));
  return newest;
}
function ensureBuilt() {
  const html = path.join(root, "dist-v3", "v3.html");
  const have = fs.existsSync(html) ? fs.statSync(html).mtimeMs : 0;
  if (have && have >= newestSource()) return "up to date";
  const r = spawnSync("npm", ["run", "build:v3"], { cwd: root, encoding: "utf8" });
  if (r.status !== 0) throw new Invariant("build", `npm run build:v3 failed: ${(r.stderr || r.stdout).slice(-400)}`);
  return have ? "rebuilt (stale)" : "built (missing)";
}

// ---------------- page plumbing ----------------
const BASE_SHIM = `
  window.__persistDebounce = 100;
  window.__rej = [];
  window.addEventListener('unhandledrejection', (e) => window.__rej.push(String((e.reason && e.reason.message) || e.reason)));
  window.showSaveFilePicker = async (o) => (await navigator.storage.getDirectory()).getFileHandle((o && o.suggestedName) || 'x.sqlite', { create: true });
  window.showOpenFilePicker = async () => { const e = new Error('cancelled'); e.name = 'AbortError'; throw e; };
`;
const TRACK_WORKERS = `(() => { const W = window.Worker; window.__workers = []; window.Worker = function (...a) { const w = new W(...a); window.__workers.push(w); return w; }; window.Worker.prototype = W.prototype; })();`;
const BLOCK_WORKERS = `window.Worker = function () { throw new Error('Workers are blocked (injected fault)'); };`;
const SLOW_ENGINE = (ms) => `(() => { const pm = Worker.prototype.postMessage; Worker.prototype.postMessage = function (...a) { setTimeout(() => pm.apply(this, a), ${ms}); }; })();`;
const IDB_FAIL_SWITCH = `(() => { const put = IDBObjectStore.prototype.put; window.__failIdb = false; IDBObjectStore.prototype.put = function (...a) { if (window.__failIdb) throw new DOMException('The quota has been exceeded. (injected)', 'QuotaExceededError'); return put.apply(this, a); }; })();`;
const IDB_UNAVAILABLE = `indexedDB.open = function () { throw new DOMException('Access denied (injected)', 'SecurityError'); };`;

let browser, srv;
async function launchBrowser() {
  const { chromium } = require("playwright-core");
  return chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-precise-memory-info", "--js-flags=--expose-gc"] });
}

/** A fresh page with error, request and unhandled-rejection collection. `world` is loaded through the store's setWorld hook. */
async function open({ size = { width: 1366, height: 768 }, init = [], world = null, practice = false, asOf = "2026-10-06", window: win = ["2026-10-01", "2026-10-31"] } = {}) {
  const ctx = await browser.newContext({ viewport: size });
  await ctx.addInitScript(BASE_SHIM);
  for (const s of init) await ctx.addInitScript(s);
  const page = await ctx.newPage();
  const E = { ctx, page, errors: [], requests: [], log: [], t0: Date.now() };
  const base = new URL(srv.base).origin;
  page.on("pageerror", (e) => E.errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") E.errors.push(`console.error: ${m.text()}`); });
  page.on("request", (r) => { const u = r.url(); if (!u.startsWith(base) && !u.startsWith("data:") && !u.startsWith("blob:") && !u.startsWith("about:")) E.requests.push(u); });
  E.step = (s) => { E.log.push(`+${Date.now() - E.t0}ms ${s}`); };
  await page.goto(srv.base, { waitUntil: "load" });
  await page.waitForFunction(() => window.__v3);
  if (practice) await page.evaluate(() => { window.__v3.loadPractice(); window.__v3.app.getState().setView("wall"); });
  if (world) await page.evaluate(([w, a, win2]) => { const s = window.__v3.app.getState(); s.setWorld(w, { fileName: "Pressure.sqlite" }); s.setView("wall"); s.setAsOf(a); s.setWindow(win2[0], win2[1]); }, [world, asOf, win]);
  return E;
}
const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
const app = (page, fn, arg) => page.evaluate(fn, arg);
const VIEW_OF = { Schedule: "wall", Plan: "plan", "Time off": "timeoff", Setup: "setup", Print: "print" };
/** A top-bar tab. Not every tab is on screen in every state (Plan hides while a proposal is open), so fall back to the store. */
const tab = (page, label) => ({
  async click(opts = {}) {
    const loc = page.locator("header").getByRole("button", { name: new RegExp("^" + label) }).first();
    if (await loc.count()) return loc.click(opts);
    await page.evaluate((v) => window.__v3.app.getState().setView(v), VIEW_OF[label]);
  },
});

/** Collect problems at the end of a case, add a screenshot on any failure. */
async function finish(id, E, run) {
  const replay = `${SELF} --case ${id}`;
  try {
    const out = await run();
    const rej = await E.page.evaluate(() => window.__rej).catch(() => []);
    if (E.errors.length) throw new Invariant("console-error", `${E.errors.length} console/page error(s): ${E.errors.slice(0, 3).join(" | ").slice(0, 500)}`);
    if (rej.length) throw new Invariant("unhandled-rejection", `${rej.length} unhandled promise rejection(s): ${rej.slice(0, 3).join(" | ").slice(0, 400)}`);
    if (E.requests.length) throw new Invariant("network-request", `the app contacted the network: ${E.requests.slice(0, 3).join(", ")}`);
    return out;
  } catch (e) {
    const shot = path.join(shotDir, `${id}.png`);
    await E.page.screenshot({ path: shot }).catch(() => {});
    let hash;
    try { const w = await E.page.evaluate(() => window.__v3.app.getState().world); if (w) hash = stateHash(w.state); } catch { /* page may be gone */ }
    const inv = e instanceof Invariant ? e : new Invariant(`exception:${e?.name ?? "Error"}`, String(e?.message ?? e).split("\n")[0].slice(0, 500));
    if (!(e instanceof Invariant)) inv.stack = e?.stack;
    throw new Invariant(inv.invariant, inv.message, { replay, actions: E.log, stateHash: hash, screenshot: path.relative(root, shot) });
  } finally {
    await E.ctx.close().catch(() => {});
  }
}

async function waitFor(page, fn, arg, timeout, what) {
  try { await page.waitForFunction(fn, arg, { timeout, polling: 100 }); }
  catch { throw new Invariant("timeout", `${what} did not happen within ${timeout} ms`); }
}

const bigWorld = () => genWorld({ seed: 5, stores: SCALE.stores, pharmacists: SCALE.people, kind: "normal", start: "2026-10-01", days: 31 });

// ---------------- cases ----------------
const cases = [];
const add = (id, budgetMs, run) => cases.push({ id, budgetMs, run });

// ---- monkey ----
function runChild(cmdArgs, env, timeoutMs) {
  return new Promise((resolve) => {
    const c = spawn(process.execPath, cmdArgs, { cwd: root, env: { ...process.env, ...env } });
    let out = "";
    c.stdout.on("data", (d) => { out += d; });
    c.stderr.on("data", (d) => { out += d; });
    const to = setTimeout(() => { c.kill("SIGKILL"); out += "\nTIMEOUT"; }, timeoutMs);
    c.on("close", (code) => { clearTimeout(to); resolve({ code, out }); });
  });
}
add("monkey", pick3(L, 300_000, 900_000, 2_400_000), async (ctx) => {
  const seeds = pick3(L, 2, 10, 20), actions = pick3(L, 50, 120, 200);
  const flags = ["--experimental-strip-types", "--no-warnings", "stress/v3-monkey.mjs"];
  const r = await runChild(flags, { SEEDS: String(seeds), ACTIONS: String(actions) }, pick3(L, 280_000, 880_000, 2_300_000));
  fs.writeFileSync(path.join(args.out, "browser-monkey.log"), r.out);
  const summary = r.out.trim().split("\n").filter((l) => /^(ok  |FAIL) +\d+ seed/.test(l)).pop() ?? "";
  ctx.note(`${seeds} seeds x ${actions} actions: ${summary.replace(/^ok  |^FAIL /, "")}`);
  if (r.code === 0 && !/TIMEOUT/.test(r.out)) return;
  const m = r.out.match(/FAIL seed=(\d+) action=#(\d+)\n([\s\S]*?)action tail:\n([\s\S]*?)screenshot: (.*)\nreplay: (.*)/);
  if (!m) throw new Invariant("monkey-crashed", `monkey exited ${r.code} without a failure report: ${r.out.slice(-500)}`, { replay: `SEEDS=${seeds} ACTIONS=${actions} node --experimental-strip-types --no-warnings stress/v3-monkey.mjs` });
  const [, seed, idx, why, tail, shot, replayLine] = m;
  const failLine = why.split("\n")[0];
  const actionFile = replayLine.match(/REPLAY=(\S+)/)?.[1];
  let minimal = "";
  if (actionFile && fs.existsSync(path.join(root, actionFile))) {
    const mr = await runChild(flags, { REPLAY: actionFile, MINIMIZE: "1", SEED: seed }, pick3(L, 180_000, 420_000, 900_000));
    const mm = mr.out.match(/minimal repro \((\d+) actions\): (\S+)/);
    if (mm) minimal = ` Minimized to ${mm[1]} actions: ${mm[2]}.`;
    fs.writeFileSync(path.join(args.out, `browser-monkey-seed${seed}-minimize.log`), mr.out);
    fs.copyFileSync(path.join(root, actionFile), path.join(args.out, path.basename(actionFile)));
  }
  throw new Invariant(failLine.replace(/^inv:/, "").split(":")[0] || "monkey", `seed ${seed}, action #${idx}: ${why.trim().slice(0, 700)}${minimal}`, {
    replay: `REPLAY=${actionFile} SEED=${seed} node --experimental-strip-types --no-warnings stress/v3-monkey.mjs${minimal ? `   (minimal: REPLAY=${minimal.match(/: (\S+)\.$/)?.[1]} ...)` : ""}`,
    actions: tail.trim().split("\n"), screenshot: shot.trim(),
  });
});

// ---- scale ----
add("scale-load", 120_000, async (ctx) => {
  const world = bigWorld();
  const E = await open();
  return finish("scale-load", E, async () => {
    const t = Date.now();
    await E.page.evaluate(([w]) => { const s = window.__v3.app.getState(); s.setWorld(w, { fileName: "Big.sqlite" }); s.setView("wall"); s.setAsOf("2026-10-06"); s.setWindow("2026-10-01", "2026-10-31"); }, [world]);
    await E.page.waitForSelector('[role="gridcell"]', { timeout: 60000 });
    await settle(E.page);
    const ms = Date.now() - t;
    const cells = await E.page.locator('[role="gridcell"]').count();
    E.step(`world ${SCALE.stores} stores / ${SCALE.people} people / ${Object.keys(world.state.assignments).length} assignments loaded, ${cells} cells in ${ms} ms`);
    ctx.metric("renderMs", ms); ctx.metric("cells", cells);
    ctx.note(`${SCALE.stores} stores x ${SCALE.people} people: grid in ${ms} ms, ${cells} cells`);
    if (ms > B.loadRender) throw new Invariant("render-budget", `showing the big schedule took ${ms} ms, budget ${B.loadRender} ms`);
    for (const size of [{ width: 1366, height: 768 }, { width: 1280, height: 720 }, { width: 1920, height: 1080 }].slice(0, pick3(L, 1, 2, 3))) {
      await E.page.setViewportSize(size);
      await settle(E.page);
      for (const v of ["Schedule", "Plan", "Time off", "Setup", "Print"]) {
        await tab(E.page, v).click({ timeout: 15000 });
        await settle(E.page);
        const m = await E.page.evaluate(() => ({ x: document.documentElement.scrollWidth - window.innerWidth, bx: document.body.scrollWidth - window.innerWidth }));
        E.step(`${size.width}x${size.height} ${v}: page scroll x=${m.x}`);
        if (m.x > 0 || m.bx > 0) throw new Invariant("horizontal-scroll", `${size.width}x${size.height} ${v}: the page scrolls sideways by ${Math.max(m.x, m.bx)}px with ${SCALE.stores} stores`);
      }
      await tab(E.page, "Schedule").click();
    }
  });
});

add("scale-interact", 240_000, async (ctx) => {
  const E = await open({ world: bigWorld() });
  return finish("scale-interact", E, async () => {
    await E.page.waitForSelector('[role="gridcell"]', { timeout: 60000 });
    const times = { view: [], cell: [], key: [], ctrl: [] };
    const worst = {}; // label -> slowest ms, for every action over its budget
    const limit = { view: B.viewSwitch, cell: B.cellClick, key: B.keyStep, ctrl: B.wallChange };
    const timed = async (kind, label, f) => {
      const t = performance.now(); await f(); await settle(E.page);
      const ms = Math.round(performance.now() - t);
      times[kind].push(ms); E.step(`${label} ${ms}ms`);
      if (ms > limit[kind]) worst[label] = Math.max(worst[label] ?? 0, ms);
    };
    const r = rng(4242);
    for (let round = 0; round < pick3(L, 1, 3, 6); round++) {
      for (const v of ["Plan", "Time off", "Setup", "Print", "Schedule"]) await timed("view", `view ${v}`, () => tab(E.page, v).click({ timeout: 30000 }));
      const n = await E.page.locator('[role="gridcell"]').count();
      for (let k = 0; k < pick3(L, 3, 6, 6); k++) {
        const i = r.int(n);
        await timed("cell", "select a cell", () => E.page.locator('[role="gridcell"]').nth(i).click({ timeout: 30000 }));
        for (const key of ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "PageDown", "Home"]) await timed("key", `key ${key}`, () => E.page.keyboard.press(key));
      }
      for (const name of ["Next week", "Previous week", "2 weeks", "Month", "People", "Stores"]) {
        const b = E.page.getByRole("button", { name, exact: true }).first();
        if (await b.count()) await timed("ctrl", `wall ${name}`, () => b.click({ timeout: 30000 }));
      }
    }
    const p95 = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length * 0.95)] ?? 0;
    for (const k of Object.keys(times)) ctx.metric(`${k}P95`, p95(times[k]));
    const byView = {};
    for (const l of E.log) { const m = l.match(/ view (.+?) (\d+)ms$/); if (m) byView[m[1]] = Math.max(byView[m[1]] ?? 0, Number(m[2])); }
    ctx.note(`p95: view ${p95(times.view)}ms, cell ${p95(times.cell)}ms, key ${p95(times.key)}ms, wall controls ${p95(times.ctrl)}ms; slowest view ${JSON.stringify(byView)}`);
    const over = Object.entries(worst);
    if (over.length) throw new Invariant("interaction-budget", `with ${SCALE.stores} stores / ${SCALE.people} people these took longer than their budget (view ${B.viewSwitch} ms, cell ${B.cellClick} ms, key ${B.keyStep} ms, wall control ${B.wallChange} ms): ${over.map(([l, ms]) => `${l} ${ms} ms`).join(", ")}`);
  });
});

// A search runs in the Worker; the page must keep painting. Measures the longest gap between animation frames during Build.
async function frameGapProbe(page) {
  await page.evaluate(() => { window.__gap = { max: 0, last: performance.now(), on: true }; const tick = () => { const n = performance.now(); window.__gap.max = Math.max(window.__gap.max, n - window.__gap.last); window.__gap.last = n; if (window.__gap.on) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
}
add("scale-engine-responsive", 300_000, async (ctx) => {
  const world = genWorld({ seed: 6, stores: pick3(L, 18, 40, 60), kind: "normal", start: "2026-10-01", days: 31 });
  const E = await open({ world });
  return finish("scale-engine-responsive", E, async () => {
    await E.page.waitForSelector('[role="gridcell"]', { timeout: 30000 });
    await frameGapProbe(E.page);
    const t = Date.now();
    await E.page.evaluate(() => { window.__run = window.__v3.app.getState().runBuild(); });
    E.step("Build started");
    let worst = 0;
    while (await E.page.evaluate(() => !!window.__v3.app.getState().busy)) {
      const t1 = Date.now();
      await tab(E.page, "Plan").click({ timeout: 20000 });
      await tab(E.page, "Schedule").click({ timeout: 20000 });
      worst = Math.max(worst, (Date.now() - t1) / 2);
      if (Date.now() - t > 200_000) throw new Invariant("timeout", "Build still running after 200 s");
      await E.page.waitForTimeout(150);
    }
    const gap = await E.page.evaluate(() => { window.__gap.on = false; return Math.round(window.__gap.max); });
    E.step(`Build done in ${Date.now() - t} ms, longest frame gap ${gap} ms, slowest tab click ${Math.round(worst)} ms`);
    ctx.metric("buildMs", Date.now() - t); ctx.metric("frameGapMs", gap); ctx.metric("clickWhileBusyMs", Math.round(worst));
    ctx.note(`Build ${Date.now() - t} ms, longest frame gap ${gap} ms, UI answered in ${Math.round(worst)} ms`);
    if (gap > B.frameGap) throw new Invariant("main-thread-blocked", `the page stalled for ${gap} ms while Build ran (budget ${B.frameGap} ms): the search is not off the main thread`);
    if (worst > B.inputWhileBusy) throw new Invariant("input-lag", `a click took ${Math.round(worst)} ms to answer while Build ran (budget ${B.inputWhileBusy} ms)`);
  });
});

// ---- faults ----
add("fault-worker-killed", 120_000, async (ctx) => {
  const world = genWorld({ seed: 6, stores: 40, kind: "normal", start: "2026-10-01", days: 31 });
  const E = await open({ world, init: [TRACK_WORKERS] });
  return finish("fault-worker-killed", E, async () => {
    await E.page.waitForSelector('[role="gridcell"]', { timeout: 30000 });
    await E.page.evaluate(() => { window.__run = window.__v3.app.getState().runBuild(); });
    await E.page.waitForTimeout(500);
    const killed = await E.page.evaluate(() => { const w = window.__workers[0]; if (!w) return false; w.terminate(); return true; });
    E.step(`Build running; engine worker terminated: ${killed}`);
    if (!killed) throw new Invariant("setup", "no engine worker was started by Build");
    // A terminated worker raises no event, so the way out is the Cancel button (and the engine timeout as a last resort).
    try { await E.page.waitForFunction(() => !window.__v3.app.getState().busy, null, { timeout: 8000, polling: 200 }); }
    catch {
      const cancel = E.page.locator('[data-testid="cancel-engine"]').first();
      if (!(await cancel.count())) throw new Invariant("stuck-busy", "the engine worker died during Build, the app stayed busy and there is no Cancel button");
      await cancel.click();
      try { await E.page.waitForFunction(() => !window.__v3.app.getState().busy, null, { timeout: 8000, polling: 200 }); }
      catch { throw new Invariant("stuck-busy", "Cancel did not clear busy after the engine worker died"); }
      E.step("worker death: Cancel cleared busy");
    }
    const notice = await E.page.evaluate(() => window.__v3.app.getState().notice);
    E.step(`busy cleared; notice: ${JSON.stringify(notice)?.slice(0, 200)}`);
    // the next search must work
    await E.page.evaluate(() => { window.__run = window.__v3.app.getState().runBuild({ from: "2026-10-01", to: "2026-10-07" }); });
    try { await E.page.waitForFunction(() => !window.__v3.app.getState().busy, null, { timeout: 60000, polling: 200 }); }
    catch { throw new Invariant("stuck-busy", "a second Build after the worker died never finished"); }
    const st = await E.page.evaluate(() => { const s = window.__v3.app.getState(); return { proposal: !!s.world.session.proposal, notice: s.notice?.text ?? null }; });
    ctx.note(`after worker death: busy cleared, next Build ${st.proposal ? "opened a proposal" : "said: " + st.notice}`);
  });
});
add("fault-worker-blocked", 120_000, async (ctx) => {
  const world = genWorld({ seed: 7, stores: 18, kind: "normal", start: "2026-10-01", days: 31 });
  const E = await open({ world, init: [BLOCK_WORKERS] });
  return finish("fault-worker-blocked", E, async () => {
    await E.page.waitForSelector('[role="gridcell"]', { timeout: 30000 });
    await E.page.evaluate(() => { window.__run = window.__v3.app.getState().runBuild({ from: "2026-10-01", to: "2026-10-10" }); });
    await waitFor(E.page, () => !window.__v3.app.getState().busy, null, 90000, "Build without workers (in-page fallback)");
    const st = await E.page.evaluate(() => { const s = window.__v3.app.getState(); return { proposal: !!s.world.session.proposal, notice: s.notice }; });
    E.step(`fallback Build finished: proposal=${st.proposal} notice=${JSON.stringify(st.notice)?.slice(0, 160)}`);
    if (st.notice?.kind === "error") throw new Invariant("fallback-failed", `Build without a worker reported: ${st.notice.text}`);
    ctx.note(`Workers blocked: Build ran in the page${st.proposal ? " and opened a proposal" : ""}`);
  });
});
add("fault-slow-engine", 120_000, async (ctx) => {
  const delay = 3000;
  const world = genWorld({ seed: 7, stores: 18, kind: "normal", start: "2026-10-01", days: 31 });
  const E = await open({ world, init: [SLOW_ENGINE(delay)] });
  return finish("fault-slow-engine", E, async () => {
    await E.page.waitForSelector('[role="gridcell"]', { timeout: 30000 });
    await frameGapProbe(E.page);
    await E.page.evaluate(() => { window.__run = window.__v3.app.getState().runBuild({ from: "2026-10-01", to: "2026-10-10" }); });
    await E.page.waitForTimeout(300);
    const busy = await E.page.evaluate(() => window.__v3.app.getState().busy);
    if (!busy) throw new Invariant("not-busy", "a slow search is running but the app does not say so");
    const t = Date.now();
    await tab(E.page, "Plan").click({ timeout: 5000 });
    await tab(E.page, "Schedule").click({ timeout: 5000 });
    const lag = Date.now() - t;
    E.step(`two tab clicks while the engine is slow took ${lag} ms`);
    // edits while a search runs must be refused or make the result stale, never corrupt
    await waitFor(E.page, () => !window.__v3.app.getState().busy, null, 60000, "slow Build");
    const gap = await E.page.evaluate(() => { window.__gap.on = false; return Math.round(window.__gap.max); });
    ctx.metric("frameGapMs", gap);
    ctx.note(`engine delayed ${delay} ms: UI answered 2 clicks in ${lag} ms, longest frame gap ${gap} ms`);
    if (lag > B.inputWhileBusy * 2 || gap > B.frameGap) throw new Invariant("input-lag", `the page was unresponsive while waiting for a slow engine (clicks ${lag} ms, frame gap ${gap} ms)`);
  });
});
add("fault-idb-put-fails", 90_000, async (ctx) => {
  const E = await open({ init: [IDB_FAIL_SWITCH], practice: true });
  return finish("fault-idb-put-fails", E, async () => {
    await E.page.evaluate(() => window.__persist.adopt(window.__v3.app.getState().world));
    const edit = (n) => E.page.evaluate((k) => { const a = window.__v3.app.getState(); const ids = Object.keys(a.world.state.assignments); return a.commit([{ t: "update", assignmentId: ids[k], patch: { pinned: true } }], "pin " + k); }, n);
    if (!(await edit(0))) throw new Invariant("setup", "first edit refused");
    await E.page.waitForTimeout(300);
    await E.page.evaluate(() => { window.__failIdb = true; });
    E.step("IndexedDB puts now throw QuotaExceededError");
    for (let k = 1; k <= 3; k++) { await edit(k); await E.page.waitForTimeout(150); }
    await E.page.waitForTimeout(600);
    const st = await E.page.evaluate(() => ({ status: window.__persist.status(), text: document.body.innerText }));
    E.step(`status: mirrorOk=${st.status.mirrorOk} unsaved=${st.status.unsavedChanges} error=${st.status.error}`);
    if (st.status.mirrorOk) throw new Invariant("silent-storage-failure", "browser storage is failing but status().mirrorOk is still true");
    if (st.status.unsavedChanges < 3) throw new Invariant("silent-storage-failure", `storage failing for 3 edits but status shows ${st.status.unsavedChanges} unsaved`);
    if (!/browser|copy|storage|unsaved|not saved/i.test(st.text)) throw new Invariant("silent-storage-failure", "storage is failing and nothing on screen says so");
    await E.page.evaluate(() => { window.__failIdb = false; });
    await edit(4);
    await E.page.evaluate(() => window.__persist.flush());
    await E.page.waitForTimeout(300);
    const ok = await E.page.evaluate(() => window.__persist.status().mirrorOk);
    if (!ok) throw new Invariant("no-recovery", "storage works again but the browser copy never caught up");
    const before = await E.page.evaluate(() => window.__v3.app.getState().world.journal.changeSets.length);
    await E.page.reload({ waitUntil: "load" });
    await E.page.waitForFunction(() => window.__v3 && window.__v3.app.getState().world, null, { timeout: 20000 }).catch(() => { throw new Invariant("work-lost", "after the storage fault and a reload the app came back with no schedule"); });
    const after = await E.page.evaluate(() => window.__v3.app.getState().world.journal.changeSets.length);
    E.step(`change sets before reload ${before}, after ${after}`);
    if (after !== before) throw new Invariant("work-lost", `${before} change sets before the reload, ${after} after: edits made during the storage fault were lost`);
    ctx.note(`4 edits during a storage fault: status said so, recovered, ${after} change sets survive a reload`);
  });
});
add("fault-idb-unavailable", 60_000, async (ctx) => {
  const E = await open({ init: [IDB_UNAVAILABLE], practice: true });
  return finish("fault-idb-unavailable", E, async () => {
    const ok = await E.page.evaluate(() => { const a = window.__v3.app.getState(); const id = Object.keys(a.world.state.assignments)[0]; return a.commit([{ t: "update", assignmentId: id, patch: { pinned: true } }], "pin"); });
    await E.page.waitForTimeout(500);
    const dom = await E.page.evaluate(() => ({ grid: !!document.querySelector('[role="grid"]'), text: document.body.innerText.slice(0, 3000) }));
    if (!ok || !dom.grid) throw new Invariant("app-broken", `with browser storage blocked the app ${ok ? "lost its grid" : "refused an edit"}`);
    ctx.note("browser storage blocked: the app still renders and accepts edits");
  });
});
add("fault-offline", 90_000, async (ctx) => {
  const world = genWorld({ seed: 8, stores: 18, kind: "normal", start: "2026-10-01", days: 31 });
  const E = await open({ world });
  return finish("fault-offline", E, async () => {
    await E.page.waitForSelector('[role="gridcell"]', { timeout: 30000 });
    await E.ctx.setOffline(true);
    E.step("network switched off");
    await E.page.evaluate(() => window.dispatchEvent(new Event("offline")));
    const r = await E.page.evaluate(() => { const a = window.__v3.app.getState(); const id = Object.keys(a.world.state.assignments)[3]; const ok = a.commit([{ t: "update", assignmentId: id, patch: { pinned: true } }], "pin"); const cs = window.__v3.app.getState().world.journal.changeSets.at(-1); const un = window.__v3.app.getState().undo(cs.id); a.runBuild({ from: "2026-10-01", to: "2026-10-07" }); return { ok, un }; });
    await waitFor(E.page, () => !window.__v3.app.getState().busy, null, 60000, "Build while offline");
    for (const v of ["Plan", "Time off", "Setup", "Print", "Schedule"]) await tab(E.page, v).click({ timeout: 10000 });
    if (!r.ok || !r.un) throw new Invariant("offline-broken", `while offline an edit ${r.ok ? "went through but undo failed" : "was refused"}`);
    ctx.note("offline: edit, undo, Build and every screen work; no network requests");
  });
});

// ---- soak ----
add("soak", pick3(L, 360_000, 900_000, 600_000), async (ctx) => {
  const N = pick3(L, 400, 2000, 6000);
  const world = genWorld({ seed: 9, stores: 18, kind: "normal", start: "2026-10-01", days: 31 });
  const E = await open({ world });
  return finish("soak", E, async () => {
    await E.page.waitForSelector('[role="gridcell"]', { timeout: 30000 });
    const cdp = await E.ctx.newCDPSession(E.page);
    await cdp.send("Performance.enable");
    const sample = async (i) => {
      await E.page.evaluate(() => { const a = window.__v3.app.getState(); a.setView("wall"); a.setDrawer(false); a.setOutForm(false); a.select(null); if (a.world.session.proposal) a.discardProposal(); });
      await settle(E.page);
      await cdp.send("HeapProfiler.collectGarbage"); await cdp.send("HeapProfiler.collectGarbage");
      const m = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
      const cs = await E.page.evaluate(() => window.__v3.app.getState().world.journal.changeSets.length);
      return { i, heap: m.JSHeapUsedSize, nodes: m.Nodes, listeners: m.JSEventListeners, docs: m.Documents, cs };
    };
    const r = rng(9090);
    const every = Math.max(20, Math.floor(N / 30));
    const samples = [await sample(0)];
    const t0 = Date.now();
    for (let i = 1; i <= N; i++) {
      const roll = r.next();
      let what;
      if (roll < 0.30) { const n = await E.page.locator('[role="gridcell"]').count(); const k = r.int(Math.max(1, n)); what = `click cell ${k}`; await E.page.evaluate((j) => { const c = document.querySelectorAll('[role="gridcell"]')[j]; if (c) c.click(); }, k); }
      else if (roll < 0.45) { what = "key"; await E.page.keyboard.press(r.pick(["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Enter", "Escape", "PageDown", "PageUp"])); }
      else if (roll < 0.60) { what = "view"; await E.page.evaluate((v) => window.__v3.app.getState().setView(v), r.pick(["wall", "plan", "timeoff", "setup", "print", "wall", "wall"])); }
      else if (roll < 0.68) { what = "drawer"; await E.page.evaluate((t) => { const a = window.__v3.app.getState(); a.setDrawer(!a.drawer, t); }, r.pick(["queue", "tell", "history"])); }
      else if (roll < 0.76) { what = "shift"; const d = r.pick([7, -7, 14, -14]); await E.page.evaluate((x) => window.__v3.app.getState().shiftWindow(x), d); }
      else if (roll < 0.80) { what = "axis"; await E.page.evaluate(() => { const a = window.__v3.app.getState(); a.setAxis(a.axis === "store" ? "pharmacist" : "store"); }); }
      else if (roll < 0.84) { what = "outForm"; await E.page.evaluate(() => { const a = window.__v3.app.getState(); a.setOutForm(!a.outForm); }); }
      else if (roll < 0.94) {
        what = "edit+undo";
        await E.page.evaluate((k) => { const a = window.__v3.app.getState(); if (a.world.session.proposal || (a.world.session.scenario && !a.world.session.scenario.parked)) return; const ids = Object.keys(a.world.state.assignments); const id = ids[k % ids.length]; if (a.commit([{ t: "update", assignmentId: id, patch: { agreed: !a.world.state.assignments[id].agreed } }], "soak")) { const cs = window.__v3.app.getState().world.journal.changeSets.at(-1); window.__v3.app.getState().undo(cs.id); } }, r.int(100000));
      }
      else if (roll < 0.97) { what = "scenario"; await E.page.evaluate(() => { const a = window.__v3.app.getState(); const sc = a.world.session.scenario; if (sc) a.discardScenario(); else if (!a.world.session.proposal) a.openScenario("soak"); }); }
      else { what = "ctrl+z"; await E.page.keyboard.press("Control+z"); }
      E.step(`#${i} ${what}`);
      if (E.log.length > 60) E.log.splice(0, E.log.length - 40);
      if (i % every === 0) samples.push(await sample(i));
    }
    const dur = Date.now() - t0;
    samples.push(await sample(N));
    const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
    const n = samples.length;
    const early = samples.slice(Math.max(1, Math.floor(n * 0.1)), Math.max(2, Math.floor(n * 0.3)));
    const late = samples.slice(Math.floor(n * 0.8));
    const h0 = med(early.map((s) => s.heap)), h1 = med(late.map((s) => s.heap));
    const d0 = med(early.map((s) => s.nodes)), d1 = med(late.map((s) => s.nodes));
    const dcs = samples[n - 1].cs - samples[0].cs;
    let rising = 0; for (let k = 1; k < n; k++) if (samples[k].heap > samples[k - 1].heap) rising++;
    const rise = rising / (n - 1);
    const MB = 1048576;
    const allowed = Math.max(12 * MB, h0 * 0.4) + 60 * 1024 * dcs;
    const growth = h1 - h0;
    ctx.metric("actions", N); ctx.metric("heapStartMB", +(h0 / MB).toFixed(1)); ctx.metric("heapEndMB", +(h1 / MB).toFixed(1)); ctx.metric("domStart", d0); ctx.metric("domEnd", d1); ctx.metric("changeSets", samples[n - 1].cs);
    ctx.note(`${N} actions in ${(dur / 1000).toFixed(0)}s: heap ${(h0 / MB).toFixed(1)} -> ${(h1 / MB).toFixed(1)} MB, DOM ${d0} -> ${d1} nodes, history ${samples[0].cs} -> ${samples[n - 1].cs} change sets, heap rose in ${(rise * 100).toFixed(0)}% of samples`);
    fs.writeFileSync(path.join(args.out, "browser-soak-samples.json"), JSON.stringify(samples));
    if (growth > allowed && rise >= 0.65) throw new Invariant("heap-growth", `JS heap after GC grew ${(growth / MB).toFixed(1)} MB (${(h0 / MB).toFixed(1)} -> ${(h1 / MB).toFixed(1)}) over ${N} actions, more than the ${(allowed / MB).toFixed(1)} MB allowed, and rose in ${(rise * 100).toFixed(0)}% of samples. Samples: browser-soak-samples.json`);
    if (d1 > d0 * 1.5 + 500) throw new Invariant("dom-growth", `DOM nodes grew ${d0} -> ${d1} over ${N} actions (back on the same screen)`);
    const lis = Math.max(...late.map((s) => s.listeners)) - Math.min(...early.map((s) => s.listeners));
    if (lis > 2000) throw new Invariant("listener-growth", `event listeners grew by ${lis} over ${N} actions`);
  });
});

// ---------------- main ----------------
const stat = ensureBuilt();
console.log(`dist-v3: ${stat}`);
srv = await serveV3();
browser = await launchBrowser();
try {
  await runSuite("browser", cases, args);
} finally {
  await browser.close().catch(() => {});
  srv.close();
}
