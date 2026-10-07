// What an option does to each store it touches, as a before and after: "EST  Needs 1  →  Covered". Same icons and colours as the Schedule, so a store an
// option fixes and a store it leaves short can be compared at a glance. Read from the live schedule; nothing is applied.
import { useMemo } from "react";
import { applyScratch, type DomainState, type Edit, type ISODate } from "@domain";
import { evaluateCached } from "../../derive.ts";
import { useApp } from "../../store.ts";
import { BlockMark, type MarkKind } from "../../ui/icons.tsx";
import { cx } from "../../ui/primitives.tsx";
import { fmtShort } from "./shared.tsx";

type Cell = { open: number; required: number } | undefined;
type Row = { storeId: string; date: ISODate; before: Cell; after: Cell };

function effectOf(state: DomainState, asOf: ISODate, edits: Edit[]): Row[] | null {
  const next = applyScratch(state, edits);
  if ("refused" in next) return null;
  const touched = new Map<string, { storeId: string; date: ISODate }>();
  const add = (storeId: string, date: ISODate) => touched.set(`${storeId}|${date}`, { storeId, date });
  for (const id of new Set([...Object.keys(state.assignments), ...Object.keys(next.assignments)])) {
    const b = state.assignments[id];
    const a = next.assignments[id];
    if (b && a && b.storeId === a.storeId && b.pharmacistId === a.pharmacistId && b.date === a.date) continue;
    if (b) add(b.storeId, b.date);
    if (a) add(a.storeId, a.date);
  }
  const cells = [...touched.values()].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : (state.stores[x.storeId]?.code ?? "") < (state.stores[y.storeId]?.code ?? "") ? -1 : 1));
  if (!cells.length) return [];
  const range = { from: cells[0]!.date, to: cells[cells.length - 1]!.date };
  const evB = evaluateCached(state, asOf, { range });
  const evA = evaluateCached(next, asOf, { range });
  return cells.map((c) => ({ ...c, before: evB.cells[`${c.storeId}|${c.date}`], after: evA.cells[`${c.storeId}|${c.date}`] }));
}

const look = (c: Cell): { mark: MarkKind; bad: boolean; label: string } =>
  !c || c.required === 0 ? { mark: "closure", bad: false, label: "Closed" } : c.open > 0 ? { mark: "open", bad: true, label: `Needs ${c.open}` } : { mark: "short", bad: false, label: "Covered" };

function Pill({ c }: { c: Cell }) {
  const l = look(c);
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full py-0.5 pl-0.5 pr-2 text-xs font-medium ring-1 ring-inset", l.bad ? "bg-[#f0c4ba] ring-[#d98b7b]" : "bg-ok-lite/70 ring-ok/30")}>
      <BlockMark kind={l.mark} tone={l.bad ? "bad" : "quiet"} size={18} />
      {l.label}
    </span>
  );
}

export function OptionEffect({ edits }: { edits: Edit[] }) {
  const state = useApp((s) => s.world?.state);
  const asOf = useApp((s) => s.asOf);
  const rows = useMemo(() => (state ? effectOf(state, asOf, edits) : null), [state, asOf, edits]);
  if (!state || !rows || !rows.length) return null;
  const dates = new Set(rows.map((r) => r.date));
  return (
    <ul className="mt-1.5 flex flex-col gap-1" aria-label="What this does to each store" data-effect>
      {rows.map((r) => {
        const worse = look(r.after).bad && !look(r.before).bad;
        return (
          <li key={`${r.storeId}|${r.date}`} data-effect-store={r.storeId} data-worse={worse ? "" : undefined} className="flex flex-wrap items-center gap-1.5 text-xs">
            <b className="w-9 shrink-0 text-sm">{state.stores[r.storeId]?.code ?? r.storeId}</b>
            {dates.size > 1 && <span className="shrink-0 text-muted">{fmtShort(r.date)}</span>}
            <Pill c={r.before} />
            <span aria-hidden className="text-muted">{"→"}</span>
            <Pill c={r.after} />
            {worse && <span className="font-semibold text-illegal">left short</span>}
          </li>
        );
      })}
    </ul>
  );
}
