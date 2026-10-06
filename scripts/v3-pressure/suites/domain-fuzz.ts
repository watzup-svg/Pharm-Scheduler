// domain-fuzz: seeded random edits / undo / redo / checkpoint / revert / engine proposals on generated worlds of 18, 60 and 120 stores.
// After EVERY step: checkIntegrity is empty. Refused commits leave the hash alone. undo restores the pre-commit hash, undo-of-undo (redo) restores the post-commit hash,
// revert restores the checkpoint hash, scenarios never touch the live state. At the end the journal replays to the final state.
// Replay one case: node --experimental-strip-types --no-warnings scripts/v3-pressure/suites/domain-fuzz.ts --level low --case n60-s1
import { api, checkIntegrity, stateHash } from "../../../domain/src/index.ts";
import type { Edit, World } from "../../../domain/src/api-types.ts";
import { applyEvents } from "../../../domain/src/changeset.ts";
import { addDays } from "../../../domain/src/dates.ts";
import { clone } from "../../../domain/src/canonical.ts";
import { Invariant, genWorld, parseArgs, pick3, rng, runSuite, type Case, type Level, type Rng } from "../lib.ts";

const START = "2026-10-01";
const DAYS = 31;
// 120 stores is 7x real use: only with PRESSURE_EXTREME=1 (see docs/v3/PRESSURE.md).
const SIZES = process.env.PRESSURE_EXTREME ? [18, 60, 120] : [18, 60];

function randomEdit(w: World, r: Rng): Edit {
  const s = w.state;
  const stores = Object.keys(s.stores), phs = Object.keys(s.pharmacists), asg = Object.keys(s.assignments);
  const date = addDays(START, r.int(DAYS));
  const one = (k: string[]) => r.pick(k);
  const hasA = asg.length > 0;
  const unav = Object.keys(s.unavailability);
  const ovs = Object.values(s.overrides);
  const stand = Object.keys(s.standing);
  const kind = r.int(26);
  switch (kind) {
    case 0: case 1: case 2: return { t: "place", storeId: one(stores), pharmacistId: one(phs), date, ...(r.chance(0.3) ? { agreed: true } : {}) };
    case 3: case 4: return hasA ? { t: "remove", assignmentId: one(asg) } : { t: "place", storeId: one(stores), pharmacistId: one(phs), date };
    case 5: case 6: return hasA ? { t: "move", assignmentId: one(asg), toStoreId: one(stores) } : { t: "dateOverride.set", storeId: one(stores), date, count: 0, note: "x" };
    case 7: case 8: return hasA ? { t: "swap", assignmentId: one(asg), toPharmacistId: one(phs) } : { t: "dateOverride.clear", storeId: one(stores), date };
    case 9: return { t: "unavail.add", pharmacistId: one(phs), first: date, last: addDays(date, r.int(4)), status: r.pick(["Approved", "Requested", "Actual", "Denied"] as const), type: r.pick(["Vacation", "Sick", "Other"] as const) };
    case 10: return { t: "unavail.add", pharmacistId: one(phs), first: date, last: date, status: "Approved", type: "Turned-down", scopeStoreId: one(stores) };
    case 11: return unav.length ? { t: "unavail.update", id: one(unav), patch: { status: r.pick(["Approved", "Denied", "Actual"] as const) } } : { t: "unavail.remove", id: "U-none" };
    case 12: return unav.length ? { t: "unavail.remove", id: one(unav) } : { t: "unavail.add", pharmacistId: one(phs), first: date, last: date, status: "Approved", type: "Sick" };
    case 13: return { t: "dateOverride.set", storeId: one(stores), date, count: r.int(4), note: "n" };
    case 14: return { t: "dateOverride.clear", storeId: one(stores), date };
    case 15: return hasA ? { t: "override", assignmentId: one(asg), ruleId: one(["availability", "closure", "double-booking", "travel-soft", "consecutive-days", "license"]), reason: "ok" } : { t: "cell.set", storeId: one(stores), date, acceptedShort: 1 };
    case 16: return ovs.length ? { t: "unoverride", assignmentId: one(ovs).assignmentId, ruleId: one(ovs).ruleId } : { t: "cell.set", storeId: one(stores), date, locum: 1 };
    case 17: return hasA ? { t: "update", assignmentId: one(asg), patch: { pinned: r.chance(0.5), agreed: r.chance(0.5), ...(r.chance(0.2) ? { partialNote: "half day" } : {}) } } : { t: "cell.set", storeId: one(stores), date, locum: 1 };
    case 18: return { t: "cell.set", storeId: one(stores), date, ...(r.chance(0.5) ? { locum: r.int(3) } : { acceptedShort: r.int(3) }) };
    case 19: return { t: "requirement.set", storeId: one(stores), weekday: r.int(7), effectiveFrom: addDays(START, r.int(40)), count: r.int(4) };
    case 20: return { t: "requirement.clear", storeId: one(stores), weekday: r.int(7), effectiveFrom: addDays(START, r.int(40)) };
    case 21: return { t: "standing.add", storeId: one(stores), pharmacistId: one(phs), recurrence: { weekdays: [1 + r.int(5)], cycleWeeks: (1 + r.int(2)) as 1 | 2, anchor: START }, effectiveFrom: START };
    case 22: return stand.length ? { t: "standing.remove", id: one(stand) } : { t: "built.set", date };
    case 23: { const st = s.stores[one(stores)]!; return { t: "store.set", store: { ...st, name: st.name + (r.chance(0.5) ? "" : "'"), ...(r.chance(0.1) ? { inactiveFrom: addDays(START, 20 + r.int(30)) } : {}) } }; }
    case 24: { const ph = s.pharmacists[one(phs)]!; return { t: "pharmacist.set", pharmacist: { ...ph, initials: ph.initials + (r.chance(0.5) ? "" : "x") } }; }
    default: return r.chance(0.5)
      ? { t: "travel.set", pair: { fromStoreId: one(stores), toStoreId: one(stores), minutes: r.int(200), miles: r.int(120) } }
      : { t: "config.set", patch: { travelSoftMinutes: 60 + r.int(60), maxConsecutiveDays: 4 + r.int(5) } };
  }
}

const sumFails = (w: World, asOf: string, range: { from: string; to: string }) => {
  const ev = api.evaluate(w.state, asOf, { range });
  let fails = 0, open = 0;
  for (const a of Object.values(w.state.assignments)) for (const x of ev.assignments[a.id]?.results ?? []) if (x.verdict === "Fail" && !x.overridden) fails++;
  for (const c of Object.values(ev.cells)) open += c.open;
  return { fails, open };
};

function fuzzCase(stores: number, seed: number, steps: number): Case {
  const id = `n${stores}-s${seed}`;
  return {
    id,
    run(ctx) {
      const r = rng(seed * 7919 + stores);
      let w = genWorld({ seed, stores, start: START, days: DAYS });
      const initial = clone(w.state);
      const log: string[] = [];
      const counts: Record<string, number> = { commit: 0, refused: 0, undo: 0, redo: 0, checkpoint: 0, revert: 0, engine: 0, scenario: 0 };
      const replay = `node --experimental-strip-types --no-warnings scripts/v3-pressure/suites/domain-fuzz.ts --level ${currentLevel} --case ${id}`;
      const fail = (inv: string, msg: string, step: number) => { throw new Invariant(inv, `step ${step}: ${msg}`, { replay, actions: log, stateHash: stateHash(w.state) }); };
      const integrity = (step: number) => { const iss = checkIntegrity(w.state); if (iss.length) fail("integrity", iss.slice(0, 3).map((i) => `${i.table}:${i.key} ${i.problem}`).join("; ") + (iss.length > 3 ? ` (+${iss.length - 3} more)` : ""), step); };
      integrity(-1);
      let cpN = 0;
      for (let step = 0; step < steps; step++) {
        const before = stateHash(w.state);
        const roll = r.next();
        if (roll < 0.04 && w.journal.changeSets.length) {
          // checkpoint now, do two commits, revert, compare
          const name = `cp${cpN++}`;
          w = api.checkpoint(w, name); counts.checkpoint++;
          log.push(`#${step} checkpoint ${name} (hash ${before.slice(0, 8)})`);
          let w2 = w;
          for (let k = 0; k < 2; k++) { const e = randomEdit(w2, r); const c = api.commit(w2, [e], { kind: "manual" }); log.push(`#${step}.${k} commit ${JSON.stringify(e)} -> ${"refused" in c ? "refused" : c.changeSet.id}`); if (!("refused" in c)) w2 = c.world; }
          const rv = api.revertToCheckpoint(w2, name);
          log.push(`#${step} revert ${name} -> ${"refused" in rv ? "refused: " + rv.reason : rv.changeSet.id}`);
          if (!("refused" in rv)) {
            counts.revert++;
            if (stateHash(rv.world.state) !== before) { w = rv.world; fail("revert-hash", `revert to ${name} gave ${stateHash(rv.world.state).slice(0, 8)}, expected ${before.slice(0, 8)}`, step); }
            w = rv.world;
          } else if (!/Nothing changed/.test(rv.reason)) { w = w2; fail("revert-refused", `revert refused for a reason other than "nothing changed": ${rv.reason}`, step); } else w = w2;
          integrity(step);
          continue;
        }
        if (roll < 0.07) {
          // engine proposal on a short range, open and accept; check no violation grows
          const from = addDays(START, r.int(10)), to = addDays(from, 7);
          const asOf = from;
          const kind = r.pick(["build", "improve", "repair"] as const);
          let prop: import("../../../domain/src/api-types.ts").Proposal | null = null;
          if (kind === "build") prop = api.build(w, { from, to }, asOf).proposal;
          else if (kind === "improve") prop = api.improve(w, { from, to, includeNext14: false }, asOf).proposal;
          else {
            const ev = api.evaluate(w.state, asOf, { range: { from, to } });
            const gaps = Object.values(ev.cells).filter((c) => c.open > 0).slice(0, 2).map((c) => ({ storeId: c.storeId, date: c.date }));
            const rr = gaps.length ? api.repair(w, gaps, {}, asOf) : null;
            if (rr?.options[0]) prop = { kind: "repair", label: "fuzz", edits: rr.options[0].edits, explanation: [], stateHash: before, engineVersion: "fuzz" };
          }
          log.push(`#${step} ${kind} ${from}..${to} -> ${prop ? prop.edits.length + " edits" : "nothing"}`);
          counts.engine++;
          if (prop) {
            const opened = api.openProposal(w, prop);
            if ("refused" in opened) fail("proposal-open", `${kind} proposal would not open: ${opened.reason}`, step);
            else {
              const open = opened as World;
              if (stateHash(open.state) !== before) fail("proposal-writes", "opening a proposal changed the live state", step);
              const pre = sumFails(w, asOf, { from, to });
              const acc = api.acceptProposal(open);
              if ("refused" in acc) fail("proposal-accept", `${kind} proposal would not accept: ${acc.reason}`, step);
              else {
                w = acc.world;
                const post = sumFails(w, asOf, { from, to });
                if (kind === "improve" && (post.fails > pre.fails || post.open > pre.open)) fail("improve-worse", `Improve made things worse: fails ${pre.fails}->${post.fails}, open ${pre.open}->${post.open}`, step);
                if (kind === "repair" && post.open > pre.open) fail("repair-worse", `Repair raised open count ${pre.open}->${post.open}`, step);
              }
            }
          }
          integrity(step);
          continue;
        }
        if (roll < 0.09) {
          const sc = api.openScenario(w, "fuzz what-if");
          if (!("refused" in sc)) {
            counts.scenario++;
            let s2: World = sc;
            const e = randomEdit(w, r);
            const se = api.scenarioEdit(s2, [e]);
            log.push(`#${step} scenario edit ${JSON.stringify(e)} -> ${"refused" in se ? "refused" : "ok"}`);
            if (!("refused" in se)) s2 = se;
            if (stateHash(s2.state) !== before) fail("scenario-writes", "a what-if edit changed the live state", step);
            const back = api.discardScenario(s2);
            if (stateHash(back.state) !== before || back.session.scenario) fail("scenario-discard", "discarding a what-if did not restore the live schedule", step);
          }
          continue;
        }
        // plain commit, with optional undo / redo round trip
        const e = randomEdit(w, r);
        const res = api.commit(w, [e], { kind: "manual" });
        log.push(`#${step} commit ${JSON.stringify(e)} -> ${"refused" in res ? "refused: " + res.reason.slice(0, 80) : res.changeSet.id}`);
        if ("refused" in res) {
          counts.refused++;
          if (stateHash(w.state) !== before) fail("refused-mutates", "a refused commit changed the state", step);
          continue;
        }
        counts.commit++;
        const afterW = res.world;
        const after = stateHash(afterW.state);
        w = afterW;
        integrity(step);
        if (r.chance(0.3)) {
          const u = api.undo(w, res.changeSet.id);
          log.push(`#${step} undo ${res.changeSet.id} -> ${"refused" in u ? "refused: " + u.reason.slice(0, 80) : u.changeSet.id}`);
          if ("refused" in u) { fail("undo-refused", `undo of the change set just made was refused: ${u.reason}`, step); }
          else {
            counts.undo++;
            if (stateHash(u.world.state) !== before) { w = u.world; fail("undo-hash", `undo gave ${stateHash(u.world.state).slice(0, 8)}, expected ${before.slice(0, 8)}`, step); }
            w = u.world; integrity(step);
            if (r.chance(0.5)) {
              const redo = api.undo(w, u.changeSet.id);
              log.push(`#${step} redo (undo of ${u.changeSet.id}) -> ${"refused" in redo ? "refused: " + redo.reason.slice(0, 80) : redo.changeSet.id}`);
              if ("refused" in redo) fail("redo-refused", `redo was refused: ${redo.reason}`, step);
              else {
                counts.redo++;
                if (stateHash(redo.world.state) !== after) { w = redo.world; fail("redo-hash", `redo gave ${stateHash(redo.world.state).slice(0, 8)}, expected ${after.slice(0, 8)}`, step); }
                w = redo.world; integrity(step);
              }
            }
          }
        }
      }
      // journal replay
      const rebuilt = clone(initial);
      for (const cs of w.journal.changeSets) applyEvents(rebuilt, cs.events);
      if (stateHash(rebuilt) !== stateHash(w.state)) fail("journal-replay", `replaying ${w.journal.changeSets.length} change sets from the start gives ${stateHash(rebuilt).slice(0, 8)}, live is ${stateHash(w.state).slice(0, 8)}`, steps);
      const ids = new Set(w.journal.changeSets.map((c) => c.id));
      if (ids.size !== w.journal.changeSets.length) fail("journal-ids", "duplicate change set ids", steps);
      for (const [k, v] of Object.entries(counts)) ctx.metric(k, v);
      ctx.note(`${steps} steps, ${counts.commit} commits, ${counts.undo} undo, ${counts.redo} redo, ${counts.revert} revert, ${counts.engine} engine`);
    },
  };
}

let currentLevel: Level = "low";
const args = parseArgs();
currentLevel = args.level;
const L = args.level;
const seeds = pick3(L, 1, 3, 8);
const steps: Record<number, number> = { 18: pick3(L, 120, 400, 1000), 60: pick3(L, 70, 250, 600), 120: pick3(L, 45, 150, 400) };
const cases: Case[] = [];
for (const n of SIZES) for (let s = 1; s <= seeds; s++) cases.push(fuzzCase(n, s, steps[n]!));
await runSuite("domain-fuzz", cases, args);
