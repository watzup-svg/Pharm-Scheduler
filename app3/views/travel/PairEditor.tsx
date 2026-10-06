// Edit one drive time. Saves both directions in one change set: the DM's roads are symmetric in practice.
import { useEffect, useRef, useState } from "react";
import type { DomainState } from "@domain";
import { useApp } from "../../store.ts";
import { Btn } from "../../ui/primitives.tsx";
import { pairKey, parseMiles, parseMinutes } from "./travel-util.ts";
import type { PairRef } from "./TravelMatrix.tsx";

export function PairEditor({ state, pair, onClose }: { state: DomainState; pair: PairRef; onClose: () => void }) {
  const commit = useApp((s) => s.commit);
  const a = state.stores[pair.from], b = state.stores[pair.to];
  const fwd = state.travel[pairKey(pair.from, pair.to)];
  const back = state.travel[pairKey(pair.to, pair.from)];
  const seed = fwd ?? back;
  const [minutes, setMinutes] = useState(seed ? String(seed.minutes) : "");
  const [miles, setMiles] = useState(seed ? String(seed.miles) : "");
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);
  // The parent keys this editor by pair, so choosing another cell starts it fresh.
  useEffect(() => { first.current?.focus(); first.current?.select(); }, []);
  if (!a || !b) return null;

  const save = () => {
    const m = parseMinutes(minutes);
    const mi = parseMiles(miles);
    if (m === null || m < 1) { setError("Minutes must be a whole number of 1 or more."); return; }
    if (mi === null) { setError("Miles must be a number such as 102.1."); return; }
    setError(null);
    const ok = commit(
      [
        { t: "travel.set", pair: { fromStoreId: pair.from, toStoreId: pair.to, minutes: m, miles: mi } },
        { t: "travel.set", pair: { fromStoreId: pair.to, toStoreId: pair.from, minutes: m, miles: mi } },
      ],
      `Updated drive time ${a.code} - ${b.code}.`,
    );
    if (ok) onClose();
  };
  const differs = fwd && back && (fwd.minutes !== back.minutes || fwd.miles !== back.miles);

  return (
    <form
      aria-label={`Edit drive time ${a.code} to ${b.code}`}
      onSubmit={(e) => { e.preventDefault(); save(); }}
      className="rounded-md border border-edge bg-cream p-3"
    >
      <h3 className="text-sm font-semibold">{a.code} and {b.code}: {a.name} to {b.name}</h3>
      <p className="mt-0.5 text-xs text-muted">
        {fwd ? `${a.code} to ${b.code} is now ${fwd.minutes} min, ${fwd.miles} miles.` : `${a.code} to ${b.code} is unknown.`}{" "}
        {back ? `${b.code} to ${a.code} is now ${back.minutes} min, ${back.miles} miles.` : `${b.code} to ${a.code} is unknown.`}
        {differs ? " They differ; saving sets both to the same numbers." : ""}
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-0.5 text-xs font-semibold">
          Minutes (one way)
          <input ref={first} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} aria-invalid={!!error} aria-describedby={error ? "pair-err" : undefined} className="h-8 w-28 rounded-md border border-edge bg-white px-2 text-sm font-normal tabular-nums" />
        </label>
        <label className="flex flex-col gap-0.5 text-xs font-semibold">
          Miles (one way)
          <input inputMode="decimal" value={miles} onChange={(e) => setMiles(e.target.value)} aria-invalid={!!error} className="h-8 w-28 rounded-md border border-edge bg-white px-2 text-sm font-normal tabular-nums" />
        </label>
        <Btn tone="ink" type="submit">Save both directions</Btn>
        <Btn onClick={onClose}>Cancel</Btn>
      </div>
      {error && <p id="pair-err" role="alert" className="mt-1.5 text-xs font-semibold text-illegal">▲ {error}</p>}
    </form>
  );
}
