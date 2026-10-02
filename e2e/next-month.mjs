// Starting next month: last month's undecided requests stop counting as "waiting" (tab badge, header tile, Time off
// page), and the Requests tab says where they went. The requests themselves are kept.
import { check, launch, open } from "./lib.mjs";

export default async function run() {
  const browser = await launch();
  const { page, errors } = await open(browser, "schedule");
  check("October starts with 2 requests waiting", (await page.getByLabel("2 requests waiting").count()) > 0);
  await page.getByRole("button", { name: "Tools" }).click();
  await page.getByRole("menuitem", { name: /Start November/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Start November" }).click();
  await page.waitForTimeout(800);
  check("November is on screen", (await page.getByText("November 2026").count()) > 0);
  check("no request badge after the month moves on", (await page.getByLabel(/requests waiting$/).count()) === 0);
  await page.goto(page.url().replace(/#\/.*$/, "#/time-off"));
  await page.waitForTimeout(800);
  await page.getByRole("tab", { name: /Requests/ }).click();
  await page.waitForTimeout(300);
  check("Requests says nothing is waiting", (await page.getByText("No requests waiting").count()) > 0);
  check("Requests says where the older ones are", (await page.getByText(/2 undecided requests are from an earlier month/).count()) > 0);
  check("no script errors starting next month", errors.length === 0, errors.join(" | "));
  await page.close();
  await browser.close();
}
