import type { ArchiveEntry } from "./archive.ts";
import { parseDoc } from "./file.ts";
import { dayTone } from "./district.ts";
import { evaluate } from "./rules.ts";
import type { ScheduleDoc } from "./types.ts";

export type TrendPoint = { ym: string; label: string; pct: number };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Share of open store-days that are staffed correctly (the same measure as the district header). */
export function readinessPct(doc: ScheduleDoc): number {
  const ev = evaluate(doc);
  let open = 0;
  let fine = 0;
  const last = new Date(doc.year, doc.month, 0).getDate();
  for (const s of doc.stores) {
    for (let d = 1; d <= last; d++) {
      const t = dayTone(doc, ev, s.code, d);
      if (t === "closed" || t === "leftover") continue;
      open += 1;
      if (t === "ok" || t === "cover" || t === "away" || t === "off") fine += 1;
    }
  }
  return open ? Math.round((fine / open) * 100) : 0;
}

/** The last few kept months, oldest first, with the month on screen as the final point. */
export function trendPoints(current: ScheduleDoc, archive: ArchiveEntry[], max = 6): TrendPoint[] {
  const ym = `${current.year}-${String(current.month).padStart(2, "0")}`;
  const older = archive
    .filter((e) => e.ym < ym)
    .slice(0, max - 1)
    .reverse();
  const points: TrendPoint[] = [];
  for (const e of older) {
    try {
      const d = parseDoc(e.json);
      points.push({ ym: e.ym, label: MONTHS[d.month - 1]!, pct: readinessPct(d) });
    } catch {
      /* skip a month that will not open */
    }
  }
  points.push({ ym, label: MONTHS[current.month - 1]!, pct: readinessPct(current) });
  return points;
}
