// Keyboard use of the wall at scale: 120 stores / 500 people. Rows are windowed (only the rows near the viewport are in the DOM), so this
// checks the grid semantics (aria-rowcount / aria-rowindex), arrow/Home/End/Page keys, that the active cell is scrolled into view and stays
// rendered, that the Tab stop is never on an unmounted row, and that Enter/Space select a cell and the Inspector shows it. Both axes.
// Build first: npm run build:v3.   node e2e/v3-scale-keyboard.mjs
import { launch, serveV3, check, failed } from "./v3-lib.mjs";
import { genWorld } from "../scripts/v3-pressure/lib.ts";

const STORES = 120;
const PEOPLE = 500;
const world = genWorld({ seed: 5, stores: STORES, pharmacists: PEOPLE, kind: "normal", start: "2026-10-01", days: 31 });
const b = await launch();
const s = await serveV3();
const page = await b.newPage({ viewport: { width: 1366, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(s.base, { waitUntil: "load" });
await page.waitForFunction(() => window.__v3);
await page.evaluate((w) => { const a = window.__v3.app.getState(); a.setWorld(w, { fileName: "Big.sqlite" }); a.setAsOf("2026-10-06"); a.setWindow("2026-10-01", "2026-10-31"); a.setView("wall"); }, world);
await page.waitForSelector('[role="gridcell"]', { timeout: 60000 });

const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30)))));
const press = async (k, n = 1) => { for (let i = 0; i < n; i++) await page.keyboard.press(k); await settle(); };
/** Where the keyboard is: the focused cell (r, c), whether it is drawn and inside the scroll box, and the tab stops in the grid. */
const where = () => page.evaluate(() => {
  const g = document.querySelector('[role="grid"]');
  const el = document.activeElement;
  const cell = el && el.closest ? el.closest('[role="gridcell"]') : null;
  const sc = g.closest(".w-scroll");
  const head = g.querySelector(".w-head")?.getBoundingClientRect().height ?? 0;
  let visible = null;
  if (cell && sc) {
    const cr = cell.getBoundingClientRect(); const sr = sc.getBoundingClientRect();
    visible = cr.top >= sr.top + head - 1 && cr.bottom <= sr.bottom + 1 && cr.left >= sr.left - 1 && cr.right <= sr.right + 1;
  }
  return {
    r: cell ? Number(cell.dataset.r) : null, c: cell ? Number(cell.dataset.c) : null, inGrid: !!(cell && g.contains(cell)), visible,
    date: cell?.dataset.date ?? null, store: cell?.dataset.store ?? null, pid: cell?.dataset.pid ?? null,
    stops: g.querySelectorAll('[role="gridcell"][tabindex="0"]').length, gridStop: g.getAttribute("tabindex") === "0",
    gridFocused: el === g, rows: g.querySelectorAll('[role="row"][data-ri]').length,
    win: window.__v3.app.getState().window.from,
  };
});
const inspector = () => page.locator('[aria-label="Inspector details"]').innerText();
const sel = () => page.evaluate(() => window.__v3.app.getState().selection);

async function runAxis(axis) {
  const people = axis === "pharmacist";
  const N = people ? PEOPLE : STORES;
  const T = `${people ? "People" : "Stores"}:`;
  if (people) { await page.getByRole("button", { name: "People", exact: true }).click(); await settle(); }
  const grid = page.locator('[role="grid"]');
  check(`${T} one grid with role=grid`, (await grid.count()) === 1);
  const rc = Number(await grid.getAttribute("aria-rowcount"));
  check(`${T} aria-rowcount is rows plus the header (${N + 1})`, rc === N + 1, String(rc));
  const rows = await page.$$eval('[role="grid"] [role="row"][data-ri]', (a) => a.map((x) => [Number(x.dataset.ri), Number(x.getAttribute("aria-rowindex"))]));
  check(`${T} every drawn row has aria-rowindex = index + 2, within the count`, rows.length > 0 && rows.every(([ri, ai]) => ai === ri + 2 && ai <= rc), JSON.stringify(rows.slice(0, 4)));
  check(`${T} only a window of rows is in the DOM (${rows.length} of ${N})`, rows.length > 5 && rows.length < N / 3, String(rows.length));
  check(`${T} drawn rows are consecutive`, rows.every(([ri], i) => i === 0 || ri === rows[i - 1][0] + 1));
  const ncols = Number(await grid.getAttribute("aria-colcount"));
  check(`${T} aria-colcount is days plus the label column (32)`, ncols === 32, String(ncols));

  // Start on a cell near the top-left, by clicking it (a user's first move).
  await page.locator('[role="gridcell"][data-r="2"][data-c="5"]').click(); await settle();
  let w = await where();
  check(`${T} click puts the keyboard on that cell`, w.r === 2 && w.c === 5 && w.inGrid, JSON.stringify(w));
  await press("ArrowDown"); w = await where();
  check(`${T} ArrowDown moves one row down`, w.r === 3 && w.c === 5, JSON.stringify(w));
  await press("ArrowRight"); w = await where();
  check(`${T} ArrowRight moves one day on`, w.r === 3 && w.c === 6, JSON.stringify(w));
  await press("ArrowUp"); w = await where();
  check(`${T} ArrowUp moves one row up`, w.r === 2 && w.c === 6, JSON.stringify(w));
  await press("ArrowLeft"); w = await where();
  check(`${T} ArrowLeft moves one day back`, w.r === 2 && w.c === 5, JSON.stringify(w));
  await press("Home"); w = await where();
  check(`${T} Home goes to the first day, same row`, w.r === 2 && w.c === 0 && w.visible, JSON.stringify(w));
  await press("ArrowLeft"); w = await where();
  check(`${T} ArrowLeft stops at the first day`, w.c === 0 && w.r === 2);
  await press("End"); w = await where();
  check(`${T} End goes to the last day, same row`, w.r === 2 && w.c === 30 && w.visible, JSON.stringify(w));
  await press("ArrowRight"); w = await where();
  check(`${T} ArrowRight stops at the last day`, w.c === 30 && w.r === 2);
  await press("Home");

  // Walk far down: the active cell must keep scrolling into view and stay drawn.
  let bad = null;
  for (let i = 0; i < 70 && !bad; i++) { await page.keyboard.press("ArrowDown"); w = await where(); if (w.r !== 3 + i || !w.inGrid || !w.visible) bad = { i, ...w }; }
  await settle(); w = await where();
  check(`${T} 70 ArrowDown presses: always the next row, drawn and in view`, !bad && w.r === 72 && w.visible, JSON.stringify(bad ?? w));
  check(`${T} the window followed (rows far above are unmounted, count stays small)`, w.rows < N * 0.6 && (await page.locator('[role="gridcell"][data-r="0"]').count()) === 0, String(w.rows));
  check(`${T} exactly one tab stop in the grid`, w.stops + (w.gridStop ? 1 : 0) === 1, `${w.stops} cells + grid ${w.gridStop}`);
  console.log(`     rows drawn after the walk: ${w.rows}`);
  await press("ArrowUp", 5); w = await where();
  check(`${T} ArrowUp x5 goes back up`, w.r === 67 && w.visible, JSON.stringify(w));

  // Ctrl+End / Ctrl+Home: the far corners, drawn and focused.
  await press("Control+End"); await settle(); w = await where();
  check(`${T} Ctrl+End reaches the last row and last day`, w.r === N - 1 && w.c === 30 && w.visible && w.inGrid, JSON.stringify(w));
  await press("ArrowDown"); w = await where();
  check(`${T} ArrowDown stops at the last row`, w.r === N - 1);
  await press("Control+Home"); await settle(); w = await where();
  check(`${T} Ctrl+Home reaches the first row and day`, w.r === 0 && w.c === 0 && w.visible, JSON.stringify(w));

  // PageDown / PageUp move the window by a week and keep the keyboard in the grid.
  await press("ArrowDown", 3); await press("ArrowRight", 3);
  const w0 = await where();
  await press("PageDown"); w = await where();
  check(`${T} PageDown shows the next week and keeps the keyboard in the grid`, w.win > w0.win && w.inGrid && w.visible && w.r === w0.r, `${w0.win} -> ${w.win} ${JSON.stringify(w)}`);
  await press("PageUp"); w = await where();
  check(`${T} PageUp goes back the same week`, w.win === w0.win && w.inGrid && w.r === w0.r, `${w.win} vs ${w0.win}`);
  await page.evaluate(() => window.__v3.app.getState().setWindow("2026-10-01", "2026-10-31")); await settle();

  // Enter and Space select the cell and the Inspector shows it.
  await press("Control+Home"); await press("ArrowDown", 4); await press("ArrowRight", 8);
  w = await where();
  await press("Enter");
  let sl = await sel();
  const key = people ? sl?.pharmacistId : sl?.storeId;
  check(`${T} Enter selects the focused cell`, !!sl && sl.date === w.date && key === (people ? w.pid : w.store), JSON.stringify([sl, w.date]));
  const nm = await page.evaluate(([p, id]) => { const st = window.__v3.app.getState().world.state; return p ? st.pharmacists[id].name : st.stores[id].name; }, [people, key]);
  const ins = await inspector();
  const nameBit = people ? nm.split(" ").slice(-1)[0] : nm;
  check(`${T} the Inspector shows that ${people ? "person" : "store"} (${nm})`, ins.includes(nameBit), ins.slice(0, 120).replace(/\n/g, " | "));
  check(`${T} the selected cell is marked aria-selected`, (await page.locator('[role="gridcell"][aria-selected="true"]').count()) === 1);
  w = await where();
  check(`${T} focus stays on the cell after Enter`, w.inGrid && w.r === 4 && w.c === 8, JSON.stringify(w));
  await press("ArrowDown", 2); await press("ArrowRight");
  w = await where();
  await press(" ");
  sl = await sel();
  check(`${T} Space selects the focused cell`, !!sl && sl.date === w.date && (people ? sl.pharmacistId === w.pid : sl.storeId === w.store), JSON.stringify([sl, w.date, w.store ?? w.pid]));
  check(`${T} the Inspector follows`, (await inspector()).length > 40);

  // Tab leaves the grid; scroll the tab-stop row out of the window; Shift+Tab re-enters onto a drawn cell.
  await press("Control+End"); await press("ArrowUp", 3); w = await where();
  const deepR = w.r;
  await page.keyboard.press("Tab"); await settle(); let w1 = await where();
  check(`${T} Tab leaves the grid`, !w1.inGrid && !w1.gridFocused, JSON.stringify(w1));
  await page.evaluate(() => { document.querySelector(".w-scroll").scrollTop = 0; }); await settle(); await settle();
  let st = await where();
  check(`${T} with the active row scrolled away, still exactly one tab stop (a drawn cell, or the grid itself)`, st.stops + (st.gridStop ? 1 : 0) === 1, JSON.stringify(st));
  check(`${T} the tab stop is never on an unmounted row`, st.stops === 0 || (await page.evaluate(() => { const c = document.querySelector('[role="gridcell"][tabindex="0"]'); return !!c && c.isConnected; })));
  await page.keyboard.press("Shift+Tab"); await settle(); await settle();
  w = await where();
  check(`${T} Shift+Tab re-enters the grid onto a drawn cell`, w.inGrid && w.r !== null && !w.gridFocused, JSON.stringify(w));
  check(`${T} ...the cell it left from, brought back into view`, w.r === deepR && w.visible, JSON.stringify({ deepR, ...w }));
  // Tab forwards into the grid from the controls before it.
  await page.evaluate(() => { document.querySelector(".w-scroll").scrollTop = 0; document.activeElement.blur?.(); }); await settle(); await settle();
  const focusedBefore = await page.evaluate(() => { const g = document.querySelector('[role="grid"]'); const all = [...document.querySelectorAll('button,[href],input,select,textarea,[tabindex="0"]')].filter((e) => e.offsetParent !== null || e === g); const i = all.indexOf(g.querySelector('[role="gridcell"][tabindex="0"]') ?? g); return i; });
  check(`${T} the grid is reachable by Tab (a tab stop exists in document order)`, focusedBefore >= 0);
  await page.evaluate(() => window.__v3.app.getState().select(null));
}

await runAxis("store");
await runAxis("pharmacist");
check("no console errors", errors.length === 0, errors.slice(0, 3).join(" | ").slice(0, 400));
await b.close(); s.close();
process.exit(failed() ? 1 : 0);
