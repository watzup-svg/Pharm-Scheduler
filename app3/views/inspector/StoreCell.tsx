// Inspector for one store on one day.
import { useMemo, useState } from "react";
import { api, type DomainState, type Evaluation, type ISODate } from "@domain";
import { buildCellView, useEvaluation, useViewState, type CellView } from "../../derive.ts";
import { useApp } from "../../store.ts";
import { Chip, Section, type ChipTone } from "../../ui/primitives.tsx";
import { Assignments } from "./Assignments.tsx";
import { CellControls } from "./CellControls.tsx";
import { Choices } from "./Choices.tsx";
import { FindCover } from "./FindCover.tsx";
import { longDate, numWord, plural, useLock, weekdayName, type Ctx } from "./lib.ts";

export function StoreCell({ storeId, date }: { storeId: string; date: ISODate }) {
  const vs = useViewState();
  const winEv = useEvaluation();
  const asOf = useApp((s) => s.asOf);
  const lock = useLock();
  const [swapId, setSwapId] = useState<string | null>(null);

  // The window evaluation normally has this cell; if the day is outside it, evaluate that one day.
  const ev: Evaluation | null = useMemo(() => {
    if (!vs) return null;
    if (winEv?.cells[`${storeId}|${date}`]) return winEv;
    return api.evaluate(vs.state, asOf, { range: { from: date, to: date }, includeRequested: vs.scenario });
  }, [vs, winEv, storeId, date, asOf]);
  const cv = useMemo(() => (vs && ev ? buildCellView(vs.state, ev, storeId, date) : null), [vs, ev, storeId, date]);

  if (!vs || !ev || !cv) return null;
  const store = vs.state.stores[storeId];
  if (!store) return <p className="p-3 text-sm text-muted">That store is not in the schedule any more.</p>;
  const ctx: Ctx = { state: vs.state, ev, asOf, lock, storeId, date, cv };
  const swapping = swapId ? cv.assignments.find((a) => a.id === swapId) ?? null : null;
  const st = statusOf(vs.state, cv);
  const showChoices = !cv.closed || swapping || cv.assignments.length === 0;

  return (
    <div>
      <header className="border-b border-line px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold" title={store.name}>{store.name}</h2>
            <p className="text-sm text-muted">{store.code}{store.state ? ` · ${store.state}` : ""}</p>
          </div>
          <button type="button" onClick={() => useApp.getState().select(null)} className="shrink-0 rounded-md px-1.5 text-xs text-muted underline focus-visible:outline-2 focus-visible:outline-ink" aria-label="Clear the selection">Clear</button>
        </div>
        <p className="mt-1 text-sm">{longDate(date)}{date < asOf ? <span className="text-muted"> (already past)</span> : null}</p>
        <div className="mt-1.5 flex items-start gap-1.5">
          {st.glyph ? <Chip tone={st.tone} className="shrink-0">{st.glyph}</Chip> : null}
          <div>
            <p className="text-sm font-semibold" data-testid="cell-status">{st.text}</p>
            <p className="text-xs text-muted" data-testid="cell-counts">{st.detail}</p>
          </div>
        </div>
      </header>

      <Section title="Working here"><Assignments ctx={ctx} swapId={swapId} onSwap={setSwapId} /></Section>
      {cv.open > 0 && <Section title="Fill this day"><FindCover ctx={ctx} /></Section>}
      {showChoices && (
        <Section title={swapping ? "Swap in" : "Who can work here"}>
          <Choices key={swapId ?? "add"} ctx={ctx} replace={swapping} onDone={() => setSwapId(null)} />
        </Section>
      )}
      <Section title="Change this day"><CellControls ctx={ctx} /></Section>
    </div>
  );
}

/** The plain status sentence and the counts in words. */
export function statusOf(state: DomainState, cv: CellView): { text: string; detail: string; tone: ChipTone; glyph: string } {
  const store = state.stores[cv.storeId];
  const note = state.dateOverrides[`${cv.storeId}|${cv.date}`]?.note;
  const cov = cv.cov;
  const counted = cov?.counted ?? 0;
  const covered = cov?.covered ?? 0;
  const bits: string[] = [];
  if (cv.closed) {
    const inactive = store && ((store.inactiveFrom !== undefined && store.inactiveFrom <= cv.date) || (store.activeFrom !== undefined && store.activeFrom > cv.date));
    const why = note ? note : inactive ? "store not active" : `not open on ${weekdayName(cv.date)}s`;
    return {
      text: `Closed (${why})`, tone: "neutral", glyph: "",
      detail: cv.assignments.length ? "Nobody is needed, so anyone placed here does not count." : "Nobody is needed this day.",
    };
  }
  bits.push(`Needs ${numWord(cv.required)}`);
  bits.push(`${counted === 0 ? "nobody" : numWord(counted)} counted`);
  if (cv.locum) bits.push(`${numWord(cv.locum)} ${plural(cv.locum, "locum", "locums")}`);
  if (cv.acceptedShort) bits.push(`${numWord(cv.acceptedShort)} accepted short`);
  if (cov?.unverified) bits.push(`${numWord(cov.unverified)} not fully checked`);
  const detail = `${bits[0]?.replace(/^./, (c) => c.toUpperCase())}; ${bits.slice(1).join("; ")}.`;
  if (cv.open > 0) return { text: `Needs ${cv.open} more`, detail, tone: "serious", glyph: "!" };
  if (cv.acceptedShort > 0 && covered < cv.required) return { text: "Accepted short", detail, tone: "warning", glyph: "▲" };
  if ((cov?.surplus ?? 0) > 0) return { text: `Covered with ${cov?.surplus} extra`, detail, tone: "ok", glyph: "✓" };
  return { text: "Covered", detail, tone: "ok", glyph: "✓" };
}
