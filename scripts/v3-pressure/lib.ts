// Shared bits for the v3 pressure suites: seeded PRNG, world generator, levels, and the case runner that writes <suite>.result.json.
// Pure Node, no browser. Suites import this; the orchestrator (run.mjs) only reads the result files.
import fs from "node:fs";
import path from "node:path";
import { seedWorld, type Seed } from "../../domain/src/seed.ts";
import { addDays } from "../../domain/src/dates.ts";
import type { World } from "../../domain/src/api-types.ts";

export type Level = "low" | "medium" | "high";
export const LEVELS: Level[] = ["low", "medium", "high"];
/** Pick by level: pick3(level, low, medium, high). */
export const pick3 = <T>(level: Level, lo: T, mid: T, hi: T): T => (level === "low" ? lo : level === "medium" ? mid : hi);

// ---------- PRNG ----------
export type Rng = ReturnType<typeof rng>;
export function rng(seed: number) {
  let x = (Math.imul(seed >>> 0 || 1, 2654435761) >>> 0) || 1;
  const next = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  for (let i = 0; i < 4; i++) next();
  return {
    next,
    int: (n: number) => Math.floor(next() * n),
    pick: <T>(a: readonly T[]): T => a[Math.floor(next() * a.length)]!,
    chance: (p: number) => next() < p,
    range: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    shuffle: <T>(a: T[]): T[] => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [b[i], b[j]] = [b[j]!, b[i]!]; } return b; },
  };
}

// ---------- world generator ----------
export type WorldKind = "normal" | "dense" | "sparse" | "all-unavailable" | "licensing-hostile" | "one-person" | "closed-weeks";
export const WORLD_KINDS: WorldKind[] = ["normal", "dense", "sparse", "all-unavailable", "licensing-hostile", "one-person", "closed-weeks"];
export type GenOpts = { seed: number; stores: number; kind?: WorldKind; start?: string; days?: number; pharmacists?: number };

type SP = Seed["pharmacists"][number];
/** A seeded world: `stores` stores, about 2.5 pharmacists per store (varies by kind), `days` days of assignments from `start`. */
export function genSeed(o: GenOpts): Seed {
  const r = rng(o.seed * 104729 + o.stores);
  const kind = o.kind ?? "normal";
  const start = o.start ?? "2026-10-01";
  const days = o.days ?? 31;
  const nS = o.stores;
  const ratio = { normal: 2.5, dense: 3.2, sparse: 1.15, "all-unavailable": 2.5, "licensing-hostile": 2.2, "one-person": 1, "closed-weeks": 2.3 }[kind];
  const nP = o.pharmacists ?? Math.max(2, Math.round(nS * ratio));
  const fill = { normal: 0.85, dense: 0.97, sparse: 0.4, "all-unavailable": 0.8, "licensing-hostile": 0.8, "one-person": 0.9, "closed-weeks": 0.85 }[kind];
  const stores = Array.from({ length: nS }, (_, i) => ({
    id: `S${i + 1}`,
    state: kind === "licensing-hostile" ? (r.chance(0.5) ? ("WA" as const) : r.chance(0.1) ? null : ("OR" as const)) : i % 5 === 0 ? ("WA" as const) : ("OR" as const),
    closedWeekdays: r.chance(0.15) ? [0, 6] : [0],
    twoDays: r.chance(0.25) ? [r.int(5) + 1] : [],
  }));
  const OR: ("OR" | "WA")[] = ["OR"], BOTH: ("OR" | "WA")[] = ["OR", "WA"], WA: ("OR" | "WA")[] = ["WA"];
  const pharmacists: SP[] = Array.from({ length: nP }, (_, i) => {
    let lic: ("OR" | "WA")[] | null = i % 7 === 0 ? BOTH : OR;
    let licExpires: SP["licExpires"];
    if (kind === "licensing-hostile") {
      const m = r.int(10);
      lic = m < 3 ? OR : m < 5 ? WA : m < 6 ? null : m < 8 ? BOTH : OR;
      if (m === 9) licExpires = { OR: addDays(start, r.int(days)) };
    }
    return { id: `P${i + 1}`, base: kind === "one-person" ? `S${(i % nS) + 1}` : r.chance(0.92) ? `S${(i % nS) + 1}` : null, lic, ...(licExpires ? { licExpires } : {}) };
  });
  const travel: [string, string, number, number][] = [];
  const fullTravel = nS <= 40;
  for (let a = 1; a <= nS; a++) for (let b = 1; b <= nS; b++) {
    if (a === b) continue;
    if (!fullTravel && !(Math.abs(a - b) <= 8 || r.chance(0.02))) continue; // large worlds: sparse matrix, so unknown travel is exercised
    if (kind === "one-person" && r.chance(0.5)) continue;
    travel.push([`S${a}`, `S${b}`, 15 + ((a * 7 + b * 13) % 130), 8 + ((a * 3 + b * 5) % 90)]);
  }
  const assignments: NonNullable<Seed["assignments"]> = [];
  let seq = 1;
  for (let d = 0; d < days; d++) {
    const date = addDays(start, d);
    for (let s = 1; s <= nS; s++) {
      if (!r.chance(fill)) continue;
      const ph = kind === "one-person" ? s : ((s - 1 + d * 3 + r.int(3)) % nP) + 1;
      assignments.push({ id: `A${seq}`, seq: seq++, store: `S${s}`, ph: `P${ph}`, date, agreed: r.chance(0.7), pinned: r.chance(0.03) });
    }
  }
  const seen = new Set<string>();
  const uniq = assignments.filter((a) => { const k = `${a.ph}|${a.store}|${a.date}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const unavailability: NonNullable<Seed["unavailability"]> = [];
  const nU = kind === "all-unavailable" ? 0 : Math.round(nP * 0.5);
  for (let i = 0; i < nU; i++) { const f = addDays(start, r.int(days)); unavailability.push({ id: `U${unavailability.length + 1}`, ph: `P${r.int(nP) + 1}`, first: f, last: addDays(f, r.int(5)), status: r.pick(["Approved", "Approved", "Requested", "Actual", "Denied"] as const) }); }
  if (kind === "all-unavailable") for (let i = 0; i < nP; i++) if (r.chance(0.85)) unavailability.push({ id: `U${unavailability.length + 1}`, ph: `P${i + 1}`, first: addDays(start, -3), last: addDays(start, days + 3), status: "Approved" });
  const dateOverrides: NonNullable<Seed["dateOverrides"]> = [];
  if (kind === "closed-weeks") for (const s of stores) if (r.chance(0.5)) { const f = r.int(days - 7); for (let d = 0; d < 7; d++) dateOverrides.push({ store: s.id, date: addDays(start, f + d), count: 0, note: "closed week" }); }
  const standing = Array.from({ length: Math.round(nS * 1.5) }, (_, i) => ({ id: `T${i + 1}`, store: `S${(i % nS) + 1}`, ph: `P${r.int(nP) + 1}`, recurrence: { weekdays: [1 + r.int(5), 1 + r.int(5)].filter((v, k, a) => a.indexOf(v) === k), cycleWeeks: (1 + r.int(2)) as 1 | 2, anchor: start }, from: start }));
  return { stores, pharmacists, assignments: uniq, unavailability, dateOverrides, travel, standing };
}
export const genWorld = (o: GenOpts): World => seedWorld(genSeed(o));

/** First day of month index m counted from 2026-09 (m=0 -> 2026-09-01). */
export const monthStart = (m: number): string => { const y = 2026 + Math.floor((8 + m) / 12); const mo = ((8 + m) % 12) + 1; return `${y}-${String(mo).padStart(2, "0")}-01`; };
export const monthEnd = (start: string): string => { const [y, m] = start.split("-").map(Number) as [number, number]; const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); return `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`; };

// ---------- case runner ----------
export class Invariant extends Error {
  invariant: string; replay?: string; actions?: unknown[]; stateHash?: string; screenshot?: string;
  constructor(invariant: string, message: string, extra: { replay?: string; actions?: unknown[]; stateHash?: string; screenshot?: string } = {}) {
    super(message); this.name = "Invariant"; this.invariant = invariant; Object.assign(this, extra);
  }
}
export type CaseFailure = { invariant: string; message: string; replay?: string; lastActions?: unknown[]; stack?: string; stateHash?: string; screenshot?: string };
export type CaseResult = { case: string; ok: boolean; /** A documented open issue was observed; does not fail the run. */ known?: string; ms: number; budgetMs?: number; note?: string; metrics?: Record<string, number | string>; failure?: CaseFailure };
export type SuiteResult = { suite: string; level: Level; ms: number; cases: CaseResult[]; skippedForTime: number; startedAt: string };
export type CaseCtx = { note(s: string): void; metric(k: string, v: number | string): void; known(s: string): void };
export type Case = { id: string; budgetMs?: number; run(ctx: CaseCtx): void | Promise<void> };

export type Args = { level: Level; out: string; budgetSec: number; only: string | null; raw: Record<string, string> };
export function parseArgs(argv = process.argv.slice(2)): Args {
  const raw: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) if (argv[i]!.startsWith("--")) { const k = argv[i]!.slice(2); const v = argv[i + 1] && !argv[i + 1]!.startsWith("--") ? argv[++i]! : "1"; raw[k] = v; }
  const level = (raw.level ?? "low") as Level;
  if (!LEVELS.includes(level)) throw new Error("level must be low, medium or high");
  return { level, out: raw.out ?? path.join(process.cwd(), "test-logs", "pressure-v3-adhoc"), budgetSec: Number(raw["budget-sec"] ?? 1e9), only: raw.case ?? null, raw };
}

export function failureOf(e: unknown): CaseFailure {
  if (e instanceof Invariant) return { invariant: e.invariant, message: e.message, replay: e.replay, lastActions: e.actions?.slice(-20), stack: (e.stack ?? "").split("\n").slice(0, 8).join("\n"), stateHash: e.stateHash, screenshot: e.screenshot };
  const x = e as Error;
  return { invariant: `exception:${x?.name ?? "Error"}`, message: String(x?.message ?? e).slice(0, 600), stack: (x?.stack ?? "").split("\n").slice(0, 10).join("\n") };
}

/** Runs the cases one by one, logs a line each, stops starting new ones after the time budget, writes <suite>.result.json and exits 0/1. */
export async function runSuite(suite: string, cases: Case[], args: Args): Promise<never> {
  const t0 = Date.now();
  const results: CaseResult[] = [];
  let skipped = 0;
  for (const c of cases) {
    if (args.only && c.id !== args.only) continue;
    if ((Date.now() - t0) / 1000 > args.budgetSec && !args.only) { skipped++; continue; }
    const notes: string[] = [];
    const metrics: Record<string, number | string> = {};
    const s = performance.now();
    let failure: CaseFailure | undefined;
    let known: string | undefined;
    try {
      const running = Promise.resolve(c.run({ note: (x) => notes.push(x), metric: (k, v) => { metrics[k] = v; }, known: (x) => { known = x; } }));
      // async cases (the browser) cannot hang the suite: twice the budget plus 30 s is the hard stop. Synchronous cases are stopped by the orchestrator's timeout.
      if (c.budgetMs) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const hardMs = c.budgetMs * 2 + 30000;
        const stop = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Invariant("timeout", `case still running after ${Math.round(hardMs / 1000)} s (twice its budget plus 30 s)`)), hardMs); });
        try { await Promise.race([running, stop]); } finally { clearTimeout(timer); }
      } else await running;
    } catch (e) { failure = failureOf(e); }
    const ms = Math.round(performance.now() - s);
    if (!failure && c.budgetMs && ms > c.budgetMs) failure = { invariant: "budget", message: `took ${ms} ms, budget ${c.budgetMs} ms` };
    const r: CaseResult = { case: c.id, ok: !failure, ...(known ? { known } : {}), ms, ...(c.budgetMs ? { budgetMs: c.budgetMs } : {}), ...(notes.length ? { note: notes.join("; ").slice(0, 300) } : {}), ...(Object.keys(metrics).length ? { metrics } : {}), ...(failure ? { failure } : {}) };
    results.push(r);
    console.log(`${r.ok ? (known ? "KNOWN" : "ok   ") : "FAIL "} ${suite}/${c.id} ${ms}ms${r.note ? "  " + r.note : ""}${failure ? "  -- " + failure.invariant + ": " + failure.message.slice(0, 200) : ""}`);
  }
  fs.mkdirSync(args.out, { recursive: true });
  const res: SuiteResult = { suite, level: args.level, ms: Date.now() - t0, cases: results, skippedForTime: skipped, startedAt: new Date(t0).toISOString() };
  fs.writeFileSync(path.join(args.out, `${suite}.result.json`), JSON.stringify(res));
  if (skipped) console.log(`note: ${skipped} case(s) not started (suite time budget ${args.budgetSec}s reached)`);
  process.exit(results.some((r) => !r.ok) ? 1 : 0);
}
