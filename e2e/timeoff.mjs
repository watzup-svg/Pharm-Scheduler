// Time off: add for two people, undo, edit, approve a request, undo, remove, and focus coming back to the button.
import { check, launch, open } from "./lib.mjs";

export default async function run() {
  const browser = await launch();
  const { page: p, errors } = await open(browser, "time-off");
  // With requests waiting and no tab remembered, the page opens on the queue.
  check("opens on Requests when something is waiting", (await p.getByRole("tab", { name: /Requests/ }).getAttribute("aria-selected")) === "true");
  const count = async () => Number((await p.getByRole("tab", { name: /List/ }).innerText()).replace(/\D/g, ""));
  const start = await count();
  const add = p.getByRole("button", { name: "Add time off" }).first();
  await add.click();
  const dlg = p.getByRole("dialog");
  check("Add is disabled until there is a person and days", await dlg.getByRole("button", { name: "Add time off" }).isDisabled());
  await dlg.locator("#to-find").fill("Lena");
  await dlg.getByRole("list", { name: "Pharmacists" }).getByRole("button").first().click();
  await dlg.getByRole("button", { name: "Add another" }).click();
  await dlg.locator("#to-find").fill("Fenn");
  await dlg.getByRole("checkbox").first().check();
  await dlg.getByRole("button", { name: /^October 5$/ }).click();
  await dlg.getByRole("button", { name: /^October 7$/ }).click();
  await dlg.getByRole("button", { name: "Add time off" }).last().click();
  await p.waitForTimeout(400);
  check("two people added at once", (await count()) === start + 2);
  await p.getByText("Undo").first().click();
  await p.waitForTimeout(300);
  check("one Undo takes both back", (await count()) === start);

  await p.getByRole("tab", { name: /Requests/ }).click();
  const waiting = async () => Number((await p.getByRole("tab", { name: /Requests/ }).innerText()).replace(/\D/g, "") || 0);
  const before = await waiting();
  // A quick tap on a held button does nothing and says so; holding it does the job.
  const anyway = p.getByRole("button", { name: /^Approve anyway/ }).first();
  await anyway.click();
  await p.waitForTimeout(300);
  check("a quick tap on a hold button does nothing", (await waiting()) === before);
  check("and tells her to hold", (await p.getByText("Press and hold to confirm").count()) >= 1);
  const box = await anyway.boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  await p.waitForTimeout(350);
  check("while held the button shows it is timing", (await anyway.getAttribute("data-holding")) !== null);
  await p.waitForTimeout(600);
  await p.mouse.up();
  await p.waitForTimeout(300);
  check("holding approves and takes the request off the queue", (await waiting()) === before - 1);
  await p.getByText("Undo").first().click();
  await p.waitForTimeout(300);
  check("Undo puts it back", (await waiting()) === before);

  await add.focus();
  await p.keyboard.press("Enter");
  await p.waitForTimeout(300);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
  check("focus returns to the Add button", (await p.evaluate(() => document.activeElement?.getAttribute("aria-label"))) === "Add time off");
  check("no script errors", !errors.length, errors.join("; "));
  await browser.close();
}
