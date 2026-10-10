// Canonical JSON: one text for one value. Keys sorted by code point, integers only, nothing undefined. The state hash,
// the file's chain hash and every comparison in the domain are taken over this text, so the same data always hashes the same.
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** Code-point order, not UTF-16 unit order and not locale order. */
export function compareCodePoints(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const p = x[i]!.codePointAt(0)!;
    const q = y[i]!.codePointAt(0)!;
    if (p !== q) return p < q ? -1 : 1;
  }
  return x.length - y.length < 0 ? -1 : x.length === y.length ? 0 : 1;
}

export function canon(value: Json): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isSafeInteger(value)) throw new Error(`canon: only safe integers are allowed, got ${value}`);
      return String(Object.is(value, -0) ? 0 : value);
    case "string":
      return JSON.stringify(value);
    case "object":
      if (Array.isArray(value)) return `[${value.map(canon).join(",")}]`;
      return `{${Object.keys(value)
        .sort(compareCodePoints)
        .map((k) => {
          const v = value[k];
          if (v === undefined) throw new Error(`canon: undefined at "${k}"`);
          return `${JSON.stringify(k)}:${canon(v)}`;
        })
        .join(",")}}`;
    default:
      throw new Error(`canon: unsupported ${typeof value}`);
  }
}
