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
const goTimeOff = async () => { await app((d) => { const a = window.__v3.app.getState(); a.setAsOf(d); a.setView("timeoff"); a.clearNotice(); }, TODAY); await page.waitForSelector("[data-standing]"); };
await goTimeOff();
const toast = () => page.locator("div.fixed.right-4");
const undoToast = async () => { await toast().getByRole("button", { name: "Undo" }).click(); await page.waitForTimeout(100); };
const nameOf = (w, id) => w.state.pharmacists[id].name;

// ---- 1. the header picture
{
  const w = await world();
  const recs = Object.values(w.state.unavailability).filter((u) => u.last >= TODAY && u.type !== "Turned-down");
  const n = (f) => recs.filter(f).length;
  const exp = `To approve ${n((u) => u.status === "Requested")}, approved ${n((u) => u.status === "Approved" || u.status === "Actual")}, declined ${n((u) => u.status === "Denied")}`;
  check("the header shows three bars: to approve, approved, declined, with the domain's counts", (await page.locator("[data-standing]").getAttribute("aria-label")) === exp, `${await page.locator("[data-standing]").getAttribute("aria-label")} vs ${exp}`);
  check("the lead number is the to-approve count", (await page.locator("section.hero-band").innerText()).replace(/\s+/g, " ").includes(`${n((u) => u.status === "Requested")} to approve`));
}

// ---- 2. the waiting list: soonest first, consequence in words
const waitingIds = async () => page.getByRole("list", { name: "Waiting for an answer" }).locator("li").evaluateAll((els) => els.map((e) => e.getAttribute("data-unavail")));
{
  const ids = await waitingIds();
  const w = await world();
  const exp = Object.values(w.state.unavailability).filter((u) => u.status === "Requested" && u.last >= TODAY).sort((a, c) => (a.first < c.first ? -1 : a.first > c.first ? 1 : a.id < c.id ? -1 : 1)).map((u) => u.id);
  check("To approve lists every waiting request, soonest first", JSON.stringify(ids) === JSON.stringify(exp), `${ids} vs ${exp}`);
  const texts = await page.getByRole("list", { name: "Waiting for an answer" }).locator("li").evaluateAll((els) => els.map((e) => e.querySelector("[data-consequence]")?.textContent ?? ""));
  check("every row says what approving does before you decide", texts.length > 0 && texts.every((t) => /Approving (leaves every store covered\.|opens [A-Z0-9]+ on \w{3} \w{3} \d+)/.test(t)), texts.join(" || "));
  check("a row that opens a store says how many people could cover", texts.some((t) => /could cover|nobody is free to cover/i.test(t)), texts.join(" || "));
  const row = page.locator(`[data-unavail="${ids[0]}"]`);
  check("each row has Approve and Decline", (await row.getByRole("button", { name: /^Approve/ }).count()) === 1 && (await row.getByRole("button", { name: /^Decline/ }).count()) === 1);
  const first = w.state.unavailability[ids[0]].first;
  await row.hover();
  check("pointing at a request outlines its days on the month", (await page.locator(`[data-date="${first}"]`).getAttribute("class")).includes("ring-warn"));
  await page.mouse.move(2, 2);
}

// ---- 3. approve then Undo returns the exact state; decline likewise
{
  const ids = await waitingIds();
  const h0 = await hash();
  const n0 = (await world()).journal.changeSets.length;
  await page.locator(`[data-unavail="${ids[0]}"]`).getByRole("button", { name: /^Approve/ }).click();
  let w = await world();
  check("Approve is one change set", w.journal.changeSets.length === n0 + 1 && w.state.unavailability[ids[0]].status === "Approved");
  check("the toast says what happened and offers Undo", /Approved time off for/.test(await toast().innerText()) && (await toast().getByRole("button", { name: "Undo" }).count()) === 1);
  check("the approved request leaves the waiting list", !(await waitingIds()).includes(ids[0]));
  check("approving the last waiting request does not flip the tab", (await page.getByRole("group", { name: "Show" }).getByRole("button", { name: "Waiting" }).getAttribute("aria-pressed")) === "true");
  await undoToast();
  check("Undo returns the exact state (same hash)", (await hash()) === h0);
  check("the request is waiting again", (await waitingIds()).includes(ids[0]));
  await page.locator(`[data-unavail="${ids[1]}"]`).getByRole("button", { name: /^Decline/ }).click();
  w = await world();
  check("Decline records Denied as one change set", w.state.unavailability[ids[1]].status === "Denied" && w.journal.changeSets.length === n0 + 3);
  await undoToast();
  check("Undo of a decline returns the exact state", (await hash()) === h0);
}

// ---- 4. filter tabs remember the last choice
{
  const tab = (name) => page.getByRole("group", { name: "Show" }).getByRole("button", { name });
  await tab("Approved").click();
  check("Approved tab lists approved time off with Remove", (await page.getByRole("list", { name: "Approved time off" }).locator("li").count()) > 0 && (await page.getByRole("list", { name: "Approved time off" }).getByRole("button", { name: /^Remove/ }).count()) > 0);
  await app(() => window.__v3.app.getState().setView("wall"));
  await goTimeOff();
  check("the filter is remembered after leaving the page", (await tab("Approved").getAttribute("aria-pressed")) === "true");
  check("and it is kept in the browser's storage", (await page.evaluate(() => localStorage.getItem("hs-timeoff-tab"))) === "approved");
  await tab("Declined").click();
  check("Declined tab opens (empty here) without error", (await page.getByText("Nothing declined.").count()) === 1);
  await tab("Waiting").click();
}

// ---- 5. the calendar: loads, the worst day, holidays, today, keyboard
const cell = (d) => page.locator(`[data-date="${d}"]`);
{
  check("today is marked", (await cell(TODAY).getAttribute("data-today")) === "true");
  const trouble = page.locator("[data-trouble]");
  check("exactly one day is marked as the one with the most trouble", (await trouble.count()) === 1);
  const w = await world();
  const ev = evaluate(w.state, TODAY, { range: { from: "2026-10-01", to: "2026-10-31" } });
  const shortDays = new Set();
  for (const a of Object.values(w.state.assignments)) { const r = ev.assignments[a.id]?.results.find((x) => x.ruleId === "availability"); if (r && r.verdict === "Fail" && !r.overridden && (ev.cells[`${a.storeId}|${a.date}`]?.open ?? 0) > 0) shortDays.add(a.date); }
  const marked = await page.locator("[data-short]").evaluateAll((els) => els.filter((e) => Number(e.getAttribute("data-short")) > 0).map((e) => e.getAttribute("data-date")));
  check("days with a store left short because of time off match the domain", JSON.stringify([...shortDays].sort()) === JSON.stringify(marked.sort()), `${[...shortDays]} vs ${marked}`);
  check("a holiday is flagged (Columbus Day, Oct 12) and named in its note", (await cell("2026-10-12").getAttribute("aria-label")).includes("Columbus Day") && (await cell("2026-10-12").locator("svg").count()) > 0);
  check("a day has a hover note in the project's style", /\|/.test(await cell("2026-10-13").getAttribute("data-tip")));
  // keyboard
  await cell("2026-10-13").focus();
  await page.keyboard.press("ArrowRight");
  check("Arrow keys move between days", (await page.evaluate(() => document.activeElement?.getAttribute("data-date"))) === "2026-10-14");
  await page.keyboard.press("ArrowDown");
  check("ArrowDown moves a week", (await page.evaluate(() => document.activeElement?.getAttribute("data-date"))) === "2026-10-21");
  await page.keyboard.press("Enter");
  check("Enter opens the day and focus moves into it", (await page.locator("[data-day-detail]").getAttribute("data-day-detail")) === "2026-10-21" && (await page.evaluate(() => document.activeElement?.id)) === "day-title");
  await page.getByRole("button", { name: "‹ Month" }).click();
  check("closing the day puts focus back on its square", (await page.evaluate(() => document.activeElement?.getAttribute("data-date"))) === "2026-10-21");
}

// ---- 6. the Add drawer: preview before saving, and the month reflects the new absence
{
  const w = await world();
  const date = "2026-10-14";
  const offThen = Number(await cell(date).getAttribute("data-off"));
  const offIds = new Set(Object.values(w.state.unavailability).filter((u) => (u.status === "Approved" || u.status === "Actual") && u.first <= date && date <= u.last).map((u) => u.pharmacistId));
  // someone working that day alone at a store, so the preview has something to say
  const ev = evaluate(w.state, TODAY, { range: { from: date, to: date } });
  const solo = Object.values(w.state.assignments).find((a) => a.date === date && !offIds.has(a.pharmacistId) && (ev.cells[`${a.storeId}|${date}`]?.counted ?? 0) === (ev.cells[`${a.storeId}|${date}`]?.required ?? 0) && (ev.cells[`${a.storeId}|${date}`]?.required ?? 0) === 1);
  check("(setup) found a pharmacist who is the only one at a store on 14 Oct", !!solo);
  await page.locator("section.hero-band").getByRole("button", { name: /Add time off/ }).click();
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
  check("the calendar's load for that day went up by one", Number(await cell(date).getAttribute("data-off")) === offThen + 1, `${offThen} -> ${await cell(date).getAttribute("data-off")}`);
  check("and that store is now marked short", Number(await cell(date).getAttribute("data-short")) >= 1);
  await undoToast();
  check("Undo returns the exact state", (await hash()) === h0);
  check("and the load goes back", Number(await cell(date).getAttribute("data-off")) === offThen);
}

// ---- 7. the day detail: stores left short and who could be called
{
  const day = await page.locator("[data-trouble]").getAttribute("data-date");
  await cell(day).click();
  const detail = page.locator("[data-day-detail]");
  check("click a day opens its detail", (await detail.getAttribute("data-day-detail")) === day);
  const stores = detail.locator("[data-open-store]");
  check("it lists the stores left empty or short", (await stores.count()) >= 1);
  const first = stores.first();
  check("each says who is off", /is off|are off/.test(await first.innerText()));
  const callers = first.locator("[data-caller]");
  check("and who could be called, with reason words", (await callers.count()) >= 1 && /Free that day|At [A-Z0-9]+ that day/.test(await callers.first().innerText()));
  check("it lists who is off, with Remove", (await detail.getByRole("list", { name: "People off" }).locator("li").count()) >= 1);
  const store = await first.getAttribute("data-open-store");
  const h0 = await hash();
  const before = Object.values((await world()).state.assignments).filter((a) => a.storeId === store && a.date === day).length;
  await callers.first().getByRole("button", { name: /^(Place|Move here)/ }).click();
  const after = Object.values((await world()).state.assignments).filter((a) => a.storeId === store && a.date === day).length;
  check("Place puts the person there as one change", after === before + 1);
  await undoToast();
  check("Undo returns the exact state", (await hash()) === h0);
  await page.locator("[data-day-detail]").getByRole("button", { name: /^Find cover for/ }).first().click();
  await page.waitForFunction(() => !window.__v3.app.getState().busy, null, { timeout: 90000 });
  check("Find cover shows its options in the day", (await page.getByRole("region", { name: "Cover options" }).count()) === 1);
  check("it changed nothing by itself", (await hash()) === h0);
  await page.getByRole("button", { name: "‹ Month" }).click();
}

// ---- 8. Sick today
{
  const w = await world();
  const ev = evaluate(w.state, TODAY, { range: { from: TODAY, to: TODAY } });
  const offToday = new Set(Object.values(w.state.unavailability).filter((u) => (u.status === "Approved" || u.status === "Actual") && u.first <= TODAY && TODAY <= u.last).map((u) => u.pharmacistId));
  const solo = Object.values(w.state.assignments).find((a) => a.date === TODAY && !offToday.has(a.pharmacistId) && (ev.cells[`${a.storeId}|${TODAY}`]?.covered ?? 0) === 1 && (ev.cells[`${a.storeId}|${TODAY}`]?.required ?? 0) === 1);
  check("(setup) someone is the only pharmacist at a store today", !!solo);
  const h0 = await hash();
  await page.locator("section.hero-band").getByRole("button", { name: "Sick today" }).click();
  const drawer = page.locator("[data-add-drawer]");
  await drawer.getByLabel("Who called in sick?").selectOption(solo.pharmacistId);
  check("it says what that would leave uncovered before marking", /Saving this opens [A-Z0-9]+ on Tue Oct 6/.test(await drawer.locator("[data-add-preview]").innerText()));
  check("nothing is saved by looking", (await hash()) === h0);
  await drawer.getByRole("button", { name: "Mark out sick today" }).click();
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
