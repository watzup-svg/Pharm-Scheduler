// Setup: people, stores, patterns, holidays and one-off dates, then travel, rules and the check. Every change is a change set (undoable); each row has an explicit Save.
import { useApp } from "../store.ts";
import { PageFrame } from "../ui/PageFrame.tsx";
import { Segmented } from "../ui/Segmented.tsx";
import { StoresTab } from "./setup/StoresTab.tsx";
import { PeopleTab } from "./setup/PeopleTab.tsx";
import { HolidaysTab } from "./setup/HolidaysTab.tsx";
import { PatternsTab } from "./setup/PatternsTab.tsx";
import { DatesTab } from "./setup/DatesTab.tsx";
import { useLocked } from "./setup/shared.tsx";
import { TravelView } from "./TravelView.tsx";
import { RulesView } from "./RulesView.tsx";
import { Checks } from "./Checks.tsx";

const TABS = [
  { id: "pharmacists", label: "People" },
  { id: "stores", label: "Stores" },
  { id: "patterns", label: "Patterns" },
  { id: "holidays", label: "Holidays" },
  { id: "dates", label: "Dates" },
  { id: "travel", label: "Travel" },
  { id: "rules", label: "Rules" },
  { id: "checks", label: "Check" },
] as const;

export function Setup() {
  const world = useApp((s) => s.world);
  const tab = useApp((a) => a.setupTab);
  const setTab = useApp((a) => a.setSetupTab);
  const locked = useLocked();
  if (!world) return null;

  return (
    <PageFrame>
      <h2 className="sr-only">Setup</h2>
      {locked && <p role="status" className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn ring-1 ring-warn/35">▲ {locked}</p>}
      <Segmented kind="tabs" idPrefix="setup" label="Setup sections" value={tab} onChange={setTab} options={TABS.map((t) => ({ value: t.id, label: t.label }))} className="w-max max-w-full flex-wrap" />
      <div role="tabpanel" id={`setup-panel-${tab}`} aria-labelledby={`setup-tab-${tab}`}>
        {tab === "stores" && <StoresTab />}
        {tab === "pharmacists" && <PeopleTab />}
        {tab === "patterns" && <PatternsTab />}
        {tab === "holidays" && <HolidaysTab />}
        {tab === "dates" && <DatesTab />}
        {tab === "travel" && <TravelView />}
        {tab === "rules" && <RulesView />}
        {tab === "checks" && <Checks />}
      </div>
    </PageFrame>
  );
}
