// One row: title and file, save, view tabs, as-of date, undo, counts, Build, Improve and the shortcut list.
import { useEffect, useState } from "react";
import type { Issue } from "../derive.ts";
import { useApp, type View } from "../store.ts";
import { todayISO } from "../clock.ts";
import { useEvaluation, useIssues } from "../derive.ts";
import { Btn, cx } from "../ui/primitives.tsx";
import { SaveControls } from "./SaveControls.tsx";
import { countsOf, goTo, isTyping, plural, stepIssue, undoTarget, useChrome } from "./chrome/shared.tsx";

const TABS: { id: View; label: string }[] = [
  { id: "wall", label: "Wall" },
  { id: "plan", label: "Plan" },
  { id: "setup", label: "Setup" },
  { id: "travel", label: "Travel" },
  { id: "rules", label: "Rules" },
  { id: "checks", label: "Checks" },
  { id: "print", label: "Print" },
];

/** n / p step through problems, Esc discards a proposal, Ctrl+Z undoes. All quiet while typing in a field. */
function useShortcuts(issues: Issue[]) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useApp.getState();
      const w = s.world;
      if (!w) return;
      if (isTyping(e.target)) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "z") {
        const t = undoTarget(w);
        if (t) { e.preventDefault(); s.undo(t.id); }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Escape") {
        if (w.session.proposal) { e.preventDefault(); s.discardProposal(); }
        return;
      }
      if (e.key === "n" || e.key === "p") {
        const next = stepIssue(issues, w.state, e.key === "n" ? 1 : -1);
        if (next) { e.preventDefault(); goTo(next.storeId, next.date); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [issues]);
}

const SHORTCUTS: [string, string][] = [
  ["n", "Go to the next problem"],
  ["p", "Go to the previous problem"],
  ["Esc", "Discard the open proposal"],
  ["Ctrl+Z", "Undo the newest change"],
];

export function TopBar() {
  const world = useApp((s) => s.world);
  const view = useApp((s) => s.view);
  const setView = useApp((s) => s.setView);
  const asOf = useApp((s) => s.asOf);
  const setAsOf = useApp((s) => s.setAsOf);
  const panel = useChrome((s) => s.panel);
  const setPanel = useChrome((s) => s.setPanel);
  const issues = useIssues();
  const ev = useEvaluation();
  const counts = countsOf(issues, ev);
  const [includeNext14, setIncludeNext14] = useState(false);
  useShortcuts(issues);
  if (!world) return null;
  const proposalOpen = !!world.session.proposal;
  const sc = world.session.scenario;
  const scenarioOpen = !!sc && !sc.parked;
  const engineOff = proposalOpen || scenarioOpen;
  const why = proposalOpen ? "Accept or discard the open proposal first." : scenarioOpen ? "Park or discard the what-if first." : undefined;
  const target = undoTarget(world);

  return (
    <header className="shrink-0 border-b border-line bg-cream">
      <div className="flex h-12 items-center gap-2.5 whitespace-nowrap px-3">
        <div className="flex shrink-0 items-baseline gap-2">
          <h1 className="shrink-0 text-sm font-bold">Scheduler</h1>
        </div>
        <div className="min-w-0 flex-1"><SaveControls /></div>
        <div className="ml-auto flex shrink-0 items-center gap-2.5">
          <p className="whitespace-nowrap text-sm" aria-label="Summary for this period" data-testid="counts">
            <span className={counts.open ? "font-semibold" : ""}>{counts.open} open</span> · <span className={counts.problems ? "font-semibold" : ""}>{plural(counts.problems, "problem")}</span>
          </p>
          <Btn tone="ink" disabled={engineOff} title={why ?? "Fill the pattern and look for cover in this period. You review it before anything is saved."} onClick={() => useApp.getState().runBuild()}>Build this period</Btn>
          <Btn aria-expanded={panel === "improve"} onClick={() => setPanel(panel === "improve" ? null : "improve")} disabled={engineOff} title={why}>Improve…</Btn>
          <Btn tone="ghost" className="w-8 justify-center px-0" aria-label="Keyboard shortcuts" aria-expanded={panel === "keys"} onClick={() => setPanel(panel === "keys" ? null : "keys")}>?</Btn>
        </div>
      </div>
      <div className="flex h-11 items-center gap-3 whitespace-nowrap border-t border-line px-3">
        <nav aria-label="Views" className="flex shrink-0 items-center gap-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-current={view === t.id ? "page" : undefined}
              onClick={() => setView(t.id)}
              className={cx("h-8 rounded-md px-2.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink", view === t.id ? "bg-ink text-white" : "text-ink hover:bg-fill")}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <label htmlFor="asof" className="text-xs font-medium text-muted">As of</label>
            <input
              id="asof"
              type="date"
              value={asOf}
              onChange={(e) => { if (e.target.value) setAsOf(e.target.value); }}
              className="h-8 rounded-md border border-edge bg-white px-1.5 text-sm"
            />
            <Btn tone="ghost" className="px-2" disabled={asOf === todayISO()} onClick={() => setAsOf(todayISO())}>Today</Btn>
          </div>
          <Btn
            aria-label="Undo"
            disabled={!target}
            title={target ? `Undo: ${target.label}` : "Nothing to undo"}
            onClick={() => { if (target) useApp.getState().undo(target.id); }}
          >
            ↶ Undo
          </Btn>
        </div>
      </div>
      {panel === "improve" && !engineOff && (
        <div className="flex items-center gap-4 border-t border-line bg-paper px-3 py-2 text-sm" role="region" aria-label="Improve">
          <p className="max-w-[760px]">Improve looks for changes that restore standing patterns, remove problems and cut driving. It only runs when you ask, and it only proposes: nothing is saved until you accept.</p>
          <label className="flex items-center gap-1.5 whitespace-nowrap text-xs">
            <input type="checkbox" checked={includeNext14} onChange={(e) => setIncludeNext14(e.target.checked)} /> Include the next 14 days
          </label>
          <Btn tone="ink" onClick={() => { useApp.getState().runImprove(includeNext14); setPanel(null); }}>Run Improve</Btn>
          <Btn tone="ghost" onClick={() => setPanel(null)}>Close</Btn>
        </div>
      )}
      {panel === "keys" && (
        <div className="border-t border-line bg-paper px-3 py-2" role="region" aria-label="Keyboard shortcuts">
          <dl className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
            {SHORTCUTS.map(([k, d]) => (
              <div key={k} className="flex items-center gap-2"><dt><kbd className="rounded border border-edge bg-white px-1.5 text-xs font-semibold">{k}</kbd></dt><dd>{d}</dd></div>
            ))}
          </dl>
          <p className="mt-1 text-xs text-muted">Shortcuts stay quiet while you are typing in a field. Nothing is accepted by the keyboard alone.</p>
        </div>
      )}
    </header>
  );
}
