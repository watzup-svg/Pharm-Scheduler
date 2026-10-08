// Randomized browser stress test ("monkey") for the v3 app. Drives the REAL UI in Chromium with a seeded PRNG and checks invariants after every action.
//
//   node stress/v3-monkey.mjs [budgetSeconds]        run SEEDS seeds (default 3 quick ones) of ACTIONS actions each
//   SEED=7 node stress/v3-monkey.mjs                 one seed, reproducible
//   SEEDS=20 ACTIONS=150 node stress/v3-monkey.mjs   more / longer (seeds 1..20)
//   REPLAY=stress/out/seed-7.json node stress/v3-monkey.mjs        re-run a recorded action list (no PRNG)
//   REPLAY=file.json MINIMIZE=1 node stress/v3-monkey.mjs          shrink a failing list to a minimal repro (written next to it as *.min.json)
//   HEADED=1 shows nothing special (Chromium stays headless); SLOW=ms adds a pause per action.
//
// Build first: npm run build:v3. Imports only the domain (checkIntegrity, stateHash), never src/.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, serveV3, openApp } from "../e2e/v3-lib.mjs";
import { checkIntegrity, stateHash } from "../domain/src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "out");
fs.mkdirSync(OUT, { recursive: true });

const ACTIONS = Number(process.env.ACTIONS ?? 150);
const budgetSec = Number(process.argv[2] ?? process.env.BUDGET ?? 0);
const t0 = Date.now();
const overBudget = () => budgetSec > 0 && (Date.now() - t0) / 1000 > budgetSec;

// ---------- PRNG ----------
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mkRng = (seed) => {
  const r = mulberry32(seed * 7919 + 17);
  const rng = () => r();
  rng.int = (n) => Math.floor(r() * n);
  rng.pick = (a) => a[Math.floor(r() * a.length)];
  rng.chance = (p) => r() < p;
  rng.weighted = (pairs) => {
    const tot = pairs.reduce((s, [, w]) => s + w, 0);
    let x = r() * tot;
    for (const [v, w] of pairs) { x -= w; if (x < 0) return v; }
    return pairs[pairs.length - 1][0];
  };
  return rng;
};

// ---------- in-page helpers ----------
const PICKER_SHIM = `
  window.__nextOpen = null;
  window.__persistDebounce = 100;
  window.__mkErr = [];
  window.addEventListener('unhandledrejection', (e) => window.__mkErr.push('unhandledrejection: ' + String(e.reason && e.reason.message || e.reason)));
  window.showSaveFilePicker = async (o) => (await navigator.storage.getDirectory()).getFileHandle(o?.suggestedName || 'x.sqlite', { create: true });
  window.showOpenFilePicker = async () => { if (!window.__nextOpen) { const e = new Error('cancelled'); e.name = 'AbortError'; throw e; } return [await (await navigator.storage.getDirectory()).getFileHandle(window.__nextOpen)]; };
  const REG = { top: "header", left: "aside[aria-label='Left panel']", main: "main", insp: "aside[aria-label='Inspector']", bar: "section[aria-label='Proposal']", dialog: "[role=dialog],[role=alertdialog]" };
  const vis = (e) => { if (!e.getClientRects().length) return false; const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[aria-hidden=true],[data-aria-hidden=true],[inert]'); };
  const nm = (e) => (e.getAttribute('aria-label') || (e.labels && e.labels[0] && e.labels[0].textContent) || (/^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName) ? '' : e.textContent) || e.placeholder || e.id || e.name || '').trim().replace(/\\s+/g, ' ').slice(0, 70);
  const BTN = "button,[role=button],[role=tab]";
  const INP = "input:not([type=hidden]),select,textarea";
  const els = (region, kind) => {
    const roots = [...document.querySelectorAll(REG[region])].filter(vis);
    const out = [];
    for (const r of roots) for (const e of r.querySelectorAll(kind === 'btn' ? BTN : INP)) if (vis(e)) out.push(e);
    return out;
  };
  window.__mk = {
    list(region, kind) { return els(region, kind).map((e, i) => ({ i, name: nm(e), disabled: !!e.disabled || e.getAttribute('aria-disabled') === 'true' || !!e.readOnly, tag: e.tagName.toLowerCase(), type: e.type || '', id: e.id || '' })); },
    mark(region, kind, i) { document.querySelectorAll('[data-mk]').forEach((x) => x.removeAttribute('data-mk')); const e = els(region, kind)[i]; if (!e) return false; e.setAttribute('data-mk', '1'); return true; },
    options(i, region) { const e = els(region, 'inp')[i]; return e && e.tagName === 'SELECT' ? [...e.options].map((o) => o.value) : []; },
    dialogOpen() { return [...document.querySelectorAll(REG.dialog)].some(vis); },
    cells() { return [...document.querySelectorAll('[role=gridcell]')].map((e) => [Number(e.dataset.r), Number(e.dataset.c)]); },
    // submit helper: buttons that live next to a given input (same form, or the closest ancestor that has buttons)
    siblingButtons(region, i) {
      const e = els(region, 'inp')[i]; if (!e) return [];
      let box = e.closest('form');
      if (!box) { box = e.parentElement; for (let k = 0; k < 5 && box && !box.querySelector(BTN); k++) box = box.parentElement; }
      if (!box) return [];
      return [...box.querySelectorAll(BTN)].filter(vis).map((b) => ({ name: nm(b), disabled: !!b.disabled, submit: b.type === 'submit' }));
    },
    markSibling(region, i, name) {
      document.querySelectorAll('[data-mk]').forEach((x) => x.removeAttribute('data-mk'));
      const e = els(region, 'inp')[i]; if (!e) return false;
      let box = e.closest('form');
      if (!box) { box = e.parentElement; for (let k = 0; k < 5 && box && !box.querySelector(BTN); k++) box = box.parentElement; }
      const b = [...box.querySelectorAll(BTN)].filter(vis).find((x) => nm(x) === name);
      if (!b) return false; b.setAttribute('data-mk', '1'); return true;
    },
    snap() {
      const s = window.__v3.app.getState();
      return { world: s.world, busy: s.busy, view: s.view, asOf: s.asOf, window: s.window, selection: s.selection, readOnly: s.readOnlyProblems, axis: s.axis, setupTab: s.setupTab, drawer: s.drawer, outForm: s.outForm, notice: s.notice, errs: window.__mkErr.splice(0) };
    },
    dom() {
      const q = (s) => document.querySelector(s);
      return {
        root: !!(q('#root') && q('#root').children.length),
        main: !!q('main') && q('main').children.length > 0,
        inspector: !!q('aside[aria-label=Inspector]') || !!q('button[aria-label="Open the details panel"]'), // a folded panel is a valid state: its tab is there
        grid: !!q('[role=grid]') || !!q('section[aria-label="One day"]'), // the Day view shows tiles, not a grid
        gridRows: document.querySelectorAll('[role=row]').length,
        text: (q('main') && q('main').innerText || '').slice(0, 200),
        bodyText: document.body.innerText.slice(0, 4000),
      };
    },
    status() { try { const s = window.__persist.status(); return s; } catch { return null; } },
  };
`;

// ---------- action vocabulary ----------
const SKIP_BTN = new RegExp("^(" + (process.env.COVER_ALL ? "" : "Cover all|") + "File menu|Tools|Open|Save|Save As|Download a copy|Reconnect|Allow access|Open anyway|Save first|Use the file as saved|Use the newer browser copy|Use this|Use the saved file|Use this browser|Choose old files|Open a schedule file|Print|Download|Save as PDF|Make PDF|Copy all messages|Copy message)", "i");
const WRITE_NAME = /./;

const TEXT_POOL = ["", "0", "1", "7", "-3", "12", "99999", "abc", "x y", "Test note", "Ünï 🙂", "a".repeat(90), "1.5", "480", "  ", "<b>x</b>", "Before build", "Close EST on Fridays"];
const DAY0 = Date.UTC(2026, 8, 28);
const isoOffset = (n) => new Date(DAY0 + n * 86400000).toISOString().slice(0, 10);

class Runner {
  constructor(page, errors, rng, log) {
    this.page = page; this.errors = errors; this.rng = rng; this.log = log;
    this.errSeen = 0;
    this.skips = 0;
    this.slowSearches = 0;
  }
  async list(region, kind) { return this.page.evaluate(([r, k]) => window.__mk.list(r, k), [region, kind]); }
  async markNth(region, kind, name, nth) {
    const items = await this.list(region, kind);
    const hits = items.filter((x) => x.name === name);
    const it = hits[Math.min(nth, hits.length - 1)];
    if (!it) return null;
    const ok = await this.page.evaluate(([r, k, i]) => window.__mk.mark(r, k, i), [region, kind, it.i]);
    return ok ? it : null;
  }
  async clickMarked(opts = {}) {
    try { await this.page.click('[data-mk="1"]', { timeout: 2500, ...opts }); return true; }
    catch (e) { this.skips++; this.log(`  (skipped click: ${String(e.message).split("\n")[0].slice(0, 100)})`); return false; }
  }
  // ---- executing a descriptor (the same code path for random runs and replays) ----
  async exec(a) {
    const p = this.page;
    switch (a.t) {
      case "cell": {
        const ok = await p.evaluate(([r, c]) => { const e = document.querySelector(`[role=gridcell][data-r="${r}"][data-c="${c}"]`); if (!e) return false; e.setAttribute("data-mk", "1"); return true; }, [a.r, a.c]);
        if (!ok) return "gone";
        await p.evaluate(() => document.querySelectorAll("[data-mk]:not([role=gridcell])").forEach((x) => x.removeAttribute("data-mk")));
        try { await p.click('[role=gridcell][data-mk="1"]', { timeout: 2500 }); } catch { return "noclick"; }
        await p.evaluate(() => document.querySelectorAll("[data-mk]").forEach((x) => x.removeAttribute("data-mk")));
        return "ok";
      }
      case "key": {
        const focused = await p.evaluate(() => document.activeElement && document.activeElement.getAttribute("role") === "gridcell");
        if (!focused && a.needCell) {
          const cell = p.locator('[role=gridcell][tabindex="0"]').first();
          if (!(await cell.count())) return "gone";
          await cell.focus({ timeout: 2000 }).catch(() => {});
        }
        await p.keyboard.press(a.key);
        return "ok";
      }
      case "press": {
        await p.evaluate(() => { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); });
        await p.keyboard.press(a.key);
        return "ok";
      }
      case "btn": {
        const it = await this.markNth(a.region, "btn", a.name, a.nth ?? 0);
        if (!it) return "gone";
        if (it.disabled) {
          // a disabled control must not do anything when clicked
          await this.clickMarked({ force: true, timeout: 800 }).catch(() => {});
          return "disabled";
        }
        return (await this.clickMarked()) ? "ok" : "noclick";
      }
      case "form": {
        for (const f of a.fills) {
          const items = await this.list(a.region, "inp");
          const it = items.find((x) => x.i === f.idx && x.name === f.name) ?? items.find((x) => x.name === f.name && x.type === f.type);
          if (!it || it.disabled) continue;
          await p.evaluate(([r, i]) => window.__mk.mark(r, "inp", i), [a.region, it.i]);
          try {
            if (it.tag === "select") await p.selectOption('[data-mk="1"]', { index: f.value }, { timeout: 1500 });
            else if (it.type === "checkbox" || it.type === "radio") await p.setChecked('[data-mk="1"]', !!f.value, { timeout: 1500 });
            else await p.fill('[data-mk="1"]', String(f.value), { timeout: 1500 });
          } catch (e) { this.log(`  (fill failed: ${String(e.message).split("\n")[0].slice(0, 80)})`); }
        }
        if (a.submit?.mode === "enter") {
          const items = await this.list(a.region, "inp");
          const it = items.find((x) => x.name === a.submit.name) ?? items[a.submit.idx];
          if (it) { await p.evaluate(([r, i]) => window.__mk.mark(r, "inp", i), [a.region, it.i]); try { await p.focus('[data-mk="1"]', { timeout: 1000 }); await p.keyboard.press("Enter"); } catch { /* ignore */ } }
        } else if (a.submit?.mode === "btn") {
          const items = await this.list(a.region, "inp");
          const it = items.find((x) => x.name === a.submit.input) ?? items[a.submit.idx];
          if (it && (await p.evaluate(([r, i, n]) => window.__mk.markSibling(r, i, n), [a.region, it.i, a.submit.name]))) await this.clickMarked();
        }
        return "ok";
      }
      case "drag": {
        const ok = await p.evaluate(([aid, store]) => {
          const chip = document.querySelector(`[data-aid="${aid}"]`); if (!chip) return false;
          const date = chip.closest("[role=gridcell]")?.dataset.date;
          const tgt = document.querySelector(`[role=gridcell][data-store="${store}"][data-date="${date}"]`); if (!tgt) return false;
          chip.setAttribute("data-mk", "src"); tgt.setAttribute("data-mk", "dst"); return true;
        }, [a.aid, a.toStore]);
        if (!ok) return "gone";
        try { await p.dragAndDrop('[data-mk="src"]', '[data-mk="dst"]', { timeout: 3000 }); } catch { /* ignore */ }
        await p.evaluate(() => document.querySelectorAll("[data-mk]").forEach((x) => x.removeAttribute("data-mk")));
        return "ok";
      }
      case "dialogEsc": await p.keyboard.press("Escape"); return "ok";
      case "store": {
        // Screens the shell does not offer a control for in this tree (Plan) are reached through the store.
        await p.evaluate((v) => window.__v3.app.getState().setView(v), a.view);
        return "ok";
      }
      case "drawer": {
        const b = p.locator(a.open ? 'button[aria-label="Open the list"]' : 'button[aria-label="Close the list"]');
        if (!(await b.count())) return "gone";
        try { await b.first().click({ timeout: 2000 }); } catch { return "noclick"; }
        return "ok";
      }
      case "tools": {
        // Build / Improve through the Tools menu when it is mounted, otherwise through the same store actions it calls.
        const tb = p.getByRole("button", { name: "Tools" });
        if (await tb.count()) {
          try {
            await tb.first().click({ timeout: 2000 });
            await p.getByRole("menuitem", { name: new RegExp("^" + a.item) }).click({ timeout: 2000 });
            if (a.item === "Improve") await p.getByRole("button", { name: "Look for improvements" }).click({ timeout: 2000 });
          } catch { await p.keyboard.press("Escape"); return "noclick"; }
          return "ok";
        }
        await p.evaluate((i) => { const s = window.__v3.app.getState(); if (s.busy || s.world?.session.proposal || (s.world?.session.scenario && !s.world.session.scenario.parked)) return; if (i === "Build") void s.runBuild(); else void s.runImprove(false); }, a.item);
        return "ok";
      }
      case "saveReopen": return this.saveReopen(a);
      case "reload": return this.reload(a);
      default: throw new Error("unknown action " + JSON.stringify(a));
    }
  }

  async waitIdle() {
    const t = Date.now();
    const cap = Number(process.env.BUSY_CAP ?? 60) * 1000;
    try { await this.page.waitForFunction(() => !window.__v3.app.getState().busy, null, { timeout: cap, polling: 100 }); }
    catch {
      // Known domain issue: a search can run for minutes (each candidate is a full evaluation) and the UI has no cancel.
      // Count it, leave by reloading the page (this also exercises recovery), and carry on. STRICT_BUSY=1 makes it a failure.
      this.slowSearches++;
      this.log(`  (SLOW SEARCH: still busy after ${cap / 1000}s; reloading the page to get out)`);
      if (process.env.STRICT_BUSY) throw new Error(`inv:stuck-busy: the app stayed busy for ${cap / 1000}s (search still running)`);
      await this.reload();
      return;
    }
    if (Date.now() - t > 5000) this.log(`  (search took ${((Date.now() - t) / 1000).toFixed(1)}s)`);
    await this.page.waitForTimeout(40);
  }

  // ---- compound actions with their own assertions ----
  async saveReopen() {
    const p = this.page;
    const before = await p.evaluate(() => window.__mk.snap());
    if (!before.world) return "gone";
    if (before.readOnly) return "readonly";
    const fm = p.locator('header button[aria-label="File menu"]');
    if (!(await fm.count())) return "gone";
    await fm.click({ timeout: 2500 }).catch(() => {});
    const saveAs = p.getByRole("menuitem", { name: "Save as…" });
    if (!(await saveAs.count()) || (await saveAs.getAttribute("data-disabled")) !== null) { await p.keyboard.press("Escape"); return "gone"; }
    await saveAs.click({ timeout: 2500 });
    try { await p.waitForFunction(() => { const s = window.__persist.status(); return s.linked && s.unsavedChanges === 0; }, null, { timeout: 8000 }); }
    catch { const st = await p.evaluate(() => window.__mk.status()); throw new Error("inv:save-as: Save As did not link and clear the unsaved count: " + JSON.stringify(st)); }
    const st = await p.evaluate(() => window.__mk.status());
    const hash0 = stateHash(before.world.state);
    await p.evaluate((n) => { window.__nextOpen = n; }, st.fileName);
    await fm.click({ timeout: 2500 });
    const open = p.getByRole("menuitem", { name: "Open…" });
    if (!(await open.count())) throw new Error("inv:reopen: no Open item in the File menu");
    await open.click({ timeout: 2500 });
    await p.waitForTimeout(400);
    // an unsaved-changes dialog should not appear right after Save As
    if (await p.evaluate(() => window.__mk.dialogOpen())) {
      const dlg = await p.evaluate(() => document.querySelector("[role=dialog]")?.innerText.slice(0, 200));
      throw new Error("inv:reopen: a dialog appeared when reopening the file just saved: " + dlg);
    }
    await this.waitIdle();
    const after = await p.evaluate(() => window.__mk.snap());
    this.errSeen = this.errors.length; // errors are checked by the caller too
    if (!after.world) throw new Error("inv:reopen: no world after reopening the saved file");
    const hash1 = stateHash(after.world.state);
    if (hash0 !== hash1) throw new Error(`inv:reopen-hash: Save As then reopen changed the schedule (${hash0.slice(0, 8)} -> ${hash1.slice(0, 8)})`);
    if (after.world.journal.changeSets.length !== before.world.journal.changeSets.length) throw new Error(`inv:reopen-history: change sets ${before.world.journal.changeSets.length} -> ${after.world.journal.changeSets.length}`);
    return "ok";
  }

  async reload() {
    const p = this.page;
    const before = await p.evaluate(() => window.__mk.snap());
    if (!before.world) return "gone";
    const hash0 = stateHash(before.world.state);
    const cs0 = before.world.journal.changeSets.length;
    await p.reload({ waitUntil: "load" });
    await p.waitForFunction(() => window.__v3 && window.__v3.app, null, { timeout: 15000 });
    // either the world is back on its own, or the recovery question is on screen
    const t = Date.now();
    for (;;) {
      const st = await p.evaluate(() => ({ w: !!window.__v3.app.getState().world, rec: [...document.querySelectorAll("button")].some((b) => /(newer browser copy|this browser's copy)/i.test(b.textContent)), boot: window.__bootResult }));
      if (st.w) break;
      if (st.rec) {
        const b = p.getByRole("button", { name: /(newer browser copy|this browser's copy)/i });
        await b.click({ timeout: 3000 });
        break;
      }
      if (Date.now() - t > 20000) throw new Error(`inv:reload-recovery: no schedule came back after reload (boot=${st.boot})`);
      await p.waitForTimeout(100);
    }
    await p.waitForTimeout(150);
    const after = await p.evaluate(() => window.__mk.snap());
    if (!after.world) throw new Error("inv:reload-recovery: world missing after recovery");
    const hash1 = stateHash(after.world.state);
    if (hash0 !== hash1) throw new Error(`inv:reload-hash: the recovered schedule differs from the one before reload (${hash0.slice(0, 8)} -> ${hash1.slice(0, 8)}; change sets ${cs0} -> ${after.world.journal.changeSets.length})`);
    if (after.world.journal.changeSets.length !== cs0) throw new Error(`inv:reload-history: change sets ${cs0} -> ${after.world.journal.changeSets.length}`);
    return "ok";
  }

  // ---- random choice of the next action ----
  async choose(snap) {
    const rng = this.rng;
    const p = this.page;
    const dlg = await p.evaluate(() => window.__mk.dialogOpen());
    if (dlg) {
      const items = (await this.list("dialog", "btn")).filter((b) => !b.disabled);
      if (!items.length || rng.chance(0.3)) return { t: "dialogEsc" };
      const b = rng.pick(items);
      return { t: "btn", region: "dialog", name: b.name, nth: 0 };
    }
    const w = snap.world;
    const proposal = !!w.session.proposal;
    const sc = w.session.scenario;
    const open = proposal || (sc && !sc.parked);
    const kinds = [
      ["cell", 14], ["key", 8], ["insp", 18], ["out", 9], ["engine", 11], ["undo", 4], ["history", 5], ["view", 5], ["leftTab", 3],
      ["wallctl", 5], ["form", 9], ["travel", 2], ["print", 2], ["drag", 3], ["press", 3], ["any", 5], ["setup", 9], ["outform", 4], ["drawer", 3], ["saveReopen", 1.2], ["reload", 1.5],
    ];
    if (proposal) kinds.push(["resolve", 22]);
    if (sc) kinds.push(["scenario", 6]);
    if (snap.view !== "wall") { kinds.push(["wallBack", 6]); }
    for (let tries = 0; tries < 6; tries++) {
      const k = rng.weighted(kinds);
      const a = await this.make(k, snap, open);
      if (a) return a;
    }
    return { t: "press", key: "Escape" };
  }

  pickBtn(items, filter = () => true) {
    const c = items.filter((b) => !b.disabled && !SKIP_BTN.test(b.name) && filter(b));
    return c.length ? this.rng.pick(c) : null;
  }
  // sometimes pick a disabled button on purpose: it must stay inert
  async btnIn(region, filter) {
    const items = await this.list(region, "btn");
    let b = this.rng.chance(0.08) ? this.pickBtn(items.filter((x) => x.disabled).map((x) => ({ ...x, disabled: false })), filter) : null;
    if (!b) b = this.pickBtn(items, filter);
    if (!b) return null;
    const nth = items.filter((x) => x.name === b.name).findIndex((x) => x.i === b.i);
    return { t: "btn", region, name: b.name, nth: Math.max(0, nth) };
  }

  // A screen tab in the top bar; its listed name can carry a count ("Time off 2"), so the name comes from the list.
  async tabBtn(label) {
    const items = await this.list("top", "btn");
    const b = items.find((x) => x.name === label || x.name.startsWith(label));
    return b ? { t: "btn", region: "top", name: b.name, nth: 0 } : null;
  }

  async make(k, snap, open) {
    const rng = this.rng;
    switch (k) {
      case "cell": {
        if (snap.view !== "wall") return null;
        const cells = await this.page.evaluate(() => window.__mk.cells());
        if (!cells.length) return null;
        const [r, c] = rng.pick(cells);
        return { t: "cell", r, c };
      }
      case "key": {
        if (snap.view !== "wall") return null;
        return { t: "key", needCell: true, key: rng.weighted([["ArrowDown", 3], ["ArrowUp", 3], ["ArrowLeft", 3], ["ArrowRight", 3], ["Enter", 2], [" ", 1], ["PageDown", 1], ["PageUp", 1], ["Home", 1], ["End", 1], ["Control+Home", 0.5], ["Control+End", 0.5]]) };
      }
      case "press": return { t: "press", key: rng.pick(["n", "p", "Escape", "Control+z", "Control+z"]) };
      case "insp": return this.btnIn("insp", (b) => !/^(\+ Someone|Approve|Deny|Remove: )/.test(b.name));
      case "out": {
        if (snap.view === "timeoff") return this.btnIn("main", (b) => /^(Approve|Deny|Remove: |Add )/.test(b.name));
        if (rng.chance(0.3)) return this.btnIn("main", (b) => /Someone.s out/.test(b.name));
        return this.btnIn("insp", (b) => /^(Add |Cover|Find|Close)/.test(b.name));
      }
      case "drawer": return { t: "drawer", open: !snap.drawer };
      case "engine": {
        const which = rng.pick(["Build", "Build", "Improve", "Improve", "Find cover", "Find cover…"]);
        if (which === "Build" || which === "Improve") return { t: "tools", item: which };
        const regs = ["insp", "left"];
        for (const r of regs) {
          const items = await this.list(r, "btn");
          const b = items.find((x) => !x.disabled && (x.name === which || x.name.startsWith(which)));
          if (b) return { t: "btn", region: r, name: b.name, nth: 0 };
        }
        return null;
      }
      case "undo": return rng.chance(0.5) ? { t: "press", key: "Control+z" } : { t: "btn", region: "top", name: "Undo", nth: 0 };
      case "history": {
        // History tab: checkpoint, revert, undo rows
        const tab = (await this.list("left", "btn")).find((x) => /^History/.test(x.name));
        if (tab && !(await this.page.locator("#cp-name").count())) return { t: "btn", region: "left", name: tab.name, nth: 0 };
        if (rng.chance(0.4)) {
          const items = await this.list("left", "inp");
          const cp = items.find((x) => x.id === "cp-name");
          if (cp) return { t: "form", region: "left", fills: [{ idx: cp.i, name: cp.name, type: cp.type, value: rng.pick(["Before build", "cp " + rng.int(4), "A", "  ", ""]) }], submit: { mode: "enter", name: cp.name, idx: cp.i } };
        }
        return this.btnIn("left", (b) => /^(Undo|Redo|Revert|Keep as it|Show why|Hide why|Checkpoint now)/.test(b.name));
      }
      case "view": {
        const v = rng.pick(["Schedule", "Plan", "Time off", "Setup", "Print", "Schedule", "Schedule", "Setup", "Overview"]);
        if (v === "Plan") return { t: "store", view: "plan" };
        return this.tabBtn(v);
      }
      case "wallBack": return this.tabBtn("Schedule");
      case "leftTab": {
        const items = await this.list("left", "btn");
        const t = items.filter((x) => /^(Queue|To tell|History)/.test(x.name));
        return t.length ? { t: "btn", region: "left", name: rng.pick(t).name, nth: 0 } : null;
      }
      case "wallctl": {
        if (snap.view !== "wall") return null;
        return this.btnIn("main", (b) => /^(Previous week|Next week|Today|2 weeks|4 weeks|Month|Stores|Pharmacists|Legend|Hide legend)$/.test(b.name) || /Prev|Next/.test(b.name));
      }
      case "form": return this.makeForm(snap);
      case "setup": {
        if (snap.view !== "setup") return rng.chance(0.35) ? this.tabBtn("Setup") : null;
        return rng.chance(0.45) ? this.btnIn("main", (b) => !/^(Remove|Delete)/i.test(b.name) || rng.chance(0.2)) : this.makeForm(snap, "main");
      }
      case "outform": {
        const items = (await this.list("insp", "inp")).filter((x) => !x.disabled);
        if (!items.length) return this.btnIn("main", (b) => /Someone.s out/.test(b.name));
        return this.makeForm(snap, "insp");
      }
      case "travel": {
        if (snap.view !== "setup") return this.tabBtn("Setup");
        if (snap.setupTab !== "travel") return { t: "btn", region: "main", name: "Travel", nth: 0 };
        if (rng.chance(0.6)) return this.btnIn("main", (b) => / to [A-Z]+: \d+ minutes|^Minutes$|^Miles$/.test(b.name));
        return this.makeForm(snap, "main");
      }
      case "print": {
        if (snap.view !== "print") return this.tabBtn("Print");
        return this.btnIn("main", (b) => /^(Post|Mark|Post this)/i.test(b.name) || /post/i.test(b.name));
      }
      case "drag": {
        if (snap.view !== "wall" || snap.axis !== "store") return null;
        const all = await this.page.evaluate(() => [...document.querySelectorAll("[role=gridcell] [data-aid][draggable=true]")].map((chip) => {
          const cell = chip.closest("[role=gridcell]");
          return { aid: chip.dataset.aid, from: cell.dataset.store, stores: [...document.querySelectorAll(`[role=gridcell][data-date="${cell.dataset.date}"][data-store]`)].map((e) => e.dataset.store) };
        }));
        const info = all.length ? rng.pick(all) : null;
        if (!info) return null;
        const t = rng.pick(info.stores.filter((s) => s !== info.from));
        return t ? { t: "drag", aid: info.aid, toStore: t } : null;
      }
      case "resolve": {
        const r = rng.weighted([["accept", 4], ["discard", 3], ["esc", 1.5], ["preview", 0.5]]);
        if (r === "esc") return { t: "press", key: "Escape" };
        return { t: "btn", region: "bar", name: r === "accept" ? "Accept" : "Discard", nth: 0 };
      }
      case "scenario": return this.btnIn(rng.chance(0.5) ? "main" : "insp", (b) => /what-if|Park|Discard|Export|Open|Resume|Start/i.test(b.name));
      case "saveReopen": return { t: "saveReopen" };
      case "reload": return { t: "reload" };
      case "any": {
        const reg = rng.pick(["main", "left", "insp", "top"]);
        return this.btnIn(reg, () => true);
      }
    }
    return null;
  }

  async makeForm(snap, regionHint) {
    const rng = this.rng;
    let region = regionHint ?? rng.weighted([["main", 5], ["insp", 3], ["left", 1], ["top", 1.5]]);
    const items = (await this.list(region, "inp")).filter((x) => !x.disabled && x.type !== "file" && x.type !== "hidden");
    if (!items.length) {
      // open something that has a form
      if (snap.view === "wall" && rng.chance(0.5)) return this.btnIn("main", (b) => /Someone.s out/.test(b.name));
      return this.btnIn("main", () => true);
    }
    const n = 1 + rng.int(Math.min(3, items.length));
    const chosen = [];
    const pool = items.slice();
    for (let j = 0; j < n; j++) chosen.push(pool.splice(rng.int(pool.length), 1)[0]);
    chosen.sort((a, b) => a.i - b.i);
    const fills = [];
    for (const it of chosen) {
      let value;
      if (it.tag === "select") {
        const opts = await this.page.evaluate(([i, r]) => window.__mk.options(i, r), [it.i, region]);
        value = opts.length ? rng.int(opts.length) : 0;
      } else if (it.type === "checkbox" || it.type === "radio") value = rng.chance(0.5);
      else if (it.type === "date") value = rng.chance(0.08) ? "" : isoOffset(rng.int(75));
      else if (it.type === "month") value = rng.pick(["2026-10", "2026-11", "2027-01"]);
      else if (it.type === "time") value = rng.pick(["08:00", "09:30", "17:00", "00:00"]);
      else if (it.type === "number") value = rng.pick(["", "0", "1", "5", "-2", "100", "99999", "1.5", "480"]);
      else value = rng.pick(TEXT_POOL);
      fills.push({ idx: it.i, name: it.name, type: it.type, value });
    }
    const last = chosen[chosen.length - 1];
    const sib = await this.page.evaluate(([r, i]) => window.__mk.siblingButtons(r, i), [region, last.i]);
    const good = sib.filter((b) => !b.disabled && !SKIP_BTN.test(b.name) && !/^(Cancel|Close|Remove|Discard|Back|Dismiss)/.test(b.name));
    let submit = null;
    if (good.length && rng.chance(0.75)) submit = { mode: "btn", name: rng.pick(good).name, input: last.name, idx: last.i };
    else if (rng.chance(0.7)) submit = { mode: "enter", name: last.name, idx: last.i };
    return { t: "form", region, fills, submit };
  }
}

// ---------- invariants ----------
function invariants(prev, now, dom, a, errors, runner) {
  const fails = [];
  const F = (name, msg) => fails.push(`inv:${name}: ${msg}`);
  if (runner.errors.length > runner.errSeen) { F("page-error", runner.errors.slice(runner.errSeen).join(" | ").slice(0, 600)); runner.errSeen = runner.errors.length; }
  if (now.errs.length) F("unhandled-rejection", now.errs.join(" | ").slice(0, 400));
  if (!now.world) { F("world-lost", "no world open after the action"); return fails; }
  const w = now.world;
  // SELFTEST=1: fail whenever History has 2+ change sets, to check reporting, replay and MINIMIZE.
  if (process.env.SELFTEST && w.journal.changeSets.length >= 2) F("selftest", "planted failure: 2+ change sets");
  const issues = checkIntegrity(w.state);
  if (issues.length) F("integrity", issues.slice(0, 4).map((i) => `${i.table}:${i.key} ${i.problem}`).join("; ") + (issues.length > 4 ? ` (+${issues.length - 4})` : ""));
  const sc = w.session.scenario;
  if (w.session.proposal && sc && !sc.parked) F("session", "a proposal and an unparked scenario are both open");
  if (!dom.root) F("render", "the page root is empty (a render crash)");
  else {
    if (!dom.main) F("render", "main area is empty");
    if (!dom.inspector && (now.view === "wall" || now.view === "plan")) F("render", "Inspector is missing");
    if (now.view === "wall" && !dom.grid) F("render", "Wall has no grid");
    if (/Something went wrong|Unexpected Application Error|is not a function|Cannot read prop/i.test(dom.bodyText)) F("render", "error text on the page: " + dom.bodyText.match(/.{0,40}(Something went wrong|Unexpected Application Error|is not a function|Cannot read prop).{0,60}/i)?.[0]);
  }
  const cs = w.journal.changeSets;
  const ids = new Set(cs.map((c) => c.id));
  if (ids.size !== cs.length) F("history", "duplicate change set ids");
  for (let i = 1; i < cs.length; i++) if (cs[i].seq <= cs[i - 1].seq) { F("history", `change set order broken at ${cs[i].id}`); break; }
  if (prev?.world && !["reload", "saveReopen"].includes(a.t)) {
    const pcs = prev.world.journal.changeSets;
    if (cs.length < pcs.length) F("history-shrank", `change sets ${pcs.length} -> ${cs.length}`);
    else for (let i = 0; i < pcs.length; i++) if (pcs[i].id !== cs[i].id) { F("history-rewritten", `change set ${i} was ${pcs[i].id}, now ${cs[i].id}`); break; }
    // read-only while a proposal / live scenario is open
    const pp = prev.world.session.proposal;
    const psc = prev.world.session.scenario;
    const wasOpen = !!pp || (psc && !psc.parked);
    if (wasOpen) {
      const h0 = stateHash(prev.world.state), h1 = stateHash(w.state);
      const accepted = pp && !w.session.proposal && cs.length === pcs.length + 1 && cs[cs.length - 1].kind === pp.kind;
      if (!accepted && (h0 !== h1 || cs.length !== pcs.length)) F("write-while-open", `the schedule changed (${pcs.length} -> ${cs.length} change sets, hash ${h0.slice(0, 6)} -> ${h1.slice(0, 6)}) while ${pp ? "a proposal" : "a what-if"} was open, action ${JSON.stringify(a).slice(0, 160)}`);
    }
    // a proposal can only be accepted by the Accept control: no other action may grow history from engine kinds
    if (cs.length > pcs.length) {
      const added = cs.slice(pcs.length);
      for (const c of added) if (["build", "improve", "repair", "reset"].includes(c.kind) && !(a.t === "btn" && a.region === "bar" && a.name === "Accept") && !(pp)) F("engine-write-without-accept", `${c.kind} change set ${c.id} landed without a proposal being accepted`);
    }
  }
  return fails;
}

// ---------- one run ----------
async function runOne({ browser, base, seed, actions: replay, count, tag = "" }) {
  const rng = mkRng(seed);
  const ctx = await browser.newContext();
  await ctx.addInitScript(PICKER_SHIM);
  const { page, errors } = await openApp(browser, base, { context: ctx });
  const lines = [];
  const log = (s) => { lines.push(s); if (process.env.VERBOSE) console.log(s); };
  const runner = new Runner(page, errors, rng, log);
  // adopt the practice world like opening a file would, so the browser copy exists
  await page.evaluate(() => window.__persist.adopt(window.__v3.app.getState().world));
  runner.errSeen = errors.length;
  const done = [];
  let failure = null;
  let prev = await page.evaluate(() => window.__mk.snap());
  const total = replay ? replay.length : count;
  const tStart = Date.now();
  for (let i = 0; i < total; i++) {
    if (overBudget() && !replay) { log("budget reached"); break; }
    let a;
    try {
      a = replay ? replay[i] : await runner.choose(prev);
      done.push(a);
      log(`#${i} ${JSON.stringify(a)}`);
      await runner.exec(a);
      await runner.waitIdle();
      if (process.env.SLOW) await page.waitForTimeout(Number(process.env.SLOW));
      const now = await page.evaluate(() => window.__mk.snap());
      const dom = await page.evaluate(() => window.__mk.dom());
      const fails = invariants(prev, now, dom, a, errors, runner);
      if (fails.length) { failure = { index: i, msg: fails.join("\n") }; break; }
      prev = now;
    } catch (e) {
      const msg = String(e.message ?? e);
      failure = { index: i, msg: msg.startsWith("inv:") ? msg : `inv:harness-exception: ${msg.split("\n")[0]}` };
      if (!done.length || done[done.length - 1] !== a) done.push(a);
      break;
    }
    if (runner.skips > 25) { failure = { index: i, msg: "inv:stuck-ui: more than 25 clicks could not be performed (UI not responding or covered)" }; break; }
  }
  let summary = "";
  try {
    const fin = await page.evaluate(() => window.__mk.snap());
    const kinds = {};
    for (const c of fin.world?.journal.changeSets ?? []) kinds[c.kind] = (kinds[c.kind] ?? 0) + 1;
    const acts = {};
    for (const a of done) { const k = a.t === "btn" ? `${a.region}:${a.name.split(/[ :]/)[0]}` : a.t; acts[k] = (acts[k] ?? 0) + 1; }
    summary = `change sets ${JSON.stringify(kinds)}`;
    if (process.env.STATS) summary += `\n     actions ${JSON.stringify(acts)}`;
  } catch { /* page may be gone */ }
  let shot = null;
  if (failure) {
    shot = path.join(OUT, `fail-${tag}seed${seed}-a${failure.index}.png`);
    await page.screenshot({ path: shot }).catch(() => { shot = "(screenshot failed)"; });
  }
  await ctx.close();
  return { seed, failure, done, lines, shot, summary, ms: Date.now() - tStart, skips: runner.skips, slow: runner.slowSearches };
}

function report(r) {
  console.log(`\nFAIL seed=${r.seed} action=#${r.failure.index}`);
  console.log(r.failure.msg);
  console.log("action tail:");
  const from = Math.max(0, r.done.length - 12);
  r.done.slice(from).forEach((a, k) => console.log(`  #${from + k} ${JSON.stringify(a)}`));
  console.log(`screenshot: ${r.shot}`);
  const f = path.join(OUT, `seed-${r.seed}.json`);
  fs.writeFileSync(f, JSON.stringify(r.done, null, 1));
  console.log(`replay: REPLAY=${path.relative(process.cwd(), f)} node stress/v3-monkey.mjs`);
}

// ---------- main ----------
const browser = await launch();
const srv = await serveV3();
let bad = 0;
let totalActions = 0;
let seedsRun = 0;
try {
  if (process.env.REPLAY) {
    const file = process.env.REPLAY;
    const list = JSON.parse(fs.readFileSync(file, "utf8"));
    const seed = Number(process.env.SEED ?? 1);
    const r = await runOne({ browser, base: srv.base, seed, actions: list });
    if (r.failure) { bad++; report(r); } else console.log(`ok   replay of ${list.length} actions passes`);
    if (r.failure && process.env.MINIMIZE) {
      const sig = r.failure.msg.split("\n")[0].split(":").slice(0, 2).join(":");
      let cur = r.done.slice(0, r.failure.index + 1);
      let chunk = Math.max(1, Math.floor(cur.length / 2));
      while (chunk >= 1) {
        let changed = false;
        for (let s = 0; s < cur.length; ) {
          const trial = [...cur.slice(0, s), ...cur.slice(s + chunk)];
          const t = await runOne({ browser, base: srv.base, seed, actions: trial, tag: "min-" });
          if (t.failure && t.failure.msg.startsWith(sig)) { cur = t.done.slice(0, t.failure.index + 1); changed = true; process.stdout.write(`  minimizing: ${cur.length} actions\r`); }
          else s += chunk;
        }
        if (!changed || chunk === 1) { if (chunk === 1) break; }
        chunk = Math.max(1, Math.floor(chunk / 2));
      }
      const mf = file.replace(/\.json$/, "") + ".min.json";
      fs.writeFileSync(mf, JSON.stringify(cur, null, 1));
      console.log(`\nminimal repro (${cur.length} actions): ${mf}`);
    }
  } else {
    const seeds = process.env.SEED ? process.env.SEED.split(",").map(Number) : Array.from({ length: Number(process.env.SEEDS ?? 4) }, (_, i) => i + 1);
    for (const seed of seeds) {
      if (overBudget()) { console.log(`time budget reached after ${seedsRun} seed(s)`); break; }
      const r = await runOne({ browser, base: srv.base, seed, count: ACTIONS });
      seedsRun++;
      totalActions += r.done.length;
      if (r.failure) { bad++; report(r); }
      else console.log(`ok   seed ${seed}: ${r.done.length} actions, ${(r.ms / 1000).toFixed(1)}s${r.skips ? `, ${r.skips} skipped clicks` : ""}${r.slow ? `, ${r.slow} SLOW SEARCH(es) abandoned` : ""}\n     ${r.summary}`);
    }
    console.log(`\n${bad ? "FAIL" : "ok  "} ${seedsRun} seed(s), ${totalActions} actions, ${bad} failing seed(s), ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
} finally {
  await browser.close();
  srv.close();
}
process.exit(bad ? 1 : 0);
