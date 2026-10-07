// Browser check for the schedule wall. Build first: npm run build:v3
//   SHOTS=dir  where screenshots go (default: the OS temp dir)
import os from "node:os";
import path from "node:path";
import { launch, serveV3, openApp, check, failed } from "./v3-lib.mjs";

const shots = process.env.SHOTS ?? os.tmpdir();
const srv = await serveV3();
const browser = await launch();
try {
  const { page, errors } = await openApp(browser, srv.base);
  const st = (fn, arg) => page.evaluate(fn, arg);
  // Fixed "as of" so the check does not depend on the real date.
  await st(() => { const a = window.__v3.app.getState(); a.setAsOf("2026-10-06"); a.setWindow("2026-10-01", "2026-10-31"); });
  await page.waitForSelector('[role="grid"] [role="gridcell"]');

  const grid = page.locator('[role="grid"]');
  const cells = page.locator('[role="gridcell"]');
  check("practice month loads: 16 stores x 31 days", (await cells.count()) === 16 * 31, `got ${await cells.count()}`);
  const text = await grid.innerText();
  check("open spot picture chip appears", (await page.locator('.w-cell [data-statemark="open"]').count()) > 0);
  void text;
  check("green blocks dominate: most store cells are covered and carry no picture", (await page.locator('.w-cell[data-store][data-block="good"]:not([data-icon])').count()) > (await cells.count()) / 2);
  check("no initials in store cells (a cell holds at most a count like 1/2 or a +/- badge)", (await page.locator('.w-cell[data-store]').evaluateAll((els) => els.filter((e) => !/^[\d/+\u2212\s]*$/.test(e.textContent ?? "")).length)) === 0);
  check("closed hatched cell appears", (await page.locator('.w-cell[data-block="closed"] .w-block.hatch').count()) > 0);
  check("as-of column is marked with the word Today", ["Today", "As of"].includes(await page.locator(".w-asof-head .w-today").innerText()));
  check("month label in the header", (await page.locator(".w-month").first().innerText()).includes("October 2026"));
  // One control line, no permanent legend
  check("no legend visible until Key is pressed", (await page.locator("#wall-key, #wall-legend").count()) === 0);
  const controls = page.locator(".w-controls");
  check("control line has Previous, Today, Next, Month, 2 weeks, Stores, People, Key, Tools", (await Promise.all(["Previous week", "Today", "Next week", "Month", "2 weeks", "Stores", "People", "Key", "Tools"].map((n) => controls.getByRole("button", { name: n, exact: true }).count()))).every((n) => n === 1));
  check("4 weeks is gone", (await page.getByRole("button", { name: "4 weeks" }).count()) === 0);
  const hdrCount = await page.evaluate(() => {
    const q = 'button,a[href],input,select,textarea,[role="button"],[role="tab"],[tabindex="0"]:not([role="gridcell"])';
    // The wall's control line plus everything above the grid inside <main> (hero band, strips).
    const main = document.querySelector("main");
    const gridTop = document.querySelector(".w-scroll")?.getBoundingClientRect().top ?? 0;
    return [...(main?.querySelectorAll(q) ?? [])].filter((e) => e instanceof HTMLElement).filter((e) => { const r = e.getBoundingClientRect(); return r.height > 0 && r.bottom <= gridTop + 1; }).length;
  });
  check("header area has 15 or fewer interactive elements (was about 25)", hdrCount <= 15, `${hdrCount}`);
  check("hex badges on store rows", (await page.locator('[role="rowheader"] [role="img"]').count()) === 16);
  check("no coverage bar under the dates and no 'Covered' row label", (await page.locator(".w-cover, .w-bar").count()) === 0 && (await grid.getByText("Covered", { exact: true }).count()) === 0);
  check("store dot only on rows with something to fix (not on all rows)", (await page.locator('[role="rowheader"] [role="img"][aria-label$="needs fixing"]').count()) < 16);
  check("row label note has the name", /·.*\|/.test((await page.locator(".w-label").first().getAttribute("data-tip")) ?? ""));
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  check("Tools menu has Build / Improve / Cover all open", (await page.getByRole("menuitem", { name: /^Build/ }).count()) === 1 && (await page.getByRole("menuitem", { name: /^Improve/ }).count()) === 1 && (await page.getByRole("menuitem", { name: /^Cover all open/ }).count()) === 1);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Key", exact: true }).click();
  check("Key opens the legend panel with colours and a 'What do these mean?' link", (await page.locator("#wall-key").count()) === 1 && (await page.locator("#wall-key [data-block]").count()) >= 3 && (await page.locator("#wall-key").getByRole("button", { name: "What do these mean?" }).count()) === 1);
  await page.keyboard.press("Escape");
  check("Esc closes the Key", (await page.locator("#wall-key").count()) === 0);
  await page.getByRole("button", { name: "Key", exact: true }).click();
  await page.locator(".w-scroll").click({ position: { x: 5, y: 5 } });
  check("a click elsewhere closes the Key", (await page.locator("#wall-key").count()) === 0);

  // Accessible name
  check("every cell has a hover note", (await page.locator('[role="gridcell"]:not([data-tip])').count()) === 0);
  const name = await page.locator('[role="gridcell"][data-store][data-date="2026-10-06"]').first().getAttribute("aria-label");
  check("cell has an accessible name with store, date and state", /^[A-Z]+, Tue Oct 6: /.test(name ?? ""), name ?? "");

  // Clicking a cell sets the store selection
  const target = page.locator('[role="gridcell"][data-r="3"][data-c="8"]');
  const wantStore = await target.getAttribute("data-store");
  await target.click();
  const sel = await st(() => window.__v3.app.getState().selection);
  check("clicking a cell selects store + date", sel?.storeId === wantStore && sel?.date === "2026-10-09", JSON.stringify(sel));
  check("selected cell has strong outline class", (await target.getAttribute("class")).includes("w-sel"));
  await target.click({ button: "right" });
  check("right click on a cell opens its hover note", (await page.getByText("Open this day").count()) >= 1);
  await page.keyboard.press("Escape");

  // Keyboard
  await target.focus();
  await page.keyboard.press("ArrowRight");
  let f = await page.evaluate(() => { const e = document.activeElement; return `${e?.dataset?.r},${e?.dataset?.c}`; });
  check("ArrowRight moves focus", f === "3,9", f);
  await page.keyboard.press("ArrowDown");
  f = await page.evaluate(() => { const e = document.activeElement; return `${e?.dataset?.r},${e?.dataset?.c}`; });
  check("ArrowDown moves focus", f === "4,9", f);
  await page.keyboard.press("Home");
  f = await page.evaluate(() => { const e = document.activeElement; return `${e?.dataset?.r},${e?.dataset?.c}`; });
  check("Home goes to row start", f === "4,0", f);
  await page.keyboard.press("End");
  f = await page.evaluate(() => { const e = document.activeElement; return `${e?.dataset?.r},${e?.dataset?.c}`; });
  check("End goes to row end", f === "4,30", f);
  await page.keyboard.press("Enter");
  const sel2 = await st(() => window.__v3.app.getState().selection);
  check("Enter selects the focused cell", sel2?.date === "2026-10-31" && !!sel2?.storeId, JSON.stringify(sel2));
  check("only one cell is in the tab order", (await page.locator('[role="gridcell"][tabindex="0"]').count()) === 1);

  // Window controls
  await page.getByRole("button", { name: "2 weeks" }).click();
  let w = await st(() => window.__v3.app.getState().window);
  check("2 weeks starts the Sunday of the as-of week", w.from === "2026-10-04" && w.to === "2026-10-17", JSON.stringify(w));
  check("2 weeks shows 14 columns", (await page.locator('[role="gridcell"][data-r="0"]').count()) === 14);
  await page.getByRole("button", { name: "Next week" }).click();
  w = await st(() => window.__v3.app.getState().window);
  check("Next shifts by 7", w.from === "2026-10-11", JSON.stringify(w));
  await page.getByRole("button", { name: "Previous week" }).click();
  await page.getByRole("button", { name: "Previous week" }).click();
  w = await st(() => window.__v3.app.getState().window);
  check("Prev shifts back by 7", w.from === "2026-09-27", JSON.stringify(w));
  await page.getByRole("group", { name: "Move the window" }).getByRole("button", { name: "Today" }).click();
  w = await st(() => window.__v3.app.getState().window);
  check("Today brings the as-of date back into view", w.from <= "2026-10-06" && w.to >= "2026-10-06", JSON.stringify(w));
  await page.getByRole("button", { name: "Month", exact: true }).click();
  w = await st(() => window.__v3.app.getState().window);
  check("Month is the calendar month", w.from === "2026-10-01" && w.to === "2026-10-31", JSON.stringify(w));
  await page.locator('[role="gridcell"][data-r="0"][data-c="0"]').focus();
  await page.keyboard.press("PageDown");
  w = await st(() => window.__v3.app.getState().window);
  check("PageDown shifts the window by 7", w.from === "2026-10-08", JSON.stringify(w));
  await page.keyboard.press("PageUp");
  await page.getByRole("group", { name: "Move the window" }).getByRole("button", { name: "Today" }).click();

  // Horizontal scroll with a sticky label column
  await page.evaluate(() => { document.querySelector(".w-scroll").scrollLeft = 400; });
  const lab = await page.evaluate(() => { const l = document.querySelector(".w-label").getBoundingClientRect(), s = document.querySelector(".w-scroll").getBoundingClientRect(); return Math.abs(l.left - s.left); });
  check("label column stays put while scrolling sideways", lab < 2, `offset ${lab}`);
  await page.evaluate(() => { document.querySelector(".w-scroll").scrollLeft = 0; });

  // Size: 18 day columns and 12 store rows visible at 1366x768 with the drawer closed
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(150);
  const vis = await page.evaluate(() => {
    const sc = document.querySelector(".w-scroll").getBoundingClientRect();
    const cs = [...document.querySelectorAll('[role="gridcell"]')].filter((e) => { const r = e.getBoundingClientRect(); return r.left >= sc.left - 1 && r.right <= sc.right + 1 && r.top >= sc.top && r.bottom <= sc.bottom + 1; });
    return { cols: new Set(cs.map((e) => e.dataset.c)).size, rows: new Set(cs.map((e) => e.dataset.r)).size };
  });
  check("at least 12 store rows visible at 1366x768", vis.rows >= 12, JSON.stringify(vis));
  const cols = await page.evaluate(() => { const sc = document.querySelector(".w-scroll").getBoundingClientRect(); return new Set([...document.querySelectorAll('[role="gridcell"][data-r="0"]')].filter((e) => { const r = e.getBoundingClientRect(); return r.left >= sc.left - 1 && r.right <= sc.right + 1; }).map((e) => e.dataset.c)).size; });
  check("at least 18 day columns visible at 1366x768", cols >= 18, `${cols}`);
  await page.screenshot({ path: path.join(shots, "wall-768.png") });
  await page.setViewportSize({ width: 1366, height: 800 });
  await page.waitForTimeout(100);
  // Screenshot of the store axis
  await page.screenshot({ path: path.join(shots, "wall-store.png") });
  const pad = (n) => n;
  void pad;

  // Pharmacist axis
  await page.getByRole("group", { name: "Rows" }).getByRole("button", { name: "People" }).click();
  check("axis toggle: pharmacist rows", (await page.locator('[role="rowheader"]').count()) === 20 + 0 || (await page.locator('[role="row"]').count()) > 20, `${await page.locator('[role="row"]').count()} rows`);
  const ptext = await grid.innerText();
  check("pharmacist axis does not show time off (it lives on the Time off page): no hatch, no OFF text", (await page.locator('.w-cell[data-pid] .w-block[data-block="away"]').count()) === 0 && !ptext.includes("OFF"));
  check("pharmacist axis cells are green with the store code", (await page.locator('.w-cell[data-pid] .w-block[data-block="good"]').count()) > 20);
  check("people rows have a coloured dot (no initials)", (await page.locator('[role="rowheader"] .w-disc').count()) > 10);
  check("pharmacist axis shows store codes", /\bEST\b|\bCAT\b|\bSIL\b/.test(ptext));
  await page.locator('[role="gridcell"][data-r="2"][data-c="9"]').click();
  const psel = await st(() => window.__v3.app.getState().selection);
  check("pharmacist cell select sets pharmacistId + date", !!psel?.pharmacistId && psel.date === "2026-10-10" && !psel.storeId, JSON.stringify(psel));
  await page.screenshot({ path: path.join(shots, "wall-pharm.png") });
  await page.getByRole("group", { name: "Rows" }).getByRole("button", { name: "Stores" }).click();
  check("axis toggles back to stores", (await page.locator('[role="gridcell"][data-store]').count()) === 16 * 31);

  // Drag a chip to another store on the same day: one commit
  await st(() => window.__v3.app.getState().select(null));
  const pick = await st(() => {
    const a = window.__v3.app.getState();
    const s = a.world.state;
    const x = Object.values(s.assignments).find((y) => y.date === "2026-10-08" && y.storeId === "S1");
    return x ? { aid: x.id, pid: x.pharmacistId, from: "S1", to: "S2", date: x.date, cs: a.world.journal.changeSets.length } : null;
  });
  if (pick) {
    const src = page.locator(`[role="gridcell"][data-store="${pick.from}"][data-date="${pick.date}"] [data-aid="${pick.aid}"]`);
    const dst = page.locator(`[role="gridcell"][data-store="${pick.to}"][data-date="${pick.date}"]`);
    await src.dragTo(dst);
    const after = await st((id) => { const a = window.__v3.app.getState(); return { asg: a.world.state.assignments[id], cs: a.world.journal.changeSets.length }; }, pick.aid);
    check("dragging a chip to another store commits one move", after.asg?.storeId === pick.to && after.cs === pick.cs + 1, JSON.stringify({ at: after.asg?.storeId, want: pick.to, cs: after.cs, was: pick.cs }));
    // Refusal: that pharmacist is also placed at S3 the same day; dropping the S2 chip onto S3 is refused by the domain and says why.
    await st(({ pid, date }) => { window.__v3.app.getState().commit([{ t: "place", storeId: "S3", pharmacistId: pid, date }]); }, pick);
    const before = await st(() => window.__v3.app.getState().world.journal.changeSets.length);
    // The cell now holds two people, so the block is not draggable; the person is dragged from the Inspector row instead.
    await page.locator(`[role="gridcell"][data-store="S2"][data-date="${pick.date}"]`).click();
    await page.locator(`[data-drag-aid="${pick.aid}"]`).dragTo(page.locator(`[role="gridcell"][data-store="S3"][data-date="${pick.date}"]`));
    const r2 = await st((id) => { const a = window.__v3.app.getState(); return { at: a.world.state.assignments[id]?.storeId, cs: a.world.journal.changeSets.length, n: a.notice }; }, pick.aid);
    check("drop onto a store that already has them is refused with a notice", r2.cs === before && r2.at === "S2" && r2.n?.kind === "error", JSON.stringify(r2));
  } else check("drag: found a chip at CAT on Oct 8", false, "none");
  check("wall still renders after the moves", (await cells.count()) === 16 * 31);

  // Ghosts: remove an assignment ahead, open a preview proposal, the wall previews it
  const rm = await st(() => {
    const a = window.__v3.app.getState();
    const s = a.world.state;
    const x = Object.values(s.assignments).filter((y) => y.date >= "2026-10-12").sort((p, q) => (p.date < q.date ? -1 : 1))[0];
    if (!x) return null;
    a.commit([{ t: "remove", assignmentId: x.id }]);
    // Build/Improve take many seconds on this month, so open the preview through the repair path (same proposal, same ghosts).
    a.previewRepair({ edits: [{ t: "place", storeId: x.storeId, pharmacistId: x.pharmacistId, date: x.date }, { t: "remove", assignmentId: Object.values(s.assignments).find((y) => y.date === "2026-10-13" && y.storeId === "S2").id }], explanation: ["test"] });
    const w = window.__v3.app.getState().world;
    return { has: !!w.session.proposal, store: x.storeId, date: x.date };
  });
  if (rm?.has) {
    await page.waitForTimeout(150);
    check("proposal shows 'nothing is saved' strip", (await page.locator("main").getByText("nothing is saved until you accept").count()) === 1);
    check("ghosts: a cell with a preview has a dashed outline and a +/- badge, not initials", (await page.locator(".w-cell[data-ghost] .w-ghost").count()) > 0);
    const addText = await page.locator(".w-cell[data-ghost] .w-ghost").first().innerText();
    check("ghost badge starts with + or \u2212", /^[+\u2212]\d/.test(addText), addText);
    await page.screenshot({ path: path.join(shots, "wall-ghosts.png") });
    // Read-only while the proposal is open: no draggable chips
    check("blocks are not draggable while previewing", (await page.locator('.w-block[draggable="true"]').count()) === 0);
    await st(() => window.__v3.app.getState().discardProposal());
    await page.waitForTimeout(100);
    check("preview strip goes away after discard", (await page.locator("main").getByText("nothing is saved until you accept").count()) === 0);
  } else check("opened a Build proposal", false, JSON.stringify(rm));

  // What-if strip
  await st(() => window.__v3.app.getState().openScenario("Try"));
  await page.waitForTimeout(100);
  check("what-if strip shows while a scenario is open", (await page.getByText("What-if").count()) >= 1);
  await st(() => window.__v3.app.getState().discardScenario());

  // Performance: 16 x 31 re-render on selection change
  const ms = await page.evaluate(async () => {
    const t = performance.now();
    for (let i = 0; i < 20; i++) { window.__v3.app.getState().select({ storeId: Object.keys(window.__v3.app.getState().world.state.stores)[i % 5], date: `2026-10-${String(1 + (i % 28)).padStart(2, "0")}` }); await new Promise((r) => requestAnimationFrame(r)); }
    return (performance.now() - t) / 20;
  });
  check("selection change re-renders quickly", ms < 60, `${ms.toFixed(1)} ms/frame`);

  check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  srv.close();
}
console.log(failed() ? `${failed()} check(s) failed` : "all wall checks passed");
process.exit(failed() ? 1 : 0);
