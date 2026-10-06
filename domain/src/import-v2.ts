// One-way import of prototype saved files (hischool-schedule v1/v2, already normalized) into a v3 World.
// Pure: takes parsed JSON, returns a World and a report. No file access, no clock.
import { addDays, cmp, daysInMonth, isValidDate, monthDates, toDayNumber, weekday, type ISODate } from "./dates.ts";
import { evaluate } from "./coverage.ts";
import { seedWorld, type Seed, type SeedAssignment, type SeedPharmacist, type SeedStore } from "./seed.ts";
import type { StateCode } from "./types.ts";
import type { World } from "./api-types.ts";

type V2Store = { code: string; name?: string; address?: string; satOpen?: boolean; sunOpen?: boolean; closedWeekdays?: number[]; twoPharmacistDays?: number[] };
type V2Person = { name: string; role: string; home?: string; licensedStates?: string[]; startsOn?: string; endsOn?: string };
type V2Doc = {
  year: number; month: number; stores: V2Store[]; people: V2Person[];
  holidays?: { date: string; store: string; label: string; repeat?: boolean; closure?: boolean }[];
  timeOff?: { name: string; dates?: string[]; from?: string; to?: string; note?: string; status?: string }[];
  grid?: Record<string, Record<string, Record<string, string>>>;
  pattern?: Record<string, Record<string, Record<string, string>>>;
  dayNotes?: Record<string, Record<string, string>>;
  accepted?: { key: string }[];
  driveMinutes?: Record<string, number>;
  driveMiles?: Record<string, number>;
  mileage?: { rate?: number; freeMiles?: number };
};

export type DriveTable = Readonly<Record<string, readonly [number, number, number?]>>;
export type ImportReport = {
  months: string[];
  stores: number;
  pharmacists: number;
  assignments: number;
  unavailability: number;
  standing: number;
  travelPairs: number;
  /** Things we could not carry over, with the reason. */
  skipped: { what: string; why: string }[];
  /** Prototype fields that have no home in v3 yet. */
  dropped: string[];
  /** Choices the importer made that the owner should know about. */
  assumptions: string[];
};

const PHARMACIST_ROLES = ["Pharmacist", "Float Pharmacist"];

export function stateOfAddress(address: string | undefined): StateCode | null {
  const m = /,\s*([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?\s*$/.exec(address ?? "");
  return m?.[1] === "OR" || m?.[1] === "WA" ? m[1] : null;
}

function initialsOf(name: string, used: Set<string>): string {
  const base = name.split(/\s+/).filter(Boolean).map((w) => w[0]!.toUpperCase()).join("") || "?";
  let out = base;
  for (let n = 2; used.has(out); n++) out = `${base}${n}`;
  used.add(out);
  return out;
}

function groupDates(dates: ISODate[]): [ISODate, ISODate][] {
  const sorted = [...new Set(dates)].sort(cmp);
  const out: [ISODate, ISODate][] = [];
  for (const d of sorted) {
    const last = out[out.length - 1];
    if (last && addDays(last[1], 1) === d) last[1] = d;
    else out.push([d, d]);
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");

// ---------- reading a file that may not be what it claims ----------
// The prototype's files are parsed JSON from disk, so any field can be missing, null, the wrong type, a date that does not exist,
// a key such as "__proto__", or absurdly large. `normalize` rebuilds each document with only well-formed parts (everything else is
// reported in `skipped`), so the rest of the importer can rely on its types. Records are null-prototype objects.
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const MAX_ITEMS = 5000;
/** Dates the app can reason about. The prototype never held anything outside this span. */
const sane = (d: string | undefined): d is ISODate => d !== undefined && isValidDate(d) && Number(d.slice(0, 4)) >= 1900 && Number(d.slice(0, 4)) <= 2200;
const weekdays = (v: unknown): number[] | undefined => (Array.isArray(v) ? v.filter((w): w is number => Number.isInteger(w) && (w as number) >= 0 && (w as number) <= 6) : undefined);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v.slice(0, MAX_ITEMS) : []);
function record<T>(v: unknown, leaf: (x: unknown) => T | undefined): Record<string, T> {
  const out: Record<string, T> = Object.create(null);
  if (!isObj(v)) return out;
  for (const [k, x] of Object.entries(v).slice(0, MAX_ITEMS)) { const y = leaf(x); if (y !== undefined) out[k] = y; }
  return out;
}
const nested = (v: unknown): Record<string, Record<string, Record<string, string>>> => record(v, (a) => record(a, (b) => record(b, str)));

function normalize(raw: unknown, skip: (what: string, why: string) => void): V2Doc | null {
  if (!isObj(raw)) { skip("a file", "not a schedule document"); return null; }
  const year = num(raw.year), month = num(raw.month);
  if (year === undefined || month === undefined || !Number.isInteger(year) || !Number.isInteger(month) || year < 1900 || year > 2200 || month < 1 || month > 12) {
    skip("a file", "no usable year and month");
    return null;
  }
  const ym = `${year}-${pad(month)}`;
  const stores: V2Store[] = [];
  for (const x of list(raw.stores)) {
    if (!isObj(x) || !str(x.code)?.trim()) { skip(`store in ${ym}`, "no code"); continue; }
    stores.push({
      code: x.code as string, ...(str(x.name) !== undefined ? { name: x.name as string } : {}), ...(str(x.address) !== undefined ? { address: x.address as string } : {}),
      satOpen: x.satOpen === true, sunOpen: x.sunOpen === true, closedWeekdays: weekdays(x.closedWeekdays) ?? [], twoPharmacistDays: weekdays(x.twoPharmacistDays) ?? [],
    });
  }
  const people: V2Person[] = [];
  for (const x of list(raw.people)) {
    if (!isObj(x) || !str(x.name)?.trim()) { skip(`person in ${ym}`, "no name"); continue; }
    people.push({
      name: x.name as string, role: str(x.role) ?? "", ...(str(x.home) !== undefined ? { home: x.home as string } : {}),
      ...(Array.isArray(x.licensedStates) ? { licensedStates: x.licensedStates.filter((c): c is string => typeof c === "string") } : {}),
      ...(sane(str(x.startsOn)) ? { startsOn: x.startsOn as string } : {}), ...(sane(str(x.endsOn)) ? { endsOn: x.endsOn as string } : {}),
    });
  }
  const holidays: NonNullable<V2Doc["holidays"]> = [];
  for (const x of list(raw.holidays)) if (isObj(x) && str(x.date) !== undefined && str(x.store) !== undefined) holidays.push({ date: x.date as string, store: x.store as string, label: str(x.label) ?? "", repeat: x.repeat === true });
  const timeOff: NonNullable<V2Doc["timeOff"]> = [];
  for (const x of list(raw.timeOff)) {
    if (!isObj(x) || !str(x.name)) { skip(`time off in ${ym}`, "no name"); continue; }
    const dates = Array.isArray(x.dates) ? x.dates.slice(0, MAX_ITEMS).filter((d): d is string => typeof d === "string") : undefined;
    timeOff.push({ name: x.name as string, ...(dates ? { dates } : {}), ...(str(x.from) !== undefined ? { from: x.from as string } : {}), ...(str(x.to) !== undefined ? { to: x.to as string } : {}), ...(str(x.note) !== undefined ? { note: x.note as string } : {}), ...(str(x.status) !== undefined ? { status: x.status as string } : {}) });
  }
  const accepted: NonNullable<V2Doc["accepted"]> = [];
  for (const x of list(raw.accepted)) if (isObj(x) && str(x.key) !== undefined) accepted.push({ key: x.key as string });
  const finite = (x: unknown) => { const n = num(x); return n !== undefined && n >= 0 && n <= 1e6 ? n : undefined; };
  const mileage: V2Doc["mileage"] = {};
  if (isObj(raw.mileage)) {
    const rate = finite(raw.mileage.rate), free = finite(raw.mileage.freeMiles);
    if (rate !== undefined && rate <= 1000) mileage.rate = rate;
    if (free !== undefined) mileage.freeMiles = free;
  }
  const doc: V2Doc & Record<string, unknown> = {
    year, month, stores, people, holidays, timeOff, accepted, mileage,
    grid: nested(raw.grid), pattern: nested(raw.pattern), dayNotes: record(raw.dayNotes, (a) => record(a, str)),
    driveMinutes: record(raw.driveMinutes, (x) => { const n = finite(x); return n === undefined ? undefined : Math.round(n); }), driveMiles: record(raw.driveMiles, finite),
  };
  for (const f of ["printPrefs", "storeLabels"]) if (f in raw) doc[f] = true;
  return doc;
}

/** The measured drive table: only [miles, minutes] pairs of real, non-negative numbers. */
function cleanDriveTable(t: unknown): DriveTable {
  const out: Record<string, readonly [number, number]> = Object.create(null);
  if (!isObj(t)) return out;
  for (const [k, v] of Object.entries(t).slice(0, 100_000)) {
    if (Array.isArray(v)) { const m = finiteNonNeg(v[0]), n = finiteNonNeg(v[1]); if (m !== undefined && n !== undefined) out[k] = [m, Math.round(n)]; }
  }
  return out;
}
const finiteNonNeg = (x: unknown): number | undefined => (typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1e6 ? x : undefined);

/** Days between two dates, for refusing a time-off range that spans centuries. */
const MAX_RANGE_DAYS = 400;

export function importV2(docsIn: unknown[], opts: { driveTable?: DriveTable } = {}): { world: World; report: ImportReport } {
  const report: ImportReport = { months: [], stores: 0, pharmacists: 0, assignments: 0, unavailability: 0, standing: 0, travelPairs: 0, skipped: [], dropped: [], assumptions: [] };
  const skip = (what: string, why: string) => report.skipped.push({ what, why });
  const docs = (Array.isArray(docsIn) ? docsIn : [])
    .map((d) => normalize(d, skip))
    .filter((d): d is V2Doc => d !== null)
    .sort((a, b) => a.year - b.year || a.month - b.month);
  if (!docs.length) throw new Error("Nothing to import.");

  // stores and people: union across months, first file wins
  const v2Stores = new Map<string, V2Store>();
  const v2People = new Map<string, V2Person>();
  for (const d of docs) {
    for (const s of d.stores) if (!v2Stores.has(s.code)) v2Stores.set(s.code, s);
    for (const p of d.people) if (!v2People.has(p.name)) v2People.set(p.name, p);
  }
  const storeIdOf = new Map<string, string>();
  const stores: SeedStore[] = [...v2Stores.keys()].sort(cmp).map((code, i) => {
    const s = v2Stores.get(code)!;
    const id = `S${i + 1}`;
    storeIdOf.set(code, id);
    const closed: number[] = [];
    for (let w = 0; w < 7; w++) if (s.closedWeekdays?.includes(w) || (w === 6 && !s.satOpen) || (w === 0 && !s.sunOpen)) closed.push(w);
    const state = stateOfAddress(s.address);
    if (!state) skip(`store ${code}`, "no OR/WA state in its address; licensing is not checked there");
    return { id, code, name: s.name ?? code, state, closedWeekdays: closed, twoDays: (s.twoPharmacistDays ?? []).filter((w) => !closed.includes(w)) };
  });
  report.stores = stores.length;

  const phIdOf = new Map<string, string>();
  const usedInitials = new Set<string>();
  const pharmacists: SeedPharmacist[] = [];
  let pn = 0;
  for (const name of [...v2People.keys()].sort(cmp)) {
    const p = v2People.get(name)!;
    if (!PHARMACIST_ROLES.includes(p.role)) { skip(`person ${name}`, `role ${p.role} is not scheduled in v3`); continue; }
    const id = `P${++pn}`;
    phIdOf.set(name, id);
    const lic = p.licensedStates?.filter((c): c is StateCode => c === "OR" || c === "WA");
    const ph: SeedPharmacist = { id, name, initials: initialsOf(name, usedInitials), base: p.home ? storeIdOf.get(p.home) ?? null : null, lic: lic && lic.length ? lic : null };
    if (p.startsOn && isValidDate(p.startsOn)) ph.activeFrom = p.startsOn;
    if (p.endsOn && isValidDate(p.endsOn)) ph.inactiveFrom = addDays(p.endsOn, 1);
    pharmacists.push(ph);
  }
  report.pharmacists = pharmacists.length;

  const assignments: SeedAssignment[] = [];
  const dateOverrides: NonNullable<Seed["dateOverrides"]> = [];
  const unavailability: NonNullable<Seed["unavailability"]> = [];
  const standing: NonNullable<Seed["standing"]> = [];
  const cells: NonNullable<Seed["cells"]> = [];
  const built: ISODate[] = [];
  const travel = new Map<string, [string, string, number, number]>();
  const monthPatterns: { ym: string; first: ISODate; byPair: Map<string, Set<number>> }[] = [];
  const accepted: { kind: string; a: string; b: string; day: number; date: ISODate }[] = [];
  let seq = 1;
  const seenAsg = new Set<string>();

  for (const d of docs) {
    const ym = `${d.year}-${pad(d.month)}`;
    report.months.push(ym);
    const dates = monthDates(ym);
    built.push(...dates);
    // holidays and closures -> date overrides with count 0
    for (const h of d.holidays ?? []) {
      const date = h.repeat ? `${d.year}-${h.date.slice(5)}` : h.date;
      if (!isValidDate(date) || !date.startsWith(ym)) continue;
      const targets = h.store === "ALL" ? [...storeIdOf.values()] : storeIdOf.has(h.store) ? [storeIdOf.get(h.store)!] : [];
      if (!targets.length) skip(`holiday ${h.label}`, `unknown store ${h.store}`);
      for (const store of targets) if (!dateOverrides.some((o) => o.store === store && o.date === date)) dateOverrides.push({ store, date, count: 0, note: h.label });
    }
    // day notes -> date override note, keeping the requirement
    for (const [code, byDay] of Object.entries(d.dayNotes ?? {})) {
      const store = storeIdOf.get(code);
      if (!store) continue;
      for (const [day, note] of Object.entries(byDay)) {
        const date = `${ym}-${pad(Number(day))}`;
        if (!note.trim() || !isValidDate(date) || dateOverrides.some((o) => o.store === store && o.date === date)) continue;
        const sd = stores.find((s) => s.id === store)!;
        const wd = weekday(date);
        const count = sd.closedWeekdays!.includes(wd) ? 0 : sd.twoDays!.includes(wd) ? 2 : 1;
        dateOverrides.push({ store, date, count, note: note.trim() });
      }
    }
    // grid -> assignments (pharmacist slots only)
    const keys: { date: ISODate; code: string; slot: string; name: string }[] = [];
    for (const [code, slots] of Object.entries(d.grid ?? {})) {
      for (const [slot, days] of Object.entries(slots)) {
        if (slot !== "pharmacist" && slot !== "pharmacist2") continue;
        for (const [day, name] of Object.entries(days)) if (name && name.trim()) keys.push({ date: `${ym}-${pad(Number(day))}`, code, slot, name: name.trim() });
      }
    }
    keys.sort((a, b) => cmp(a.date, b.date) || cmp(a.code, b.code) || cmp(a.slot, b.slot));
    for (const k of keys) {
      const store = storeIdOf.get(k.code);
      const ph = phIdOf.get(k.name);
      if (!store) { skip(`${k.code} ${k.date}`, "unknown store"); continue; }
      if (!ph) { skip(`${k.name} at ${k.code} on ${k.date}`, "not a known pharmacist (text, tech, or removed person)"); continue; }
      if (!isValidDate(k.date) || Number(k.date.slice(8)) > daysInMonth(d.year, d.month)) { skip(`${k.name} at ${k.code} ${k.date}`, "bad date"); continue; }
      const key = `${store}|${ph}|${k.date}`;
      if (seenAsg.has(key)) { skip(`${k.name} at ${k.code} on ${k.date}`, "same pharmacist twice at one store that day"); continue; }
      seenAsg.add(key);
      assignments.push({ id: `A${assignments.length + 1}`, seq: seq++, store, ph, date: k.date, source: "manual", agreed: true });
    }
    // time off -> unavailability (consecutive dates grouped; same coverage as separate dates)
    for (const t of d.timeOff ?? []) {
      const ph = phIdOf.get(t.name);
      if (!ph) { skip(`time off for ${t.name}`, "not a known pharmacist"); continue; }
      const dated = t.dates && t.dates.length ? t.dates : t.from && t.to ? [t.from] : [];
      const dayList = dated.filter(sane);
      if (dayList.length < dated.length) skip(`time off for ${t.name}`, "some dates are not real dates");
      if (!(t.dates && t.dates.length) && t.from && t.to && sane(t.from) && sane(t.to)) {
        if (cmp(t.to, t.from) >= 0 && (toDayNumber(t.to) - toDayNumber(t.from)) <= MAX_RANGE_DAYS) { for (let x = t.from; x <= t.to; x = addDays(x, 1)) dayList.push(x); }
        else skip(`time off for ${t.name}`, "date range is backwards or longer than a year");
      }
      const status = t.status === "requested" ? "Requested" : t.status === "declined" ? "Denied" : "Approved";
      for (const [first, last] of groupDates(dayList)) unavailability.push({ ph, first, last, status, type: "Vacation", ...(t.note ? { note: t.note } : {}) });
    }
    // stamp pattern -> standing assignments
    const first = `${ym}-01`;
    const byPair = new Map<string, Set<number>>();
    for (const [code, slots] of Object.entries(d.pattern ?? {})) {
      for (const [slot, wds] of Object.entries(slots)) {
        if (slot !== "pharmacist" && slot !== "pharmacist2") continue;
        for (const [wd, name] of Object.entries(wds)) {
          const store = storeIdOf.get(code), ph = phIdOf.get(name);
          if (!store || !ph || !/^[0-6]$/.test(wd)) continue;
          const k = `${store}|${ph}`;
          byPair.set(k, (byPair.get(k) ?? new Set()).add(Number(wd)));
        }
      }
    }
    monthPatterns.push({ ym, first, byPair });
    // drive times set by hand
    for (const [key, minutes] of Object.entries(d.driveMinutes ?? {})) {
      const [a, b] = key.split("|");
      const sa = storeIdOf.get(a ?? ""), sb = storeIdOf.get(b ?? "");
      if (!sa || !sb) continue;
      const miles = d.driveMiles?.[key] ?? 0;
      travel.set(`${sa}|${sb}`, [sa, sb, minutes, miles]);
      travel.set(`${sb}|${sa}`, [sb, sa, minutes, miles]);
    }
    for (const a of d.accepted ?? []) {
      const [kind, x, day] = a.key.split("|");
      if (kind && x && day && isValidDate(`${ym}-${pad(Number(day))}`)) accepted.push({ kind, a: x, b: "", day: Number(day), date: `${ym}-${pad(Number(day))}` });
    }
    for (const f of ["printPrefs", "storeLabels"]) if (f in (d as object)) report.dropped.push(`${ym}: ${f} (screen and print preferences are not domain data)`);
    if (d.mileage?.rate) report.assumptions.push(`${ym}: mileage rate ${d.mileage.rate} $/mile imported as ${Math.round(d.mileage.rate * 100)} cents effective ${ym}-01`);
  }
  // Stamp patterns -> one standing row per run of identical months; a pair that disappears or changes ends its row the day before the next month.
  {
    const open = new Map<string, { weekdays: string; from: ISODate; ym: string }>();
    const close = (k: string, to: ISODate | undefined) => {
      const o = open.get(k)!;
      const [store, ph] = k.split("|") as [string, string];
      standing.push({ store, ph, recurrence: { weekdays: o.weekdays.split(",").map(Number), cycleWeeks: 1, anchor: o.from }, from: o.from, ...(to ? { to } : {}) });
      open.delete(k);
    };
    for (const m of monthPatterns) {
      const now = new Map([...m.byPair].map(([k, wds]) => [k, [...wds].sort((a, b) => a - b).join(",")]));
      for (const k of [...open.keys()].sort(cmp)) if (now.get(k) !== open.get(k)!.weekdays) close(k, addDays(m.first, -1));
      for (const k of [...now.keys()].sort(cmp)) if (!open.has(k)) open.set(k, { weekdays: now.get(k)!, from: m.first, ym: m.ym });
    }
    for (const k of [...open.keys()].sort(cmp)) close(k, undefined);
  }
  // measured drive table beats nothing; hand-set numbers win
  for (const [key, v] of Object.entries(cleanDriveTable(opts.driveTable))) {
    const [a, b] = key.split("|");
    const sa = storeIdOf.get(a ?? ""), sb = storeIdOf.get(b ?? "");
    if (!sa || !sb) continue;
    for (const [f, t] of [[sa, sb], [sb, sa]] as const) if (!travel.has(`${f}|${t}`)) travel.set(`${f}|${t}`, [f, t, v[1], v[0]]);
  }
  report.travelPairs = travel.size;
  const rate = docs.find((d) => d.mileage?.rate)?.mileage;
  const config: Seed["config"] = {};
  if (rate?.rate) { config.mileageRates = [{ effectiveFrom: `${docs[0]!.year}-${pad(docs[0]!.month)}-01`, centsPerMile: Math.round(rate.rate * 100) }]; }
  if (rate?.freeMiles !== undefined) config.mileageFreeMiles = rate.freeMiles;

  // accepted holes become accepted-short counts (resolved after the grid is known)
  for (const a of accepted) if (a.kind === "hole") { const s = storeIdOf.get(a.a); if (s) cells.push({ store: s, date: a.date, acceptedShort: 1 }); }

  const seed: Seed = { stores, pharmacists, assignments, unavailability, dateOverrides, cells, standing, travel: [...travel.values()], built, config };
  const world = seedWorld(seed);
  report.assignments = assignments.length;
  report.unavailability = unavailability.length;
  report.standing = standing.length;

  // accepted doubles and leftovers become overrides, with the signature the engine sees now
  const ev = evaluate(world.state, "0001-01-01");
  let oid = 1;
  const addOverride = (assignmentId: string, ruleId: string) => {
    const r = ev.assignments[assignmentId]?.results.find((x) => x.ruleId === ruleId && x.verdict === "Fail");
    if (!r) return;
    const id = `O${oid++}`;
    world.state.overrides[id] = { id, assignmentId, ruleId, signature: r.signature, reason: "Accepted in the old schedule" };
  };
  for (const a of accepted) {
    if (a.kind === "double") {
      const ph = phIdOf.get(a.a);
      const mine = Object.values(world.state.assignments).filter((x) => x.pharmacistId === ph && x.date === a.date).sort((x, y) => x.placedSeq - y.placedSeq);
      for (const m of mine.slice(1)) addOverride(m.id, "double-booking");
    } else if (a.kind === "leftover") {
      const s = storeIdOf.get(a.a);
      for (const m of Object.values(world.state.assignments)) if (m.storeId === s && m.date === a.date) addOverride(m.id, "closure");
    }
  }
  world.state.nextId.override = oid;
  report.assumptions.push(
    "Imported assignments are source manual and Agreed (the prototype has no Unconfirmed state).",
    "Every date of an imported month is marked built, so Build will not re-apply patterns over it.",
    "Stamp patterns become standing assignments (weekday, 1-week cycle, from the first of the month); review them in Setup.",
    "A store that usually runs two pharmacists on a weekday now requires 2 there (the prototype only advised it).",
    "Time off keeps its dates; consecutive dates are grouped into one record. Requested stays Requested, declined becomes Denied.",
    "Tech and cashier slots are not imported.",
    "Pharmacists without recorded licenses import as 'not recorded' (counted, flagged unverified).",
  );
  report.skipped.sort((a, b) => cmp(a.what, b.what));
  return { world, report };
}
