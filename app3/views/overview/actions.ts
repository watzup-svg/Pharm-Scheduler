// What a click on the Overview does. Every one is a jump, or opens a preview; nothing here saves to the schedule on its own.
import { api, type ISODate } from "@domain";
import { useApp } from "../../store.ts";
import { record } from "../../diagnostics.ts";
import { goTo, useChrome } from "../chrome/shared.tsx";
import { saveNow } from "../SaveControls.tsx";
import type { Problem, Where } from "./lib.ts";

/** The wall at that date, with the cell selected (and the person, so the Inspector shows their choices). */
export function showOnWall(storeId: string, date: ISODate, pharmacistId?: string): void {
  goTo(storeId, date);
  if (pharmacistId) useApp.getState().select({ storeId, pharmacistId, date });
}
export function showProblem(p: Problem): void { showOnWall(p.storeIds[0]!, p.date, p.kind === "violation" ? p.pharmacistId : undefined); }

/** The wall with the problem list open. */
export function seeAllProblems(): void {
  const s = useApp.getState();
  s.setView("wall");
  s.setDrawer(true, "queue");
}

export function openTimeOff(): void { useApp.getState().setView("timeoff"); }
export function openSetup(tab: "checks" | "stores" | "pharmacists"): void {
  const s = useApp.getState();
  s.setSetupTab(tab);
  s.setView("setup");
}

/** Ask for cover on an open shift. The ways to cover show right here (RepairOptions); Preview opens the proposal. */
export function findCover(p: Problem): void {
  useChrome.getState().setRepairOrigin("queue");
  void useApp.getState().runRepair([{ storeId: p.storeIds[0]!, date: p.date }], false);
}

export function goWhere(w: Where): void {
  const s = useApp.getState();
  switch (w.to) {
    case "setup": openSetup(w.tab); break;
    case "timeoff": openTimeOff(); break;
    case "print": s.setView("print"); break;
    case "tell": s.setView("wall"); s.setDrawer(true, "tell"); break;
    case "problem": if (w.storeId && w.date) showOnWall(w.storeId, w.date); else seeAllProblems(); break;
    case "save": void saveNow(); break;
  }
}

/** Why the preview buttons are off right now, or null. */
export function previewBlocker(): string | null {
  const s = useApp.getState();
  if (s.readOnlyProblems) return "This file opened read-only.";
  if (s.busy) return `${s.busy} is running.`;
  if (s.world?.session.proposal) return "Accept or discard the open preview first.";
  if (s.world?.session.scenario && !s.world.session.scenario.parked) return "A what-if is open.";
  return null;
}

/** Build for the whole month as a preview on the wall. */
export function previewBuild(bounds: { from: ISODate; to: ISODate }): void {
  const s = useApp.getState();
  if (previewBlocker()) return;
  s.setWindow(bounds.from, bounds.to);
  s.setView("wall");
  void s.runBuild(bounds);
}

/** Put everyone back on their usual days for the month, as a preview. Same domain call the wall's reset uses; Accept is the only write. */
export function previewPatterns(bounds: { from: ISODate; to: ISODate }): void {
  const s = useApp.getState();
  const w = s.world;
  const why = previewBlocker();
  if (!w || why) return;
  record("action", `reset to pattern preview ${bounds.from}..${bounds.to}`);
  s.setWindow(bounds.from, bounds.to);
  s.setView("wall");
  const res = api.resetToPattern(w, bounds, null, s.asOf);
  if (!res.proposal) { s.say("info", "Everyone is already on their usual days, so there is nothing to copy."); return; }
  const o = api.openProposal(w, res.proposal);
  if ("refused" in o) s.say("error", o.reason); else useApp.setState({ world: o });
}
