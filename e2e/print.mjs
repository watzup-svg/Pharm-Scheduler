// Print: a blocked pack says why, presets change the page count, and one clean page prints after one acknowledgement.
import { check, launch, open } from "./lib.mjs";

export default async function run() {
  const browser = await launch();
  const { page: p, errors } = await open(browser, "print");
  check("the pack cannot print while problems remain: Fix is offered and Print is disabled", (await p.getByRole("button", { name: /^Fix/ }).count()) === 1 && (await p.locator('section[aria-label="Print"] button', { hasText: /^Print ·/ }).isDisabled()));
  check("the four marks count what is left", (await p.locator('section[aria-label="Print"] [aria-label*="to fix"], section[aria-label="Print"] button[aria-label]').count()) >= 1);
  const pages = async () => Number((await p.locator('div[aria-label^="Pages ·"]').innerText()).replace(/\D/g, ""));
  const all = await pages();
  await p.getByRole("button", { name: /Choose pages/ }).click();
  await p.getByRole("button", { name: "Oregon only" }).click();
  check("Oregon only shrinks the pack", (await pages()) < all);
  await p.getByRole("button", { name: "Everything" }).click();
  check("Everything brings it back", (await pages()) === all);

  await p.getByText("Just one page").click();
  const one = p.locator("#one-store");
  const options = await one.locator("option").allInnerTexts();
  let clean = null;
  for (const [i, label] of options.entries()) {
    await one.selectOption({ index: i });
    if (!(await p.locator("#one-page button", { hasText: /^Print$/ }).isDisabled())) {
      clean = label;
      break;
    }
  }
  check("a store with no problems can print on its own", clean != null);
  if (clean) {
    await p.locator("#one-page button", { hasText: /^Print$/ }).click();
    await p.waitForTimeout(300);
    check("first print asks to acknowledge problems elsewhere", (await p.getByRole("dialog").count()) === 1);
    await p.getByRole("button", { name: /^Print this page$/ }).click();
    await p.waitForTimeout(500);
    await p.locator("#one-page button", { hasText: /^Print$/ }).click();
    await p.waitForTimeout(500);
    check("second print does not ask again", (await p.getByRole("dialog").count()) === 0);
  }
  check("no script errors", !errors.length, errors.join("; "));
  await browser.close();
}
