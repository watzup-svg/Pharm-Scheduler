import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isStoreOpen } from "./calendar.ts";
import {
  covering,
  choicesFor,
  holeQueue,
  monthStatus,
  nextHole,
  offThisMonth,
  rosterLines,
  todayLines,
} from "./dashboard.ts";
import { keepDouble } from "./fix.ts";
import { printGate } from "./gate.ts";
import { getCell, setCellValue } from "./grid.ts";
import { placeName } from "./place.ts";
import { personOnPto } from "./pto.ts";
import { evaluate, issueKey } from "./rules.ts";
import { createSample } from "./sample.ts";

describe("September 2026 dashboard lessons", () => {
  const doc = createSample();

  it("Labor Day is closed everywhere and is not a Jane PTO day", () => {
    const days = 30;
    for (const store of doc.stores) {
      assert.equal(isStoreOpen(store, 2026, 9, 7, days, doc.holidays), false);
    }
    assert.equal(personOnPto(doc.timeOff, "Jane Smith", "2026-09-07"), false);
    assert.equal(personOnPto(doc.timeOff, "Jane Smith", "2026-09-14"), true);
    assert.equal(personOnPto(doc.timeOff, "Jane Smith", "2026-09-15"), true);
  });

  it("Estacada the 16th is a hole because nobody is there, not because Jane is on PTO", () => {
    const row = holeQueue(doc).find((h) => h.store === "EST" && h.day === 16);
    assert.ok(row);
    assert.equal(row.reason, "no pharmacist");
    assert.ok(row.free.length > 0 && row.free.length <= 3);
    assert.equal(row.free[0], "Jane Smith");
    assert.equal(row.free.every((n) => !personOnPto(doc.timeOff, n, "2026-09-16")), true);
  });

  it("home-store floats are not covering; a different store is", () => {
    assert.equal(covering(doc, "Susan Brown", "EST"), false);
    assert.equal(covering(doc, "Chris Hale", "MOL"), false);
    assert.equal(covering(doc, "Jane Smith", "MOL"), true);
    assert.equal(covering(doc, "Susan Brown", "WL"), true);
  });

  it("a pharmacist already sitting on a West Linn weekend is a hard leftover", () => {
    const next = {
      ...doc,
      grid: setCellValue(doc.grid, "WL", "pharmacist", 5, "Mark Chen"),
    };
    const ev = evaluate(next);
    const wl = ev.byKey[issueKey("WL", 5)];
    assert.equal(wl?.leftover, true);
    assert.deepEqual(wl?.leftoverNames, ["Mark Chen"]);
    assert.equal(ev.ready, false);
  });
});

describe("month status and front-door model", () => {
  const doc = createSample();
  const ev = evaluate(doc);

  it("is not ready: the Sep 4 double first, then the Estacada 16th hole", () => {
    const status = monthStatus(doc, ev);
    assert.equal(status.ready, false);
    assert.equal(status.steps.length, 2);
    assert.equal(status.next?.kind, "double");
    assert.equal(status.next?.day, 4);
    assert.deepEqual(status.next?.names, ["Jane Smith"]);
    assert.deepEqual([...(status.next?.stores ?? [])].sort(), ["EST", "MOL"]);
    assert.equal(status.then?.kind, "hole");
    assert.equal(status.then?.store, "EST");
    assert.equal(status.then?.day, 16);
    assert.equal(status.more, 0);
  });

  it("next hole is Estacada the 16th and offers a person without placing them", () => {
    const hole = nextHole(doc);
    assert.equal(hole?.store, "EST");
    assert.equal(hole?.day, 16);
    assert.equal(hole?.reason, "no pharmacist");
    assert.equal(getCell(doc.grid, "EST", "pharmacist", 16), "");
    assert.equal(getCell(doc.grid, "EST", "pharmacist2", 16), "");
  });

  it("free people are truly free; people working elsewhere are marked as a double", () => {
    const choices = choicesFor(doc, "EST", 16);
    const by = new Map(choices.map((c) => [c.name, c]));
    assert.equal(by.get("Jane Smith")?.state, "free");
    assert.equal(by.get("Susan Brown")?.state, "free");
    assert.equal(by.get("Tom Reyes")?.state, "double");
    assert.deepEqual(by.get("Tom Reyes")?.elsewhere, ["MOL"]);
    // Best first: home, then floats, then others, and busy people after every free person.
    assert.equal(choices[0]?.name, "Jane Smith");
    const firstBusy = choices.findIndex((c) => c.state !== "free");
    assert.ok(choices.slice(firstBusy).every((c) => c.state !== "free"));
  });

  it("the other pharmacist row counts as already here, so a second row would double", () => {
    const withJane = doc;
    const second = choicesFor(withJane, "EST", 5, "pharmacist2");
    const jane = second.find((c) => c.name === "Jane Smith");
    assert.equal(jane?.state, "double");
    assert.deepEqual(jane?.elsewhere, ["EST"]);
    const first = choicesFor(withJane, "EST", 5, "pharmacist");
    assert.equal(first.find((c) => c.name === "Jane Smith")?.here, true);
    assert.equal(first.find((c) => c.name === "Jane Smith")?.state, "free");
  });

  it("someone on time off that day is off, not free", () => {
    const off = choicesFor(doc, "EST", 14);
    assert.equal(off.find((c) => c.name === "Jane Smith")?.state, "off");
  });

  it("after the hole is filled by choice, the model reports the double it would make", () => {
    const placed = placeName(doc, "EST", "pharmacist", 16, "Tom Reyes").doc;
    const after = evaluate(placed);
    assert.equal(after.doubles, ev.doubles + 1);
    assert.equal(after.holes, 0);
  });

  it("lists who is off and whether they are still on a shift", () => {
    const rows = offThisMonth(doc);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.name, "Jane Smith");
    assert.deepEqual(rows[0]?.dates, ["2026-09-14", "2026-09-15"]);
    assert.equal(rows[0]?.sitting.length, 0);
    const sitting = placeName(doc, "EST", "pharmacist", 14, "Jane Smith").doc;
    const again = offThisMonth(sitting)[0];
    assert.deepEqual(again?.sitting, [{ store: "EST", slot: "pharmacist", day: 14 }]);
  });

  it("time off still prints: it never blocks the gate", () => {
    const yellow = placeName(doc, "EST", "pharmacist", 14, "Jane Smith").doc;
    const fixed = keepDouble(yellow, "Jane Smith", 4, "EST");
    const holeFilled = placeName(fixed, "EST", "pharmacist", 16, "Susan Brown").doc;
    const gate = printGate(holeFilled, evaluate(holeFilled));
    assert.equal(gate.blocked, false);
    assert.equal(gate.ready, true);
    assert.ok(gate.printableTimeOff >= 1);
  });

  it("covering is not an error: a float at a non-home store still prints", () => {
    const fixed = keepDouble(doc, "Jane Smith", 4, "EST");
    const covered = placeName(fixed, "EST", "pharmacist", 16, "Chris Hale").doc; // Chris's home is MOL
    assert.equal(covering(covered, "Chris Hale", "EST"), true);
    const gate = printGate(covered, evaluate(covered));
    assert.equal(gate.blocked, false);
    assert.equal(gate.steps.length, 0);
  });

  it("the gate is closed while the double and the hole remain", () => {
    const gate = printGate(doc, ev);
    assert.equal(gate.blocked, true);
  });

  it("a name left on a closed day blocks the gate and is the first problem", () => {
    const next = { ...doc, grid: setCellValue(doc.grid, "WL", "pharmacist", 5, "Mark Chen") };
    const status = monthStatus(next, evaluate(next));
    assert.equal(status.next?.kind, "leftover");
    assert.equal(printGate(next, evaluate(next)).blocked, true);
  });

  it("one person in both pharmacist rows of a store is a double, in the list and in the gate", () => {
    let next = placeName(doc, "SCA", "pharmacist2", 8, "Priya Nair").doc;
    const e = evaluate(next);
    assert.equal(e.byKey[issueKey("SCA", 8)]?.doubledNames[0], "Priya Nair");
    const status = monthStatus(next, e);
    assert.ok(status.steps.some((s) => s.kind === "double" && s.store === "SCA" && s.day === 8));
    assert.equal(printGate(next, e).blocked, true);
    next = keepDouble(next, "Priya Nair", 8, "SCA");
    assert.equal(getCell(next.grid, "SCA", "pharmacist", 8), "Priya Nair");
    assert.equal(getCell(next.grid, "SCA", "pharmacist2", 8), "");
  });

  it("problem list and rules engine never disagree about readiness", () => {
    const scenarios = [
      doc,
      placeName(doc, "EST", "pharmacist", 16, "Susan Brown").doc,
      placeName(doc, "SCA", "pharmacist2", 8, "Priya Nair").doc,
      { ...doc, grid: setCellValue(doc.grid, "WL", "pharmacist", 6, "Mark Chen") },
    ];
    for (const d of scenarios) {
      const e = evaluate(d);
      assert.equal(monthStatus(d, e).steps.length === 0, e.ready);
    }
  });

  it("a doubled person counts once for that day in workload", () => {
    const jane = rosterLines(doc).find((r) => r.name === "Jane Smith");
    // 22 Estacada days, plus Molalla on the 4th, which is already one of those 22.
    assert.equal(jane?.days, 22);
    assert.equal(jane?.saturdays, 4);
    assert.equal(jane?.nextPto, 14);
    const later = rosterLines(doc, 20).find((r) => r.name === "Jane Smith");
    assert.equal(later?.nextPto, null);
    assert.equal(later?.lastPto, 15); // time off already behind us is still reported
  });

  it("today lists open stores only and stays quiet for closed ones", () => {
    const sun = todayLines(doc, { year: 2026, month: 9, day: 6 });
    assert.deepEqual(sun, []); // every store is closed on Sunday
    const sat = todayLines(doc, { year: 2026, month: 9, day: 5 });
    assert.deepEqual(sat?.map((l) => l.code), ["EST", "MOL", "SCA"]);
    assert.equal(todayLines(doc, { year: 2026, month: 10, day: 1 }), null);
    const hole = todayLines(doc, { year: 2026, month: 9, day: 16 });
    assert.equal(hole?.find((l) => l.code === "EST")?.hole, true);
  });

  it("holes before today are not the next hole once a later one exists", () => {
    const withEarly = { ...doc, grid: setCellValue(doc.grid, "SCA", "pharmacist", 2, "") };
    const early = nextHole(withEarly, { year: 2026, month: 9, day: 10 });
    assert.equal(early?.day, 16);
    assert.equal(nextHole(withEarly)?.day, 2);
  });
});
