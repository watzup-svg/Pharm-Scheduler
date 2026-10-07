import { useEffect, type ReactNode } from "react";
import { useApp } from "./store.ts";
import { useIssues } from "./derive.ts";
import { Wall } from "./views/Wall.tsx";
import { Inspector } from "./views/Inspector.tsx";
import { DayInspector } from "./views/timeoff/DayInspector.tsx";
import { useTimeOffUi } from "./views/timeoff/ui.ts";
import { SomeonesOut } from "./views/SomeonesOut.tsx";
import { LeftPanel } from "./views/LeftPanel.tsx";
import { ProposalBar } from "./views/ProposalBar.tsx";
import { TopBar } from "./views/TopBar.tsx";
import { Start } from "./views/Start.tsx";
import { OtherWindow } from "./views/OtherWindow.tsx";
import { useWindowState } from "./windowLock.ts";
import { Plan } from "./views/Plan.tsx";
import { Overview } from "./views/Overview.tsx";
import { OverviewHero } from "./views/hero/OverviewHero.tsx";
import { Setup } from "./views/Setup.tsx";
import { TimeOff } from "./views/TimeOff.tsx";
import { PrintView } from "./views/PrintView.tsx";
import { ErrorBoundary } from "./ui/ErrorBoundary.tsx";
import { Notice } from "./ui/Notice.tsx";
import { SaveDialogs } from "./views/SaveControls.tsx";
import { HoverNotes } from "./ui/notes.tsx";
import { SearchPalette } from "./ui/SearchPalette.tsx";
import { AheadHero, ScheduleHero, SetupHero, PrintHero, TimeOffHero } from "./views/hero/Heroes.tsx";
import { Ahead } from "./views/ahead/Ahead.tsx";

/** The right-hand column: details for what is selected. It can be folded away (like the list on the left) to give the grid more room; it opens itself when something needs it (a what-if, the add-time-off form). */
function DetailsPanel({ children }: { children: ReactNode }) {
  const open = useApp((s) => s.rightOpen);
  const needs = useApp((s) => s.outForm || !!s.world?.session.scenario);
  const adding = useTimeOffUi((s) => s.add !== null);
  useEffect(() => { if (needs || adding) useApp.getState().setRight(true); }, [needs, adding]);
  if (!open) {
    return (
      <button type="button" aria-label="Open the details panel" aria-expanded={false} data-tip="Details | Open the panel for what is selected" onClick={() => useApp.getState().setRight(true)}
        className="flex w-8 shrink-0 flex-col items-center gap-2 border-l border-line bg-cream pt-3 text-xs font-semibold text-muted hover:bg-fill">
        <span aria-hidden>‹</span>
        <span className="mt-1 [writing-mode:vertical-rl]">Details</span>
      </button>
    );
  }
  return (
    <aside aria-label="Inspector" className="relative flex w-[336px] shrink-0 flex-col overflow-y-auto border-l border-line bg-cream">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-cream px-3 py-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Details</span>
        <button type="button" aria-label="Hide the details panel" data-tip="Hide the details | You can open them again from the edge" onClick={() => useApp.getState().setRight(false)} className="rounded-md px-2 py-0.5 text-sm text-muted hover:bg-fill focus-visible:outline-2 focus-visible:outline-ink">Hide ›</button>
      </div>
      {children}
    </aside>
  );
}

// Shell: one top row; the schedule fills the middle under one header band; the Inspector docks on the right; the
// queue / history live in a drawer on the left that is closed until asked for; the Proposal Bar sits
// along the bottom while a preview is open. Desktop only.
export function App() {
  const world = useApp((s) => s.world);
  const view = useApp((s) => s.view);
  const drawer = useApp((s) => s.drawer);
  const outForm = useApp((s) => s.outForm);
  const issues = useIssues();
  const side = useWindowState();
  if (side !== "primary") return <OtherWindow />;
  if (!world) return (<><Start /><SaveDialogs /><Notice /><HoverNotes /></>);
  const proposal = world.session.proposal;
  const serious = issues.filter((i) => i.severity === "serious").length;
  const setDrawer = useApp.getState().setDrawer;
  return (
    <div className="flex h-screen min-w-[1280px] flex-col bg-paper text-ink">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        {drawer ? (
          <aside aria-label="Left panel" className="relative w-[300px] shrink-0 overflow-y-auto border-r border-line bg-cream">
            <ErrorBoundary name="the list"><LeftPanel /></ErrorBoundary>
          </aside>
        ) : (
          <button type="button" aria-label="Open the list" aria-expanded={false} data-tip="Queue and history | Open the list" onClick={() => setDrawer(true)}
            className="flex w-8 shrink-0 flex-col items-center gap-2 border-r border-line bg-cream pt-3 text-xs font-semibold text-muted hover:bg-fill">
            <span aria-hidden>›</span>
            {serious > 0 && <span className="rounded-full bg-illegal-bg px-1.5 text-illegal ring-1 ring-inset ring-illegal/30">{serious}</span>}
            <span className="mt-1 [writing-mode:vertical-rl]">List</span>
          </button>
        )}
        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <ErrorBoundary name={`the ${view} screen`} resetKey={view} probe>
            {view === "overview" && <OverviewHero />}
            {(view === "wall" || view === "plan") && <ScheduleHero />}
            {view === "ahead" && <AheadHero />}
            {view === "setup" && <SetupHero />}
            {view === "timeoff" && <TimeOffHero />}
            {view === "print" && <PrintHero />}
            <div className="relative min-h-0 flex-1 overflow-auto">
              {view === "overview" && <Overview />}
              {view === "wall" && <Wall />}
              {view === "ahead" && <Ahead />}
              {view === "plan" && <Plan />}
              {view === "timeoff" && <TimeOff />}
              {view === "setup" && <Setup />}
              {view === "print" && <PrintView />}
            </div>
          </ErrorBoundary>
        </main>
        {(view === "wall" || view === "plan" || view === "ahead") && (
          <DetailsPanel>
            {(outForm || !!world.session.scenario) && <SomeonesOut compact showForm={outForm} onClose={() => useApp.getState().setOutForm(false)} />}
            {(view === "wall" || view === "ahead") && <ErrorBoundary name="the inspector"><Inspector /></ErrorBoundary>}
          </DetailsPanel>
        )}
        {view === "timeoff" && <DetailsPanel><ErrorBoundary name="the day details"><DayInspector /></ErrorBoundary></DetailsPanel>}
      </div>
      {proposal && <ProposalBar />}
      <Notice />
      <HoverNotes />
      <SearchPalette />
    </div>
  );
}
