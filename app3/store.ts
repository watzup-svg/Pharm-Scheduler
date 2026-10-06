// The one app store. The domain world is the truth; everything else here is view state.
// All writes go through api.commit (or a proposal/scenario) so the domain stays the only gate.
import { create } from "zustand";
import {
  addDays, api, applyScratch, weekday, type ChangeSet, type Edit, type ISODate, type Proposal, type RepairOption, type RepairResult, type World,
} from "@domain";
import { getPersist } from "./persist-bridge.ts";
import { todayISO } from "./clock.ts";

export type View = "wall" | "plan" | "setup" | "rules" | "travel" | "checks" | "print";
export type Axis = "store" | "pharmacist";
export type LeftTab = "queue" | "tell" | "history";
export type Selection = { storeId?: string; pharmacistId?: string; date: ISODate } | null;
export type Notice = { id: number; kind: "info" | "ok" | "error"; text: string };

let noticeId = 0;

export type AppState = {
  world: World | null;
  fileName: string | null;
  /** The domain's "as of" date. Today by default; the DM can move it to look back or ahead. */
  asOf: ISODate;
  window: { from: ISODate; to: ISODate };
  axis: Axis;
  view: View;
  leftTab: LeftTab;
  selection: Selection;
  notice: Notice | null;
  repairResult: { gaps: { storeId: string; date: ISODate }[]; wider: boolean; result: RepairResult } | null;
  /** When a file opened read-only because the data is inconsistent. */
  readOnlyProblems: string[] | null;

  // view state
  setView(v: View): void;
  setAxis(a: Axis): void;
  setLeftTab(t: LeftTab): void;
  select(s: Selection): void;
  setWindow(from: ISODate, to: ISODate): void;
  shiftWindow(days: number): void;
  setAsOf(d: ISODate): void;
  say(kind: Notice["kind"], text: string): void;
  clearNotice(): void;

  // world
  setWorld(world: World, opts?: { fileName?: string | null; readOnlyProblems?: string[] | null }): void;
  /** One manual change set. Returns true if it went through; otherwise a notice says why. */
  commit(edits: Edit[], label?: string): boolean;
  undo(changeSetId: string): boolean;
  checkpoint(name: string): void;
  revert(name: string): boolean;

  // engine
  runBuild(range?: { from: ISODate; to: ISODate }): void;
  runImprove(includeNext14?: boolean): void;
  runRepair(gaps: { storeId: string; date: ISODate }[], wider?: boolean): void;
  previewRepair(option: RepairOption): void;
  acceptProposal(): boolean;
  discardProposal(): void;

  // scenarios
  openScenario(name: string): void;
  scenarioEdit(edits: Edit[]): void;
  parkScenario(): void;
  discardScenario(): void;

  // posting
  post(range?: { from: ISODate; to: ISODate }): void;
  markTold(entries: { pharmacistId: string; date: ISODate }[]): void;
};

function monthWindow(d: ISODate): { from: ISODate; to: ISODate } {
  const [y, m] = [Number(d.slice(0, 4)), Number(d.slice(5, 7))];
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { from: `${d.slice(0, 7)}-01`, to: addDays(next, -1) };
}

export const useApp = create<AppState>((set, get) => {
  const world = () => {
    const w = get().world;
    if (!w) throw new Error("no schedule open");
    return w;
  };
  const record = (w: World, cs: ChangeSet) => {
    getPersist().recordCommit(w, cs).catch((e) => get().say("error", `Could not keep a browser copy: ${String(e?.message ?? e)}`));
  };
  const blocked = (): string | null => (get().readOnlyProblems ? "This file opened read-only because some data is inconsistent." : null);
  const apply = (r: { world: World; changeSet: ChangeSet } | { refused: true; reason: string }): boolean => {
    if ("refused" in r) {
      get().say("error", r.reason);
      return false;
    }
    set({ world: r.world, repairResult: null });
    record(r.world, r.changeSet);
    return true;
  };

  return {
    world: null,
    fileName: null,
    asOf: todayISO(),
    window: monthWindow(todayISO()),
    axis: "store",
    view: "wall",
    leftTab: "queue",
    selection: null,
    notice: null,
    repairResult: null,
    readOnlyProblems: null,

    setView: (view) => set({ view }),
    setAxis: (axis) => set({ axis }),
    setLeftTab: (leftTab) => set({ leftTab }),
    select: (selection) => set({ selection }),
    setWindow: (from, to) => set({ window: { from, to } }),
    shiftWindow: (days) => set((s) => ({ window: { from: addDays(s.window.from, days), to: addDays(s.window.to, days) } })),
    setAsOf: (asOf) => set({ asOf }),
    say: (kind, text) => set({ notice: { id: ++noticeId, kind, text } }),
    clearNotice: () => set({ notice: null }),

    setWorld: (w, opts = {}) => set({ world: w, fileName: opts.fileName ?? get().fileName, readOnlyProblems: opts.readOnlyProblems ?? null, repairResult: null, selection: null }),

    commit: (edits, label) => {
      const ro = blocked();
      if (ro) { get().say("error", ro); return false; }
      return apply(api.commit(world(), edits, { kind: "manual", ...(label ? { label } : {}) }));
    },
    undo: (id) => apply(api.undo(world(), id)),
    checkpoint: (name) => {
      const w = api.checkpoint(world(), name);
      set({ world: w });
      // A checkpoint is part of the journal; keep the browser copy current.
      getPersist().adopt(w).catch(() => {});
      get().say("ok", `Checkpoint "${name}" saved.`);
    },
    revert: (name) => apply(api.revertToCheckpoint(world(), name)),

    runBuild: (range) => {
      const s = get();
      const r = range ?? s.window;
      const res = api.build(world(), r, s.asOf);
      if (!res.proposal) { s.say("info", `Build found nothing to do. ${res.report.unresolvedGaps.length} gap(s) left open.`); return; }
      const o = api.openProposal(world(), res.proposal);
      if ("refused" in o) { s.say("error", o.reason); return; }
      set({ world: o });
    },
    runImprove: (includeNext14) => {
      const s = get();
      const res = api.improve(world(), { from: s.window.from, to: s.window.to, ...(includeNext14 ? { includeNext14 } : {}) }, s.asOf);
      if (!res.proposal) { s.say("info", res.message); return; }
      const o = api.openProposal(world(), res.proposal);
      if ("refused" in o) { s.say("error", o.reason); return; }
      set({ world: o });
    },
    runRepair: (gaps, wider = false) => {
      const s = get();
      const result = api.repair(world(), gaps, { wider, showNearMiss: true }, s.asOf);
      set({ repairResult: { gaps, wider, result } });
    },
    previewRepair: (option) => {
      const w = world();
      const p: Proposal = {
        kind: "repair", label: "Repair", edits: option.edits, explanation: option.explanation,
        stateHash: api.stateHash(w.state), engineVersion: "v3.0",
      };
      const o = api.openProposal(w, p);
      if ("refused" in o) { get().say("error", o.reason); return; }
      set({ world: o });
    },
    acceptProposal: () => {
      const ok = apply(api.acceptProposal(world()));
      return ok;
    },
    discardProposal: () => set({ world: api.discardProposal(world()) }),

    openScenario: (name) => {
      const o = api.openScenario(world(), name);
      if ("refused" in o) get().say("error", o.reason); else set({ world: o });
    },
    scenarioEdit: (edits) => {
      const o = api.scenarioEdit(world(), edits);
      if ("refused" in o) get().say("error", o.reason); else set({ world: o });
    },
    parkScenario: () => set({ world: api.parkScenario(world()) }),
    discardScenario: () => set({ world: api.discardScenario(world()) }),

    post: (range) => {
      const s = get();
      const r = range ?? s.window;
      const res = api.post(world(), r, s.asOf);
      set({ world: res.world });
      getPersist().adopt(res.world).catch(() => {});
      const w = res.snapshot.warnings;
      s.say("ok", `Posted revision ${res.snapshot.revision}.${w.open || w.violations ? ` Posted with ${w.open} open and ${w.violations} problem(s).` : ""}`);
    },
    markTold: (entries) => {
      const w = api.markTold(world(), entries as never);
      set({ world: w });
      getPersist().adopt(w).catch(() => {});
    },
  };
});

/** Weekday helper for headers. 0 = Sunday. */
export const dow = (d: ISODate): number => weekday(d);
export { applyScratch };
