// Posting snapshots, To-tell ledger, "changed since posting".
import { cmp } from "./dates.ts";
import { evaluate } from "./coverage.ts";
import type { PostResult, World } from "./api-types.ts";
import type { ISODate, PharmacistId, PostingSnapshot, ToTellEntry } from "./types.ts";

type Range = { from: ISODate; to: ISODate };

/** pharmacistId|date -> store id (several stores joined with ","), for dates in range. */
function placements(world: World, range: Range): Record<string, string> {
  const m: Record<string, string[]> = {};
  for (const a of Object.values(world.state.assignments)) {
    if (a.date < range.from || a.date > range.to) continue;
    (m[`${a.pharmacistId}|${a.date}`] ??= []).push(a.storeId);
  }
  const out: Record<string, string> = {};
  for (const k of Object.keys(m).sort(cmp)) out[k] = m[k]!.sort(cmp).join(",");
  return out;
}

export function post(world: World, range: Range, asOf: ISODate): PostResult {
  const ev = evaluate(world.state, asOf, { range });
  const initials: Record<string, string[]> = {};
  for (const a of Object.values(world.state.assignments)) {
    if (a.date < range.from || a.date > range.to) continue;
    (initials[`${a.storeId}|${a.date}`] ??= []).push(world.state.pharmacists[a.pharmacistId]?.initials ?? a.pharmacistId);
  }
  const cells: PostingSnapshot["cells"] = {};
  let open = 0;
  for (const k of Object.keys(ev.cells)) {
    const c = ev.cells[k]!;
    open += c.open;
    const list = (initials[k] ?? []).slice().sort(cmp);
    if (list.length || c.required > 0) cells[k] = { initials: list, required: c.required };
  }
  let violations = 0;
  for (const a of Object.values(world.state.assignments)) {
    if (a.date < range.from || a.date > range.to) continue;
    if (!ev.assignments[a.id]!.counts) violations++;
  }
  let overrides = 0;
  for (const o of Object.values(world.state.overrides)) {
    const a = world.state.assignments[o.assignmentId];
    if (a && a.date >= range.from && a.date <= range.to) overrides++;
  }
  const revision = world.journal.snapshots.reduce((m, s) => Math.max(m, s.revision), 0) + 1;
  const snapshot: PostingSnapshot = { revision, postedOn: asOf, from: range.from, to: range.to, cells, placements: placements(world, range), warnings: { open, violations, overrides } };
  return { world: { ...world, journal: { ...world.journal, snapshots: [...world.journal.snapshots, snapshot] } }, snapshot };
}

function nowMap(world: World): Record<string, string> {
  return placements(world, { from: "0000-01-01", to: "9999-12-31" });
}

export function toTell(world: World, asOf: ISODate): ToTellEntry[] {
  const now = nowMap(world);
  const keys = new Set([...Object.keys(now), ...Object.keys(world.journal.told)]);
  const out: ToTellEntry[] = [];
  for (const k of [...keys].sort(cmp)) {
    const [p, d] = k.split("|") as [PharmacistId, ISODate];
    if (d < asOf) continue;
    const was = world.journal.told[k] ?? "off";
    const cur = now[k] ?? "off";
    if (was !== cur) out.push({ pharmacistId: p, date: d, was, now: cur });
  }
  return out.sort((a, b) => cmp(a.pharmacistId, b.pharmacistId) || cmp(a.date, b.date));
}

export function markTold(world: World, entries: { pharmacistId: PharmacistId; date: ISODate }[]): World {
  const now = nowMap(world);
  const told = { ...world.journal.told };
  for (const e of entries) {
    const k = `${e.pharmacistId}|${e.date}`;
    told[k] = now[k] ?? "off";
  }
  return { ...world, journal: { ...world.journal, told } };
}

export function changedSincePosting(world: World): { pharmacistId: PharmacistId; date: ISODate; posted: string; now: string }[] {
  const snap = world.journal.snapshots[world.journal.snapshots.length - 1];
  if (!snap) return [];
  const live = placements(world, { from: snap.from, to: snap.to });
  const out: { pharmacistId: PharmacistId; date: ISODate; posted: string; now: string }[] = [];
  for (const k of [...new Set([...Object.keys(live), ...Object.keys(snap.placements)])].sort(cmp)) {
    const posted = snap.placements[k] ?? "off";
    const now = live[k] ?? "off";
    if (posted !== now) {
      const [p, d] = k.split("|") as [PharmacistId, ISODate];
      out.push({ pharmacistId: p, date: d, posted, now });
    }
  }
  return out;
}
