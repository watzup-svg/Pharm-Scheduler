// Small helpers shared by the chrome panels (top bar, left panel, Someone's out, proposal bar, Plan).
import { create } from "zustand";
import { addDays, daysInMonth, toDayNumber, weekday, type ChangeSet, type DomainState, type Edit, type Evaluation, type ISODate, type World } from "@domain";
import { useApp } from "../../store.ts";
import type { Issue } from "../../derive.ts";
import { useWallUi } from "../wall/ui.ts";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Tue Oct 6". No locale, no clock. */
export const fmtDate = (d: ISODate): string => `${DOW[weekday(d)]} ${MON[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
/** "Oct 6". */
export const fmtShort = (d: ISODate): string => `${MON[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
export const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;
export const codeOf = (state: DomainState, id: string): string => state.stores[id]?.code ?? id;
export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** A store id list as stored in the To-tell ledger ("S1,S2" or "off") as plain words. */
export function placeWords(state: DomainState, v: string): string {
  if (v === "off") return "off";
  return v.split(",").map((id) => codeOf(state, id)).join(" + ");
}

/** True when keyboard focus is somewhere the person is typing. Shortcuts stay quiet there. */
export function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/** Select a cell and make sure the wall shows its date. */
export function goTo(storeId: string, date: ISODate): void {
  const s = useApp.getState();
  const w = s.window;
  if (date < w.from || date > w.to) {
    const isMonth = w.from.slice(8) === "01" && addDays(w.to, 1).slice(8) === "01";
    if (isMonth) {
      const y = Number(date.slice(0, 4));
      const m = Number(date.slice(5, 7));
      s.setWindow(`${date.slice(0, 7)}-01`, `${date.slice(0, 7)}-${String(daysInMonth(y, m)).padStart(2, "0")}`);
    } else {
      const span = toDayNumber(w.to) - toDayNumber(w.from);
      s.setWindow(date, addDays(date, span));
    }
  }
  s.select({ storeId, date });
  // In the Day view the page follows the problem to its date.
  if (useWallUi.getState().day) useWallUi.getState().setDay(date);
  if (s.view !== "wall") s.setView("wall");
}

/** The change set the top-bar Undo reverses: the newest one that is not an undo and was not already undone. */
export function undoTarget(world: World): ChangeSet | undefined {
  const list = world.journal.changeSets;
  const undone = new Set(list.filter((c) => c.kind === "undo" && c.reverses).map((c) => c.reverses));
  for (let i = list.length - 1; i >= 0; i--) {
    const c = list[i]!;
    if (c.kind !== "undo" && !undone.has(c.id)) return c;
  }
  return undefined;
}

/** Plain words for one edit (what-if lists). */
export function describeEdit(state: DomainState, e: Edit): string {
  const who = (id: string) => state.pharmacists[id]?.name ?? id;
  switch (e.t) {
    case "place": return `Put ${who(e.pharmacistId)} at ${codeOf(state, e.storeId)} on ${fmtDate(e.date)}`;
    case "remove": { const a = state.assignments[e.assignmentId]; return a ? `Take ${who(a.pharmacistId)} off ${codeOf(state, a.storeId)} on ${fmtDate(a.date)}` : "Take someone off a shift"; }
    case "move": { const a = state.assignments[e.assignmentId]; return a ? `Move ${who(a.pharmacistId)} from ${codeOf(state, a.storeId)} to ${codeOf(state, e.toStoreId)} on ${fmtDate(a.date)}` : "Move a shift"; }
    case "swap": { const a = state.assignments[e.assignmentId]; return a ? `Swap ${who(a.pharmacistId)} for ${who(e.toPharmacistId)} at ${codeOf(state, a.storeId)} on ${fmtDate(a.date)}` : "Swap who works a shift"; }
    case "unavail.add": return `${who(e.pharmacistId)} out ${fmtShort(e.first)}${e.last !== e.first ? ` to ${fmtShort(e.last)}` : ""}`;
    case "unavail.update": return "Change a time-off record";
    case "unavail.remove": return "Remove a time-off record";
    case "cell.set": return `Change counts at ${codeOf(state, e.storeId)} on ${fmtDate(e.date)}`;
    case "dateOverride.set": return `Set ${codeOf(state, e.storeId)} to ${e.count} on ${fmtDate(e.date)}`;
    case "dateOverride.clear": return `Clear the special count at ${codeOf(state, e.storeId)} on ${fmtDate(e.date)}`;
    default: return "A change";
  }
}

/** UI-only state for the chrome. Where the last cover search was started, so its options show in one place. */
type Chrome = {
  repairOrigin: "queue" | "out";
  setRepairOrigin(o: "queue" | "out"): void;
  panel: "keys" | "improve" | null;
  setPanel(p: Chrome["panel"]): void;
  /** The Icon guide (File menu, and the Key's "What do these mean?"). */
  guide: boolean;
  setGuide(open: boolean): void;
};
export const useChrome = create<Chrome>((set) => ({
  repairOrigin: "queue",
  setRepairOrigin: (repairOrigin) => set({ repairOrigin }),
  panel: null,
  setPanel: (panel) => set({ panel }),
  guide: false,
  setGuide: (guide) => set({ guide }),
}));

export type Counts = { open: number; problems: number; warnings: number };
/** Open positions, problems and warnings among the issues (already limited to the window, from asOf on). */
export function countsOf(issues: Issue[], ev: Evaluation | null): Counts {
  let open = 0, problems = 0, warnings = 0;
  for (const i of issues) {
    if (i.kind === "open") open += ev?.cells[`${i.storeId}|${i.date}`]?.open ?? 1;
    else if (i.kind === "violation") problems += 1;
    else warnings += 1;
  }
  return { open, problems, warnings };
}

/** Next / previous unresolved problem (a gap, a broken rule or a warning) after the selected cell, from the as-of date on, wrapping around. The issues are already limited to that. */
export function stepIssue(issues: Issue[], state: DomainState, dir: 1 | -1): Issue | undefined {
  const pool = issues;
  if (!pool.length) return undefined;
  const sel = useApp.getState().selection;
  const key = (i: { date: ISODate; storeId: string }) => `${i.date}|${codeOf(state, i.storeId)}`;
  if (!sel?.storeId) return dir === 1 ? pool[0] : pool[pool.length - 1];
  const cur = key({ date: sel.date, storeId: sel.storeId });
  if (dir === 1) return pool.find((i) => key(i) > cur) ?? pool[0];
  for (let i = pool.length - 1; i >= 0; i--) if (key(pool[i]!) < cur) return pool[i];
  return pool[pool.length - 1];
}

/** Move the selection to the next or previous problem. Says so when there is none. */
export function stepProblem(issues: Issue[], state: DomainState, dir: 1 | -1): boolean {
  const next = stepIssue(issues, state, dir);
  if (!next) { useApp.getState().say("info", "No problems to step through."); return false; }
  goTo(next.storeId, next.date);
  return true;
}
