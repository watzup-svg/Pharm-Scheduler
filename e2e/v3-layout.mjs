// Layout sweep: five laptop/desktop viewports x (normal, larger text, high contrast, both) x every screen.
// Per screen: no horizontal page scroll; no element sticking out of the viewport sideways (scrollable boxes and what they clip are exempt);
// no text clipped inside buttons or tabs (scrollWidth > clientWidth); the top bar is one row at 1280 and wider; no console errors.
// Failures are collected and printed at the end as  viewport|mode|screen|selector|detail.  Build first: npm run build:v3.
//   node e2e/v3-layout.mjs        (ONLY=1366x768 limits to one viewport)
import { launch, serveV3, openApp, check, failed } from "./v3-lib.mjs";

const VIEWPORTS = [[1024, 700], [1280, 720], [1366, 768], [1600, 900], [1920, 1080]].filter(([w, h]) => !process.env.ONLY || process.env.ONLY === `${w}x${h}`);
const MODES = [
  { id: "normal", large: false, contrast: false },
  { id: "large", large: true, contrast: false },
  { id: "contrast", large: false, contrast: true },
  { id: "large+contrast", large: true, contrast: true },
];
const SCREENS = [
  { id: "Overview", view: "overview" }, { id: "Schedule", view: "wall" }, { id: "Time off", view: "timeoff" }, { id: "Print", view: "print" }, { id: "Plan", view: "plan" },
  ...["stores", "pharmacists", "patterns", "holidays", "dates", "travel", "rules", "checks"].map((t) => ({ id: `Setup/${t}`, view: "setup", tab: t })),
];

// The shell is min 1280 wide by design (App.tsx, AGENT_BRIEF): below that the page may scroll sideways, but nothing may go past the shell.
const SHELL_MIN = 1280;
const b = await launch();
const s = await serveV3();
const { page, errors } = await openApp(b, s.base, { size: { width: 1366, height: 768 } });
await page.evaluate(() => { const a = window.__v3.app.getState(); a.setWindow("2026-10-01", "2026-10-31"); a.setAsOf("2026-10-06"); });

// The real File menu switches the two settings; use it once so the test notices if the menu stops doing so.
await page.click('[aria-label="File menu"]');
await page.getByRole("menuitem", { name: "Larger text" }).click();
await page.click('[aria-label="File menu"]');
await page.getByRole("menuitem", { name: "High contrast" }).click();
check("File menu: Larger text and High contrast set the page classes", await page.evaluate(() => document.documentElement.classList.contains("text-large") && document.documentElement.classList.contains("contrast")));
await page.click('[aria-label="File menu"]');
await page.getByRole("menuitem", { name: "Larger text" }).click();
await page.click('[aria-label="File menu"]');
await page.getByRole("menuitem", { name: "High contrast" }).click();
check("File menu: choosing them again turns them off", await page.evaluate(() => !document.documentElement.classList.contains("text-large") && !document.documentElement.classList.contains("contrast")));

/** Runs in the page. Returns problems as [selector, detail]. */
const probe = ({ wide, limit }) => {
  const out = [];
  const W = limit;
  const sel = (el) => {
    let t = el.tagName.toLowerCase();
    if (el.id) t += `#${el.id}`;
    const al = el.getAttribute("aria-label");
    if (al) t += `[aria-label="${al.slice(0, 24)}"]`;
    else if (typeof el.className === "string" && el.className.trim()) t += "." + el.className.trim().split(/\s+/).slice(0, 2).join(".");
    const tx = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 22);
    return tx ? `${t}"${tx}"` : t;
  };
  const de = document.documentElement;
  if (de.scrollWidth > W) out.push(["html", `page scrolls sideways: scrollWidth ${de.scrollWidth} > ${W}`]);
  if (document.body.scrollWidth > W) out.push(["body", `body scrollWidth ${document.body.scrollWidth} > ${W}`]);
  const visible = (el) => { const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) return false; const cs = getComputedStyle(el); return cs.visibility !== "hidden" && cs.display !== "none"; };
  const clippedByAncestor = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") { const pr = p.getBoundingClientRect(); if (pr.right <= W + 1 && pr.left >= -1) return true; }
    }
    return false;
  };
  const reported = [];
  for (const el of document.body.querySelectorAll("*")) {
    if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") continue;
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > W + 1 || r.left < -1) {
      if (clippedByAncestor(el)) continue;
      if (getComputedStyle(el).position === "fixed" && r.width > W) continue;
      if (reported.some((x) => x.contains(el))) continue;
      reported.push(el);
      out.push([sel(el), `box ${Math.round(r.left)}..${Math.round(r.right)} outside 0..${W}`]);
    }
  }
  // Text cut off inside controls.
  for (const el of document.body.querySelectorAll('button, [role="tab"], [role="button"], [role="menuitem"], a, label, select')) {
    if (!visible(el)) continue;
    const over = el.scrollWidth - el.clientWidth;
    if (over > 1) {
      const cs = getComputedStyle(el);
      out.push([sel(el), `clipped text: scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}${cs.textOverflow === "ellipsis" ? " (ellipsis)" : ""}`]);
    }
    for (const t of el.querySelectorAll("span, b, i")) {
      if (!visible(t)) continue;
      const cs = getComputedStyle(t);
      if (cs.overflow === "visible" && cs.textOverflow !== "ellipsis") continue;
      if (t.scrollWidth - t.clientWidth > 1 && cs.textOverflow !== "ellipsis") out.push([sel(t), `clipped label: scrollWidth ${t.scrollWidth} > clientWidth ${t.clientWidth}`]);
    }
  }
  // Top bar on one row.
  if (wide) {
    const h = document.querySelector("header");
    if (h) {
      const mids = [...h.querySelectorAll("button, input, a, [role=button]")].filter(visible).map((e) => { const r = e.getBoundingClientRect(); return r.top + r.height / 2; });
      if (mids.length && Math.max(...mids) - Math.min(...mids) > 14) out.push(["header", `top bar wraps: control centres span ${Math.round(Math.max(...mids) - Math.min(...mids))}px (height ${Math.round(h.getBoundingClientRect().height)})`]);
    }
  }
  return out;
};

// The detector must see what it is looking for: a clipped button and a box past the edge.
{
  await page.evaluate(() => {
    document.body.insertAdjacentHTML("beforeend", '<div id="selftest" style="position:absolute;top:0;left:0"><button style="width:40px;overflow:hidden;white-space:nowrap">A very long button label</button><div style="position:absolute;left:3000px;width:50px;height:20px">x</div></div>');
  });
  const got = await page.evaluate(probe, { wide: true, limit: 1366 });
  await page.evaluate(() => document.getElementById("selftest").remove());
  check("self-test: the probe reports a clipped button and an off-screen box", got.some(([, d]) => /clipped text/.test(d)) && got.some(([, d]) => /outside/.test(d)), JSON.stringify(got));
}

const problems = [];
let combos = 0;
for (const [w, h] of VIEWPORTS) {
  await page.setViewportSize({ width: w, height: h });
  for (const mode of MODES) {
    await page.evaluate((m) => { document.documentElement.classList.toggle("text-large", m.large); document.documentElement.classList.toggle("contrast", m.contrast); }, mode);
    const before = problems.length;
    for (const sc of SCREENS) {
      await page.evaluate((sc2) => { const a = window.__v3.app.getState(); a.select(null); a.setDrawer(false); a.setOutForm(false); a.setView(sc2.view); if (sc2.tab) a.setSetupTab(sc2.tab); }, sc);
      await page.waitForTimeout(60);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const got = await page.evaluate(probe, { wide: w >= 1280, limit: Math.max(w, SHELL_MIN) });
      for (const [selector, detail] of got) problems.push(`${w}x${h}|${mode.id}|${sc.id}|${selector}|${detail}`);
    }
    if (w < SHELL_MIN && mode.id === "normal") console.log(`note ${w}x${h} is below the ${SHELL_MIN}px shell minimum: the page scrolls sideways by design; checked against ${SHELL_MIN}px`);
    combos++;
    const n = problems.length - before;
    check(`${w}x${h} ${mode.id}: ${SCREENS.length} screens fit`, n === 0, `${n} problem(s)`);
  }
}
check("no console errors", errors.length === 0, errors.slice(0, 3).join(" | ").slice(0, 400));
if (problems.length) {
  // Compact: the same selector+detail kind on the same screen across modes is listed once with a count.
  console.log(`\nviewport|mode|screen|selector|detail   (${problems.length} problems in ${combos} combinations)`);
  const seen = new Map();
  for (const p of problems) { const k = p.split("|").slice(2).join("|").replace(/\d+/g, "#"); seen.set(k, [...(seen.get(k) ?? []), p]); }
  for (const [, list] of seen) console.log(list[0] + (list.length > 1 ? `   (+${list.length - 1} more like this)` : ""));
}
await b.close(); s.close();
process.exit(failed() ? 1 : 0);
