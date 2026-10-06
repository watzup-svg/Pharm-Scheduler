// Journal replay. Change sets carry resolved values, so replay is a keyed upsert of each event's `after` (same as the domain's commit).
// Imports straight from the domain's change-set module; the domain itself is not edited.
import { applyEvents } from "../domain/src/changeset.ts";
import { clone } from "../domain/src/canonical.ts";
import type { World } from "../domain/src/api-types.ts";
import type { ChangeSet, NextIds } from "../domain/src/types.ts";

export type ToldDelta = { full?: boolean; set: Record<string, string>; del: string[] };

/** One mirrored commit. `nextId` and `told` are bookkeeping that the events do not carry. */
export type JournalEntry = { rev: number; cs: ChangeSet; nextId: NextIds; told: ToldDelta };

export function diffTold(before: Record<string, string> | null, after: Record<string, string>): ToldDelta {
  if (!before) return { full: true, set: { ...after }, del: [] };
  const set: Record<string, string> = {};
  const del: string[] = [];
  for (const k of Object.keys(after)) if (before[k] !== after[k]) set[k] = after[k]!;
  for (const k of Object.keys(before)) if (!(k in after)) del.push(k);
  return { set, del };
}

export function makeEntry(rev: number, world: World, cs: ChangeSet, shadowTold: Record<string, string> | null): JournalEntry {
  return { rev, cs: clone(cs), nextId: clone(world.state.nextId), told: diffTold(shadowTold, world.journal.told) };
}

/** Applies one mirrored commit to a world. Returns null when the entry does not follow the world's last change set. */
export function replayEntry(world: World, e: JournalEntry): World | null {
  const last = world.journal.changeSets[world.journal.changeSets.length - 1];
  if (last && e.cs.seq !== last.seq + 1) return null;
  const state = clone(world.state);
  applyEvents(state, e.cs.events);
  state.nextId = clone(e.nextId);
  const told = e.told.full ? {} : { ...world.journal.told };
  for (const [k, v] of Object.entries(e.told.set)) told[k] = v;
  for (const k of e.told.del) delete told[k];
  return { state, journal: { ...world.journal, changeSets: [...world.journal.changeSets, clone(e.cs)], told }, session: world.session };
}
