// The Time off page on the practice month with problems (fixed clock, 6 Oct 2026): the header bars, the waiting list with what approving does in words,
// approve / decline and Undo returning the exact state, the month's load reflecting a new absence, the day detail with people who could be called,
// the Add drawer's preview, the Sick today path, the remembered filter and the keyboard.
import { launch, serveV3, openApp, check, failed } from "./v3-lib.mjs";
import { flowContext, readWorld } from "./support/flow.mjs";
import { evaluate, stateHash } from "../domain/src/index.ts";

const TODAY = "2026-10-06";
const b = await launch();
const srv = await serveV3();
const ctx = await flowContext(b, { shim: false });
const { page, errors } = await openApp(b, srv.base, { practice: false, context: ctx });
await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" });
await page.evaluate(() => { window.__v3.loadProblems(); window.__v3.app.getState().setView("wall"); });
await page.waitForSelector('[role="gridcell"]');
const app = (fn, arg) => page.evaluate(fn, arg);
const world = () => readWorld(page);
const hash = async () => stateHash((await world()).state);
const goTimeOff = async () => { await app((d) => { const a = window.__v3.app.getState(); a.setAsOf(d); a.setView("timeoff"); a.clearNotice(); }, TODAY); await page.waitForSelector("[data-request-list]"); };
await goTimeOff();
const toast = () => page.locator("div.fixed.right-4");
const undoToast = async () => { await toast().getByRole("button", { name: "Undo" }).click(); await page.waitForTimeout(100); };
const nameOf = (w, id) => w.state.pharmacists[id].name;

const left = page.locator('aside[aria-label="Left panel"]');
const right = page.locator('aside[aria-label="Inspector"]');
const tab = (name) => left.getByRole("group", { name: "Show" }).getByRole("button", { name });
const sheetCell = (pid, d) => page.locator(`[role="gridcell"][data-pid="${pid}"][data-date="${d}"]`);

// ---- 1. the header is informational
{
  const hero = page.locator("section.hero-band");
  check("with nothing selected the header says No day selected", /No day selected/.test(await hero.innerText()));
  check("the header has no buttons (only the month dial)", (await hero.locator("button").count()) === 0);
  check("the Add and Sick buttons sit above the sheet", (await page.locator(".w-controls").getByRole("button", { name: "Add time off" }).count()) === 1 && (await page.locator(".w-controls").getByRole("button", { name: "Out sick" }).count()) === 1);
}

// ---- 2. the waiting list: soonest first, consequence in words; a click selects the request
const waitingIds = async () => left.getByRole("list", { name: "Waiting for an answer" }).locator("li").evaluateAll((els) => els.map((e) => e.getAttribute("data-unavail")));
{
  const ids = await waitingIds();
  const w = await world();
  const exp = Object.values(w.state.unavailability).filter((u) => u.status === "Requested" && u.last >= TODAY && u.type !== "Turned-down").sort((a, c) => (a.first < c.first ? -1 : a.first > c.first ? 1 : a.id < c.id ? -1 : 1)).map((u) => u.id);
  check("Waiting lists every waiting request, soonest first", JSON.stringify(ids) === JSON.stringify(exp), `${ids} vs ${exp}`);
  const texts = await left.getByRole("list", { name: "Waiting for an answer" }).locator("li").evaluateAll((els) => els.map((e) => e.querySelector("[data-consequence]")?.textContent ?? ""));
  check("every row says what approving does before you decide", texts.length > 0 && texts.every((t) => /Approving leaves (every store covered|\d+ store days? short)/.test(t)), texts.join(" || "));
  check("the tab shows how many wait", (await tab("Waiting").innerText()).includes(String(ids.length)));
  await left.locator(`[data-unavail="${ids[0]}"] button`).click();
  const card = right.locator(`[data-unavail="${ids[0]}"]`);
  await card.waitFor();
  const t = await card.innerText();
  check("the Inspector says what approving does, in words, with who could cover", /Approving (leaves every store covered|opens [A-Z0-9]+ on \w{3} \w{3} \d+)/.test(t), t);
  check("it offers Approve and Decline", (await card.getByRole("button", { name: /^Approve/ }).count()) === 1 && (await card.getByRole("button", { name: /^Decline/ }).count()) === 1);
  const hero = await page.locator("section.hero-band").innerText();
  check("the header explains the request (who, dates, waiting)", /asked for/.test(hero) && /waiting for your answer/.test(hero), hero.replace(/\s+/g, " ").slice(0, 160));
  check("the row is marked as the current one", (await left.locator(`[data-unavail="${ids[0]}"] button`).getAttribute("aria-current")) === "true");
}

// ---- 3. approve then Undo returns the exact state; decline likewise
{
  const ids = await waitingIds();
  const h0 = await hash();
  const n0 = (await world()).journal.changeSets.length;
  await right.locator(`[data-unavail="${ids[0]}"]`).getByRole("button", { name: /^Approve/ }).click();
  let w = await world();
  check("Approve is one change set", w.journal.changeSets.length === n0 + 1 && w.state.unavailability[ids[0]].status === "Approved");
  check("the toast says what happened and offers Undo", /Approved time off for/.test(await toast().innerText()) && (await toast().getByRole("button", { name: "Undo" }).count()) === 1);
  check("the approved request leaves the waiting list", !(await waitingIds()).includes(ids[0]));
  check("approving the last waiting request does not flip the tab", (await tab("Waiting").getAttribute("aria-pressed")) === "true");
  await undoToast();
  check("Undo returns the exact state (same hash)", (await hash()) === h0);
  check("the request is waiting again", (await waitingIds()).includes(ids[0]));
  await left.locator(`[data-unavail="${ids[1]}"] button`).click();
  await right.locator(`[data-unavail="${ids[1]}"]`).getByRole("button", { name: /^Decline/ }).click();
  w = await world();
  check("Decline records Denied as one change set", w.state.unavailability[ids[1]].status === "Denied" && w.journal.changeSets.length === n0 + 3);
  await undoToast();
  check("Undo of a decline returns the exact state", (await hash()) === h0);
}

// ---- 4. filter tabs remember the last choice
{
  await tab("Approved").click();
  check("Approved tab lists approved time off", (await left.getByRole("list", { name: "Approved time off" }).locator("li").count()) > 0);
  await app(() => window.__v3.app.getState().setView("wall"));
  await goTimeOff();
  check("the filter is remembered after leaving the page", (await tab("Approved").getAttribute("aria-pressed")) === "true");
  check("and it is kept in the browser's storage", (await page.evaluate(() => localStorage.getItem("hs-timeoff-tab"))) === "approved");
  await tab("Declined").click();
  check("Declined tab opens (empty here) without error", (await left.getByText("Nothing declined.").count()) === 1);
  await tab("Waiting").click();
}

// ---- 5. the sheet: pharmacists down the side, days across; every cell agrees with the domain
{
  check("today is marked", (await page.locator(".w-asof-head").count()) === 1);
  const w = await world();
  const dates = await page.locator('[role="gridcell"][data-r="0"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-date")));
  const first = dates[0], last = dates.at(-1);
  const active = Object.values(w.state.pharmacists).filter((p) => p.inactiveFrom === undefined || p.inactiveFrom > first);
  check("one row per active pharmacist", (await page.locator('[role="row"][data-ri]').count()) === active.length, `${await page.locator('[role="row"][data-ri]').count()} vs ${active.length}`);
  const expect = { approved: new Set(), waiting: new Set(), declined: new Set() };
  for (const u of Object.values(w.state.unavailability)) {
    if (u.scopeStoreId || u.type === "Turned-down") continue;
    const kind = u.status === "Requested" ? "waiting" : u.status === "Denied" ? "declined" : "approved";
    for (let d = u.first; d <= u.last; d = new Date(Date.parse(d + "T12:00:00Z") + 864e5).toISOString().slice(0, 10)) if (d >= first && d <= last) expect[kind].add(`${u.pharmacistId}|${d}`);
  }
  const seen = (sel) => page.locator(`[role="gridcell"]${sel}`).evaluateAll((els) => els.map((e) => `${e.getAttribute("data-pid")}|${e.getAttribute("data-date")}`));
  const approved = new Set([...(await seen('[data-block="away"]')), ...(await seen('[data-block="good"]'))]);
  const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
  // a day with both an approved and a waiting record shows as approved
  for (const k of expect.approved) expect.waiting.delete(k);
  check("the off cells are exactly the approved days", sameSet(approved, expect.approved), `${approved.size} vs ${expect.approved.size}`);
  check("the waiting cells are exactly the waiting days", sameSet(new Set(await seen('[data-block="req"]')), expect.waiting));
  check("a cell that is off and still scheduled shows the store code and is rose", (await page.locator('[role="gridcell"][data-block="good"] .w-frac').count()) >= 1);
  check("an approved bar carries the palm picture", (await page.locator('[role="gridcell"][data-icon="away"]').count()) >= 1);
  check("a waiting request carries the clock", (await page.locator('[role="gridcell"][data-icon="waiting"]').count()) >= 1);
  check("a cell has a hover note in the project's style", /\|/.test(await page.locator('[role="gridcell"][data-block="req"]').first().getAttribute("data-tip")));
  // keyboard
  const any = page.locator('[role="gridcell"][data-r="0"]').nth(3);
  await any.focus();
  await page.keyboard.press("ArrowRight");
  check("Arrow keys move between days", (await page.evaluate(() => document.activeElement?.getAttribute("data-c"))) === "4");
  await page.keyboard.press("ArrowDown");
  check("ArrowDown moves to the next person", (await page.evaluate(() => document.activeElement?.getAttribute("data-r"))) === "1");
  await page.keyboard.press("Enter");
  check("Enter selects the day: the Inspector shows that person", (await right.locator("[data-day-inspector]").count()) === 1);
  check("an empty day says so", /Not off|Working at/.test(await right.locator('[data-testid="cell-status"]').innerText()), await right.locator('[data-testid="cell-status"]').innerText());
  await app(() => window.__v3.app.getState().select(null));
}

// ---- 6. the Add drawer: preview before saving, and the month reflects the new absence
{
  const w = await world();
  const date = "2026-10-14";
  const offIds = new Set(Object.values(w.state.unavailability).filter((u) => (u.status === "Approved" || u.status === "Actual") && u.first <= date && date <= u.last).map((u) => u.pharmacistId));
  // someone working that day alone at a store, so the preview has something to say
  const ev = evaluate(w.state, TODAY, { range: { from: date, to: date } });
  const solo = Object.values(w.state.assignments).find((a) => a.date === date && !offIds.has(a.pharmacistId) && (ev.cells[`${a.storeId}|${date}`]?.counted ?? 0) === (ev.cells[`${a.storeId}|${date}`]?.required ?? 0) && (ev.cells[`${a.storeId}|${date}`]?.required ?? 0) === 1);
  check("(setup) found a pharmacist who is the only one at a store on 14 Oct", !!solo);
  await page.locator(".w-controls").getByRole("button", { name: "Add time off" }).click();
  const drawer = page.locator("[data-add-drawer]");
  await drawer.waitFor();
  await drawer.getByLabel("Who").selectOption(solo.pharmacistId);
  await drawer.getByLabel("First day").fill(date);
  await drawer.getByRole("group", { name: "Kind" }).getByRole("button", { name: "Other" }).click();
  const h0 = await hash();
  const prev = await drawer.locator("[data-add-preview]").innerText();
  check("the drawer says what it would leave uncovered before saving", /Saving this opens [A-Z0-9]+ on Wed Oct 14/.test(prev), prev);
  check("the preview saves nothing", (await hash()) === h0);
  await drawer.getByLabel("Note").fill("Dentist");
  await drawer.getByRole("button", { name: "Add time off" }).click();
  await drawer.waitFor({ state: "detached" });
  const w2 = await world();
  const rec = Object.values(w2.state.unavailability).find((u) => u.pharmacistId === solo.pharmacistId && u.first === date && u.type === "Other");
  check("saving adds an Approved record with the note, as one change set", rec?.status === "Approved" && rec?.note === "Dentist" && w2.journal.changeSets.length === w.journal.changeSets.length + 1);
  check("the sheet shows that person off on that day", /^(away|good)$/.test((await sheetCell(solo.pharmacistId, date).getAttribute("data-block")) ?? ""), String(await sheetCell(solo.pharmacistId, date).getAttribute("data-block")));
  await sheetCell(solo.pharmacistId, date).click();
  check("and the Inspector shows the store they leave short", (await right.locator(`[data-open-store="${solo.storeId}"]`).count()) === 1);
  await undoToast();
  check("Undo returns the exact state", (await hash()) === h0);
  check("and the sheet goes back", (await sheetCell(solo.pharmacistId, date).getAttribute("data-block")) === "none");
}

// ---- 7. the selected day: stores left short and who could be called
{
  await app(() => window.__v3.app.getState().select(null));
  const clashes = await page.locator('[role="gridcell"][data-block="good"][data-pid]').evaluateAll((els) => els.map((e) => ({ pid: e.getAttribute("data-pid"), date: e.getAttribute("data-date") })));
  check("(setup) a person is off but still scheduled", clashes.length >= 1);
  let pick = null;
  for (const c of clashes.slice(0, 12)) {
    await sheetCell(c.pid, c.date).click();
    if ((await right.locator("[data-open-store]").count()) >= 1) { pick = c; break; }
  }
  check("click a day opens its details with the stores it leaves short", !!pick);
  const hero = await page.locator("section.hero-band").innerText();
  check("the header names the person and says the store is short", /Still scheduled at/.test(hero), hero.replace(/\s+/g, " ").slice(0, 200));
  const first = right.locator("[data-open-store]").first();
  const callers = first.locator("[data-caller]");
  check("it lists who could be called, with the Schedule's pictures", (await callers.count()) >= 1 && (await callers.first().locator("[data-tag]").count()) >= 1);
  const store = await first.getAttribute("data-open-store");
  const day = pick.date;
  const h0 = await hash();
  const before = Object.values((await world()).state.assignments).filter((a) => a.storeId === store && a.date === day).length;
  await callers.first().getByRole("button", { name: /^(Place|Move here)/ }).click();
  const after = Object.values((await world()).state.assignments).filter((a) => a.storeId === store && a.date === day).length;
  check("Place puts the person there as one change", after === before + 1);
  await undoToast();
  check("Undo returns the exact state", (await hash()) === h0);
  await sheetCell(pick.pid, day).click();
  await right.getByRole("button", { name: /^Find cover for/ }).first().click();
  await page.waitForFunction(() => !window.__v3.app.getState().busy, null, { timeout: 90000 });
  check("Find cover shows its options", (await page.getByRole("region", { name: "Cover options" }).count()) === 1);
  check("it changed nothing by itself", (await hash()) === h0);
  await app(() => window.__v3.app.getState().select(null));
}

// ---- 8. Out sick (today)
{
  const w = await world();
  const ev = evaluate(w.state, TODAY, { range: { from: TODAY, to: TODAY } });
  const offToday = new Set(Object.values(w.state.unavailability).filter((u) => (u.status === "Approved" || u.status === "Actual") && u.first <= TODAY && TODAY <= u.last).map((u) => u.pharmacistId));
  const solo = Object.values(w.state.assignments).find((a) => a.date === TODAY && !offToday.has(a.pharmacistId) && (ev.cells[`${a.storeId}|${TODAY}`]?.covered ?? 0) === 1 && (ev.cells[`${a.storeId}|${TODAY}`]?.required ?? 0) === 1);
  check("(setup) someone is the only pharmacist at a store today", !!solo);
  const h0 = await hash();
  await page.locator(".w-controls").getByRole("button", { name: "Out sick" }).click();
  const drawer = page.locator("[data-add-drawer]");
  await drawer.getByLabel("Who is out sick?").selectOption(solo.pharmacistId);
  check("it says what that would leave uncovered before marking", /Saving this opens [A-Z0-9]+ on Tue Oct 6/.test(await drawer.locator("[data-add-preview]").innerText()));
  check("nothing is saved by looking", (await hash()) === h0);
  await drawer.getByRole("button", { name: "Mark out sick" }).click();
  const w2 = await world();
  const rec = Object.values(w2.state.unavailability).find((u) => u.pharmacistId === solo.pharmacistId && u.type === "Sick" && u.first === TODAY);
  check("Sick today marks today unavailable (Approved, Sick, one day) in one change set", rec?.status === "Approved" && rec.first === rec.last && w2.journal.changeSets.length === w.journal.changeSets.length + 1);
  const store = drawer.locator(`[data-open-store="${solo.storeId}"]`);
  check("it immediately shows the store they leave short", (await store.count()) === 1);
  check("with people who could cover, and a Find cover button", (await store.locator("[data-caller]").count()) >= 1 && (await store.getByRole("button", { name: /^Find cover for/ }).count()) === 1);
  await store.getByRole("button", { name: /^Find cover for/ }).click();
  await page.waitForFunction(() => !window.__v3.app.getState().busy, null, { timeout: 90000 });
  check("Find cover shows ways to cover", (await drawer.getByRole("region", { name: "Cover options" }).count()) === 1);
  await drawer.getByRole("button", { name: "Done" }).click();
  await drawer.waitFor({ state: "detached" });
  await app(() => window.__v3.app.getState().discardProposal?.());
  await undoToast().catch(() => {});
  if ((await hash()) !== h0) { await page.locator("header").getByRole("button", { name: "Undo" }).click(); await page.waitForTimeout(100); }
  check("Undo of the sick call returns the exact state", (await hash()) === h0);
}

// ---- 8b. Out sick tomorrow, and for several days
{
  const w = await world();
  const TOM = "2026-10-07", END = "2026-10-09";
  const ev = evaluate(w.state, TODAY, { range: { from: TOM, to: END } });
  const off = (d) => new Set(Object.values(w.state.unavailability).filter((u) => (u.status === "Approved" || u.status === "Actual") && u.first <= d && d <= u.last).map((u) => u.pharmacistId));
  const solo = Object.values(w.state.assignments).find((a) => a.date === TOM && !off(TOM).has(a.pharmacistId) && (ev.cells[`${a.storeId}|${TOM}`]?.covered ?? 0) === 1 && (ev.cells[`${a.storeId}|${TOM}`]?.required ?? 0) === 1);
  check("(setup) someone is the only pharmacist at a store tomorrow", !!solo);
  const h0 = await hash();
  await page.locator(".w-controls").getByRole("button", { name: "Out sick" }).click();
  const drawer = page.locator("[data-add-drawer]");
  await drawer.getByRole("group", { name: "Which day" }).getByRole("button", { name: "Tomorrow" }).click();
  await drawer.getByRole("group", { name: "How many days" }).getByRole("button", { name: "3 days" }).click();
  check("the form says the dates it covers", /Oct 7/.test(await drawer.innerText()) && /Oct 9/.test(await drawer.innerText()));
  await drawer.getByLabel("Who is out sick?").selectOption(solo.pharmacistId);
  check("looking saves nothing", (await hash()) === h0);
  await drawer.getByRole("button", { name: "Mark out sick" }).click();
  const w2 = await world();
  const rec = Object.values(w2.state.unavailability).find((u) => u.pharmacistId === solo.pharmacistId && u.type === "Sick" && u.first === TOM);
  check("tomorrow, three days: one Approved Sick record Oct 7 to Oct 9 in one change set", rec?.status === "Approved" && rec.last === END && w2.journal.changeSets.length === w.journal.changeSets.length + 1, JSON.stringify(rec));
  check("the cover list is grouped by the day each store is left short", (await drawer.locator("[data-sick-day]").count()) >= 1 && (await drawer.locator(`[data-sick-day="${TOM}"] [data-open-store="${solo.storeId}"]`).count()) === 1);
  await drawer.getByRole("button", { name: "Done" }).click();
  await drawer.waitFor({ state: "detached" });
  await app(() => window.__v3.app.getState().discardProposal?.());
  await page.locator("header").getByRole("button", { name: "Undo" }).click(); await page.waitForTimeout(100);
  check("Undo returns the exact state", (await hash()) === h0);
}

// ---- 9. the compact Someone's out form shows the preview too
{
  await app(() => { const a = window.__v3.app.getState(); a.setView("wall"); a.setOutForm(true); });
  const form = page.getByRole("form", { name: "Add time off" });
  await form.waitFor();
  check("the Someone's out form previews what it would leave uncovered", (await form.locator("[data-add-preview]").count()) === 1);
  await app(() => window.__v3.app.getState().setOutForm(false));
}

check("no console errors", errors.length === 0, errors.join(" | "));
await b.close(); srv.close();
process.exit(failed() ? 1 : 0);
