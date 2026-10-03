// The daily-job fixes: staying on an emptied shift, the Inventory reason, the left-as-is tally, a clickable person strip,
// adding a licence from its problem, and printing the district page as a draft.
import { check, launch, open } from "./lib.mjs";

const toFix = (p) => p.evaluate(() => Number(document.querySelector('[aria-label*="to fix"]')?.getAttribute("aria-label")?.match(/(\d+) to fix/)?.[1] ?? NaN));

export default async function run() {
  const browser = await launch();
  {
    const { page: p, errors } = await open(browser, "schedule");
    // 1. Remove stays on the shift, shows cover, and does not offer the removed person as best fit
    const cell = p.locator('#day-CAT-1');
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await p.waitForTimeout(300);
    const d = p.getByRole("dialog");
    await d.getByRole("button", { name: /^Remove/ }).click();
    await p.waitForTimeout(500);
    check("after Remove the panel stays open on the emptied shift", (await d.getByRole("region", { name: "Who can cover" }).count()) === 1);
    check("the person just removed is not the best fit", (await d.getByRole("button", { name: /^Schedule Marisol Quenby/ }).count()) === 0);
    await p.keyboard.press("Escape");
    // 2. Inventory is a closure reason
    const c2 = p.locator('#day-SHE-14');
    await c2.scrollIntoViewIfNeeded();
    await c2.click();
    await p.waitForTimeout(300);
    await p.getByRole("dialog").getByRole("button", { name: /^Close Sheridan/ }).click();
    check("Inventory is offered as a reason to close a store", (await p.getByRole("menuitem", { name: "Inventory" }).count()) === 1);
    await p.keyboard.press("Escape");
    check("no page errors (schedule)", errors.length === 0, errors[0]);
    await p.close();
  }
  {
    const { page: p } = await open(browser, "");
    // 3. Left as is shows as a tally on the header
    // A tile narrows the arrows to its kind; the Fix button (now "Open Oct …") opens the day.
    await p.getByRole("button", { name: /^Name on a closed day/ }).click();
    await p.waitForTimeout(300);
    await p.getByRole("button", { name: /^Open Oct \d+$/ }).click();
    await p.waitForTimeout(400);
    await p.getByRole("dialog").getByRole("button", { name: /^Leave as is/ }).click();
    await p.waitForTimeout(500);
    await p.keyboard.press("Escape");
    await p.getByRole("link", { name: "District" }).first().click();
    await p.waitForTimeout(400);
    check("a problem left as is appears as a tally in the header", (await p.locator("ul[aria-label=Counts] li", { hasText: "1" }).locator('[aria-label^="Left as is"]').count()) === 1);
    await p.close();
  }
  {
    const { page: p } = await open(browser, "people");
    // 4. The person strip opens a day
    const day = p.locator('section[aria-label="Each pharmacist\'s month"] button').first();
    check("a worked day on the person strip is a button", (await day.count()) === 1);
    await day.click();
    await p.waitForTimeout(500);
    check("clicking it opens that day on the Schedule", (await p.evaluate(() => location.hash)).includes("schedule") && (await p.getByRole("dialog").count()) === 1);
    await p.close();
  }
  {
    const { page: p } = await open(browser, "");
    // 5. Add a licence from its problem
    const before = await toFix(p);
    await p.getByRole("button", { name: /^Not licensed/ }).click();
    await p.waitForTimeout(300);
    await p.getByRole("button", { name: /^Open Oct \d+$/ }).click();
    await p.waitForTimeout(400);
    await p.getByRole("dialog").getByRole("button", { name: /^Add WA licence/ }).click();
    await p.getByRole("button", { name: "Add licence" }).click();
    await p.waitForTimeout(600);
    check("adding the licence clears the licence problem and nothing else", (await toFix(p)) === before - 1, `${before} → ${await toFix(p)}`);
    await p.close();
  }
  {
    const { page: p } = await open(browser, "print");
    // 6. The district page can print as a draft while the packet is blocked
    check("the packet is still blocked while problems are open", await p.getByRole("button", { name: /^Print · / }).isDisabled());
    await p.locator("summary", { hasText: "Just one page" }).click();
    await p.getByRole("button", { name: "District page" }).click();
    check("the district page can print as a draft", await p.locator("details", { hasText: "Just one page" }).getByRole("button", { name: "Print", exact: true }).isEnabled());
    await p.close();
  }
  await browser.close();
}
