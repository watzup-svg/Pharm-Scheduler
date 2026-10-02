// A store added later has no measured distances: a collapsed line appears on Stores, one row per other store, and Save sticks.
// The real district shows nothing.
import { check, launch, open } from "./lib.mjs";

export default async function run() {
  const browser = await launch();
  const { page: p, errors } = await open(browser, "stores");
  check("no notice while every store has measured distances", (await p.getByTestId("new-store-distances").count()) === 0);
  await p.getByRole("button", { name: "Add store" }).first().click();
  const dlg = p.getByRole("dialog");
  await dlg.locator("#s-code").fill("NEW");
  await dlg.locator("#s-name").fill("Newtown Pharmacy");
  await dlg.locator("#s-address").fill("1 Main St, Newtown, OR 97000");
  await dlg.getByRole("button", { name: "Add store" }).click();
  await p.waitForTimeout(400);
  const card = p.getByTestId("new-store-distances");
  check("a collapsed notice names the new store", (await card.count()) === 1 && /Newtown Pharmacy has no measured distances to 18 stores/.test(await card.locator("summary").innerText()), await card.locator("summary").innerText().catch(() => ""));
  await card.locator("summary").click();
  await card.getByLabel("Miles to Cathlamet Pharmacy").fill("42.5");
  await card.getByLabel("Minutes to Cathlamet Pharmacy").fill("55");
  await card.getByRole("button", { name: /^Save 1 distance/ }).click();
  await p.waitForTimeout(300);
  check("saving drops that pair from the list", /to 17 stores/.test(await card.locator("summary").innerText()));
  check("no script errors", !errors.length, errors.join("; "));
  await browser.close();
}
