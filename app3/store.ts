// The one app store. The domain world is the truth; everything else here is view state.
// All writes go through api.commit (or a proposal/scenario) so the domain stays the only gate.
import { create } from "zustand";
import {
  addDays, api, applyScratch, weekday, type ChangeSet, type Edit, type ISODate, type Proposal, type RepairOption, type RepairResult, type World,
} from "@domain";
import { getPersist } from "./persist-bridge.ts";
import { todayISO } from "./clock.ts";
import { callEngine, isCancel } from "./engine.ts";
import { record as diag, setContext } from "./diagnostics.ts";
import { describeEdits } from "./copy.ts";

/** The screens. Travel, Rules and Checks are tabs inside Setup; setView still accepts their old names and routes there. */
export type Screen = "overview" | "wall" | "ahead" | "plan" | "timeoff" | "setup" | "print";
export type SetupTab = "stores" | "pharmacists" | "patterns" | "holidays" | "dates" | "travel" | "rules" | "checks";
export type View = Screen | "travel" | "rules" | "checks";
export type Axis = "store" | "pharmacist";
export type LeftTab = "queue" | "history" | "months";
export type Selection = { storeId?: string; pharmacistId?: string; date: ISODate } | null;
export type Notice = { id: number; kind: "info" | "ok" | "error"; text: string; /** A change set this line can undo. */ undoId?: string };

let noticeId = 0;

export type AppState = {
  world: World | null;
  fileName: string | null;
  /** The domain's "as of" date. Today by default; the DM can move it to look back or ahead. */
  asOf: ISODate;
  window: { from: ISODate; to: ISODate };
  axis: Axis;
  view: Screen;
  setupTab: SetupTab;
  /** The queue / history drawer on the left. Closed by default. */
  drawer: boolean;
  /** The Someone's out form in the right column. */
  outForm: boolean;
  leftTab: LeftTab;
  selection: Selection;
  notice: Notice | null;
  repairResult: { gaps: { storeId: string; date: ISODate }[]; wider: boolean; result: RepairResult } | null;
  /** When a file opened read-only because the data is inconsistent. */
  readOnlyProblems: string[] | null;
  /** Name of the search running right now (Build, Improve, Find cover), or null. */
  busy: string | null;

  // view state
  setView(v: View): void;
  setSetupTab(t: SetupTab): void;
  setDrawer(open: boolean, tab?: LeftTab): void;
  setOutForm(open: boolean): void;
  setAxis(a: Axis): void;
  setLeftTab(t: LeftTab): void;
  select(s: Selection): void;
  setWindow(from: ISODate, to: ISODate): void;
  shiftWindow(days: number): void;
  setAsOf(d: ISODate): void;
  say(kind: Notice["kind"], text: string, undoId?: string): void;
  clearNotice(): void;

  // world
  /** Leave the open schedule and show the Start screen again. Unsaved work is set aside by the save layer when the next schedule is started. */
  closeSchedule(): void;
  setWorld(world: World, opts?: { fileName?: string | null; readOnlyProblems?: string[] | null }): void;
  /** One manual change set. Returns true if it went through; otherwise a notice says why. */
  commit(edits: Edit[], label?: string): boolean;
  undo(changeSetId: string): boolean;
  checkpoint(name: string): void;
  revert(name: string): boolean;

  // engine
  runBuild(range?: { from: ISODate; to: ISODate }): Promise<void>;
  runImprove(includeNext14?: boolean): Promise<void>;
  runRepair(gaps: { storeId: string; date: ISODate }[], wider?: boolean): Promise<void>;
  /** Stop the search that is running; nothing changes. */
  cancelEngine(): void;
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

let listWasOpen: boolean | null = null;
export const useApp = create<AppState>((set, get) => {
  const world = () => {
    const w = get().world;
    if (!w) throw new Error("no schedule open");
    return w;
  };
  const record = (w: World, cs: ChangeSet) => {
    // A failed browser copy shows in the save status (the persist layer sets it); here it only goes in the diagnostics.
    getPersist().recordCommit(w, cs).catch((e) => diag("persist", `browser copy failed: ${String(e?.message ?? e)}`));
  };
  // One search at a time; Cancel aborts it. The result is used only if the schedule is still the one that was sent.
  let abort: AbortController | null = null;
  const same = (w0: World) => { const w = get().world; return !!w && (w === w0 || api.stateHash(w.state) === api.stateHash(w0.state)); };
  const failure = (what: string, e: unknown) => {
    if (isCancel(e)) { diag("engine", `${what} cancelled`); get().say("info", `${what} stopped. Nothing changed.`); return; }
    diag("error", `${what}: ${String((e as Error)?.message ?? e)}`);
    get().say("error", String((e as Error)?.message ?? e));
  };
  const stale = (what: string) => { diag("engine", `${what} result discarded (schedule changed)`); get().say("info", `The schedule changed while ${what} ran, so that result was dropped. Run it again.`); };
  const blocked = (): string | null => (get().readOnlyProblems ? "This file opened read-only because some data is inconsistent." : null);
  const apply = (r: { world: World; changeSet: ChangeSet } | { refused: true; reason: string }, said?: string): boolean => {
    if ("refused" in r) {
      diag("action", `refused: ${r.reason}`);
      get().say("error", r.reason);
      return false;
    }
    set({ world: r.world, repairResult: null });
    diag("action", `${r.changeSet.kind} ${r.changeSet.id} (${r.changeSet.events.length} events)`);
    record(r.world, r.changeSet);
    // What happened, in a sentence, with Undo beside it (undo and revert lines carry none).
    if (said !== undefined && r.changeSet.kind !== "undo" && r.changeSet.kind !== "revert") get().say("ok", said, r.changeSet.id);
    return true;
  };

  return {
    world: null,
    fileName: null,
    asOf: todayISO(),
    window: monthWindow(todayISO()),
    axis: "store",
    view: "overview",
    setupTab: "stores",
    drawer: false,
    outForm: false,
    leftTab: "queue",
    selection: null,
    notice: null,
    repairResult: null,
    readOnlyProblems: null,
    busy: null,

    setView: (v) => {
      if (v === "travel" || v === "rules" || v === "checks") return set({ view: "setup", setupTab: v });
      const cur = get();
      // Time off and Plan ahead are built around their left list, so it opens with them and goes back to how it was when you leave.
      const listy = (x: Screen) => x === "timeoff" || x === "ahead";
      if (listy(v) && !listy(cur.view)) { listWasOpen = cur.drawer; return set({ view: v, drawer: true, ...(v === "ahead" ? { leftTab: "months" as const } : cur.leftTab === "months" ? { leftTab: "queue" as const } : {}) }); }
      if (listy(v)) return set({ view: v, ...(v === "ahead" ? { leftTab: "months" as const } : cur.leftTab === "months" ? { leftTab: "queue" as const } : {}) });
      if (listy(cur.view) && listWasOpen === false) { listWasOpen = null; return set({ view: v, drawer: false, ...(cur.leftTab === "months" ? { leftTab: "queue" as const } : {}) }); }
      return set({ view: v, ...(cur.leftTab === "months" ? { leftTab: "queue" as const } : {}) });
    },    setSetupTab: (setupTab) => set({ setupTab }),
    setDrawer: (drawer, tab) => set(tab ? { drawer, leftTab: tab } : { drawer }),
    setOutForm: (outForm) => set({ outForm }),
    setAxis: (axis) => set({ axis }),
    setLeftTab: (leftTab) => set({ leftTab }),
    select: (selection) => set({ selection }),
    setWindow: (from, to) => set({ window: { from, to } }),
    shiftWindow: (days) => set((s) => ({ window: { from: addDays(s.window.from, days), to: addDays(s.window.to, days) } })),
    setAsOf: (asOf) => set({ asOf }),
    say: (kind, text, undoId) => set({ notice: { id: ++noticeId, kind, text, ...(undoId ? { undoId } : {}) } }),
    clearNotice: () => set({ notice: null }),

    closeSchedule: () => (diag("persist", "schedule closed (back to Start)"), set({ world: null, readOnlyProblems: null, fileName: null, selection: null, drawer: false, outForm: false, view: "overview", notice: null })),

    setWorld: (w, opts = {}) => (diag("persist", `schedule opened${opts.fileName ? " (file)" : ""}`), set({ world: w, fileName: opts.fileName ?? get().fileName, readOnlyProblems: opts.readOnlyProblems ?? null, repairResult: null, selection: null })),

    commit: (edits, label) => {
      const ro = blocked();
      if (ro) { get().say("error", ro); return false; }
      if (get().busy) { get().say("info", `Wait for ${get().busy} to finish.`); return false; }
      const w0 = world();
      return apply(api.commit(w0, edits, { kind: "manual", ...(label ? { label } : {}) }), label ?? describeEdits(w0.state, edits));
    },
    undo: (id) => { diag("action", `undo ${id}`); return apply(api.undo(world(), id)); },
    checkpoint: (name) => {
      const w = api.checkpoint(world(), name);
      diag("action", "checkpoint");
      set({ world: w });
      // A checkpoint is part of the journal; keep the browser copy current.
      getPersist().adopt(w).catch((e) => diag("persist", `adopt failed: ${String(e?.message ?? e)}`));
      get().say("ok", `Checkpoint "${name}" saved.`);
    },
    revert: (name) => { diag("action", "revert to checkpoint"); return apply(api.revertToCheckpoint(world(), name)); },

    runBuild: async (range) => {
      const s = get();
      if (s.busy) return;
      const r = range ?? s.window;
      const w0 = world();
      abort = new AbortController();
      diag("action", `build ${r.from}..${r.to}`);
      set({ busy: "Build" });
      try {
        const res = await callEngine<ReturnType<typeof api.build>>({ op: "build", world: w0, range: r, asOf: s.asOf }, { signal: abort.signal });
        if (!same(w0)) { stale("Build"); return; }
        if (!res.proposal) { get().say("info", `Build found nothing to do. ${res.report.unresolvedGaps.length} gap(s) left open.`); return; }
        const o = api.openProposal(get().world!, res.proposal);
        if ("refused" in o) get().say("error", o.reason); else set({ world: o });
      } catch (e) { failure("Build", e); } finally { abort = null; set({ busy: null }); }
    },
    runImprove: async (includeNext14) => {
      const s = get();
      if (s.busy) return;
      const w0 = world();
      abort = new AbortController();
      diag("action", `improve ${s.window.from}..${s.window.to}${includeNext14 ? " +14d" : ""}`);
      set({ busy: "Improve" });
      try {
        const res = await callEngine<ReturnType<typeof api.improve>>({ op: "improve", world: w0, opts: { from: s.window.from, to: s.window.to, ...(includeNext14 ? { includeNext14 } : {}) }, asOf: s.asOf }, { signal: abort.signal });
        if (!same(w0)) { stale("Improve"); return; }
        if (!res.proposal) { get().say("info", res.message); return; }
        const o = api.openProposal(get().world!, res.proposal);
        if ("refused" in o) get().say("error", o.reason); else set({ world: o });
      } catch (e) { failure("Improve", e); } finally { abort = null; set({ busy: null }); }
    },
    runRepair: async (gaps, wider = false) => {
      const s = get();
      if (s.busy) return;
      const w0 = world();
      abort = new AbortController();
      const signal = abort.signal;
      diag("action", `repair ${gaps.length} gap(s)${wider ? " wider" : ""}`);
      set({ busy: "Find cover" });
      try {
        const result = await callEngine<RepairResult>({ op: "repair", world: w0, gaps, opts: { wider }, asOf: s.asOf }, { signal });
        if (!same(w0)) { stale("Find cover"); return; }
        set({ repairResult: { gaps, wider, result } });
        // The closest option costs a full-depth search, so it is fetched after the answer is on screen, only when there is no clean option.
        if (result.status === "none") {
          const full = await callEngine<RepairResult>({ op: "repair", world: w0, gaps, opts: { wider, showNearMiss: true }, asOf: s.asOf }, { signal });
          const cur = get().repairResult;
          if (same(w0) && cur && cur.gaps === gaps) set({ repairResult: { gaps, wider, result: full } });
        }
      } catch (e) { failure("Find cover", e); } finally { abort = null; set({ busy: null }); }
    },
    cancelEngine: () => { if (abort) { diag("action", "search cancelled by user"); abort.abort(); } },
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
      const p = world().session.proposal;
      diag("action", `accept ${p?.kind ?? "proposal"}`);
      return apply(api.acceptProposal(world()), p ? `${p.label} accepted: ${p.edits.length === 1 ? "1 change" : `${p.edits.length} changes`}.` : "Accepted.");
    },
    discardProposal: () => { diag("action", "discard proposal"); set({ world: api.discardProposal(world()) }); },

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
      diag("action", `post rev ${res.snapshot.revision}`);
      set({ world: res.world });
      getPersist().adopt(res.world).catch((e) => diag("persist", `adopt failed: ${String(e?.message ?? e)}`));
      const w = res.snapshot.warnings;
      s.say("ok", `Posted revision ${res.snapshot.revision}.${w.open || w.violations ? ` Posted with ${w.open} open and ${w.violations} problem(s).` : ""}`);
    },
    markTold: (entries) => {
      const w = api.markTold(world(), entries as never);
      set({ world: w });
      getPersist().adopt(w).catch((e) => diag("persist", `adopt failed: ${String(e?.message ?? e)}`));
    },
  };
});

setContext(() => {
  const { world, view } = useApp.getState();
  if (!world) return { view, counts: {}, hash: "n/a" };
  const st = world.state;
  const counts = { stores: Object.keys(st.stores).length, pharmacists: Object.keys(st.pharmacists).length, assignments: Object.keys(st.assignments).length, "time off": Object.keys(st.unavailability).length, "standing patterns": Object.keys(st.standing).length };
  return { view, counts, hash: api.stateHash(st) };
});

/** Weekday helper for headers. 0 = Sunday. */
export const dow = (d: ISODate): number => weekday(d);
export { applyScratch };
