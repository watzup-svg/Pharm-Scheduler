// Setup: stores, pharmacists, patterns and one-off dates. Every change is a change set (undoable); each row has an explicit Save.
import { type KeyboardEvent } from "react";
import { useApp } from "../store.ts";
import { cx } from "../ui/primitives.tsx";
import { StoresTab } from "./setup/StoresTab.tsx";
import { PharmacistsTab } from "./setup/PharmacistsTab.tsx";
import { PatternsTab } from "./setup/PatternsTab.tsx";
import { DatesTab } from "./setup/DatesTab.tsx";
import { useLocked } from "./setup/shared.tsx";
import { TravelView } from "./TravelView.tsx";
import { RulesView } from "./RulesView.tsx";
import { Checks } from "./Checks.tsx";

const TABS = [
  { id: "stores", label: "Stores" },
  { id: "pharmacists", label: "Pharmacists" },
  { id: "patterns", label: "Patterns" },
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

  const onKey = (e: KeyboardEvent<HTMLElement>, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = TABS[(i + d + TABS.length) % TABS.length]!;
    setTab(next.id);
    document.getElementById(`setup-tab-${next.id}`)?.focus();
  };

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-3 p-3">
      <h2 className="sr-only">Setup</h2>
      {locked && <p role="status" className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn ring-1 ring-warn/35">▲ {locked}</p>}
      <div role="tablist" aria-label="Setup sections" className="flex gap-1 border-b border-line">
        {TABS.map((t, i) => (
          <button key={t.id} id={`setup-tab-${t.id}`} role="tab" type="button" aria-selected={tab === t.id} aria-controls={`setup-panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1} onClick={() => setTab(t.id)} onKeyDown={(e) => onKey(e, i)}
            className={cx("-mb-px h-9 rounded-t-md border-b-2 px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink", tab === t.id ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink")}>
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`setup-panel-${tab}`} aria-labelledby={`setup-tab-${tab}`}>
        {tab === "stores" && <StoresTab />}
        {tab === "pharmacists" && <PharmacistsTab />}
        {tab === "patterns" && <PatternsTab />}
        {tab === "dates" && <DatesTab />}
        {tab === "travel" && <TravelView />}
        {tab === "rules" && <RulesView />}
        {tab === "checks" && <Checks />}
      </div>
    </div>
  );
}
