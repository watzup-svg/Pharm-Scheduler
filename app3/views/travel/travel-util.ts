// Small pure helpers for the Travel view: which pairs are unknown, what the measured table would add, how to show a date.
import { cmp, weekday, type Config, type DomainState, type Edit, type ISODate, type Pharmacist, type Store } from "@domain";
import driveTable from "../../../fixtures/drive-table.json";

export const pairKey = (from: string, to: string): string => `${from}|${to}`;

export type Level = "ok" | "soft" | "hard";
/** Over the hard limit beats over the soft limit. Limits use minutes only. */
export function levelOf(minutes: number, cfg: Pick<Config, "travelSoftMinutes" | "travelHardMinutes">): Level {
  return minutes > cfg.travelHardMinutes ? "hard" : minutes > cfg.travelSoftMinutes ? "soft" : "ok";
}

export function sortedStores(state: DomainState): Store[] {
  return Object.values(state.stores).sort((a, b) => cmp(a.code, b.code) || cmp(a.id, b.id));
}

export const storeActiveOn = (s: Store, date: ISODate): boolean => (s.activeFrom === undefined || s.activeFrom <= date) && (s.inactiveFrom === undefined || s.inactiveFrom > date);
export const pharmacistActiveOn = (p: Pharmacist, date: ISODate): boolean => (p.activeFrom === undefined || p.activeFrom <= date) && (p.inactiveFrom === undefined || p.inactiveFrom > date);

/** Directed pairs (base store -> any other active store) that have no drive time, for pharmacists active on asOf. */
export type UnknownPair = { from: string; to: string; names: string[] };
export function unknownThatMatter(state: DomainState, asOf: ISODate): UnknownPair[] {
  const stores = sortedStores(state).filter((s) => storeActiveOn(s, asOf));
  const out = new Map<string, UnknownPair>();
  for (const p of Object.values(state.pharmacists).sort((a, b) => cmp(a.name, b.name))) {
    if (!pharmacistActiveOn(p, asOf) || !p.baseStoreId || !state.stores[p.baseStoreId]) continue;
    for (const s of stores) {
      if (s.id === p.baseStoreId) continue;
      const k = pairKey(p.baseStoreId, s.id);
      if (state.travel[k]) continue;
      const cur = out.get(k) ?? { from: p.baseStoreId, to: s.id, names: [] };
      cur.names.push(p.name);
      out.set(k, cur);
    }
  }
  const code = (id: string) => state.stores[id]?.code ?? id;
  return [...out.values()].sort((a, b) => cmp(code(a.from), code(b.from)) || cmp(code(a.to), code(b.to)));
}

/** The measured Hi-School table. Keys are store codes joined with "|"; values [miles, minutes, ferry?]. */
export const MEASURED = driveTable.pairs as unknown as Readonly<Record<string, readonly [number, number, number?]>>;
export const MEASURED_ON: string = driveTable.measuredOn;

/** travel.set edits for every directed pair the table has and the world lacks. Existing pairs are never touched. */
export function measuredFills(state: DomainState, table: Readonly<Record<string, readonly [number, number, number?]>> = MEASURED): { edits: Edit[]; added: number; pairsInTable: number } {
  const byCode = new Map<string, string>();
  for (const s of Object.values(state.stores)) byCode.set(s.code, s.id);
  const edits: Edit[] = [];
  const seen = new Set<string>();
  let pairsInTable = 0;
  for (const key of Object.keys(table).sort(cmp)) {
    const [ca, cb] = key.split("|");
    const a = byCode.get(ca ?? ""), b = byCode.get(cb ?? "");
    if (!a || !b || a === b) continue;
    const v = table[key]!;
    pairsInTable += 1;
    for (const [f, t] of [[a, b], [b, a]] as const) {
      const k = pairKey(f, t);
      if (state.travel[k] || seen.has(k)) continue;
      seen.add(k);
      edits.push({ t: "travel.set", pair: { fromStoreId: f, toStoreId: t, minutes: v[1], miles: v[0] } });
    }
  }
  return { edits, added: edits.length, pairsInTable };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** "Tue Oct 6" */
export function shortDate(d: ISODate): string {
  return `${DAYS[weekday(d)]} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
}
export function monthLabel(ym: string): string {
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${names[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
}
export function shiftMonth(ym: string, by: number): string {
  const n = Number(ym.slice(0, 4)) * 12 + (Number(ym.slice(5, 7)) - 1) + by;
  return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;
}

/** Whole number of minutes: digits only, no sign. */
export const parseMinutes = (s: string): number | null => (/^\d{1,4}$/.test(s.trim()) ? Number(s.trim()) : null);
/** Miles: digits with at most one decimal point and up to two decimals. */
export const parseMiles = (s: string): number | null => (/^\d{1,4}(\.\d{1,2})?$/.test(s.trim()) ? Number(s.trim()) : null);
