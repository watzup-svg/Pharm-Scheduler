// Inspector for one store on one day: who is working, the next step (top three, all, then search wider), and everything else behind one disclosure.
import { useMemo, useState } from "react";
import { type DomainState, type Evaluation, type ISODate } from "@domain";
import { buildCellView, evaluateCached, useEvaluation, useViewState, type CellView } from "../../derive.ts";
import { fmtDate } from "../../copy.ts";
import { useApp } from "../../store.ts";
import { HexBadge, type HexStatus } from "../../ui/HexBadge.tsx";
import { Section } from "../../ui/primitives.tsx";
import { Assignments } from "./Assignments.tsx";
import { CellControls } from "./CellControls.tsx";
import { Choices } from "./Choices.tsx";
import { MultiMovePlans } from "./FindCover.tsx";
import { numWord, useLock, weekdayName, type Ctx } from "./lib.ts";
import { Act, Disclosure } from "./ui.tsx";

export function StoreCell({ storeId, date }: { storeId: string; date: ISODate }) {
  const vs = useViewState();
  const winEv = useEvaluation();
  const asOf = useApp((s) => s.asOf);
  const lock = useLock();
  const [swapId, setSwapId] = useState<string | null>(null);
  const [hideNext, setHideNext] = useState(false);

  // The window evaluation normally has this cell; if the day is outside it, evaluate that one day.
  const ev: Evaluation | null = useMemo(() => {
    if (!vs) return null;
    if (winEv?.cells[`${storeId}|${date}`]) return winEv;
    return evaluateCached(vs.state, asOf, { range: { from: date, to: date }, includeRequested: vs.scenario });
  }, [vs, winEv, storeId, date, asOf]);
  const cv = useMemo(() => (vs && ev ? buildCellView(vs.state, ev, storeId, date) : null), [vs, ev, storeId, date]);

  if (!vs || !ev || !cv) return null;
  const store = vs.state.stores[storeId];
  if (!store) return <p className="p-3 text-sm text-muted">That store is not in the schedule any more.</p>;
  const ctx: Ctx = { state: vs.state, ev, asOf, lock, storeId, date, cv };
  const swapping = swapId ? cv.assignments.find((a) => a.id === swapId) ?? null : null;
  const status = statusOf(vs.state, cv);
  const hex: HexStatus = cv.closed ? "closed" : cv.open > 0 ? "fix" : "ok";
  const needsPeople = !cv.closed && cv.open > 0;

  return (
    <div>
      <header className="border-b border-line px-3 py-2.5">
        <div className="flex items-center gap-2">
          <HexBadge label={store.code} status={hex} size={30} />
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold" title={store.name}>{store.name}</h2>
          <button type="button" onClick={() => useApp.getState().select(null)} className="shrink-0 rounded-md px-1.5 text-xs text-muted underline focus-visible:outline-2 focus-visible:outline-ink" aria-label="Clear the selection">Clear</button>
        </div>
        <p className="mt-1 text-sm text-muted">{fmtDate(date)}{date < asOf ? " (past)" : ""}</p>
        <p className="text-sm font-semibold" data-testid="cell-status">{status}</p>
      </header>

      {cv.assignments.length > 0 && <Section title="Working here"><Assignments ctx={ctx} swapId={swapId} onSwap={setSwapId} /></Section>}
      {(needsPeople || swapping) && (
        <Section title={swapping ? "Swap in" : "Next step"}>
          {!swapping && (
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-xs text-muted">Best fits first. The top three are shown.</p>
              <Act pressed={!hideNext} onClick={() => setHideNext(!hideNext)} aria-expanded={!hideNext}>{hideNext ? "Show" : "Minimise"}</Act>
            </div>
          )}
          {(swapping || !hideNext) && (
            <>
              <Choices key={swapId ?? "add"} ctx={ctx} replace={swapping} onDone={() => setSwapId(null)} />
              <MultiMovePlans key={swapId ?? "add"} ctx={ctx} swapAssignmentId={swapping?.id ?? null} />
            </>
          )}
        </Section>
      )}
      <div className="px-3 py-2">
        <Disclosure label="More for this day">
          <CellControls ctx={ctx} />
          {!cv.closed && !needsPeople && !swapping && <AddAnother ctx={ctx} />}
        </Disclosure>
      </div>
    </div>
  );
}

/** A covered day can still take another person; the list opens only when asked for. */
function AddAnother({ ctx }: { ctx: Ctx }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 border-t border-line pt-2">
      <Act pressed={open} onClick={() => setOpen(!open)}>Add another person</Act>
      {open && <div className="mt-1.5"><Choices ctx={ctx} replace={null} onDone={() => setOpen(false)} /></div>}
    </div>
  );
}

/** One plain status sentence, in the old voice. */
export function statusOf(state: DomainState, cv: CellView): string {
  const store = state.stores[cv.storeId];
  const note = state.dateOverrides[`${cv.storeId}|${cv.date}`]?.note;
  const cov = cv.cov;
  if (cv.closed) {
    const inactive = store && ((store.inactiveFrom !== undefined && store.inactiveFrom <= cv.date) || (store.activeFrom !== undefined && store.activeFrom > cv.date));
    return `Closed: ${note ? note : inactive ? "store not active" : `not open on ${weekdayName(cv.date)}s`}`;
  }
  if (cv.open > 0) return `Needs ${cv.open} more`;
  if (cv.acceptedShort > 0 && (cov?.covered ?? 0) < cv.required) return "Accepted short";
  if ((cov?.surplus ?? 0) > 0) return `Covered with ${numWord(cov?.surplus ?? 0)} extra`;
  return "Covered";
}
