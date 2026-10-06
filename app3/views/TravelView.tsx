// Travel & mileage: the drive-time matrix (the data the travel rules and mileage pay stand on) and the monthly mileage report.
import { useMemo, useRef, useState } from "react";
import { monthOf } from "@domain";
import { useApp } from "../store.ts";
import { Btn } from "../ui/primitives.tsx";
import { TravelMatrix, type Mode, type PairRef } from "./travel/TravelMatrix.tsx";
import { PairEditor } from "./travel/PairEditor.tsx";
import { MileageReport } from "./travel/MileageReport.tsx";
import { MEASURED_ON, measuredFills, pairKey, sortedStores, unknownThatMatter } from "./travel/travel-util.ts";

export function TravelView() {
  const world = useApp((s) => s.world);
  const asOf = useApp((s) => s.asOf);
  const win = useApp((s) => s.window);
  const commit = useApp((s) => s.commit);
  const say = useApp((s) => s.say);
  const [mode, setMode] = useState<Mode>("minutes");
  const [sel, setSel] = useState<PairRef | null>(null);
  const editorTop = useRef<HTMLDivElement>(null);
  const state = world?.state;

  const fills = useMemo(() => (state ? measuredFills(state) : null), [state]);
  const unknown = useMemo(() => (state ? unknownThatMatter(state, asOf) : []), [state, asOf]);
  if (!state || !fills) return null;

  const stores = sortedStores(state);
  const total = stores.length * (stores.length - 1);
  const known = stores.reduce((n, a) => n + stores.filter((b) => a.id !== b.id && state.travel[pairKey(a.id, b.id)]).length, 0);
  const code = (id: string) => state.stores[id]?.code ?? id;

  const choose = (p: PairRef) => {
    setSel(p);
    editorTop.current?.scrollIntoView?.({ block: "nearest" });
  };
  const fill = () => {
    if (fills.added === 0) return;
    if (commit(fills.edits, `Filled ${fills.added} drive times from the Hi-School measured table.`)) say("ok", `Added ${fills.added} drive times (both directions). Existing ones were not changed.`);
  };

  return (
    <div className="px-4 py-3">
      <h1 className="text-lg font-semibold">Travel &amp; mileage</h1>
      <p className="mt-0.5 text-xs text-muted">
        One-way drive from the row store to the column store. Drive times feed the long-drive rules and mileage pay. A pair that is not known stays unknown: it is never treated as zero and the engine never proposes it.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Show" className="inline-flex overflow-hidden rounded-md ring-1 ring-edge">
          {(["minutes", "miles"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={`h-8 px-3 text-sm font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink ${mode === m ? "bg-ink text-white" : "bg-fill text-ink hover:bg-line"}`}>
              {m === "minutes" ? "Minutes" : "Miles"}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted" data-testid="pairs-known">{known} of {total} pairs known</span>
        <span className="flex-1" />
        <Btn onClick={fill} disabled={fills.added === 0} title={`Measured ${MEASURED_ON}. Only fills pairs that are missing.`}>
          Fill the Hi-School measured table{fills.added > 0 ? ` (adds ${fills.added})` : ""}
        </Btn>
        {fills.added === 0 && <span className="text-xs text-muted">Nothing missing from the measured table.</span>}
      </div>
      <p className="mt-1 text-xs text-muted">
        <span aria-hidden>▲</span> over {state.config.travelSoftMinutes} minutes (long drive), <span aria-hidden>!</span> over {state.config.travelHardMinutes} minutes (hard limit), <span aria-hidden>?</span> unknown. Click a cell to change it.
      </p>

      <div className="mt-2">
        <TravelMatrix state={state} mode={mode} selected={sel} onSelect={choose} />
      </div>

      <div ref={editorTop} className="mt-3">
        {sel ? (
          <PairEditor key={pairKey(sel.from, sel.to)} state={state} pair={sel} onClose={() => setSel(null)} />
        ) : (
          <p className="text-xs text-muted">Roads are the same both ways in practice, so changing one cell saves both directions together.</p>
        )}
      </div>

      <section aria-labelledby="unk-h" className="mt-4">
        <h2 id="unk-h" className="text-sm font-semibold">Unknown drive times that matter</h2>
        <p className="text-xs text-muted">From a pharmacist&apos;s base store to any active store. Until these are known, those shifts cannot be fully checked and are never proposed.</p>
        {unknown.length === 0 ? (
          <p className="mt-1 text-sm text-ok">✓ Every pair that matters is known.</p>
        ) : (
          <ul className="mt-1.5 grid gap-1" data-testid="unknown-pairs">
            {unknown.slice(0, 30).map((u) => (
              <li key={pairKey(u.from, u.to)} className="flex items-center gap-2 text-sm">
                <span className="w-24 font-semibold">{code(u.from)} to {code(u.to)}</span>
                <span className="min-w-0 flex-1 truncate text-muted" title={u.names.join(", ")}>{u.names.join(", ")}</span>
                <Btn className="h-7" aria-label={`Add drive time ${code(u.from)} to ${code(u.to)}`} onClick={() => choose({ from: u.from, to: u.to })}>Add</Btn>
              </li>
            ))}
            {unknown.length > 30 && <li className="text-xs text-muted">and {unknown.length - 30} more</li>}
          </ul>
        )}
      </section>

      <MileageReport state={state} initialMonth={monthOf(win.from)} onAddPair={(from, to) => choose({ from, to })} />
    </div>
  );
}
