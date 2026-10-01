const ROLES = [
  "Pharmacist",
  "Float Pharmacist",
  "Pharmacy Technician",
  "Cashier",
] as const;

export type Role = (typeof ROLES)[number];

export const SLOT_IDS = [
  "pharmacist",
  "pharmacist2",
  "tech1",
  "tech2",
  "tech3",
  "tech4",
  "cashier",
] as const;

export type SlotId = (typeof SLOT_IDS)[number];
export type SlotKind = "RPh" | "Tech" | "Cash";

export type Store = {
  code: string;
  name: string;
  satOpen: boolean;
  /** Weekdays (1 = Mon … 5 = Fri) this store is normally closed, e.g. [3] for Wednesdays. */
  closedWeekdays?: number[];
  sunOpen: boolean;
  address: string;
  /** Pharmacy phone, as posted. */
  phone?: string;
  /** Regular hours as posted, including lunch. Display only; open/closed days come from satOpen and sunOpen. */
  hours?: string;
  /** What is known about holiday closures. Display only; closures that apply are Holidays. */
  holidayNote?: string;
  /** Approximate location, for distance hints only. */
  lat?: number;
  lng?: number;
  /** The store's number, as the district calls it ("4127"). Optional. Shown instead of the letters when the district chooses numbers. */
  number?: string;
  /** Weekdays (Sunday = 0) this store usually runs two pharmacists. Chosen by the district manager; empty or missing = one is enough. */
  twoPharmacistDays?: number[];
};

export type Person = {
  name: string;
  role: Role;
  home: string;
  lead: boolean;
  phone: string;
  color: string;
  /** State codes this pharmacist is licensed in ("OR", "WA"). Empty or missing: not recorded, no hint. */
  licensedStates?: string[];
  /** Weekdays (Sunday = 0) they usually cannot work. A hint only. */
  unavailableDays?: number[];
  /** First and last day they work for the company (YYYY-MM-DD). Outside these dates they are not available. */
  startsOn?: string;
  endsOn?: string;
  /** Never proposed by Fill, Best fit or suggestions. Still listed to pick by hand. */
  noSuggest?: boolean;
  /** State code to the last day the license is valid (YYYY-MM-DD). After that date the license no longer counts. */
};

export type Holiday = {
  date: string;
  store: string;
  label: string;
  repeat: boolean;
  /** A closure the district manager decided on (short-staffed, weather…), not a calendar holiday. `label` is the reason and prints on the poster. */
  closure?: boolean;
};

/** A problem the district manager has looked at and accepted. One click; it lasts only while the same problem is still there. */
export type Accepted = {
  /** "hole|EST|14", "leftover|EST|14" or "double|Jane Smith|14". Licenses can never be accepted. */
  key: string;
  /** When it was accepted (ISO). */
  at: string;
};

export type TimeOffStatus = "requested" | "approved" | "declined";

export type TimeOff = {
  name: string;
  dates: string[];
  from: string;
  to: string;
  note: string;
  /** Missing means approved, so older files behave as before. Only approved time off counts anywhere. */
  status?: TimeOffStatus;
  /** When the request arrived (YYYY-MM-DD), for requests. */
  requestedOn?: string;
};

/** store → slot → day-number string → person name */
export type Grid = Record<string, Partial<Record<SlotId, Record<string, string>>>>;

/** store → slot → weekday 0–6 string → person name. Stamp source only. */
export type Pattern = Record<string, Partial<Record<SlotId, Record<string, string>>>>;

/** store → day-number string → note */
export type DayNotes = Record<string, Record<string, string>>;

export type PrintPrefs = {
  paper: "letter" | "tabloid";
  typeSize: "normal" | "large";
  grayscale: boolean;
  twoUp: boolean;
  punch: boolean;
  includeStaff?: boolean;
};

export const DEFAULT_PRINT_PREFS: PrintPrefs = {
  paper: "letter",
  typeSize: "large",
  grayscale: false,
  twoUp: false,
  punch: false,
  includeStaff: false,
};

export type ScheduleDoc = {
  format: "hischool-schedule";
  version: 2;
  year: number;
  month: number;
  stores: Store[];
  people: Person[];
  holidays: Holiday[];
  timeOff: TimeOff[];
  grid: Grid;
  pattern: Pattern;
  dayNotes: DayNotes;
  printPrefs: PrintPrefs;
  /** Problems accepted instead of fixed. */
  accepted?: Accepted[];
  /** Drive times the manager set by hand, in minutes, keyed "A|B" with the two store codes in alphabetical order. Beats the estimate from addresses. */
  driveMinutes?: Record<string, number>;
  /** How stores are named in headings and lists: by their letters (EST) or by their store number. Default letters. */
  storeLabels?: "code" | "number";
};

export type CellRef = {
  store: string;
  slot: SlotId;
  day: number;
};

export type DayIssue = {
  store: string;
  day: number;
  /** Open with nobody, and not accepted. */
  hole: boolean;
  /** Open with nobody, and accepted by the district manager. */
  holeAccepted: boolean;
  leftover: boolean;
  leftoverAccepted: boolean;
  staffLeftover: boolean;
  leftoverNames: string[];
  doubledNames: string[];
  /** People in two places that day whom the district manager accepted. */
  doubledAccepted: string[];
  /** Open, one pharmacist, and this store usually runs two that weekday. Advisory only. */
  needsSecond: boolean;
  /** Placed in a state they are not licensed in. Hard error. */
  unlicensedNames: string[];
  ptoNames: string[];
  soloFloatName: string | null;
  why: string;
  open: boolean;
};

export type Evaluation = {
  holes: number;
  closed: number;
  staffClosed: number;
  doubles: number;
  /** Placements in a state the person is not licensed in. Hard error. */
  unlicensed: number;
  /** Days where a store usually runs two pharmacists and has one. Advisory only. */
  short: number;
  warns: number;
  staffWarns: number;
  ready: boolean;
  /** Problems accepted instead of fixed (and still present). */
  accepted: number;
  /** Every accept-able problem keys that exist right now, accepted or not. Used to drop accepts that no longer apply. */
  problemKeys: string[];
  issues: DayIssue[];
  byKey: Record<string, DayIssue>;
  doubledByDay: Record<number, string[]>;
  storeHoles: Record<string, number>;
  storeClosed: Record<string, number>;
};

export type DroppedPlacement = {
  name: string;
  store: string;
  slotShort: string;
  fromDay: number;
  fromWeekday: string;
  occurrence: number;
  toDay: number | null;
  toWeekday: string | null;
  reason: "shut" | "no-day" | "unlicensed" | "not-employed" | "usual-off";
};
