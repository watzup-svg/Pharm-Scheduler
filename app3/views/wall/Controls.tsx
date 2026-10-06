import { useEffect, useRef, useState } from "react";
import { useApp, type Axis } from "../../store.ts";
import { MARKS, StateMark, type MarkKind } from "../../ui/icons.tsx";
import { ToolsMenu } from "../../ui/ToolsMenu.tsx";
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
  const kind = widthKind(win);
  const [key, setKey] = useState(false);

  const goToday = () => {
    const st = useApp.getState();
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
          <button type="button" className="w-btn" onClick={() => useApp.getState().shiftWindow(-7)} aria-label="Previous week">{"‹"}</button>
          <button type="button" className="w-btn" onClick={goToday}>Today</button>
          <button type="button" className="w-btn" onClick={() => useApp.getState().shiftWindow(7)} aria-label="Next week">{"›"}</button>
        </div>
        <div className="w-seg" role="group" aria-label="How much to show">
          {WIDTHS.map((w) => (
            <button key={w.kind} type="button" aria-pressed={kind === w.kind} onClick={() => { const x = windowFor(w.kind, asOf); useApp.getState().setWindow(x.from, x.to); }}>{w.label}</button>
          ))}
        </div>
        <div className="w-seg" role="group" aria-label="Rows">
          {(["store", "pharmacist"] as Axis[]).map((a) => (
            <button key={a} type="button" aria-pressed={axis === a} onClick={() => setAxis(a)}>{a === "store" ? "Stores" : "People"}</button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" className="w-btn" aria-expanded={key} aria-controls="wall-key" onClick={() => setKey((k) => !k)}>Key</button>
          <ToolsMenu />
        </div>
      </div>
      {key && <KeyPanel axis={axis} ghosts={ghosts} onClose={() => setKey(false)} />}
      {preview && <div role="status" className="w-strip"><b>Preview:</b> nothing is saved until you accept.</div>}
      {whatIf && <div role="status" className="w-strip"><b>What-if</b> (not saved).</div>}
    </div>
  );
}

const STORE_MARKS: MarkKind[] = ["open", "closure", "double", "licence", "away", "drive", "streak", "unverified", "short", "covering", "pinned", "locum", "unconfirmed"];
const PERSON_MARKS: MarkKind[] = ["double", "away", "drive", "streak", "licence"];

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
  const kinds = axis === "store" ? STORE_MARKS : PERSON_MARKS;
  const Shape = ({ cls, children }: { cls: string; children: string }) => <span className="w-key-item"><span className={`w-key-shape ${cls}`} aria-hidden="true" />{children}</span>;
  return (
    <div ref={ref} id="wall-key" role="region" aria-label="Key" className="w-keypanel">
      <div className="w-key-grid">
        {kinds.map((k) => (
          <span key={k} className="w-key-item"><StateMark kind={k} size={16} /><span><b>{MARKS[k].name}</b> <span className="text-muted">{MARKS[k].meaning}</span></span></span>
        ))}
      </div>
      <div className="w-key-grid w-key-shapes">
        {axis === "store" ? (
          <>
            <span className="w-key-item"><b className="w-key-ini">AB</b> working</span>
            <span className="w-key-item"><b className="w-key-ini w-unc">AB</b> not confirmed</span>
            <span className="w-key-item"><b className="w-key-ini w-struck">AB</b> does not count</span>
            <Shape cls="k-open">Dashed outline: needs more</Shape>
            <Shape cls="k-twice">Ring: two places</Shape>
            <Shape cls="k-licence">Dotted: licence</Shape>
            <Shape cls="k-closed hatch">Hatched: closed</Shape>
          </>
        ) : (
          <>
            <span className="w-key-item"><b className="w-key-ini">EST</b> store they work at</span>
            <span className="w-key-item"><b className="w-key-ini">OFF</b> away (approved)</span>
            <span className="w-key-item"><b className="w-key-ini">Req</b> away requested, not approved</span>
            <span className="w-key-item"><b className="w-key-ini">{"–"}</b> not scheduled</span>
            <Shape cls="k-twice">Ring: two places</Shape>
          </>
        )}
        {ghosts && <span className="w-key-item"><b className="w-key-ini">+</b> would be added <b className="w-key-ini">{"−"}</b> would be removed</span>}
      </div>
    </div>
  );
}
