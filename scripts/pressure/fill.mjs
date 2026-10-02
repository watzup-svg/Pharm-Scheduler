// Fill-suggestion pressure tests (no browser, no AI tokens). Usage: node scripts/pressure/fill.mjs <cases|rules|chains|scale> <level>
//   cases   Grok's named cases, drive table, mileage and cover-plan unit tests (same at every level)
//   rules   many random shifts with holes: every plan checked against the hard rules, mileage math, determinism, read-only
//   chains  accept the top plan again and again (follow-on holes) until no hole is left or nobody can help: must end, never get worse
//   scale   a big month (30 / 60 / 120 stores): suggestions must stay inside a time limit and keep the rules
// One summary line per test (ok/FAIL and the numbers); detail lines start with two spaces and go to the log.
import { spawnSync } from "node:child_process";
import { imp, rng, root } from "./lib.mjs";

const [job, level = "low"] = process.argv.slice(2);
const L = { low: 0, medium: 1, high: 2 }[level];
const pick = (a) => a[L];
const fail = [];
const note = (m) => { if (fail.length < 15) fail.push(m); };
const t0 = Date.now();

if (job === "cases") {
  const files = ["fill-cases", "cover-plan", "drive-table", "mileage", "new-store", "miles-import"].map((f) => `src/lib/schedule/${f}.test.ts`);
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--test", ...files], { cwd: root, encoding: "utf8" });
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  console.log(out.split("\n").filter((l) => /^# (tests|pass|fail)|^not ok|^    not ok/.test(l)).map((l) => "  " + l).join("\n"));
  if (r.status !== 0) { console.log(`FAIL fill cases: ${(out.match(/# fail (\d+)/) ?? [])[1] ?? "?"} failed`); process.exit(1); }
  console.log(`ok   fill cases: ${(out.match(/# pass (\d+)/) ?? [])[1]} passed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  process.exit(0);
}

const { coverPlans, applyCoverPlan, MAX_DRIVE, MAX_CHAIN } = await imp("src/lib/schedule/cover-plan.ts");
const { evaluate } = await imp("src/lib/schedule/rules.ts");
const { paidMilesFor, rateOf } = await imp("src/lib/schedule/mileage.ts");
const { tableFor } = await imp("src/lib/schedule/drive-table.ts");
const { setCellValue, getCell } = await imp("src/lib/schedule/grid.ts");
const { blankMonthWithStores, HI_SCHOOL_STORES } = await imp("src/lib/schedule/stores.ts");
const { createDemo } = await imp("src/lib/schedule/demo.ts");
const { RPH_SLOTS } = await imp("src/lib/schedule/slots.ts");
const DAY = 14; // a Wednesday: every real store is open

/** A shift on DAY: each store has 0, 1 or 2 pharmacists; some pharmacists are free (home store, not scheduled). */
function shift(rnd, stores, { bare = 0.15, two = 0.2, free = 4 } = {}) {
  const base = blankMonthWithStores(createDemo());
  let doc = { ...base, stores, people: [], grid: {}, holidays: [] };
  let n = 0;
  const add = (home, float, at, slot) => {
    const p = { name: `P${String(++n).padStart(4, "0")}`, role: float ? "Float Pharmacist" : "Pharmacist", home, lead: false, phone: "", color: "#777777", licensedStates: ["OR", "WA"] };
    doc.people.push(p);
    if (at) doc.grid = setCellValue(doc.grid, at, slot, DAY, p.name);
  };
  for (const s of stores) {
    const r = rnd();
    if (r < bare) continue;
    add(s.code, rnd() < 0.25, s.code, "pharmacist");
    if (rnd() < two) add(s.code, rnd() < 0.4, s.code, "pharmacist2");
  }
  for (let i = 0; i < free; i++) { const h = stores[Math.floor(rnd() * stores.length)].code; add(h, rnd() < 0.4, null); }
  return doc;
}
const bareNow = (doc) => doc.stores.filter((s) => !RPH_SLOTS.some((sl) => getCell(doc.grid, s.code, sl, DAY).trim())).map((s) => s.code);

function checkPlans(doc, store, plans, result, tag) {
  const before = evaluate(doc);
  const wasBare = new Set(bareNow(doc));
  if (plans.length > 3) note(`${tag}: ${plans.length} plans`);
  if (result.leaveClosed !== (plans.length === 0)) note(`${tag}: leaveClosed does not match the plan list`);
  for (const p of plans) {
    if (p.moves.length > MAX_CHAIN) note(`${tag}: ${p.moves.length} moves`);
    if (new Set(p.moves.map((m) => m.name)).size !== p.moves.length) note(`${tag}: a person moves twice`);
    if (!p.moves.some((m) => m.fillsTarget && m.to === store)) note(`${tag}: does not fill the target`);
    if (p.opens.length > 1) note(`${tag}: opens ${p.opens.length} stores`);
    if (p.longest > MAX_DRIVE) note(`${tag}: drive ${p.longest} over the limit`);
    let paid = 0;
    for (const m of p.moves) {
      if (m.minutes != null && m.minutes > MAX_DRIVE) note(`${tag}: a leg of ${m.minutes} min`);
      const t = m.origin ? tableFor(doc.stores, m.origin, m.to) : null;
      if (t && m.origin !== m.to && (m.minutes !== t.minutes || Boolean(m.ferry) !== t.ferry)) note(`${tag}: ${m.origin}-${m.to} is ${m.minutes} min, table says ${t.minutes}${t.ferry ? " ferry" : ""}`);
      const home = doc.people.find((x) => x.name === m.name)?.home;
      const tm = home && home !== m.to ? tableFor(doc.stores, home, m.to) : null;
      if (tm && m.mileage.paidMiles !== paidMilesFor(tm.miles)) note(`${tag}: paid miles ${m.mileage.paidMiles} for ${home}-${m.to}, expected ${paidMilesFor(tm.miles)}`);
      paid += m.mileage.paidMiles ?? 0;
    }
    if (Math.abs(p.paidMiles - paid) > 0.011) note(`${tag}: plan paid miles ${p.paidMiles} != sum ${paid}`);
    if (p.mileageDollars != null && Math.abs(p.mileageDollars - paid * rateOf(doc)) > 0.05 * p.moves.length) note(`${tag}: dollars ${p.mileageDollars} != ${(paid * rateOf(doc)).toFixed(2)}`);
    const res = applyCoverPlan(doc, p, DAY);
    if (!res.ok) { note(`${tag}: plan does not apply: ${res.problem}`); continue; }
    const after = evaluate(res.doc);
    if (after.holes > before.holes) note(`${tag}: holes ${before.holes} -> ${after.holes}`);
    if (after.doubles > before.doubles || after.unlicensed > before.unlicensed || after.closed > before.closed) note(`${tag}: made the day worse`);
    if (!RPH_SLOTS.some((sl) => getCell(res.doc.grid, store, sl, DAY).trim())) note(`${tag}: target still empty`);
    const opened = bareNow(res.doc).filter((c) => !wasBare.has(c));
    if (opened.some((c) => !p.opens.includes(c))) note(`${tag}: left ${opened.join(",")} bare without saying so`);
    if (p.opens.length && opened.length !== p.opens.length) note(`${tag}: says it opens ${p.opens} but opened ${opened}`);
  }
}

if (job === "rules") {
  const N = pick([50, 500, 2000]);
  const rnd = rng(31);
  let holes = 0, plansSeen = 0, closeCards = 0, openers = 0, slowest = 0;
  for (let i = 0; i < N && fail.length < 15; i++) {
    const doc = shift(rnd, HI_SCHOOL_STORES.map((s) => ({ ...s })), { bare: 0.1 + rnd() * 0.3, two: rnd() * 0.4, free: Math.floor(rnd() * 6) });
    const snap = JSON.stringify(doc);
    for (const code of bareNow(doc)) {
      holes++;
      const t = Date.now();
      const r = coverPlans(doc, code, DAY);
      slowest = Math.max(slowest, Date.now() - t);
      plansSeen += r.plans.length;
      if (r.leaveClosed) closeCards++;
      openers += r.plans.filter((p) => p.opens.length).length;
      checkPlans(doc, code, r.plans, r, `case ${i} ${code}`);
      if (holes % 4 === 0 && JSON.stringify(coverPlans(doc, code, DAY)) !== JSON.stringify(r)) note(`case ${i} ${code}: not the same twice`);
    }
    if (JSON.stringify(doc) !== snap) note(`case ${i}: suggestions changed the schedule`);
  }
  console.log(`  ${N} shifts, ${holes} holes, ${plansSeen} plans, ${openers} that open a hole, ${closeCards} leave-closed cards, slowest ${slowest} ms`);
  if (slowest > pick([3000, 5000, 8000])) note(`one suggestion took ${slowest} ms`);
}

if (job === "chains") {
  // Accept the top plan again and again, as the district manager would: follow-on holes get their own suggestions. Moving a gap
  // from store to store can go round in circles, so the simulated manager gives each shift a few accepted plans (6) and then, or
  // as soon as a state repeats or a hole has no plan, closes what is left. Rules: holes never go up, every plan applies,
  // nothing crashes, and the number of circles is reported.
  const N = pick([20, 120, 500]);
  const rnd = rng(77);
  let steps = 0, ended = 0, closedByManager = 0, circles = 0, budget = 0;
  for (let i = 0; i < N && fail.length < 15; i++) {
    let doc = shift(rnd, HI_SCHOOL_STORES.map((s) => ({ ...s })), { bare: 0.15 + rnd() * 0.35, two: rnd() * 0.4, free: Math.floor(rnd() * 5) });
    const closed = new Set();
    const seen = new Set([JSON.stringify(doc.grid)]);
    let accepted = 0;
    for (;;) {
      const holes = bareNow(doc).filter((c) => !closed.has(c));
      if (!holes.length) { ended++; break; }
      if (accepted >= 6) { holes.forEach((c) => closed.add(c)); closedByManager += holes.length; budget++; break; }
      const before = evaluate(doc).holes;
      const code = holes[0];
      const r = coverPlans(doc, code, DAY);
      if (!r.plans.length) { closed.add(code); closedByManager++; continue; }
      const res = applyCoverPlan(doc, r.plans[0], DAY);
      if (!res.ok) { note(`case ${i}: top plan for ${code} does not apply: ${res.problem}`); break; }
      doc = res.doc; steps++; accepted++;
      const key = JSON.stringify(doc.grid);
      if (seen.has(key)) { circles++; holes.forEach((c) => closed.add(c)); bareNow(doc).forEach((c) => closed.add(c)); closedByManager++; break; }
      seen.add(key);
      if (evaluate(doc).holes > before) note(`case ${i}: holes went up ${before} -> ${evaluate(doc).holes}`);
    }
  }
  console.log(`  ${N} shifts, ${steps} plans accepted, ${ended} ended with every hole fixed or closed, ${closedByManager} holes closed by the manager, ${circles} went in circles, ${budget} hit the 6-plan budget`);
}

if (job === "scale") {
  const S = pick([30, 60, 120]);
  const rnd = rng(5);
  const base = createDemo();
  // Stores get invented codes and locations spread over the district, so the estimate (not the table) prices every pair.
  const stores = Array.from({ length: S }, (_, i) => ({ ...HI_SCHOOL_STORES[i % HI_SCHOOL_STORES.length], code: `S${String(i).padStart(3, "0")}`, name: `Store ${i}`, address: `${i} Main St, Town${i}, OR 97000`, lat: 42.2 + rnd() * 3.8, lng: -124 + rnd() * 3 }));
  let doc = shift(rnd, stores, { bare: 0.2, two: 0.25, free: Math.round(S / 8) });
  doc = { ...doc, year: base.year, month: base.month };
  const holes = bareNow(doc);
  const limit = pick([6000, 10000, 15000]);
  let slowest = 0, plans = 0;
  for (const code of holes.slice(0, pick([5, 8, 10]))) {
    const t = Date.now();
    const r = coverPlans(doc, code, DAY);
    const ms = Date.now() - t;
    slowest = Math.max(slowest, ms);
    plans += r.plans.length;
    checkPlans(doc, code, r.plans, r, `${S} stores, ${code}`);
  }
  console.log(`  ${S} stores, ${holes.length} holes, ${plans} plans, slowest suggestion ${slowest} ms (limit ${limit})`);
  if (slowest > limit) note(`a suggestion took ${slowest} ms, over ${limit}`);
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);
if (fail.length) { fail.forEach((f) => console.log("  ! " + f)); console.log(`FAIL fill ${job} (${level}): ${fail[0]}`); process.exit(1); }
console.log(`ok   fill ${job} (${level}) in ${secs}s`);
