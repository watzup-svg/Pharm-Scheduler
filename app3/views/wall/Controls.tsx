import { useState } from "react";
import { useApp, type Axis } from "../../store.ts";
import { GLYPH } from "../../ui/primitives.tsx";
import { widthKind, windowFor, type WidthKind } from "./model.ts";

const WIDTHS: { kind: Exclude<WidthKind, "custom">; label: string }[] = [
  { kind: "2w", label: "2 weeks" },
  { kind: "4w", label: "4 weeks" },
  { kind: "month", label: "Month" },
];

export function Controls({ preview, whatIf, ghosts }: { preview: boolean; whatIf: boolean; ghosts: boolean }) {
  const win = useApp((s) => s.window);
  const asOf = useApp((s) => s.asOf);
  const axis = useApp((s) => s.axis);
  const setAxis = useApp((s) => s.setAxis);
  const kind = widthKind(win);
  const [legend, setLegend] = useState(() => {
    try { return localStorage.getItem("v3.wall.legend") !== "closed"; } catch { return true; }
  });
  const toggleLegend = () => {
    setLegend(!legend);
    try { localStorage.setItem("v3.wall.legend", legend ? "closed" : "open"); } catch { /* not kept; fine */ }
  };

  const goToday = () => {
    const st = useApp.getState();
    if (asOf < win.from || asOf > win.to) {
      const k: Exclude<WidthKind, "custom"> = kind === "custom" ? "4w" : kind;
      st.setWindow(windowFor(k, asOf).from, windowFor(k, asOf).to);
    }
    // Bring the as-of column into view whether or not the window moved.
    requestAnimationFrame(() => document.querySelector<HTMLElement>(".w-asof-head")?.scrollIntoView({ inline: "center", block: "nearest" }));
  };

  return (
    <div className="shrink-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-cream px-3 py-1.5">
        <div className="flex items-center gap-1" role="group" aria-label="Move the window">
          <button type="button" className="w-btn" onClick={() => useApp.getState().shiftWindow(-7)} aria-label="Previous week">{"‹"} Prev</button>
          <button type="button" className="w-btn" onClick={goToday}>Today</button>
          <button type="button" className="w-btn" onClick={() => useApp.getState().shiftWindow(7)} aria-label="Next week">Next {"›"}</button>
        </div>
        <div className="w-seg" role="group" aria-label="How much to show">
          {WIDTHS.map((w) => (
            <button key={w.kind} type="button" aria-pressed={kind === w.kind} onClick={() => { const x = windowFor(w.kind, asOf); useApp.getState().setWindow(x.from, x.to); }}>{w.label}</button>
          ))}
        </div>
        <div className="w-seg" role="group" aria-label="Rows">
          {(["store", "pharmacist"] as Axis[]).map((a) => (
            <button key={a} type="button" aria-pressed={axis === a} onClick={() => setAxis(a)}>{a === "store" ? "Stores" : "Pharmacists"}</button>
          ))}
        </div>
        <button type="button" className="w-btn ml-auto" aria-expanded={legend} aria-controls="wall-legend" onClick={toggleLegend}>{legend ? "Hide legend" : "Legend"}</button>
      </div>
      {preview && <div role="status" className="w-strip"><b>Preview:</b> nothing is saved until you accept.</div>}
      {whatIf && <div role="status" className="w-strip"><b>What-if</b> (not saved).</div>}
      {legend && <Legend axis={axis} ghosts={ghosts} />}
    </div>
  );
}

function Legend({ axis, ghosts }: { axis: Axis; ghosts: boolean }) {
  const K = ({ g, children }: { g: string; children: string }) => <span><span className="k">{g}</span> {children}</span>;
  return (
    <div id="wall-legend" className="w-legend text-xs">
      {axis === "store" ? (
        <>
          <K g="AB">working</K>
          <span><span className="k italic" style={{ textDecoration: "underline dashed" }}>AB</span> not confirmed</span>
          <span><span className="k" style={{ textDecoration: "line-through", color: "var(--color-illegal)" }}>AB</span> does not count</span>
          <K g={GLYPH.open}>open spot</K>
          <K g={GLYPH.locum}>locum</K>
          <K g={GLYPH.short}>accepted short</K>
          <K g={GLYPH.pin}>pinned</K>
          <K g={"\u00bd"}>part day</K>
          <K g={GLYPH.serious}>problem</K>
          <K g={GLYPH.warning}>warning</K>
          <K g={GLYPH.info}>to check</K>
          <span><span className="k hatch" style={{ border: "1px solid var(--color-edge)", height: 14, verticalAlign: "middle" }}>{"\u00a0"}</span> closed</span>
        </>
      ) : (
        <>
          <K g="EST">store they work at</K>
          <K g={"\u2013"}>not scheduled</K>
          <K g="OFF">away (approved)</K>
          <K g="Req">away requested, not approved</K>
          <K g={GLYPH.serious}>booked twice, or away</K>
          <K g={GLYPH.warning}>warning</K>
          <K g={GLYPH.pin}>pinned</K>
          <K g={"\u00bd"}>part day</K>
        </>
      )}
      {ghosts && (
        <>
          <span><span className="k">+</span> would be added (dashed box)</span>
          <span><span className="k">{"\u2212"}</span> would be removed (struck)</span>
        </>
      )}
    </div>
  );
}
