// Cover plans: who could move where so an empty shift is filled with short drives, instead of sending one person far.
//
// Read-only. It proposes; nothing is placed until the district manager applies a plan, and applying goes through the same
// write gate as every other edit (placeName) and is refused if it would leave the month worse than it found it.
//
// How it works, for one day:
//   * Every open store needs one pharmacist. Every pharmacist who could work is a candidate for any store they are licensed for,
//     are free to work, and (for people already placed) staying where they are costs nothing.
//   * Moving someone costs their drive, made steeper the longer it is, so two 35-minute moves beat one 2-hour move. Floats are
//     more willing to drive, so their drive costs less. Drives over 90 minutes are "extreme" and cost extra; over 2 hours are not offered.
//   * The lowest-total-cost way to give every open store someone is found exactly (the assignment problem, Hungarian method).
//     When someone alone at a store moves, that store needs a replacement, so the answer can be a short chain of moves.
//   * A second pharmacist at a store can move to a store with nobody. A plan that leaves another store bare is never offered.
import { isoDate, weekdaySun0 } from "./calendar.ts";
import { choicesFor, offerable, type HoleChoice } from "./dashboard.ts";
import { effectiveTimeOff } from "./employment.ts";
import { driveBetween } from "./geo.ts";
import { mileageFor, RANKING_RATE, type Mileage } from "./mileage.ts";
import { getCell, setCellValue } from "./grid.ts";
import { isOpenDay, placeName } from "./place.ts";
import { personOnPto, timeOffDates } from "./pto.ts";
import { evaluate } from "./rules.ts";
import { isRphRole, RPH_SLOTS } from "./slots.ts";
import { loadFor } from "./suggest.ts";
import type { ScheduleDoc, SlotId } from "./types.ts";

/** Longest drive ever offered, in minutes. */
export const MAX_DRIVE = 120;
/** Past this a drive is "extreme": allowed, but only when nothing shorter works. */
export const LONG_DRIVE = 90;

const INF = 1e7;
const UNCOVERED = 5e5;
/** A store that has someone now must never be left bare to fill another: far costlier than any move. */
const MUST_STAY_COVERED = 2e6;
const CHANGE = 20;
const FLOAT_WILLING = 0.6;
/** One dollar of mileage pay counts like this many cost points (about a minute of extra drive). */
export const MILEAGE_WEIGHT = 1;

export type CoverMove = {
  name: string;
  float: boolean;
  /** The store they are scheduled at that day, or null when they are not scheduled anywhere. */
  from: string | null;
  /** Where they would drive from: the store they are at, or their home store. Null when unknown. */
  origin: string | null;
  to: string;
  /** One-way drive in minutes, or null when no drive time is known (then 60 is assumed). */
  minutes: number | null;
  miles: number | null;
  estimated: boolean;
  /** Mileage pay for working there from their HOME store (not from where they are that day). */
  mileage: Mileage;
  /** True for the move that fills the shift the plan was asked about. */
  fillsTarget: boolean;
  /** Who is still at the store they leave once the plan is done (someone who stays, or their replacement). Empty when they were not at a store. */
  leftWith?: string[];
};

export type CoverPlan = {
  /** Stable text for telling plans apart. */
  id: string;
  moves: CoverMove[];
  /** Sum of the drives, in minutes. */
  totalMinutes: number;
  /** The longest single drive, in minutes. */
  longest: number;
  /** Any drive over LONG_DRIVE. */
  extreme: boolean;
  /** Any drive time that is a guess rather than one the manager set. */
  estimated: boolean;
  /** Any drive with no known time. */
  unknown: boolean;
  /** Sum of the paid miles (both ways) of all moves; moves with unknown distance count as 0 here and set `mileageUnknown`. */
  paidMiles: number;
  /** Mileage dollars of all moves at the entered rate, or null when no rate is entered or a distance is unknown. */
  mileageDollars: number | null;
  /** Any move whose home-store distance is unknown. */
  mileageUnknown: boolean;
  /** Inner cost the plan was ranked on. */
  cost: number;
};

export type CoverResult = { plans: CoverPlan[]; reason: "ok" | "not-empty" | "nobody" };

// ---------------------------------------------------------------------------------------------------------------------------
// Hungarian method (minimum-cost assignment, n rows <= m columns). Standard potentials formulation.
function assign(cost: number[][], n: number, m: number): number[] {
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(m + 1).fill(0);
  const p = new Array<number>(m + 1).fill(0);
  const way = new Array<number>(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(m + 1).fill(Infinity);
    const used = new Array<boolean>(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0]!;
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1]![j - 1]! - u[i0]! - v[j]!;
        if (cur < minv[j]!) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j]! < delta) {
          delta = minv[j]!;
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]!] = u[p[j]!]! + delta;
          v[j] = v[j]! - delta;
        } else minv[j] = minv[j]! - delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0]!;
      p[j0] = p[j1]!;
      j0 = j1;
    } while (j0);
  }
  const result = new Array<number>(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j]) result[p[j]! - 1] = j - 1;
  return result;
}
/** Exposed for tests. */
export const _assign = assign;

// ---------------------------------------------------------------------------------------------------------------------------
type Ctx = {
  doc: ScheduleDoc;
  day: number;
  date: string;
  open: string[];
  /** For each person, the store they are scheduled at that day (first one found), or null. */
  placed: Map<string, string | null>;
  people: string[];
  choice: Map<string, Map<string, HoleChoice>>;
  weekday: number;
};

function context(doc: ScheduleDoc, day: number): Ctx {
  const open = doc.stores.filter((s) => isOpenDay(doc, s.code, day)).map((s) => s.code);
  const placed = new Map<string, string | null>();
  for (const s of doc.stores) {
    for (const slot of RPH_SLOTS) {
      const n = getCell(doc.grid, s.code, slot, day).trim();
      if (n && !placed.has(n)) placed.set(n, s.code);
    }
  }
  const people = doc.people.filter((p) => isRphRole(p.role)).map((p) => p.name);
  const choice = new Map<string, Map<string, HoleChoice>>();
  for (const code of open) choice.set(code, new Map(choicesFor(doc, code, day).map((c) => [c.name, c])));
  return { doc, day, date: isoDate(doc.year, doc.month, day), open, placed, people, choice, weekday: weekdaySun0(doc.year, doc.month, day) };
}

type Edge = { cost: number; move: Omit<CoverMove, "fillsTarget"> | null };

/** What it costs for this person to cover this store: INF when they can't, 0 when they are already there. */
function edge(ctx: Ctx, name: string, store: string): Edge {
  const { doc } = ctx;
  const c = ctx.choice.get(store)?.get(name);
  if (!c) return { cost: INF, move: null };
  if (c.here || ctx.placed.get(name) === store) return { cost: 0, move: null };
  if (c.state === "blocked" || !offerable(c) || c.state === "off" || c.state === "dayoff") return { cost: INF, move: null };
  const person = doc.people.find((p) => p.name === name);
  if (!person || person.noSuggest) return { cost: INF, move: null };
  if (personOnPto(effectiveTimeOff(doc), name, ctx.date)) return { cost: INF, move: null };
  const at = ctx.placed.get(name) ?? null;
  const origin = at ?? (person.home && person.home !== "—" ? person.home : null);
  const drive = origin ? driveBetween(doc, origin, store) : null;
  const minutes = drive ? drive.minutes : null;
  const m = minutes ?? 60;
  if (m > MAX_DRIVE) return { cost: INF, move: null };
  const float = person.role === "Float Pharmacist";
  let cost = m * (1 + m / 120) * (float ? FLOAT_WILLING : 1) + CHANGE;
  if (m > LONG_DRIVE) cost += 120;
  const load = loadFor(doc, name, ctx.day);
  if (!float) cost += Math.min(16, load.away * 2);
  if (load.week + 1 > 5 + (doc.stores.find((s) => s.code === person.home)?.satOpen ? 1 : 0)) cost += 25;
  if (doc.timeOff.some((t) => t.name === name && t.status === "requested" && timeOffDates(t).includes(ctx.date))) cost += 20;
  // Taking a store's second pharmacist away from a store that usually runs two is a reminder-level cost, not a block.
  if (at && at !== store && doc.stores.find((s) => s.code === at)?.twoPharmacistDays?.includes(ctx.weekday)) cost += 30;
  if (drive == null) cost += 15;
  // Mileage pay runs from the HOME store. Only the extra over what they would be paid where they are now counts, so a move never
  // looks better just because it pays less than a day they were not changing. Unknown distance costs like an unknown drive.
  const mileage = mileageFor(doc, person.home, store);
  const now = at ? mileageFor(doc, person.home, at) : null;
  const rate = doc.mileage?.rate ?? RANKING_RATE;
  if (mileage.paidMiles == null) cost += 15;
  else cost += Math.max(0, mileage.paidMiles - (now?.paidMiles ?? 0)) * rate * MILEAGE_WEIGHT;
  return {
    cost,
    move: { name, float, from: at, origin, to: store, minutes, miles: drive?.miles ?? null, estimated: drive?.estimated ?? true, mileage },
  };
}

type Solve = { assigned: Map<string, string | null>; moves: Map<string, Omit<CoverMove, "fillsTarget">> };

/** Cover every open store with the lowest total cost. `ban` forbids specific person-to-store moves; `rows` limits which stores must be covered. */
function solve(ctx: Ctx, target: string, rows: string[], ban: Set<string>): Solve {
  const n = rows.length;
  const cols = ctx.people.length + n;
  const matrix: number[][] = rows.map((store) => {
    const row = ctx.people.map((name) => {
      if (ban.has(`${name}|${store}`)) return INF;
      return edge(ctx, name, store).cost;
    });
    const wasCovered = RPH_SLOTS.some((sl) => getCell(ctx.doc.grid, store, sl, ctx.day).trim());
    for (let k = 0; k < n; k++) row.push(k === rows.indexOf(store) ? (store === target ? UNCOVERED * 1.2 : wasCovered ? MUST_STAY_COVERED : UNCOVERED) : INF);
    return row;
  });
  const pick = assign(matrix, n, cols);
  const assigned = new Map<string, string | null>();
  const moves = new Map<string, Omit<CoverMove, "fillsTarget">>();
  rows.forEach((store, i) => {
    const j = pick[i]!;
    const name = j >= 0 && j < ctx.people.length && matrix[i]![j]! < INF ? ctx.people[j]! : null;
    assigned.set(store, name);
    if (name) {
      const e = edge(ctx, name, store);
      if (e.move) moves.set(store, e.move);
    }
  });
  return { assigned, moves };
}

/** The moves that lead to the target store: the person who fills it, the person who replaces them, and so on. Other stores' fixes are left out. */
function chainTo(ctx: Ctx, s: Solve, target: string): CoverMove[] | null {
  const out: CoverMove[] = [];
  let store: string | null = target;
  const seen = new Set<string>();
  while (store && !seen.has(store)) {
    seen.add(store);
    if (!s.assigned.get(store)) return null; // the chain ends at a store nobody can cover
    const mv = s.moves.get(store);
    if (!mv) break; // someone already there keeps it: chain ends
    out.push({ ...mv, fillsTarget: store === target });
    // The mover's old store only needs a replacement if the solver gave it one; a second pharmacist leaving opens no gap.
    store = mv.from && ctx.open.includes(mv.from) && s.moves.has(mv.from) ? mv.from : null;
  }
  return out.length ? out : null;
}

function describe(ctx: Ctx, moves: CoverMove[], cost: number): CoverPlan {
  const moving = new Set(moves.map((m) => m.name));
  for (const m of moves) {
    if (!m.from) continue;
    const stay = RPH_SLOTS.map((sl) => getCell(ctx.doc.grid, m.from!, sl, ctx.day).trim()).filter((n) => n && !moving.has(n));
    const incoming = moves.filter((x) => x.to === m.from).map((x) => x.name);
    m.leftWith = [...stay, ...incoming];
  }
  const minutes = moves.map((m) => m.minutes ?? 60);
  return {
    id: moves.map((m) => `${m.name}>${m.to}`).sort().join("+"),
    moves,
    totalMinutes: minutes.reduce((a, b) => a + b, 0),
    longest: Math.max(0, ...minutes),
    extreme: minutes.some((x) => x > LONG_DRIVE),
    estimated: moves.some((m) => m.estimated),
    unknown: moves.some((m) => m.minutes == null),
    paidMiles: Math.round(moves.reduce((a, m) => a + (m.mileage.paidMiles ?? 0), 0) * 100) / 100,
    mileageDollars: moves.some((m) => m.mileage.dollars == null) ? null : Math.round(moves.reduce((a, m) => a + (m.mileage.dollars ?? 0), 0) * 100) / 100,
    mileageUnknown: moves.some((m) => m.mileage.paidMiles == null),
    cost,
  };
}

/** Does applying these moves leave the day worse? Used as a safety net: holes and double-ups may only go down. */
export function applyCoverPlan(doc: ScheduleDoc, plan: Pick<CoverPlan, "moves">, day: number): { doc: ScheduleDoc; ok: boolean; problem?: string } {
  let next = doc;
  for (const m of plan.moves) if (!doc.people.some((p) => p.name === m.name && isRphRole(p.role))) return { doc, ok: false, problem: `${m.name} is not a pharmacist on this month` };
  for (const m of plan.moves) {
    // Clear the mover from where they are that day.
    for (const s of next.stores) {
      for (const slot of RPH_SLOTS) {
        if (getCell(next.grid, s.code, slot, day).trim() === m.name) next = { ...next, grid: setCellValue(next.grid, s.code, slot, day, "") };
      }
    }
  }
  for (const m of plan.moves) {
    const slot = RPH_SLOTS.find((sl) => !getCell(next.grid, m.to, sl, day).trim());
    if (!slot) return { doc, ok: false, problem: "That store already has its pharmacists" };
    const r = placeName(next, m.to, slot as SlotId, day, m.name);
    if (!r.ok) return { doc, ok: false, problem: r.reason === "unlicensed" ? `${m.name} is not licensed there` : "A store is closed that day" };
    next = r.doc;
  }
  // No store may end up bare that was not bare before: moving a gap from one store to another is not a fix.
  const bare = (d: ScheduleDoc) => d.stores.filter((s) => isOpenDay(d, s.code, day) && !RPH_SLOTS.some((sl) => getCell(d.grid, s.code, sl, day).trim())).map((s) => s.code);
  const wasBare = new Set(bare(doc));
  const nowBare = bare(next).find((c) => !wasBare.has(c));
  if (nowBare) return { doc, ok: false, problem: `That would leave ${doc.stores.find((s) => s.code === nowBare)?.name ?? nowBare} with no pharmacist` };
  const before = evaluate(doc);
  const after = evaluate(next);
  if (after.holes > before.holes || after.doubles > before.doubles || after.unlicensed > before.unlicensed || after.closed > before.closed) {
    return { doc, ok: false, problem: "That would leave the day worse than it is now" };
  }
  return { doc: next, ok: true };
}

/**
 * Up to three ways to fill the empty shift at `store` on `day`, shortest drives first. Empty when the shift is not empty or
 * nobody could reach it within MAX_DRIVE. Every plan returned has been checked to leave no store newly bare.
 */
export function coverPlans(doc: ScheduleDoc, store: string, day: number, max = 3): CoverResult {
  const open = doc.stores.filter((s) => isOpenDay(doc, s.code, day)).map((s) => s.code);
  if (!open.includes(store)) return { plans: [], reason: "not-empty" };
  if (RPH_SLOTS.some((sl) => getCell(doc.grid, store, sl, day).trim())) return { plans: [], reason: "not-empty" };
  const ctx = context(doc, day);

  const holesNow = open.filter((c) => !RPH_SLOTS.some((sl) => getCell(doc.grid, c, sl, day).trim()));
  // Two views: the whole day (every empty shift competes for the same people) and this store alone.
  const views: string[][] = [open, open.filter((c) => c === store || !holesNow.includes(c))];

  const found = new Map<string, CoverPlan>();
  const consider = (rows: string[], ban: Set<string>) => {
    const s = solve(ctx, store, rows, ban);
    if (!s.assigned.get(store)) return null;
    const chain = chainTo(ctx, s, store);
    if (!chain) return null;
    const plan = describe(ctx, chain, chain.reduce((a, m) => a + edgeCost(ctx, m), 0));
    const check = applyCoverPlan(doc, plan, day);
    if (!check.ok) return null;
    if (!found.has(plan.id)) found.set(plan.id, plan);
    return plan;
  };
  const edgeCost = (c: Ctx, m: CoverMove) => edge(c, m.name, m.to).cost;

  for (const rows of views) {
    const best = consider(rows, new Set());
    if (!best) continue;
    // Different ways to do it: forbid each move of the best plan in turn and solve again.
    for (const m of best.moves) consider(rows, new Set([`${m.name}|${m.to}`]));
  }
  const plans = [...found.values()].sort((a, b) => Number(a.extreme) - Number(b.extreme) || a.cost - b.cost || a.id.localeCompare(b.id)).slice(0, max);
  return { plans, reason: plans.length ? "ok" : "nobody" };
}

/** The shortest one-way drive of anyone simply free that day (no chain), or null when nobody is. Used to decide when plans are worth showing. */
export function bestDirectDrive(doc: ScheduleDoc, store: string, day: number): number | null {
  const ctx = context(doc, day);
  let best: number | null = null;
  for (const name of ctx.people) {
    if (ctx.placed.has(name)) continue;
    const e = edge(ctx, name, store);
    if (e.cost >= INF || !e.move) continue;
    const m = e.move.minutes ?? 60;
    if (best == null || m < best) best = m;
  }
  return best;
}
