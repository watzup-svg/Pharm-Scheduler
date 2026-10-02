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
  {
    // Notes lead with their subject's mark and edge, actions sit in a footer, and nothing covers the big number.
    const { page, errors } = await open(browser, "");
    const note = page.locator("[data-hover-note]");
    await header(page).getByRole("button", { name: /^Two places · 2/ }).hover();
    await page.waitForTimeout(200);
    check("a tile's note has a problem edge", (await note.locator("[data-note-edge=bad]").count()) === 1);
    check("a tile's note leads with its mark", (await note.locator("p").first().locator("svg, [data-note-store]").count()) > 0);
    check("a tile's note puts the click in a footer", /step through only these/.test((await note.locator("[data-note-action]").textContent()) ?? ""));
    const arrow = page.getByRole("button", { name: "Next issue" });
    await arrow.hover();
    await page.waitForTimeout(200);
    const a = await arrow.boundingBox();
    const n = await note.boundingBox();
    check("the arrows' note hangs below them", n != null && a != null && n.y >= a.y + a.height - 1, `${n?.y} vs ${a?.y}+${a?.height}`);
    await page.keyboard.press("Tab");
    await page.locator("section.bg-night button").first().focus();
    await page.keyboard.press("Tab");
    const ring = await page.evaluate(() => getComputedStyle(document.activeElement).outlineColor);
    check("keyboard focus in the header is a white outline", ring === "rgb(255, 255, 255)", ring);
    check("no script errors in notes", errors.length === 0, errors.join(" | "));
    await page.close();
  }
  {
    const { page } = await open(browser, "schedule");
    const radius = await page.locator("[data-store-chip] span").first().evaluate((e) => getComputedStyle(e).borderRadius);
    check("store counts are rounded squares, not circles", parseFloat(radius) <= 6, radius);
    await page.close();
  }
  {
    // A day on a store calendar says what is going on in the problem's colour, with its mark and what a click does.
    const { page } = await open(browser, "schedule");
    const cell = page.locator('[aria-label*="closed but"]').first();
    await cell.scrollIntoViewIfNeeded();
    await cell.hover({ position: { x: 4, y: 4 } });
    await page.waitForTimeout(350);
    const note = page.locator("[data-hover-note]");
    const text = (await note.innerText()).replace(/\s+/g, " ");
    check("a problem day's note names the store and date, the problem and the click", /\d{4} · \w{3} \w{3} \d+ .*still on a closed day.*Open this day/.test(text), text);
    check("a problem day's note has the red edge and its mark", (await note.locator("[data-note-edge=bad]").count()) === 1 && (await note.locator("svg").count()) > 0);
    await page.close();
  }
  {
    // The File menu says which build this is, so a fresh build is easy to tell from an old one.
    const { page } = await open(browser, "schedule");
    await page.getByRole("button", { name: "File" }).click();
    const stamp = (await page.locator("[data-build-stamp]").textContent())?.trim() ?? "";
    check("the File menu names the build, its time and its version", /^Trial build · .+ · [0-9a-f]{7}$/.test(stamp), stamp);
    await page.close();
  }
  await browser.close();
}
