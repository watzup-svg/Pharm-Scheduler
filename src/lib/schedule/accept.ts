import { monthName, weekdayShort } from "./calendar.ts";
import { shortStoreName } from "./fix.ts";
import { doubleKey, evaluate, holeKey, leftoverKey } from "./rules.ts";
import type { Accepted, Evaluation, ScheduleDoc } from "./types.ts";

export type AcceptedItem = {
  key: string;
  kind: "hole" | "leftover" | "double";
  store: string;
  name: string;
  day: number;
  at: string;
  label: string;
};

function parseKey(key: string): { kind: AcceptedItem["kind"]; a: string; day: number } | null {
  const m = /^(hole|leftover|double)\|(.+)\|(\d+)$/.exec(key);
  return m ? { kind: m[1] as AcceptedItem["kind"], a: m[2]!, day: Number(m[3]) } : null;
}

/** Accept problems in one step. Keys that are not acceptable (anything about licenses) are ignored. */
export function acceptKeys(doc: ScheduleDoc, keys: string[], now = new Date()): ScheduleDoc {
  const have = new Set((doc.accepted ?? []).map((a) => a.key));
  const fresh: Accepted[] = keys.filter((k) => parseKey(k) && !have.has(k)).map((key) => ({ key, at: now.toISOString() }));
  return fresh.length ? { ...doc, accepted: [...(doc.accepted ?? []), ...fresh] } : doc;
}

export function unacceptKeys(doc: ScheduleDoc, keys: string[]): ScheduleDoc {
  const drop = new Set(keys);
  const next = (doc.accepted ?? []).filter((a) => !drop.has(a.key));
  if (next.length === (doc.accepted ?? []).length) return doc;
  const { accepted: _old, ...rest } = doc;
  return next.length ? { ...rest, accepted: next } : rest;
}

/** Drop accepts whose problem is gone. If the problem comes back later it is a new problem and needs a new decision. */
export function pruneAccepted(doc: ScheduleDoc, ev: Evaluation = evaluate(doc)): ScheduleDoc {
  if (!doc.accepted?.length) return doc;
  const live = new Set(ev.problemKeys);
  return unacceptKeys(doc, doc.accepted.filter((a) => !live.has(a.key)).map((a) => a.key));
}

/** Every problem that still blocks, as keys to accept. Licenses are never here. */
export function openProblemKeys(doc: ScheduleDoc, ev: Evaluation = evaluate(doc)): string[] {
  const out: string[] = [];
  for (const i of ev.issues) {
    if (i.hole) out.push(holeKey(i.store, i.day));
    if (i.leftover) out.push(leftoverKey(i.store, i.day));
  }
  for (const [d, names] of Object.entries(ev.doubledByDay)) for (const n of names) out.push(doubleKey(n, Number(d)));
  return [...new Set(out)];
}

/** What has been accepted, in date order, with a plain sentence for each. */
export function acceptedItems(doc: ScheduleDoc, ev: Evaluation = evaluate(doc)): AcceptedItem[] {
  const live = new Set(ev.problemKeys);
  const out: AcceptedItem[] = [];
  for (const a of doc.accepted ?? []) {
    const p = parseKey(a.key);
    if (!p || !live.has(a.key)) continue;
    const when = `${weekdayShort(doc.year, doc.month, p.day)} ${monthName(doc.year, doc.month).slice(0, 3)} ${p.day}`;
    if (p.kind === "double") {
      out.push({ key: a.key, kind: "double", store: "", name: p.a, day: p.day, at: a.at, label: `${p.a} at two stores, ${when}` });
    } else {
      const store = doc.stores.find((s) => s.code === p.a);
      const nm = shortStoreName(store?.name ?? p.a);
      out.push({ key: a.key, kind: p.kind, store: p.a, name: "", day: p.day, at: a.at, label: p.kind === "hole" ? `${nm}: no coverage (no pharmacist), ${when}` : `${nm}: name on a closed day, ${when}` });
    }
  }
  return out.sort((x, y) => x.day - y.day || x.label.localeCompare(y.label));
}
