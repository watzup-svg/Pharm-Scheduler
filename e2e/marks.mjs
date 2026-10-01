// Every state mark is the same rounded-square chip, in one of four sizes, in its family's colour, on every page.
import { check, launch, open } from "./lib.mjs";

const FAMILY = { hole: "problem", double: "problem", leftover: "problem", license: "problem", timeOff: "away", sick: "away", appointment: "away", family: "away", waiting: "away", covering: "cover" };
const BG = { problem: "rgb(239, 216, 210)", away: "rgb(244, 226, 163)", cover: "rgb(220, 235, 226)" };
const LEGEND = ["hole", "double", "leftover", "license", "timeOff", "waiting", "covering", "asis"];

export default async function run() {
  const browser = await launch();
  for (const width of [1366, 390]) {
    for (const route of ["", "schedule", "time-off", "people", "stores", "print", "holidays"]) {
      const { page } = await open(browser, route, { width, height: 900 });
      const marks = await page.evaluate(() => [...document.querySelectorAll("[data-statemark]")].map((e) => { const c = getComputedStyle(e); return { kind: e.dataset.statemark, size: Number(e.dataset.size), w: Math.round(e.getBoundingClientRect().width), radius: c.borderRadius, bg: c.backgroundColor,  }; }));
      const label = `/${route || "district"} @${width}`;
      check(`marks use only the four sizes ${label}`, marks.every((m) => [16, 20, 24, 28].includes(m.size) && m.w === m.size), JSON.stringify(marks.filter((m) => ![16, 20, 24, 28].includes(m.size) || m.w !== m.size).slice(0, 2)));
      check(`no mark is a circle ${label}`, marks.every((m) => parseFloat(m.radius) < m.size / 2 - 1), JSON.stringify(marks.filter((m) => !(parseFloat(m.radius) < m.size / 2 - 1)).slice(0, 2)));
      const wrong = marks.filter((m) => FAMILY[m.kind] && m.bg !== BG[FAMILY[m.kind]]);
      check(`each mark has its family's colour ${label}`, !wrong.length, JSON.stringify(wrong.slice(0, 2)));
      if (route === "" && width === 1366) {
        const legend = await page.evaluate(() => [...document.querySelectorAll('ul[aria-label="Marks"] [data-statemark]')].map((e) => e.dataset.statemark));
        check("the legend shows every mark, once, in the shared order", JSON.stringify(legend) === JSON.stringify(LEGEND), legend.join(","));
      }
      await page.close();
    }
  }
  // The off theme: buttons that start "someone is off" are the same yellow as the time-off marks.
  {
    const YELLOW = "rgb(244, 226, 163)";
    let { page } = await open(browser, "");
    check("Mark out is yellow", (await page.getByRole("button", { name: "Someone called in sick" }).first().evaluate((e) => getComputedStyle(e).backgroundColor)) === YELLOW);
    await page.close();
    ({ page } = await open(browser, "time-off"));
    check("Add time off is yellow", (await page.getByRole("button", { name: "Add time off", exact: true }).evaluate((e) => getComputedStyle(e).backgroundColor)) === YELLOW);
    await page.close();
  }
  await browser.close();
}
