// Plan: future gaps. Stores by weeks, counting what is still open. Click a week to look at it on the wall.
import { useMemo, useState } from "react";
import { addDays, weekday, type Evaluation, type ISODate } from "@domain";
import { useApp } from "../store.ts";
import { evaluateCached, viewState } from "../derive.ts";
import { Btn, cx, GLYPH } from "../ui/primitives.tsx";
import { describeEdit, fmtShort } from "./chrome/shared.tsx";
import { Title } from "./chrome/Title.tsx";

const WEEKS = 8;

type Cell = { open: number; short: number; firstOpen: ISODate | null };

function tally(ev: Evaluation, storeIds: string[], weekStarts: ISODate[], asOf: ISODate): Map<string, Cell> {
  const out = new Map<string, Cell>();
  const idx = (d: ISODate) => weekStarts.findIndex((w) => d >= w && d <= addDays(w, 6));
  for (const sid of storeIds) for (let i = 0; i < WEEKS; i++) out.set(`${sid}|${i}`, { open: 0, short: 0, firstOpen: null });
  for (const c of Object.values(ev.cells)) {
    if (c.date < asOf) continue;
    const i = idx(c.date);
    const cell = i < 0 ? undefined : out.get(`${c.storeId}|${i}`);
    if (!cell) continue;
    cell.open += c.open;
    cell.short += c.acceptedShort;
    if (c.open > 0 && (cell.firstOpen === null || c.date < cell.firstOpen)) cell.firstOpen = c.date;
  }
  return out;
}

export function Plan() {
  const world = useApp((s) => s.world);
  const asOf = useApp((s) => s.asOf);
  const [name, setName] = useState("");
  const state = world?.state;
  const sc = world?.session.scenario ?? null;
  const showWhatIf = !!sc && !sc.parked;

  const weekStarts = useMemo(() => {
    const start = addDays(asOf, -((weekday(asOf) + 6) % 7));
    return Array.from({ length: WEEKS }, (_, i) => addDays(start, i * 7));
  }, [asOf]);
  const range = useMemo(() => ({ from: asOf, to: addDays(weekStarts[0]!, WEEKS * 7 - 1) }), [asOf, weekStarts]);
  const stores = useMemo(
    () => (state ? Object.values(state.stores).filter((s) => (s.inactiveFrom === undefined || s.inactiveFrom > asOf) && (s.activeFrom === undefined || s.activeFrom <= range.to)).sort((a, b) => a.code.localeCompare(b.code, "en")) : []),
    [state, asOf, range],
  );
  const live = useMemo(() => (state ? tally(evaluateCached(state, asOf, { range, includeRequested: true }), stores.map((s) => s.id), weekStarts, asOf) : null), [state, asOf, range, stores, weekStarts]);
  const what = useMemo(() => {
    if (!world || !showWhatIf) return null;
    const vs = viewState(world);
    return vs.scenario ? tally(evaluateCached(vs.state, asOf, { range, includeRequested: true }), stores.map((s) => s.id), weekStarts, asOf) : null;
  }, [world, showWhatIf, asOf, range, stores, weekStarts]);

  if (!world || !state || !live) return null;
  const busy = !!world.session.proposal;

  const look = (i: number, sid: string | null) => {
    const s = useApp.getState();
    const cell = sid ? (what ?? live).get(`${sid}|${i}`) : undefined;
    const from = weekStarts[i]!;
    s.setWindow(from, addDays(from, 6));
    s.select(sid && cell?.firstOpen ? { storeId: sid, date: cell.firstOpen } : null);
    s.setView("wall");
  };

  const text = (c: Cell) => {
    if (c.open === 0 && c.short === 0) return "–";
    return [c.open > 0 ? `${GLYPH.open} ${c.open}` : "", c.short > 0 ? `${GLYPH.short} ${c.short}` : ""].filter(Boolean).join(" ");
  };
  const cellText = (sid: string, i: number) => {
    const l = live.get(`${sid}|${i}`)!;
    const w = what?.get(`${sid}|${i}`);
    return w ? { text: `${text(l)} → ${text(w)}`, changed: w.open !== l.open || w.short !== l.short, open: w.open } : { text: text(l), changed: false, open: l.open };
  };
  const colTotal = (m: Map<string, Cell>, i: number) => stores.reduce((n, s) => n + m.get(`${s.id}|${i}`)!.open, 0);

  const removeLast = () => {
    if (!sc) return;
    useApp.setState({ world: { ...world, session: { ...world.session, scenario: { ...sc, edits: sc.edits.slice(0, -1) } } } });
  };

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <Title className="text-base font-bold" tip={`Open shifts by week for the next ${WEEKS} weeks, counted as if every time-off request were approved. | ${GLYPH.open} open, ${GLYPH.short} accepted short. | Click a week to see it on the wall.`}>Plan</Title>
            <button type="button" onClick={() => useApp.getState().setView("wall")} className="rounded-md px-2 py-0.5 text-sm font-medium text-muted underline underline-offset-2 hover:bg-fill hover:text-ink focus-visible:outline-2 focus-visible:outline-ink">← Back to the wall</button>
          </div>
          <p className="text-sm text-muted">Open shifts by week, next {WEEKS} weeks. {GLYPH.open} open, {GLYPH.short} accepted short.</p>
        </div>
        {!sc && (
          <form
            className="flex items-end gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              useApp.getState().openScenario(name.trim());
              setName("");
            }}
          >
            <div>
              <label htmlFor="wi-name" className="block text-xs font-medium">What-if name</label>
              <input id="wi-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Close EST on Fridays" className="h-8 w-56 rounded-md border border-edge bg-white px-2 text-sm" />
            </div>
            <Btn type="submit" disabled={busy || !name.trim()} title={busy ? "Accept or discard the open proposal first." : undefined}>Start a what-if</Btn>
          </form>
        )}
      </div>

      {sc && (
        <div className="mt-3 rounded-md bg-warn-bg/60 p-3 text-sm ring-1 ring-inset ring-warn/35" role="region" aria-label="What-if">
          <p className="font-semibold">▲ {sc.parked ? "What-if parked (not saved)" : "What-if open (not saved)"}: {sc.name}</p>
          {sc.parked ? (
            <p className="mt-0.5">{sc.stale ? "The live schedule changed since you parked it, so it can only be discarded." : "It is parked while you work on the live schedule."} Use Someone's out to discard it.</p>
          ) : (
            <>
              <p className="mt-0.5">Cells show live → what-if. Nothing here is saved.</p>
              {sc.edits.length === 0 ? <p className="mt-1">No edits yet.</p> : (
                <ol className="mt-1 list-decimal pl-5">
                  {sc.edits.map((e, i) => <li key={i}>{describeEdit(state, e)}</li>)}
                </ol>
              )}
              <Btn className="mt-2" disabled={sc.edits.length === 0} onClick={removeLast}>Remove last edit</Btn>
            </>
          )}
        </div>
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm" aria-label="Open shifts by week">
          <thead>
            <tr>
              <th scope="col" className="w-44 border-b border-line py-1 pr-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">Store</th>
              {weekStarts.map((w, i) => (
                <th key={w} scope="col" className="border-b border-line px-1 py-1 text-center text-xs font-semibold text-muted">
                  <button type="button" onClick={() => look(i, null)} className="rounded-md px-1.5 hover:bg-fill focus-visible:outline-2 focus-visible:outline-ink" aria-label={`Week of ${fmtShort(w)}`}>
                    {fmtShort(w)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stores.map((s) => (
              <tr key={s.id} className="border-b border-line/60">
                <th scope="row" className="py-0.5 pr-2 text-left text-sm font-medium"><span className="font-semibold">{s.code}</span> <span className="text-muted">{s.name}</span></th>
                {weekStarts.map((w, i) => {
                  const c = cellText(s.id, i);
                  return (
                    <td key={w} className="p-0.5 text-center">
                      <button
                        type="button"
                        onClick={() => look(i, s.id)}
                        aria-label={`${s.code}, week of ${fmtShort(w)}: ${c.text}`}
                        className={cx("h-7 w-full min-w-[60px] rounded-md px-1 text-sm hover:bg-fill focus-visible:outline-2 focus-visible:outline-ink", c.open > 0 ? "bg-illegal-bg font-semibold text-illegal" : "text-muted", c.changed && "ring-2 ring-ink")}
                      >
                        {c.text}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="pr-2 pt-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted">All stores, open</th>
              {weekStarts.map((w, i) => (
                <td key={w} className="pt-1.5 text-center text-sm font-semibold">
                  {what ? `${colTotal(live, i)} → ${colTotal(what, i)}` : colTotal(live, i)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
