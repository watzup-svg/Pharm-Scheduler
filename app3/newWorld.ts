// A brand-new schedule: stores and drive times if the person wants them, no pharmacists, nothing placed.
import hischoolStores from "../fixtures/hischool-stores.json";
import driveTable from "../fixtures/drive-table.json";
import { seedWorld, type Seed, type StateCode, type World } from "@domain";

export type NewStore = {
  code: string;
  name: string;
  /** null = not recorded; licensing is then not checked at this store. */
  state: StateCode | null;
  satOpen?: boolean;
  sunOpen?: boolean;
};
/** Drive time between two stores, named by their codes. Both directions are stored. */
export type NewTravel = { from: string; to: string; minutes: number; miles: number };

/** Same reading of an address as the importer: the two-letter state before the ZIP, if it is OR or WA. */
export function stateOfAddress(address: string | undefined): StateCode | null {
  const m = /,\s*([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?\s*$/.exec(address ?? "");
  return m?.[1] === "OR" || m?.[1] === "WA" ? m[1] : null;
}

type FixtureStore = { code: string; name: string; address?: string; satOpen?: boolean; sunOpen?: boolean };

/** The Hi-School pharmacies and the measured drive table, as domain-ready input for `newWorld`. */
export function hischoolStarter(): { stores: NewStore[]; travel: NewTravel[] } {
  const stores: NewStore[] = (hischoolStores as FixtureStore[]).map((s) => ({
    code: s.code, name: s.name, state: stateOfAddress(s.address), satOpen: !!s.satOpen, sunOpen: !!s.sunOpen,
  }));
  const codes = new Set(stores.map((s) => s.code));
  const travel: NewTravel[] = [];
  // Table values are [miles, minutes, ...], keyed "A|B".
  for (const [key, v] of Object.entries(driveTable.pairs as unknown as Record<string, number[]>)) {
    const [a, b] = key.split("|");
    if (!a || !b || !codes.has(a) || !codes.has(b)) continue;
    travel.push({ from: a, to: b, miles: v[0]!, minutes: v[1]! });
  }
  return { stores, travel };
}

export function newWorld(opts: { stores?: NewStore[]; travel?: NewTravel[] } = {}): World {
  const list = opts.stores ?? [];
  const ids = new Map<string, string>();
  const stores: Seed["stores"] = list.map((s, i) => {
    const id = `S${i + 1}`;
    ids.set(s.code, id);
    const closed: number[] = [];
    if (!s.sunOpen) closed.push(0);
    if (!s.satOpen) closed.push(6);
    return { id, code: s.code, name: s.name, state: s.state, req: 1, closedWeekdays: closed };
  });
  const travel: [string, string, number, number][] = [];
  for (const t of opts.travel ?? []) {
    const a = ids.get(t.from), b = ids.get(t.to);
    if (!a || !b || a === b) continue;
    travel.push([a, b, t.minutes, t.miles], [b, a, t.minutes, t.miles]);
  }
  const world = seedWorld({ stores, pharmacists: [], travel });
  world.state.nextId.store = stores.length + 1;
  return world;
}

/** Choices made on the Start screen that the Setup view reuses (what state a new store is assumed to be in). */
export const setupDefaults: { state: StateCode | null } = { state: null };
