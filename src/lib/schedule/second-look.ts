import { storeTag } from "./label.ts";
import { monthName, monthWeeks, weekdayShort } from "./calendar.ts";
import { hintsOnGrid } from "./hints.ts";
import { thinCoverDays } from "./thin.ts";
import { workloadFlags } from "./workload.ts";
import type { CellRef, ScheduleDoc } from "./types.ts";

export type SecondLook = { key: string; text: string; ref?: CellRef; page?: "/people" };

/**
 * Everything worth a second look that never blocks printing: weekday hints, heavy workloads, licenses that
 * are ending, and days with no spare pharmacist. One list, shared by the overview and the district page.
 */
/** Days with no spare pharmacist. Two or more in the same week are one fragile-week item, not a string of separate ones. */
function thinItems(doc: ScheduleDoc, fromDay: number): SecondLook[] {
  const thin = thinCoverDays(doc, fromDay);
  const weeks = monthWeeks(doc.year, doc.month);
  const out: SecondLook[] = [];
  const used = new Set<number>();
  for (const w of weeks) {
    const hits = thin.filter((t) => w.includes(t.day));
    const hitDays = [...new Set(hits.map((h) => h.day))];
    if (hitDays.length < 2) continue;
    hits.forEach((h) => used.add(h.day));
    const states = [...new Set(hits.map((h) => h.state))].join(" and ");
    const first = w.find((d): d is number => d != null)!;
    out.push({
      key: `tw|${first}`,
      text: `Week of ${monthName(doc.year, doc.month).slice(0, 3)} ${first}: ${hitDays.length} days with no spare ${states} pharmacist (${hitDays.map((d) => `${weekdayShort(doc.year, doc.month, d)} ${d}`).join(", ")}). One more absence that week would leave a store with no coverage.`,
      ref: { store: hits[0]!.stores[0]!, slot: "pharmacist" as const, day: hits[0]!.day },
    });
  }
  for (const t of thin) {
    if (used.has(t.day)) continue;
    out.push({
      key: `t|${t.day}|${t.state}`,
      text: `${t.weekday.slice(0, 3)} ${t.day}: no spare ${t.state} pharmacist. One more absence leaves a store with no coverage.`,
      ref: { store: t.stores[0]!, slot: "pharmacist" as const, day: t.day },
    });
  }
  return out;
}

export function secondLook(doc: ScheduleDoc, fromDay = 1): SecondLook[] {
  const mon = monthName(doc.year, doc.month).slice(0, 3);
  const homeless = doc.people
    .filter((p) => (p.role === "Pharmacist" || p.role === "Float Pharmacist") && !doc.stores.some((s) => s.code === p.home))
    .map((p) => ({
      key: `n|${p.name}`,
      text: `${p.name} has no home store. Choose one so suggestions can use drive time.`,
      page: "/people" as const,
    }));
  return [
    ...homeless,
    ...hintsOnGrid(doc).map((h) => ({
      key: `h|${h.ref.store}|${h.ref.day}|${h.name}`,
      text: `${h.name} at ${storeTag(doc, h.ref.store)}, ${mon} ${h.ref.day}: ${h.hints.map((x) => x.text).join(", ")}`,
      ref: h.ref,
    })),
    ...workloadFlags(doc).map((f) => ({ key: `w|${f.name}|${f.kind}|${f.ref.day}`, text: f.text, ref: f.ref })),
    ...thinItems(doc, fromDay),
  ];
}
