// Integrity check: validates everything evaluate/search/render read. Reports; never repairs (v1 rule). Pure, O(n), never throws on any input shape.
// `fatal` marks problems that make the data unusable (bad shapes, dates, numbers, dangling references): a loader refuses those.
// The rest (duplicates, order, counters) are reported but the data can still be shown and evaluated.
import { cmp, isValidDate } from "./dates.ts";
import type { DomainState, Journal } from "./types.ts";

/** The row kinds a change-set event key can name (the part before the colon). Keep in step with TABLE in changeset.ts. */
const JOURNAL_TABLES = new Set(["config", "store", "pharmacist", "requirement", "dateOverride", "unavailability", "assignment", "override", "cell", "standing", "travel", "built"]);

export type IntegrityIssue = { table: string; key: string; problem: string; fatal?: true };

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const isDate = (v: unknown): v is string => typeof v === "string" && isValidDate(v);
const STATES = ["OR", "WA"];
const STATUS = ["Requested", "Approved", "Actual", "Denied"];
const UTYPE = ["Vacation", "Sick", "Other", "Turned-down"];
const SOURCE = ["pattern", "manual", "build", "repair", "improve", "emergency"];
const RULES = ["availability", "closure", "consecutive-days", "double-booking", "licensing", "travel-hard", "travel-soft"];
const CS_KIND = ["manual", "build", "repair", "improve", "reset", "undo", "revert", "setup", "scenario"];
const COUNTERS = ["store", "pharmacist", "assignment", "override", "unavail", "standing", "seq", "changeSet"] as const;
const own = (o: Rec, k: string) => Object.prototype.hasOwnProperty.call(o, k);

export function checkIntegrity(s: DomainState, journal?: Journal): IntegrityIssue[] {
  const out: IntegrityIssue[] = [];
  const bad = (table: string, key: string, problem: string) => out.push({ table, key, problem, fatal: true });
  const soft = (table: string, key: string, problem: string) => out.push({ table, key, problem });
  if (!isRec(s)) { bad("state", "", "state is not an object"); return out; }
  const st = s as unknown as Rec;
  const tables = {} as Record<string, Rec>;
  for (const t of ["stores", "pharmacists", "requirements", "dateOverrides", "unavailability", "assignments", "overrides", "cellCounts", "standing", "travel", "built"]) {
    if (isRec(st[t])) tables[t] = st[t] as Rec;
    else { bad(t, "", "table is missing or not an object"); tables[t] = {}; }
  }
  const T = tables as Record<"stores" | "pharmacists" | "requirements" | "dateOverrides" | "unavailability" | "assignments" | "overrides" | "cellCounts" | "standing" | "travel" | "built", Rec>;
  const keys = (t: Rec) => Object.keys(t).sort(cmp);
  const hasStore = (id: unknown) => isStr(id) && own(T.stores, id);
  const hasPh = (id: unknown) => isStr(id) && own(T.pharmacists, id);
  const rowOf = (t: string, k: string): Rec | null => {
    const r = T[t as "stores"][k];
    if (isRec(r)) return r;
    bad(t, k, "row is not an object");
    return null;
  };
  const optDate = (t: string, k: string, r: Rec, f: string) => { if (r[f] !== undefined && !isDate(r[f])) bad(t, k, `bad ${f} ${show(r[f])}`); };
  const maxNum = Object.fromEntries(COUNTERS.map((c) => [c, 0])) as Record<(typeof COUNTERS)[number], number>;
  const noteId = (c: (typeof COUNTERS)[number], id: string, prefix: string) => {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(id);
    if (m) maxNum[c] = Math.max(maxNum[c], Number(m[1]));
  };

  for (const k of keys(T.stores)) {
    const r = rowOf("stores", k); if (!r) continue;
    if (r.id !== k) bad("stores", k, "key does not match id");
    if (k.includes("|")) bad("stores", k, "id contains |");
    if (!isStr(r.code) || !isStr(r.name)) bad("stores", k, "code or name is not text");
    if (r.state !== null && !STATES.includes(r.state as string)) bad("stores", k, `bad state ${show(r.state)}`);
    optDate("stores", k, r, "inactiveFrom"); optDate("stores", k, r, "activeFrom");
    noteId("store", k, "S");
  }
  for (const k of keys(T.pharmacists)) {
    const r = rowOf("pharmacists", k); if (!r) continue;
    if (r.id !== k) bad("pharmacists", k, "key does not match id");
    if (k.includes("|")) bad("pharmacists", k, "id contains |");
    if (!isStr(r.name) || !isStr(r.initials)) bad("pharmacists", k, "name or initials is not text");
    if (r.baseStoreId !== null && !hasStore(r.baseStoreId)) bad("pharmacists", k, `unknown base store ${show(r.baseStoreId)}`);
    optDate("pharmacists", k, r, "activeFrom"); optDate("pharmacists", k, r, "inactiveFrom");
    if (r.licenses !== undefined) {
      if (!isRec(r.licenses)) bad("pharmacists", k, "licenses is not a map");
      else for (const c of Object.keys(r.licenses).sort(cmp)) {
        if (!STATES.includes(c)) bad("pharmacists", k, `license for unknown state ${c}`);
        else { const v = r.licenses[c]; if (v !== null && !isDate(v)) bad("pharmacists", k, `bad license expiry ${show(v)} for ${c}`); }
      }
    }
    noteId("pharmacist", k, "P");
  }
  for (const k of keys(T.requirements)) {
    const r = rowOf("requirements", k); if (!r) continue;
    if (!hasStore(r.storeId)) bad("requirements", k, `unknown store ${show(r.storeId)}`);
    if (!isInt(r.weekday) || r.weekday > 6) bad("requirements", k, `bad weekday ${show(r.weekday)}`);
    if (!isDate(r.effectiveFrom)) bad("requirements", k, `bad effectiveFrom ${show(r.effectiveFrom)}`);
    if (!isInt(r.count)) bad("requirements", k, `bad count ${show(r.count)}`);
    if (k !== `${String(r.storeId)}|${String(r.weekday)}|${String(r.effectiveFrom)}`) bad("requirements", k, "key does not match store, weekday and date");
  }
  for (const k of keys(T.dateOverrides)) {
    const r = rowOf("dateOverrides", k); if (!r) continue;
    if (!hasStore(r.storeId)) bad("dateOverrides", k, `unknown store ${show(r.storeId)}`);
    if (!isDate(r.date)) bad("dateOverrides", k, `bad date ${show(r.date)}`);
    if (!isInt(r.count)) bad("dateOverrides", k, `bad count ${show(r.count)}`);
    if (r.note !== undefined && !isStr(r.note)) bad("dateOverrides", k, "note is not text");
    if (k !== `${String(r.storeId)}|${String(r.date)}`) bad("dateOverrides", k, "key does not match store and date");
  }
  for (const k of keys(T.cellCounts)) {
    const r = rowOf("cellCounts", k); if (!r) continue;
    if (!hasStore(r.storeId)) bad("cellCounts", k, `unknown store ${show(r.storeId)}`);
    if (!isDate(r.date)) bad("cellCounts", k, `bad date ${show(r.date)}`);
    if (!isInt(r.locum) || !isInt(r.acceptedShort)) bad("cellCounts", k, "locum or acceptedShort is not a count");
    if (k !== `${String(r.storeId)}|${String(r.date)}`) bad("cellCounts", k, "key does not match store and date");
  }
  for (const k of keys(T.travel)) {
    const r = rowOf("travel", k); if (!r) continue;
    if (!hasStore(r.fromStoreId) || !hasStore(r.toStoreId)) bad("travel", k, "unknown store");
    if (!isInt(r.minutes)) bad("travel", k, `bad minutes ${show(r.minutes)}`);
    if (!isNum(r.miles)) bad("travel", k, `bad miles ${show(r.miles)}`);
    if (k !== `${String(r.fromStoreId)}|${String(r.toStoreId)}`) bad("travel", k, "key does not match stores");
  }
  for (const k of keys(T.built)) {
    if (!isDate(k)) bad("built", k, "bad date");
    if (T.built[k] !== true) bad("built", k, "value is not true");
  }
  for (const k of keys(T.assignments)) {
    const a = rowOf("assignments", k); if (!a) continue;
    if (a.id !== k) bad("assignments", k, "key does not match id");
    if (!hasStore(a.storeId)) bad("assignments", k, `unknown store ${show(a.storeId)}`);
    if (!hasPh(a.pharmacistId)) bad("assignments", k, `unknown pharmacist ${show(a.pharmacistId)}`);
    if (!isDate(a.date)) bad("assignments", k, `bad date ${show(a.date)}`);
    if (!isInt(a.placedSeq)) bad("assignments", k, `bad placedSeq ${show(a.placedSeq)}`);
    if (!SOURCE.includes(a.source as string)) bad("assignments", k, `bad source ${show(a.source)}`);
    if (typeof a.agreed !== "boolean" || typeof a.pinned !== "boolean") bad("assignments", k, "agreed or pinned is not true/false");
    noteId("assignment", k, "A");
    if (isInt(a.placedSeq)) maxNum.seq = Math.max(maxNum.seq, a.placedSeq);
  }
  for (const k of keys(T.overrides)) {
    const o = rowOf("overrides", k); if (!o) continue;
    if (o.id !== k) bad("overrides", k, "key does not match id");
    if (!isStr(o.assignmentId) || !own(T.assignments, o.assignmentId)) bad("overrides", k, "override on a missing assignment");
    if (!isStr(o.ruleId) || !isStr(o.signature) || !isStr(o.reason)) bad("overrides", k, "ruleId, signature or reason is not text");
    else if (!RULES.includes(o.ruleId)) soft("overrides", k, `unknown rule ${o.ruleId}`);
    noteId("override", k, "O");
  }
  for (const k of keys(T.unavailability)) {
    const u = rowOf("unavailability", k); if (!u) continue;
    if (u.id !== k) bad("unavailability", k, "key does not match id");
    if (!hasPh(u.pharmacistId)) bad("unavailability", k, `unknown pharmacist ${show(u.pharmacistId)}`);
    const okFirst = isDate(u.first), okLast = isDate(u.last);
    if (!okFirst) bad("unavailability", k, `bad first ${show(u.first)}`);
    if (!okLast) bad("unavailability", k, `bad last ${show(u.last)}`);
    if (okFirst && okLast && (u.last as string) < (u.first as string)) soft("unavailability", k, "last is before first");
    if (!STATUS.includes(u.status as string)) bad("unavailability", k, `bad status ${show(u.status)}`);
    if (!UTYPE.includes(u.type as string)) bad("unavailability", k, `bad type ${show(u.type)}`);
    if (u.scopeStoreId !== undefined && !hasStore(u.scopeStoreId)) bad("unavailability", k, `unknown store ${show(u.scopeStoreId)}`);
    if (u.type === "Turned-down" && (!u.scopeStoreId || u.first !== u.last)) soft("unavailability", k, "Turned-down needs one store and one date");
    if (u.type !== "Turned-down" && u.scopeStoreId) soft("unavailability", k, "only Turned-down has a store");
    noteId("unavail", k, "U");
  }
  for (const k of keys(T.standing)) {
    const t = rowOf("standing", k); if (!t) continue;
    if (t.id !== k) bad("standing", k, "key does not match id");
    if (!hasStore(t.storeId) || !hasPh(t.pharmacistId)) bad("standing", k, "unknown store or pharmacist");
    if (!isDate(t.effectiveFrom)) bad("standing", k, `bad effectiveFrom ${show(t.effectiveFrom)}`);
    optDate("standing", k, t, "effectiveTo");
    const r = t.recurrence;
    if (!isRec(r)) bad("standing", k, "recurrence is missing");
    else {
      if (!Array.isArray(r.weekdays) || r.weekdays.length > 7 || !r.weekdays.every((w) => isInt(w) && w <= 6)) bad("standing", k, "weekdays must be a list of 0-6");
      if (![1, 2, 3, 4].includes(r.cycleWeeks as number)) bad("standing", k, `bad cycleWeeks ${show(r.cycleWeeks)}`);
      if (!isDate(r.anchor)) bad("standing", k, `bad anchor ${show(r.anchor)}`);
      if (r.nth !== undefined && (!Array.isArray(r.nth) || r.nth.length > 5 || !r.nth.every((n) => isInt(n) && n >= 1 && n <= 5))) bad("standing", k, "nth must be a list of 1-5");
    }
    noteId("standing", k, "T");
  }
  const seen = new Set<string>();
  for (const k of keys(T.assignments)) {
    const a = T.assignments[k];
    if (!isRec(a)) continue;
    const key = `${String(a.pharmacistId)}|${String(a.storeId)}|${String(a.date)}`;
    if (seen.has(key)) soft("assignments", k, "duplicate pharmacist/store/date");
    seen.add(key);
  }

  const c = st.config;
  if (!isRec(c)) bad("config", "", "config is missing");
  else {
    for (const f of ["travelSoftMinutes", "travelHardMinutes", "maxConsecutiveDays", "searchNodeLimit"]) if (!isInt(c[f])) bad("config", f, `${f} must be a whole number, 0 or more`);
    if (!isNum(c.mileageFreeMiles)) bad("config", "mileageFreeMiles", "mileageFreeMiles must be a number, 0 or more");
    const im = c.improve;
    if (!isRec(im)) bad("config", "improve", "improve is missing");
    else for (const f of ["minRestoredStanding", "minTravelSavedMinutes", "maxChanged", "excludeNextDays"]) if (!isInt(im[f])) bad("config", `improve.${f}`, `${f} must be a whole number, 0 or more`);
    if (!Array.isArray(c.mileageRates)) bad("config", "mileageRates", "mileageRates is not a list");
    else c.mileageRates.forEach((m, i) => { if (!isRec(m) || !isDate(m.effectiveFrom) || !isNum(m.centsPerMile)) bad("config", `mileageRates.${i}`, "bad mileage rate"); });
  }
  const n = st.nextId;
  if (!isRec(n)) bad("nextId", "", "counters are missing");
  else for (const f of COUNTERS) {
    if (!isInt(n[f])) bad("nextId", f, `counter ${f} is not a whole number`);
    else if (f !== "store" && f !== "pharmacist" && f !== "changeSet" && (n[f] as number) <= maxNum[f]) soft("nextId", f, `counter ${f} (${n[f]}) is not above the highest existing ${f === "seq" ? "sequence" : "id"} ${maxNum[f]}`);
  }

  if (journal !== undefined) checkJournal(journal, n, bad, soft);
  return out;
}

function checkJournal(j: unknown, n: unknown, bad: (t: string, k: string, p: string) => void, soft: (t: string, k: string, p: string) => void): void {
  if (!isRec(j)) { bad("journal", "", "journal is missing"); return; }
  let maxCs = 0;
  if (!Array.isArray(j.changeSets)) bad("journal", "changeSets", "not a list");
  else {
    const ids = new Set<string>();
    let prev = 0;
    j.changeSets.forEach((c, i) => {
      const k = String(i);
      if (!isRec(c)) { bad("journal", k, "change set is not an object"); return; }
      if (!isStr(c.id) || !isInt(c.seq) || !isStr(c.label) || !Array.isArray(c.events) || !CS_KIND.includes(c.kind as string)) { bad("journal", k, "change set has a bad id, seq, kind, label or events"); return; }
      if (ids.has(c.id)) bad("journal", c.id, "duplicate change set id");
      ids.add(c.id);
      if (c.seq <= prev) soft("journal", c.id, "change sets are not in increasing order");
      prev = c.seq;
      maxCs = Math.max(maxCs, c.seq);
      for (const e of c.events) if (!isRec(e) || !isStr(e.type) || !isStr(e.key) || !JOURNAL_TABLES.has(e.key.slice(0, e.key.indexOf(":")))) { bad("journal", c.id, "an event has a bad type or key"); break; }
      if (c.told !== undefined && (!Array.isArray(c.told) || !c.told.every((t) => isRec(t) && isStr(t.key)))) bad("journal", c.id, "bad told entries");
    });
  }
  if (!Array.isArray(j.snapshots)) bad("journal", "snapshots", "not a list");
  else j.snapshots.forEach((p, i) => {
    const k = `snapshot ${i}`;
    if (!isRec(p) || !isInt(p.revision) || !isDate(p.postedOn) || !isDate(p.from) || !isDate(p.to)) { bad("journal", k, "bad revision or dates"); return; }
    if (!isRec(p.cells) || !isRec(p.placements) || !isRec(p.warnings)) bad("journal", k, "cells, placements or warnings missing");
    else for (const ck of Object.keys(p.cells)) { const v = p.cells[ck]; if (!isRec(v) || !Array.isArray(v.initials) || !isInt(v.required)) { bad("journal", k, `bad cell ${ck}`); break; } }
  });
  if (!isRec(j.told)) bad("journal", "told", "not a map");
  else for (const k of Object.keys(j.told)) {
    const d = k.slice(k.indexOf("|") + 1);
    if (!k.includes("|") || !isDate(d)) bad("journal", `told ${k}`, "bad key");
    else if (!isStr(j.told[k])) bad("journal", `told ${k}`, "value is not text");
  }
  if (!Array.isArray(j.checkpoints)) bad("journal", "checkpoints", "not a list");
  else j.checkpoints.forEach((c, i) => { if (!isRec(c) || !isStr(c.name) || !isStr(c.afterChangeSet) || !isStr(c.stateHash)) bad("journal", `checkpoint ${i}`, "bad checkpoint"); });
  if (isRec(n) && isInt(n.changeSet) && n.changeSet <= maxCs) soft("nextId", "changeSet", `counter changeSet (${n.changeSet}) is not above the highest change set ${maxCs}`);
}

function show(v: unknown): string {
  const t = typeof v === "string" ? v : JSON.stringify(v) ?? String(v);
  return t.length > 40 ? `${t.slice(0, 40)}...` : t;
}
