// One row: brand, the four screens, save state with the File menu, search, undo. Everything rare lives in the File menu.
import { useEffect, useState } from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { useApp, type Screen } from "../store.ts";
import { todayISO } from "../clock.ts";
import { useIssues } from "../derive.ts";
import { Btn, cx } from "../ui/primitives.tsx";
import { BrandMark } from "../ui/brand.tsx";
import { SaveControls } from "./SaveControls.tsx";
import { isTyping, stepProblem, undoTarget, useChrome } from "./chrome/shared.tsx";
import { IconGuide } from "./chrome/IconGuide.tsx";
import { fmtDate } from "../copy.ts";
import { copyDiagnostics } from "../diagnostics.ts";
import { getPersist } from "../persist-bridge.ts";

const TABS: { id: Screen; label: string; also?: Screen }[] = [
  { id: "overview", label: "Overview" },
  { id: "wall", label: "Schedule", also: "plan" },
  { id: "timeoff", label: "Time off" },
  { id: "print", label: "Print" },
  { id: "setup", label: "Setup" },
];

const PREF = { large: "hs-pref-large", contrast: "hs-pref-contrast" } as const;
function applyPrefs() {
  try {
    document.documentElement.classList.toggle("text-large", localStorage.getItem(PREF.large) === "1");
    document.documentElement.classList.toggle("contrast", localStorage.getItem(PREF.contrast) === "1");
  } catch { /* browser storage may be off */ }
}
function togglePref(key: string, cls: string) {
  try { const on = localStorage.getItem(key) !== "1"; localStorage.setItem(key, on ? "1" : "0"); document.documentElement.classList.toggle(cls, on); } catch { document.documentElement.classList.toggle(cls); }
}

const SHORTCUTS: [string, string][] = [
  ["/ or Ctrl+K", "Search stores, people and screens"],
  ["N and Shift+N", "Next and previous problem"],
  ["Esc", "Close the drawer or discard a preview"],
  ["Ctrl+Z", "Undo the newest change"],
  ["Ctrl+S", "Save"],
];

function useShortcuts(issues: ReturnType<typeof useIssues>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useApp.getState();
      const w = s.world;
      if (!w || isTyping(e.target)) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "z") {
        const t = undoTarget(w);
        if (t) { e.preventDefault(); s.undo(t.id); }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Escape") {
        // Esc closes an open menu or dialog first; it only discards a preview when nothing else is open.
        if (e.defaultPrevented || document.querySelector('[role="menu"][data-state="open"], [role="dialog"][data-state="open"], [role="dialog"][aria-label="Search"], [role="dialog"][aria-label="Improve"]')) return;
        if (w.session.proposal) { e.preventDefault(); s.discardProposal(); }
        else if (s.drawer) { e.preventDefault(); s.setDrawer(false); }
        return;
      }
      // N = next problem, Shift+N (or P) = previous. Only problems from the as-of date on.
      if (e.key === "n" || e.key === "N" || e.key === "p") {
        e.preventDefault();
        stepProblem(issues, w.state, e.key === "n" ? 1 : -1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [issues]);
}

type Panel = null | "asof" | "keys" | "checkpoint";

export function TopBar() {
  const world = useApp((s) => s.world);
  const view = useApp((s) => s.view);
  const setView = useApp((s) => s.setView);
  const asOf = useApp((s) => s.asOf);
  const setAsOf = useApp((s) => s.setAsOf);
  const issues = useIssues();
  const [panel, setPanel] = useState<Panel>(null);
  const [name, setName] = useState("");
  useShortcuts(issues);
  useEffect(applyPrefs, []);
  const waiting = world ? Object.values(world.state.unavailability).filter((u) => u.status === "Requested" && u.last >= asOf).length : 0;
  const target = world ? undoTarget(world) : undefined;
  const item = "cursor-pointer rounded px-3 py-1.5 text-sm outline-none data-[highlighted]:bg-fill";

  const extra = (
    <>
      <Menu.Separator className="my-1 h-px bg-line" />
      <Menu.Item className={item} onSelect={() => setPanel("checkpoint")}>Save a checkpoint…</Menu.Item>
      <Menu.Item className={item} onSelect={() => useApp.getState().setDrawer(true, "history")}>History and revert</Menu.Item>
      <Menu.Item className={item} data-close-schedule onSelect={() => {
        const st = getPersist().status();
        if (st.unsavedChanges > 0 && !window.confirm("Go back to the Start screen?\n\nYou have changes that are not saved to a file. They stay in this browser's copy, and a safety copy is kept when you start or open another schedule.")) return;
        useApp.getState().closeSchedule();
      }}>Back to the Start screen…</Menu.Item>
      <Menu.Item className={item} onSelect={() => setPanel("asof")}>As of {fmtDate(asOf)}…</Menu.Item>
      <Menu.Separator className="my-1 h-px bg-line" />
      <Menu.Item className={item} onSelect={() => togglePref(PREF.large, "text-large")}>Larger text</Menu.Item>
      <Menu.Item className={item} onSelect={() => togglePref(PREF.contrast, "contrast")}>High contrast</Menu.Item>
      <Menu.Item className={item} onSelect={() => useChrome.getState().setGuide(true)}>Icon guide…</Menu.Item>
      <Menu.Item className={item} onSelect={() => setPanel("keys")}>Keyboard shortcuts</Menu.Item>
      <Menu.Item className={item} onSelect={() => void copyDiagnostics().then((ok) => useApp.getState().say(ok ? "ok" : "info", ok ? "Diagnostics copied." : "Could not copy automatically."))}>Copy diagnostics</Menu.Item>
    </>
  );

  return (
    <header className="shrink-0 border-b border-line bg-cream">
      <div className="flex h-14 items-center gap-4 whitespace-nowrap px-3">
        <h1 className="sr-only">Hi-School Pharmacy Scheduler</h1>
        <BrandMark className="h-8" />
        <nav aria-label="Screens" className="flex items-center gap-0.5">
          {TABS.map((t) => {
            const on = view === t.id || view === t.also;
            return (
              <button key={t.id} type="button" aria-current={on ? "page" : undefined} onClick={() => setView(t.id)}
                className={cx("relative h-9 rounded-md px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink", on ? "bg-ink text-white" : "text-ink hover:bg-fill")}>
                {t.label}
                {t.id === "timeoff" && waiting > 0 && <span aria-label={`${waiting} waiting`} className="ml-1.5 rounded-full bg-warn-bg px-1.5 text-xs font-bold text-warn ring-1 ring-inset ring-warn/40">{waiting}</span>}
              </button>
            );
          })}
        </nav>
        <div className="ml-auto flex min-w-0 items-center gap-3">
          <SaveControls extra={extra} />
          <Btn tone="ghost" aria-label="Search" data-tip="Search | Stores, people and screens | Press /" onClick={() => window.dispatchEvent(new Event("hs-search"))}>⌕ Search</Btn>
          <Btn aria-label="Undo" disabled={!target} data-tip={target ? `Undo | ${target.label}` : "Nothing to undo"} onClick={() => { if (target) useApp.getState().undo(target.id); }}>↶ Undo</Btn>
        </div>
      </div>
      <IconGuide />
      {panel === "asof" && (
        <div className="flex items-center gap-3 border-t border-line bg-paper px-3 py-2 text-sm" role="region" aria-label="As of">
          <label htmlFor="asof" className="font-medium">As of</label>
          <input id="asof" type="date" value={asOf} onChange={(e) => { if (e.target.value) setAsOf(e.target.value); }} className="h-8 rounded-md border border-edge bg-white px-2" />
          <Btn disabled={asOf === todayISO()} onClick={() => setAsOf(todayISO())}>Today</Btn>
          <span className="text-muted">Looks back or ahead without changing anything.</span>
          <Btn tone="ghost" className="ml-auto" onClick={() => setPanel(null)}>Done</Btn>
        </div>
      )}
      {panel === "keys" && (
        <div className="border-t border-line bg-paper px-3 py-2" role="region" aria-label="Keyboard shortcuts">
          <dl className="grid grid-cols-[130px_1fr] gap-x-4 gap-y-1 text-sm">{SHORTCUTS.map(([k, d]) => (<div key={k} className="contents"><dt className="font-mono text-xs">{k}</dt><dd>{d}</dd></div>))}</dl>
          <Btn tone="ghost" className="mt-1" onClick={() => setPanel(null)}>Close</Btn>
        </div>
      )}
      {panel === "checkpoint" && (
        <form className="flex items-center gap-3 border-t border-line bg-paper px-3 py-2 text-sm" aria-label="Save a checkpoint" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { useApp.getState().checkpoint(name.trim()); setName(""); setPanel(null); } }}>
          <label htmlFor="cp-name" className="font-medium">Checkpoint name</label>
          <input id="cp-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Before holiday changes" className="h-8 w-64 rounded-md border border-edge bg-white px-2" />
          <Btn type="submit" tone="ink" disabled={!name.trim()}>Save checkpoint</Btn>
          <Btn tone="ghost" onClick={() => setPanel(null)}>Cancel</Btn>
        </form>
      )}
    </header>
  );
}
