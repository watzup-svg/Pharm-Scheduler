// Pre-launch fuzz: random edits must never crash the engine or break its promises.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDemo } from "./demo.ts";
import { createSample } from "./sample.ts";
import { evaluate } from "./rules.ts";
import { placeName } from "./place.ts";
import { choicesFor, offerable } from "./dashboard.ts";
import { rankCandidates } from "./suggest.ts";
import { planFill } from "./plan.ts";
import { planNextMonth, applyNextMonthPlan } from "./next-month.ts";
import { parseDoc, serializeDoc } from "./file.ts";
import { fixSteps } from "./fix.ts";
import { daysInMonth } from "./calendar.ts";
import { unlicensedAt } from "./licence.ts";
import { getCell } from "./grid.ts";
import { RPH_SLOTS } from "./slots.ts";
import { safeToApprove, timeOffImpact } from "./impact.ts";
import { buildDistrictSheet, buildEmployeeCalendar, buildStorePoster, cleanModel } from "./print-model.ts";
import { buildPackBytes } from "./pdf.ts";
import { DEFAULT_PRINT_PREFS } from "./types.ts";

let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)]!;

describe("fuzz: engine invariants", () => {
  for (const [label, make] of [["demo", createDemo], ["sample", createSample]] as const) {
    it(`${label}: 1500 random edits never crash and never place an unlicensed person`, () => {
      let doc = make();
      const names = doc.people.map((p) => p.name);
      for (let i = 0; i < 1500; i++) {
        const store = pick(doc.stores).code;
        const day = 1 + Math.floor(rnd() * daysInMonth(doc.year, doc.month));
        const slot = pick([...RPH_SLOTS]);
        const name = rnd() < 0.15 ? "" : pick(names);
        const r = placeName(doc, store, slot, day, name);
        if (r.ok && name) {
          const date = `${doc.year}-${String(doc.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          assert.equal(unlicensedAt(r.doc, name, store, date), null, `${name} placed unlicensed at ${store} ${day}`);
        }
        doc = r.doc;
        if (i % 100 === 0) {
          const ev = evaluate(doc);
          fixSteps(doc, ev, "rph");
        }
      }
      const ev = evaluate(doc);
      assert.ok(Number.isFinite(ev.holes));
      // Suggestions everywhere: never unlicensed, never crash.
      for (let k = 0; k < 120; k++) {
        const store = pick(doc.stores).code;
        const day = 1 + Math.floor(rnd() * daysInMonth(doc.year, doc.month));
        for (const c of rankCandidates(doc, store, day)) {
          const ch = choicesFor(doc, store, day).find((x) => x.name === c.name)!;
          assert.ok(offerable(ch), `${c.name} suggested but not offerable`);
        }
      }
      // Fill proposals: nobody twice on a day, nobody unlicensed.
      const fill = planFill(doc);
      const seen = new Set<string>();
      for (const row of fill) {
        if (!row.pick) continue;
        const k = `${row.pick.name}|${row.day}`;
        assert.ok(!seen.has(k), `double use ${k}`);
        seen.add(k);
        assert.equal(getCell(doc.grid, row.store, row.slot, row.day).trim(), "");
      }
      // Round trip is lossless.
      assert.deepEqual(parseDoc(serializeDoc(doc)), parseDoc(serializeDoc(parseDoc(serializeDoc(doc)))));
    });
  }

  it("next month works from every month, including December and a leap February", () => {
    for (let month = 1; month <= 12; month++) {
      for (const year of [2027, 2028, 2100]) {
        const doc = { ...createDemo(), year, month };
        const plan = planNextMonth(doc);
        const next = applyNextMonthPlan(doc, plan);
        evaluate(next);
        assert.equal(next.month, month === 12 ? 1 : month + 1);
        assert.equal(next.year, month === 12 ? year + 1 : year);
      }
    }
  });

  it("time-off impact and bulk safety never crash on random requests", () => {
    const doc = createDemo();
    for (let i = 0; i < 200; i++) {
      const p = pick(doc.people);
      const n = 1 + Math.floor(rnd() * 5);
      const start = 1 + Math.floor(rnd() * 26);
      const dates = Array.from({ length: n }, (_, j) => `${doc.year}-${String(doc.month).padStart(2, "0")}-${String(start + j).padStart(2, "0")}`);
      timeOffImpact(doc, p.name, dates);
      safeToApprove(doc, p.name, dates);
    }
  });

  it("every print model and the real PDF build for every store and person, clean or not, both papers", () => {
    const doc = createDemo();
    for (const paper of ["letter", "tabloid"] as const) {
      for (const clean of [false, true]) {
        const f = <T extends Parameters<typeof cleanModel>[0]>(m: T) => (clean ? cleanModel(m) : m);
        const models = [
          f(buildDistrictSheet(doc)),
          ...doc.stores.map((s) => f(buildStorePoster(doc, s.code)!)),
          ...doc.people.map((p) => f(buildEmployeeCalendar(doc, p.name)!)),
        ];
        for (const twoUp of [false, true]) {
          const bytes = buildPackBytes(models, { ...DEFAULT_PRINT_PREFS, paper, twoUp, draft: false, logo: null });
          assert.ok(bytes.byteLength > 5000);
        }
      }
    }
  });

  it("hostile names and files do not crash parsing or printing", () => {
    const evil = ["<img src=x onerror=alert(1)>", "'; DROP TABLE--", "名前テスト", "A".repeat(80), "Jo \"Q\" O’Neil", "🙂 Emoji"];
    const doc = createDemo();
    const people = doc.people.map((p, i) => (i < evil.length ? { ...p, name: evil[i]! } : p));
    const d2 = { ...doc, people, grid: doc.grid };
    const back = parseDoc(serializeDoc(d2));
    assert.equal(back.people[0]!.name, evil[0]!);
    buildPackBytes([buildDistrictSheet(d2), buildEmployeeCalendar(d2, evil[0]!)!, buildEmployeeCalendar(d2, evil[3]!)!], { ...DEFAULT_PRINT_PREFS, draft: false, logo: null });
    assert.throws(() => parseDoc(serializeDoc({ ...d2, people: [{ ...d2.people[0]!, name: "A".repeat(300) }, ...d2.people.slice(1)] })), Error);
    for (const bad of ["", "{", "[]", "null", "{}", '{"format":"hischool-schedule","version":99}', '{"format":"other"}', "\u0000\u0001", "x".repeat(10000)]) {
      assert.throws(() => parseDoc(bad), Error, `should reject: ${bad.slice(0, 20)}`);
    }
  });
});
