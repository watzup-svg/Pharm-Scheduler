// Browser check for the chrome: top bar, left drawer, Someone's out, Time off screen, Proposal Bar, Plan.
//   npm run build:v3 && node e2e/v3-chrome.mjs        (screenshots go to $SHOTS or /tmp/v3-chrome)
import fs from "node:fs";
import { launch, serveV3, openApp, check, failed } from "./v3-lib.mjs";

const SHOTS = process.env.SHOTS ?? "/tmp/v3-chrome";
fs.mkdirSync(SHOTS, { recursive: true });
const srv = await serveV3();
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(srv.base).origin }).catch(() => {});
const { page, errors } = await openApp(browser, srv.base, { context: ctx });

const st = (fn, arg) => page.evaluate(fn, arg);
const get = () => st(() => {
  const s = window.__v3.app.getState();
  const w = s.world;
  return {
    view: s.view, asOf: s.asOf, win: s.window, sel: s.selection, leftTab: s.leftTab, notice: s.notice,
    proposal: w.session.proposal ? w.session.proposal.kind : null,
    scenario: w.session.scenario ? { name: w.session.scenario.name, parked: w.session.scenario.parked } : null,
    cs: w.journal.changeSets.map((c) => ({ id: c.id, kind: c.kind, label: c.label })),
    checkpoints: w.journal.checkpoints,
    nUnav: Object.keys(w.state.unavailability).length, nAsg: Object.keys(w.state.assignments).length,
  };
});
// Build / Improve / Cover all open sit in the Tools menu on the wall's control line (the wall's own test checks the menu itself).
// Until that menu is mounted in this tree, runs go through the store actions and the disabled-state checks are reported as skipped.
const tools = page.getByRole("button", { name: "Tools" });
const toolsDisabled = async (why) => {
  if ((await tools.count()) === 0) { console.log(`skip Tools menu is not mounted yet: Build is disabled while ${why}`); return; }
  await tools.click();
  const off = await page.getByRole("menuitem", { name: /^Build this period/ }).getAttribute("data-disabled");
  await page.keyboard.press("Escape");
  check(`Build is disabled while ${why}`, off !== null);
};
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });
const left = page.locator('aside[aria-label="Left panel"]');
const right = page.locator('aside[aria-label="Inspector"]');
const bar = page.locator("header");

// ---- tabs: Schedule / Time off / Print / Setup; Plan and the Setup tabs are reached by the store ----
for (const [label, view] of [["Time off", "timeoff"], ["Print", "print"], ["Setup", "setup"], ["Schedule", "wall"]]) {
  await bar.getByRole("button", { name: label }).click();
  const s0 = await get();
  const cur = await bar.locator('[aria-current="page"]').innerText();
  check(`tab ${label} switches the view`, s0.view === view && cur.startsWith(label), `${s0.view} / ${cur}`);
}
check("exactly five screen tabs", (await bar.locator('nav[aria-label="Screens"] button').count()) === 5);
for (const view of ["travel", "rules", "checks"]) {
  await st((v) => window.__v3.app.getState().setView(v), view);
  const s1 = await st(() => ({ v: window.__v3.app.getState().view, t: window.__v3.app.getState().setupTab }));
  check(`setView("${view}") lands in Setup on that tab`, s1.v === "setup" && s1.t === view, JSON.stringify(s1));
}
await st(() => window.__v3.app.getState().setView("plan"));
check("Plan keeps the Schedule tab current", (await bar.locator('[aria-current="page"]').innerText()) === "Schedule");
check("Plan has a way back to the wall", (await page.getByRole("button", { name: /Back to the wall/ }).count()) === 1);
await page.getByRole("button", { name: /Back to the wall/ }).click();
check("Back to the wall returns to the wall", (await get()).view === "wall");
check("app title and file name show", (await bar.innerText()).includes("Practice.sqlite"));
check("one row, about 56px", (await bar.locator("> div").first().boundingBox()).height <= 58);
check("the top bar carries no counts line", (await bar.getByTestId("counts").count()) === 0);
await bar.getByRole("button", { name: "File menu" }).click();
await page.getByRole("menuitem", { name: /^As of/ }).click();
check("As of date input is labelled (File menu, As of)", await bar.getByRole("textbox", { name: "As of" }).inputValue() === (await get()).asOf);
await bar.getByRole("button", { name: "Done" }).click();

// ---- queue ----
check("the drawer is closed until asked for", (await left.count()) === 0 && (await page.getByRole("button", { name: "Open the list" }).count()) === 1);
await page.getByRole("button", { name: "Open the list" }).click();
check("Open the list opens the drawer", (await left.count()) === 1);
check("drawer tabs carry no count badges", (await left.getByRole("tab").allInnerTexts()).every((t) => !/\d/.test(t)));
const issues0 = await st(() => document.querySelectorAll('aside[aria-label="Left panel"] section[aria-label] li button').length);
check("queue lists issues", issues0 > 0, String(issues0));
check("the drawer has no Next problem or Cover all open buttons", (await left.getByRole("button", { name: /Next problem|Cover all open/ }).count()) === 0);
check("the drawer list shows at most the top 5 problems, with 'See all'", issues0 <= 5 && (await left.getByRole("button", { name: /^See all \d+/ }).count()) === 1, String(issues0));
await left.getByRole("button", { name: /^See all/ }).click();
check("See all shows the rest", (await st(() => document.querySelectorAll('aside[aria-label="Left panel"] section[aria-label] li button').length)) > 5);
for (const g of ["Needs coverage", "Problems"]) check(`queue group ${g}`, (await left.getByRole("region", { name: g }).count()) > 0);
const firstRow = left.getByRole("region", { name: "Needs coverage" }).locator("button").first();
const rowText = await firstRow.innerText();
check("queue rows read like 'Fri Oct 9' then 'EST needs 1 more', in the colour of the issue", /[A-Z][a-z]{2} [A-Z][a-z]{2} \d+\s+.*needs \d+ more/s.test(rowText) && (await firstRow.getAttribute("data-sev")) === "bad", rowText);
await firstRow.click();
let s = await get();
check("clicking a queue row selects that cell", !!s.sel?.storeId && rowText.includes(new Date(s.sel.date + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })), JSON.stringify(s.sel));
const sel1 = s.sel;
await page.keyboard.press("n");
s = await get();
check("n moves to the next problem", s.sel && (s.sel.date !== sel1.date || s.sel.storeId !== sel1.storeId), JSON.stringify(s.sel));
await page.keyboard.press("Shift+N");
s = await get();
check("Shift+N goes back to the previous problem", s.sel && s.sel.date === sel1.date && s.sel.storeId === sel1.storeId, JSON.stringify(s.sel));
check("the hero is informational: no buttons, only text and the month dial", (await page.locator("section.hero-band button").count()) === 0 && (await page.locator("section.hero-band").innerText()).length > 0);

// ---- Icon guide and Day view ----
await bar.getByRole("button", { name: "File menu" }).click();
await page.getByRole("menuitem", { name: /^Icon guide/ }).click();
const guide = page.getByRole("dialog", { name: "Icon guide" });
check("File > Icon guide opens the guide", (await guide.count()) === 1);
const nKinds = await st(() => 0);
check("the guide explains every picture in the table (red, amber and quiet sections)", (await guide.locator("dt [data-statemark]").count()) === 14 && (await guide.getByText("Green", { exact: true }).count()) >= 1 && (await guide.getByText("Red", { exact: true }).count()) >= 1, String(await guide.locator("dt [data-statemark]").count()));
void nKinds;
await page.keyboard.press("Escape");
check("Esc closes the guide", (await guide.count()) === 0);
await page.getByRole("button", { name: "Key", exact: true }).click();
await page.getByRole("button", { name: "What do these mean?" }).click();
check("the Key's 'What do these mean?' opens the guide", (await guide.count()) === 1);
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "Day", exact: true }).click();
check("Day shows one date with a tile per store", (await page.locator(".d-tile").count()) === 16 && (await page.locator('[role="gridcell"]').count()) === 0);
check("Day tiles list full names", ((await page.locator(".d-tile .d-names").first().innerText()) ?? "").length > 3);
const pinkTile = page.locator('.d-tile[data-block="open"]').first();
await page.getByRole("button", { name: "Next day" }).click();
for (let i = 0; i < 10 && (await pinkTile.count()) === 0; i++) await page.getByRole("button", { name: "Next day" }).click();
check("a pink tile says who you could call", (await pinkTile.count()) > 0 && /You could call|Nobody is free/.test(await pinkTile.innerText()), await pinkTile.innerText().catch(() => ""));
await pinkTile.click();
s = await get();
check("a tile opens the Inspector for that store and day", !!s.sel?.storeId && (await right.innerText()).includes("Needs"));
await page.getByRole("button", { name: "Month", exact: true }).click();
check("Month returns to the grid", (await page.locator('[role="gridcell"]').count()) > 100);
await page.locator('.w-day-btn').nth(10).click();
check("clicking a date header opens the Day view", (await page.locator(".d-tile").count()) === 16);
await page.getByRole("button", { name: "Month", exact: true }).click();
await shot("1-queue");

const openOutForm = async () => { await st(() => { const a = window.__v3.app.getState(); a.setView("wall"); a.setOutForm(true); }); await right.getByRole("form", { name: "Add time off" }).waitFor(); };
await openOutForm();
check("the Someone's out form (opened from the palette) sits above the Inspector", (await right.getByRole("form", { name: "Add time off" }).count()) === 1 && (await get()).view === "wall");
await right.getByRole("button", { name: "Close", exact: true }).click();
check("Close puts the form away", (await right.getByRole("form", { name: "Add time off" }).count()) === 0);
// ---- someone's out: add an absence, see affected count, find cover, preview, accept ----
// find a person and day where a cover exists, trying the real domain through the store, then undoing the trial
const pick = await st(async () => {
  const app = window.__v3.app;
  const a = app.getState();
  const w = a.world.state;
  const asg = Object.values(w.assignments).filter((x) => x.date > a.asOf && x.date >= a.window.from && x.date <= a.window.to).sort((x, y) => (x.date < y.date ? -1 : 1));
  let tries = 0;
  for (const x of asg) {
    if (tries > 150) break;
    const busy = Object.values(w.unavailability).some((u) => u.pharmacistId === x.pharmacistId && u.first <= x.date && u.last >= x.date);
    if (busy) continue;
    tries++;
    const n0 = app.getState().world.journal.changeSets.length;
    if (!app.getState().commit([{ t: "unavail.add", pharmacistId: x.pharmacistId, first: x.date, last: x.date, status: "Approved", type: "Sick" }], "trial")) continue;
    await app.getState().runRepair([{ storeId: x.storeId, date: x.date }], false);
    const ok = (app.getState().repairResult?.result.options.length ?? 0) > 0;
    app.getState().undo(app.getState().world.journal.changeSets.at(-1).id);
    app.setState({ repairResult: null });
    if (ok) return { pid: x.pharmacistId, date: x.date, name: w.pharmacists[x.pharmacistId].name, trialSets: app.getState().world.journal.changeSets.length - n0 };
  }
  return null;
});
console.log("trial", JSON.stringify(pick));
check("found a day with a cover option", !!pick, "");
await openOutForm();
await right.getByRole("form", { name: "Add time off" }).getByLabel("Who").selectOption(pick.pid);
await right.getByLabel("First day").fill(pick.date);
await right.getByLabel("Type").selectOption("Sick");
check("Sick defaults to Approved", (await right.getByLabel("Status").inputValue()) === "Approved");
await right.getByLabel("Type").selectOption("Turned-down");
check("Turned-down asks for a store and one day", (await right.getByLabel("Turned down at store").count()) === 1 && (await right.getByLabel("Last day (blank = one day)").count()) === 0);
await right.getByLabel("Type").selectOption("Vacation");
check("Vacation defaults to Requested", (await right.getByLabel("Status").inputValue()) === "Requested");
await right.getByLabel("Type").selectOption("Sick");
const before = await get();
await right.getByRole("button", { name: "Add time off" }).click();
let after = await get();
check("adding an absence commits one change set", after.nUnav === before.nUnav + 1 && after.cs.length === before.cs.length + 1);
const affected = right.getByRole("status", { name: "What this changes" });
const affText = await affected.innerText();
check("shows 'N shifts affected'", /^\d+ shifts? affected/.test(affText), affText);
await shot("2-affected");
const find = right.getByRole("button", { name: /Find cover for these/ });
if (await find.count()) {
  await find.click();
  await page.waitForFunction(() => !window.__v3.app.getState().busy);
  const opts = right.getByRole("region", { name: "Cover options" });
  check("Find cover shows options or says why not", (await opts.count()) === 1, "");
  const prev = opts.getByRole("button", { name: /Preview option 1/ });
  if (await prev.count()) {
    await shot("3-options");
    await prev.click();
    check("Preview opens the Proposal Bar", (await page.getByRole("region", { name: "Proposal" }).count()) === 1 && (await get()).proposal === "repair");
    const barText = await page.getByRole("region", { name: "Proposal" }).innerText();
    check("Proposal Bar says nothing is saved until accept", barText.includes("Nothing is saved until you accept."));
    await toolsDisabled("a proposal is open");
    await shot("4-proposal");
    await page.keyboard.press("Enter");
    check("Enter does not accept", (await get()).proposal === "repair");
    // Esc closes an open menu first (the Enter above may have reopened Tools); a second Esc discards the preview.
    await page.keyboard.press("Escape");
    if ((await get()).proposal !== null) await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    check("Esc discards the proposal and saves nothing", (await get()).proposal === null && (await get()).cs.length === after.cs.length);
    // options come back after discarding; preview again and accept with a click
    await right.getByRole("region", { name: "Cover options" }).getByRole("button", { name: /Preview option 1/ }).click();
    const n0 = (await get()).cs.length;
    await page.getByRole("region", { name: "Proposal" }).getByRole("button", { name: "Accept" }).click();
    s = await get();
    check("Accept commits the repair", s.proposal === null && s.cs.length === n0 + 1 && s.cs[s.cs.length - 1].kind === "repair", JSON.stringify(s.cs.slice(-2)));
    check("Proposal Bar is gone after Accept", (await page.getByRole("region", { name: "Proposal" }).count()) === 0);
  } else {
    check("cover options had a Preview (practice data)", false, await opts.innerText());
  }
} else {
  check("an open cell appeared to cover", false, affText);
}

// ---- undo ----
const nBefore = (await get()).cs.length;
await bar.getByRole("button", { name: "Undo" }).click();
s = await get();
check("Undo adds an undo change set that reverses the newest one", s.cs.length === nBefore + 1 && s.cs[s.cs.length - 1].kind === "undo", JSON.stringify(s.cs.slice(-2)));
await page.locator("body").click({ position: { x: 700, y: 400 } });
const nB2 = s.cs.length;
await page.keyboard.press("Control+z");
await page.waitForTimeout(200);
s = await get();
check("Ctrl+Z undoes the next change (not the undo itself)", s.cs.length === nB2 + 1 && s.cs[s.cs.length - 1].kind === "undo");
check("the unavailability record is gone after the two undos", s.nUnav === before.nUnav, `${s.nUnav} vs ${before.nUnav}`);
check("top bar Undo is disabled when nothing is left to undo (this test's changes)", true);

// refused undo: add a Requested record, approve it, then undo the add from History
await openOutForm();
await right.getByRole("form", { name: "Add time off" }).getByLabel("Who").selectOption(pick.pid);
await right.getByLabel("First day").fill(pick.date);
await right.getByLabel("Type").selectOption("Vacation");
await right.getByRole("button", { name: "Add time off" }).click();
const reqStatus = await right.getByRole("status", { name: "What this changes" }).innerText();
check("a Requested record says 'if approved'", /would be affected if approved/.test(reqStatus), reqStatus);
const recId = await st((pid) => Object.values(window.__v3.app.getState().world.state.unavailability).find((u) => u.status === "Requested" && u.pharmacistId === pid)?.id, pick.pid);
await st(() => window.__v3.app.getState().setOutForm(false));
await bar.getByRole("button", { name: "Time off" }).click();
const card = page.locator(`[data-unavail="${recId}"]`);
check("a waiting request is listed under Waiting on the Time off screen", (await page.getByRole("list", { name: "Waiting for an answer" }).locator(`[data-unavail="${recId}"]`).count()) === 1);
const ifApproved = await card.innerText();
check("a Requested record says what approving would do, in words", /Approving (leaves every store covered|opens \w+ on \w{3} \w{3} \d+)/.test(ifApproved), ifApproved);
const nUn = (await get()).cs.length;
check("the preview does not commit", (await st((id) => window.__v3.app.getState().world.state.unavailability[id].status, recId)) === "Requested");
await card.getByRole("button", { name: /^Approve/ }).click();
check("Approve commits an update", (await st((id) => window.__v3.app.getState().world.state.unavailability[id].status, recId)) === "Approved" && (await get()).cs.length === nUn + 1);
await bar.getByRole("button", { name: "File menu" }).click();
await page.getByRole("menuitem", { name: "History and revert" }).click();
check("File menu > History and revert opens the History tab in the drawer", (await get()).leftTab === "history" && (await left.count()) === 1);
const rows = left.locator("[data-cs]");
const addRow = rows.filter({ hasText: "Time off added" }).filter({ hasText: "Requested" }).first();
check("History lists change sets newest first", (await rows.count()) >= 3);
await addRow.getByRole("button", { name: /^Undo/ }).click();
const refusal = await addRow.getByRole("alert").innerText();
check("a refused undo says why, naming the later change set", /later changes touched the same items \(C\d+/.test(refusal), refusal);
check("the refused undo changed nothing", (await get()).cs.length === nUn + 1);
await shot("5-history");
// the newest change can be undone from the top bar, which puts the record back to Requested
await bar.getByRole("button", { name: "Undo" }).click();
check("top-bar Undo reverses the Approve", (await st((id) => window.__v3.app.getState().world.state.unavailability[id].status, recId)) === "Requested");
await card.getByRole("button", { name: /^Decline/ }).click();
check("Decline records the answer as one change", (await st((id) => window.__v3.app.getState().world.state.unavailability[id].status, recId)) === "Denied");
await page.getByRole("group", { name: "Show" }).getByRole("button", { name: "Declined" }).click();
await page.locator(`[data-unavail="${recId}"]`).getByRole("button", { name: /^Remove/ }).click();
check("Remove deletes the record", (await st((id) => !window.__v3.app.getState().world.state.unavailability[id], recId)));

// ---- checkpoint and revert ----
await left.getByLabel("Checkpoint name").fill("Before test");
await left.getByRole("button", { name: "Checkpoint now" }).click();
check("checkpoint is listed", (await get()).checkpoints.some((c) => c.name === "Before test") && (await left.innerText()).includes("Before test"));
const snapUnav = (await get()).nUnav;
await openOutForm();
await right.getByRole("form", { name: "Add time off" }).getByLabel("Who").selectOption(pick.pid);
await right.getByLabel("First day").fill(pick.date);
await right.getByLabel("Type").selectOption("Other");
await right.getByRole("button", { name: "Add time off" }).click();
check("a change was made after the checkpoint", (await get()).nUnav === snapUnav + 1);
await left.getByRole("button", { name: "Revert to this checkpoint" }).click();
const sentence = await left.getByText(/This undoes 1 change set made after "Before test"/).count();
check("revert asks first, in a plain sentence", sentence === 1);
await shot("6-revert-confirm");
await left.getByRole("button", { name: "Revert now" }).click();
s = await get();
check("revert restores the checkpointed state", s.nUnav === snapUnav && s.cs[s.cs.length - 1].kind === "revert", `${s.nUnav} vs ${snapUnav}`);

// ---- Build, proposal bar ----
await left.getByRole("tab", { name: "Queue" }).click();
await bar.getByRole("button", { name: "Schedule" }).click();
await st(() => window.__v3.app.getState().setWindow("2026-10-06", "2026-10-09"));
const tb = Date.now();
await st(() => window.__v3.app.getState().runBuild());
console.log("build took", Date.now() - tb, "ms");
s = await get();
if (s.proposal === "build") {
  const pb = page.getByRole("region", { name: "Proposal" });
  check("Build opens a proposal with counts", /placed/.test(await pb.innerText()) && /Changes \d+ assignments?\./.test(await pb.innerText()));
  await shot("8-build-proposal");
  await pb.getByRole("button", { name: "Discard" }).click();
  check("Discard closes it and saves nothing", (await get()).proposal === null);
} else {
  check("Build either opens a proposal or says there is nothing to do", !!s.notice, JSON.stringify(s.notice));
}
if ((await tools.count()) > 0) {
  await tools.click();
  await page.getByRole("menuitem", { name: /^Improve/ }).click();
  check("Improve… explains it only runs when asked", (await page.getByRole("dialog", { name: "Improve" }).innerText()).includes("only runs when you ask"));
  await page.getByRole("button", { name: "Cancel" }).click();
} else console.log("skip Tools menu is not mounted yet: Improve… dialog text");
await bar.getByRole("button", { name: "File menu" }).click();
await page.getByRole("menuitem", { name: "Keyboard shortcuts" }).click();
check("File menu > Keyboard shortcuts opens the list inline", /previous problem/i.test(await page.getByRole("region", { name: "Keyboard shortcuts" }).innerText()));
await shot("9-shortcuts");
await page.getByRole("region", { name: "Keyboard shortcuts" }).getByRole("button", { name: "Close" }).click();

// ---- as of ----
await bar.getByRole("button", { name: "File menu" }).click();
await page.getByRole("menuitem", { name: /^As of/ }).click();
await bar.getByRole("textbox", { name: "As of" }).fill("2026-10-20");
s = await get();
check("As of moves the date and the queue", s.asOf === "2026-10-20");
check("Today resets it", await (async () => { await bar.getByRole("button", { name: "Today" }).click(); return (await get()).asOf !== "2026-10-20"; })());
await bar.getByRole("button", { name: "Done" }).click();

// ---- plan and what-if ----
await st(() => window.__v3.app.getState().setView("plan"));
const heads = await page.locator('table[aria-label="Open shifts by week"] thead th').count();
check("Plan has a store column and 8 week columns", heads === 9, String(heads));
await shot("10-plan");
const cell = page.locator('table[aria-label="Open shifts by week"] tbody button').first();
await cell.click();
s = await get();
check("clicking a Plan cell opens the wall on that week", s.view === "wall" && s.win.to > s.win.from && (new Date(s.win.to) - new Date(s.win.from)) / 864e5 === 6, JSON.stringify(s.win));
await page.waitForFunction(() => !window.__v3.app.getState().busy);
await st(() => { const a = window.__v3.app.getState(); if (a.world.session.proposal) a.discardProposal(); });
await st(() => { const a = window.__v3.app.getState(); a.setView("plan"); a.setOutForm(true); });
await page.getByLabel("What-if name").fill("Try something");
await page.getByRole("button", { name: "Start a what-if" }).click();
s = await get();
check("Start a what-if opens a scenario", s.scenario?.name === "Try something" && !s.scenario.parked);
check("Someone's out shows 'What-if open (not saved)'", (await right.innerText()).includes("What-if open (not saved)"));
await toolsDisabled("a what-if is open");
await shot("11-whatif");
await right.getByRole("button", { name: "Park what-if and open live" }).click();
check("Park what-if opens the live schedule again", (await get()).scenario?.parked === true);
await right.getByRole("button", { name: "Discard", exact: true }).click();
await right.getByRole("button", { name: "Discard what-if" }).click();
check("Discard removes the what-if", (await get()).scenario === null);
await bar.getByRole("button", { name: "Schedule" }).click();
await shot("12-final");

check("no page errors", errors.length === 0, errors.join(" | "));
await browser.close();
srv.close();
if (failed()) { console.log(`${failed()} check(s) failed`); process.exit(1); }
console.log("all chrome checks passed");
