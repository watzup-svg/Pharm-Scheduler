// Fit sweep: every screen and the day panel at phone, tablet and laptop widths. Fails on sideways page scroll, text that is
// cut off with an ellipsis, anything poking out of its dialog, and tap targets too small to hit on a phone.
import { check, launch, open } from "./lib.mjs";

const WIDTHS = [320, 360, 390, 430, 768, 1024, 1366];
const ROUTES = ["", "schedule", "time-off", "people", "stores", "print", "lists", "holidays"];

const probe = (root) => {
  const scope = root ? document.querySelector(root) : document.body;
  if (!scope) return { missing: true };
  const vw = document.documentElement.clientWidth;
  const cut = [], out = [], small = [];
  for (const el of scope.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (cs.textOverflow === "ellipsis" && !el.closest("[data-rc], [data-day]") && !el.classList.contains("line-through") && el.scrollWidth > el.clientWidth + 1) cut.push((el.textContent || "").trim().slice(0, 30));
    if (cs.webkitLineClamp !== "none" && cs.webkitLineClamp && el.scrollHeight > el.clientHeight + 1) cut.push(`clamp:${(el.textContent || "").trim().slice(0, 30)}`);
    if (root && (r.right > vw + 1 || r.left < -1)) out.push(`${el.tagName}.${String(el.className).slice(0, 30)}`);
    if (vw <= 430 && root && (el.tagName === "BUTTON" || el.tagName === "A" || el.getAttribute("role") === "button") && !el.closest("[data-notap]")) {
      if (r.height < 36 || r.width < 36) small.push(`${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 20)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
  }
  return { sideways: document.documentElement.scrollWidth > vw + 1, cut, out, small };
};

export default async function run() {
  const browser = await launch();
  // Every page header is built from one template: same width, same height, same row positions.
  for (const width of [1366, 1024, 390]) {
    const seen = [];
    for (const route of ["", "schedule", "time-off", "print", "people", "stores", "holidays"]) {
      const { page } = await open(browser, route, { width, height: 900 });
      seen.push([route || "district", await page.evaluate(() => {
        const h = [...document.querySelectorAll("section")].find((x) => x.className.includes("bg-night"));
        const r = h.getBoundingClientRect();
        const g = h.querySelector("ul[aria-label='Counts']")?.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), tilesY: Math.round((g?.top ?? 0) - r.top) };
      })]);
      await page.close();
    }
    const same = (k) => new Set(seen.map(([, v]) => v[k])).size === 1;
    check(`all page headers are the same width @${width}`, same("w"), JSON.stringify(seen.map(([n, v]) => [n, v.w])));
    check(`all page headers are the same height @${width}`, same("h"), JSON.stringify(seen.map(([n, v]) => [n, v.h])));
    check(`the count tiles sit on the same line in every header @${width}`, same("tilesY"), JSON.stringify(seen.map(([n, v]) => [n, v.tilesY])));
  }
  for (const width of WIDTHS) {
    const size = { width, height: width < 700 ? 800 : 900 };
    for (const route of ROUTES) {
      const { page } = await open(browser, route, size);
      const r = await page.evaluate(probe, null);
      check(`no sideways scroll /${route} @${width}`, !r.sideways);
      check(`no cut-off text /${route} @${width}`, !r.cut.length, r.cut.slice(0, 3).join(" | "));
      await page.close();
    }
    const { page } = await open(browser, "schedule", size);
    await page.getByRole("button", { name: /Show the first/ }).first().click();
    await page.waitForTimeout(500);
    const r = await page.evaluate(probe, '[role="dialog"]');
    if (r.missing) check(`day panel opens @${width}`, false);
    else {
      check(`day panel stays inside the screen @${width}`, !r.out.length, r.out.slice(0, 3).join(" | "));
      check(`day panel has no cut-off text @${width}`, !r.cut.length, r.cut.slice(0, 3).join(" | "));
      check(`day panel tap targets @${width}`, !r.small.length, r.small.slice(0, 3).join(" | "));
    }
    await page.close();
  }
  await browser.close();
}
