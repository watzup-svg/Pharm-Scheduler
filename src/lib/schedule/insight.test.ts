import assert from "node:assert/strict";
import { test } from "node:test";
import { createSample } from "./sample.ts";
import { dayPressure, personMonths, storeRun } from "./insight.ts";

test("pressure has one entry per day and closed days carry no bar", () => {
  const doc = createSample();
  const p = dayPressure(doc);
  assert.equal(p.length, new Date(doc.year, doc.month, 0).getDate());
  for (const d of p) {
    if (d.level === "closed") assert.equal(d.open, 0);
    else assert.equal(d.spare, d.free - d.holes);
  }
});

test("a person's month never counts time off or empty days as worked", () => {
  const doc = createSample();
  for (const r of personMonths(doc)) {
    assert.equal(r.worked, r.days.filter((x) => x === "home" || x === "cover" || x === "double").length);
    assert.ok(r.away <= r.worked);
  }
  const rows = personMonths(doc);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1]!.away >= rows[i]!.away);
});

test("a store run is at least one day when anyone is scheduled", () => {
  const doc = createSample();
  for (const s of doc.stores) {
    const run = storeRun(doc, s.code);
    if (run) assert.ok(run.days >= 1 && run.changes >= 0);
  }
});

test("pressure counts the same free people as asking every empty store", async () => {
  const { choicesFor, offerable } = await import("./dashboard.ts");
  const { isStoreOpen, daysInMonth } = await import("./calendar.ts");
  const { getCell } = await import("./grid.ts");
  const { RPH_SLOTS } = await import("./slots.ts");
  const doc = createSample();
  const last = daysInMonth(doc.year, doc.month);
  for (const p of dayPressure(doc)) {
    if (p.level === "closed") continue;
    const open = doc.stores.filter((s) => isStoreOpen(s, doc.year, doc.month, p.day, last, doc.holidays));
    const holes = open.filter((s) => !RPH_SLOTS.some((sl) => getCell(doc.grid, s.code, sl, p.day).trim()));
    const free = new Set<string>();
    for (const s of holes.length ? holes : [open[0]!]) for (const c of choicesFor(doc, s.code, p.day)) if (c.state === "free" && offerable(c) && !c.here) free.add(c.name);
    assert.equal(p.free, free.size, `day ${p.day}`);
  }
});
