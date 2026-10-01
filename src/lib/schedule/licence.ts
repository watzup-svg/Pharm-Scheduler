import type { Person, Store } from "./types.ts";

/** "OR" from "325 S Broadway St, Estacada, OR 97023" or "Cathlamet, WA". Empty when there is none. */
export function stateOfStore(store: Pick<Store, "address">): string {
  const m = /,\s*([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?\s*$/.exec(store.address ?? "");
  return m?.[1] ?? "";
}

export const STATE_NAMES: Record<string, string> = { OR: "Oregon", WA: "Washington" };

export function stateName(code: string): string {
  return STATE_NAMES[code] ?? code;
}

/**
 * A pharmacist can only work in a state they are licensed in. Returns the state they lack at this
 * store, or null when it is fine. Nothing recorded for the person, or no state on the store's
 * address, means unknown, so nothing is flagged. (License end dates are deliberately not tracked.)
 */
export function unlicensedAt(
  doc: { people: Person[]; stores: Store[] },
  name: string,
  storeCode: string,
  _date?: string,
): string | null {
  const person = doc.people.find((p) => p.name === name);
  const store = doc.stores.find((s) => s.code === storeCode);
  if (!person || !store) return null;
  const state = stateOfStore(store);
  const licensed = person.licensedStates ?? [];
  if (!state || licensed.length === 0) return null;
  if (!licensed.includes(state)) return state;
  return null;
}

export type LicenceStatus = "ok" | "lacks" | "unrecorded";

/**
 * Can this person be OFFERED for a store in `state`? Stricter than the hard rule above, because an offer is
 * advice and a wrong one wastes a phone call:
 *  - "lacks": licenses are on file and this state isn't one of them. Never offered.
 *  - "unrecorded": nothing on file, and their home store is in another state (or they have no home), so we
 *    can't confirm they may work here. Not offered, and listed so the gap can be fixed on the People page.
 *  - "ok": licensed for the state, or nothing on file but it is their home state, or the store has no state.
 * Typing a name by hand is still allowed for "unrecorded" (you may know something the file doesn't).
 */
export function licenceForState(doc: { people: Person[]; stores: Store[] }, name: string, state: string): LicenceStatus {
  const person = doc.people.find((p) => p.name === name);
  if (!person || !state) return "ok";
  const recorded = person.licensedStates ?? [];
  if (recorded.length) return recorded.includes(state) ? "ok" : "lacks";
  const home = doc.stores.find((s) => s.code === person.home);
  const homeState = home ? stateOfStore(home) : "";
  return homeState === state ? "ok" : "unrecorded";
}

/** licenceForState for a store code. */
export function licenceAt(doc: { people: Person[]; stores: Store[] }, name: string, storeCode: string): { status: LicenceStatus; state: string } {
  const store = doc.stores.find((s) => s.code === storeCode);
  const state = store ? stateOfStore(store) : "";
  return { status: licenceForState(doc, name, state), state };
}
