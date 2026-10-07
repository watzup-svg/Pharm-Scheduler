// The left list on Plan ahead: every coming month as a card (empty, drafting, ready, posted), with how much is filled and what is left to do. Click a month to open it.
import { useMemo } from "react";
import { useApp } from "../../store.ts";
import { cx } from "../../ui/primitives.tsx";
import { monthBounds, monthName, monthStatus, nextMonthFrom, shiftYm, type MonthKind } from "./lib.ts";
import { useAheadUi } from "./ui.ts";

export const KIND_WORD: Record<MonthKind, string> = { empty: "Empty", drafting: "Drafting", ready: "Ready to post", posted: "Posted" };
const KIND_CLS: Record<MonthKind, string> = {
  empty: "bg-fill text-muted ring-line",
  drafting: "bg-[#f2da8f] text-warn ring-[#d3b341]",
  ready: "bg-ok-lite text-ok ring-ok/40",
  posted: "bg-ink text-white ring-ink",
};
export const KindChip = ({ kind, rev }: { kind: MonthKind; rev?: number | null }) => (
  <span data-month-kind={kind} className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset", KIND_CLS[kind])}>{kind === "posted" && rev ? `Posted · rev ${rev}` : KIND_WORD[kind]}</span>
);

export function openMonth(ym: string) {
  useAheadUi.getState().setMonth(ym);
  const b = monthBounds(ym);
  useApp.getState().setWindow(b.from, b.to);
  useApp.getState().select(null);
}

export function MonthRail() {
  const world = useApp((s) => s.world);
  const asOf = useApp((s) => s.asOf);
  const current = useAheadUi((s) => s.month) ?? nextMonthFrom(asOf);
  const first = nextMonthFrom(asOf);
  const months = useMemo(() => {
    const list = Array.from({ length: 8 }, (_, i) => shiftYm(first, i));
    if (!list.includes(current) && current > first) list.push(current);
    return list.sort();
  }, [first, current]);
  const rows = useMemo(() => (world ? months.map((m) => monthStatus(world, m, asOf)) : []), [world, months, asOf]);
  if (!world) return null;
  return (
    <div className="px-3 py-2.5" data-month-rail>
      <p className="text-xs text-muted">Build the coming months ahead of time. A month is only a draft until you post it.</p>
      <ul className="mt-2 space-y-1.5" aria-label="Coming months">
        {rows.map((m) => {
          const on = m.ym === current;
          const pct = m.needed ? Math.round((m.filled / m.needed) * 100) : 0;
          return (
            <li key={m.ym}>
              <button type="button" onClick={() => openMonth(m.ym)} aria-current={on ? "true" : undefined} data-month={m.ym}
                className={cx("w-full rounded-lg bg-white px-3 py-2 text-left ring-1 focus-visible:outline-2 focus-visible:outline-ink", on ? "ring-2 ring-ink" : "ring-line hover:bg-fill")}>
                <span className="flex items-center justify-between gap-2"><b className="text-sm">{monthName(m.ym)}</b><KindChip kind={m.kind} rev={m.rev} /></span>
                <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-fill" aria-hidden><span className="block h-full rounded-full bg-ok" style={{ width: `${pct}%` }} /></span>
                <span className="mt-1 block text-xs text-muted">{m.kind === "empty" ? "Nothing scheduled yet" : `${m.filled} of ${m.needed} shifts filled${m.open ? ` · ${m.open} open` : ""}${m.problems ? ` · ${m.problems} to fix` : ""}`}</span>
                {(m.waiting > 0 || (m.kind === "posted" && m.editedSince > 0)) && (
                  <span className="mt-0.5 block text-xs font-medium text-warn">
                    {m.waiting > 0 ? `${m.waiting} time-off ${m.waiting === 1 ? "request" : "requests"} waiting` : ""}{m.waiting > 0 && m.kind === "posted" && m.editedSince > 0 ? " · " : ""}{m.kind === "posted" && m.editedSince > 0 ? `${m.editedSince} changed since posting` : ""}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <label className="mt-3 block text-xs font-semibold text-muted" htmlFor="ahead-pick">Another month</label>
      <input id="ahead-pick" type="month" min={first} value="" onChange={(e) => e.target.value && openMonth(e.target.value)} className="mt-1 h-8 w-full rounded-md border border-edge bg-white px-2 text-sm" aria-label="Open another month" />
    </div>
  );
}
