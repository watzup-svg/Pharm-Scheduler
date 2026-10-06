import { useApp } from "./store.ts";
import { useIssues } from "./derive.ts";
import { Wall } from "./views/Wall.tsx";
import { Inspector } from "./views/Inspector.tsx";
import { SomeonesOut } from "./views/SomeonesOut.tsx";
import { LeftPanel } from "./views/LeftPanel.tsx";
import { ProposalBar } from "./views/ProposalBar.tsx";
import { TopBar } from "./views/TopBar.tsx";
import { Start } from "./views/Start.tsx";
import { Plan } from "./views/Plan.tsx";
import { Setup } from "./views/Setup.tsx";
import { TimeOff } from "./views/TimeOff.tsx";
import { PrintView } from "./views/PrintView.tsx";
import { Notice } from "./ui/Notice.tsx";
import { SaveDialogs } from "./views/SaveControls.tsx";
import { HoverNotes } from "./ui/notes.tsx";
import { SearchPalette } from "./ui/SearchPalette.tsx";
import { ScheduleHero, SetupHero, PrintHero, TimeOffHero } from "./views/hero/Heroes.tsx";

// Shell: one top row; the schedule fills the middle under one header band; the Inspector docks on the right; the
// queue / who to tell / history live in a drawer on the left that is closed until asked for; the Proposal Bar sits
// along the bottom while a preview is open. Desktop only.
export function App() {
  const world = useApp((s) => s.world);
  const view = useApp((s) => s.view);
  const drawer = useApp((s) => s.drawer);
  const outForm = useApp((s) => s.outForm);
  const issues = useIssues();
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
            <button type="button" aria-label="Close the list" onClick={() => setDrawer(false)} className="absolute right-2 top-2 z-10 rounded px-2 py-1 text-sm text-muted hover:bg-fill">Close ✕</button>
            <LeftPanel />
          </aside>
        ) : (
          <button type="button" aria-label="Open the list" aria-expanded={false} data-tip="Queue, who to tell, history | Open the list" onClick={() => setDrawer(true)}
            className="flex w-8 shrink-0 flex-col items-center gap-2 border-r border-line bg-cream pt-3 text-xs font-semibold text-muted hover:bg-fill">
            <span aria-hidden>›</span>
            {serious > 0 && <span className="rounded-full bg-illegal-bg px-1.5 text-illegal ring-1 ring-inset ring-illegal/30">{serious}</span>}
            <span className="mt-1 [writing-mode:vertical-rl]">List</span>
          </button>
        )}
        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          {(view === "wall" || view === "plan") && <ScheduleHero />}
          {view === "setup" && <SetupHero />}
          {view === "timeoff" && <TimeOffHero />}
          {view === "print" && <PrintHero />}
          <div className="relative min-h-0 flex-1 overflow-auto">
            {view === "wall" && <Wall />}
            {view === "plan" && <Plan />}
            {view === "timeoff" && <TimeOff />}
            {view === "setup" && <Setup />}
            {view === "print" && <PrintView />}
          </div>
        </main>
        {(view === "wall" || view === "plan") && (
          <aside aria-label="Inspector" className="relative flex w-[336px] shrink-0 flex-col overflow-y-auto border-l border-line bg-cream">
            {(outForm || !!world.session.scenario) && <SomeonesOut compact showForm={outForm} onClose={() => useApp.getState().setOutForm(false)} />}
            {view === "wall" && <Inspector />}
          </aside>
        )}
      </div>
      {proposal && <ProposalBar />}
      <Notice />
      <HoverNotes />
      <SearchPalette />
    </div>
  );
}
