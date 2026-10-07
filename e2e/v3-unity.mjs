// One product: the same shared parts on every screen. Checks the things that make the screens feel alike: one main action per screen, the shared
// page frame and selector, the same badges and discs in lists, and one guide button that opens the guide at the part for the screen you are on.
import { launch, serveV3, openApp, check, failed } from "./v3-lib.mjs";

const b = await launch();
const s = await serveV3();
const { page, errors } = await openApp(b, s.base);
const go = async (v, tab) => { await page.evaluate(([v, tab]) => { const a = window.__v3.app.getState(); a.select(null); a.setView(v); if (tab) a.setSetupTab(tab); }, [v, tab]); await page.waitForTimeout(350); };

// 1. At most one black main action per screen.
const SCREENS = [["overview"], ["wall"], ["ahead"], ["timeoff"], ["print"], ["setup", "stores"], ["setup", "pharmacists"], ["setup", "patterns"], ["setup", "holidays"], ["setup", "dates"], ["setup", "travel"], ["setup", "rules"], ["setup", "checks"]];
for (const [v, tab] of SCREENS) {
  await go(v, tab);
  const ink = await page.evaluate(() => [...document.querySelectorAll("main button, aside button")].filter((x) => /(^|\s)bg-ink(\s|$)/.test(x.className) && !x.closest(".w-seg") && !x.closest('[role="tablist"]') && x.getAttribute("aria-pressed") !== "true" && x.offsetParent).map((x) => (x.getAttribute("aria-label") || x.textContent || "").trim()));
  check(`${v}${tab ? "/" + tab : ""}: at most one black main action`, ink.length <= 1, JSON.stringify(ink));
}

// 2. The page frame: Overview and Setup are wide, Print narrow, all centred with the same side padding.
const frame = async (sel) => page.locator(sel).evaluate((e) => { const c = getComputedStyle(e); return { max: c.maxWidth, pl: c.paddingLeft, ml: c.marginLeft !== "0px" }; });
await go("overview");
const fo = await frame("[data-overview]");
await go("setup", "stores");
const fs = await frame("main .mx-auto.flex.w-full");
await go("print");
const fp = await frame("[data-print-view]");
check("Overview and Setup share one wide frame", fo.max === "1200px" && fs.max === "1200px" && fo.pl === fs.pl, JSON.stringify({ fo, fs }));
check("Print uses the narrow frame with the same padding", fp.max === "860px" && fp.pl === fo.pl, JSON.stringify(fp));

// 3. One selector: Setup's sections and the request filters are the same pill control.
await go("setup", "stores");
check("Setup's sections are a tab list drawn as the shared pill selector", (await page.locator('[role="tablist"][aria-label="Setup sections"].w-seg').count()) === 1 && (await page.getByRole("tab").count()) === 8);
await page.getByRole("tab", { name: "Patterns" }).press("ArrowRight");
check("arrow keys still move between Setup's sections", (await page.evaluate(() => window.__v3.app.getState().setupTab)) === "holidays");
await go("timeoff");
check("the Waiting/Approved/Declined filter is the same selector", (await page.locator('.w-seg[aria-label="Show"] button').count()) === 3);

// 4. Badges and discs in lists.
await go("overview");
check("Next up shows the store's hexagon badge on open shifts", (await page.locator("[data-next-up] [role=img]").count()) >= 1);
await go("timeoff");
check("each request row shows the person's coloured disc", (await page.locator("[data-request-list] li").first().locator("span[aria-hidden='true'].rounded-full").count()) >= 1);
await page.locator("[data-request-list] li button").first().click();
check("the Time off Inspector header shows the same disc", (await page.locator('[data-day-inspector] header span[aria-hidden="true"].rounded-full, aside[aria-label="Inspector"] header span[aria-hidden="true"].rounded-full').count()) >= 1);
await go("wall");
await page.evaluate(() => { const a = window.__v3.app.getState(); const asg = Object.values(a.world.state.assignments)[0]; a.select({ pharmacistId: asg.pharmacistId, date: asg.date }); });
await page.waitForTimeout(300);
check("the Schedule's person Inspector shows the disc too", (await page.locator('aside[aria-label="Inspector"] header span[aria-hidden="true"].rounded-full').count()) >= 1);

// 5. One guide button, in the top bar on every screen, opening the guide at the part for this screen.
for (const [v, want] of [["overview", null], ["timeoff", "Time off screen"], ["ahead", "Plan ahead"]]) {
  await go(v);
  check(`${v}: the guide button is in the top bar`, (await page.locator("header").getByRole("button", { name: "Icon guide" }).count()) === 1);
  if (want) {
    await page.locator("header").getByRole("button", { name: "Icon guide" }).click();
    const first = await page.getByRole("dialog", { name: "Icon guide" }).locator("section").evaluateAll((els) => els.map((e, i) => ({ label: e.getAttribute("aria-label"), o: Number(getComputedStyle(e).order) * 100 + i })).sort((a, b) => a.o - b.o)[0].label);
    check(`${v}: the guide opens with its own part first`, first === want, String(first));
    await page.keyboard.press("Escape");
  }
}
check("no console errors", errors.length === 0, errors.join(" | "));
await b.close(); s.close();
process.exit(failed() ? 1 : 0);
