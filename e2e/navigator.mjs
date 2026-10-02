// The issue navigator in the page header: ‹ count › arrows, a short title, the ring following the selected day, and the
// day panel's Next using the same order. Stepping selects and highlights only; it never opens a day or changes the month.
import { check, launch, open } from "./lib.mjs";

const header = (page) => page.locator("section.bg-night").first();
const docText = (page) => page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem("hischool-schedule-autosave-v3") ?? "{}").doc ?? null));
const tickDay = (page) => page.evaluate(() => Number(document.querySelector("[data-tick-day]")?.getAttribute("data-tick-day") ?? 0));
const position = async (page) => ((await header(page).getByText(/^\d+ of \d+$/).count()) ? (await header(page).getByText(/^\d+ of \d+$/).textContent()).trim() : "");
const marked = (page) => page.evaluate(() => [...document.querySelectorAll("[data-cell][data-issue]")].map((e) => e.getAttribute("data-cell")).sort().join(","));
const headerHeight = (page) => header(page).evaluate((h) => Math.round(h.getBoundingClientRect().height));

export default async function run() {
  const browser = await launch();
  {
    const { page, errors } = await open(browser, "");
    const total = Number((await header(page).getByRole("button", { name: /problems? to fix/ }).first().textContent()).trim());
    // Autosave is written a moment after load; wait for it so the comparison is against the real month.
    await page.waitForFunction(() => localStorage.getItem("hischool-schedule-autosave-v3") != null, null, { timeout: 5000 });
    const before = await docText(page);
    const nothingSelectedTick = await tickDay(page);
    const h0 = await headerHeight(page);
    check("no position shows before stepping", (await position(page)) === "");

    await page.getByRole("button", { name: "Next issue" }).click();
    await page.waitForTimeout(400);
    check("the first step lands on the first issue by date", (await position(page)) === `1 of ${total}`, await position(page));
    check("the title names the issue", (await header(page).getByText("Two places · Gideon Ashcroft · Fri Oct 9").count()) > 0);
    check("the matching kind lights up in the tiles row", (await header(page).locator("li[data-current-kind]").count()) === 1 && /Two places/.test((await header(page).locator("li[data-current-kind]").first().innerHTML())));
    check("the ring tick moves to the issue's day", (await tickDay(page)) === 9, String(await tickDay(page)));
    check("the ring centre names the day", (await header(page).locator("svg text").allTextContents()).join(" ").includes("OCT 9th"));
    check("a person at two stores outlines both", (await marked(page)) === "EST|9,MOL|9", await marked(page));
    check("stepping does not open the day panel", (await page.getByRole("dialog").count()) === 0);
    check("stepping stays on the District page", page.url().endsWith("#/"), page.url());
    check("the header keeps its height while stepping", (await headerHeight(page)) === h0, `${h0} -> ${await headerHeight(page)}`);

    await page.getByRole("button", { name: "Next issue" }).click();
    await page.waitForTimeout(200);
    check("the next step outlines the next issue's cell", (await marked(page)) === "CAT|10", await marked(page));

    await page.getByRole("button", { name: "Previous issue" }).click();
    await page.getByRole("button", { name: "Previous issue" }).click();
    await page.waitForTimeout(200);
    check("stepping back from the first wraps to the last", (await position(page)) === `${total} of ${total}`, await position(page));

    await page.waitForTimeout(800);
    check("stepping never changes the schedule", before !== "null" && (await docText(page)) === before);
    check("today keeps a dot on the rim while another day is selected", (await page.locator("[data-today-dot]").count()) === 1);

    await page.getByRole("button", { name: "Stop stepping through issues" }).first().click();
    await page.waitForTimeout(200);
    check("Done clears the position", (await position(page)) === "");
    check("Done puts the tick back on today", (await tickDay(page)) === nothingSelectedTick, `${nothingSelectedTick} vs ${await tickDay(page)}`);
    check("no script errors while stepping", errors.length === 0, errors.join(" | "));
    await page.close();
  }
  {
    // Open from the cursor, then the day panel's Next and the header arrows are one stepper.
    const { page } = await open(browser, "");
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Next issue" }).click();
    check("Fix says which day it opens while stepping", (await page.getByRole("button", { name: /^Open Oct 12$/ }).count()) === 1);
    await page.getByRole("button", { name: /^Open Oct 12$/ }).click();
    await page.waitForTimeout(700);
    const sheet = page.getByRole("dialog");
    check("Fix opens the day the arrows are on", (await sheet.getByText(/Oct 12/).count()) > 0);
    check("the open day panel drives the ring", (await tickDay(page)) === 12, String(await tickDay(page)));
    await sheet.getByRole("button", { name: /^Next · \d+/ }).click();
    await page.waitForTimeout(700);
    check("the day panel's Next goes to the next issue by date", (await page.getByRole("dialog").getByText(/Oct 13/).count()) > 0);
    check("the header position follows the day panel", (await position(page)).startsWith("4 of"), await position(page));
    await page.close();
  }
  {
    // A day with every store closed is neutral on the ring; it is only red when a name was left on it, and then the
    // note says which, and the day can be opened to fix it.
    const { page } = await open(browser, "");
    const day = (d) => page.locator(`[data-ring-day="${d}"]`);
    check("a closed day with nothing wrong is hollow", (await day(4).getAttribute("fill")) === "none" && (await day(4).getAttribute("tabindex")) === "-1");
    check("a closed day with nothing wrong just says closed", /All stores closed/.test((await day(4).getAttribute("aria-label")) ?? ""));
    const label18 = (await day(18).getAttribute("aria-label")) ?? "";
    check("a closed day with a name on it says what is wrong", /1 to fix/.test(label18) && /Someone is scheduled, but every store is closed/.test(label18) && !/All stores closed/.test(label18) && /Ines Calloway/.test(label18), label18);
    check("a closed day with a name on it can be opened", (await day(18).getAttribute("tabindex")) === "0");
    await day(18).click();
    await page.waitForTimeout(700);
    check("opening it goes to that day's problem", (await page.getByRole("dialog").getByText(/Oct 18/).count()) > 0);
    await page.close();
  }
  {
    // On Schedule, the store row boxes the store(s) the current issue is at.
    const { page, errors } = await open(browser, "schedule");
    await page.getByRole("button", { name: "Next issue" }).click();
    await page.waitForTimeout(400);
    const boxed = await page.evaluate(() => [...document.querySelectorAll("[data-store-chip][data-current-issue]")].map((e) => e.getAttribute("data-store-chip")).sort().join(","));
    check("the store row boxes the issue's stores", boxed === "EST,MOL", boxed);
    await page.getByRole("button", { name: "Next issue" }).click();
    await page.waitForTimeout(400);
    const next = await page.evaluate(() => [...document.querySelectorAll("[data-store-chip][data-current-issue]")].map((e) => e.getAttribute("data-store-chip")).join(","));
    check("the box moves with the next issue", next === "CAT", next);
    check("no script errors on Schedule while stepping", errors.length === 0, errors.join(" | "));
    await page.close();
  }
  for (const width of [1066, 1366]) {
    // Every store chip on Schedule is whole and on screen at laptop widths (they wrap instead of running off the edge).
    const { page } = await open(browser, "schedule", { width, height: 800 });
    const cut = await page.evaluate(() => [...document.querySelectorAll("[data-store-chip]")].filter((e) => { const r = e.getBoundingClientRect(); const box = e.parentElement.getBoundingClientRect(); return r.right > Math.min(window.innerWidth, box.right) + 0.5 || r.left < box.left - 0.5; }).map((e) => e.getAttribute("data-store-chip")));
    const n = await page.locator("[data-store-chip]").count();
    check(`every store chip is whole on screen @${width}`, n === 18 && cut.length === 0, `${n} chips, cut: ${cut.join(",")}`);
    await page.close();
  }
  for (const width of [390, 320]) {
    const { page, errors } = await open(browser, "", { width, height: 800 });
    const h0 = await headerHeight(page);
    await page.getByRole("button", { name: "Next issue" }).click();
    await page.waitForTimeout(300);
    for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Next issue" }).click();
    await page.waitForTimeout(300);
    check(`stepping never scrolls the page away from the arrows @${width}`, (await page.evaluate(() => window.scrollY)) === 0, String(await page.evaluate(() => window.scrollY)));
    const title = header(page).locator("li[data-issue]");
    check(`the title takes the tiles row on a phone @${width}`, await title.isVisible());
    check(`the header does not grow while stepping @${width}`, (await headerHeight(page)) <= h0, `${h0} -> ${await headerHeight(page)}`);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    check(`no sideways scroll while stepping @${width}`, !wide);
    const arrows = await page.getByRole("button", { name: /^(Next|Previous) issue$/ }).evaluateAll((els) => els.map((e) => Math.round(Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height))));
    check(`arrows are full-size touch targets @${width}`, arrows.every((s) => s >= 44), arrows.join(","));
    check(`no script errors @${width}`, errors.length === 0, errors.join(" | "));
    await page.close();
  }
  await browser.close();
}
