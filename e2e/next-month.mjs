// Starting next month: the dialog says what the new month will open with, and last month's undecided requests stop counting as "waiting" (tab badge, header tile, Time off
// page), and the Requests tab says where they went. The requests themselves are kept.
import { check, launch, open } from "./lib.mjs";

export default async function run() {
  const browser = await launch();
  const { page, errors } = await open(browser, "schedule");
  check("October starts with 2 requests waiting", (await page.getByLabel("2 requests waiting").count()) > 0);
  await page.getByRole("button", { name: "Tools" }).click();
  await page.getByRole("menuitem", { name: /Start November/ }).click();
  const dialog = page.getByRole("dialog");
  const forecast = (await dialog.locator("[data-forecast]").textContent()) ?? "";
  check("the Start dialog says what November will start with", /November 2026 will start with 26 problems to fix: 24 shifts with no coverage and 2 people at two places\./.test(forecast), forecast);
  check("the end-of-month weekdays are one line, not a list", (await dialog.getByText(/names fall on a weekday November 2026 doesn’t have/).count()) === 1);
  await dialog.getByRole("button", { name: "Start November" }).click();
  await page.waitForTimeout(800);
  const count = (await page.locator("section.bg-night").first().getByRole("button", { name: /problems? to fix/ }).first().textContent())?.trim();
  check("November opens with the number the dialog promised", count === "26", count);
  check("November is on screen", (await page.getByText("November 2026").count()) > 0);
  check("no request badge after the month moves on", (await page.getByLabel(/requests waiting$/).count()) === 0);
  await page.goto(page.url().replace(/#\/.*$/, "#/time-off"));
  await page.waitForTimeout(800);
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: /To approve/ }).click();
  await page.waitForTimeout(300);
  check("To approve says nothing is waiting", (await page.getByText("Nothing to approve").count()) > 0);
  check("Requests says where the older ones are", (await page.getByText(/2 undecided requests are from an earlier month/).count()) > 0);
  check("no script errors starting next month", errors.length === 0, errors.join(" | "));
  await page.close();
  await browser.close();
}
