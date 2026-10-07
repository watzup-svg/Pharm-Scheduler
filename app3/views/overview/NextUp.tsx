// Next up: the next five problems, each with one button. Open shifts get "Find cover" (the same search as the queue; the ways to cover
// show right underneath); a broken rule gets "Fix" (the wall at that day with the person selected). "See all" opens the problem list.
import { useApp } from "../../store.ts";
import { Btn } from "../../ui/primitives.tsx";
import { StateMark } from "../../ui/icons.tsx";
import { HexBadge } from "../../ui/HexBadge.tsx";
import { fmtDate } from "../../copy.ts";
import { RepairOptions } from "../chrome/RepairOptions.tsx";
import { findCover, seeAllProblems, showOnWall, showProblem } from "./actions.ts";
import { markOfProblem, type MonthFacts } from "./facts.ts";
import { nextProblems } from "./lib.ts";
import type { MarkKind } from "../../ui/icons.tsx";

const stripCode = (text: string, code: string) => text.replace(new RegExp(`^${code}\\s+`), "");

export function NextUp({ m }: { m: MonthFacts }) {
  const codeOfStore = (id: string | undefined) => (id ? useApp.getState().world?.state.stores[id]?.code ?? "" : "");
  const busy = useApp((s) => s.busy);
  const proposal = useApp((s) => !!s.world?.session.proposal);
  const queueOpen = useApp((s) => s.drawer && s.leftTab === "queue");
  const list = nextProblems(m.problems, m.asOf, 5);
  const off = !!busy || proposal;
  const why = busy ? `${busy} is running.` : proposal ? "Accept or discard the open preview first." : undefined;
  return (
    <section aria-labelledby="ov-next">
      <div className="flex items-baseline justify-between">
        <h2 id="ov-next" className="text-xs font-semibold uppercase tracking-wide text-muted">Next up</h2>
        {m.problems.length > list.length && <button type="button" onClick={seeAllProblems} className="rounded px-1.5 text-sm text-muted underline underline-offset-2 hover:bg-fill hover:text-ink focus-visible:outline-2 focus-visible:outline-ink">See all {m.problems.length}</button>}
      </div>
      {list.length === 0 ? (
        <p role="status" className="mt-3 flex items-center gap-2 text-sm text-ok"><span aria-hidden>✓</span> Nothing needs a look.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line/60" aria-label="Next problems" data-next-up>
          {list.map((p) => (
            <li key={p.key} data-problem={p.key} className="flex items-center gap-3 py-2">
              <StateMark kind={(markOfProblem(p) as MarkKind)} size={20} />
              <button type="button" onClick={() => showProblem(p)} data-tip={`${fmtDate(p.date)} | ${p.text} | Open it on the wall`}
                className="min-w-0 flex-1 rounded text-left text-sm hover:bg-fill focus-visible:outline-2 focus-visible:outline-ink">
                <span className="font-semibold">{fmtDate(p.date)}</span><span className="text-muted"> · </span>
                {p.kind === "open" && <HexBadge label={codeOfStore(p.storeIds[0])} size={28} className="mx-0.5 align-middle" />}<span className="text-muted">{p.kind === "open" ? ` ${stripCode(p.text, codeOfStore(p.storeIds[0]))}` : p.text}</span>
              </button>
              {p.kind === "open"
                ? <Btn disabled={off} title={why} aria-label={`Find cover: ${fmtDate(p.date)}, ${p.text}`} onClick={() => findCover(p)}>Find cover</Btn>
                : <Btn aria-label={`Fix: ${fmtDate(p.date)}, ${p.text}`} onClick={() => showProblem(p)}>Fix</Btn>}
            </li>
          ))}
        </ul>
      )}
      {!queueOpen && (
        <div onClick={(e) => {
          // Preview opens the proposal; take the person to the wall to see its ghost marks.
          if (!(e.target as HTMLElement).closest('button[aria-label^="Preview option"]')) return;
          const g = useApp.getState().repairResult?.gaps[0];
          if (g) showOnWall(g.storeId, g.date);
        }}><RepairOptions where="queue" /></div>
      )}
    </section>
  );
}
