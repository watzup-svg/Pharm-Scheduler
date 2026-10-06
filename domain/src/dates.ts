// Pure date math on plain "YYYY-MM-DD" strings. No Date, no clock, no locale.
// Day numbers are days since 1970-01-01 (proleptic Gregorian), integers only.

export type ISODate = string;

const RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeap(y) ? 29 : 28;
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31;
}

export function isValidDate(s: string): s is ISODate {
  const mt = RE.exec(s);
  if (!mt) return false;
  const y = Number(mt[1]);
  const m = Number(mt[2]);
  const d = Number(mt[3]);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

const PARTS = new Map<string, [number, number, number]>();
function parts(s: ISODate): [number, number, number] {
  const hit = PARTS.get(s);
  if (hit) return hit;
  const mt = RE.exec(s);
  if (!mt) throw new Error(`bad date: ${s}`);
  const out: [number, number, number] = [Number(mt[1]), Number(mt[2]), Number(mt[3])];
  if (out[1] < 1 || out[1] > 12 || out[2] < 1 || out[2] > daysInMonth(out[0], out[1])) throw new Error(`bad date: ${s}`);
  if (PARTS.size < 50000) PARTS.set(s, out);
  return out;
}

/** Non-throwing validity guard for dates that come from callers or stored data. Cached, so cheap on hot paths. */
export function dateOk(s: unknown): s is ISODate {
  if (typeof s !== "string") return false;
  if (PARTS.has(s)) return true;
  return isValidDate(s) && (parts(s), true);
}

/** Days since 1970-01-01 (Hinnant's days_from_civil). */
export function toDayNumber(s: ISODate): number {
  const [y0, m, d] = parts(s);
  const y = m <= 2 ? y0 - 1 : y0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function fromDayNumber(n: number): ISODate {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function addDays(s: ISODate, n: number): ISODate {
  return fromDayNumber(toDayNumber(s) + n);
}

/** 0 = Sunday … 6 = Saturday. 1970-01-01 was a Thursday. */
export function weekday(s: ISODate): number {
  return (((toDayNumber(s) + 4) % 7) + 7) % 7;
}

/** Which occurrence of its weekday this date is within its month (1–5). */
export function weekdayOccurrence(s: ISODate): number {
  const [, , d] = parts(s);
  return Math.floor((d - 1) / 7) + 1;
}

export function monthOf(s: ISODate): string {
  return s.slice(0, 7);
}

export function monthDates(ym: string): ISODate[] {
  const mt = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!mt) throw new Error(`bad month: ${ym}`);
  const n = daysInMonth(Number(mt[1]), Number(mt[2]));
  const out: ISODate[] = [];
  for (let d = 1; d <= n; d++) out.push(`${ym}-${String(d).padStart(2, "0")}`);
  return out;
}

/** Inclusive range of dates, ascending. Empty if to < from. */
export function dateRange(from: ISODate, to: ISODate): ISODate[] {
  const a = toDayNumber(from);
  const b = toDayNumber(to);
  const out: ISODate[] = [];
  for (let n = a; n <= b; n++) out.push(fromDayNumber(n));
  return out;
}

/** ISO dates sort correctly as plain strings; kept as a named helper for intent. */
export function compareDates(a: ISODate, b: ISODate): number {
  return cmp(a, b);
}

/** Code-point ordering. Locale-aware comparison is banned in the domain. */
export function cmp(a: string, b: string): number {
  if (a === b) return 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    let p = a.charCodeAt(i);
    let q = b.charCodeAt(i);
    if (p === q) continue;
    // UTF-16 order differs from code-point order only when a surrogate pair meets a BMP unit above the surrogates.
    if (p >= 0xd800 || q >= 0xd800) {
      p = a.codePointAt(i)!;
      q = b.codePointAt(i)!;
      if (p === q) continue;
    }
    return p < q ? -1 : 1;
  }
  return a.length < b.length ? -1 : 1;
}

export function hhmmToMinutes(s: string): number {
  const mt = /^(\d{2}):(\d{2})$/.exec(s);
  if (!mt) throw new Error(`bad time: ${s}`);
  return Number(mt[1]) * 60 + Number(mt[2]);
}

export function minutesToHhmm(n: number): string {
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}
