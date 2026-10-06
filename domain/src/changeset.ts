// Edits -> keyed events; commit, undo, checkpoint, revert. The only code that mutates a DomainState.
import { cmp, isValidDate } from "./dates.ts";
import { canonical, clone, deepEqual } from "./canonical.ts";
import { sha256 } from "./hash.ts";
import { evaluate } from "./coverage.ts";
import { RULES, RULE_BY_ID } from "./rules.ts";
import type { CommitResult, Edit, Meta, Refusal, World } from "./api-types.ts";
import type { AssignmentSource, ChangeSet, DomainEvent, DomainState, EventType } from "./types.ts";

export const ENGINE_VERSION = "v3.0";

const TABLE: Record<string, keyof DomainState> = {
  store: "stores", pharmacist: "pharmacists", requirement: "requirements", dateOverride: "dateOverrides",
  unavailability: "unavailability", assignment: "assignments", override: "overrides", cell: "cellCounts",
  standing: "standing", travel: "travel", built: "built",
};

export function refuse(reason: string, extra: Partial<Refusal> = {}): Refusal {
  return { refused: true, reason, ...extra };
}

/** Hash of the domain tables. nextId counters are bookkeeping and excluded. */
export function stateHash(state: DomainState): string {
  const { nextId: _n, ...rest } = state;
  return sha256(canonical(rest));
}

function splitKey(key: string): [string, string] {
  const i = key.indexOf(":");
  return [key.slice(0, i), key.slice(i + 1)];
}

export function readKey(state: DomainState, key: string): unknown {
  const [t, k] = splitKey(key);
  if (t === "config") return state.config;
  const tbl = state[TABLE[t]!] as Record<string, unknown>;
  return tbl[k] ?? null;
}

export function writeKey(state: DomainState, key: string, value: unknown): void {
  const [t, k] = splitKey(key);
  if (t === "config") { state.config = clone(value) as DomainState["config"]; return; }
  const tbl = state[TABLE[t]!] as Record<string, unknown>;
  if (value === null || value === undefined) delete tbl[k];
  else tbl[k] = clone(value);
}

export function applyEvents(state: DomainState, events: DomainEvent[]): void {
  for (const e of events) writeKey(state, e.key, e.after);
}

export function invert(events: DomainEvent[]): DomainEvent[] {
  return events.slice().reverse().map((e) => ({ ...e, before: e.after, after: e.before }));
}

class Builder {
  events: DomainEvent[] = [];
  state: DomainState;
  /** When set, tables are copied the first time they are written (scratch states share untouched tables). */
  private cow: Set<string> | null;
  constructor(state: DomainState, cow = false) {
    this.state = state;
    this.cow = cow ? new Set() : null;
  }
  set(type: EventType, key: string, after: unknown): void {
    if (this.cow) {
      // Scratch state (search, previews): no event bookkeeping and no deep copies; rows are replaced, never mutated.
      const [t, k] = splitKey(key);
      const f = TABLE[t];
      if (!f && t !== "config") return;
      if (t === "config") { this.state.config = after as DomainState["config"]; return; }
      if (!this.cow.has(f!)) {
        (this.state as unknown as Record<string, unknown>)[f!] = { ...(this.state[f!] as object) };
        this.cow.add(f!);
      }
      const tbl = this.state[f!] as Record<string, unknown>;
      if (after === null || after === undefined) delete tbl[k]; else tbl[k] = after;
      return;
    }
    const before = readKey(this.state, key);
    writeKey(this.state, key, after);
    const prev = this.events.find((e) => e.key === key);
    if (prev) { prev.after = clone(after); prev.type = type; }
    else this.events.push({ type, key, before: clone(before), after: clone(after) });
  }
}

const int0 = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;
const okDate = (d: unknown): d is string => typeof d === "string" && isValidDate(d);
const normList = (a: number[]) => [...new Set(a)].sort((x, y) => x - y);

type Fail = Refusal;
const bad = (r: string): Fail => refuse(r);

function applyEdit(b: Builder, e: Edit, src?: AssignmentSource): Fail | null {
  const s = b.state;
  const asg = (id: string) => s.assignments[id];
  switch (e.t) {
    case "place": {
      if (!isValidDate(e.date)) return bad(`Bad date ${e.date}`);
      if (!s.stores[e.storeId]) return bad(`Unknown store ${e.storeId}`);
      if (!s.pharmacists[e.pharmacistId]) return bad(`Unknown pharmacist ${e.pharmacistId}`);
      for (const a of Object.values(s.assignments)) if (a.date === e.date && a.storeId === e.storeId && a.pharmacistId === e.pharmacistId) return bad("Already placed there");
      const id = `A${s.nextId.assignment++}`;
      const source = e.source ?? src ?? "manual";
      b.set("assignment.place", `assignment:${id}`, {
        id, date: e.date, storeId: e.storeId, pharmacistId: e.pharmacistId, placedSeq: s.nextId.seq++, source,
        agreed: e.agreed ?? source === "pattern", pinned: e.pinned ?? false,
        ...(e.partialNote ? { partialNote: e.partialNote } : {}),
      });
      return null;
    }
    case "remove": {
      const a = asg(e.assignmentId);
      if (!a) return bad(`No assignment ${e.assignmentId}`);
      for (const o of Object.values(s.overrides)) if (o.assignmentId === a.id) b.set("override.remove", `override:${o.id}`, null);
      b.set("assignment.remove", `assignment:${a.id}`, null);
      return null;
    }
    case "move": {
      const a = asg(e.assignmentId);
      if (!a) return bad(`No assignment ${e.assignmentId}`);
      if (!s.stores[e.toStoreId]) return bad(`Unknown store ${e.toStoreId}`);
      if (Object.values(s.assignments).some((x) => x.id !== a.id && x.date === a.date && x.storeId === e.toStoreId && x.pharmacistId === a.pharmacistId)) return bad("Already placed there");
      const n = { ...a, storeId: e.toStoreId, agreed: e.agreed ?? false, ...(e.source ? { source: e.source } : src ? { source: src } : {}) };
      delete (n as { partialNote?: string }).partialNote;
      b.set("assignment.update", `assignment:${a.id}`, n);
      return null;
    }
    case "swap": {
      const a = asg(e.assignmentId);
      if (!a) return bad(`No assignment ${e.assignmentId}`);
      if (!s.pharmacists[e.toPharmacistId]) return bad(`Unknown pharmacist ${e.toPharmacistId}`);
      if (Object.values(s.assignments).some((x) => x.id !== a.id && x.date === a.date && x.storeId === a.storeId && x.pharmacistId === e.toPharmacistId)) return bad("Already placed there");
      const n = { ...a, pharmacistId: e.toPharmacistId, agreed: false, ...(src ? { source: src } : {}) };
      delete (n as { partialNote?: string }).partialNote;
      b.set("assignment.update", `assignment:${a.id}`, n);
      return null;
    }
    case "update": {
      const a = asg(e.assignmentId);
      if (!a) return bad(`No assignment ${e.assignmentId}`);
      const n = { ...a } as typeof a;
      const p = e.patch;
      if (p.agreed !== undefined) n.agreed = p.agreed;
      if (p.pinned !== undefined) n.pinned = p.pinned;
      if (p.dontRestore !== undefined) { if (p.dontRestore) n.dontRestore = true; else delete n.dontRestore; }
      if (p.partialNote !== undefined) { if (p.partialNote) n.partialNote = p.partialNote; else delete n.partialNote; }
      b.set("assignment.update", `assignment:${a.id}`, n);
      return null;
    }
    case "override": {
      const a = asg(e.assignmentId);
      if (!a) return bad(`No assignment ${e.assignmentId}`);
      const def = RULE_BY_ID[e.ruleId];
      if (!def) return bad(`Unknown rule ${e.ruleId}`);
      if (!def.overridable) return bad(`${def.id} cannot be overridden`);
      if (def.reasonRequired && !e.reason.trim()) return bad("A reason is required");
      for (const o of Object.values(s.overrides)) if (o.assignmentId === a.id && o.ruleId === e.ruleId) return bad("Already overridden");
      const r = evaluate(s, "0000-01-01").assignments[a.id]?.results.find((x) => x.ruleId === e.ruleId);
      if (!r || r.verdict !== "Fail") return bad("Nothing to override: that rule is not failing");
      const id = `O${s.nextId.override++}`;
      b.set("override.add", `override:${id}`, { id, assignmentId: a.id, ruleId: e.ruleId, signature: r.signature, reason: e.reason });
      return null;
    }
    case "unoverride": {
      const o = Object.values(s.overrides).find((x) => x.assignmentId === e.assignmentId && x.ruleId === e.ruleId);
      if (!o) return bad("No such override");
      b.set("override.remove", `override:${o.id}`, null);
      return null;
    }
    case "unavail.add": {
      if (!s.pharmacists[e.pharmacistId]) return bad(`Unknown pharmacist ${e.pharmacistId}`);
      if (!isValidDate(e.first) || !isValidDate(e.last) || e.last < e.first) return bad("Bad dates");
      if (e.type === "Turned-down") {
        if (!e.scopeStoreId) return bad("Turned-down needs a store");
        if (e.first !== e.last) return bad("Turned-down is a single date");
        if (!s.stores[e.scopeStoreId]) return bad(`Unknown store ${e.scopeStoreId}`);
      } else if (e.scopeStoreId) return bad("Only Turned-down can have a store");
      const id = `U${s.nextId.unavail++}`;
      b.set("unavailability.add", `unavailability:${id}`, {
        id, pharmacistId: e.pharmacistId, first: e.first, last: e.last, status: e.status, type: e.type,
        ...(e.scopeStoreId ? { scopeStoreId: e.scopeStoreId } : {}), ...(e.note ? { note: e.note } : {}),
      });
      return null;
    }
    case "unavail.update": {
      const u = s.unavailability[e.id];
      if (!u) return bad(`No record ${e.id}`);
      const n = { ...u, ...e.patch };
      if (!isValidDate(n.first) || !isValidDate(n.last) || n.last < n.first) return bad("Bad dates");
      if (n.type === "Turned-down" && n.first !== n.last) return bad("Turned-down is a single date");
      b.set("unavailability.update", `unavailability:${u.id}`, n);
      return null;
    }
    case "unavail.remove": {
      if (!s.unavailability[e.id]) return bad(`No record ${e.id}`);
      b.set("unavailability.remove", `unavailability:${e.id}`, null);
      return null;
    }
    case "dateOverride.set": {
      if (!s.stores[e.storeId]) return bad(`Unknown store ${e.storeId}`);
      if (!isValidDate(e.date) || e.count < 0 || !Number.isInteger(e.count)) return bad("Bad override");
      b.set("dateOverride.set", `dateOverride:${e.storeId}|${e.date}`, { storeId: e.storeId, date: e.date, count: e.count, note: e.note });
      return null;
    }
    case "dateOverride.clear": {
      b.set("dateOverride.clear", `dateOverride:${e.storeId}|${e.date}`, null);
      return null;
    }
    case "cell.set": {
      if (!s.stores[e.storeId]) return bad(`Unknown store ${e.storeId}`);
      if (!okDate(e.date)) return bad("Bad date");
      if ((e.locum !== undefined && !int0(e.locum)) || (e.acceptedShort !== undefined && !int0(e.acceptedShort))) return bad("Counts must be whole numbers, zero or more");
      const cur = s.cellCounts[`${e.storeId}|${e.date}`] ?? { storeId: e.storeId, date: e.date, locum: 0, acceptedShort: 0 };
      const n = { ...cur, locum: e.locum ?? cur.locum, acceptedShort: e.acceptedShort ?? cur.acceptedShort };
      if (n.locum < 0 || n.acceptedShort < 0) return bad("Counts cannot be negative");
      b.set("cell.set", `cell:${e.storeId}|${e.date}`, n.locum === 0 && n.acceptedShort === 0 ? null : n);
      return null;
    }
    case "requirement.set": {
      if (!s.stores[e.storeId]) return bad(`Unknown store ${e.storeId}`);
      if (!int0(e.count) || !Number.isInteger(e.weekday) || e.weekday < 0 || e.weekday > 6 || !okDate(e.effectiveFrom)) return bad("A weekly need needs a weekday 0-6, a whole number, and a date");
      b.set("requirement.set", `requirement:${e.storeId}|${e.weekday}|${e.effectiveFrom}`, { storeId: e.storeId, weekday: e.weekday, effectiveFrom: e.effectiveFrom, count: e.count });
      return null;
    }
    case "requirement.clear": {
      b.set("requirement.clear", `requirement:${e.storeId}|${e.weekday}|${e.effectiveFrom}`, null);
      return null;
    }
    case "standing.add": {
      if (!s.stores[e.storeId] || !s.pharmacists[e.pharmacistId]) return bad("Unknown store or pharmacist");
      const r0 = e.recurrence;
      if (![1, 2, 3, 4].includes(r0.cycleWeeks) || !r0.weekdays.length || r0.weekdays.some((w) => !Number.isInteger(w) || w < 0 || w > 6) || (r0.nth && r0.nth.some((n) => !Number.isInteger(n) || n < 1 || n > 5)) || !okDate(r0.anchor) || !okDate(e.effectiveFrom) || (e.effectiveTo !== undefined && (!okDate(e.effectiveTo) || e.effectiveTo < e.effectiveFrom))) return bad("That routine is not valid");
      const rec = { ...r0, weekdays: normList(r0.weekdays), ...(r0.nth ? { nth: normList(r0.nth) } : {}) };
      const dup = Object.values(s.standing).find((t) => t.storeId === e.storeId && t.pharmacistId === e.pharmacistId && t.effectiveFrom === e.effectiveFrom && t.effectiveTo === e.effectiveTo && deepEqual(t.recurrence, rec));
      if (dup) return null; // identical duplicates merge
      const id = `T${s.nextId.standing++}`;
      b.set("standing.add", `standing:${id}`, { id, storeId: e.storeId, pharmacistId: e.pharmacistId, recurrence: rec, effectiveFrom: e.effectiveFrom, ...(e.effectiveTo ? { effectiveTo: e.effectiveTo } : {}) });
      return null;
    }
    case "standing.remove": {
      if (!s.standing[e.id]) return bad(`No pattern ${e.id}`);
      b.set("standing.remove", `standing:${e.id}`, null);
      return null;
    }
    case "built.set": b.set("built.set", `built:${e.date}`, true); return null;
    case "store.set": {
      const st = e.store;
      if (!st.id.trim() || (st.activeFrom !== undefined && !okDate(st.activeFrom)) || (st.inactiveFrom !== undefined && !okDate(st.inactiveFrom))) return bad("That store is not valid");
      b.set("store.set", `store:${st.id}`, st);
      return null;
    }
    case "pharmacist.set": {
      const ph = e.pharmacist;
      if (!ph.id.trim() || (ph.activeFrom !== undefined && !okDate(ph.activeFrom)) || (ph.inactiveFrom !== undefined && !okDate(ph.inactiveFrom)) || (ph.baseStoreId !== null && !s.stores[ph.baseStoreId])) return bad("That pharmacist is not valid");
      b.set("pharmacist.set", `pharmacist:${ph.id}`, ph);
      return null;
    }
    case "travel.set": {
      const p0 = e.pair;
      if (!s.stores[p0.fromStoreId] || !s.stores[p0.toStoreId] || p0.fromStoreId === p0.toStoreId) return bad("A drive time needs two different stores");
      if (!int0(p0.minutes) || typeof p0.miles !== "number" || !Number.isFinite(p0.miles) || p0.miles < 0) return bad("Minutes must be a whole number and miles zero or more");
      b.set("travel.set", `travel:${p0.fromStoreId}|${p0.toStoreId}`, p0);
      return null;
    }
    case "config.set": {
      const n = { ...s.config, ...e.patch, improve: { ...s.config.improve, ...(e.patch.improve ?? {}) } };
      if (!int0(n.travelSoftMinutes) || !int0(n.travelHardMinutes) || n.travelSoftMinutes > n.travelHardMinutes || !int0(n.maxConsecutiveDays) || n.maxConsecutiveDays < 1 || !int0(n.searchNodeLimit) || n.searchNodeLimit < 1 || !int0(n.mileageFreeMiles) || !Object.values(n.improve).every(int0)) return bad("Those settings are not valid");
      b.set("config.set", "config:main", n);
      return null;
    }
  }
}

/** Drop overrides whose rule no longer fails. Runs inside the same change set. */
function dropMoot(b: Builder): void {
  const ev = evaluate(b.state, "0000-01-01");
  for (const oid of Object.keys(b.state.overrides).sort(cmp)) {
    const o = b.state.overrides[oid]!;
    const r = ev.assignments[o.assignmentId]?.results.find((x) => x.ruleId === o.ruleId);
    if (!r || r.verdict !== "Fail") b.set("override.remove", `override:${o.id}`, null);
  }
}

export function ruleHashes(state: DomainState): Record<string, string> {
  const out: Record<string, string> = {};
  const c = state.config;
  for (const r of RULES) {
    const cfg = r.id === "travel-soft" ? c.travelSoftMinutes : r.id === "travel-hard" ? c.travelHardMinutes : r.id === "consecutive-days" ? c.maxConsecutiveDays : "";
    out[r.id] = sha256(`${r.id}@${r.version}|${cfg}`);
  }
  return out;
}

export function liveReadOnly(world: World): string | null {
  if (world.session.proposal) return "A proposal is open. Accept or discard it first.";
  if (world.session.scenario && !world.session.scenario.parked) return "A scenario is open and the live schedule is read-only.";
  return null;
}

function nextCsId(state: DomainState): { id: string; seq: number } {
  const n = state.nextId.changeSet++;
  return { id: `C${n}`, seq: n };
}

type ToldDelta = { key: string; before: string | null; after: string | null };

/** Agreed implies told: what this change set writes to the ledger, as deltas so Undo and Revert can put it back. */
function toldDeltas(told: Record<string, string>, events: DomainEvent[]): ToldDelta[] {
  const out = new Map<string, ToldDelta>();
  for (const e of events) {
    if (!e.key.startsWith("assignment:")) continue;
    const a = e.after as { agreed: boolean; pharmacistId: string; date: string; storeId: string } | null;
    if (!a?.agreed) continue;
    const key = `${a.pharmacistId}|${a.date}`;
    const prev = out.get(key)?.before ?? told[key] ?? null;
    if (prev !== a.storeId) out.set(key, { key, before: prev, after: a.storeId });
  }
  return [...out.values()].sort((x, y) => cmp(x.key, y.key));
}

/** Apply deltas (forward), or their inverse where the ledger still holds the value they wrote. */
function applyTold(told: Record<string, string>, deltas: ToldDelta[], inverse: boolean): { told: Record<string, string>; applied: ToldDelta[] } {
  const next = { ...told };
  const applied: ToldDelta[] = [];
  for (const d of deltas) {
    const from = inverse ? d.after : d.before;
    const to = inverse ? d.before : d.after;
    if (inverse && (next[d.key] ?? null) !== from) continue;
    if (to === null) delete next[d.key]; else next[d.key] = to;
    applied.push({ key: d.key, before: from, after: to });
  }
  return { told: next, applied };
}

/** Internal commit that skips the read-only gate (used by accept). */
export function commitRaw(world: World, edits: Edit[], meta: Meta, extra: Partial<ChangeSet> = {}): CommitResult {
  const state = clone(world.state);
  const b = new Builder(state);
  const src: AssignmentSource | undefined = meta.kind === "build" || meta.kind === "repair" || meta.kind === "improve" ? meta.kind : undefined;
  for (const e of edits) {
    const f = applyEdit(b, e, src);
    if (f) return f;
  }
  dropMoot(b);
  const events = b.events.filter((e) => !deepEqual(e.before, e.after));
  if (!events.length) return refuse("Nothing changed.");
  const toldD = toldDeltas(world.journal.told, events);
  const { id, seq } = nextCsId(state);
  const engine = meta.kind === "build" || meta.kind === "repair" || meta.kind === "improve" || meta.kind === "reset";
  const cs: ChangeSet = {
    id, seq, kind: meta.kind,
    label: meta.label ?? (meta.kind === "manual" ? "Placed by you." : meta.kind),
    events,
    ...(toldD.length ? { told: toldD } : {}),
    ...(meta.explanation ? { explanation: meta.explanation } : {}),
    ...(engine ? { engineVersion: ENGINE_VERSION, ruleHashes: ruleHashes(world.state), stateHash: stateHash(world.state) } : {}),
    ...extra,
  };
  const session = { ...world.session };
  if (session.scenario?.parked && events.length) session.scenario = { ...session.scenario, stale: true };
  const journal = { ...world.journal, changeSets: [...world.journal.changeSets, cs], told: applyTold(world.journal.told, toldD, false).told };
  return { world: { state, journal, session }, changeSet: cs };
}

export function commit(world: World, edits: Edit[], meta: Meta): CommitResult {
  const ro = liveReadOnly(world);
  if (ro) return refuse(ro);
  return commitRaw(world, edits, meta);
}

export function undo(world: World, changeSetId: string): CommitResult {
  const ro = liveReadOnly(world);
  if (ro) return refuse(ro);
  const cs = world.journal.changeSets.find((c) => c.id === changeSetId);
  if (!cs) return refuse(`No change set ${changeSetId}`);
  const keys = new Set(cs.events.map((e) => e.key));
  const stuck = cs.events.filter((e) => !deepEqual(readKey(world.state, e.key), e.after));
  if (stuck.length) {
    const stuckKeys = new Set(stuck.map((e) => e.key));
    const later = world.journal.changeSets.filter((c) => c.seq > cs.seq && c.events.some((e) => stuckKeys.has(e.key))).map((c) => c.id);
    return refuse(`Can't undo: later changes touched the same items (${later.join(", ") || "unknown"}).`, { laterChangeSets: later, detail: [...keys].sort(cmp) });
  }
  const state = clone(world.state);
  const inv = invert(cs.events);
  applyEvents(state, inv);
  const { id, seq } = nextCsId(state);
  const t = applyTold(world.journal.told, cs.told ?? [], true);
  const undoCs: ChangeSet = { id, seq, kind: "undo", label: `Undid ${cs.id}: ${cs.label}`, events: inv, reverses: cs.id, ...(t.applied.length ? { told: t.applied } : {}) };
  const session = { ...world.session };
  if (session.scenario?.parked && inv.length) session.scenario = { ...session.scenario, stale: true };
  return { world: { state, journal: { ...world.journal, changeSets: [...world.journal.changeSets, undoCs], told: t.told }, session }, changeSet: undoCs };
}

export function checkpoint(world: World, name: string): World {
  const last = world.journal.changeSets[world.journal.changeSets.length - 1];
  const cp = { name, afterChangeSet: last?.id ?? "", stateHash: stateHash(world.state) };
  const others = world.journal.checkpoints.filter((c) => c.name !== name);
  return { ...world, journal: { ...world.journal, checkpoints: [...others, cp] } };
}

export function revertToCheckpoint(world: World, name: string): CommitResult {
  const ro = liveReadOnly(world);
  if (ro) return refuse(ro);
  const cp = world.journal.checkpoints.find((c) => c.name === name);
  if (!cp) return refuse(`No checkpoint ${name}`);
  const idx = cp.afterChangeSet === "" ? -1 : world.journal.changeSets.findIndex((c) => c.id === cp.afterChangeSet);
  if (cp.afterChangeSet !== "" && idx < 0) return refuse("Checkpoint is not in this history");
  const later = world.journal.changeSets.slice(idx + 1);
  const past = clone(world.state);
  for (const c of later.slice().reverse()) applyEvents(past, invert(c.events));
  if (stateHash(past) !== cp.stateHash) return refuse("History does not reproduce the checkpoint; refusing to revert");
  const keys = new Set<string>();
  for (const c of later) for (const e of c.events) keys.add(e.key);
  const events: DomainEvent[] = [];
  for (const k of [...keys].sort(cmp)) {
    const before = readKey(world.state, k);
    const after = readKey(past, k);
    if (!deepEqual(before, after)) events.push({ type: eventTypeFor(k, before, after), key: k, before: clone(before), after: clone(after) });
  }
  const state = clone(world.state);
  applyEvents(state, events);
  if (!events.length) return refuse("Nothing changed since that checkpoint.");
  const { id, seq } = nextCsId(state);
  // The ledger goes back too, for the entries these change sets wrote and nobody has changed since.
  let told = world.journal.told;
  const toldApplied: ToldDelta[] = [];
  for (const c of later.slice().reverse()) { const t = applyTold(told, c.told ?? [], true); told = t.told; toldApplied.push(...t.applied); }
  const cs: ChangeSet = { id, seq, kind: "revert", label: `Reverted to checkpoint "${name}"`, events, ...(toldApplied.length ? { told: toldApplied } : {}) };
  const session = { ...world.session };
  if (session.scenario?.parked && events.length) session.scenario = { ...session.scenario, stale: true };
  return { world: { state, journal: { ...world.journal, changeSets: [...world.journal.changeSets, cs], told }, session }, changeSet: cs };
}

function eventTypeFor(key: string, before: unknown, after: unknown): EventType {
  const [t] = splitKey(key);
  const verb = before === null ? "add" : after === null ? "remove" : "update";
  const m: Record<string, EventType> = {
    assignment: verb === "add" ? "assignment.place" : verb === "remove" ? "assignment.remove" : "assignment.update",
    override: verb === "add" ? "override.add" : verb === "remove" ? "override.remove" : "override.update",
    unavailability: verb === "add" ? "unavailability.add" : verb === "remove" ? "unavailability.remove" : "unavailability.update",
    dateOverride: after === null ? "dateOverride.clear" : "dateOverride.set",
    requirement: after === null ? "requirement.clear" : "requirement.set",
    standing: verb === "add" ? "standing.add" : verb === "remove" ? "standing.remove" : "standing.update",
    cell: "cell.set", store: "store.set", pharmacist: "pharmacist.set", travel: "travel.set", config: "config.set", built: "built.set",
  };
  return m[t] ?? "config.set";
}

/** Apply edits to a copy of the state without touching any journal. For search and what-if. */
export function applyScratch(state: DomainState, edits: Edit[], src?: AssignmentSource, opts: { skipMoot?: boolean } = {}): DomainState | Refusal {
  // Tables are shallow-copied: rows are replaced, never mutated, so sharing them is safe and much cheaper than a deep clone.
  const st: DomainState = { ...state, nextId: { ...state.nextId } };
  const b = new Builder(st, true);
  for (const e of edits) {
    const f = applyEdit(b, e, src);
    if (f) return f;
  }
  if (!opts.skipMoot) dropMoot(b);
  return st;
}
