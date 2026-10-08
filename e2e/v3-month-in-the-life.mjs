// One scripted run of the district manager's real month, through the REAL UI (clicks and keys), start to finish:
//   Start screen -> look at the wall -> Find cover on a gap and accept -> record a time-off request (Someone's out) and see it waiting
//   -> approve it -> Build a date range and accept -> Improve (discard, then accept) -> drag a shift to another store -> Undo and Redo
//   -> a what-if, discarded -> Post (Print) -> edit after posting and see "changed since posting" -> Save (file backend)
//   -> reload, recover -> revert to a checkpoint.
// After EVERY step: the world is intact (domain checkIntegrity), the journal replays to the same state hash, no two proposals, nothing busy,
// no console errors, and the numbers on screen (need cover, waiting badge) equal what the domain computes from the world.
// A running log (step, ms, state hash) is printed at the end. The only store calls are test set-up and the what-if edit (the UI has no way to
// add an edit to a what-if; see the note at that step).
//   node e2e/v3-month-in-the-life.mjs          SOURCE=import  starts from the prototype file through the importer card instead of the practice link
import path from "node:path";
import { launch, serveV3, check, failed } from "./v3-lib.mjs";
import { evaluate } from "../domain/src/index.ts";
import { flowContext, judge, expectedCounts, practiceBase, readVisible, readWorld, root, sleep, watchErrors } from "./support/flow.mjs";

const SOURCE = process.env.SOURCE ?? "practice";
const CHROMIUM = !process.env.BROWSER || process.env.BROWSER === "chromium"; // the file-backend steps need OPFS pickers (Chromium); other engines run the rest
const base = practiceBase();
const browser = await launch();
const srv = await serveV3();
const ctx = await flowContext(browser, { shim: CHROMIUM });
const page = await ctx.newPage();
page.on("dialog", (d) => { void d.accept(); }); // "leave the page?" while there are changes not in a file
const errors = watchErrors(page);
const log = [];
const state = { hash: "" };
let dead = false;

const app = (fn, arg) => page.evaluate(fn, arg);
const cs = () => app(() => window.__v3.app.getState().world.journal.changeSets.length);
const header = page.locator("header");
const inspector = page.locator('aside[aria-label="Inspector"]');
const left = page.locator('aside[aria-label="Left panel"]');
const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 20)))));
const idle = (ms = 90000) => page.waitForFunction(() => window.__v3.app.getState().busy === null, null, { timeout: ms });


/** What must hold after every step. Returns a list of problems (empty = fine). */
async function verify() {
  const problems = [];
  await settle();
  const w = await readWorld(page);
  if (!w) return { problems: ["no schedule is open"], w: null };
  const j = judge(w, base);
  problems.push(...j.problems);
  if (j.proposals > 1) problems.push("two proposals open");
  if (w.ui.busy) problems.push(`busy: ${w.ui.busy}`);
  if (w.session.proposal && w.session.scenario && !w.session.scenario.parked) problems.push("a proposal and an open what-if at once");
  const exp = expectedCounts(w);
  const vis = await readVisible(page);
  if (vis.open !== null && vis.open !== exp.open) problems.push(`screen says ${vis.open} need cover, domain says ${exp.open}`);
  if (vis.waiting !== exp.waiting) problems.push(`screen says ${vis.waiting} waiting, domain says ${exp.waiting}`);
  if (vis.toTellEntries !== null && (vis.toTellEntries !== exp.toTellEntries || vis.toTellPeople !== exp.toTellPeople)) problems.push(`To tell shows ${vis.toTellPeople} people / ${vis.toTellEntries} lines, domain says ${exp.toTellPeople} / ${exp.toTellEntries}`);
  if (errors.length) problems.push(`console: ${errors.splice(0).join(" | ")}`);
  state.hash = j.hash;
  return { problems, w, exp, vis, j };
}

async function step(name, fn) {
  if (dead) return;
  const t0 = Date.now();
  let err = null;
  try { await fn(); } catch (e) { err = e; }
  const ms = Date.now() - t0;
  const v = await verify().catch((e) => ({ problems: [`verify threw: ${e.message}`] }));
  const bad = [...(err ? [`step failed: ${String(err.message ?? err).split("\n")[0]}`] : []), ...v.problems];
  log.push({ name, ms, hash: state.hash.slice(0, 10), cs: v.w?.journal.changeSets.length ?? "-", open: v.exp?.open ?? "-", waiting: v.exp?.waiting ?? "-", tell: v.exp?.toTellEntries ?? "-" });
  check(name, bad.length === 0, bad.join("; "));
  if (bad.length) {
    await page.screenshot({ path: path.join(root, "test-logs", `month-fail-${name.replace(/\W+/g, "-")}.png`) }).catch(() => {});
    if (err) dead = true; // later steps depend on this one
  }
  return v;
}

// ---------------------------------------------------------------- 1. Start
await page.goto(srv.base, { waitUntil: "load" });
await page.waitForFunction(() => window.__v3 && window.__bootResult !== undefined, null, { timeout: 15000 });
check("Start screen offers the three paths and the practice link", (await page.getByRole("button", { name: "Open a schedule file" }).count()) === 1 && (await page.getByRole("button", { name: "Choose old files" }).count()) === 1 && (await page.getByRole("button", { name: "Start a new schedule" }).count()) === 1 && (await page.getByRole("button", { name: "Try the practice month" }).count()) === 1);
check("nothing is open and no errors before the first click", (await app(() => window.__v3.app.getState().world)) === null && errors.length === 0, errors.join(" | "));
const t0 = Date.now();
if (SOURCE === "import") {
  await page.setInputFiles('input[data-testid="import-input"]', path.join(root, "fixtures", "demo-v2.json"));
  await page.getByRole("region", { name: "What was brought in" }).waitFor();
  await page.getByRole("button", { name: "Open it" }).click();
} else {
  await page.getByRole("button", { name: "Try the practice month" }).click();
}
await page.waitForSelector('[role="gridcell"]');
{
  const v = await verify();
  log.push({ name: `start (${SOURCE})`, ms: Date.now() - t0, hash: state.hash.slice(0, 10), cs: 0, open: v.exp.open, waiting: v.exp.waiting, tell: v.exp.toTellEntries });
  check(`start (${SOURCE}): schedule opens, intact, counts match the domain`, v.problems.length === 0, v.problems.join("; "));
  check("start: the window is October 2026 as of the fixed clock", v.w.ui.asOf === "2026-10-06" && v.w.ui.window.from === "2026-10-01" && v.w.ui.window.to === "2026-10-31", JSON.stringify(v.w.ui));
  check("start: the practice month has gaps and two waiting requests", v.exp.open > 5 && v.exp.waiting === 2, JSON.stringify(v.exp));
}
const startHash = state.hash;

await step("checkpoint 'Month start' from the File menu", async () => {
  await header.getByRole("button", { name: "File menu" }).click();
  await page.getByRole("menuitem", { name: "Save a checkpoint…" }).click();
  await page.getByLabel("Checkpoint name").fill("Month start");
  await page.getByRole("button", { name: "Save checkpoint" }).click();
  const cps = await app(() => window.__v3.app.getState().world.journal.checkpoints.map((c) => c.name));
  if (!cps.includes("Month start")) throw new Error(`checkpoints: ${cps}`);
});

// ---------------------------------------------------------------- 2. Look at the wall
await step("look at the wall: People rows, Key, Stores rows", async () => {
  const rows = await page.locator('[role="gridcell"][data-store]').count();
  if (rows !== 16 * 31) throw new Error(`${rows} store cells`);
  await page.getByRole("group", { name: "Rows" }).getByRole("button", { name: "People" }).click();
  if ((await page.locator('[role="rowheader"] .w-disc').count()) < 10) throw new Error("no people rows");
  await page.getByRole("button", { name: "Key" }).click();
  if ((await page.getByRole("region", { name: "Key" }).count()) !== 1) throw new Error("no key");
  await page.keyboard.press("Escape");
  await page.getByRole("group", { name: "Rows" }).getByRole("button", { name: "Stores" }).click();
  if ((await page.locator('[role="gridcell"][data-store]').count()) !== 16 * 31) throw new Error("store rows did not come back");
});

// ---------------------------------------------------------------- 3. A gap: Find cover, pick, accept
let covered = null;
await step("open a gap, Find cover, preview option 1, Accept", async () => {
  const w = await readWorld(page);
  const asOf = w.ui.asOf;
  const ev = evaluate(w.state, asOf, { range: w.ui.window });
  const gaps = Object.values(ev.cells).filter((c) => c.open > 0 && c.date >= asOf).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.storeId < b.storeId ? -1 : 1));
  const before = await cs();
  for (const g of gaps.slice(0, 10)) {
    await page.locator(`[role="gridcell"][data-store="${g.storeId}"][data-date="${g.date}"]`).click();
    const all = inspector.getByRole("button", { name: /^Show all \d+/ });
    if (await all.count()) await all.click();
    // the wider search starts by itself when the cell is selected
    await page.waitForFunction(() => { const a = window.__v3.app.getState(); return !a.busy && (a.cellRepair || a.notice?.kind === "error"); }, null, { timeout: 90000 });
    const preview = inspector.getByRole("button", { name: "Preview option 1", exact: true });
    if ((await preview.count()) === 0) { await app(() => window.__v3.app.setState({ cellRepair: null })); continue; }
    await preview.click();
    const bar = page.getByRole("region", { name: "Proposal" });
    await bar.waitFor();
    if (!/Nothing is saved until you accept/.test(await bar.innerText())) throw new Error("proposal bar does not say nothing is saved");
    if ((await cs()) !== before) throw new Error("preview already committed something");
    await bar.getByRole("button", { name: "Accept" }).click();
    await bar.waitFor({ state: "detached" });
    covered = g;
    break;
  }
  if (!covered) throw new Error("none of the first 10 gaps had a cover option");
  const kinds = await app(() => window.__v3.app.getState().world.journal.changeSets.map((c) => c.kind));
  if ((await cs()) !== before + 1 || kinds.at(-1) !== "repair") throw new Error(`change sets ${before} -> ${kinds.length}, last ${kinds.at(-1)}`);
  const w2 = await readWorld(page);
  const open2 = evaluate(w2.state, asOf, { range: w2.ui.window }).cells[`${covered.storeId}|${covered.date}`]?.open ?? 0;
  if (open2 >= covered.open) throw new Error(`the gap at ${covered.storeId} ${covered.date} still has ${open2} open`);
});

// ---------------------------------------------------------------- 4. A time-off request, waiting badge, approve
let request = null;
await step("record a time-off request (compact form) and see the waiting badge", async () => {
  const w = await readWorld(page);
  const before = w.state.nextId.unavail;
  const waitingBefore = expectedCounts(w).waiting;
  const a = Object.values(w.state.assignments).filter((x) => x.date >= "2026-10-12" && x.date <= "2026-10-30").sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.id < y.id ? -1 : 1))[0];
  request = { pid: a.pharmacistId, date: a.date, id: `U${before}`, name: w.state.pharmacists[a.pharmacistId].name };
  // The Schedule no longer has a Someone's out button (time off lives on the Time off page); the compact form is opened through the store here.
  await app(() => { const a = window.__v3.app.getState(); a.setView("wall"); a.setOutForm(true); });
  const form = inspector.getByRole("form", { name: "Add time off" });
  await form.waitFor();
  await form.getByLabel("Who").selectOption(request.pid);
  await form.getByLabel("First day").fill(request.date);
  await form.getByLabel("Type").selectOption("Vacation");
  if ((await form.getByLabel("Status").inputValue()) !== "Requested") throw new Error("Vacation did not default to Requested");
  await form.getByRole("button", { name: "Add time off" }).click();
  const said = await inspector.getByRole("status", { name: "What this changes" }).innerText();
  if (!/would be affected if approved/.test(said)) throw new Error(`status said: ${said}`);
  await page.waitForFunction((n) => !!document.querySelector(`header nav [aria-label="${n} waiting"]`), waitingBefore + 1, { timeout: 5000 });
  const rec = await app((id) => window.__v3.app.getState().world.state.unavailability[id]?.status, request.id);
  if (rec !== "Requested") throw new Error(`record ${request.id} is ${rec}`);
  await inspector.getByRole("button", { name: "Close", exact: true }).click();
});

await step("approve the request on the Time off screen", async () => {
  await header.getByRole("button", { name: /^Time off/ }).click();
  const row = page.getByRole("list", { name: "Waiting for an answer" }).locator(`[data-unavail="${request.id}"]`);
  await row.waitFor();
  await row.getByRole("button").click();
  const li = page.locator('aside[aria-label="Inspector"]').locator(`[data-unavail="${request.id}"]`);
  await li.waitFor();
  if (!/Approving (leaves every store covered|opens \w+ on \w{3} \w{3} \d+)/.test(await li.innerText())) throw new Error("no 'Approving ...' line");
  await li.getByRole("button", { name: /^Approve/ }).click();
  const st = await app((id) => window.__v3.app.getState().world.state.unavailability[id].status, request.id);
  if (st !== "Approved") throw new Error(`status ${st}`);
  if ((await page.getByRole("list", { name: "Waiting for an answer" }).locator(`[data-unavail="${request.id}"]`).count()) !== 0) throw new Error("still listed as waiting");
});

// ---------------------------------------------------------------- 5. Build a date range
await step("two-week window, Build this period, Accept", async () => {
  await header.getByRole("button", { name: "Schedule" }).click();
  await page.getByRole("group", { name: "How much to show" }).getByRole("button", { name: "2 weeks" }).click();
  const win = await app(() => window.__v3.app.getState().window);
  if (win.from !== "2026-10-04" || win.to !== "2026-10-17") throw new Error(`window ${JSON.stringify(win)}`);
  const before = await cs();
  await page.getByRole("button", { name: "Tools" }).click();
  await page.getByRole("menuitem", { name: /^Build this period/ }).click();
  await page.getByRole("button", { name: /^Cancel Build$/ }).waitFor({ timeout: 3000 }).catch(() => {});
  await idle();
  const p = await app(() => { const a = window.__v3.app.getState(); return { prop: a.world.session.proposal?.kind ?? null, notice: a.notice?.text ?? "" }; });
  if (!p.prop) { if (!/nothing to do|Build found/i.test(p.notice)) throw new Error(`no proposal and notice "${p.notice}"`); return; }
  const bar = page.getByRole("region", { name: "Proposal" });
  await bar.waitFor();
  if (!/placed|Changes \d+ assignment/.test(await bar.innerText())) throw new Error("proposal bar has no counts");
  await bar.getByRole("button", { name: "Accept" }).click();
  await bar.waitFor({ state: "detached" });
  const kinds = await app(() => window.__v3.app.getState().world.journal.changeSets.map((c) => c.kind));
  if (kinds.length !== before + 1 || kinds.at(-1) !== "build") throw new Error(`last change set ${kinds.at(-1)}`);
});

// ---------------------------------------------------------------- 6. Improve: discard, then accept
await step("Improve: look, Discard (nothing saved)", async () => {
  const before = await cs();
  const hash0 = state.hash;
  await page.getByRole("button", { name: "Tools" }).click();
  await page.getByRole("menuitem", { name: /^Improve/ }).click();
  await page.getByRole("dialog", { name: "Improve" }).getByRole("button", { name: "Look for improvements" }).click();
  await idle();
  const prop = await app(() => window.__v3.app.getState().world.session.proposal?.kind ?? null);
  if (prop) {
    const bar = page.getByRole("region", { name: "Proposal" });
    await bar.getByRole("button", { name: "Discard" }).click();
    await bar.waitFor({ state: "detached" });
  }
  if ((await cs()) !== before) throw new Error("Discard saved something");
  const w = await readWorld(page);
  if (judge(w, base).hash !== hash0) throw new Error("state changed by a discarded Improve");
});
await step("Improve with the next 14 days included, Accept if it found something", async () => {
  const before = await cs();
  await page.getByRole("button", { name: "Tools" }).click();
  await page.getByRole("menuitem", { name: /^Improve/ }).click();
  await page.getByRole("dialog", { name: "Improve" }).getByLabel("Include the next 14 days").check();
  await page.getByRole("dialog", { name: "Improve" }).getByRole("button", { name: "Look for improvements" }).click();
  await idle();
  const prop = await app(() => window.__v3.app.getState().world.session.proposal?.kind ?? null);
  if (!prop) { console.log("     note: Improve found nothing the second time"); return; }
  const bar = page.getByRole("region", { name: "Proposal" });
  await bar.getByRole("button", { name: "Accept" }).click();
  await bar.waitFor({ state: "detached" });
  if ((await cs()) !== before + 1) throw new Error("Accept did not add exactly one change set");
});

// ---------------------------------------------------------------- 7. A manual move by drag
let moved = null;
await step("drag a shift to another store on the same day (one change set)", async () => {
  const w = await readWorld(page);
  const asOf = w.ui.asOf;
  const win = w.ui.window;
  const ev = evaluate(w.state, asOf, { range: win });
  const gaps = Object.values(ev.cells).filter((c) => c.open > 0 && c.date >= asOf && c.date <= win.to).sort((a, b) => (a.date < b.date ? -1 : 1));
  const chips = Object.values(w.state.assignments).filter((a) => a.date >= asOf && a.date >= win.from && a.date <= win.to);
  const before = await cs();
  let tries = 0;
  for (const g of gaps) {
    // a chip from another store on the same day, whose person is not already at the gap's store that day
    const cand = chips.find((a) => a.date === g.date && a.storeId !== g.storeId && !chips.some((b) => b.pharmacistId === a.pharmacistId && b.date === a.date && b.storeId === g.storeId));
    if (!cand || ++tries > 8) continue;
    await page.locator(`[role="gridcell"][data-store="${cand.storeId}"][data-date="${cand.date}"] [data-aid="${cand.id}"]`).dragTo(page.locator(`[role="gridcell"][data-store="${g.storeId}"][data-date="${g.date}"]`));
    if ((await cs()) === before + 1) { moved = { aid: cand.id, from: cand.storeId, to: g.storeId, date: g.date }; break; }
    await app(() => window.__v3.app.getState().clearNotice());
  }
  if (!moved) throw new Error(`no drag committed in ${tries} tries`);
  const now = await app((id) => window.__v3.app.getState().world.state.assignments[id]?.storeId, moved.aid);
  if (now !== moved.to) throw new Error(`the shift is at ${now}, wanted ${moved.to}`);
});

// ---------------------------------------------------------------- 8. Undo and redo
let preUndo = "";
await step("Undo from the top bar reverses the move", async () => {
  preUndo = state.hash;
  const before = await cs();
  await header.getByRole("button", { name: "Undo" }).click();
  const w = await app(() => window.__v3.app.getState().world.journal.changeSets.map((c) => c.kind));
  if (w.length !== before + 1 || w.at(-1) !== "undo") throw new Error(`kinds ${w.slice(-2)}`);
  const now = await app((id) => window.__v3.app.getState().world.state.assignments[id]?.storeId, moved.aid);
  if (now !== moved.from) throw new Error(`after undo the shift is at ${now}, wanted ${moved.from}`);
});
await step("Redo from History brings it back (same state as before the undo)", async () => {
  if ((await left.count()) === 0) await page.getByRole("button", { name: "Open the list" }).click();
  await left.getByRole("tab", { name: "History" }).click();
  const redo = left.getByRole("button", { name: /^Redo: #\d+$/ }).first();
  await redo.click();
  const now = await app((id) => window.__v3.app.getState().world.state.assignments[id]?.storeId, moved.aid);
  if (now !== moved.to) throw new Error(`after redo the shift is at ${now}`);
  const w = await readWorld(page);
  if (judge(w, base).hash !== preUndo) throw new Error("state after redo differs from the state before the undo");
});

// ---------------------------------------------------------------- 9. A what-if, discarded
await step("start a what-if from Plan (via search), edit it, discard it", async () => {
  const hash0 = state.hash;
  const before = await cs();
  await page.keyboard.press("/");
  await page.getByRole("dialog", { name: "Search" }).waitFor();
  await page.getByLabel("Search stores, people, screens").fill("next weeks");
  await page.keyboard.press("Enter");
  await page.getByRole("table", { name: "Open shifts by week" }).waitFor();
  await page.getByLabel("What-if name").fill("Close one store");
  await page.getByRole("button", { name: "Start a what-if" }).click();
  await page.getByRole("region", { name: "What-if" }).first().waitFor();
  // The UI has no way to add an edit to a what-if (scenarioEdit is only a store action), so the edit is made through the store.
  await app(() => {
    const a = window.__v3.app.getState();
    const x = Object.values(a.world.state.assignments).find((y) => y.date >= a.asOf);
    a.scenarioEdit([{ t: "remove", assignmentId: x.id }]);
  });
  const v = await verify();
  if (v.problems.length) throw new Error(`while the what-if was open: ${v.problems.join("; ")}`);
  if (!v.w.session.scenario || v.w.session.scenario.edits.length !== 1) throw new Error("what-if has no edit");
  if (judge(v.w, base).hash !== hash0) throw new Error("the what-if changed the live schedule");
  // The what-if controls show in the right column on their own while a what-if is open.
  await inspector.getByRole("button", { name: "Discard", exact: true }).click();
  await inspector.getByRole("button", { name: "Discard what-if" }).click();
  if ((await app(() => window.__v3.app.getState().world.session.scenario)) !== null) throw new Error("what-if still open");
  if ((await cs()) !== before) throw new Error("a what-if wrote a change set");
});

// ---------------------------------------------------------------- 10. Post
await step("Print: post the schedule (revision 1)", async () => {
  await header.getByRole("button", { name: "Print" }).click();
  await page.waitForSelector("[data-print-view]");
  await page.locator("[data-post]").click();
  await page.waitForSelector("[data-revision='1']");
  const n = await app(() => window.__v3.app.getState().world.journal.snapshots.length);
  if (n !== 1) throw new Error(`${n} snapshots`);
  if (!/Nothing has changed/.test(await page.locator("[data-changes]").innerText())) throw new Error("changed-since-posting is not empty right after posting");
});
let postedHash = "";
await step("edit after posting: Print says what changed since revision 1", async () => {
  postedHash = state.hash;
  const w = await readWorld(page);
  const snap = w.journal.snapshots.at(-1);
  // Remove one placed pharmacist inside the posted range through the Inspector (select the store day, then Remove).
  const a = Object.values(w.state.assignments).filter((x) => x.date >= w.ui.asOf && x.date >= snap.from && x.date <= snap.to).sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.id < y.id ? -1 : 1))[0];
  await header.getByRole("button", { name: "Schedule" }).click();
  await page.getByRole("group", { name: "How much to show" }).getByRole("button", { name: "Month" }).click();
  await page.locator(`[role="gridcell"][data-store="${a.storeId}"][data-date="${a.date}"]`).click();
  await inspector.getByRole("button", { name: "Remove", exact: true }).first().click();
  const w2 = await readWorld(page);
  if (w2.journal.changeSets.length !== w.journal.changeSets.length + 1) throw new Error("the removal was not committed");
  await header.getByRole("button", { name: "Print" }).click();
  await page.waitForSelector("[data-changes]");
  const exp = expectedCounts(w2);
  if (exp.changedSincePosting < 1) throw new Error("the domain sees no change since posting");
  const listed = await page.locator("[data-change-list] li").count();
  if (listed !== exp.changedSincePosting) throw new Error(`Print lists ${listed} changed days, domain says ${exp.changedSincePosting}`);
  if (!/day[s]? differs? from revision 1/.test(await page.locator("[data-changes]").innerText())) throw new Error("no 'differs from revision 1' sentence");
});
void postedHash;

// ---------------------------------------------------------------- 11. Save to a file, change, reload, recover
if (CHROMIUM) {
await step("Save: first Save asks where (file backend), then the file is linked and clean", async () => {
  await header.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForFunction(() => window.__persist.status().linked === true, null, { timeout: 15000 });
  const st = await app(() => window.__persist.status());
  if (st.unsavedChanges !== 0 || !st.fileName) throw new Error(JSON.stringify(st));
  const line = await page.getByTestId("save-status").innerText();
  if (!/Saved to /.test(line)) throw new Error(`status line: ${line}`);
});
await step("one more change, Save again over the linked file", async () => {
  await header.getByRole("button", { name: "Schedule" }).click();
  await page.locator('[role="gridcell"][data-store][data-date]').first().click();
  const w = await readWorld(page);
  const a = Object.values(w.state.assignments).find((x) => x.date >= w.ui.asOf && !x.pinned);
  await app((id) => window.__v3.app.getState().commit([{ t: "update", assignmentId: id, patch: { pinned: true } }], "Pinned for the e2e"), a.id);
  await page.waitForFunction(() => window.__persist.status().unsavedChanges === 1, null, { timeout: 5000 });
  if (!/1 change only in this browser/.test(await page.getByTestId("save-status").innerText())) throw new Error("status line does not warn about the unsaved change");
  await page.keyboard.press("Control+s");
  await page.waitForFunction(() => window.__persist.status().unsavedChanges === 0, null, { timeout: 15000 });
});
const savedHash = state.hash;
const savedCs = log.at(-1).cs;

await step("reload right after saving: boot restores the same state hash", async () => {
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => window.__v3 && window.__bootResult !== undefined, null, { timeout: 20000 });
  await page.waitForSelector('[role="gridcell"], [data-overview]', { timeout: 20000 });
  const boot = await app(() => window.__bootResult);
  if (boot !== "world") throw new Error(`boot said ${boot}`);
  const w = await readWorld(page);
  if (judge(w, base).hash !== savedHash) throw new Error("the state after reload is not the saved state");
  if (w.journal.changeSets.length !== savedCs) throw new Error(`change sets ${savedCs} -> ${w.journal.changeSets.length}`);
});

let beforeReload = "";
await step("edit, reload without saving: recovery offers the newer browser copy, and choosing it restores the same state hash", async () => {
  const w0 = await readWorld(page);
  const a = Object.values(w0.state.assignments).find((x) => x.date >= w0.ui.asOf && x.pinned === false);
  await app((id) => window.__v3.app.getState().commit([{ t: "update", assignmentId: id, patch: { pinned: true } }], "Pinned after saving"), a.id);
  beforeReload = judge(await readWorld(page), base).hash;
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => window.__v3 && window.__bootResult !== undefined, null, { timeout: 20000 });
  const boot = await app(() => window.__bootResult);
  if (boot !== "recovery") throw new Error(`boot said ${boot}, wanted recovery`);
  const dlg = page.getByRole("dialog", { name: /Newer changes were found/ });
  await dlg.waitFor();
  if (!/Newer changes were found in this browser/.test(await dlg.innerText())) throw new Error("recovery dialog text");
  await dlg.getByRole("button", { name: "Use the newer browser copy" }).click();
  await page.waitForSelector('[role="gridcell"], [data-overview]', { timeout: 20000 });
  const w = await readWorld(page);
  if (judge(w, base).hash !== beforeReload) throw new Error("the recovered state is not the state before the reload");
});
} else console.log("skip Save, reload and recovery: the file picker shim needs OPFS writable handles (Chromium)");

// ---------------------------------------------------------------- 12. Back to the checkpoint
await step("History > Revert to 'Month start' undoes the month in one step", async () => {
  const before = await cs();
  if ((await left.count()) === 0) await page.getByRole("button", { name: "Open the list" }).click();
  await left.getByRole("tab", { name: "History" }).click();
  const cpName = await left.getByText("Month start", { exact: true }).count();
  if (cpName < 1) throw new Error("the checkpoint was not kept through the reload");
  await left.getByRole("button", { name: "Revert to this checkpoint" }).click();
  const kinds = await app(() => window.__v3.app.getState().world.journal.changeSets.map((c) => c.kind));
  if (kinds.length !== before + 1 || kinds.at(-1) !== "revert") throw new Error(`last change set ${kinds.at(-1)}`);
  const w = await readWorld(page);
  if (judge(w, base).hash !== startHash) throw new Error("reverting to the checkpoint did not restore the starting state");
});
await step("final: wall still renders and Undo reverses the revert", async () => {
  await header.getByRole("button", { name: "Undo" }).click();
  const w = await readWorld(page);
  if (judge(w, base).hash === startHash) throw new Error("undo of the revert changed nothing");
});

// ---------------------------------------------------------------- the log
const pad = (s, n) => String(s).padEnd(n);
console.log("\n     " + pad("step", 78) + pad("ms", 7) + pad("hash", 12) + pad("cs", 4) + pad("open", 6) + pad("wait", 5) + "tell");
for (const r of log) console.log("     " + pad(r.name.slice(0, 76), 78) + pad(r.ms, 7) + pad(r.hash, 12) + pad(r.cs, 4) + pad(r.open, 6) + pad(r.waiting, 5) + r.tell);
console.log(`     total ${((log.reduce((n, r) => n + r.ms, 0)) / 1000).toFixed(1)} s over ${log.length} steps`);
check("no console errors across the whole run", errors.length === 0, errors.join(" | "));
await browser.close();
srv.close();
void sleep;
process.exit(failed() ? 1 : 0);
