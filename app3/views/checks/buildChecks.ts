// Setup Check: data gaps that make the schedule less trustworthy. Pure; it only lists, it never blocks anything.
import { addDays, api, checkIntegrity, cmp, dateRange, expectedOn, RULE_BY_ID, standingMatches, type DomainState, type ISODate } from "@domain";
import type { View } from "../../store.ts";
import { pharmacistActiveOn, storeActiveOn, shortDate } from "../travel/travel-util.ts";

export type CheckFix = { label: string; view: View; select?: { storeId?: string; pharmacistId?: string; date: ISODate } };
export type CheckItem = {
  id: string;
  severity: "serious" | "warning" | "info";
  text: string;
  fix: CheckFix;
};

/** How far ahead the checks look for placements and patterns. */
export const LOOKAHEAD_DAYS = 56;

const list = (xs: string[]): string => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export function buildChecks(state: DomainState, asOf: ISODate, win: { from: ISODate; to: ISODate }): CheckItem[] {
  const out: CheckItem[] = [];
  const end = addDays(asOf, LOOKAHEAD_DAYS - 1);
  const code = (id: string) => state.stores[id]?.code ?? id;
  const name = (id: string) => state.pharmacists[id]?.name ?? id;
  const phs = Object.values(state.pharmacists).sort((a, b) => cmp(a.name, b.name) || cmp(a.id, b.id));
  const stores = Object.values(state.stores).sort((a, b) => cmp(a.code, b.code) || cmp(a.id, b.id));

  // Data that does not hold together (dangling ids and the like). Serious, listed first.
  for (const i of checkIntegrity(state)) {
    out.push({ id: `integrity|${i.table}|${i.key}|${i.problem}`, severity: "serious", text: `Data problem in ${i.table} ${i.key}: ${i.problem}.`, fix: { label: "Open Setup", view: "setup" } });
  }

  // Pharmacists
  for (const p of phs) {
    if (!pharmacistActiveOn(p, asOf)) continue;
    if (p.licenses === undefined) out.push({ id: `lic|${p.id}`, severity: "warning", text: `${p.name}: licenses are not recorded, so their shifts cannot be checked for licensing.`, fix: { label: "Record licenses", view: "setup" } });
    if (!p.baseStoreId) out.push({ id: `base|${p.id}`, severity: "warning", text: `${p.name} has no base store, so drive times and mileage cannot be worked out for them.`, fix: { label: "Set base store", view: "setup" } });
  }

  // Stores
  for (const s of stores) {
    if (!storeActiveOn(s, asOf)) continue;
    if (s.state === null) out.push({ id: `state|${s.id}`, severity: "warning", text: `${s.code} (${s.name}) has no state, so licensing is not checked there.`, fix: { label: "Set state", view: "setup" } });
    const needs = [1, 2, 3, 4, 5].some((wd) => {
      let n = 0, from = "";
      for (const r of Object.values(state.requirements)) if (r.storeId === s.id && r.weekday === wd && r.effectiveFrom <= asOf && r.effectiveFrom >= from) { n = r.count; from = r.effectiveFrom; }
      return n > 0;
    });
    if (!needs) out.push({ id: `req0|${s.id}`, severity: "warning", text: `${s.code} needs nobody on any weekday, so it can never show a gap.`, fix: { label: "Open Setup", view: "setup" } });
  }

  // Unknown drive time for stores a pharmacist is placed at in the next 8 weeks
  const unk = new Map<string, { from: string; to: string; names: Set<string>; dates: Set<ISODate> }>();
  for (const a of Object.values(state.assignments)) {
    if (a.date < asOf || a.date > end) continue;
    const base = state.pharmacists[a.pharmacistId]?.baseStoreId;
    if (!base || base === a.storeId || state.travel[`${base}|${a.storeId}`]) continue;
    const k = `${base}|${a.storeId}`;
    const cur = unk.get(k) ?? { from: base, to: a.storeId, names: new Set<string>(), dates: new Set<ISODate>() };
    cur.names.add(name(a.pharmacistId));
    cur.dates.add(a.date);
    unk.set(k, cur);
  }
  for (const [k, u] of [...unk].sort((a, b) => cmp(code(a[1].from), code(b[1].from)) || cmp(code(a[1].to), code(b[1].to)))) {
    out.push({ id: `travel|${k}`, severity: "warning", text: `Drive time ${code(u.from)} to ${code(u.to)} is not known. ${list([...u.names].sort(cmp))} placed there on ${u.dates.size} ${u.dates.size === 1 ? "day" : "days"} in the next 8 weeks.`, fix: { label: "Add drive time", view: "travel" } });
  }

  // Patterns: conflicts, and patterns whose pharmacist or store goes inactive
  const conflicts = new Map<string, { pharmacistId: string; stores: string[]; dates: ISODate[] }>();
  for (const date of dateRange(asOf, end)) {
    const byPh = new Map<string, Set<string>>();
    for (const e of expectedOn(state, date)) byPh.set(e.pharmacistId, (byPh.get(e.pharmacistId) ?? new Set<string>()).add(e.storeId));
    for (const [pid, set] of byPh) {
      if (set.size < 2) continue;
      const stores2 = [...set].sort(cmp);
      const k = `${pid}|${stores2.join(",")}`;
      const cur = conflicts.get(k) ?? { pharmacistId: pid, stores: stores2, dates: [] };
      cur.dates.push(date);
      conflicts.set(k, cur);
    }
  }
  for (const [k, c] of [...conflicts].sort((a, b) => cmp(a[0], b[0]))) {
    out.push({ id: `conflict|${k}`, severity: "warning", text: `The pattern puts ${name(c.pharmacistId)} at ${list(c.stores.map(code))} on the same day (${c.dates.length} ${c.dates.length === 1 ? "day" : "days"} in the next 8 weeks, first ${shortDate(c.dates[0]!)}). Build skips both until you fix it.`, fix: { label: "Open patterns", view: "setup" } });
  }
  for (const t of Object.values(state.standing).sort((a, b) => cmp(a.id, b.id))) {
    const p = state.pharmacists[t.pharmacistId], s = state.stores[t.storeId];
    if (!p || !s) continue; // dangling ids are reported by the integrity check
    for (const date of dateRange(asOf, end)) {
      if (!standingMatches(t, date)) continue;
      const who = !pharmacistActiveOn(p, date) ? `${p.name} is` : !storeActiveOn(s, date) ? `${s.code} is` : "";
      if (!who) continue;
      out.push({ id: `inactive|${t.id}`, severity: "warning", text: `A pattern for ${p.name} at ${s.code} still applies on ${shortDate(date)}, but ${who} not active then.`, fix: { label: "Open patterns", view: "setup" } });
      break;
    }
  }

  // Evaluation-based checks
  const ev = api.evaluate(state, asOf);
  let unverified = 0;
  const doubles = new Map<string, { pharmacistId: string; date: ISODate; stores: Set<string> }>();
  for (const a of Object.values(state.assignments).sort((x, y) => cmp(x.date, y.date) || cmp(x.id, y.id))) {
    const e = ev.assignments[a.id];
    if (!e) continue;
    if (a.date >= win.from && a.date <= win.to && a.date >= asOf && e.unverified) unverified += 1;
    if (a.date < asOf) continue;
    for (const r of e.results) {
      if (r.outdated) {
        out.push({
          id: `outdated|${a.id}|${r.ruleId}`, severity: "warning",
          text: `The override on "${RULE_BY_ID[r.ruleId]?.message ?? r.ruleId}" for ${name(a.pharmacistId)} at ${code(a.storeId)} on ${shortDate(a.date)} no longer matches what the schedule shows. Look at it again.`,
          fix: { label: "Show on the wall", view: "wall", select: { storeId: a.storeId, pharmacistId: a.pharmacistId, date: a.date } },
        });
      }
      if (r.ruleId === "double-booking" && r.verdict === "Fail" && !r.overridden && a.date <= end && a.source === "pattern") {
        const k = `${a.pharmacistId}|${a.date}`;
        const cur = doubles.get(k) ?? { pharmacistId: a.pharmacistId, date: a.date, stores: new Set<string>() };
        for (const x of Object.values(state.assignments)) if (x.pharmacistId === a.pharmacistId && x.date === a.date) cur.stores.add(x.storeId);
        doubles.set(k, cur);
      }
    }
  }
  for (const d of [...doubles.values()].sort((a, b) => cmp(a.date, b.date) || cmp(a.pharmacistId, b.pharmacistId))) {
    out.push({
      id: `double|${d.pharmacistId}|${d.date}`, severity: "warning",
      text: `${name(d.pharmacistId)} is booked at ${list([...d.stores].sort(cmp).map(code))} on ${shortDate(d.date)}, and one of those came from a pattern.`,
      fix: { label: "Show on the wall", view: "wall", select: { pharmacistId: d.pharmacistId, date: d.date } },
    });
  }
  if (unverified > 0) {
    out.push({ id: "unverified", severity: "info", text: `${unverified} ${unverified === 1 ? "assignment" : "assignments"} in the dates on screen cannot be fully checked, because something needed to check them (usually licenses) is not recorded. They still count.`, fix: { label: "Record licenses", view: "setup" } });
  }

  const rank = { serious: 0, warning: 1, info: 2 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

