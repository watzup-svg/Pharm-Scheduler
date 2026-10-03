// Day panel for someone placed on approved time off: Find cover, Remove, Reject time off. No Change person or Swap.
import { launch, open, check } from "./lib.mjs";

export default async function run() {
  const b = await launch();
  const { page: p, errors } = await open(b, "schedule", { width: 1366, height: 900 });
  const cells = p.locator("[role=gridcell]");
  const n = Math.min(await cells.count(), 120);
  let found = false;
  for (let i = 0; i < n && !found; i++) {
    await cells.nth(i).scrollIntoViewIfNeeded();
    await cells.nth(i).click({ force: true });
    await p.waitForTimeout(200);
    const dlg = p.getByRole("dialog");
    if (await dlg.getByRole("button", { name: /^Reject time off/ }).count()) found = true;
    else await p.keyboard.press("Escape");
  }
  check("a day panel offers Reject time off for approved time off", found);
  if (found) {
    const dlg = p.getByRole("dialog");
    check("Find cover and Remove are still there", (await dlg.getByRole("button", { name: /Find cover/ }).count()) >= 1 && (await dlg.getByRole("button", { name: "Remove" }).count()) >= 1);
    check("no Change person or Swap with", (await dlg.getByRole("button", { name: "Change person" }).count()) === 0 && (await dlg.locator("select[aria-label^='Swap ']").count()) === 0);
    await p.screenshot({ path: "test-logs/reject-time-off-after.png" });
    await dlg.getByRole("button", { name: /^Reject time off/ }).click();
    await p.waitForTimeout(500);
    const toasts = (await p.locator("[data-sonner-toast]").allInnerTexts()).join(" | ");
    check("says it was rejected and she stays", /Rejected .*time off.*stays on the schedule/.test(toasts), toasts.slice(0, 120));
    check("the yellow card is gone and Change person is back", (await p.getByRole("dialog").getByRole("button", { name: "Change person" }).count()) >= 1);
    await p.getByText("Undo").first().click();
    await p.waitForTimeout(400);
    check("Undo brings Reject time off back", (await p.getByRole("dialog").getByRole("button", { name: /^Reject time off/ }).count()) >= 1);
  }
  check("no script errors", !errors.length, errors.join("; "));
  await b.close();
}
