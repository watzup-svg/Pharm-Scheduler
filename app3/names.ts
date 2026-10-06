// One place that shortens names. Full name when it fits; otherwise first initial + the whole last name; if it still overflows, cut with an ellipsis.
// Two people who would read the same ("A. Kowal" twice) both keep their full name. (Old COPY_GUIDE rule.)
export type Named = { id: string; name: string };

function initialAndLast(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name.trim();
  return `${parts[0]!.charAt(0).toUpperCase()}. ${parts.slice(1).join(" ")}`;
}

export function cut(s: string, max: number): string {
  const chars = Array.from(s);
  return chars.length <= max ? s : `${chars.slice(0, Math.max(1, max - 1)).join("").trimEnd()}…`;
}

/** Display names for a set of people shown together, each fitting `max` characters. */
export function shortNames(people: Named[], max: number): Map<string, string> {
  const short = new Map(people.map((p) => [p.id, initialAndLast(p.name)]));
  const clash = new Map<string, number>();
  for (const s of short.values()) clash.set(s, (clash.get(s) ?? 0) + 1);
  const out = new Map<string, string>();
  for (const p of people) {
    const full = p.name.trim();
    const s = short.get(p.id)!;
    const text = Array.from(full).length <= max ? full : (clash.get(s) ?? 0) > 1 ? full : s;
    out.set(p.id, cut(text, max));
  }
  return out;
}

export function shortName(name: string, max: number): string {
  return shortNames([{ id: "x", name }], max).get("x")!;
}
