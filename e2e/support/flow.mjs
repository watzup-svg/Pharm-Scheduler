// Shared helpers for the scripted-flow suites (v3-month-in-the-life, v3-races). Not a test itself (lives in support/ so scripts/v3-e2e.mjs does not run it).
// Everything here reads the app only through its test hooks (window.__v3, window.__persist) and judges it with the DOMAIN, imported from source:
// integrity, state hash, a replay of the journal, and the numbers the screen should be showing.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { api, applyScratch, checkIntegrity, evaluate, importV2, stateHash } from "../../domain/src/index.ts";
import { applyEvents } from "../../domain/src/changeset.ts";

export const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = (f) => JSON.parse(fs.readFileSync(path.join(root, "fixtures", f), "utf8"));

/** The practice month as the importer builds it: the starting point every journal in these runs replays from. */
export function practiceBase() {
  return importV2([json("demo-v2.json")], { driveTable: json("drive-table.json").pairs }).world;
}

/** The fixed clock every flow runs under: 6 Oct 2026, 03:30 in Los Angeles. */
export const NOW = "2026-10-06T10:30:00Z";

/** A picker backed by real OPFS handles (as in v3-persist): Save, Save as and Open work without a native dialog. */
export const PICKER_SHIM = `
  window.__nextOpen = null;
  window.showSaveFilePicker = async (o) => (await navigator.storage.getDirectory()).getFileHandle(o?.suggestedName || 'x.sqlite', { create: true });
  window.showOpenFilePicker = async () => [await (await navigator.storage.getDirectory()).getFileHandle(window.__nextOpen)];
`;

/** A browser context with the fixed clock, the picker shim and reduced motion. */
export async function flowContext(browser, { viewport = { width: 1366, height: 800 }, shim = true, extra = {} } = {}) {
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce", acceptDownloads: true, ...extra });
  await ctx.clock.setFixedTime(NOW);
  if (shim) await ctx.addInitScript(PICKER_SHIM);
  return ctx;
}

/** Console and page errors, collected for the life of a page. */
export function watchErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  return errors;
}

/** The live world as plain data (state, journal, session). null when none is open. */
export function readWorld(page) {
  return page.evaluate(() => {
    const a = window.__v3.app.getState();
    const w = a.world;
    return w ? { state: w.state, journal: w.journal, session: w.session, ui: { view: a.view, asOf: a.asOf, window: a.window, axis: a.axis, busy: a.busy, notice: a.notice, fileName: a.fileName } } : null;
  });
}

/**
 * What the domain says about a world: fatal integrity problems, the state hash, and whether replaying the journal's events from `base`
 * reproduces that hash (a lost, duplicated or reordered change set would break this). Change set ids and seqs must be unique and increasing.
 */
export function judge(w, base) {
  const problems = [];
  const issues = checkIntegrity(w.state, w.journal);
  for (const i of issues) problems.push(`integrity ${i.table}/${i.key}: ${i.problem}`);
  const hash = stateHash(w.state);
  let replayHash = null;
  if (base) {
    const st = structuredClone(base.state);
    for (const cs of w.journal.changeSets) applyEvents(st, cs.events);
    replayHash = stateHash(st);
    if (replayHash !== hash) problems.push(`journal replay ${replayHash.slice(0, 8)} differs from the state ${hash.slice(0, 8)}`);
  }
  const ids = w.journal.changeSets.map((c) => c.id);
  if (new Set(ids).size !== ids.length) problems.push(`duplicate change set ids: ${ids.filter((x, i) => ids.indexOf(x) !== i).join(",")}`);
  const seqs = w.journal.changeSets.map((c) => c.seq);
  if (seqs.some((s, i) => i > 0 && s <= seqs[i - 1])) problems.push(`change set seq not increasing: ${seqs.join(",")}`);
  const open = w.session.proposal ? 1 : 0;
  return { hash, replayHash, problems, issues: issues.length, proposals: open, changeSets: ids.length };
}

/** The numbers the screen must show, worked out from the world with the domain (not with the app's own derive code). */
export function expectedCounts(w) {
  const asOf = w.ui.asOf;
  const win = w.ui.window;
  const sc = w.session.scenario;
  let viewState = w.state;
  let scenario = false;
  if (sc && !sc.parked) {
    const s = applyScratch(w.state, sc.edits);
    if (!("refused" in s)) { viewState = s; scenario = true; }
  }
  const ev = evaluate(viewState, asOf, { range: win, ...(scenario ? { includeRequested: true } : {}) });
  let open = 0;
  for (const c of Object.values(ev.cells)) if (c.date >= asOf && c.date >= win.from && c.date <= win.to) open += c.open;
  const waiting = Object.values(w.state.unavailability).filter((u) => u.status === "Requested" && u.last >= asOf).length;
  const entries = api.toTell({ state: w.state, journal: w.journal, session: w.session }, asOf);
  return { open, waiting, toTellEntries: entries.length, toTellPeople: new Set(entries.map((e) => e.pharmacistId)).size, changedSincePosting: api.changedSincePosting({ state: w.state, journal: w.journal, session: w.session }).length };
}

/** What the screen is showing right now: the "need cover" tile, the Time off badge, the To tell list (when it is open). null = not on screen. */
export function readVisible(page) {
  return page.evaluate(() => {
    const num = (s) => { const m = /(\d+)/.exec(s ?? ""); return m ? Number(m[1]) : null; };
    const out = { open: null, waiting: 0, toTellEntries: null, toTellPeople: null, view: window.__v3.app.getState().view };
    const hero = document.querySelector("section.hero-band");
    if (hero && /summary/.test(hero.getAttribute("aria-label") ?? "") && (out.view === "wall" || out.view === "plan")) {
      for (const el of hero.querySelectorAll("button, span")) {
        const t = (el.textContent ?? "").replace(/\s+/g, " ").trim();
        if (/^\d+\s*need cover$/.test(t)) { out.open = num(t); break; }
      }
    }
    const badge = document.querySelector('header nav[aria-label="Screens"] [aria-label$=" waiting"]');
    if (badge) out.waiting = num(badge.getAttribute("aria-label"));
    const panel = document.querySelector('aside[aria-label="Left panel"]');
    const tab = panel?.querySelector('[role="tab"][aria-selected="true"]')?.textContent;
    if (panel && tab === "To tell") {
      const groups = [...panel.querySelectorAll('li[aria-label^="To tell:"]')];
      out.toTellPeople = groups.length;
      out.toTellEntries = groups.reduce((n, g) => n + g.querySelectorAll("ul li").length, 0);
    }
    return out;
  });
}
