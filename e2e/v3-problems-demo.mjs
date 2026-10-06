// The "practice month with problems" opens from the Start screen and the engine tools work on it.
import { launch, serveV3, openApp, check, failed } from "./v3-lib.mjs";
const b = await launch();
const s = await serveV3();
const { page, errors } = await openApp(b, s.base, { practice: false });

await page.locator("[data-practice-problems]").click();
await page.waitForSelector('[role="gridcell"]', { timeout: 15000 });
const st = () => page.evaluate(() => { const g = window.__v3.app.getState(); const w = g.world; return {
  stores: Object.keys(w.state.stores).length, people: Object.keys(w.state.pharmacists).length, asg: Object.keys(w.state.assignments).length,
  waiting: Object.values(w.state.unavailability).filter((u) => u.status === "Requested").length, changeSets: w.journal.changeSets.length, notice: g.notice?.text ?? "", busy: g.busy, proposal: !!w.session.proposal }; });
let x = await st();
check("opens a 16-store schedule with people and shifts", x.stores === 16 && x.people >= 30 && x.asg > 300, JSON.stringify(x));
check("says what is in it", /open shifts/.test(x.notice) && /waiting/.test(x.notice), x.notice);
check("time-off requests are waiting", x.waiting >= 3, String(x.waiting));
check("Time off tab shows the waiting count", (await page.getByRole("button", { name: /^Time off/ }).first().textContent()).match(/\d/) !== null);
check("the header says shifts need cover", /need|cover|open/i.test(await page.locator("body").innerText()));

// the engine tools run on it
await page.evaluate(() => { window.__run = window.__v3.app.getState().runBuild(); });
await page.waitForFunction(() => !window.__v3.app.getState().busy, null, { timeout: 120000 });
x = await st();
check("Build runs and ends not busy (a proposal, or a message)", !x.busy && (x.proposal || x.notice.length > 0), JSON.stringify({ proposal: x.proposal, notice: x.notice }));
if (x.proposal) await page.evaluate(() => window.__v3.app.getState().discardProposal?.());
await page.evaluate(() => { window.__run = window.__v3.app.getState().runImprove(); });
await page.waitForFunction(() => !window.__v3.app.getState().busy, null, { timeout: 120000 });
x = await st();
check("Improve runs and ends not busy", !x.busy);
check("the posted schedule left someone to tell", await page.evaluate(() => window.__v3.app.getState().world.journal.told !== undefined));
// back to the Start screen from the File menu, then into the other practice month
page.on("dialog", (d) => d.accept());
await page.locator('[aria-label="File menu"]').click();
await page.locator("[data-close-schedule]").click();
await page.waitForSelector("[data-practice-problems]", { timeout: 5000 });
check("File menu: Back to the Start screen shows the Start screen", (await page.evaluate(() => !window.__v3.app.getState().world)));
await page.getByRole("button", { name: "Try the practice month" }).click();
await page.waitForSelector('[role="gridcell"]');
check("and the plain practice month opens from it", (await page.evaluate(() => !!window.__v3.app.getState().world)));
check("no console errors", errors.length === 0, errors.join(" | "));
await b.close(); s.close();
process.exit(failed() ? 1 : 0);
