// The Inspector judges one candidate at a time (choiceFor = judgeChoice over prepareChoices, evalDelta against a shared base).
// This compares that single-candidate judge with the plain definition: applyScratch the edit, run a full evaluate, read the result.
// choiceFor itself lives in app3 (it imports the store); it is a one-line wrapper over judgeChoice(prepareChoices(...)), so the wrapped
// pure functions are tested here, including the "prepared once per day, judged for many stores" and "was" evaluation paths.
import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeChoice, prepareChoices, type Choice } from "../src/choices.ts";
import { evaluate } from "../src/coverage.ts";
import { applyScratch } from "../src/changeset.ts";
import { cmp, type ISODate } from "../src/dates.ts";
import { RULE_BY_ID } from "../src/rules.ts";
import type { DomainState } from "../src/types.ts";
import { genWorld, WORLD_KINDS, rng } from "../../scripts/v3-pressure/lib.ts";

/** The straightforward version: a scratch copy with the edit, a full evaluate of that day, read the placed assignment. */
function judgeRef(state: DomainState, id: string, storeId: string, date: ISODate, asOf: ISODate): Choice | null {
  const one = { from: date, to: date };
  const base = evaluate(state, asOf, { range: one, window: one });
  const mine = Object.values(state.assignments).filter((a) => a.date === date && a.pharmacistId === id);
  if (mine.some((a) => a.storeId === storeId)) return null;
  const move = mine.length === 1 ? mine[0]! : null;
  const edit = move ? ({ t: "move", assignmentId: move.id, toStoreId: storeId } as const) : ({ t: "place", storeId, pharmacistId: id, date } as const);
  const next = applyScratch(state, [edit], undefined, { skipMoot: true });
  if ("refused" in next) return null;
  const ev = evaluate(next, asOf, { range: one, window: one });
  const a = move ? next.assignments[move.id] : Object.values(next.assignments).find((x) => x.pharmacistId === id && x.storeId === storeId && x.date === date);
  const res = a ? ev.assignments[a.id] : undefined;
  if (!res) return null;
  const fails = res.results.filter((r) => r.verdict === "Fail" && !r.overridden);
  const base0 = state.pharmacists[id]?.baseStoreId ?? null;
  const pair = base0 && base0 !== storeId ? state.travel[`${base0}|${storeId}`] : null;
  let leavesShort: Choice["leavesShort"] = null;
  if (move) {
    const was = base.cells[`${move.storeId}|${date}`]?.open ?? 0;
    const now = ev.cells[`${move.storeId}|${date}`]?.open ?? 0;
    if (now > was) leavesShort = { storeId: move.storeId, open: now };
  }
  return {
    pharmacistId: id, currently: mine.length ? mine.map((m) => m.storeId).sort(cmp).join(",") : "off",
    blocks: fails.filter((r) => RULE_BY_ID[r.ruleId]?.kind === "presence").map((r) => r.ruleId),
    warns: fails.filter((r) => RULE_BY_ID[r.ruleId]?.kind === "policy").map((r) => r.ruleId),
    unknown: res.results.filter((r) => r.verdict === "Unknown").map((r) => r.ruleId),
    travelMinutes: base0 === storeId ? 0 : pair ? pair.minutes : null,
    counts: res.counts, leavesShort, action: move ? "move" : "place", ...(move ? { assignmentId: move.id } : {}),
    unavailable: res.results.some((r) => r.ruleId === "availability" && r.verdict === "Fail"),
  };
}

/** Put overrides on a few failing assignments so the override-aware paths are exercised too. */
function withOverrides(state: DomainState, asOf: ISODate): { state: DomainState; n: number } {
  const ev = evaluate(state, asOf);
  const edits: { t: "override"; assignmentId: string; ruleId: string; reason: string }[] = [];
  for (const [aid, res] of Object.entries(ev.assignments)) {
    const f = res.results.find((r) => r.verdict === "Fail" && !r.overridden);
    if (f) edits.push({ t: "override", assignmentId: aid, ruleId: f.ruleId, reason: "test" });
    if (edits.length >= 6) break;
  }
  if (!edits.length) return { state, n: 0 };
  const next = applyScratch(state, edits);
  return "refused" in next ? { state, n: 0 } : { state: next, n: edits.length };
}

for (const kind of WORLD_KINDS) {
  test(`single-candidate judge equals the full-evaluate reference (${kind})`, () => {
    const w = genWorld({ seed: 23, stores: 10, kind, start: "2026-10-01", days: 31 });
    const asOfs: ISODate[] = ["2026-10-06", "2026-10-20"];
    const o = withOverrides(w.state, "2026-10-06");
    const r = rng(311);
    let judged = 0;
    let nonNull = 0;
    let counted = 0;
    for (const [label, state] of [["plain", w.state], ["overrides", o.state]] as const) {
      const stores = Object.keys(state.stores);
      const people = Object.keys(state.pharmacists).sort(cmp);
      for (let i = 0; i < 4; i++) {
        const date = `2026-10-${String(1 + r.int(31)).padStart(2, "0")}` as ISODate;
        const asOf = asOfs[i % 2]!;
        // Candidates on the date of an overridden assignment too (moving it must not lose or invent an override).
        const cb = prepareChoices(state, date, asOf);
        for (let k = 0; k < 2; k++) {
          const storeId = stores[r.int(stores.length)]!;
          for (const id of people.filter((_, j) => j % 3 === (i + k) % 3)) {
            const a = judgeChoice(cb, id, storeId);
            const b = judgeRef(state, id, storeId, date, asOf);
            judged++;
            if (b) nonNull++;
            if (b?.counts) counted++;
            assert.deepEqual(a, b, `${label} ${id} -> ${storeId} ${date} asOf ${asOf}`);
          }
        }
      }
    }
    assert.ok(nonNull > 0 && judged > 0, "something was judged");
    if (kind === "normal") assert.ok(counted > 0, "some candidates count");
    if (kind === "normal") assert.ok(o.n > 0, "overrides were created");
  });
}

test("judge with an explicit 'was' evaluation (the Inspector passes the day's own) gives the same answer", () => {
  const w = genWorld({ seed: 5, stores: 8, kind: "dense", start: "2026-10-01", days: 31 });
  const date: ISODate = "2026-10-14";
  const asOf: ISODate = "2026-10-06";
  const one = { from: date, to: date };
  const was = evaluate(w.state, asOf, { range: one, window: one });
  const stores = Object.keys(w.state.stores);
  const a = prepareChoices(w.state, date, asOf, was);
  const b = prepareChoices(w.state, date, asOf);
  for (const id of Object.keys(w.state.pharmacists)) for (const s of stores) assert.deepEqual(judgeChoice(a, id, s), judgeChoice(b, id, s));
});
