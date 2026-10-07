import { useEffect, useRef, useState } from "react";
import { Store, User } from "lucide-react";
import { useApp, type Axis } from "../../store.ts";
import { addDays } from "@domain";
import { ToolsMenu } from "../../ui/ToolsMenu.tsx";
import { useChrome } from "../chrome/shared.tsx";
import { KeyPanelBody } from "./Key.tsx";
import { useWallUi } from "./ui.ts";
import { widthKind, windowFor, type WidthKind } from "./model.ts";

const WIDTHS: { kind: Exclude<WidthKind, "custom" | "4w">; label: string }[] = [
  { kind: "month", label: "Month" },
  { kind: "2w", label: "2 weeks" },
];

export function Controls({ preview, whatIf, ghosts }: { preview: boolean; whatIf: boolean; ghosts: boolean }) {
  const win = useApp((s) => s.window);
  const asOf = useApp((s) => s.asOf);
  const axis = useApp((s) => s.axis);
  const setAxis = useApp((s) => s.setAxis);
  const day = useWallUi((u) => u.day);
  const setDay = useWallUi((u) => u.setDay);
  const kind = widthKind(win);
  const [key, setKey] = useState(false);

  // Leaving the Day view lands on a window that holds that day.
  const show = (k: Exclude<WidthKind, "custom" | "4w">) => { const x = windowFor(k, day ?? asOf); useApp.getState().setWindow(x.from, x.to); setDay(null); };
  const showDay = () => setDay(useApp.getState().selection?.date ?? (asOf >= win.from && asOf <= win.to ? asOf : win.from));

  const goToday = () => {
    const st = useApp.getState();
    if (day) { setDay(asOf); return; }
    if (asOf < win.from || asOf > win.to) {
      const k: Exclude<WidthKind, "custom"> = kind === "custom" ? "2w" : kind;
      st.setWindow(windowFor(k, asOf).from, windowFor(k, asOf).to);
    }
    // Bring the as-of column into view whether or not the window moved.
    requestAnimationFrame(() => document.querySelector<HTMLElement>(".w-asof-head")?.scrollIntoView({ inline: "center", block: "nearest" }));
  };

  return (
    <div className="relative shrink-0">
      <div className="w-controls flex items-center gap-x-3 border-b border-line bg-cream px-3 py-1">
        <div className="flex items-center gap-1" role="group" aria-label="Move the window">
          <button type="button" className="w-btn" onClick={() => (day ? setDay(addDays(day, -1)) : useApp.getState().shiftWindow(-7))} aria-label={day ? "Previous day" : "Previous week"}>{"‹"}</button>
          <button type="button" className="w-btn" onClick={goToday}>Today</button>
          <button type="button" className="w-btn" onClick={() => (day ? setDay(addDays(day, 1)) : useApp.getState().shiftWindow(7))} aria-label={day ? "Next day" : "Next week"}>{"›"}</button>
        </div>
        <div className="w-seg" role="group" aria-label="How much to show">
          {WIDTHS.map((w) => (
            <button key={w.kind} type="button" aria-pressed={!day && kind === w.kind} onClick={() => show(w.kind)}>{w.label}</button>
          ))}
          <button type="button" aria-pressed={!!day} onClick={showDay}>Day</button>
        </div>
        {!day && (
          <div className="w-seg" role="group" aria-label="Rows">
            {(["store", "pharmacist"] as Axis[]).map((a) => (
              <button key={a} type="button" aria-pressed={axis === a} aria-label={a === "store" ? "Stores" : "People"} data-tip={a === "store" ? "Stores | One row per store" : "People | One row per pharmacist"} onClick={() => setAxis(a)} className="grid place-items-center px-3">
                {a === "store" ? <Store aria-hidden className="size-[18px]" /> : <User aria-hidden className="size-[18px]" />}
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button type="button" className="w-btn" aria-expanded={key} aria-controls="wall-key" onClick={() => setKey((k) => !k)}>Key</button>
          <ToolsMenu />
        </div>
      </div>
      {key && <KeyPanel axis={axis} ghosts={ghosts && !day} onClose={() => setKey(false)} />}
      {preview && <div role="status" className="w-strip"><b>Preview:</b> nothing is saved until you accept.</div>}
      {whatIf && <div role="status" className="w-strip"><b>What-if</b> (not saved).</div>}
    </div>
  );
}

function KeyPanel({ axis, ghosts, onClose }: { axis: Axis; ghosts: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (ref.current?.contains(t) || t?.closest?.('[aria-controls="wall-key"]')) return;
      onClose();
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); document.querySelector<HTMLElement>('[aria-controls="wall-key"]')?.focus(); } };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("pointerdown", down); document.removeEventListener("keydown", esc, true); };
  }, [onClose]);
  return (
    <div ref={ref} id="wall-key" role="region" aria-label="Key" className="w-keypanel">
      <KeyPanelBody axis={axis} />
      {ghosts && <p className="mt-2 text-muted">A dashed outline with + or {"−"}: a preview would add or take away people there.</p>}
      <button type="button" className="mt-2 font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ink" onClick={() => { onClose(); useChrome.getState().setGuide(true); }}>What do these mean?</button>
    </div>
  );
}
