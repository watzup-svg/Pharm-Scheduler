// Store x store matrix of one-way drive times, row = from, column = to. Unknown is a "?" cell, never 0.
import type { DomainState } from "@domain";
import { cx } from "../../ui/primitives.tsx";
import { levelOf, pairKey, sortedStores } from "./travel-util.ts";

export type Mode = "minutes" | "miles";
export type PairRef = { from: string; to: string };

export function TravelMatrix({ state, mode, selected, onSelect }: { state: DomainState; mode: Mode; selected: PairRef | null; onSelect: (p: PairRef) => void }) {
  const stores = sortedStores(state);
  const cfg = state.config;
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-cream">
      <table className="border-collapse text-xs" aria-label={`Drive ${mode} between stores, one way, from the row store to the column store`}>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 bg-cream px-1.5 text-left font-semibold text-muted">From \ To</th>
            {stores.map((c) => (
              <th key={c.id} scope="col" className="min-w-10 px-0.5 text-center font-semibold" title={c.name}>{c.code}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stores.map((r) => (
            <tr key={r.id}>
              <th scope="row" className="sticky left-0 z-10 bg-cream px-1.5 text-left font-semibold" title={r.name}>{r.code}</th>
              {stores.map((c) => {
                if (r.id === c.id) {
                  return <td key={c.id} aria-label={`${r.code} to ${c.code}: same store`} className="h-8 bg-fill text-center text-muted">–</td>;
                }
                const pair = state.travel[pairKey(r.id, c.id)];
                const sel = selected?.from === r.id && selected.to === c.id;
                const level = pair ? levelOf(pair.minutes, cfg) : "ok";
                const label = pair
                  ? `${r.code} to ${c.code}: ${pair.minutes} minutes, ${pair.miles} miles${level === "hard" ? ", over the hard limit" : level === "soft" ? ", over the soft limit" : ""}`
                  : `${r.code} to ${c.code}: unknown`;
                const text = !pair ? "?" : `${level === "hard" ? "!" : level === "soft" ? "▲" : ""}${mode === "minutes" ? pair.minutes : Math.round(pair.miles)}`;
                return (
                  <td key={c.id} className="p-0">
                    <button
                      type="button"
                      aria-label={label}
                      aria-pressed={sel}
                      data-pair={`${r.id}|${c.id}`}
                      data-level={pair ? level : "unknown"}
                      onClick={() => onSelect({ from: r.id, to: c.id })}
                      className={cx(
                        "h-8 w-full min-w-10 border px-0.5 text-center tabular-nums focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink",
                        pair ? "border-transparent hover:border-edge" : "border-dashed border-ink/60 bg-paper font-bold text-ink",
                        pair && level === "soft" && "bg-warn-bg font-semibold text-warn",
                        pair && level === "hard" && "bg-illegal-bg font-semibold text-illegal",
                        sel && "outline-2 -outline-offset-2 outline-ink",
                      )}
                    >
                      {text}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
