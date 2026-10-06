// Compact seed format for fixtures and tests. Expands to a full DomainState with defaults.
import type { AssignmentSource, Config, DomainState, ISODate, Recurrence, StateCode, UnavailStatus, UnavailType } from "./types.ts";
import type { Session, World } from "./api-types.ts";

export type SeedStore = {
  id: string; code?: string; name?: string; state?: StateCode | null;
  /** Pharmacists required every open weekday. Default 1. */
  req?: number;
  /** Weekdays (0 = Sunday) with requirement 0. Default [0] (Sunday). */
  closedWeekdays?: number[];
  /** Weekdays with requirement 2 (unless closed). */
  twoDays?: number[];
  inactiveFrom?: ISODate; activeFrom?: ISODate;
};
export type SeedPharmacist = {
  id: string; name?: string; initials?: string; base?: string | null;
  /** States licensed (no expiry). null = licensing not recorded (Unknown). Default ["OR","WA"]. */
  lic?: StateCode[] | null;
  /** Per-state expiry, overrides lic for that state. */
  licExpires?: Partial<Record<StateCode, ISODate>>;
  activeFrom?: ISODate; inactiveFrom?: ISODate;
};
export type SeedAssignment = {
  id?: string; store: string; ph: string; date: ISODate; seq?: number;
  source?: AssignmentSource; agreed?: boolean; pinned?: boolean; partialNote?: string; dontRestore?: boolean;
};
export type SeedUnavail = {
  id?: string; ph: string; first: ISODate; last?: ISODate; status?: UnavailStatus; type?: UnavailType; scope?: string; note?: string;
};
export type Seed = {
  stores: SeedStore[];
  pharmacists: SeedPharmacist[];
  assignments?: SeedAssignment[];
  unavailability?: SeedUnavail[];
  dateOverrides?: { store: string; date: ISODate; count: number; note?: string }[];
  cells?: { store: string; date: ISODate; locum?: number; acceptedShort?: number }[];
  standing?: { id?: string; store: string; ph: string; recurrence: Recurrence; from: ISODate; to?: ISODate }[];
  /** [fromStoreId, toStoreId, minutes, miles]. Same-store pairs are implied 0. */
  travel?: [string, string, number, number][];
  built?: ISODate[];
  config?: Partial<Config>;
};

export const DEFAULT_CONFIG: Config = {
  travelSoftMinutes: 90,
  travelHardMinutes: 150,
  maxConsecutiveDays: 6,
  improve: { minRestoredStanding: 3, minTravelSavedMinutes: 60, maxChanged: 10, excludeNextDays: 14 },
  searchNodeLimit: 4000,
  mileageRates: [],
  mileageFreeMiles: 20,
};

const EPOCH = "0001-01-01";

export function emptySession(): Session {
  return { proposal: null, scenario: null };
}

export function seedWorld(seed: Seed): World {
  const st: DomainState = {
    stores: {}, pharmacists: {}, requirements: {}, dateOverrides: {}, unavailability: {}, assignments: {},
    overrides: {}, cellCounts: {}, standing: {}, travel: {}, built: {},
    config: { ...DEFAULT_CONFIG, improve: { ...DEFAULT_CONFIG.improve }, ...(seed.config ?? {}) },
    nextId: { store: 1, pharmacist: 1, assignment: 1, override: 1, unavail: 1, standing: 1, seq: 1, changeSet: 1 },
  };
  for (const s of seed.stores) {
    st.stores[s.id] = {
      id: s.id, code: s.code ?? s.id, name: s.name ?? s.id, state: s.state === undefined ? "OR" : s.state,
      ...(s.inactiveFrom ? { inactiveFrom: s.inactiveFrom } : {}),
      ...(s.activeFrom ? { activeFrom: s.activeFrom } : {}),
    };
    const closed = s.closedWeekdays ?? [0];
    for (let w = 0; w < 7; w++) {
      const count = closed.includes(w) ? 0 : (s.twoDays ?? []).includes(w) ? 2 : (s.req ?? 1);
      const key = `${s.id}|${w}|${EPOCH}`;
      st.requirements[key] = { storeId: s.id, weekday: w, effectiveFrom: EPOCH, count };
    }
  }
  for (const p of seed.pharmacists) {
    const licensed = p.lic === undefined ? (["OR", "WA"] as StateCode[]) : p.lic;
    let licenses: Partial<Record<StateCode, ISODate | null>> | undefined;
    if (licensed !== null) {
      licenses = {};
      for (const c of licensed) licenses[c] = null;
      for (const [c, d] of Object.entries(p.licExpires ?? {})) licenses[c as StateCode] = d;
    }
    st.pharmacists[p.id] = {
      id: p.id, name: p.name ?? p.id, initials: p.initials ?? p.id, baseStoreId: p.base ?? null,
      ...(licenses ? { licenses } : {}),
      ...(p.activeFrom ? { activeFrom: p.activeFrom } : {}),
      ...(p.inactiveFrom ? { inactiveFrom: p.inactiveFrom } : {}),
    };
  }
  let seq = 1;
  let aid = 1;
  for (const a of seed.assignments ?? []) {
    const id = a.id ?? `A${aid++}`;
    const placedSeq = a.seq ?? seq++;
    seq = Math.max(seq, placedSeq + 1);
    st.assignments[id] = {
      id, date: a.date, storeId: a.store, pharmacistId: a.ph, placedSeq,
      source: a.source ?? "manual", agreed: a.agreed ?? (a.source === "pattern" || a.source === undefined ? true : false),
      pinned: a.pinned ?? false,
      ...(a.partialNote ? { partialNote: a.partialNote } : {}),
      ...(a.dontRestore ? { dontRestore: true } : {}),
    };
  }
  let uid = 1;
  for (const u of seed.unavailability ?? []) {
    const id = u.id ?? `U${uid++}`;
    st.unavailability[id] = {
      id, pharmacistId: u.ph, first: u.first, last: u.last ?? u.first,
      status: u.status ?? "Approved", type: u.type ?? "Vacation",
      ...(u.scope ? { scopeStoreId: u.scope } : {}), ...(u.note ? { note: u.note } : {}),
    };
  }
  for (const d of seed.dateOverrides ?? []) {
    st.dateOverrides[`${d.store}|${d.date}`] = { storeId: d.store, date: d.date, count: d.count, note: d.note ?? "" };
  }
  for (const c of seed.cells ?? []) {
    st.cellCounts[`${c.store}|${c.date}`] = { storeId: c.store, date: c.date, locum: c.locum ?? 0, acceptedShort: c.acceptedShort ?? 0 };
  }
  let tid = 1;
  for (const t of seed.standing ?? []) {
    const id = t.id ?? `T${tid++}`;
    st.standing[id] = {
      id, storeId: t.store, pharmacistId: t.ph, recurrence: t.recurrence, effectiveFrom: t.from,
      ...(t.to ? { effectiveTo: t.to } : {}),
    };
  }
  for (const [f, t, minutes, miles] of seed.travel ?? []) {
    st.travel[`${f}|${t}`] = { fromStoreId: f, toStoreId: t, minutes, miles };
  }
  for (const d of seed.built ?? []) st.built[d] = true;
  st.nextId.assignment = Math.max(aid, ...Object.keys(st.assignments).map((k) => Number(/\d+$/.exec(k)?.[0] ?? 0) + 1), 1);
  st.nextId.seq = seq;
  st.nextId.unavail = Math.max(uid, 1);
  st.nextId.standing = Math.max(tid, 1);
  // Agreed implies told: an agreed assignment is already known to its pharmacist.
  const told: Record<string, string> = {};
  for (const a of Object.values(st.assignments)) if (a.agreed) told[`${a.pharmacistId}|${a.date}`] = a.storeId;
  return { state: st, journal: { changeSets: [], snapshots: [], told, checkpoints: [] }, session: emptySession() };
}
