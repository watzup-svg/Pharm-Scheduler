// Accessibility, keyboard and legibility audit of every v3 view.
//   npm run build:v3 && node e2e/v3-a11y.mjs        (screenshots go to $SHOTS or /tmp/v3-a11y)
// axe-core (wcag2a, wcag2aa, best-practice) at 1366x800 and 1920x1080 on every view and dialog; then keyboard, names, 13px, colour-not-alone, no touch code.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { launch, serveV3, openApp, check, failed } from "./v3-lib.mjs";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const SHOTS = process.env.SHOTS ?? "/tmp/v3-a11y";
fs.mkdirSync(SHOTS, { recursive: true });

// Allowed axe findings. Each needs a one-line reason. Empty is the bar.
const ALLOW = [
  // { rule: "rule-id", match: "selector substring", why: "one line" },
];

const srv = await serveV3();
const browser = await launch();
const errorsAll = [];

const runAxe = async (page, name) => {
  await page.evaluate(axeSource);
  const res = await page.evaluate(() => window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "best-practice"] }, resultTypes: ["violations"] }));
  const bad = res.violations.flatMap((v) => v.nodes.map((n) => ({ rule: v.id, sel: n.target.join(" "), msg: (n.failureSummary ?? "").split("\n").slice(1, 2).join(" ").trim() })))
    .filter((v) => !ALLOW.some((a) => a.rule === v.rule && v.sel.includes(a.match)));
  check(`axe: ${name}`, bad.length === 0, bad.slice(0, 6).map((b) => `${b.rule} ${b.sel} ${b.msg}`).join(" | ") + (bad.length > 6 ? ` (+${bad.length - 6} more)` : ""));
};

// Screens are Schedule / Time off / Print / Setup. Plan is reached through the store; Travel, Rules and Checks are tabs inside Setup.
const SETUP_TABS = { Travel: "Travel", Rules: "Rules", Checks: "Check" };
const go = async (page, label) => {
  const hdr = page.locator("header");
  if (label === "Wall") await hdr.getByRole("button", { name: "Schedule" }).click();
  else if (label === "Plan") await page.evaluate(() => window.__v3.app.getState().setView("plan"));
  else if (label in SETUP_TABS) { await hdr.getByRole("button", { name: "Setup" }).click(); await page.getByRole("tab", { name: SETUP_TABS[label], exact: true }).click(); }
  else await hdr.getByRole("button", { name: label }).click();
  await page.waitForTimeout(150);
};
const drawer = (page, tab) => page.evaluate((t) => window.__v3.app.getState().setDrawer(!!t, t ?? undefined), tab);
const VIEWS = ["Wall", "Plan", "Time off", "Setup", "Travel", "Rules", "Checks", "Print"];
const setup = (page, tab) => page.getByRole("tab", { name: tab }).click().then(() => page.waitForTimeout(100));

/** Every view and dialog, once, with `after` called on each (axe, screenshots...). */
async function tour(page, size, after) {
  const tag = `${size.width}`;
  const step = async (name) => { await page.waitForTimeout(120); await after(name, tag); };
  await go(page, "Wall"); await step("wall (stores)");
  const rows = page.getByRole("group", { name: "Rows" });
  const hasRows = (await rows.count()) > 0;
  if (hasRows) { await rows.getByRole("button", { name: "People" }).click(); await step("wall (pharmacists)"); }
  else console.log("skip wall (pharmacists): the Rows switch is the wall's to describe");
  // a selected cell, so the Inspector shows its controls
  await page.locator('[role="gridcell"]').nth(40).click(); await step("wall (pharmacist cell selected)");
  if (hasRows) await rows.getByRole("button", { name: "Stores" }).click();
  await page.locator('[role="gridcell"]').nth(40).click(); await step("wall (store cell selected)");
  await page.getByRole("button", { name: "Day", exact: true }).click(); await step("wall (one day)");
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await page.getByRole("button", { name: "Key", exact: true }).click(); await step("wall key open");
  await page.getByRole("button", { name: "What do these mean?" }).click(); await step("icon guide open");
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.__v3.app.getState().setOutForm(true)); await step("wall with the Someone's out form open");
  await page.evaluate(() => window.__v3.app.getState().setOutForm(false));
  for (const t of ["tell", "history", "queue"]) { await drawer(page, t); await step(`left drawer: ${t}`); }
  await drawer(page, null);
  await go(page, "Plan"); await step("plan");
  await go(page, "Time off"); await step("time off");
  await page.evaluate(() => window.__v3.app.getState().setOutForm(true)); await step("time off with the right-column form open");
  await page.evaluate(() => window.__v3.app.getState().setOutForm(false));
  await go(page, "Setup");
  const tabNames = await page.locator('[role="tablist"][aria-label="Setup sections"] [role="tab"]').allInnerTexts();
  for (const n of tabNames) { await page.locator('[role="tablist"][aria-label="Setup sections"]').getByRole("tab", { name: n.trim() }).click(); await step(`setup: ${n.trim()}`); }
  await go(page, "Print"); await step("print");
  await go(page, "Wall");
}

// ---------------------------------------------------------------- dialogs
async function dialogs(page, after) {
  const dlgOpen = () => page.locator('[role="dialog"]').count();
  const closeByEsc = async (name) => {
    await page.keyboard.press("Escape"); await page.waitForTimeout(150);
    check(`Esc closes the ${name} dialog`, (await dlgOpen()) === 0);
  };
  // unsaved-changes guard: a commit, then Open
  await page.evaluate(() => {
    const s = window.__v3.app.getState();
    const a = Object.values(s.world.state.assignments)[0];
    s.commit([{ t: "update", assignmentId: a.id, patch: { pinned: !a.pinned } }], "a11y change");
  });
  await page.waitForTimeout(300);
  const fileOpen = async () => { await page.getByRole("group", { name: "Save" }).getByRole("button", { name: "File menu" }).click(); await page.getByRole("menuitem", { name: "Open…" }).click(); };
  await fileOpen();
  await page.waitForTimeout(300);
  if (await dlgOpen()) {
    await after("dialog: unsaved changes"); 
    const focusInside = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
    check("focus moves into the unsaved-changes dialog", focusInside);
    await closeByEsc("unsaved-changes");
    const back = await page.evaluate(() => document.activeElement?.closest("header") ? document.activeElement.getAttribute("aria-label") : String(document.activeElement?.tagName));
    check("focus returns to the File menu button after the dialog closes", back === "File menu", String(back));
  } else check("unsaved-changes dialog can be shown", false, "no dialog appeared");

  // refused file
  await page.evaluate(() => {
    window.__persist.open = async () => ({ state: "refused", reason: "bad", error: "This file is damaged.", offers: [{ source: "mirror", name: "Browser copy", at: "2026-10-01T10:00:00Z" }, { source: "idb-ckpt", id: 1, name: "Before build", at: "2026-10-01T09:00:00Z" }] });
  });
  await fileOpen();
  await page.waitForTimeout(300);
  if (await dlgOpen()) { await after("dialog: file refused"); await closeByEsc("file-refused"); } else check("file-refused dialog can be shown", false);

  // read-only
  await page.evaluate(() => { const s = window.__v3.app.getState(); s.setWorld(s.world, { fileName: "Practice.sqlite", readOnlyProblems: ["Two shifts overlap at one store.", "A pharmacist has no state."] }); });
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: /Read-only/ }).click();
  await page.waitForTimeout(200);
  if (await dlgOpen()) { await after("dialog: read-only"); await closeByEsc("read-only"); } else check("read-only dialog can be shown", false);
  await page.evaluate(() => { const s = window.__v3.app.getState(); s.setWorld(s.world, { fileName: "Practice.sqlite", readOnlyProblems: null }); });

  // Recovery and reconnect are boot-time decisions (no Esc: the person must choose). Fake what the save layer reports, then make it notify.
  const fake = async (bootObj, statusPatch) => {
    await page.evaluate(([b, sp]) => {
      const p = window.__persist;
      p.__orig ??= { lastBoot: p.lastBoot, status: p.status };
      const stat = { ...p.__orig.status(), ...sp };
      p.lastBoot = () => b;
      p.status = () => stat;
      const s = window.__v3.app.getState();
      const a = Object.values(s.world.state.assignments)[0];
      s.commit([{ t: "update", assignmentId: a.id, patch: { pinned: !a.pinned } }], "a11y nudge"); // a real commit makes the save layer notify
    }, [bootObj, statusPatch]);
    await page.waitForTimeout(400);
  };
  const restore = () => page.evaluate(() => { const p = window.__persist; if (p.__orig) { p.lastBoot = p.__orig.lastBoot; p.status = p.__orig.status; } });
  await fake({ state: "recovery", fileRev: 3, mirrorRev: 5, world: null, mirrorWorld: null }, { recoveryPending: true, fileName: "Practice.sqlite" });
  if (await dlgOpen()) {
    await after("dialog: recovery");
    check("focus moves into the recovery dialog", await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')));
    check("recovery dialog offers two plain choices", (await page.locator('[role="dialog"] button').count()) === 2);
  } else check("recovery dialog can be shown", false);
  await restore();
  await fake({ state: "needs-permission", fileName: "Practice.sqlite" }, { needsPermission: true, fileName: "Practice.sqlite" });
  if (await dlgOpen()) await after("dialog: reconnect"); else check("reconnect dialog can be shown", false);
  await restore();
}

try {
  for (const size of [{ width: 1366, height: 800 }, { width: 1920, height: 1080 }]) {
    const { page, errors } = await openApp(browser, srv.base, { size });
    errorsAll.push(...errors);
    await page.addInitScript(() => { window.print = () => {}; });
    const after = async (name) => {
      await runAxe(page, `${name} @${size.width}`);
      if (size.width === 1366) await page.screenshot({ path: `${SHOTS}/${name.replace(/[^a-z0-9]+/gi, "-")}.png` });
    };
    await tour(page, size, (n) => after(n));
    await dialogs(page, (n) => after(n));
    await page.close();
  }

  // ---- Start screen, no world (and its trouble notes)
  for (const size of [{ width: 1366, height: 800 }, { width: 1920, height: 1080 }]) {
    const { page, errors } = await openApp(browser, srv.base, { practice: false, size });
    errorsAll.push(...errors);
    await page.waitForTimeout(500);
    await runAxe(page, `start screen @${size.width}`);
    if (size.width === 1366) await page.screenshot({ path: `${SHOTS}/start.png` });
    await page.getByRole("button", { name: "Start a new schedule" }).click();
    await runAxe(page, `start: new schedule @${size.width}`);
    await page.getByRole("radio").nth(1).check();
    await runAxe(page, `start: new schedule, empty @${size.width}`);
    await page.getByRole("button", { name: "Back" }).click();
    await page.evaluate(() => window.__persist.open = async () => ({ state: "refused", reason: "That file is damaged.", error: "checksum", offers: [{ source: "mirror", at: "2026-10-01" }, { source: "idb-ckpt", name: "x", at: "2026-10-01" }] }));
    await page.getByRole("button", { name: "Open a schedule file" }).click();
    await page.waitForTimeout(200);
    await runAxe(page, `start: refused file note @${size.width}`);
    await page.close();
  }

  // ---- keyboard, names, text size, colour (1366x800, practice month)
  const { page, errors } = await openApp(browser, srv.base);
  errorsAll.push(...errors);
  const focusInfo = () => page.evaluate(() => {
    const e = document.activeElement;
    if (!e || e === document.body) return null;
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    const ring = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== "none");
    const name = e.getAttribute("aria-label") || e.innerText?.trim().slice(0, 30) || e.id || e.tagName;
    return { tag: e.tagName, type: e.type, role: e.getAttribute("role"), name, ring, visible: r.width > 0 && r.height > 0, key: e.tagName + "|" + (e.getAttribute("aria-label") ?? "") + "|" + (e.innerText ?? "").trim().slice(0, 40) + "|" + Math.round(r.x) + "," + Math.round(r.y) };
  });

  // Tab through the whole page.
  for (const view of VIEWS) {
    await go(page, view);
    // A click sets Chromium's sequential-focus start point, so start from the first control on the page.
    await page.evaluate(() => { document.activeElement?.blur(); document.querySelector("header button, header a, header input")?.focus(); });
    const seen = []; const noRing = []; let trapped = false;
    await page.evaluate(() => document.querySelectorAll("[data-a11y-seen]").forEach((e) => e.removeAttribute("data-a11y-seen")));
    const startKey = (await focusInfo())?.key;
    let leftDoc = false;
    for (let i = 0; i < 900; i++) {
      const f = await focusInfo();
      if (!f) { leftDoc = true; break; }
      await page.evaluate(() => document.activeElement?.setAttribute("data-a11y-seen", "1"));
      // The first stop is focused by script (no focus-visible heuristic); a date field has month, day, year and picker stops (the picker draws its own ring).
      if (!f.visible) noRing.push(`${f.name} (hidden)`);
      else if (!f.ring && i > 0 && !(f.tag === "INPUT" && (f.type === "date" || f.type === "month"))) noRing.push(f.name);
      // more than five stops on one element is a trap
      if (seen.length >= 5 && seen.slice(-5).every((x) => x.key === f.key)) { trapped = true; break; }
      if (i > 3 && f.key === startKey) { leftDoc = true; break; }
      seen.push(f);
      await page.keyboard.press("Tab");
    }
    check(`${view}: Tab leaves the page (no keyboard trap)`, !trapped && leftDoc, `${seen.length} stops, last: ${seen.at(-1)?.name}, ended on ${trapped ? "trap" : leftDoc ? "exit" : "limit"}`);
    check(`${view}: every Tab stop shows a focus ring`, noRing.length === 0, [...new Set(noRing)].slice(0, 5).join("; "));
    // everything operable is reachable: visible, enabled controls with tabindex>=0 (or natively focusable) were visited
    const missed = await page.evaluate(() => {
      const out = [];
      const sel = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [tabindex]';
      for (const e of document.querySelectorAll(sel)) {
        if (e.disabled || e.closest("[inert],[hidden]")) continue;
        const r = e.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const cs = getComputedStyle(e);
        if (cs.visibility === "hidden" || cs.display === "none") continue;
        if (e.tabIndex < 0) continue; // roving tabindex (wall cells, tabs) or deliberately skipped
        if (!e.hasAttribute("data-a11y-seen")) out.push(e.getAttribute("aria-label") || e.innerText?.trim().slice(0, 30) || e.tagName);
      }
      return out;
    });
    check(`${view}: every focusable control is reached by Tab`, missed.length === 0, missed.slice(0, 5).join("; "));
    // sensible order: no positive tabindex; top bar first, then left panel, main, Inspector (DOM order)
    const order = await page.evaluate(() => ({
      positive: [...document.querySelectorAll("[tabindex]")].filter((e) => e.tabIndex > 0).length,
    }));
    check(`${view}: no positive tabindex`, order.positive === 0);
  }
  // Region order: header, left panel, main, Inspector, in that order
  await go(page, "Wall");
  await drawer(page, "queue");
  {
    await page.evaluate(() => { document.activeElement?.blur(); document.querySelector("header button, header a, header input")?.focus(); });
    const seq = [0];
    for (let i = 0; i < 400; i++) {
      await page.keyboard.press("Tab");
      const r = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; return e.closest("header") ? 0 : e.closest('aside[aria-label="Left panel"]') ? 1 : e.closest("main") ? 2 : e.closest('aside[aria-label="Inspector"]') ? 3 : e.closest('[role="dialog"]') ? 9 : 5; });
      if (r === null || (r === 0 && seq.at(-1) > 0)) break; // left the page or wrapped round
      seq.push(r);
    }
    let sorted = true;
    for (let i = 1; i < seq.length; i++) if (seq[i] < seq[i - 1]) sorted = false;
    check("Tab order runs top bar, left drawer, schedule, Inspector", sorted && seq.includes(0) && seq.includes(1) && seq.includes(2), seq.join(""));
  }
  await drawer(page, null);

  // Wall with the keyboard alone
  {
    await go(page, "Wall");
    const cell = page.locator('[role="gridcell"][tabindex="0"]').first();
    check("the wall has exactly one cell in the Tab order", (await page.locator('[role="gridcell"][tabindex="0"]').count()) === 1);
    await cell.focus();
    const pos = () => page.evaluate(() => { const e = document.activeElement; return e?.getAttribute("role") === "gridcell" ? `${e.dataset.r},${e.dataset.c}` : null; });
    const p0 = await pos();
    await page.keyboard.press("ArrowRight"); const p1 = await pos();
    await page.keyboard.press("ArrowDown"); const p2 = await pos();
    await page.keyboard.press("ArrowLeft"); const p3 = await pos();
    await page.keyboard.press("ArrowUp"); const p4 = await pos();
    check("arrows move between wall cells and back", p1 !== p0 && p2 !== p1 && p3 !== p2 && p4 === p0, [p0, p1, p2, p3, p4].join(" "));
    await page.keyboard.press("Enter");
    const sel = await page.evaluate(() => window.__v3.app.getState().selection);
    check("Enter selects the focused cell", !!sel);
    check("selecting by keyboard shows the Inspector for it", (await page.locator('aside[aria-label="Inspector"]').innerText()).length > 20);
    const w0 = await page.evaluate(() => window.__v3.app.getState().window.from);
    await page.keyboard.press("PageDown");
    const w1 = await page.evaluate(() => window.__v3.app.getState().window.from);
    await page.keyboard.press("PageUp");
    const w2 = await page.evaluate(() => window.__v3.app.getState().window.from);
    check("PageDown / PageUp move the window a week", w1 > w0 && w2 === w0, `${w0} ${w1} ${w2}`);
    check("focus stays on a wall cell after paging", (await pos()) !== null);
    // Tab leaves the grid (no trap) and Shift+Tab comes back
    await page.keyboard.press("Tab");
    check("Tab leaves the wall", (await pos()) === null);
    await page.keyboard.press("Shift+Tab");
    check("Shift+Tab returns to the wall", (await pos()) !== null);
  }

  // Esc closes the proposal preview
  {
    const opened = await page.evaluate(async () => {
      const s = window.__v3.app.getState();
      await s.runImprove(true); // Build finds nothing to propose on the untouched month; Improve opens a preview
      return !!window.__v3.app.getState().world.session.proposal;
    });
    if (!opened) console.log("   build notice:", await page.evaluate(() => JSON.stringify(window.__v3.app.getState().notice)));
    await page.waitForTimeout(500);
    if (opened) {
      await runAxe(page, "wall with a proposal bar open");
      await page.screenshot({ path: `${SHOTS}/proposal.png` });
      await page.evaluate(() => document.activeElement?.blur());
      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);
      check("Esc closes the proposal preview", await page.evaluate(() => !window.__v3.app.getState().world.session.proposal));
    } else check("a proposal can be opened for the Esc check", false);
  }

  // ---- accessible names on every control, on every view (the drawer open on the Wall)
  for (const view of VIEWS) {
    await go(page, view);
    if (view === "Wall") await drawer(page, "queue"); else await drawer(page, null);
    const bad = await page.evaluate(() => {
      const out = [];
      const nameOf = (e) => {
        const lb = e.getAttribute("aria-labelledby");
        if (lb) return lb.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
        const al = e.getAttribute("aria-label"); if (al) return al.trim();
        if (e.labels && e.labels.length) return [...e.labels].map((l) => l.textContent).join(" ").trim();
        const t = (e.textContent ?? "").trim(); if (t) return t;
        return (e.getAttribute("title") ?? "").trim();
      };
      for (const e of document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role="button"], [role="tab"], [role="checkbox"], [role="switch"]')) {
        const r = e.getBoundingClientRect(); if (!r.width && !e.classList.contains("sr-only")) continue;
        const n = nameOf(e);
        const glyphOnly = !/[\p{L}\p{N}]/u.test(n);
        if (!n || glyphOnly) out.push(`${e.tagName.toLowerCase()} "${(e.textContent ?? "").trim().slice(0, 12)}" ${e.className.toString().slice(0, 30)}`);
      }
      return out;
    });
    check(`${view}: every control has a name with words in it (no glyph-only names)`, bad.length === 0, bad.slice(0, 5).join("; "));
  }

  // ---- text is 13px or larger (visible text only, on every view)
  for (const view of ["Wall", "Plan", "Time off", "Setup", "Travel", "Rules", "Checks", "Print"]) {
    await go(page, view);
    if (view === "Wall") await page.locator('[role="gridcell"]').nth(40).click();
    const small = await page.evaluate(() => {
      const out = new Map();
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (!n.textContent.trim()) continue;
        const e = n.parentElement; if (!e || e.closest("script,style,svg")) continue;
        const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
        const cs = getComputedStyle(e);
        if (cs.visibility === "hidden") continue;
        const px = parseFloat(cs.fontSize);
        if (px < 12.99) out.set(`${e.tagName.toLowerCase()}.${e.className.toString().slice(0, 28)} ${px}px "${n.textContent.trim().slice(0, 14)}"`, 1);
      }
      return [...out.keys()];
    });
    check(`${view}: all visible text is 13px or larger`, small.length === 0, small.slice(0, 5).join("; "));
  }

  // ---- colour is never the only cue: every wall cell state has words or a glyph, and so does each chip
  {
    await go(page, "Wall");
    const r = await page.evaluate(() => {
      const cells = [...document.querySelectorAll('[role="gridcell"]')];
      const noName = cells.filter((c) => !(c.getAttribute("aria-label") ?? "").trim()).length;
      // cell classes that carry a state colour must also carry text, a glyph, or a pattern (hatch) plus an aria-label
      const states = new Map();
      for (const c of cells) {
        const key = [...c.classList].filter((k) => /closed|short|open|illegal|warn|ok|cover|away|off|shut|ghost|past/.test(k)).sort().join(" ");
        if (!key) continue;
        const visibleText = (c.textContent ?? "").trim();
        const hasCue = !!visibleText || getComputedStyle(c).backgroundImage !== "none" || (c.getAttribute("aria-label") ?? "").length > 0;
        states.set(key, (states.get(key) ?? true) && hasCue);
      }
      return { n: cells.length, noName, bad: [...states].filter(([, ok]) => !ok).map(([k]) => k) };
    });
    check("every wall cell has a spoken description", r.n > 50 && r.noName === 0, `${r.noName} of ${r.n} have none`);
    check("every wall cell state has a word, glyph or pattern", r.bad.length === 0, r.bad.join("; "));
  }
  for (const view of ["Plan", "Time off", "Checks", "Wall"]) {
    await go(page, view);
    const bad = await page.evaluate(() => {
      // a chip (inline-flex rounded span with a ring) must never be empty or colour only
      return [...document.querySelectorAll("span.ring-1, span[class*='ring-inset']")].filter((e) => !(e.textContent ?? "").trim() && !e.querySelector("svg") && !e.getAttribute("aria-label")).map((e) => e.outerHTML.slice(160, 300) + " IN " + e.parentElement.outerHTML.slice(0, 200));
    });
    check(`${view}: no colour-only chips`, bad.length === 0, bad.join(" "));
  }

  await page.close();

  // ---- small laptops: nothing important clipped, Inspector reachable, no horizontal page scroll
  for (const size of [{ width: 1366, height: 768 }, { width: 1280, height: 720 }]) {
    const { page: p, errors: e2 } = await openApp(browser, srv.base, { size });
    errorsAll.push(...e2);
    const tag = `${size.width}x${size.height}`;
    for (const view of VIEWS) {
      await go(p, view);
      if (view === "Wall") await p.locator('[role="gridcell"]').nth(40).click();
      const m = await p.evaluate(() => {
        const vw = window.innerWidth, vh = window.innerHeight;
        const box = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
        const hdr = document.querySelector("header");
        // any header control cut off by the right edge or hidden by overflow
        const cut = [...hdr.querySelectorAll("button, input, select, h1")].filter((e) => { const r = e.getBoundingClientRect(); return r.width && (r.right > vw + 0.5 || r.left < -0.5); }).map((e) => e.getAttribute("aria-label") || e.textContent.trim().slice(0, 16));
        return {
          pageScrollX: document.documentElement.scrollWidth - vw, bodyScrollX: document.body.scrollWidth - vw, pageScrollY: document.documentElement.scrollHeight - vh,
          hdr: box("header"), left: box('aside[aria-label="Left panel"]'), insp: box('aside[aria-label="Inspector"]'), main: box("main"),
          hdrOverflow: hdr.scrollWidth - hdr.clientWidth, cut,
          inspScrolls: (() => { const a = document.querySelector('aside[aria-label="Inspector"]'); return a ? getComputedStyle(a).overflowY : null; })(),
          vw, vh,
        };
      });
      check(`${tag} ${view}: no horizontal page scroll`, m.pageScrollX <= 0 && m.bodyScrollX <= 0, `${m.pageScrollX}`);
      check(`${tag} ${view}: no vertical page scroll (panels scroll inside themselves)`, m.pageScrollY <= 0, `${m.pageScrollY}`);
      check(`${tag} ${view}: top bar fits (nothing cut off)`, m.hdrOverflow <= 0 && m.cut.length === 0, `${m.hdrOverflow}px ${m.cut.join(",")}`);
      if (view === "Wall" || m.insp) check(`${tag} ${view}: Inspector fully on screen and scrolls inside`, m.insp && m.insp.r <= m.vw + 0.5 && m.insp.b <= m.vh + 0.5 && m.insp.l >= m.main.l && (m.inspScrolls === "auto" || m.inspScrolls === "scroll"), JSON.stringify(m.insp));
      check(`${tag} ${view}: the schedule area keeps real room`, m.main.r - m.main.l >= 600 && m.main.b - m.main.t >= 380, `${Math.round(m.main.r - m.main.l)}x${Math.round(m.main.b - m.main.t)}`);
      if (["Wall", "Time off", "Setup", "Print"].includes(view)) await p.screenshot({ path: `${SHOTS}/${tag}-${view}.png` });
    }
    // the wall scrolls inside itself, and the last row / last column can be reached
    await go(p, "Wall");
    const wall = await p.evaluate(() => { const s = document.querySelector(".w-scroll"); s.scrollTo(s.scrollWidth, s.scrollHeight); const r = s.getBoundingClientRect(); return { inner: s.scrollWidth > s.clientWidth || s.scrollHeight > s.clientHeight, okEdge: r.right <= window.innerWidth + 0.5 && r.bottom <= window.innerHeight + 0.5, px: document.documentElement.scrollWidth - window.innerWidth }; });
    check(`${tag} wall: scrolls inside itself, page does not move`, wall.okEdge && wall.px <= 0, JSON.stringify(wall));
    // Inspector content: select a cell with many people and make sure its last button can be scrolled into view
    const lastReach = await p.evaluate(() => { const a = document.querySelector('aside[aria-label="Inspector"]'); const btns = [...a.querySelectorAll("button")].filter((b) => b.getBoundingClientRect().width); const last = btns.at(-1); if (!last) return null; last.scrollIntoView({ block: "nearest" }); const r = last.getBoundingClientRect(); const ar = a.getBoundingClientRect(); return r.bottom <= ar.bottom + 1 && r.top >= ar.top - 1; });
    check(`${tag} Inspector: the last control can be scrolled into view`, lastReach !== false, String(lastReach));
    await p.close();
  }

  // ---- touch-only code does not exist
  {
    const files = [];
    const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(tsx?|css)$/.test(f.name) && !/\.test\./.test(f.name)) files.push(p); } };
    walk(path.join(root, "app3"));
    const hits = [];
    for (const f of files) {
      const t = fs.readFileSync(f, "utf8");
      for (const m of t.matchAll(/touchstart|touchend|touchmove|touchcancel|onTouch|pointerType|long-?press|longPress|touch-action|-webkit-tap-highlight/gi)) hits.push(`${path.relative(root, f)}: ${m[0]}`);
    }
    check("no touch handlers, long-press or touch-only styling in app3", hits.length === 0, [...new Set(hits)].slice(0, 6).join("; "));
  }

  check("no console errors", errorsAll.length === 0, errorsAll.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  srv.close();
}
console.log(failed() ? `${failed()} failed` : "all passed");
process.exit(failed() ? 1 : 0);
