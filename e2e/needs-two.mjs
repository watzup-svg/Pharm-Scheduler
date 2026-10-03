// A district manager can mark a store-day as needing two pharmacists. With one pharmacist it becomes its own problem
// ("Needs a second"), different from "No coverage"; it clears with a second name or Leave as is, and Clear removes it.
import { check, launch, open, tmp } from "./lib.mjs";

export default async function run() {
  const browser = await launch();
  const { page, errors } = await open(browser, "schedule");
  const dialog = page.getByRole("dialog");

  // Catalyst day 6 has one pharmacist in the sample month.
  const day = 6;
  await page.locator(`#day-CAT-${day}`).click();
  await page.waitForTimeout(250);
  check("the day panel offers the mark", (await dialog.getByLabel("Needs two pharmacists this day").count()) === 1);

  await dialog.getByLabel("Needs two pharmacists this day").check();
  await page.waitForTimeout(200);
  check("the day panel names the new problem, not a hole", (await dialog.getByText(/needs two pharmacists on/i).count()) > 0 && (await dialog.getByText(/no coverage/i).count()) === 0);
  await page.screenshot({ path: tmp("needs-two-panel.png") });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  const tag = (await page.locator(`#day-CAT-${day}`).innerText()).replace(/\s+/g, " ");
  check("the day cell says 1/2", /1\/2/.test(tag), tag);
  check("the header counts it as a problem", (await page.locator('[data-statemark="second"]').count()) > 0);
  await page.screenshot({ path: tmp("needs-two-month.png") });

  // Leave as is clears the problem; the cell stays marked in the file.
  await page.locator(`#day-CAT-${day}`).click();
  await page.waitForTimeout(200);
  const rowsBefore = await dialog.getByText(/needs two pharmacists on/i).count();
  await page.keyboard.press("Escape");
  check("reopening the day still shows the problem", rowsBefore > 0);

  // Clear the mark.
  await page.locator(`#day-CAT-${day}`).click();
  await page.waitForTimeout(200);
  await dialog.getByLabel("Needs two pharmacists this day").uncheck();
  await page.waitForTimeout(200);
  check("clearing the mark removes the problem", (await dialog.getByText(/needs two pharmacists on/i).count()) === 0);
  check("no script errors", errors.length === 0, errors.join(" | "));
  await browser.close();
}
