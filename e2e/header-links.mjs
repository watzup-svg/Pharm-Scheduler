// The header and the calendars answer each other on a laptop: tiles light their days on the ring and outline their cells,
// the ring and the month grid point at each other, a clicked tile narrows the arrows, and the day strip opens a store-day.
import { check, launch, open } from "./lib.mjs";

const header = (page) => page.locator("section.bg-night").first();
const lit = (page) => page.evaluate(() => [...document.querySelectorAll("[data-ring-day][data-lit]")].map((e) => Number(e.getAttribute("data-ring-day"))).sort((a, b) => a - b).join(","));
const styles = (page) => page.evaluate(() => [...document.querySelectorAll("section.bg-night style")].map((s) => s.textContent).join("\n"));
const position = async (page) => ((await header(page).getByText(/^\d+ of \d+/).count()) ? (await header(page).getByText(/^\d+ of \d+/).first().textContent()).trim() : "");

export default async function run() {
  const browser = await launch();
  {
    const { page, errors } = await open(browser, "");
    const tile = header(page).getByRole("button", { name: /^No coverage · 6/ });
    await tile.hover();
    await page.waitForTimeout(200);
    check("pointing at a tile lights its days on the ring", (await lit(page)) === "14,20,21,24,26,27", await lit(page));
    check("pointing at a tile outlines its cells below", (await styles(page)).includes('data-cell="WAL\\|14"'));
    check("the other ring days step back", (await page.locator('[data-ring-day="9"]').getAttribute("opacity")) === "0.28");
    await page.mouse.move(5, 700);
    await page.waitForTimeout(200);
    check("moving away puts the ring back", (await lit(page)) === "" && (await page.locator('[data-ring-day="9"]').getAttribute("opacity")) == null);

    await page.locator('[data-ring-day="20"]').hover();
    await page.waitForTimeout(200);
    check("pointing at a ring day boxes that date on the month grid", /data-col-day="20"/.test(await styles(page)));
    await page.locator('[data-cell="CLA|21"]').hover();
    await page.waitForTimeout(200);
    check("pointing at a date below lights it on the ring", (await lit(page)) === "21", await lit(page));
    check("no script errors while pointing", errors.length === 0, errors.join(" | "));
    await page.close();
  }
  {
    const { page, errors } = await open(browser, "");
    await header(page).getByRole("button", { name: /^No coverage · 6/ }).click();
    await page.waitForTimeout(400);
    check("clicking a tile steps through only that kind", (await position(page)).startsWith("1 of 6"), await position(page));
    check("it starts on that kind's first issue", (await header(page).getByText("No coverage · Waldport · Wed Oct 14").count()) > 0);
    check("the big number still counts everything", (await header(page).getByText("12", { exact: true }).count()) > 0);
    check("the clicked tile reads as chosen", (await header(page).getByRole("button", { name: /^No coverage · 6/ }).getAttribute("aria-pressed")) === "true");
    check("the ring keeps that kind's days lit", (await lit(page)) === "14,20,21,24,26,27", await lit(page));
    await page.getByRole("button", { name: "Next issue" }).click();
    await page.waitForTimeout(300);
    check("Next stays within the kind", (await position(page)).startsWith("2 of 6") && (await header(page).getByText(/^No coverage · .* · \w{3}\sOct\s20$/).count()) > 0, await position(page));
    await header(page).getByRole("button", { name: /^No coverage · 6/ }).click();
    await page.waitForTimeout(300);
    check("clicking it again steps through everything", /of 12/.test(await position(page)), await position(page));
    check("no script errors while narrowing", errors.length === 0, errors.join(" | "));
    await page.close();
  }
  {
    const { page, errors } = await open(browser, "");
    await page.getByRole("button", { name: "Next issue" }).click();
    await page.waitForTimeout(400);
    const strip = header(page).locator("[data-day-strip='9']");
    check("the day strip lists every store for the issue's day", (await strip.locator("[data-strip-store]").count()) === 18);
    const bad = await strip.locator("[data-state=bad]").evaluateAll((els) => els.map((e) => e.getAttribute("data-strip-store")).sort().join(","));
    check("the stores to fix that day are marked", bad === "EST,MOL", bad);
    check("a two-places issue shows both store badges", (await header(page).getByRole("button", { name: /^Open .* and .*, Fri Oct 9$/ }).count()) === 1);
    await strip.locator("[data-strip-store='CAT']").click();
    await page.waitForTimeout(700);
    check("a store in the strip opens that day", (await page.getByRole("dialog").getByText(/Oct 9/).count()) > 0 && page.url().includes("schedule"));
    check("no script errors in the strip", errors.length === 0, errors.join(" | "));
    await page.close();
  }
  await browser.close();
}
