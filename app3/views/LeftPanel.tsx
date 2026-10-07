// Contextual left panel: Queue and History.
import { useApp, type LeftTab } from "../store.ts";
import { cx } from "../ui/primitives.tsx";
import { Queue } from "./chrome/Queue.tsx";
import { History } from "./chrome/History.tsx";

export function LeftPanel() {
  const world = useApp((s) => s.world);
  const tab = useApp((s) => s.leftTab);
  const setTab = useApp((s) => s.setLeftTab);
  if (!world) return null;
  const tabs: { id: LeftTab; label: string }[] = [
    { id: "queue", label: "Queue" },
    { id: "history", label: "History" },
  ];
  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 flex border-b border-line bg-cream px-1.5 pt-1.5">
      <div role="tablist" aria-label="Left panel" className="flex">
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
        <button type="button" aria-label="Close the list" data-tip="Hide the list | You can open it again from the edge" onClick={() => useApp.getState().setDrawer(false)} className="my-1 ml-auto mr-1 rounded-md px-2 text-sm text-muted hover:bg-fill focus-visible:outline-2 focus-visible:outline-ink">Hide ‹</button>
      </div>
      <div role="tabpanel" id="left-tabpanel" aria-labelledby={`left-tab-${tab}`} className="min-h-0 flex-1">
        {tab === "queue" && <Queue />}
        {tab === "history" && <History />}
      </div>
    </div>
  );
}
