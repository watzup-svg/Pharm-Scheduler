// Contextual left panel: Queue, To tell, History.
import { useApp, type LeftTab } from "../store.ts";
import { cx } from "../ui/primitives.tsx";
import { Queue } from "./chrome/Queue.tsx";
import { ToTell } from "./chrome/ToTell.tsx";
import { History } from "./chrome/History.tsx";

export function LeftPanel() {
  const world = useApp((s) => s.world);
  const tab = useApp((s) => s.leftTab);
  const setTab = useApp((s) => s.setLeftTab);
  if (!world) return null;
  const tabs: { id: LeftTab; label: string }[] = [
    { id: "queue", label: "Queue" },
    { id: "tell", label: "To tell" },
    { id: "history", label: "History" },
  ];
  return (
    <div className="flex min-h-full flex-col">
      <div role="tablist" aria-label="Left panel" className="sticky top-0 z-10 flex border-b border-line bg-cream px-1.5 pt-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`left-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="left-tabpanel"
            onClick={() => setTab(t.id)}
            className={cx("flex h-9 items-center gap-1.5 border-b-2 px-2.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ink", tab === t.id ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink")}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="left-tabpanel" aria-labelledby={`left-tab-${tab}`} className="min-h-0 flex-1">
        {tab === "queue" && <Queue />}
        {tab === "tell" && <ToTell />}
        {tab === "history" && <History />}
      </div>
    </div>
  );
}
