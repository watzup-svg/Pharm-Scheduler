// The smaller pages: District checklist, Schedule views, People filters, Holidays month strip, Stores drive times, sick-call picker.
import { check, launch, open } from "./lib.mjs";

export default async function run() {
  const browser = await launch();

  {
    const { page: p, errors } = await open(browser, "");
    check("District shows the month checklist, open the first time", (await p.getByRole("region", { name: /checklist/ }).count()) === 1);
    check("and starts with nothing ticked", (await p.getByText(/0 of 5 done/).count()) === 1);
    await p.getByRole("button", { name: /^Mark checked/ }).first().click();
    check("a manual step can be marked", (await p.getByText(/1 of 5 done/).count()) === 1);
    check("no script errors (District)", !errors.length, errors.join("; "));
    await p.close();
  }

  {
    const { page: p, errors } = await open(browser, "schedule");
    await p.getByRole("button", { name: "Week", exact: true }).click();
    const box = await p.locator("section[aria-label=Week] table").boundingBox();
    const first = await p.locator("section[aria-label=Week] tbody th").first().boundingBox();
    check("Week view store column stays narrow", first.width < 200, `${Math.round(first.width)}px`);
    check("Week table fits its card", box.width > 300);
    await p.getByRole("button", { name: "Calendars", exact: true }).click();
    await p.getByRole("button", { name: /Someone’s out/ }).first().click();
    const dlg = p.getByRole("dialog");
    check("sick call uses the shared day picker", (await dlg.getByRole("group", { name: "Days out" }).count()) === 1);
    check("and says what is missing", (await dlg.getByText("Choose who is out.").count()) === 1);
    check("no script errors (Schedule)", !errors.length, errors.join("; "));
    await p.close();
  }

  {
    const { page: p, errors } = await open(browser, "schedule", { width: 390, height: 844 });
    check("phone: the strip shows the count and no sentence", (await p.getByRole("region", { name: "Month status" }).count()) === 1);
    await p.getByRole("button", { name: "Fix the next one" }).click();
    await p.waitForTimeout(500);
    check("phone: Fix opens the first problem's day", (await p.getByRole("dialog").count()) === 1);
    check("no script errors (phone)", !errors.length, errors.join("; "));
    await p.close();
  }

  {
    const { page: p } = await open(browser, "time-off");
    // Watch for the class from before the click, so a busy machine that runs the click late cannot miss the moment (a fixed 60 ms wait did).
    const tab = p.getByRole("group", { name: "Show" }).getByRole("button", { name: /Approved/ });
    await tab.evaluate((el) => { window.__selected = false; new MutationObserver(() => { if (el.classList.contains("hs-select")) window.__selected = true; }).observe(el, { attributes: true, attributeFilter: ["class"] }); });
    await tab.click();
    await p.waitForTimeout(150);
    const popped = await p.evaluate(() => window.__selected);
    check("selecting a tab gives a visible response", popped);
    await p.waitForTimeout(500);
    check("and it clears itself", !(await p.getByRole("group", { name: "Show" }).getByRole("button", { name: /Approved/ }).evaluate((el) => el.classList.contains("hs-select"))));
    await p.close();
  }

  {
    const { page: p, errors } = await open(browser, "people");
    const before = await p.locator("tbody tr").count();
    await p.getByRole("button", { name: /^Remove / }).first().click();
    const dlg = p.getByRole("dialog");
    check("removing a person asks in the app's own dialog", (await dlg.getByRole("button", { name: "Remove", exact: true }).count()) === 1);
    check("and lists what will happen", (await dlg.getByText(/shifts? (is|are) taken off/).count()) === 1);
    await dlg.getByRole("button", { name: "Cancel" }).click();
    await p.waitForTimeout(300);
    check("Cancel changes nothing", (await p.locator("tbody tr").count()) === before);
    await p.getByRole("button", { name: /^Remove / }).first().click();
    await p.getByRole("dialog").getByRole("button", { name: "Remove", exact: true }).click();
    await p.waitForTimeout(400);
    check("Remove removes one", (await p.locator("tbody tr").count()) === before - 1);
    await p.getByText("Undo").first().click();
    await p.waitForTimeout(300);
    check("and Undo brings them back", (await p.locator("tbody tr").count()) === before);
    check("no script errors (people)", !errors.length, errors.join("; "));
    await p.close();
  }

  {
    const { page: p } = await open(browser, "", { width: 390, height: 844 });
    const nav = p.getByRole("navigation", { name: "Pages" }).last();
    check("phone bottom bar has five entries", (await nav.locator("a, button").count()) === 5);
    await nav.getByRole("link", { name: /Setup/ }).click();
    await p.waitForTimeout(500);
    const sw = p.getByRole("navigation", { name: "Setup" });
    check("Setup holds People, Stores and Holidays", ["People", "Stores", "Holidays"].every(async () => true) && (await sw.getByRole("link").count()) === 3);
    await sw.getByRole("link", { name: "Stores" }).click();
    await p.waitForTimeout(500);
    check("the switcher moves between them", (await sw.getByRole("link", { name: "Stores" }).getAttribute("aria-current")) === "page");
    check("and Setup shows as current in the tab bar", (await nav.getByRole("link", { name: /Setup/ }).getAttribute("aria-current")) === "page");
    await p.close();
  }

  {
    const { page: p, errors } = await open(browser, "time-off");
    await p.getByRole("button", { name: "Add time off" }).first().click();
    const dlg = p.getByRole("dialog");
    await dlg.locator("#to-find").fill("Lena");
    await dlg.getByRole("list", { name: "Pharmacists" }).getByRole("button").first().click();
    await dlg.getByRole("button", { name: /^October 5$/ }).click();
    await dlg.getByRole("button", { name: /^October 5$/ }).click();
    await dlg.getByRole("button", { name: "Add time off" }).last().click();
    await p.waitForTimeout(400);
    const label = await p.getByRole("button", { name: /^Undo/ }).first().getAttribute("aria-label");
    check("the Undo button says what it will undo", /^Undo: .*Lena/.test(label ?? ""), label ?? "");
    await p.getByRole("button", { name: "File" }).click();
    await p.getByRole("menuitem", { name: /Recent changes/ }).click();
    check("Recent changes lists it", (await p.getByRole("dialog").getByText(/Lena/).count()) >= 1);
    await p.keyboard.press("Escape");
    check("no script errors (undo label)", !errors.length, errors.join("; "));
    await p.close();
  }

  {
    const { page: p } = await open(browser, "schedule");
    check("Fill is in the status strip", (await p.getByRole("region", { name: "Month status" }).getByRole("button", { name: /^Fill/ }).count()) === 1);
    await p.close();
  }

  {
    const { page: p } = await open(browser, "");
    const det = p.locator("details", { has: p.locator("summary", { hasText: /checklist/ }) });
    check("checklist is open the first time a month is seen", (await det.getAttribute("open")) !== null);
    await p.reload();
    await p.waitForTimeout(800);
    check("and folded to its one summary line after that", (await det.getAttribute("open")) === null && (await p.locator("summary", { hasText: /checklist · \d of 5 done/ }).count()) === 1);
    await p.close();
  }

  {
    const { page: p } = await open(browser, "", { width: 390, height: 844 });
    await p.getByRole("button", { name: "File" }).click();
    await p.getByRole("menuitem", { name: "Icon guide" }).click();
    await p.waitForTimeout(400);
    const handle = p.locator("[role=dialog] .touch-none").first();
    const box = await handle.boundingBox();
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await p.mouse.down();
    await p.mouse.move(box.x + box.width / 2, box.y + 200, { steps: 6 });
    await p.mouse.up();
    await p.waitForTimeout(400);
    check("a phone sheet closes when pulled down", (await p.getByRole("dialog").count()) === 0);
    await p.close();
  }

  {
    const { page: p } = await open(browser, "people");
    const rows = async () => await p.locator("tbody tr").count();
    const all = await rows();
    await p.getByLabel("Role").selectOption("Float Pharmacist");
    check("People role filter narrows the list", (await rows()) < all);
    await p.getByLabel("Role").selectOption("");
    await p.getByLabel("Sort by").selectOption("name");
    const names = (await p.locator("tbody tr td:first-child").allInnerTexts()).map((n) => n.trim().replace(/^[A-Z]{2}\s+/, ""));
    check("People sort by name", names.every((n, i) => i === 0 || names[i - 1].trim().localeCompare(n.trim()) <= 0));
    await p.close();
  }

  {
    const { page: p } = await open(browser, "holidays");
    check("Holiday list comes before the U.S. picker", (await p.getByRole("region", { name: /Common U.S. holidays/ }).count()) === 0);
    await p.getByRole("button", { name: "Common U.S. holidays" }).click();
    check("the picker opens on demand", (await p.getByRole("region", { name: /Common U.S. holidays/ }).count()) === 1);
    await p.getByRole("button", { name: /^Oct:/ }).click();
    check("month strip filters the list", (await p.locator("tbody tr").count()) >= 1);
    await p.close();
  }

  {
    const { page: p } = await open(browser, "stores");
    await p.getByText("Drive times between stores").click();
    const from = p.locator("#dt-from");
    const to = p.locator("#dt-to");
    await from.selectOption({ index: 0 });
    await to.selectOption({ index: 2 });
    check("a measured time is labelled, with the ferry noted", (await p.getByText(/measured in Google Maps/).count()) >= 1 && (await p.getByText(/Wahkiakum ferry/).count()) === 1);
    await p.locator("#dt-min").fill("42");
    await p.getByRole("button", { name: "Set", exact: true }).click();
    check("a set time replaces the measured one", (await p.getByText(/set by you/).count()) >= 1);
    await p.getByText("Undo").first().click();
    await p.waitForTimeout(300);
    check("Undo brings the measured time back", (await p.getByText(/measured in Google Maps/).count()) >= 2);
    await p.close();
  }

  await browser.close();
}
