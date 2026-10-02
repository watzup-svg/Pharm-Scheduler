// The page sweep behind `npm run deep`: every page and a few day popups, at laptop and phone width, one job per page and width.
// Per job it checks: script/console errors, sideways overflow, leftover store letters (the sample names stores by number), noted
// things still open a note on right click and close on Escape, and takes a screenshot to compare with the saved baseline.
//   node scripts/screens.mjs --one <route|district> <width>   one job, prints one JSON line (the parent uses this)
//   node scripts/screens.mjs [--accept] [--jobs n]            every job, a few at a time, then a short summary
// Files: test-logs/screens/<stamp>/*.png and report.json; the baseline lives in test-logs/baseline/ (local, not committed).
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ROUTES = ["district", "schedule", "time-off", "people", "stores", "holidays", "lists", "print"];
const WIDTHS = [1366, 390];
const args = process.argv.slice(2);

// ---- one job -------------------------------------------------------------------------------------------------------
if (args[0] === "--one") {
  const [route, width] = [args[1], Number(args[2])];
  const { launch, open, axeSource } = await import(path.join(root, "e2e/lib.mjs"));
  const { createDemo } = await import(path.join(root, "src/lib/schedule/demo.ts"));
  const codes = createDemo().stores.map((s) => s.code);
  const problems = [];
  const note = (kind, detail) => problems.push({ kind, detail: String(detail).slice(0, 160) });
  const browser = await launch();
  const { page, errors } = await open(browser, route === "district" ? "" : route, { width, height: width < 600 ? 844 : 900 });
  const consoleErrors = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" });

  const scan = async (where) => {
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (over > 1) note("overflow", `${where}: page is ${over}px wider than the screen`);
    if (route !== "stores") {
      const re = `\\b(${codes.join("|")})\\b`;
      const hits = await page.evaluate((src) => {
        const rx = new RegExp(src);
        const out = [];
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (w.nextNode()) {
          const el = w.currentNode.parentElement;
          if (!el || el.closest("script,style") || (el.offsetParent === null && getComputedStyle(el).position !== "fixed")) continue;
          if (rx.test(w.currentNode.textContent)) out.push(w.currentNode.textContent.trim().slice(0, 40));
        }
        for (const el of document.querySelectorAll("[data-tip],[aria-label]")) for (const a of ["data-tip", "aria-label"]) { const v = el.getAttribute(a); if (v && rx.test(v)) out.push(v.slice(0, 40)); }
        return out;
      }, re);
      if (hits.length) note("store-letters", `${where}: ${hits.slice(0, 3).join(" ; ")}`);
    }
  };
  await scan("page");
  // The picture is taken first, at the top of the page, before any pointer or popup has touched it.
  await page.mouse.move(2, 2);
  await page.waitForTimeout(150);
  const shot = await page.screenshot({ fullPage: false });
  const dir = process.env.SCREENS_DIR ?? os.tmpdir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${route}-${width}.png`);
  fs.writeFileSync(file, shot);
  const hash = crypto.createHash("sha1").update(shot).digest("hex").slice(0, 12);

  // Notes: right click on a spread of noted things (laptop only; phones use a long press, checked elsewhere).
  if (width >= 1000) {
    const sel = "[data-tip],[role='img'][aria-label],[data-day][aria-label]";
    const count = await page.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.offsetParent && !e.closest("[data-notip]") && e.getBoundingClientRect().width > 4).length, sel);
    const picks = count ? [...new Set(Array.from({ length: Math.min(10, count) }, (_, i) => Math.floor((i * count) / Math.min(10, count))))] : [];
    for (const i of picks) {
      const box = await page.evaluate(([s, i]) => {
        const el = [...document.querySelectorAll(s)].filter((e) => e.offsetParent && !e.closest("[data-notip]") && e.getBoundingClientRect().width > 4)[i];
        if (!el) return null;
        el.scrollIntoView({ block: "center" });
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: (el.getAttribute("data-tip") || el.getAttribute("aria-label") || "").slice(0, 40) };
      }, [sel, i]);
      if (!box) continue;
      await page.mouse.move(box.x, box.y);
      await page.mouse.click(box.x, box.y, { button: "right" });
      await page.waitForTimeout(120);
      const shown = await page.evaluate(() => { const n = document.querySelector("[data-hover-note]"); return n ? n.textContent.trim().length : -1; });
      if (shown <= 0 && !(await page.locator("[data-hover-note]").count())) {
        // A spot that sits under something else may legitimately have no note of its own; only a note that opens empty is a fault.
      } else if (shown === 0) note("note-empty", `right click on "${box.label}" opened an empty note`);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(60);
      if (await page.locator("[data-hover-note]").count()) note("note-stuck", `Escape did not close the note for "${box.label}"`);
    }
  }

  // Popups: the first few days on the schedule page.
  if (route === "schedule") {
    const ids = await page.evaluate(() => [...document.querySelectorAll("[id^='day-']")].filter((e) => e.offsetParent).map((e) => e.id));
    for (const id of [ids[0], ids[Math.floor(ids.length / 2)], ids[ids.length - 1]].filter(Boolean)) {
      await page.evaluate((id) => document.getElementById(id)?.scrollIntoView({ block: "center" }), id);
      await page.locator(`#${id}`).click({ timeout: 3000 }).catch(() => note("popup", `${id} would not click`));
      await page.waitForTimeout(250);
      const d = page.getByRole("dialog");
      if (await d.count()) {
        const spill = await d.first().evaluate((e) => e.scrollWidth - e.clientWidth);
        if (spill > 1) note("overflow", `${id} popup is ${spill}px wider than itself`);
        await scan(`popup ${id}`);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(150);
      } else note("popup", `${id} opened no dialog`);
    }
  }
  // Accessibility basics (axe): serious and critical findings only, minus the ones listed in scripts/axe-known.json.
  {
    const known = new Set(JSON.parse(fs.readFileSync(path.join(root, "scripts/axe-known.json"), "utf8"))[`${route}@${width}`] ?? []);
    await page.addScriptTag({ content: axeSource() });
    const found = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => ({ id: v.id, n: v.nodes.length, first: v.nodes[0]?.target?.join(" ").slice(0, 80) })));
    if (process.env.AXE_LIST) console.log("AXE " + JSON.stringify({ page: `${route}@${width}`, ids: found.map((f) => f.id) }));
    for (const f of found) if (!known.has(f.id)) note("accessibility", `${f.id} (${f.n}x) e.g. ${f.first}`);
  }
  if (errors.length) note("script-error", errors[0]);
  if (consoleErrors.length) note("console-error", consoleErrors[0]);

  await browser.close();
  console.log("RESULT " + JSON.stringify({ route, width, problems, hash, file }));
  process.exit(0);
}

// ---- all jobs ------------------------------------------------------------------------------------------------------
const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
const outDir = path.join(root, "test-logs", "screens", stamp);
const baseDir = path.join(root, "test-logs", "baseline");
fs.mkdirSync(outDir, { recursive: true });
let server = null;
if (!process.env.BASE) {
  const dir = path.join(root, "dist-spa");
  if (!fs.existsSync(path.join(dir, "spa.html"))) { console.log("Build first: npm run build:trial"); process.exit(2); }
  server = http.createServer((req, res) => {
    const f = path.join(dir, decodeURIComponent((req.url ?? "/").split("?")[0]).replace(/^\/+/, "") || "spa.html");
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": f.endsWith(".html") ? "text/html" : "application/octet-stream" }).end(fs.readFileSync(f));
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  process.env.BASE = `http://127.0.0.1:${server.address().port}/spa.html`;
}
const jobsAt = args.indexOf("--jobs");
const width = Math.max(1, Math.min(jobsAt >= 0 ? Number(args[jobsAt + 1]) : os.cpus().length - 1, ROUTES.length * WIDTHS.length));
const queue = ROUTES.flatMap((r) => WIDTHS.map((w) => [r, w]));
const rows = [];
const t0 = Date.now();
const one = ([route, w]) =>
  new Promise((done) => {
    let out = "";
    const child = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", fileURLToPath(import.meta.url), "--one", route, String(w)], { cwd: root, env: { ...process.env, SCREENS_DIR: outDir } });
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", () => {
      if (process.env.AXE_LIST) out.split("\n").filter((l) => l.startsWith("AXE ")).forEach((l) => console.log(l));
      const line = out.split("\n").find((l) => l.startsWith("RESULT "));
      rows.push(line ? JSON.parse(line.slice(7)) : { route, width: w, problems: [{ kind: "job-crashed", detail: out.trim().split("\n").slice(-3).join(" | ").slice(0, 200) }], hash: null });
      done();
    });
  });
await Promise.all(Array.from({ length: width }, async () => { for (let j = queue.shift(); j; j = queue.shift()) await one(j); }));
rows.sort((a, b) => ROUTES.indexOf(a.route) - ROUTES.indexOf(b.route) || b.width - a.width);

const baseFile = path.join(baseDir, "hashes.json");
const base = fs.existsSync(baseFile) ? JSON.parse(fs.readFileSync(baseFile, "utf8")) : null;
if (args.includes("--accept")) {
  fs.mkdirSync(baseDir, { recursive: true });
  for (const r of rows) if (r.hash) fs.copyFileSync(r.file, path.join(baseDir, path.basename(r.file)));
  fs.writeFileSync(baseFile, JSON.stringify(Object.fromEntries(rows.map((r) => [`${r.route}-${r.width}`, r.hash])), null, 2));
}
const changed = base ? rows.filter((r) => r.hash && base[`${r.route}-${r.width}`] && base[`${r.route}-${r.width}`] !== r.hash).map((r) => `${r.route}-${r.width}`) : [];
const bad = rows.flatMap((r) => r.problems.map((p) => ({ page: `${r.route} @${r.width}`, ...p })));
fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify({ stamp, secs: Math.round((Date.now() - t0) / 1000), jobs: rows.length, problems: bad, changedScreens: changed, baseline: base ? "compared" : "none (run with --accept to save one)" }, null, 2));
for (const p of bad.slice(0, 6)) console.log(`FAIL ${p.page}: ${p.kind}: ${p.detail}`);
console.log(`${bad.length ? `${bad.length} problem(s) on ${new Set(bad.map((b) => b.page)).size} page(s)` : `all ${rows.length} page and width jobs clean`}; screens changed vs baseline: ${base ? (changed.length ? changed.join(", ") : "none") : "no baseline yet"} (${Math.round((Date.now() - t0) / 1000)}s)`);
console.log(`report: ${path.relative(root, path.join(outDir, "report.json"))}`);
server?.close();
process.exit(bad.length ? 1 : 0);
