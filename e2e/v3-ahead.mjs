// Plan ahead: the coming months as a rail, each with a status (empty, drafting, ready, posted); build a month, post it, edit it after posting
// and see that the change is counted; open any later month.
import { launch, serveV3, openApp, check, failed } from "./v3-lib.mjs";

const b = await launch();
const s = await serveV3();
const { page, errors } = await openApp(b, s.base);
const get = (fn, arg) => page.evaluate(fn, arg);
const nav = page.getByRole("navigation").or(page.locator("header"));
const left = page.locator('aside[aria-label="Left panel"]');
const right = page.locator('aside[aria-label="Inspector"]');
const bar = page.locator("[data-ahead-bar]");

await get(() => window.__v3.app.getState().setView("wall"));
const drawerBefore = await get(() => window.__v3.app.getState().drawer);
await page.locator("header").getByRole("button", { name: "Plan ahead" }).click();
await bar.waitFor();
check("a Plan ahead tab sits next to Schedule", (await page.locator("header").getByRole("button", { name: "Plan ahead" }).count()) === 1);
check("it opens on next month, with the month list on the left", (await bar.locator("[data-ahead-month]").innerText()) === "November 2026" && (await left.locator("[data-month-rail]").count()) === 1);
check("the list has the coming months, each with a status", (await left.locator("[data-month]").count()) >= 8 && (await left.locator("[data-month-kind]").count()) >= 8);
check("an unscheduled month says Empty", (await left.locator('[data-month="2026-11"] [data-month-kind]').getAttribute("data-month-kind")) === "empty");
check("the bar says it is a draft, nobody has been told", /Draft: not posted yet/.test(await bar.innerText()));
check("the header explains the month and what to do next", /empty/i.test(await page.locator("[data-hero-headline]").innerText()) && /Build/.test(await page.locator("[data-hero-detail]").innerText()));
check("the grid shows that month", (await page.locator('[role="gridcell"][data-date="2026-11-12"]').count()) >= 1 && (await page.locator('[role="gridcell"][data-date="2026-10-20"]').count()) === 0);

// open a later month from the list
await left.locator('[data-month="2026-12"]').click();
check("clicking a month opens it", (await bar.locator("[data-ahead-month]").innerText()) === "December 2026" && (await page.locator('[role="gridcell"][data-date="2026-12-10"]').count()) >= 1);
await left.getByLabel("Open another month").fill("2027-09");
check("any later month can be opened", (await bar.locator("[data-ahead-month]").innerText()) === "September 2027" && (await left.locator('[data-month="2027-09"]').count()) === 1);
await left.locator('[data-month="2026-11"]').click();

// build November
await bar.getByRole("button", { name: "Build this month" }).click();
await page.waitForFunction(() => { const a = window.__v3.app.getState(); return !a.busy && (a.world.session.proposal || a.notice); }, null, { timeout: 120000 });
const prop = await get(() => window.__v3.app.getState().world.session.proposal?.kind ?? null);
if (prop) {
  await page.getByRole("region", { name: "Proposal" }).getByRole("button", { name: "Accept" }).click();
  await page.getByRole("region", { name: "Proposal" }).waitFor({ state: "detached" });
}
const kind1 = await left.locator('[data-month="2026-11"] [data-month-kind]').getAttribute("data-month-kind");
check("after Build the month is no longer Empty", kind1 === "drafting" || kind1 === "ready", `${prop} ${kind1}`);
check("its card says how much is filled", /\d+ of \d+ shifts filled/.test(await left.locator('[data-month="2026-11"]').innerText()));

// post it
await bar.getByRole("button", { name: "Post this month" }).click();
await page.waitForFunction(() => window.__v3.app.getState().world.journal.snapshots.length >= 1);
check("posting marks the month Posted with its revision", (await left.locator('[data-month="2026-11"] [data-month-kind]').getAttribute("data-month-kind")) === "posted" && /rev 1/.test(await left.locator('[data-month="2026-11"]').innerText()));
check("the bar says nothing has changed since", /nothing has changed since/.test(await bar.innerText()));
check("posting again is not offered until something changes", await bar.getByRole("button", { name: /Post revision 2/ }).isDisabled());

// editing after posting is allowed, and counted
const target = await get(() => { const a = window.__v3.app.getState(); const asg = Object.values(a.world.state.assignments).filter((x) => x.date >= "2026-11-01" && x.date <= "2026-11-30").sort((x, y) => (x.date < y.date ? -1 : 1))[0]; return asg ? { id: asg.id, storeId: asg.storeId, date: asg.date } : null; });
check("(setup) November has someone placed", !!target);
await get((t) => window.__v3.app.getState().commit([{ t: "remove", assignmentId: t.id }]), target);
check("the month is still Posted, and now says how many days changed", /changed since posting/.test(await left.locator('[data-month="2026-11"]').innerText()) && /Edited since posting/.test(await bar.innerText()), await bar.innerText());
check("Post revision 2 is now offered", await bar.getByRole("button", { name: /Post revision 2/ }).isEnabled());
check("the header says to post and tell people", /Post revision 2 and tell/.test(await page.locator("[data-hero-detail]").innerText()), await page.locator("[data-hero-detail]").innerText());
const fixFirst = bar.getByRole("button", { name: "Fix first open shift" });
check("a month with an open shift offers to fix the first one", (await fixFirst.count()) === 1);
if (await fixFirst.count()) { await fixFirst.click(); check("it selects an open day in the month, so the best people show", await get(() => { const sel = window.__v3.app.getState().selection; return !!sel && sel.date >= "2026-11-01" && sel.date <= "2026-11-30"; }) && /Needs/.test(await right.innerText())); }
await bar.getByRole("button", { name: /Post revision 2/ }).click();
await page.waitForFunction(() => window.__v3.app.getState().world.journal.snapshots.length >= 2);
check("posting revision 2 clears the count", /rev 2/.test(await left.locator('[data-month="2026-11"]').innerText()) && !/changed since posting/.test(await left.locator('[data-month="2026-11"]').innerText()));

// selecting a day works like the Schedule
await page.locator('.w-cell[data-store]').first().click();
check("the Inspector works here too", (await right.locator("[data-testid='cell-status']").count()) >= 1);

// leaving puts the left list back how it was
await page.locator("header").getByRole("button", { name: "Schedule" }).click();
check("leaving restores the left list and tabs", (await get(() => window.__v3.app.getState().drawer)) === drawerBefore && (await get(() => window.__v3.app.getState().leftTab)) !== "months");
void nav;
check("no console errors", errors.length === 0, errors.join(" | "));
await b.close(); s.close();
process.exit(failed() ? 1 : 0);
