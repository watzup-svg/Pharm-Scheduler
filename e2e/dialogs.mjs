// Accessibility with things open: the day panel, dialogs, menus, forms and the search box, at laptop and phone width.
import { axeSource, check, launch, open, settled } from "./lib.mjs";

// The menu's positioned wrapper sits outside the page landmarks by design (Radix portal); that one best-practice rule is ignored.
const IGNORE = (x) => x.startsWith("color-contrast:.pointer-events-none") || x.startsWith("region:div[data-radix-popper-content-wrapper");

export default async function run() {
  const browser = await launch();
  const axe = axeSource();
  const scan = async (p, label) => {
    await settled(p); // axe reads the colors as drawn, so let the fade-in finish
    await p.evaluate(axe);
    const found = await p.evaluate(async () => (await axe.run(document, { resultTypes: ["violations"] })).violations.flatMap((x) => x.nodes.map((n) => `${x.id}:${n.target.join(" ").slice(0, 60)}`)));
    const bad = found.filter((x) => !IGNORE(x));
    check(label, !bad.length, bad.slice(0, 2).join("; "));
  };
  for (const size of [{ width: 1366, height: 900 }, { width: 390, height: 844 }]) {
    const tag = `@${size.width}`;
    let { page: p } = await open(browser, "schedule", size);
    await p.getByRole("button", { name: /Someone’s out/ }).first().click();
    await p.waitForTimeout(400);
    await scan(p, `sick dialog ${tag}`);
    await p.keyboard.press("Escape");
    await p.getByRole("button", { name: "File" }).click();
    await p.waitForTimeout(300);
    await scan(p, `file menu ${tag}`);
    await p.keyboard.press("Escape");
    await p.keyboard.press("/");
    await p.waitForTimeout(400);
    await scan(p, `search ${tag}`);
    await p.close();
    ({ page: p } = await open(browser, "time-off", size));
    await p.getByRole("button", { name: "Add time off" }).first().click();
    await p.waitForTimeout(400);
    await scan(p, `time-off drawer ${tag}`);
    await p.close();
    ({ page: p } = await open(browser, "people", size));
    await p.getByRole("button", { name: "Add pharmacist" }).click();
    await p.waitForTimeout(400);
    await scan(p, `person form ${tag}`);
    await p.close();
  }
  await browser.close();
}
