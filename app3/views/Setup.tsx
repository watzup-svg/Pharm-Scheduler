// Setup: stores, pharmacists, patterns and one-off dates. Every change is a change set (undoable); each row has an explicit Save.
import { useState, type KeyboardEvent } from "react";
import { useApp } from "../store.ts";
import { cx } from "../ui/primitives.tsx";
import { StoresTab } from "./setup/StoresTab.tsx";
import { PharmacistsTab } from "./setup/PharmacistsTab.tsx";
import { PatternsTab } from "./setup/PatternsTab.tsx";
import { DatesTab } from "./setup/DatesTab.tsx";
import { useLocked } from "./setup/shared.tsx";

const TABS = [
  { id: "stores", label: "Stores" },
  { id: "pharmacists", label: "Pharmacists" },
  { id: "patterns", label: "Patterns" },
  { id: "dates", label: "Dates" },
] as const;
type TabId = (typeof TABS)[number]["id"];

let lastTab: TabId = "stores";

export function Setup() {
  const world = useApp((s) => s.world);
  const [tab, setTabState] = useState<TabId>(lastTab);
  const locked = useLocked();
  if (!world) return null;
  const setTab = (t: TabId) => { lastTab = t; setTabState(t); };

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
      <header>
        <h2 className="font-display text-xl font-semibold">Setup</h2>
        <p className="text-sm text-muted">The stores, people and routines the schedule is built from. Changes here are recorded in History and can be undone.</p>
      </header>
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
      </div>
    </div>
  );
}
