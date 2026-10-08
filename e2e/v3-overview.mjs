// The Overview (home) screen: how the month stands and what to do next. Opens the practice-with-problems month under the fixed clock (6 Oct 2026)
// and judges the screen against the domain: the status figures equal what `evaluate` says, every figure jumps to the right place, the thin-month
// ticks carry the colours `evaluate` gives, the checklist ticks off after real fixes, Start next month only previews, and a new file welcomes.
//   npm run build:v3 && node e2e/v3-overview.mjs
import { launch, serveV3, openApp, check, failed } from "./v3-lib.mjs";
import { RULE_BY_ID, api, evaluate, seedWorld, stateHash } from "../domain/src/index.ts";
import { flowContext, readWorld, sleep } from "./support/flow.mjs";

const browser = await launch();
const srv = await serveV3();
const ctx = await flowContext(browser, { shim: false });
const { page, errors } = await openApp(browser, srv.base, { context: ctx, practice: false });
await page.evaluate(() => window.__v3.loadProblems());
await page.waitForSelector("[data-overview]", { timeout: 15000 });
await page.evaluate(() => { const a = window.__v3.app.getState(); a.setAsOf("2026-10-06"); a.setWindow("2026-10-01", "2026-10-31"); });
await page.waitForTimeout(200);

const app = (fn, arg) => page.evaluate(fn, arg);
const ui = () => app(() => { const a = window.__v3.app.getState(); return { view: a.view, sel: a.selection, drawer: a.drawer, leftTab: a.leftTab, win: a.window, busy: a.busy, proposal: !!a.world?.session.proposal, notice: a.notice?.text ?? "", setupTab: a.setupTab, repair: !!a.repairResult }; });
const hash = async () => stateHash((await readWorld(page)).state);
const home = async () => { await page.locator("header").getByRole("button", { name: "Overview" }).click(); await page.waitForSelector("[data-overview]"); await page.waitForTimeout(100); };
const idle = () => page.waitForFunction(() => !window.__v3.app.getState().busy, null, { timeout: 120000 });

// ---- what the domain says
const ASOF = "2026-10-07", FROM = "2026-10-01", TO = "2026-10-31";
function domainFacts(state) {
  const ev = evaluate(state, ASOF, { range: { from: FROM, to: TO } });
  const open = Object.values(ev.cells).filter((c) => c.date >= ASOF && c.date <= TO && c.open > 0).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const breaks = new Map(); // one person, one day, one rule = one problem (it may mark two cells)
  const breakCells = new Set();
  const cellBreak = new Set();
  const placed = new Set();
  for (const a of Object.values(state.assignments)) {
    if (a.date < FROM || a.date > TO) continue;
    placed.add(`${a.storeId}|${a.date}`);
    for (const r of ev.assignments[a.id]?.results ?? []) {
      if (r.verdict !== "Fail" || r.overridden || RULE_BY_ID[r.ruleId]?.kind !== "presence") continue;
      cellBreak.add(`${a.storeId}|${a.date}`);
      if (a.date < ASOF) continue;
      const k = `${a.pharmacistId}|${a.date}|${r.ruleId}`;
      if (!breaks.has(k)) breaks.set(k, { date: a.date, storeId: a.storeId, pharmacistId: a.pharmacistId });
      breakCells.add(`${a.storeId}|${a.date}`);
    }
  }
  const firstBreak = [...breaks.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))[0];
  const recs = Object.values(state.unavailability);
  return {
    ev, placed, cellBreak,
    openShifts: open.reduce((n, c) => n + c.open, 0), openCells: open, ruleBreaks: breaks.size, breakCells: breakCells.size, firstBreak,
    waiting: recs.filter((u) => u.status === "Requested" && u.last >= ASOF).length,
    out: new Set(recs.filter((u) => (u.status === "Approved" || u.status === "Actual") && u.type !== "Turned-down" && u.first <= ASOF && u.last >= ASOF).map((u) => u.pharmacistId)).size,
  };
}
const figure = async (name) => Number(((await page.locator(`[data-figure="${name}"]`).innerText()).match(/\d+/) ?? ["NaN"])[0]);

// ---- 1. it is the first screen and the first tab
let u = await ui();
check("a schedule opens on the Overview", u.view === "overview", u.view);
const tabs = await page.locator("header nav button").allInnerTexts();
check("Overview is the first tab, Schedule second", /^Overview/.test(tabs[0]) && /^Schedule/.test(tabs[1]), tabs.join(" | "));
check("the Overview tab is the current page", (await page.locator("header").getByRole("button", { name: "Overview" }).getAttribute("aria-current")) === "page");

// ---- 2. the status figures equal the domain's numbers
let w = await readWorld(page);
let d = domainFacts(w.state);
check("the domain really has open shifts, rule breaks, waiting requests (the world is a practice month with problems)", d.openShifts > 0 && d.ruleBreaks > 0 && d.waiting > 0, JSON.stringify({ o: d.openShifts, r: d.ruleBreaks, w: d.waiting }));
check("shifts needing cover equals the domain count", (await figure("open")) === d.openShifts, `${await figure("open")} vs ${d.openShifts}`);
check("rule breaks equals the domain count (one person at two stores is one)", (await figure("double")) === d.ruleBreaks, `${await figure("double")} vs ${d.ruleBreaks}`);
check("requests waiting equals the domain count", (await figure("waiting")) === d.waiting);
check("out today equals the domain count", (await figure("away")) === d.out);
const tipOf = (sel) => page.locator(sel).getAttribute("data-tip");
check("the rule-breaks note counts marked cells as well as problems", /\d+ cells? marked/.test(await tipOf('[data-figure="double"]')), await tipOf('[data-figure="double"]'));
const leafText = await page.locator('[data-figure="next"]').getAttribute("aria-label");
const firstDate = [d.openCells[0]?.date, d.firstBreak?.date].filter(Boolean).sort()[0];
check("the next-problem page shows the first problem's date", !!leafText && new RegExp(`${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date(firstDate + "T00:00:00Z").getUTCDay()]} Oct ${Number(firstDate.slice(8))}`).test(leafText), `${leafText} vs ${firstDate}`);

// ---- 3. each figure jumps to the right place
await page.locator('[data-figure="open"]').click();
u = await ui();
check("shifts needing cover opens the wall at the first open shift", u.view === "wall" && u.sel?.date === d.openCells[0].date && u.sel?.storeId === d.openCells[0].storeId, JSON.stringify(u.sel));
await home();
await page.locator('[data-figure="double"]').click();
u = await ui();
check("rule breaks opens the wall at the first break", u.view === "wall" && u.sel?.date === d.firstBreak.date, JSON.stringify(u.sel));
await home();
await page.locator('[data-figure="waiting"]').click();
u = await ui();
check("requests waiting opens Time off", u.view === "timeoff", u.view);
await home();
await page.locator('[data-figure="away"]').click();
u = await ui();
check("out today opens Time off", u.view === "timeoff", u.view);
await home();
await page.locator('[data-figure="next"]').click();
u = await ui();
check("the next-problem page opens the wall on that date", u.view === "wall" && u.sel?.date === firstDate, JSON.stringify(u.sel));
await home();
await page.getByRole("button", { name: /^See all/ }).click();
u = await ui();
check("See all opens the wall with the problem list", u.view === "wall" && u.drawer && u.leftTab === "queue", JSON.stringify(u));
await app(() => window.__v3.app.getState().setDrawer(false));
await home();
await page.getByRole("button", { name: "Next month" }).click();
check("the month arrows move the month (and the dial)", (await page.locator("[data-month-label]").innerText()) === "November 2026");
await page.getByRole("button", { name: "Previous month" }).click();
check("... and back", (await page.locator("[data-month-label]").innerText()) === "October 2026");

// ---- 4. the thin month: tick colours match evaluate
const thin = await page.locator("[data-thin-month] button[data-state]").evaluateAll((els) => els.map((e) => ({ code: e.closest("[data-store-row]").getAttribute("data-store-row"), date: e.getAttribute("data-date"), st: e.getAttribute("data-state") })));
const byCode = Object.fromEntries(Object.values(w.state.stores).map((s) => [s.code, s.id]));
const expectState = (sid, date) => {
  const c = d.ev.cells[`${sid}|${date}`]; const k = `${sid}|${date}`;
  if (d.cellBreak.has(k)) return "break";
  if (c && c.open > 0) return "open";
  if ((!c || c.required === 0) && !d.placed.has(k)) return "closed";
  return "ok";
};
const rowsN = new Set(thin.map((t) => t.code)).size;
check("the thin month has one row per store and a tick per day", rowsN === Object.keys(w.state.stores).length && thin.length === rowsN * 31, `${rowsN} rows, ${thin.length} ticks`);
let wrong = thin.filter((t) => t.st !== expectState(byCode[t.code], t.date));
check("every tick's colour matches evaluate", wrong.length === 0, wrong.slice(0, 4).map((t) => `${t.code} ${t.date} ${t.st} vs ${expectState(byCode[t.code], t.date)}`).join("; "));
const seen = new Set(thin.map((t) => t.st));
check("all four tick kinds occur in this month (covered, needs cover, rule broken, closed)", ["ok", "open", "break", "closed"].every((s) => seen.has(s)), [...seen].join(","));
check("open ticks equal the domain's open cells that are not broken", thin.filter((t) => t.st === "open").length === [...new Set(Object.values(d.ev.cells).filter((c) => c.date >= FROM && c.date <= TO && c.open > 0 && !d.cellBreak.has(`${c.storeId}|${c.date}`)).map((c) => `${c.storeId}|${c.date}`))].length);
// a day and a store jump
const openTick = thin.find((t) => t.st === "open" && t.date >= ASOF);
await page.locator(`[data-store-row="${openTick.code}"] [data-date="${openTick.date}"]`).click();
u = await ui();
check("a day opens that day on the wall", u.view === "wall" && u.sel?.date === openTick.date && u.sel?.storeId === byCode[openTick.code], JSON.stringify(u.sel));
await home();
await page.locator(`[data-store-row="${openTick.code}"] button[data-rc$=",0"]`).click();
u = await ui();
check("a store opens it on the wall", u.view === "wall" && u.sel?.storeId === byCode[openTick.code], JSON.stringify(u.sel));
await home();
// keyboard: one tab stop, arrows move
const stops = await page.locator("[data-thin-month] button[tabindex='0']").count();
check("the thin month is one tab stop", stops === 1, String(stops));
await page.locator("[data-thin-month] button[tabindex='0']").focus();
await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowDown");
check("arrow keys move between ticks", (await page.evaluate(() => document.activeElement?.getAttribute("data-rc"))) === "1,1");
await page.keyboard.press("Enter");
u = await ui();
check("Enter on a tick opens that day", u.view === "wall" && !!u.sel?.date);
await home();

// ---- 5. next up: five problems, Fix and Find cover
const rows = await page.locator("[data-next-up] li").count();
check("Next up lists five problems", rows === 5, String(rows));
const firstRow = await page.locator("[data-next-up] li").first().innerText();
check("the first row is the first problem in date order", firstRow.includes(`Oct ${Number(firstDate.slice(8))}`), firstRow);
const before = await hash();
const csBefore = (await readWorld(page)).journal.changeSets.length;
const sug = page.locator("[data-next-up] [data-queue-suggestion]");
check("open rows carry the best single person and a Preview", (await sug.count()) >= 1 && /^Best: /.test(await sug.first().locator("b").innerText()), String(await sug.count()));
check("waiting time off is listed with what approving would do", (await page.locator("[data-waiting] [data-consequence]").count()) >= 1);
check("the briefing says what changed since posting and what the next two weeks hold", (await page.locator("[data-changed]").count()) === 1 && (await page.locator("[data-coming-up]").count()) === 1);
await sug.first().getByRole("button", { name: /^Preview / }).click();
u = await ui();
check("Preview opens a proposal and the wall", u.proposal && u.view === "wall", JSON.stringify({ p: u.proposal, v: u.view }));
await app(() => window.__v3.app.getState().discardProposal());
check("nothing was written by looking (hash unchanged, no change set)", (await hash()) === before && (await readWorld(page)).journal.changeSets.length === csBefore);
await app(() => window.__v3.app.setState({ repairResult: null }));
await home();
const fixBtn = page.locator("[data-next-up] li").getByRole("button", { name: /^Fix:/ }).first();
await fixBtn.click();
u = await ui();
check("Fix opens the wall with the person selected", u.view === "wall" && !!u.sel?.pharmacistId, JSON.stringify(u.sel));
await home();

// ---- 6. the checklist reflects the state and ticks off after fixes
const items = async () => app(() => Object.fromEntries([...document.querySelectorAll("[data-checklist] [data-item]")].map((li) => [li.getAttribute("data-item"), { done: li.getAttribute("data-done") === "true", text: li.innerText.replace(/\s+/g, " ") }])));
let it = await items();
check("the checklist has the six steps", Object.keys(it).join() === "setup,requests,cover,rules,posted,saved", Object.keys(it).join());
check("licences and drive times are not done (some are missing)", !it.setup.done && /missing/.test(it.setup.text), it.setup.text);
check("requests are not done and say how many wait", !it.requests.done && new RegExp(`${d.waiting} waiting`).test(it.requests.text), it.requests.text);
check("cover and rule breaks are not done", !it.cover.done && !it.rules.done);
check("posted is not done (the month changed since it was posted)", !it.posted.done && /Changed since posting/.test(it.posted.text), it.posted.text);
// decide every waiting request (the same edit the Time off page makes)
const waitingIds = Object.values(w.state.unavailability).filter((x) => x.status === "Requested" && x.last >= ASOF).map((x) => x.id);
await app((ids) => { const a = window.__v3.app.getState(); ids.forEach((id, i) => a.commit([{ t: "unavail.update", id, patch: { status: i % 2 ? "Denied" : "Approved" } }])); }, waitingIds);
await page.waitForTimeout(200);
it = await items();
check("requests tick off once they are decided", it.requests.done, it.requests.text);
check("and the Time off figure goes to zero", (await figure("waiting")) === 0);
// cover one open shift for real: search, preview, accept
w = await readWorld(page);
d = domainFacts(w.state);
const gap = d.openCells[0];
await app(async (g) => { await window.__v3.app.getState().runRepair([g], false); }, { storeId: gap.storeId, date: gap.date });
const opt = await app(() => !!window.__v3.app.getState().repairResult?.result.options[0]);
if (opt) {
  await app(() => { const a = window.__v3.app.getState(); a.previewRepair(a.repairResult.result.options[0]); a.acceptProposal(); });
  await home();
  w = await readWorld(page);
  const d2 = domainFacts(w.state);
  check("accepting a cover lowers the figure and it still equals the domain", d2.openShifts < d.openShifts && (await figure("open")) === d2.openShifts, `${await figure("open")} vs ${d2.openShifts} (was ${d.openShifts})`);
  d = d2;
} else check("a cover option was found to accept", false);
// post the month
await app(() => window.__v3.app.getState().post({ from: "2026-10-01", to: "2026-10-31" }));
const tellNow = await app(() => window.__v3.app.getState().world.journal.snapshots.length);
check("posting made a revision", tellNow >= 1, String(tellNow));
await home();
it = await items();
check("right after posting, the item is done", it.posted.done, it.posted.text);
// the item links
await page.locator('[data-item="setup"] button').click();
u = await ui();
check("Licences and drive times links to Setup > Check", u.view === "setup" && u.setupTab === "checks", JSON.stringify(u));
await home();
await page.locator('[data-item="requests"]').getByRole("button").count().then((n) => check("a done item has no button", n === 0));
await page.locator('[data-item="cover"] button').click();
u = await ui();
check("Every shift covered links to the first open shift on the wall", u.view === "wall" && !!u.sel?.date, JSON.stringify(u.sel));
await home();

// ---- 7. Start next month: previews, never writes
await app(() => { const a = window.__v3.app.getState(); a.setAsOf("2026-10-20"); a.setWindow("2026-10-01", "2026-10-31"); });
await page.waitForTimeout(200);
check("past mid-month the Start next month card is shown", await page.locator("[data-next-month]").isVisible());
const h0 = await hash();
const cs0 = (await readWorld(page)).journal.changeSets.length;
await page.getByRole("button", { name: "Build November" }).click();
await idle();
u = await ui();
check("Build November opens the wall on November", u.view === "wall" && u.win.from === "2026-11-01" && u.win.to === "2026-11-30", JSON.stringify(u.win));
if (u.proposal) {
  check("Build November opened a proposal to look at", await page.getByRole("region", { name: "Proposal" }).isVisible());
  check("the proposal is a preview: the schedule is unchanged until Accept", (await hash()) === h0);
  await page.getByRole("button", { name: "Discard" }).click();
} else check("Build found nothing to do (a message, no change)", u.notice.length > 0, u.notice);
check("Discard leaves the state hash unchanged", (await hash()) === h0);
check("and no change set was written", (await readWorld(page)).journal.changeSets.length === cs0);
await home();
await page.getByRole("button", { name: "Use usual patterns" }).click();
u = await ui();
if (u.proposal) { check("Use usual patterns opened a preview", true); check("the preview changed nothing yet", (await hash()) === h0); await page.getByRole("button", { name: "Discard" }).click(); }
else check("Use usual patterns says nothing needs copying", /usual days|nothing/i.test(u.notice), u.notice);
check("the state hash is still the same", (await hash()) === h0);
await app(() => { const a = window.__v3.app.getState(); a.setAsOf("2026-10-06"); a.setWindow("2026-10-01", "2026-10-31"); a.setView("overview"); });

// ---- 8. a brand-new file welcomes
const empty = JSON.parse(JSON.stringify(seedWorld({ stores: [], pharmacists: [] })));
await app((wd) => window.__v3.app.getState().setWorld(wd, { fileName: "New.sqlite" }), empty);
await page.waitForSelector("[data-welcome]", { timeout: 5000 });
check("a new empty file shows the welcome line", /Start with your stores/.test(await page.locator("[data-welcome]").innerText()));
await page.getByRole("button", { name: "Add stores" }).click();
u = await ui();
check("Add stores opens Setup > Stores", u.view === "setup" && u.setupTab === "stores", JSON.stringify(u));

check("no console errors", errors.length === 0, errors.join(" | "));
await browser.close();
srv.close();
process.exit(failed() ? 1 : 0);
