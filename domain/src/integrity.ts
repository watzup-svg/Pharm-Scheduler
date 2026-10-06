// Integrity check: dangling ids and bad shapes. Reports; never repairs (v1 rule).
import { cmp, isValidDate } from "./dates.ts";
import type { DomainState } from "./types.ts";

export type IntegrityIssue = { table: string; key: string; problem: string };

export function checkIntegrity(s: DomainState): IntegrityIssue[] {
  const out: IntegrityIssue[] = [];
  const bad = (table: string, key: string, problem: string) => out.push({ table, key, problem });
  for (const k of Object.keys(s.assignments).sort(cmp)) {
    const a = s.assignments[k]!;
    if (a.id !== k) bad("assignments", k, "key does not match id");
    if (!s.stores[a.storeId]) bad("assignments", k, `unknown store ${a.storeId}`);
    if (!s.pharmacists[a.pharmacistId]) bad("assignments", k, `unknown pharmacist ${a.pharmacistId}`);
    if (!isValidDate(a.date)) bad("assignments", k, `bad date ${a.date}`);
  }
  for (const k of Object.keys(s.overrides).sort(cmp)) {
    if (!s.assignments[s.overrides[k]!.assignmentId]) bad("overrides", k, "override on a missing assignment");
  }
  for (const k of Object.keys(s.unavailability).sort(cmp)) {
    const u = s.unavailability[k]!;
    if (!s.pharmacists[u.pharmacistId]) bad("unavailability", k, `unknown pharmacist ${u.pharmacistId}`);
    if (u.last < u.first) bad("unavailability", k, "last is before first");
    if (u.type === "Turned-down" && (!u.scopeStoreId || u.first !== u.last)) bad("unavailability", k, "Turned-down needs one store and one date");
    if (u.type !== "Turned-down" && u.scopeStoreId) bad("unavailability", k, "only Turned-down has a store");
  }
  for (const k of Object.keys(s.standing).sort(cmp)) {
    const t = s.standing[k]!;
    if (!s.stores[t.storeId] || !s.pharmacists[t.pharmacistId]) bad("standing", k, "unknown store or pharmacist");
  }
  const seen = new Set<string>();
  for (const k of Object.keys(s.assignments).sort(cmp)) {
    const a = s.assignments[k]!;
    const key = `${a.pharmacistId}|${a.storeId}|${a.date}`;
    if (seen.has(key)) bad("assignments", k, "duplicate pharmacist/store/date");
    seen.add(key);
  }
  return out;
}
