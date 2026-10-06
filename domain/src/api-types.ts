// Public API contract of the domain package. Phase 3 implements these in api.ts.
import type {
  AssignmentId, AssignmentSource, ChangeSet, ChangeSetKind, DomainState, Evaluation, ISODate, Journal,
  PharmacistId, PostingSnapshot, StoreId, ToTellEntry, UnavailStatus, UnavailType, Config,
  Recurrence, Pharmacist, Store, TravelPair,
} from "./types.ts";

export type Edit =
  | { t: "place"; storeId: StoreId; pharmacistId: PharmacistId; date: ISODate; source?: AssignmentSource; agreed?: boolean; pinned?: boolean; partialNote?: string }
  | { t: "remove"; assignmentId: AssignmentId }
  /** Change the store of an existing assignment (same pharmacist, same date). */
  | { t: "move"; assignmentId: AssignmentId; toStoreId: StoreId; /** Restoring a pattern assignment says so: source pattern, agreed. */ source?: AssignmentSource; agreed?: boolean }
  /** Swap who works it (same store, same date). */
  | { t: "swap"; assignmentId: AssignmentId; toPharmacistId: PharmacistId }
  | { t: "update"; assignmentId: AssignmentId; patch: { agreed?: boolean; pinned?: boolean; partialNote?: string | null; dontRestore?: boolean } }
  | { t: "override"; assignmentId: AssignmentId; ruleId: string; reason: string }
  | { t: "unoverride"; assignmentId: AssignmentId; ruleId: string }
  | { t: "unavail.add"; pharmacistId: PharmacistId; first: ISODate; last: ISODate; status: UnavailStatus; type: UnavailType; scopeStoreId?: StoreId; note?: string }
  | { t: "unavail.update"; id: string; patch: { status?: UnavailStatus; first?: ISODate; last?: ISODate } }
  | { t: "unavail.remove"; id: string }
  | { t: "dateOverride.set"; storeId: StoreId; date: ISODate; count: number; note: string }
  | { t: "dateOverride.clear"; storeId: StoreId; date: ISODate }
  | { t: "cell.set"; storeId: StoreId; date: ISODate; locum?: number; acceptedShort?: number }
  | { t: "requirement.set"; storeId: StoreId; weekday: number; effectiveFrom: ISODate; count: number }
  | { t: "requirement.clear"; storeId: StoreId; weekday: number; effectiveFrom: ISODate }
  | { t: "standing.add"; storeId: StoreId; pharmacistId: PharmacistId; recurrence: Recurrence; effectiveFrom: ISODate; effectiveTo?: ISODate }
  | { t: "standing.remove"; id: string }
  | { t: "store.set"; store: Store }
  | { t: "pharmacist.set"; pharmacist: Pharmacist }
  | { t: "travel.set"; pair: TravelPair }
  | { t: "config.set"; patch: Partial<Config> }
  /** Build bookkeeping: this date has had its patterns instantiated. */
  | { t: "built.set"; date: ISODate };

export type Meta = { kind: ChangeSetKind; label?: string; explanation?: string[] };

export type Refusal = { refused: true; reason: string; laterChangeSets?: string[]; detail?: string[] };

export type Proposal = {
  kind: "build" | "repair" | "improve" | "reset";
  label: string;
  edits: Edit[];
  explanation: string[];
  stateHash: string; // hash of the state the engine saw
  engineVersion: string;
  /** Build bookkeeping applied on accept (not shown as edits). */
  builtDates?: ISODate[];
};

export type Scenario = {
  name: string;
  baseHash: string;
  edits: Edit[];
  /** Parked = live schedule editable again; the scenario waits. */
  parked: boolean;
  stale: boolean; // true after any committed change; then read-only, export or discard only
};

export type Session = { proposal: Proposal | null; scenario: Scenario | null };
export type World = { state: DomainState; journal: Journal; session: Session };

export type EvalOptions = {
  includeRequested?: boolean;
  /** Also emit a cell for every store-date in the range (so holes show). Without it, cells exist only where there is an assignment, count row or date override. */
  range?: { from: ISODate; to: ISODate };
  /** Judge only assignments dated inside this window (other dates still feed run-length and double-booking context). For search speed. */
  window?: { from: ISODate; to: ISODate };
};

export type BuildReport = {
  edits: number;
  instantiated: number;
  /** Pattern assignments that could not be applied (conflict or illegal). */
  patternCannotApply: { storeId: StoreId; pharmacistId: PharmacistId; date: ISODate; why: string }[];
  /** Existing assignments that differ from the pattern and created gaps. */
  exceptionsCreatedGaps: { storeId: StoreId; date: ISODate }[];
  patternConflicts: { pharmacistId: PharmacistId; date: ISODate; storeIds: StoreId[] }[];
  /** Illegal assignments Build removed (pattern/build/repair/improve source, not pinned). */
  conflictsRemoved: { storeId: StoreId; pharmacistId: PharmacistId; date: ISODate; why: string }[];
  /** Illegal assignments Build left alone (manual, emergency, pinned or partial-noted). */
  conflictsLeft: { storeId: StoreId; pharmacistId: PharmacistId; date: ISODate; why: string }[];
  unresolvedGaps: { storeId: StoreId; date: ISODate }[];
  /** The search budget ran out somewhere: some gaps may have a solution that was not found. */
  searchLimitHit: boolean;
};

export type BuildResult = { proposal: Proposal | null; report: BuildReport };

export type RepairMetrics = {
  violationsIntroduced: number;
  openRemaining: number;
  overridesNeeded: number;
  changedPharmacistDates: number;
  patternNet: number; // exceptions created minus restored
  travelMinutes: number;
};

export type RepairOption = { edits: Edit[]; metrics: RepairMetrics; explanation: string[] };

export type RepairResult = {
  status: "options" | "none" | "limit" | "cannot-evaluate";
  /** Exact message text from the ruling. */
  message: string;
  options: RepairOption[]; // at most 3
  excludedUnknownTravel: { pharmacistId: PharmacistId; storeId: StoreId; date: ISODate }[];
  /** Only when requested via opts.showNearMiss. */
  nearMiss?: RepairOption;
  /** The node limit was reached: the options shown may not be the best three. */
  limitHit?: boolean;
  gapsUsed: { storeId: StoreId; date: ISODate }[];
  gapsDropped: { storeId: StoreId; date: ISODate }[];
  missing?: string[];
};

export type RepairOpts = { wider?: boolean; showNearMiss?: boolean };

export type ImproveResult = { status: "changes" | "nothing"; message: string; proposal: Proposal | null };
export type ImproveOpts = { includeNext14?: boolean; from: ISODate; to: ISODate };

export type PostResult = { world: World; snapshot: PostingSnapshot };

export type CommitResult = { world: World; changeSet: ChangeSet } | Refusal;
export type UndoResult = { world: World; changeSet: ChangeSet } | Refusal;

export type Api = {
  evaluate(state: DomainState, asOf: ISODate, opts?: EvalOptions): Evaluation;
  commit(world: World, edits: Edit[], meta: Meta): CommitResult;
  undo(world: World, changeSetId: string): UndoResult;
  checkpoint(world: World, name: string): World;
  revertToCheckpoint(world: World, name: string): CommitResult;
  build(world: World, range: { from: ISODate; to: ISODate }, asOf: ISODate): BuildResult;
  resetToPattern(world: World, range: { from: ISODate; to: ISODate }, storeIds: StoreId[] | null, asOf: ISODate): BuildResult;
  repair(world: World, gaps: { storeId: StoreId; date: ISODate }[], opts: RepairOpts, asOf: ISODate): RepairResult;
  improve(world: World, opts: ImproveOpts, asOf: ISODate): ImproveResult;
  openProposal(world: World, p: Proposal): World | Refusal;
  acceptProposal(world: World): CommitResult;
  discardProposal(world: World): World;
  openScenario(world: World, name: string): World | Refusal;
  scenarioEdit(world: World, edits: Edit[]): World | Refusal;
  discardScenario(world: World): World;
  parkScenario(world: World): World;
  post(world: World, range: { from: ISODate; to: ISODate }, asOf: ISODate): PostResult;
  toTell(world: World, asOf: ISODate): ToTellEntry[];
  markTold(world: World, entries: { pharmacistId: PharmacistId; date: ISODate }[]): World;
  /** Live vs latest snapshot, per pharmacist-date: store id or "off". */
  changedSincePosting(world: World): { pharmacistId: PharmacistId; date: ISODate; posted: string; now: string }[];
  stateHash(state: DomainState): string;
};
