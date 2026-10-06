// Golden-fixture runner. Fixtures live in domain/fixtures/*.json (see docs/v3/DOMAIN_SPEC.md §Fixture format).
// A fixture whose ops hit a NotImplementedError is reported as todo, not as a failure.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { api, NotImplementedError } from "../src/api.ts";
import { seedWorld, type Seed } from "../src/seed.ts";
import type { BuildResult, Edit, World } from "../src/api-types.ts";

type Step = { op: string; [k: string]: unknown };
type Fixture = { name: string; covers?: string[]; asOf: string; seed: Seed; steps: Step[]; shuffle?: number };

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

/** Partial deep match. Objects: expected keys only. Arrays: exact length and element-wise partial. {"$count":n}, {"$has":x}, {"$absent":true}, {"$any":true}. */
export function matches(actual: unknown, exp: unknown, path = "$"): string | null {
  if (exp && typeof exp === "object" && !Array.isArray(exp)) {
    const e = exp as Record<string, unknown>;
    if ("$any" in e) return actual === undefined ? `${path}: missing` : null;
    if ("$absent" in e) return actual === undefined || actual === null ? null : `${path}: expected absent, got ${JSON.stringify(actual)}`;
    if ("$count" in e) return Array.isArray(actual) && actual.length === e.$count ? null : `${path}: expected ${e.$count} items, got ${Array.isArray(actual) ? actual.length : typeof actual}`;
    if ("$has" in e) {
      if (!Array.isArray(actual)) return `${path}: expected array`;
      return actual.some((a) => matches(a, e.$has) === null) ? null : `${path}: no item matches ${JSON.stringify(e.$has)}`;
    }
    if (!actual || typeof actual !== "object") return `${path}: expected object, got ${JSON.stringify(actual)}`;
    for (const [k, v] of Object.entries(e)) {
      const r = matches((actual as Record<string, unknown>)[k], v, `${path}.${k}`);
      if (r) return r;
    }
    return null;
  }
  if (Array.isArray(exp)) {
    if (!Array.isArray(actual) || actual.length !== exp.length) return `${path}: expected ${JSON.stringify(exp)}, got ${JSON.stringify(actual)}`;
    for (let i = 0; i < exp.length; i++) {
      const r = matches(actual[i], exp[i], `${path}[${i}]`);
      if (r) return r;
    }
    return null;
  }
  return actual === exp ? null : `${path}: expected ${JSON.stringify(exp)}, got ${JSON.stringify(actual)}`;
}

function refId(world: World, ref: string): string {
  if (!ref.includes("|")) return ref;
  const [s, p, d] = ref.split("|");
  const hit = Object.values(world.state.assignments).find((a) => a.storeId === s && a.pharmacistId === p && a.date === d);
  if (!hit) throw new Error(`no assignment ${ref}`);
  return hit.id;
}

function resolveEdits(world: World, edits: Edit[]): Edit[] {
  return edits.map((e) => ("assignmentId" in e ? { ...e, assignmentId: refId(world, e.assignmentId) } : e));
}

function shuffled<T>(xs: T[], seed: number): T[] {
  const a = xs.slice();
  let x = seed * 2654435761 >>> 0 || 1;
  for (let i = a.length - 1; i > 0; i--) {
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    const j = x % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function shuffleSeed(seed: Seed, n: number): Seed {
  const out: Seed = { ...seed };
  for (const k of ["stores", "pharmacists", "assignments", "unavailability", "dateOverrides", "cells", "standing", "travel"] as const) {
    const v = seed[k] as unknown[] | undefined;
    if (v) (out as Record<string, unknown>)[k] = shuffled(v, n + k.length);
  }
  for (const a of out.assignments ?? []) if (a.id === undefined || a.seq === undefined) throw new Error("shuffle fixtures need explicit assignment id and seq");
  return out;
}

/** Runs all steps; returns per-step outputs (for shuffle comparison). */
function run(fx: Fixture, seed: Seed, check: boolean): unknown[] {
  let world = seedWorld(seed);
  const outs: unknown[] = [];
  const named: Record<string, string> = {};
  let lastCs = "";
  let lastBuild = null as BuildResult | null;
  const ex = (step: Step, actual: unknown) => {
    outs.push(actual);
    if (check && step.expect !== undefined) {
      const r = matches(actual, step.expect);
      assert.equal(r, null, `${fx.name} / ${step.op}${step.id ? ` (${String(step.id)})` : ""}: ${r}\nactual: ${JSON.stringify(actual).slice(0, 1500)}`);
    }
  };
  for (const step of fx.steps) {
    const asOf = (step.asOf as string | undefined) ?? fx.asOf;
    switch (step.op) {
      case "evaluate": {
        const ev = api.evaluate(world.state, asOf, { includeRequested: step.includeRequested as boolean | undefined, range: step.range as { from: string; to: string } | undefined });
        const byRef: Record<string, unknown> = {};
        for (const a of Object.values(ev.assignments)) {
          const as = world.state.assignments[a.assignmentId]!;
          const pick = (v: string, f: (r: (typeof a.results)[number]) => boolean = () => true) => a.results.filter((r) => r.verdict === v && f(r)).map((r) => r.ruleId);
          byRef[`${as.storeId}|${as.pharmacistId}|${as.date}`] = {
            counts: a.counts, unverified: a.unverified,
            fail: pick("Fail"), unknown: pick("Unknown"),
            overridden: a.results.filter((r) => r.overridden).map((r) => r.ruleId),
            outdated: a.results.filter((r) => r.outdated).map((r) => r.ruleId),
          };
        }
        ex(step, { cells: ev.cells, assignments: byRef });
        break;
      }
      case "commit": {
        const r = api.commit(world, resolveEdits(world, step.edits as Edit[]), (step.meta as never) ?? { kind: "manual" });
        if ("refused" in r) ex(step, r);
        else { world = r.world; lastCs = r.changeSet.id; if (step.id) named[step.id as string] = lastCs; ex(step, { ok: true, changeSet: r.changeSet }); }
        break;
      }
      case "undo": {
        const id = step.changeSet === "$last" ? lastCs : named[step.changeSet as string] ?? (step.changeSet as string);
        const r = api.undo(world, id);
        if ("refused" in r) ex(step, r);
        else { world = r.world; lastCs = r.changeSet.id; ex(step, { ok: true, changeSet: r.changeSet }); }
        break;
      }
      case "build":
      case "reset": {
        const range = step.range as { from: string; to: string };
        const r = step.op === "build" ? api.build(world, range, asOf) : api.resetToPattern(world, range, (step.stores as string[] | undefined) ?? null, asOf);
        lastBuild = r;
        if (step.accept && r.proposal) {
          const o = api.openProposal(world, r.proposal);
          assert.ok(!("refused" in o), "openProposal refused");
          const c = api.acceptProposal(o as World);
          assert.ok(!("refused" in c), "acceptProposal refused");
          world = (c as { world: World }).world;
          lastCs = (c as { changeSet: { id: string } }).changeSet.id;
        }
        ex(step, { edits: r.proposal?.edits ?? [], report: r.report, hasProposal: r.proposal !== null });
        break;
      }
      case "repair": {
        const r = api.repair(world, step.gaps as { storeId: string; date: string }[], { wider: step.wider as boolean | undefined, showNearMiss: step.showNearMiss as boolean | undefined }, asOf);
        if (step.accept !== undefined) {
          const opt = r.options[step.accept as number]!;
          const rr = api.commit(world, opt.edits, { kind: "repair", label: "Repair" });
          assert.ok(!("refused" in rr), "repair commit refused");
          world = (rr as { world: World }).world;
          lastCs = (rr as { changeSet: { id: string } }).changeSet.id;
        }
        ex(step, r);
        break;
      }
      case "improve": {
        const r = api.improve(world, step.opts as never, asOf);
        if (step.accept && r.proposal) {
          const o = api.openProposal(world, r.proposal);
          const c = api.acceptProposal(o as World);
          assert.ok(!("refused" in c));
          world = (c as { world: World }).world;
        }
        ex(step, r);
        break;
      }
      case "checkpoint": world = api.checkpoint(world, step.name as string); ex(step, { ok: true }); break;
      case "revert": {
        const r = api.revertToCheckpoint(world, step.name as string);
        if ("refused" in r) ex(step, r); else { world = r.world; ex(step, { ok: true, changeSet: r.changeSet }); }
        break;
      }
      case "post": {
        const r = api.post(world, step.range as { from: string; to: string }, asOf);
        world = r.world; ex(step, r.snapshot); break;
      }
      case "toTell": ex(step, { entries: api.toTell(world, asOf) }); break;
      case "markTold": world = api.markTold(world, step.entries as never); ex(step, { entries: api.toTell(world, asOf) }); break;
      case "scenario.open": { const r = api.openScenario(world, step.name as string); if ("refused" in r) ex(step, r); else { world = r; ex(step, { ok: true, session: world.session }); } break; }
      case "scenario.edit": { const r = api.scenarioEdit(world, resolveEdits(world, step.edits as Edit[])); if ("refused" in r) ex(step, r); else { world = r; ex(step, { ok: true, session: world.session }); } break; }
      case "scenario.park": world = api.parkScenario(world); ex(step, { session: world.session }); break;
      case "scenario.discard": world = api.discardScenario(world); ex(step, { session: world.session }); break;
      case "proposal.open": { assert.ok(lastBuild?.proposal, "no proposal"); const r = api.openProposal(world, lastBuild!.proposal!); if ("refused" in r) ex(step, r); else { world = r; ex(step, { ok: true, session: world.session }); } break; }
      case "proposal.accept": { const r = api.acceptProposal(world); if ("refused" in r) ex(step, r); else { world = r.world; lastCs = r.changeSet.id; ex(step, { ok: true, changeSet: r.changeSet }); } break; }
      case "changed": ex(step, { entries: api.changedSincePosting(world) }); break;
      case "state": ex(step, { state: world.state, journal: world.journal, session: world.session, hash: api.stateHash(world.state) }); break;
      default: throw new Error(`unknown op ${step.op}`);
    }
  }
  return outs;
}

for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
  const fx = JSON.parse(readFileSync(join(dir, f), "utf8")) as Fixture;
  test(`${f}: ${fx.name}`, (t) => {
    try {
      const base = run(fx, fx.seed, true);
      for (let i = 1; i <= (fx.shuffle ?? 0); i++) {
        const again = run(fx, shuffleSeed(fx.seed, i), false);
        assert.deepEqual(again, base, `${fx.name}: output changed when input order was shuffled (round ${i})`);
      }
    } catch (e) {
      if (e instanceof NotImplementedError) { t.todo(e.message); return; }
      throw e;
    }
  });
}
