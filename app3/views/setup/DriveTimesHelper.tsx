// Stores > drive times that are missing. Shown only when a store has no drive time with another active store (a store was just added, say).
// One small list: a row per missing pair with empty minutes and miles. Nothing is filled in unless the DM types it or clicks the "nearest
// store" button, which copies that store's own numbers as a starting guess to check. Blank rows stay unknown and are never saved as zero.
import { useMemo, useState } from "react";
import type { Edit } from "@domain";
import { useApp } from "../../store.ts";
import { Btn, GLYPH, cx } from "../../ui/primitives.tsx";
import { TipButton } from "../chrome/Title.tsx";
import { distanceEdits, guessFromNearest, missingDistances, nearestStore, parseMilesText, parseWholeMinutes } from "./lib.ts";
import { inputCls, useLocked } from "./shared.tsx";

type Row = { min: string; mi: string; copied: boolean };

export function DriveTimesHelper({ open, onOpen, focusStoreId }: { open: boolean; onOpen: (o: boolean) => void; focusStoreId: string | null }) {
  const world = useApp((s) => s.world)!;
  const asOf = useApp((s) => s.asOf);
  const commit = useApp((s) => s.commit);
  const locked = useLocked();
  const st = world.state;
  const missing = useMemo(() => missingDistances(st, asOf), [st, asOf]);
  const [pick, setPick] = useState<string | null>(null);
  const [vals, setVals] = useState<Record<string, Row>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  if (missing.length === 0) return null;

  const current = missing.find((m) => m.storeId === (pick ?? focusStoreId)) ?? missing[0]!;
  const store = st.stores[current.storeId]!;
  const code = (id: string) => st.stores[id]?.code ?? id;
  const key = (other: string) => `${store.id}|${other}`;
  const get = (other: string): Row => vals[key(other)] ?? { min: "", mi: "", copied: false };
  const set = (other: string, part: Partial<Row>) => setVals((v) => ({ ...v, [key(other)]: { ...get(other), ...part } }));

  const nearest = nearestStore(st, store.id, asOf);
  const guesses = nearest ? current.partners.filter((p) => guessFromNearest(st, nearest, p.otherId)) : [];

  const copyNearest = () => {
    if (!nearest) return;
    setVals((v) => {
      const next = { ...v };
      for (const p of current.partners) {
        const g = guessFromNearest(st, nearest, p.otherId);
        const cur = next[key(p.otherId)] ?? { min: "", mi: "", copied: false };
        // Only blank boxes are filled: what the DM already typed stays.
        if (g && !cur.min.trim() && !cur.mi.trim()) next[key(p.otherId)] = { min: String(g.minutes), mi: String(g.miles), copied: true };
      }
      return next;
    });
    setErrors({});
  };

  const save = () => {
    const edits: Edit[] = [];
    const errs: Record<string, string> = {};
    let pairs = 0;
    for (const p of current.partners) {
      const v = get(p.otherId);
      if (!v.min.trim() && !v.mi.trim()) continue;
      const m = parseWholeMinutes(v.min);
      const mi = parseMilesText(v.mi);
      if (m === null || mi === null) { errs[p.otherId] = "Needs both: minutes (a whole number) and miles."; continue; }
      const e = distanceEdits(st, store.id, p.otherId, m, mi);
      if (e.length) { edits.push(...e); pairs += 1; }
    }
    setErrors(errs);
    if (Object.keys(errs).length || edits.length === 0) return;
    if (commit(edits, `Added ${pairs} drive ${pairs === 1 ? "time" : "times"} for ${store.code}.`)) {
      setVals((v) => { const n = { ...v }; for (const p of current.partners) delete n[key(p.otherId)]; return n; });
    }
  };

  const typed = current.partners.filter((p) => get(p.otherId).min.trim() || get(p.otherId).mi.trim()).length;
  const total = missing.reduce((n, m) => n + m.partners.length, 0);

  return (
    <section aria-label="Drive times that are missing" data-testid="new-store-distances" className="rounded-md bg-warn-bg/60 ring-1 ring-warn/25">
      <button type="button" aria-expanded={open} onClick={() => onOpen(!open)} className="flex min-h-10 w-full items-center gap-2 px-3 py-2 text-left text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink">
        <span aria-hidden className="text-warn">{GLYPH.warning}</span>
        <span className="flex-1">
          {missing.length === 1
            ? <><strong>{store.code}</strong> has no drive time with {current.partners.length} {current.partners.length === 1 ? "store" : "stores"}.</>
            : <>{missing.length} stores have no drive time with some other stores ({total} in all).</>}
        </span>
        <span className="font-semibold text-ink">{open ? "Hide" : "Add them"}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-warn/20 bg-white/70 p-3">
          <div className="flex flex-wrap items-end gap-3">
            {missing.length > 1 && (
              <label className="flex flex-col gap-1 text-xs font-semibold text-muted">Store
                <select value={current.storeId} onChange={(e) => { setPick(e.target.value); setErrors({}); }} className={cx(inputCls, "pr-6 font-normal text-ink")}>
                  {missing.map((m) => <option key={m.storeId} value={m.storeId}>{code(m.storeId)} ({m.partners.length} missing)</option>)}
                </select>
              </label>
            )}
            <Btn disabled={!nearest || guesses.length === 0} onClick={copyNearest} aria-label={nearest ? `Start from the numbers of ${code(nearest)}, the nearest store` : "Start from the nearest store"}
              data-tip={nearest ? `Nearest store | ${code(nearest)} is the closest ${store.code} has a drive time with | This copies ${code(nearest)}'s own drive times as a starting guess | Check each one before you save` : "Nearest store | No drive time is known for this store yet"}>
              Start from {nearest ? code(nearest) : "the nearest store"}
            </Btn>
            <TipButton title="Missing drive times" tip="One way, from a map. | A row you leave blank stays unknown: it is never saved as zero. | Roads are the same both ways, so one entry fills both directions that are missing." />
          </div>

          <ul aria-label={`Drive times for ${store.code}`} className="flex max-h-[45vh] flex-col overflow-y-auto">
            {current.partners.map((p) => {
              const v = get(p.otherId);
              const err = errors[p.otherId];
              return (
                <li key={p.otherId} data-missing-pair={`${store.code}|${code(p.otherId)}`} className="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-x-3 gap-y-0.5 border-b border-line/60 py-1.5 last:border-0 sm:grid-cols-[8rem_6rem_6rem_minmax(0,1fr)]">
                  <span className="text-sm"><strong>{store.code}</strong> <span className="text-muted">and</span> <strong>{code(p.otherId)}</strong></span>
                  <input aria-label={`Minutes between ${store.code} and ${code(p.otherId)}`} inputMode="numeric" placeholder="minutes" value={v.min} aria-invalid={!!err}
                    onChange={(e) => set(p.otherId, { min: e.target.value.replace(/[^\d]/g, "").slice(0, 4), copied: false })} className={cx(inputCls, "w-24 tabular-nums")} />
                  <input aria-label={`Miles between ${store.code} and ${code(p.otherId)}`} inputMode="decimal" placeholder="miles" value={v.mi} aria-invalid={!!err}
                    onChange={(e) => set(p.otherId, { mi: e.target.value.replace(/[^\d.]/g, "").slice(0, 7), copied: false })} className={cx(inputCls, "w-24 tabular-nums")} />
                  <span className="min-w-0 text-xs text-muted">
                    {err ? <span role="alert" className="text-illegal">{GLYPH.warning} {err}</span> : v.copied && nearest ? `Copied from ${code(nearest)}. Check it.` : !p.missingForward || !p.missingBack ? "One way is known already." : ""}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center gap-2">
            <Btn tone="ink" disabled={!!locked || typed === 0} onClick={save}>{typed ? `Save ${typed} drive ${typed === 1 ? "time" : "times"}` : "Save drive times"}</Btn>
            {locked && <p className="text-xs text-muted">{locked}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
