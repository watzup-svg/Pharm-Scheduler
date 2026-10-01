import { driveBetween } from "./geo.ts";
import { licenceAt } from "./licence.ts";
import { isRphRole } from "./slots.ts";
import type { ScheduleDoc } from "./types.ts";

export type BenchPerson = { name: string; home: string; float: boolean; minutes: number };

/**
 * Who could cover a store: pharmacists licensed in its state whose home is another store within `maxMinutes` of driving.
 * Float pharmacists count wherever they are based. Read-only; places no one. Closest first.
 */
export function benchFor(doc: ScheduleDoc, store: string, maxMinutes = 60): BenchPerson[] {
  const out: BenchPerson[] = [];
  for (const p of doc.people) {
    if (!isRphRole(p.role) || p.home === store) continue;
    if (licenceAt(doc, p.name, store).status !== "ok") continue;
    const home = p.home && p.home !== "—" ? p.home : "";
    const drive = home ? driveBetween(doc, home, store) : null;
    if (!drive || drive.minutes > maxMinutes) continue;
    out.push({ name: p.name, home, float: p.role === "Float Pharmacist", minutes: drive.minutes });
  }
  return out.sort((a, b) => a.minutes - b.minutes || a.name.localeCompare(b.name));
}
