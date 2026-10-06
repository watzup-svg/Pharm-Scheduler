// Canonical JSON and deep clone for plain data (no Date, no Map, no undefined in arrays).
import { cmp } from "./dates.ts";

export function clone<T>(x: T): T {
  if (x === null || typeof x !== "object") return x;
  if (Array.isArray(x)) return x.map(clone) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(x as Record<string, unknown>)) {
    const v = (x as Record<string, unknown>)[k];
    if (v !== undefined) out[k] = clone(v);
  }
  return out as T;
}

/** Keys sorted by code point, undefined dropped, no whitespace. */
export function canonical(x: unknown): string {
  if (x === null || typeof x !== "object") return JSON.stringify(x === undefined ? null : x);
  if (Array.isArray(x)) return `[${x.map(canonical).join(",")}]`;
  const o = x as Record<string, unknown>;
  const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort(cmp);
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}
