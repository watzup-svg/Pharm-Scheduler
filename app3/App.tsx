import { useApp } from "./store.ts";
import { Wall } from "./views/Wall.tsx";
import { Inspector } from "./views/Inspector.tsx";
import { SomeonesOut } from "./views/SomeonesOut.tsx";
import { LeftPanel } from "./views/LeftPanel.tsx";
import { ProposalBar } from "./views/ProposalBar.tsx";
import { TopBar } from "./views/TopBar.tsx";
import { Start } from "./views/Start.tsx";
import { Plan } from "./views/Plan.tsx";
import { Setup } from "./views/Setup.tsx";
import { RulesView } from "./views/RulesView.tsx";
import { TravelView } from "./views/TravelView.tsx";
import { Checks } from "./views/Checks.tsx";
import { PrintView } from "./views/PrintView.tsx";
import { Notice } from "./ui/Notice.tsx";
import { SaveDialogs } from "./views/SaveControls.tsx";

// Shell: schedule dominant in the middle, contextual left panel, docked Inspector on the right with Someone's Out above it,
// Proposal Bar along the bottom while a proposal is open. Desktop only.
export function App() {
  const world = useApp((s) => s.world);
  const view = useApp((s) => s.view);
  if (!world) return (<><Start /><SaveDialogs /><Notice /></>);
  const proposal = world.session.proposal;
  return (
    <div className="flex h-screen min-w-[1280px] flex-col bg-paper text-ink">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <aside aria-label="Left panel" className="w-[272px] shrink-0 overflow-y-auto border-r border-line bg-cream"><LeftPanel /></aside>
        <main className="min-w-0 flex-1 overflow-auto">
          {view === "wall" && <Wall />}
          {view === "plan" && <Plan />}
          {view === "setup" && <Setup />}
          {view === "rules" && <RulesView />}
          {view === "travel" && <TravelView />}
          {view === "checks" && <Checks />}
          {view === "print" && <PrintView />}
        </main>
        <aside aria-label="Inspector" className="flex w-[336px] shrink-0 flex-col overflow-y-auto border-l border-line bg-cream">
          <SomeonesOut />
          <Inspector />
        </aside>
      </div>
      {proposal && <ProposalBar />}
      <Notice />
    </div>
  );
}
