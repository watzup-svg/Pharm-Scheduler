// Time off: add for two people, undo, edit, approve a request, undo, remove, and focus coming back to the button.
import { check, launch, open } from "./lib.mjs";

export default async function run() {
  const browser = await launch();
  const { page: p, errors } = await open(browser, "time-off");
  // With requests waiting and no tab remembered, the page opens on the queue.
  const pill = (name) => p.getByRole("group", { name: "Show" }).getByRole("button", { name });
  const num = async (name) => Number((await pill(name).innerText()).replace(/\D/g, "") || 0);
  check("opens on To approve when something is waiting", (await pill(/To approve/).getAttribute("aria-pressed")) === "true");
  check("the month is the only calendar on the page", (await p.getByRole("group", { name: "Who is off, by day" }).count()) === 1);
  const count = async () => (await num(/To approve/)) + (await num(/Approved/)) + (await num(/Declined/));
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

  await pill(/To approve/).click();
  const waiting = () => num(/To approve/);
  const before = await waiting();
  // Approve is one plain click, stays on Requests, and the toast offers Undo approval.
  check("the open slip shows its four facts", (await p.getByText("Also out", { exact: true }).count()) === 1);
  check("Approve is a plain button", (await p.getByRole("button", { name: /^Approve$/ }).count()) >= 1);
  await p.getByRole("button", { name: /^Approve$/ }).first().click();
  await p.waitForTimeout(300);
  check("one click approves and takes the request off the queue", (await waiting()) === before - 1);
  check("and stays on To approve", (await pill(/To approve/).getAttribute("aria-pressed")) === "true");
  await p.getByText("Undo approval").first().click();
  await p.waitForTimeout(300);
  check("Undo approval puts it back", (await waiting()) === before);
  // Decline asks first.
  await p.getByRole("button", { name: /^Decline$/ }).first().click();
  check("Decline opens a confirm", (await p.getByRole("dialog").count()) === 1);
  await p.getByRole("button", { name: "Keep waiting" }).click();
  await p.waitForTimeout(300);
  check("Keep waiting changes nothing", (await waiting()) === before);
  // Sick is recorded as approved, shows in the List, and can be unapproved there.
  await add.click();
  const sd = p.getByRole("dialog");
  await sd.locator("#to-find").fill("Lena");
  await sd.getByRole("list", { name: "Pharmacists" }).getByRole("button").first().click();
  await sd.getByRole("button", { name: /^October 12$/ }).click();
  await sd.getByRole("button", { name: /Sick/ }).click();
  await sd.getByRole("button", { name: "Add time off" }).last().click();
  await p.waitForTimeout(400);
  await pill(/Approved/).click();
  const undoBtn = p.getByRole("button", { name: /^Undo approval for Lena/ });
  check("Sick shows in Approved with Undo approval", (await undoBtn.count()) >= 1);
  await undoBtn.first().click();
  await p.waitForTimeout(300);
  check("Undo approval on an Approved row sends it back to To approve", (await waiting()) === before + 1);

  // Picking a day on the month narrows the list to that day; clearing it brings the rest back.
  await pill(/To approve/).click();
  const rows = () => p.getByRole("list", { name: "Requests to approve" }).locator("> li").count();
  const all = await rows();
  await p.locator("[data-day]").evaluateAll((els) => els.find((e) => e.getAttribute("aria-label")?.includes("waiting"))?.click());
  await p.waitForTimeout(200);
  check("a day on the month narrows the queue", (await rows()) < all || all <= 1);
  await p.getByRole("button", { name: /Clear$/ }).click();
  check("clearing the day brings it back", (await rows()) === all);

  await add.focus();
  await p.keyboard.press("Enter");
  await p.waitForTimeout(300);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
  check("focus returns to the Add button", (await p.evaluate(() => document.activeElement?.getAttribute("aria-label"))) === "Add time off");
  check("no script errors", !errors.length, errors.join("; "));
  await browser.close();
}
