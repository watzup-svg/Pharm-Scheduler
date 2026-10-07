// Concurrency and re-entrancy: the things a quick or impatient hand does that a calm scripted run never does.
// Every scenario runs in its own browser context on the practice month (fixed clock) and ends with the same verdict:
//   - busy always clears (never busy forever), never two proposals open, no console errors
//   - no change set lost or duplicated: the journal replays (domain, from the practice base) to the live state hash, ids are unique
//   - the scenario's own expectations (exact change set counts, stale results dropped, the right notice, ...)
// A test knob stretches the search (window.__v3.engine.delayMs) so the race window is wide and deterministic.
// Chromium only for the file-backend and worker parts (OPFS pickers, worker hooks); other engines run the rest.
import { launch, serveV3, openApp, check, failed } from "./v3-lib.mjs";
import { evaluate, stateHash } from "../domain/src/index.ts";
import { flowContext, judge, practiceBase, readWorld, sleep } from "./support/flow.mjs";

const CHROMIUM = !process.env.BROWSER || process.env.BROWSER === "chromium";
const base = practiceBase();
const browser = await launch();
const srv = await serveV3();
const timings = [];


/** One scenario: a crash inside it is a FAIL, not the end of the run. */
async function sc(name, fn) {
  const t0 = Date.now();
  try { await fn(); } catch (e) { check(`${name}: ran to the end`, false, String(e?.message ?? e).split("\n")[0]); }
  scenarioTimes.push([name, Date.now() - t0]);
  for (const c of browser.contexts()) await c.close().catch(() => {});
}
const scenarioTimes = [];

/** A fresh context and page on the practice month. */
async function fresh() {
  const ctx = await flowContext(browser);
  const { page, errors } = await openApp(browser, srv.base, { context: ctx });
  page.on("dialog", (d) => { void d.accept(); });
  await page.waitForSelector('[role="gridcell"]');
  return { ctx, page, errors };
}
const get = (S, fn, arg) => S.page.evaluate(fn, arg);
const cs = (S) => get(S, () => window.__v3.app.getState().world.journal.changeSets.length);
const kinds = (S) => get(S, () => window.__v3.app.getState().world.journal.changeSets.map((c) => c.kind));
const notice = (S) => get(S, () => window.__v3.app.getState().notice?.text ?? "");
const delay = (S, ms) => get(S, (n) => { window.__v3.engine.delayMs = n; }, ms);
const diagCount = async (S, re) => ((await get(S, () => window.__v3.diagnostics())).match(re) ?? []).length;
const hasProposal = (S) => get(S, () => !!window.__v3.app.getState().world.session.proposal);
const header = (S) => S.page.locator("header");
const inspector = (S) => S.page.locator('aside[aria-label="Inspector"]');
const bar = (S) => S.page.getByRole("region", { name: "Proposal" });

/** One manual change (a pin), so Undo has something to undo. Set-up only. */
const seedEdit = (S) => get(S, () => { const a = window.__v3.app.getState(); const x = Object.values(a.world.state.assignments).find((y) => y.date >= a.asOf && !y.pinned); return a.commit([{ t: "update", assignmentId: x.id, patch: { pinned: true } }], "Seed change"); });

async function gaps(S) {
  const w = await readWorld(S.page);
  const ev = evaluate(w.state, w.ui.asOf, { range: w.ui.window });
  return Object.values(ev.cells).filter((c) => c.open > 0 && c.date >= w.ui.asOf).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.storeId < b.storeId ? -1 : 1));
}
const clickCell = (S, g) => S.page.locator(`[role="gridcell"][data-store="${g.storeId}"][data-date="${g.date}"]`).click();

/**
 * Set-up (not the thing under test): the practice shifts are all hand-placed, which Build never touches, so this turns 24 shifts in a two-week
 * range into engine-placed ones and books three of those people off sick. Build then has real work to propose.
 */
const buildSetup = (S) => get(S, () => {
  const a = window.__v3.app.getState();
  a.setWindow("2026-10-04", "2026-10-17");
  const xs = Object.values(a.world.state.assignments).filter((y) => y.date >= "2026-10-08" && y.date <= "2026-10-16").sort((p, q) => (p.date < q.date ? -1 : p.date > q.date ? 1 : p.id < q.id ? -1 : 1)).slice(0, 24);
  const edits = [];
  for (const x of xs) edits.push({ t: "remove", assignmentId: x.id }, { t: "place", storeId: x.storeId, pharmacistId: x.pharmacistId, date: x.date, source: "build", agreed: true });
  if (!a.commit(edits, "Set-up: engine-placed shifts")) return false;
  const seen = new Set();
  const sick = [];
  for (const x of Object.values(window.__v3.app.getState().world.state.assignments).filter((y) => y.source === "build")) {
    if (seen.has(x.pharmacistId) || sick.length >= 3) continue;
    seen.add(x.pharmacistId);
    sick.push({ t: "unavail.add", pharmacistId: x.pharmacistId, first: x.date, last: x.date, status: "Approved", type: "Sick" });
  }
  return window.__v3.app.getState().commit(sick, "Set-up: three people out sick");
});
/** Set-up: the first open day that Find cover has an option for (found with the store action, then the results are cleared). */
async function optionGap(S) {
  for (const g of (await gaps(S)).slice(0, 14)) {
    const ok = await get(S, async (gg) => { const a = window.__v3.app.getState(); await a.runRepair([gg], false); const n = window.__v3.app.getState().repairResult?.result.options.length ?? 0; window.__v3.app.setState({ repairResult: null }); return n > 0; }, g);
    if (ok) return g;
  }
  return null;
}

/** The Inspector now lists the top three first; "Search wider" sits under the full list. Open the list if needed, then click it. */
async function clickFind(S, opts) {
  const all = inspector(S).getByRole("button", { name: /^Show all \d+/ });
  if (await all.count()) await all.click();
  await inspector(S).getByRole("button", { name: "Search wider", exact: true }).click(opts);
}

/** The common verdict. `extra` lists scenario-specific problems already found. */
async function verdict(S, name, extra = []) {
  const problems = [...extra];
  const t0 = Date.now();
  const cleared = await S.page.waitForFunction(() => window.__v3.app.getState().busy === null, null, { timeout: 60000 }).then(() => true, () => false);
  if (!cleared) problems.push("busy never cleared");
  await sleep(60);
  const w = await readWorld(S.page);
  if (!w) problems.push("no schedule open");
  else {
    const j = judge(w, base);
    problems.push(...j.problems);
    if (w.session.proposal && w.session.scenario && !w.session.scenario.parked) problems.push("a proposal and an open what-if at once");
  }
  const bars = await S.page.locator('section[aria-label="Proposal"]').count();
  if (bars > 1) problems.push(`${bars} proposal bars on screen`);
  const cancels = await S.page.locator('[data-testid="cancel-engine"]').count();
  if (cancels > 0) problems.push("a Cancel button is still on screen");
  if (S.errors.length) problems.push(`console: ${S.errors.splice(0).join(" | ")}`);
  timings.push([name, Date.now() - t0]);
  check(name, problems.length === 0, problems.join("; "));
  return w;
}
const done = async (S) => { await S.ctx.close(); };

// =============================================================== 1. double and triple clicks
await sc("triple Build", async () => {
  const S = await fresh();
  // Build: three calls in the same tick, then three more clicks on the disabled menu item while it runs.
  await delay(S, 900);
  const n0 = await diagCount(S, /action: build \d{4}/g);
  await get(S, () => { const a = window.__v3.app.getState(); void a.runBuild(); void a.runBuild(); void a.runBuild(); });
  await S.page.getByRole("button", { name: "Tools" }).click();
  for (let i = 0; i < 3; i++) await S.page.getByRole("menuitem", { name: /^Build this period/ }).click({ force: true, trial: false }).catch(() => {});
  await S.page.keyboard.press("Escape");
  await delay(S, 0);
  const w = await verdict(S, "Build: three calls and three clicks while it runs start one search, one proposal", []);
  const n1 = await diagCount(S, /action: build \d{4}/g);
  check("Build: exactly one search was started", n1 - n0 === 1, `${n1 - n0}`);
  check("Build: at most one proposal, none saved", w.session.proposal !== undefined && w.journal.changeSets.length === 0);
  await done(S);
});
await sc("triple Improve", async () => {
  const S = await fresh();
  // Improve: the dialog's button clicked three times in a row (the first click closes the dialog).
  await delay(S, 600);
  await S.page.getByRole("button", { name: "Tools" }).click();
  await S.page.getByRole("menuitem", { name: /^Improve/ }).click();
  await S.page.getByRole("dialog", { name: "Improve" }).getByLabel("Include the next 14 days").check();
  await S.page.getByRole("dialog", { name: "Improve" }).getByRole("button", { name: "Look for improvements" }).click({ clickCount: 3 });
  await delay(S, 0);
  await verdict(S, "Improve: a triple click on 'Look for improvements' runs one search", []);
  check("Improve: exactly one search was started", (await diagCount(S, /action: improve \d{4}/g)) === 1, `${await diagCount(S, /action: improve \d{4}/g)}`);
  await done(S);
});
await sc("triple Find cover, double Preview and Accept", async () => {
  const S = await fresh();
  // Find cover: triple click, then a double click on Preview and on Accept.
  const g = await optionGap(S);
  if (!g) { check("a day with a cover option exists in the practice month", false); return; }
  await clickCell(S, g);
  await delay(S, 500);
  const r0 = await diagCount(S, /action: repair \d+ gap/g);
  await clickFind(S, { clickCount: 3 });
  await S.page.waitForFunction(() => { const a = window.__v3.app.getState(); return !a.busy && a.repairResult; }, null, { timeout: 60000 });
  await delay(S, 0);
  check("Find cover: a triple click starts one search", (await diagCount(S, /action: repair \d+ gap/g)) - r0 === 1, `${(await diagCount(S, /action: repair \d+ gap/g)) - r0}`);
  const preview = inspector(S).getByRole("button", { name: "Preview option 1", exact: true });
  if ((await preview.count()) === 0) { check("Find cover: the chosen day shows an option to preview", false, "none"); }
  else {
    // The proposal bar can cover this button after the first click, so the second click is sent straight to it.
    await preview.evaluate((e) => { e.click(); e.click(); });
    await sleep(100);
    check("Preview: a double click leaves one proposal", (await S.page.locator('section[aria-label="Proposal"]').count()) === 1 && (await hasProposal(S)) && (await cs(S)) === 0);
    await bar(S).getByRole("button", { name: "Accept" }).evaluate((e) => { e.click(); e.click(); });
    await sleep(150);
    const k = await kinds(S);
    await verdict(S, "Accept: a double click commits exactly one repair", k.length === 1 && k[0] === "repair" ? [] : [`change sets: ${k.join(",")}`]);
  }
  await done(S);
});

// =============================================================== 2. Build, then immediately Undo / Discard / Cancel
await sc("Build then Undo", async () => {
  const S = await fresh();
  check("seed change made", await seedEdit(S));
  await delay(S, 1500);
  await S.page.getByRole("button", { name: "Tools" }).click();
  await S.page.getByRole("menuitem", { name: /^Build this period/ }).click();
  await header(S).getByRole("button", { name: "Undo" }).click(); // immediately: Build is still out
  await delay(S, 0);
  const w = await verdict(S, "Build then Undo at once: the stale result is dropped, the undo stands", []);
  const k = await kinds(S);
  check("Undo went through once (seed, undo)", k.join() === "manual,undo", k.join());
  check("no proposal opened from the stale search", !w.session.proposal);
  check("a quiet notice says the schedule changed while Build ran", /changed while Build ran/.test(await notice(S)), await notice(S));
  await done(S);
});
await sc("Build, Undo and Esc against a proposal", async () => {
  const S = await fresh();
  check("build set-up committed", await buildSetup(S));
  await get(S, () => { void window.__v3.app.getState().runBuild(); });
  await S.page.waitForFunction(() => !window.__v3.app.getState().busy, null, { timeout: 60000 }).catch(() => {});
  if (await hasProposal(S)) {
    // A proposal is open: Undo (button and Ctrl+Z) must be refused, not applied under it.
    const before = await cs(S);
    await header(S).getByRole("button", { name: "Undo" }).click();
    await S.page.keyboard.press("Control+z");
    check("with a proposal open, Undo changes nothing and says why", (await cs(S)) === before && /proposal is open/i.test(await notice(S)), `${await cs(S)} / ${await notice(S)}`);
    await S.page.keyboard.press("Escape");
    await S.page.keyboard.press("Escape"); // the second Esc must be harmless
    check("Esc discards the proposal (the second Esc closes nothing and breaks nothing)", !(await hasProposal(S)));
    await header(S).getByRole("button", { name: "Undo" }).click();
    check("after the discard, Undo works again (set-up x2, then one undo)", (await kinds(S)).join() === "manual,manual,undo", (await kinds(S)).join());
  } else check("Build produced a proposal to race against", false, await notice(S));
  await verdict(S, "Build, Undo and Discard against an open proposal", []);
  await done(S);
});
await sc("Cancel during Build", async () => {
  const S = await fresh();
  await delay(S, 60000);
  await get(S, () => { void window.__v3.app.getState().runBuild(); });
  await S.page.getByTestId("cancel-engine").waitFor();
  await S.page.keyboard.press("Escape"); // nothing to discard yet
  check("Esc while Build runs does not stop it or break it", (await get(S, () => window.__v3.app.getState().busy)) === "Build");
  await S.page.getByTestId("cancel-engine").dblclick();
  await S.page.waitForFunction(() => window.__v3.app.getState().busy === null, null, { timeout: 5000 });
  await delay(S, 0);
  await verdict(S, "Cancel (double click) while Build runs: stopped, quiet notice, nothing saved", (await cs(S)) === 0 && /stopped/.test(await notice(S)) ? [] : [`cs ${await cs(S)}, notice ${await notice(S)}`]);
  await done(S);
});

// =============================================================== 3. an edit while a search is running
await sc("edit during Find cover", async () => {
  const S = await fresh();
  await seedEdit(S);
  await get(S, () => window.__v3.app.getState().clearNotice());
  const g = (await gaps(S))[0];
  await clickCell(S, g);
  await delay(S, 2500);
  await clickFind(S);
  await S.page.waitForFunction(() => window.__v3.app.getState().busy === "Find cover");
  // (a) a manual edit through the Time off screen is refused with a notice
  await header(S).getByRole("button", { name: /^Time off/ }).click();
  const li = S.page.getByRole("list", { name: "Waiting for an answer" }).locator("li").first();
  const id = await li.getAttribute("data-unavail");
  await li.getByRole("button", { name: /^Approve/ }).click();
  const st = await get(S, (u) => window.__v3.app.getState().world.state.unavailability[u].status, id);
  check("Approve during Find cover is refused (record unchanged, notice says wait)", st === "Requested" && /Wait for Find cover to finish/.test(await notice(S)), `${st} / ${await notice(S)}`);
  // (b) Undo is not blocked: it changes the schedule, so the search result must be dropped
  await header(S).getByRole("button", { name: "Undo" }).click();
  await delay(S, 0);
  const w = await verdict(S, "Undo during Find cover: the stale result is dropped", []);
  check("no cover options kept for a schedule that no longer exists", !(await get(S, () => window.__v3.app.getState().repairResult)));
  check("exactly seed + undo in History", (await kinds(S)).join() === "manual,undo", (await kinds(S)).join());
  check("the stale notice names Find cover", /changed while Find cover ran/.test(await notice(S)), await notice(S));
  void w;
  await done(S);
});
await sc("accept during a search", async () => {
  const S = await fresh();
  // accept a proposal while a search runs (store-level: the UI hides the buttons, the store does not): the search result must be dropped
  const g = await optionGap(S);
  await get(S, async (gg) => { const a = window.__v3.app.getState(); await a.runRepair([gg], false); }, g);
  const opened = await get(S, () => { const a = window.__v3.app.getState(); const o = a.repairResult?.result.options[0]; if (!o) return false; a.previewRepair(o); return !!window.__v3.app.getState().world.session.proposal; });
  if (!opened) check("a cover option exists to accept", false);
  else {
    await delay(S, 1200);
    const r = await get(S, async () => {
      const a = window.__v3.app.getState();
      const g2 = Object.values(a.world.state.assignments)[0];
      void g2;
      const p = a.runBuild(); // a search is running while the proposal is accepted (Tools is disabled in the UI; the store is not)
      const accepted = window.__v3.app.getState().acceptProposal();
      await p;
      const b = window.__v3.app.getState();
      return { accepted, proposal: !!b.world.session.proposal, notice: b.notice?.text ?? "", cs: b.world.journal.changeSets.length };
    });
    await delay(S, 0);
    await verdict(S, "Accept while a search runs: one change set, the search result dropped", r.accepted && r.cs === 1 && !r.proposal && /changed while Build ran/.test(r.notice) ? [] : [JSON.stringify(r)]);
  }
  await done(S);
});
await sc("searches started in one tick", async () => {
  const S = await fresh();
  // a second search while one runs, and a search while a proposal is open: ignored or refused, never two proposals
  await delay(S, 700);
  const r = await get(S, async () => {
    const a = window.__v3.app.getState();
    const p1 = a.runBuild();
    const p2 = a.runImprove(true);
    const p3 = a.runRepair([{ storeId: Object.keys(a.world.state.stores)[0], date: "2026-10-08" }], false);
    await Promise.all([p1, p2, p3]);
    return { proposal: !!window.__v3.app.getState().world.session.proposal, notice: window.__v3.app.getState().notice?.text ?? "" };
  });
  await delay(S, 0);
  await verdict(S, "Build + Improve + Find cover started in one tick: one runs, the others are ignored", []);
  check("only the first (Build) ran", (await diagCount(S, /action: (build|improve|repair)/g)) === 1, `${await diagCount(S, /action: (build|improve|repair)/g)}`);
  if (r.proposal) {
    const again = await get(S, async () => { const a = window.__v3.app.getState(); await a.runBuild(); const b = window.__v3.app.getState(); return { proposal: !!b.world.session.proposal, notice: b.notice?.text ?? "", cs: b.world.journal.changeSets.length }; });
    check("a Build started while a proposal is open leaves that one proposal alone", again.proposal && again.cs === 0, JSON.stringify(again));
    await verdict(S, "second Build with a proposal open: no second proposal", []);
  }
  await done(S);
});

// =============================================================== 4. Save, repeatedly and during Build (file backend: Chromium)
if (CHROMIUM) await sc("Save repeatedly and during Build", async () => {
  const S = await fresh();
  await header(S).getByRole("button", { name: "Save", exact: true }).click(); // first save = Save as (picker shim)
  await S.page.waitForFunction(() => window.__persist.status().linked === true, null, { timeout: 15000 });
  check("first Save links a file", (await get(S, () => window.__persist.status().unsavedChanges)) === 0);
  await seedEdit(S);
  for (let i = 0; i < 6; i++) await S.page.keyboard.press("Control+s");
  for (let i = 0; i < 3; i++) await header(S).getByRole("button", { name: "Save", exact: true }).click({ noWaitAfter: true, force: true }).catch(() => {});
  await S.page.waitForFunction(() => window.__persist.status().unsavedChanges === 0, null, { timeout: 20000 });
  const st = await get(S, () => window.__persist.status());
  check("nine saves in a row end clean, linked and without an error", st.unsavedChanges === 0 && st.linked && !st.error && st.mirrorOk, JSON.stringify(st));
  // Save while Build runs
  await delay(S, 1500);
  await get(S, () => { void window.__v3.app.getState().runBuild(); });
  await S.page.waitForFunction(() => window.__v3.app.getState().busy === "Build");
  await S.page.keyboard.press("Control+s");
  await sleep(300);
  check("Save during Build does not stop it", (await get(S, () => window.__v3.app.getState().busy)) === "Build");
  await delay(S, 0);
  await S.page.waitForFunction(() => !window.__v3.app.getState().busy, null, { timeout: 60000 });
  if (await hasProposal(S)) {
    await S.page.keyboard.press("Control+s"); // save with a proposal open: the file holds the live schedule, not the preview
    await bar(S).getByRole("button", { name: "Accept" }).click();
    await S.page.keyboard.press("Control+s");
    await S.page.keyboard.press("Control+s");
  }
  await S.page.waitForFunction(() => window.__persist.status().unsavedChanges === 0, null, { timeout: 20000 });
  const w = await verdict(S, "Save: repeated, and during Build and an open proposal", []);
  // reload: the file and the browser copy agree and hold the final state
  const h = judge(w, base).hash;
  await S.page.reload({ waitUntil: "load" });
  await S.page.waitForFunction(() => window.__bootResult !== undefined, null, { timeout: 20000 });
  await S.page.waitForSelector('[role="gridcell"], [data-overview]', { timeout: 20000 });
  const w2 = await readWorld(S.page);
  check("reload after the saves restores the same state hash and change sets", judge(w2, base).hash === h && w2.journal.changeSets.length === w.journal.changeSets.length, `${w2.journal.changeSets.length} vs ${w.journal.changeSets.length}`);
  await done(S);
}); else console.log("skip Save races: the file picker shim needs OPFS writable handles (Chromium)");

// =============================================================== 5. File menu, keyboard shortcuts and Esc, in order
await sc("menu, shortcuts and Esc order", async () => {
  const S = await fresh();
  await seedEdit(S);
  const g = await optionGap(S);
  await get(S, async (gg) => { await window.__v3.app.getState().runRepair([gg], false); const o = window.__v3.app.getState().repairResult?.result.options[0]; if (o) window.__v3.app.getState().previewRepair(o); }, g);
  if (!(await hasProposal(S))) check("a proposal to press Esc against", false);
  else {
    await S.page.getByRole("button", { name: "Open the list" }).click();
    await header(S).getByRole("button", { name: "File menu" }).click();
    await S.page.getByRole("menu").waitFor();
    await S.page.keyboard.press("Escape");
    check("Esc 1 closes the File menu and keeps the proposal and the drawer", (await S.page.getByRole("menu").count()) === 0 && (await hasProposal(S)) && (await S.page.locator('aside[aria-label="Left panel"]').count()) === 1);
    await S.page.keyboard.press("Escape");
    check("Esc 2 discards the proposal and keeps the drawer", !(await hasProposal(S)) && (await S.page.locator('aside[aria-label="Left panel"]').count()) === 1);
    await S.page.keyboard.press("Escape");
    check("Esc 3 closes the drawer", (await S.page.locator('aside[aria-label="Left panel"]').count()) === 0);
    // Ctrl+Z with the File menu open, then Esc
    await header(S).getByRole("button", { name: "File menu" }).click();
    await S.page.keyboard.press("Control+z");
    await S.page.keyboard.press("Escape");
    check("Ctrl+Z with the File menu open undoes at most the one change and leaves no menu open", (await S.page.getByRole("menu").count()) === 0 && (await cs(S)) <= 2);
    // Search palette: Esc closes it first, Ctrl+K reopens, Ctrl+S saves nothing wrong while it is open
    await S.page.keyboard.press("Control+k");
    await S.page.getByRole("dialog", { name: "Search" }).waitFor();
    await S.page.waitForFunction(() => document.activeElement?.getAttribute("aria-label")?.startsWith("Search")); // the palette focuses its box a tick after opening
    await S.page.keyboard.press("Escape");
    check("Esc closes the Search palette", (await S.page.getByRole("dialog", { name: "Search" }).count()) === 0);
    // the Improve dialog: Esc closes the dialog, not a proposal behind it
    await S.page.getByRole("button", { name: "Tools" }).click();
    await S.page.getByRole("menuitem", { name: /^Improve/ }).click();
    await S.page.getByRole("dialog", { name: "Improve" }).waitFor();
    await S.page.keyboard.press("Escape");
    await sleep(100);
    check("Esc closes the Improve dialog (and nothing else: the preview is gone already, the drawer is closed)", (await S.page.getByRole("dialog", { name: "Improve" }).count()) === 0 && (await cs(S)) <= 2);
  }
  await verdict(S, "File menu, shortcuts, Esc and dialogs in every order", []);
  await done(S);
});

// =============================================================== 6. rapid view switching during a search
await sc("view switching during Find cover", async () => {
  const S = await fresh();
  const g = (await gaps(S))[0];
  await clickCell(S, g);
  await delay(S, 1500);
  await clickFind(S);
  await S.page.waitForFunction(() => window.__v3.app.getState().busy === "Find cover");
  for (let i = 0; i < 3; i++) for (const t of ["Time off", "Print", "Setup", "Schedule"]) await header(S).getByRole("button", { name: new RegExp(`^${t}`) }).click();
  await get(S, () => { const a = window.__v3.app; a.getState().setView("plan"); a.getState().setView("wall"); });
  await delay(S, 0);
  await verdict(S, "Find cover while switching screens 12 times: result arrives, nothing breaks", []);
  check("the result is kept and no proposal opened by itself", !!(await get(S, () => window.__v3.app.getState().repairResult)) && !(await hasProposal(S)));
  await done(S);
});
await sc("Build finishing on the Print screen", async () => {
  const S = await fresh();
  await delay(S, 1200);
  await get(S, () => { void window.__v3.app.getState().runBuild(); });
  await S.page.waitForFunction(() => window.__v3.app.getState().busy === "Build");
  await header(S).getByRole("button", { name: "Print" }).click();
  await S.page.waitForSelector("[data-print-view]");
  await delay(S, 0);
  await S.page.waitForFunction(() => !window.__v3.app.getState().busy, null, { timeout: 60000 });
  const open = await hasProposal(S);
  check("Build that finishes on the Print screen shows its proposal bar there", !open || (await bar(S).count()) === 1);
  if (open) {
    await bar(S).getByRole("button", { name: "Accept" }).click();
    check("Accept from the Print screen commits one build", (await kinds(S)).join() === "build", (await kinds(S)).join());
    // the print screen's own state survives: post works right after
    await S.page.locator("[data-post]").click();
    await S.page.waitForSelector("[data-revision='1']");
  }
  await verdict(S, "Build finishing while the Print screen is open", []);
  await done(S);
});

// =============================================================== 7. window shifts during a search
await sc("window shifts during Build", async () => {
  const S = await fresh();
  check("build set-up committed", await buildSetup(S));
  await S.page.getByRole("group", { name: "How much to show" }).getByRole("button", { name: "2 weeks" }).click();
  const win0 = await get(S, () => window.__v3.app.getState().window);
  await delay(S, 1500);
  await get(S, () => { void window.__v3.app.getState().runBuild(); });
  await S.page.waitForFunction(() => window.__v3.app.getState().busy === "Build");
  for (let i = 0; i < 4; i++) await S.page.getByRole("button", { name: "Next week" }).click();
  await S.page.getByRole("button", { name: "Today" }).click();
  await S.page.getByRole("group", { name: "How much to show" }).getByRole("button", { name: "Month" }).click();
  await delay(S, 0);
  const w = await verdict(S, "Build while the window moves under it: it still answers for the range it was asked", []);
  const p = w.session.proposal;
  if (p) {
    const dates = p.edits.map((e) => (e.t === "place" ? e.date : e.assignmentId ? w.state.assignments[e.assignmentId]?.date : null)).filter(Boolean);
    check("every change in the proposal is inside the range Build was started for", dates.every((d) => d >= win0.from && d <= win0.to), `${win0.from}..${win0.to} vs ${dates.filter((d) => d < win0.from || d > win0.to).slice(0, 3)}`);
    await bar(S).getByRole("button", { name: "Accept" }).click();
    await verdict(S, "accepting it from a different window", []);
  } else check("Build gave a proposal for the 2-week range", false, await notice(S));
  await done(S);
});
await sc("window shifts during Improve", async () => {
  const S = await fresh();
  await S.page.getByRole("group", { name: "How much to show" }).getByRole("button", { name: "2 weeks" }).click();
  await delay(S, 1000);
  await get(S, () => { void window.__v3.app.getState().runImprove(true); });
  await S.page.waitForFunction(() => window.__v3.app.getState().busy === "Improve");
  await S.page.getByRole("button", { name: "Previous week" }).click();
  await S.page.getByRole("button", { name: "Previous week" }).click();
  await delay(S, 0);
  await verdict(S, "Improve while the window moves two weeks back", []);
  await done(S);
});

// =============================================================== 8. Cancel, then start again at once
await sc("Cancel then Build from the menu", async () => {
  const S = await fresh();
  await delay(S, 60000);
  await get(S, () => { void window.__v3.app.getState().runBuild(); });
  await S.page.getByTestId("cancel-engine").waitFor();
  await S.page.getByTestId("cancel-engine").click();
  await delay(S, 0);
  await S.page.getByRole("button", { name: "Tools" }).click();
  await S.page.getByRole("menuitem", { name: /^Build this period/ }).click(); // the very next click
  await S.page.waitForFunction(() => window.__v3.app.getState().busy === null, null, { timeout: 60000 });
  check("Cancel, then Build at once from the menu: the second Build ran", (await diagCount(S, /action: build \d{4}/g)) === 2, `${await diagCount(S, /action: build \d{4}/g)}`);
  await verdict(S, "Cancel then Build again", []);
  await done(S);
});
await sc("Cancel and Build in one tick", async () => {
  const S = await fresh();
  await delay(S, 60000);
  // the same tick: cancel and start again. The second request meets a store that is still busy; it must not hang or double up.
  const r = await get(S, async () => {
    const a = window.__v3.app.getState();
    const p1 = a.runBuild();
    a.cancelEngine();
    const p2 = window.__v3.app.getState().runBuild();
    await Promise.all([p1, p2]);
    return { busy: window.__v3.app.getState().busy, notice: window.__v3.app.getState().notice?.text ?? "" };
  });
  await delay(S, 0);
  await verdict(S, "Cancel and Build in the same tick: busy clears, no hang", r.busy === null ? [] : [`busy ${r.busy}`]);
  // then it works
  await get(S, async () => { await window.__v3.app.getState().runBuild(); });
  await verdict(S, "the next Build after that works", []);
  await done(S);
});

// =============================================================== 9. the worker dies mid-search
if (CHROMIUM) await sc("worker killed mid-search", async () => {
  const S = await fresh();
  const r1 = await get(S, async () => {
    const a = window.__v3.app.getState();
    const p = a.runImprove(true);
    window.__v3.killWorker();
    await p;
    const b = window.__v3.app.getState();
    return { busy: b.busy, proposal: !!b.world.session.proposal, notice: b.notice?.kind ?? "", diag: window.__v3.diagnostics() };
  });
  check("worker killed during Improve: finished, busy cleared, retried in the page", r1.busy === null && /improve: worker died, retrying in the page/.test(r1.diag), JSON.stringify({ ...r1, diag: undefined }));
  await get(S, () => { const a = window.__v3.app.getState(); if (a.world.session.proposal) a.discardProposal(); });
  const g = (await gaps(S))[0];
  const r2 = await get(S, async (gg) => {
    const a = window.__v3.app.getState();
    const p = a.runRepair([gg], false);
    window.__v3.killWorker();
    await p;
    const b = window.__v3.app.getState();
    return { busy: b.busy, result: !!b.repairResult, diag: window.__v3.diagnostics() };
  }, g);
  check("worker killed during Find cover: an answer arrives, busy cleared", r2.busy === null && r2.result && /repair: worker died, retrying in the page/.test(r2.diag), JSON.stringify({ ...r2, diag: undefined }));
  // through the UI: click Find cover and kill the worker while the search is out
  await get(S, () => window.__v3.app.setState({ repairResult: null }));
  await clickCell(S, g);
  await clickFind(S);
  await get(S, () => window.__v3.killWorker());
  await S.page.waitForFunction(() => { const a = window.__v3.app.getState(); return !a.busy && (a.repairResult || a.notice); }, null, { timeout: 60000 });
  // three deaths in a row: the engine keeps working (in the page when the worker cannot be trusted)
  for (let i = 0; i < 4; i++) {
    const ok = await get(S, async () => { const a = window.__v3.app.getState(); const p = a.runBuild(); window.__v3.killWorker(); await p; const b = window.__v3.app.getState(); const had = !!b.world.session.proposal; if (had) b.discardProposal(); return { busy: window.__v3.app.getState().busy, notice: b.notice?.kind ?? "" }; });
    if (ok.busy !== null || ok.notice === "error") check(`kill ${i + 1}: busy clears and no error notice`, false, JSON.stringify(ok));
  }
  await verdict(S, "worker killed during Improve, Find cover (API and click) and four Builds in a row", []);
  await done(S);
}); else console.log("skip worker kill: the test hook is exercised in Chromium only");

// =============================================================== 10. opening a second file while saving
if (CHROMIUM) await sc("open while saving", async () => {
  const S = await fresh();
  await header(S).getByRole("button", { name: "Save", exact: true }).click();
  await S.page.waitForFunction(() => window.__persist.status().linked === true, null, { timeout: 15000 });
  const name = await get(S, () => window.__persist.status().fileName);
  await get(S, (n) => { window.__nextOpen = n; }, name);
  await seedEdit(S);
  const h0 = judge(await readWorld(S.page), base).hash;
  // Ctrl+S, then File > Open… in the same breath
  await S.page.keyboard.press("Control+s");
  await header(S).getByRole("button", { name: "File menu" }).click();
  await S.page.getByRole("menuitem", { name: "Open…" }).click();
  await sleep(400);
  const dlg = S.page.getByRole("dialog", { name: /not in a file/ });
  if (await dlg.count()) await dlg.getByRole("button", { name: "Cancel" }).click(); // the guard stopped it: keep working
  await S.page.waitForFunction(() => window.__persist.status().unsavedChanges === 0 || document.querySelector('[role="dialog"]'), null, { timeout: 15000 }).catch(() => {});
  const w = await readWorld(S.page);
  const ps = await get(S, () => window.__persist.status());
  const problems = [];
  if (!w) problems.push("no schedule open");
  else {
    if (judge(w, base).hash !== h0) problems.push("the schedule on screen is not the one that was being saved");
    if (w.journal.changeSets.length !== 1) problems.push(`${w.journal.changeSets.length} change sets, wanted 1`);
  }
  if (ps.error) problems.push(`persist error: ${ps.error}`);
  await verdict(S, "Ctrl+S and File > Open at once: nothing lost, the schedule is the one saved", problems);
  // and the same by API, in the same tick: save and open race inside the save layer
  const r = await get(S, async () => {
    const world = window.__v3.app.getState().world;
    const res = await Promise.allSettled([window.__persist.save(world), window.__persist.open(), window.__persist.save(world)]);
    return res.map((x) => (x.status === "fulfilled" ? (x.value.state ?? (x.value.ok ? "saved" : x.value.reason)) : `threw ${x.reason?.message}`));
  });
  check("save + open + save in one tick: none throws", r.every((x) => !String(x).startsWith("threw")), r.join(","));
  await verdict(S, "after the API race the app is still intact", []);
  await done(S);
}); else console.log("skip open-while-saving: OPFS picker shim is Chromium-only");

// =============================================================== 11. pagehide / visibility during edits
if (CHROMIUM) await sc("pagehide during edits", async () => {
  const S = await fresh();
  const hide = () => S.page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("pagehide"));
  });
  const show = () => S.page.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  // two edits, then hidden/visible/hidden at once, mid-debounce
  await seedEdit(S);
  await get(S, () => { const a = window.__v3.app.getState(); const x = Object.values(a.world.state.assignments).find((y) => y.date >= a.asOf && !y.pinned); a.commit([{ t: "update", assignmentId: x.id, patch: { agreed: !x.agreed } }], "Second change"); });
  await hide(); await show(); await hide(); await show();
  // and while a Build runs
  await delay(S, 1000);
  await get(S, () => { void window.__v3.app.getState().runBuild(); });
  await S.page.waitForFunction(() => window.__v3.app.getState().busy === "Build");
  await hide(); await show();
  await delay(S, 0);
  await S.page.waitForFunction(() => !window.__v3.app.getState().busy, null, { timeout: 60000 });
  await get(S, () => { const a = window.__v3.app.getState(); if (a.world.session.proposal) a.discardProposal(); });
  await sleep(300);
  const ps = await get(S, () => window.__persist.status());
  check("after hide/show the browser copy is current and healthy", ps.mirrorOk && !ps.error, JSON.stringify(ps));
  const w = await verdict(S, "pagehide and visibility changes during edits and a Build", []);
  // the next page in the same browser sees both edits
  const h = judge(w, base).hash;
  const page2 = await S.ctx.newPage();
  const errs2 = [];
  page2.on("pageerror", (e) => errs2.push(e.message));
  await S.page.close();
  await page2.goto(srv.base, { waitUntil: "load" });
  await page2.waitForFunction(() => window.__bootResult !== undefined, null, { timeout: 20000 });
  const boot = await page2.evaluate(() => window.__bootResult);
  let w2 = null;
  if (boot === "world") w2 = await readWorld(page2);
  else if (boot === "recovery") { await page2.getByRole("button", { name: "Use the newer browser copy" }).click(); await page2.waitForSelector('[role="gridcell"], [data-overview]', { timeout: 20000 }); w2 = await readWorld(page2); }
  check("a new tab after the hide finds both edits (no file was ever saved)", !!w2 && w2.journal.changeSets.length === 2 && judge(w2, base).hash === h, `${boot}: ${w2?.journal.changeSets.length}`);
  check("no page errors on the new tab", errs2.length === 0, errs2.join(" | "));
  await S.ctx.close();
}); else console.log("skip pagehide: the browser copy check needs the Chromium storage");

// =============================================================== 12. two quick commits, then undo twice
await sc("two commits, undo twice", async () => {
  const S = await fresh();
  const ids = await get(S, () => {
    const a = window.__v3.app.getState();
    const xs = Object.values(a.world.state.assignments).filter((y) => y.date >= a.asOf && !y.pinned).slice(0, 2);
    const r1 = a.commit([{ t: "update", assignmentId: xs[0].id, patch: { pinned: true } }], "First");
    const r2 = window.__v3.app.getState().commit([{ t: "update", assignmentId: xs[1].id, patch: { pinned: true } }], "Second");
    return [r1, r2, window.__v3.app.getState().world.journal.changeSets.map((c) => c.id)];
  });
  check("two commits in one tick both go through with distinct ids", ids[0] && ids[1] && new Set(ids[2]).size === 2, JSON.stringify(ids));
  const h0 = await get(S, () => window.__v3.app.getState().world.journal.changeSets.length);
  void h0;
  await S.page.locator("body").click({ position: { x: 700, y: 10 } });
  await S.page.keyboard.press("Control+z");
  await S.page.keyboard.press("Control+z");
  await S.page.keyboard.press("Control+z"); // nothing left: harmless
  await S.page.keyboard.press("Control+z");
  const w = await verdict(S, "two quick commits, then four Ctrl+Z: exactly two undos", []);
  const k = w.journal.changeSets;
  check("History is first, second, undo of second, undo of first", k.map((c) => c.kind).join() === "manual,manual,undo,undo" && k[2].reverses === k[1].id && k[3].reverses === k[0].id, k.map((c) => `${c.kind}:${c.reverses ?? ""}`).join(","));
  check("state hash equals the practice month again", judge(w, base).hash === stateHash(base.state));
  // the same by UI buttons, rapidly: Undo clicked five times
  await get(S, () => { const a = window.__v3.app.getState(); const xs = Object.values(a.world.state.assignments).filter((y) => y.date >= a.asOf && !y.pinned).slice(0, 2); a.commit([{ t: "update", assignmentId: xs[0].id, patch: { pinned: true } }], "Third"); window.__v3.app.getState().commit([{ t: "update", assignmentId: xs[1].id, patch: { pinned: true } }], "Fourth"); });
  const undoBtn = header(S).getByRole("button", { name: "Undo" });
  await undoBtn.click({ clickCount: 5, noWaitAfter: true });
  const w2 = await verdict(S, "two more commits, then a five-click burst on Undo: two undos, then disabled", []);
  const kk = w2.journal.changeSets.map((c) => c.kind).join();
  check("History ends with exactly two more undos", kk === "manual,manual,undo,undo,manual,manual,undo,undo", kk);
  check("Undo is disabled when nothing is left", await undoBtn.isDisabled());
  await done(S);
});

await browser.close();
srv.close();
console.log("\n     " + scenarioTimes.map(([n, ms]) => `${String(ms).padStart(6)} ms  ${n}`).join("\n     "));
process.exit(failed() ? 1 : 0);
