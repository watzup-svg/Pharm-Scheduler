// A practice schedule that already has things to fix: open shifts, rule breaks, time-off requests waiting, standing assignments that
// drifted, and a posted schedule with changes since. Invented people and stores. Built relative to today so the problems are always
// in the days ahead; no random numbers, so the same day gives the same schedule.
import { api } from "./api.ts";
import { seedWorld, type Seed } from "./seed.ts";
import type { World } from "./api-types.ts";

type SeedAsg = NonNullable<Seed["assignments"]>[number];

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const T = (d: string) => Date.parse(`${d}T00:00:00Z`);
const add = (d: string, n: number) => iso(T(d) + n * 86_400_000);
const dow = (d: string) => new Date(T(d)).getUTCDay();

/** `today` is the app's today. The month shown can be any; every date below is an offset from it. */
export function problemsWorld(today: string): { world: World; summary: string[] } {
  const start = add(today, -9);
  const end = add(today, 44);
  const days: string[] = [];
  for (let d = start; d <= end; d = add(d, 1)) days.push(d);

  // ---- stores: 16 on a made-up grid; 12 in Oregon, 4 in Washington
  const names = ["Alder", "Birch", "Cedar", "Dogwood", "Elm", "Fir", "Grove", "Hazel", "Ivy", "Juniper", "Kestrel", "Larch", "Maple", "Nettle", "Oak", "Pine"];
  const xy = names.map((_, i) => [(i % 4) * 22, Math.floor(i / 4) * 24] as const);
  const stores: NonNullable<Seed["stores"]> = names.map((n, i) => ({
    id: `S${i + 1}`, code: n.slice(0, 3).toUpperCase(), name: `${n} Pharmacy`, state: i % 4 === 3 ? "WA" : "OR",
    closedWeekdays: i % 5 === 0 ? [0] : [0, 6], // most stores close weekends; every fifth opens Saturday twoDays: i === 1 || i === 6 || i === 9 ? [1, 5] : [],
  }));
  const minutes = (a: number, b: number) => Math.round(12 + Math.hypot(xy[a]![0] - xy[b]![0], xy[a]![1] - xy[b]![1]) * 1.4);
  const travel: NonNullable<Seed["travel"]> = [];
  for (let a = 0; a < 16; a++) for (let b = 0; b < 16; b++) {
    if (a === b) continue;
    if ((a === 5 && b === 14) || (a === 14 && b === 5)) continue; // one pair nobody measured yet: shows "drive time not known"
    travel.push([`S${a + 1}`, `S${b + 1}`, minutes(a, b) + (a === 0 && b === 15 ? 70 : 0) + (a === 15 && b === 0 ? 70 : 0), Math.round(minutes(a, b) * 0.6)]);
  }

  // ---- people: two per busy store, one per other, plus a float pool
  const first = ["Ana", "Ben", "Cho", "Dev", "Eli", "Fay", "Gus", "Hana", "Ian", "Jo", "Kai", "Lena", "Moe", "Nia", "Omar", "Pia", "Quin", "Ravi", "Sol", "Tess", "Uma", "Vic", "Wen", "Xavi", "Yael", "Zed", "Abe", "Bea", "Cy", "Dot", "Eve", "Flo", "Gil", "Hugo"];
  const pharmacists: NonNullable<Seed["pharmacists"]> = first.map((n, i) => ({
    id: `P${i + 1}`, name: `${n} ${String.fromCharCode(65 + (i % 26))}.`, initials: `${n[0]}${String.fromCharCode(65 + ((i * 7) % 26))}`,
    base: i < 16 ? `S${i + 1}` : i < 28 ? `S${(i % 16) + 1}` : null, // the last six float
    lic: (i % 4 === 3 || i >= 28 || i % 9 === 0 ? ["OR", "WA"] : ["OR"]) as ("OR" | "WA")[],
  }));
  const P = (n: number) => pharmacists[n - 1]!;
  // licence trouble: one OR-only person is later placed in Washington; one licence expires in two weeks; one is not recorded at all
  P(2).lic = ["OR"];
  P(8).licExpires = { OR: add(today, 14) };
  P(20).lic = null;
  // someone leaving / someone starting
  P(30).inactiveFrom = add(today, 21);
  P(33).activeFrom = add(today, 10);

  // ---- standing agreements: each person's own weekdays at their base store (people 1-16 Mon-Fri, 17-28 three days)
  const standing: NonNullable<Seed["standing"]> = [];
  pharmacists.slice(0, 28).forEach((p, i) => {
    standing.push({ store: p.base!, ph: p.id, recurrence: { weekdays: i < 16 ? (i % 5 === 0 ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5]) : i % 2 ? [1, 3, 5] : [2, 4], cycleWeeks: 1, anchor: start }, from: start });
  });

  // ---- a normal month: everyone works their standing days; engine-placed (not manual) so Build and Improve may re-deal them
  const asg: SeedAsg[] = [];
  const taken = new Set<string>();
  let seq = 1;
  const put = (store: string, ph: string, date: string, extra: Partial<SeedAsg> = {}) => {
    const k = `${store}|${ph}|${date}`;
    if (taken.has(k)) return;
    taken.add(k);
    asg.push({ id: `A${seq}`, seq: seq++, store, ph, date, source: date < today ? "manual" : "pattern", agreed: true, ...extra });
  };
  for (const d of days) {
    const w = dow(d);
    for (const s of standing) {
      if (!s.recurrence.weekdays.includes(w)) continue;
      const st = stores.find((x) => x.id === s.store)!;
      if (st.closedWeekdays?.includes(w)) continue;
      put(s.store, s.ph, d);
    }
  }
  const fut = days.filter((d) => d > today);
  const weekdays = fut.filter((d) => dow(d) >= 1 && dow(d) <= 5);
  const wk = (n: number) => weekdays[n % weekdays.length]!; // Mon-Fri days ahead, in order
  const drop = (store: string, ph: string, date: string) => { const i = asg.findIndex((a) => a.store === store && a.ph === ph && a.date === date); if (i >= 0) { asg.splice(i, 1); taken.delete(`${store}|${ph}|${date}`); } };
  const unavail: NonNullable<Seed["unavailability"]> = [];
  const dateOverrides: NonNullable<Seed["dateOverrides"]> = [];
  const cells: NonNullable<Seed["cells"]> = [];
  const summary: string[] = [];

  // 1. open shifts: a few people simply are not on the board for a day
  [[3, 0], [5, 1], [7, 2], [11, 3], [12, 4], [14, 5]].forEach(([p, k]) => { const d = wk(k!); drop(P(p!).base!, P(p!).id, d); });
  summary.push("6 open shifts to cover");
  // 2. approved time off on days they are still scheduled (availability breaks)
  [[4, 6], [9, 7], [13, 8]].forEach(([p, k]) => { unavail.push({ ph: P(p!).id, first: wk(k!), last: wk(k!), status: "Approved", type: "Vacation", note: "Booked before the schedule was made" }); });
  summary.push("3 people scheduled on approved time off");
  // 3. requests still waiting for an answer (they would open shifts if approved)
  [[6, 9], [10, 10], [15, 11]].forEach(([p, k]) => { unavail.push({ ph: P(p!).id, first: wk(k!), last: add(wk(k!), 1), status: "Requested", type: "Vacation", note: "Asked last week" }); });
  summary.push("3 time-off requests waiting");
  // 4. booked at two stores the same day
  { const d = wk(12); put("S10", P(1).id, d, { source: "manual" }); }
  summary.push("1 person booked at two stores");
  // 5. licensing: an Oregon-only pharmacist placed in a Washington store (cannot be overridden), plus the expiring licence worked after it ends
  { const d = wk(13); put("S4", P(2).id, d, { source: "manual" }); }
  { const d = add(P(8).licExpires!.OR!, 3); if (dow(d) !== 0) put("S8", P(8).id, d, { source: "manual" }); }
  summary.push("licence problems (not licensed in Washington, an expiring licence)");
  // 6. too many days in a row: people 17 and 21 work nine days straight
  for (let k = 0; k < 9; k++) { const d = add(wk(0), k); put(P(17).base!, P(17).id, d, { source: "manual" }); } // a Sunday in the run is also a closed-day problem
  for (let k = 0; k < 8; k++) { const d = add(wk(1), k); put("S2", P(21).id, d, { source: "manual" }); }
  summary.push("long runs of days in a row");
  // 7. a long drive (over the hard limit) and a closed day
  { const d = wk(14); put("S16", P(1).id, d === wk(12) ? wk(15) : d, { source: "manual" }); }
  { const d = fut.find((x) => dow(x) === 0)!; put("S1", P(22).id, d, { source: "manual" }); }
  summary.push("a drive over the limit, someone placed on a closed day");
  // 8. a drive time nobody has measured
  { const d = wk(16); put("S15", P(6).id, d, { source: "manual" }); }
  // 9. a surplus (one more than needed) and a short cell that was accepted
  { const d = wk(17); put("S3", P(27).id, d); }
  { const d = wk(18); drop(P(14).base!, P(14).id, d); cells.push({ store: P(14).base!, date: d, acceptedShort: 1 }); }
  { const d = wk(19); drop(P(16).base!, P(16).id, d); cells.push({ store: P(16).base!, date: d, locum: 1 }); }
  summary.push("one extra person, one shift accepted as short, one locum");
  // 10. a holiday: one store needs two people that day, another is closed
  { const d = wk(20); dateOverrides.push({ store: "S2", date: d, count: 2, note: "Flu clinic" }, { store: "S7", date: d, count: 0, note: "Closed for inventory" }); }
  // 11. standing assignments that drifted: a few people sent to a different store, so Improve can send them home
  [[18, 3, 21], [19, 5, 22], [23, 7, 23], [24, 9, 24]].forEach(([p, s, k]) => { const d = wk(k!); drop(P(p!).base!, P(p!).id, d); put(`S${s}`, P(p!).id, d, { source: "build" }); });
  summary.push("4 standing assignments that drifted from the agreement");
  // 12. a few emergency and pinned placements the engine must leave alone
  { const d = wk(2); put("S5", P(26).id, d, { source: "emergency", agreed: false }); put("S6", P(28).id, d, { source: "manual", pinned: true }); }

  const world0 = seedWorld({ stores, pharmacists, assignments: asg, unavailability: unavail, dateOverrides, cells, standing, travel, built: [] });

  // ---- a posted schedule for the next two weeks, then three changes after it went up (so "Who to tell" has people on it)
  const posted = api.post(world0, { from: add(today, 1), to: add(today, 14) }, today).world;
  let w = posted;
  const after = [wk(3), wk(4), wk(5)];
  after.forEach((d, i) => {
    const a = Object.values(w.state.assignments).find((x) => x.date === d && x.source !== "emergency" && !x.pinned);
    if (!a) return;
    const alt = pharmacists.find((p) => p.base && p.base !== a.storeId && !Object.values(w.state.assignments).some((y) => y.date === d && y.pharmacistId === p.id));
    if (!alt) return;
    const r = api.commit(w, [{ t: "swap", assignmentId: a.id, toPharmacistId: alt.id }], { kind: "manual", label: `Swap after posting ${i + 1}` });
    if (!("refused" in r)) w = r.world;
  });
  summary.push("a posted schedule with changes since it went up");
  return { world: w, summary };
}
