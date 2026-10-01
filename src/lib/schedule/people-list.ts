import { stateOfStore } from "./licence.ts";
import type { Person, Store } from "./types.ts";

export type ListProblem = { line: number; text: string; why: string };

export type ParsedPeople = {
  people: Person[];
  problems: ListProblem[];
};

const HEADER = /^\s*name\b/i;

/** Match "EST", "est", "Estacada" or "Estacada Hi-School Pharmacy" to a store code. */
function findStore(stores: Store[], raw: string): Store | undefined {
  const q = raw.trim().toLowerCase();
  if (!q) return undefined;
  return (
    stores.find((s) => s.code.toLowerCase() === q) ??
    stores.find((s) => s.name.toLowerCase() === q) ??
    stores.find((s) => s.name.toLowerCase().startsWith(q)) ??
    stores.find((s) => q.length >= 3 && s.name.toLowerCase().includes(q))
  );
}

/**
 * One pharmacist per line, pasted from a spreadsheet (tab separated) or typed (comma separated):
 *
 *   Name, Home store, Type, Licensed in
 *   Jane Smith, EST
 *   Fenn Ritter, MOL, float, OR
 *   Ines Calloway<TAB>WS<TAB>Pharmacist<TAB>WA OR
 *
 * Type is "float" or blank. Licensed in lists state codes; when it is left out, the person is licensed
 * in their home store's state. Lines that cannot be used are reported, never guessed at.
 */
export function parsePeopleList(text: string, stores: Store[], existing: Person[]): ParsedPeople {
  const people: Person[] = [];
  const problems: ListProblem[] = [];
  const seen = new Set(existing.map((p) => p.name.toLowerCase()));
  text.split(/\r?\n/).forEach((rawLine, i) => {
    const line = rawLine.trim();
    if (!line) return;
    if (i === 0 && HEADER.test(line)) return;
    const cells = (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) => c.trim()).filter((c, idx) => c || idx < 2);
    const [name = "", home = "", ...rest] = cells;
    const fail = (why: string) => problems.push({ line: i + 1, text: line, why });
    if (name.length < 2) return fail("No name");
    const store = findStore(stores, home);
    if (!store) return fail(home ? `No store matches “${home}”` : "No home store");
    if (seen.has(name.toLowerCase())) return fail("Already on the roster");
    const tail = rest.join(" ");
    const float = /\bfloat/i.test(tail);
    const states = [...new Set((tail.replace(/float(er)?|pharmacist/gi, " ").match(/\b[A-Za-z]{2}\b/g) ?? []).map((s) => s.toUpperCase()))];
    const homeState = stateOfStore(store);
    const licensedStates = states.length ? states : homeState ? [homeState] : [];
    seen.add(name.toLowerCase());
    people.push({
      name,
      role: float ? "Float Pharmacist" : "Pharmacist",
      home: store.code,
      lead: false,
      phone: "",
      color: "",
      ...(licensedStates.length ? { licensedStates } : {}),
    });
  });
  return { people, problems };
}
