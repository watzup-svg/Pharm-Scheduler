// search-soak: Build / Repair / Improve over many generated months and world shapes (dense, sparse, all-unavailable, licensing-hostile, one-person stores, closed weeks).
// Records ms, edits, unresolved gaps and searchLimitHit per call. Fails on: a throw, a call over its time budget, an accepted proposal that fails integrity, introduces a rule Fail
// that was not there before, moves/removes past or pinned work, or a Repair option that does not close the gaps it claims.
// Replay one case: node --experimental-strip-types --no-warnings scripts/v3-pressure/suites/search-soak.ts --level low --case normal-n18-m0
import { RULE_BY_ID, api, checkIntegrity, stateHash } from "../../../domain/src/index.ts";
import type { Proposal, World } from "../../../domain/src/api-types.ts";
import { addDays } from "../../../domain/src/dates.ts";
import { Invariant, WORLD_KINDS, genWorld, monthEnd, monthStart, parseArgs, pick3, runSuite, type Case, type WorldKind } from "../lib.ts";

const args = parseArgs();
const L = args.level;

type Range = { from: string; to: string };
const failKeys = (w: World, asOf: string, range: Range): Set<string> => {
  const ev = api.evaluate(w.state, asOf, { range });
  const out = new Set<string>();
  for (const a of Object.values(w.state.assignments)) for (const x of ev.assignments[a.id]?.results ?? []) if (x.verdict === "Fail" && !x.overridden) out.add(`${a.storeId}|${a.pharmacistId}|${a.date}|${x.ruleId}`);
  return out;
};
const openCells = (w: World, asOf: string, range: Range): string[] => {
  const ev = api.evaluate(w.state, asOf, { range });
  return Object.values(ev.cells).filter((c) => c.open > 0 && c.date >= asOf).map((c) => `${c.storeId}|${c.date}`).sort();
};
const unverified = (w: World, asOf: string, range: Range) => Object.values(api.evaluate(w.state, asOf, { range }).cells).reduce((n, c) => n + c.unverified, 0);

function soakCase(kind: WorldKind, stores: number, m: number): Case {
  const id = `${kind}-n${stores}-m${m}`;
  const scale = stores / 18;
  const bud = { build: Math.round(15000 * scale), repair: Math.round(8000 * scale), improve: Math.round(12000 * scale) };
  return {
    id,
    budgetMs: Math.round((bud.build + bud.repair * 3 + bud.improve) * 1.2 + 10000),
    run(ctx) {
      const start = monthStart(m);
      const end = monthEnd(start);
      const range: Range = { from: start, to: end };
      const days = Number(end.slice(8));
      const seed = m * 31 + WORLD_KINDS.indexOf(kind) + 1;
      const w0 = genWorld({ seed, stores, kind, start, days });
      // odd months: asOf is mid-month, so the first ten days are the protected past
      const asOf = m % 2 === 1 ? addDays(start, 10) : start;
      const replay = `node --experimental-strip-types --no-warnings scripts/v3-pressure/suites/search-soak.ts --level ${L} --case ${id}`;
      const log: string[] = [];
      let cur = w0;
      const fail = (inv: string, msg: string) => { throw new Invariant(inv, msg, { replay, actions: log, stateHash: stateHash(cur.state) }); };
      const timed = <T>(op: "build" | "repair" | "improve", label: string, f: () => T): T => {
        const t = performance.now();
        let r: T;
        try { r = f(); } catch (e) { log.push(`${label} THREW`); throw new Invariant(`${op}-throw`, `${label} threw: ${(e as Error).message}`, { replay, actions: log, stateHash: stateHash(cur.state) }); }
        const ms = Math.round(performance.now() - t);
        ctx.metric(`${label}Ms`, ms);
        log.push(`${label} ${ms}ms`);
        if (ms > bud[op]) fail("budget", `${label} took ${ms} ms, over its ${bud[op]} ms budget (${stores} stores, ${kind})`);
        return r;
      };
      if (checkIntegrity(w0.state).length) fail("generator", "generated world fails integrity");
      const pastBefore = Object.values(w0.state.assignments).filter((a) => a.date < asOf);
      const pastIntact = (w: World, what: string) => {
        for (const a of pastBefore) { const x = w.state.assignments[a.id]; if (!x || x.storeId !== a.storeId || x.pharmacistId !== a.pharmacistId || x.date !== a.date) fail("past-moved", `${what} changed past assignment ${a.id} (${a.date} < as-of ${asOf})`); }
      };
      const accept = (p: Proposal, what: string): World => {
        const o = api.openProposal(cur, p);
        if ("refused" in o) return fail("proposal-open", `${what}: openProposal refused: ${o.reason}`) as never;
        const c = api.acceptProposal(o);
        if ("refused" in c) return fail("proposal-accept", `${what}: acceptProposal refused: ${c.reason}`) as never;
        return c.world;
      };

      // ---- Build
      const before = failKeys(cur, asOf, range);
      const b = timed("build", "build", () => api.build(cur, range, asOf));
      ctx.metric("buildEdits", b.proposal?.edits.length ?? 0);
      ctx.metric("unresolved", b.report.unresolvedGaps.length);
      ctx.metric("limitHit", b.report.searchLimitHit ? 1 : 0);
      if (b.proposal) {
        cur = accept(b.proposal, "build");
        const iss = checkIntegrity(cur.state);
        if (iss.length) fail("integrity-after-build", iss.slice(0, 3).map((i) => `${i.table}:${i.key} ${i.problem}`).join("; "));
        pastIntact(cur, "Build");
        const after = failKeys(cur, asOf, range);
        const fresh = [...after].filter((k) => !before.has(k));
        // A rule Fail on an assignment Build itself created is a violation introduced by the proposal.
        // Pattern placements are standing agreements: a soft policy Fail (drive, run length) on those is by design, a presence Fail (unavailable, closed, unlicensed, double-booked) is not.
        const created = new Map<string, string>();
        for (const e of b.proposal.edits) if (e.t === "place") created.set(`${e.storeId}|${e.pharmacistId}|${e.date}`, e.source ?? "build");
        const bad = fresh.filter((k) => {
          const parts = k.split("|");
          const src = created.get(parts.slice(0, 3).join("|"));
          if (!src) return false;
          return src !== "pattern" || RULE_BY_ID[parts[3]!]?.kind === "presence";
        });
        if (bad.length) fail("build-introduced-violation", `Build created ${bad.length} rule Fail(s) on its own placements, e.g. ${bad.slice(0, 3).join(", ")}`);
        ctx.metric("newFailsOnExisting", fresh.length - bad.length);
        const open = openCells(cur, asOf, range);
        const unres = new Set(b.report.unresolvedGaps.map((g) => `${g.storeId}|${g.date}`));
        const unreported = open.filter((k) => !unres.has(k));
        if (!b.report.searchLimitHit && unreported.length) fail("unresolved-mismatch", `${unreported.length} cell(s) still open after Build but not in report.unresolvedGaps, e.g. ${unreported.slice(0, 3).join(", ")}`);
        if (!b.report.searchLimitHit) {
          const b2 = timed("build", "build-again", () => api.build(cur, range, asOf));
          if (b2.proposal) fail("build-not-idempotent", `second Build proposed ${b2.proposal.edits.length} more edit(s): ${JSON.stringify(b2.proposal.edits.slice(0, 2))}`);
        }
      }

      // ---- Repair on up to three open cells (different dates when possible)
      const open = openCells(cur, asOf, range);
      const gaps = open.filter((_, i) => i % Math.max(1, Math.floor(open.length / 3)) === 0).slice(0, 3).map((k) => { const [storeId, date] = k.split("|") as [string, string]; return { storeId, date }; });
      ctx.metric("openBeforeRepair", open.length);
      if (gaps.length) {
        for (const wider of [false, true]) {
          const rr = timed("repair", wider ? "repair-wider" : "repair", () => api.repair(cur, gaps, { wider }, asOf));
          ctx.metric(`${wider ? "repairWider" : "repair"}Options`, rr.options.length);
          if (rr.status === "limit") ctx.metric("repairLimit", 1);
          if (rr.options.length > 3) fail("repair-options", `Repair returned ${rr.options.length} options, at most 3 allowed`);
          const beforeF = failKeys(cur, asOf, range);
          for (const [oi, o] of rr.options.entries()) {
            const c = api.commit(cur, o.edits, { kind: "repair" });
            if ("refused" in c) { fail("repair-option-refused", `option ${oi} does not apply: ${c.reason}`); continue; }
            if (checkIntegrity(c.world.state).length) fail("integrity-after-repair", `option ${oi} breaks integrity`);
            const afterF = failKeys(c.world, asOf, range);
            const fresh = [...afterF].filter((k) => !beforeF.has(k)).length;
            // Policy Fails (drive time, days in a row) are declared as overridesNeeded, presence Fails as violationsIntroduced.
            const declared = o.metrics.violationsIntroduced + o.metrics.overridesNeeded;
            if (fresh > declared) fail("repair-undeclared-violation", `option ${oi} introduces ${fresh} new rule Fail(s) but declares violationsIntroduced=${o.metrics.violationsIntroduced} + overridesNeeded=${o.metrics.overridesNeeded}`);
            const ev = api.evaluate(c.world.state, asOf, { range });
            const stillOpen = rr.gapsUsed.filter((g) => (ev.cells[`${g.storeId}|${g.date}`]?.open ?? 0) > 0).length;
            if (stillOpen > o.metrics.openRemaining) fail("repair-gap-not-closed", `option ${oi} leaves ${stillOpen} gap(s) open but declares openRemaining=${o.metrics.openRemaining}`);
            pastIntact(c.world, `Repair option ${oi}`);
          }
        }
      }

      // ---- Improve
      const sumFails = failKeys(cur, asOf, range).size;
      const sumOpen = openCells(cur, asOf, range).length;
      const sumUnv = unverified(cur, asOf, range);
      const im = timed("improve", "improve", () => api.improve(cur, { ...range, includeNext14: true }, asOf));
      ctx.metric("improveChanges", im.proposal?.edits.length ?? 0);
      if (im.proposal) {
        const next = accept(im.proposal, "improve");
        if (checkIntegrity(next.state).length) fail("integrity-after-improve", "Improve broke integrity");
        pastIntact(next, "Improve");
        const f2 = failKeys(next, asOf, range).size, o2 = openCells(next, asOf, range).length, u2 = unverified(next, asOf, range);
        if (f2 > sumFails) fail("improve-worse", `rule Fails rose ${sumFails} -> ${f2}`);
        if (o2 > sumOpen) fail("improve-worse", `open cells rose ${sumOpen} -> ${o2}`);
        if (u2 > sumUnv) fail("improve-worse", `unverified rose ${sumUnv} -> ${u2}`);
        cur = next;
      }
      ctx.note(`${b.proposal?.edits.length ?? 0} build edits, ${b.report.unresolvedGaps.length} unresolved${b.report.searchLimitHit ? ", LIMIT" : ""}, improve ${im.proposal?.edits.length ?? 0}`);
    },
  };
}

const plan: [number, number[], WorldKind[]][] = [
  [18, pick3(L, [0], [0, 1, 2], [0, 1, 2, 3, 4, 5]), WORLD_KINDS],
  [40, pick3(L, [1], [0, 1], [0, 1, 2]), pick3(L, ["normal"], ["normal", "dense", "licensing-hostile", "closed-weeks"], WORLD_KINDS)],
  ...(L === "high" ? ([[60, [0, 1], ["normal", "dense", "sparse"]]] as [number, number[], WorldKind[]][]) : []),
];
const cases: Case[] = [];
for (const [n, months, kinds] of plan) for (const m of months) for (const k of kinds) cases.push(soakCase(k, n, m));
await runSuite("search-soak", cases, args);
