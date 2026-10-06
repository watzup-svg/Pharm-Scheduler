// Domain contract for v3. Pure data. No functions, no classes, no Date.
// Every table is a Record keyed by a stable string key so change sets can diff by key.
import type { ISODate } from "./dates.ts";
export type { ISODate };

export type StoreId = string; // "S1", "S2" … per-type monotonic, never reused
export type PharmacistId = string; // "P1" …
export type AssignmentId = string; // "A1" …
export type OverrideId = string; // "O1" …
export type UnavailId = string; // "U1" …
export type StandingId = string; // "T1" …
export type RuleId = string;

export type StateCode = "OR" | "WA";

export type Store = {
  id: StoreId;
  code: string; // display letters, editable label
  name: string;
  /** null = the store's state is not known; licensing is then NotApplicable (prototype behavior). */
  state: StateCode | null;
  /** First inactive day is the effective date. Missing = still active. */
  inactiveFrom?: ISODate;
  activeFrom?: ISODate;
};

export type Pharmacist = {
  id: PharmacistId;
  name: string;
  initials: string; // editable label, not identity
  baseStoreId: StoreId | null;
  /** state -> last valid ISO date, or null = no expiry. Missing state = not licensed. undefined map = not recorded (Unknown). */
  licenses?: Partial<Record<StateCode, ISODate | null>>;
  activeFrom?: ISODate;
  /** First inactive day. */
  inactiveFrom?: ISODate;
};

/** Weekly requirement: how many pharmacists a store needs on a weekday from effectiveFrom on. Key: `${storeId}|${weekday}|${effectiveFrom}`. */
export type Requirement = {
  storeId: StoreId;
  weekday: number; // 0 = Sunday
  effectiveFrom: ISODate;
  count: number;
};

/** One table for holidays (0 = closed), clinics (+N), etc. Key: `${storeId}|${date}`. count replaces the weekly requirement. */
export type DateOverride = {
  storeId: StoreId;
  date: ISODate;
  count: number;
  note: string;
};

export type UnavailStatus = "Requested" | "Approved" | "Actual" | "Denied";
export type UnavailType = "Vacation" | "Sick" | "Other" | "Turned-down";

export type Unavailability = {
  id: UnavailId;
  pharmacistId: PharmacistId;
  first: ISODate;
  last: ISODate; // inclusive
  status: UnavailStatus;
  type: UnavailType;
  /** Required for Turned-down (and then first === last); forbidden for every other type. */
  scopeStoreId?: StoreId;
  note?: string;
};

export type AssignmentSource = "pattern" | "manual" | "build" | "repair" | "improve" | "emergency";

export type Assignment = {
  id: AssignmentId;
  date: ISODate;
  storeId: StoreId;
  pharmacistId: PharmacistId;
  placedSeq: number; // monotonic; earlier = placed first
  source: AssignmentSource;
  /** false = Unconfirmed, true = Agreed. Pattern assignments are Agreed. */
  agreed: boolean;
  pinned: boolean;
  /** Partial-day note. The engine treats the assignment as a whole day, never moves it, never uses it as surplus. Not carried over. */
  partialNote?: string;
  /** Reset to Pattern skips this one. */
  dontRestore?: boolean;
};

/** Key: `${assignmentId}|${ruleId}`. */
export type Override = {
  id: OverrideId;
  assignmentId: AssignmentId;
  ruleId: RuleId;
  /** Observed value at the time of override. If the value now differs, the override is outdated. */
  signature: string;
  reason: string;
};

/** Per store-date counts, not slots. Key: `${storeId}|${date}`. */
export type CellCount = {
  storeId: StoreId;
  date: ISODate;
  locum: number;
  acceptedShort: number;
};

export type Recurrence = {
  /** Weekdays 0-6. */
  weekdays: number[];
  /** 1-4 week rotation anchored to `anchor` (the week containing anchor is week 0). */
  cycleWeeks: 1 | 2 | 3 | 4;
  anchor: ISODate;
  /** If set, only these occurrences of the weekday within the month (1-5), e.g. [1, 3]. */
  nth?: number[];
};

export type Standing = {
  id: StandingId;
  storeId: StoreId;
  pharmacistId: PharmacistId;
  recurrence: Recurrence;
  effectiveFrom: ISODate;
  effectiveTo?: ISODate; // inclusive
};

/** Directed from the pharmacist's base store to the assigned store. Key: `${fromStoreId}|${toStoreId}`. */
export type TravelPair = {
  fromStoreId: StoreId;
  toStoreId: StoreId;
  minutes: number;
  miles: number;
};

export type MileageRate = { effectiveFrom: ISODate; centsPerMile: number };

export type Config = {
  travelSoftMinutes: number; // 90
  travelHardMinutes: number; // 150
  maxConsecutiveDays: number; // 6
  improve: {
    minRestoredStanding: number; // 3
    minTravelSavedMinutes: number; // 60
    maxChanged: number; // 10
    excludeNextDays: number; // 14
  };
  /** Repair/Build search budget in evaluated candidates. A count, never a clock. */
  searchNodeLimit: number; // 200000
  mileageRates: MileageRate[];
  /** One-way miles from the base store that are not paid. */
  mileageFreeMiles: number; // 20
};

export type NextIds = { store: number; pharmacist: number; assignment: number; override: number; unavail: number; standing: number; seq: number; changeSet: number };

/** Everything the state hash covers. Not History, To-tell, snapshots or UI. */
export type DomainState = {
  stores: Record<StoreId, Store>;
  pharmacists: Record<PharmacistId, Pharmacist>;
  requirements: Record<string, Requirement>;
  dateOverrides: Record<string, DateOverride>;
  unavailability: Record<UnavailId, Unavailability>;
  assignments: Record<AssignmentId, Assignment>;
  overrides: Record<OverrideId, Override>;
  cellCounts: Record<string, CellCount>;
  standing: Record<StandingId, Standing>;
  travel: Record<string, TravelPair>;
  /** Dates Build has instantiated patterns for. Key: date. */
  built: Record<ISODate, true>;
  config: Config;
  nextId: NextIds;
};

// ---------- rules ----------
export type Verdict = "Pass" | "Fail" | "Unknown" | "NotApplicable";
export type RuleKind = "presence" | "policy";

export type RuleResult = {
  ruleId: RuleId;
  verdict: Verdict;
  /** Observed value that produced the verdict; an override stores this. */
  signature: string;
  /** Why, in plain words. */
  detail: string;
  /** Fail only: an override on this assignment+rule restores the count / acknowledges. */
  overridden: boolean;
  /** An override exists but its signature no longer matches. */
  outdated: boolean;
};

export type AssignmentEval = {
  assignmentId: AssignmentId;
  results: RuleResult[]; // sorted by ruleId (code-point)
  counts: boolean; // no unresolved presence Fail
  unverified: boolean; // counts, with a presence Unknown
};

export type CellCoverage = {
  storeId: StoreId;
  date: ISODate;
  required: number;
  counted: number;
  unverified: number;
  locum: number;
  acceptedShort: number;
  covered: number; // counted + locum
  open: number; // max(0, required - covered - acceptedShort)
  surplus: number; // max(0, covered - required)
};

export type Evaluation = {
  asOf: ISODate;
  assignments: Record<AssignmentId, AssignmentEval>;
  /** Key `${storeId}|${date}`. Only cells with a requirement, an assignment or a count row. */
  cells: Record<string, CellCoverage>;
};

// ---------- change sets ----------
export type EventType =
  | "assignment.place" | "assignment.remove" | "assignment.update"
  | "override.add" | "override.remove" | "override.update"
  | "unavailability.add" | "unavailability.update" | "unavailability.remove"
  | "dateOverride.set" | "dateOverride.clear"
  | "cell.set"
  | "requirement.set" | "requirement.clear"
  | "standing.add" | "standing.update" | "standing.remove"
  | "store.set" | "pharmacist.set" | "travel.set" | "config.set" | "built.set";

/** Generic keyed upsert. before/after null = absent. key = `${table}:${rowKey}`. */
export type DomainEvent = { type: EventType; key: string; before: unknown; after: unknown };

export type ChangeSetKind = "manual" | "build" | "repair" | "improve" | "reset" | "undo" | "revert" | "setup" | "scenario";

export type ChangeSet = {
  id: string; // "C1"
  seq: number;
  kind: ChangeSetKind;
  label: string; // one History line; manual = "Placed by you."
  events: DomainEvent[];
  /** Engine change sets only. */
  explanation?: string[];
  engineVersion?: string;
  ruleHashes?: Record<string, string>;
  stateHash?: string; // hash of the state the engine saw
  /** For undo/revert: the change set it reverses. */
  reverses?: string;
};

export type Journal = {
  changeSets: ChangeSet[];
  snapshots: PostingSnapshot[];
  /** Last-communicated state per `${pharmacistId}|${date}`: store id or "off". */
  told: Record<string, string>;
  checkpoints: { name: string; afterChangeSet: string; stateHash: string }[];
};


// ---------- posting ----------
export type PostingSnapshot = {
  revision: number;
  postedOn: ISODate; // as-of at posting
  from: ISODate;
  to: ISODate;
  /** `${storeId}|${date}` -> sorted initials list and requirement as of posting. */
  cells: Record<string, { initials: string[]; required: number }>;
  /** pharmacistId|date -> storeId, as posted. */
  placements: Record<string, string>;
  warnings: { open: number; violations: number; overrides: number };
};

export type ToTellEntry = { pharmacistId: PharmacistId; date: ISODate; was: string; now: string };
