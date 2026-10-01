import type { Person, Role, SlotId, SlotKind } from "./types.ts";

const ALL_SLOTS: { id: SlotId; kind: SlotKind; label: string; short: string }[] = [
  { id: "pharmacist", kind: "RPh", label: "Pharmacist", short: "RPh" },
  { id: "pharmacist2", kind: "RPh", label: "Pharmacist 2", short: "RPh2" },
  { id: "tech1", kind: "Tech", label: "Technician 1", short: "Tech1" },
  { id: "tech2", kind: "Tech", label: "Technician 2", short: "Tech2" },
  { id: "tech3", kind: "Tech", label: "Technician 3", short: "Tech3" },
  { id: "tech4", kind: "Tech", label: "Technician 4", short: "Tech4" },
  { id: "cashier", kind: "Cash", label: "Cashier", short: "Cash" },
];

/** The grid only schedules pharmacists. Legacy tech and cashier slots stay readable so old files open. */
export const SLOTS = ALL_SLOTS.filter((s) => s.kind === "RPh");

export const RPH_SLOTS: SlotId[] = ["pharmacist", "pharmacist2"];
export const TECH_SLOTS: SlotId[] = ["tech1", "tech2", "tech3", "tech4"];
export const CASH_SLOTS: SlotId[] = ["cashier"];

export function slotsForKinds(kinds?: readonly SlotKind[] | null): typeof SLOTS {
  const list = !kinds || kinds.length === 0 ? SLOTS : ALL_SLOTS.filter((s) => kinds.includes(s.kind));
  return list.filter((s) => s.kind === "RPh");
}

export function slotById(id: SlotId) {
  const slot = ALL_SLOTS.find((s) => s.id === id);
  if (!slot) throw new Error(`Unknown slot ${id}`);
  return slot;
}

export function isRphRole(role: Role): boolean {
  return role === "Pharmacist" || role === "Float Pharmacist";
}

export function namesForKind(people: Person[], kind: SlotKind): string[] {
  return namesForKindDetailed(people, kind).map((p) => p.name);
}

export function namesForKindDetailed(people: Person[], kind: SlotKind): Person[] {
  if (kind !== "RPh") return [];
  return people.filter((p) => isRphRole(p.role));
}

export function personByName(people: Person[], name: string): Person | undefined {
  return people.find((p) => p.name === name);
}

export function isRphName(people: Person[], name: string): boolean {
  const person = personByName(people, name);
  return person ? isRphRole(person.role) : false;
}
