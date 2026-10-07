// Plan ahead: the schedule for a coming month, built before it starts. Same grid and Inspector as the Schedule; the bar above says where the month
// stands and offers Build, Improve and Post. The month is a draft until it is posted, and can still be edited after (the bar then counts what changed).
import { useEffect } from "react";
import { useApp } from "../../store.ts";
import { Btn } from "../../ui/primitives.tsx";
import { Wall } from "../Wall.tsx";
import { KindChip, openMonth } from "./MonthRail.tsx";
import { monthName, monthStatus, nextMonthFrom, shiftYm } from "./lib.ts";
import { useAheadUi } from "./ui.ts";
import { useMemo } from "react";

export function useAheadMonth(): string {
  const asOf = useApp((s) => s.asOf);
  return useAheadUi((s) => s.month) ?? nextMonthFrom(asOf);
}

export function Ahead() {
  const world = useApp((s) => s.world);
  const asOf = useApp((s) => s.asOf);
  const busy = useApp((s) => s.busy);
  const proposal = !!world?.session.proposal;
  const month = useAheadMonth();
  const first = nextMonthFrom(asOf);
  // Opening the screen shows the month: the grid's window follows it.
  useEffect(() => { openMonth(month); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const s = useMemo(() => (world ? monthStatus(world, month, asOf) : null), [world, month, asOf]);
  if (!world || !s) return null;
  const locked = proposal || !!world.session.scenario && !world.session.scenario.parked;
  const post = () => useApp.getState().post({ from: s.from, to: s.to });
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-dashed border-warn/50 bg-[repeating-linear-gradient(135deg,#fbf3d6_0_10px,#fdf8e6_10px_20px)] px-3 py-1.5" data-ahead-bar>
        <div className="flex items-center gap-1" role="group" aria-label="Month">
          <button type="button" className="w-btn" disabled={month <= first} onClick={() => openMonth(shiftYm(month, -1))} aria-label="Previous month">{"‹"}</button>
          <b className="min-w-36 text-center text-base" data-ahead-month>{monthName(month)}</b>
          <button type="button" className="w-btn" onClick={() => openMonth(shiftYm(month, 1))} aria-label="Next month">{"›"}</button>
        </div>
        <KindChip kind={s.kind} rev={s.rev} />
        <span className="text-sm text-ink/80" data-ahead-summary>
          {s.kind === "posted"
            ? s.editedSince ? `Edited since posting: ${s.editedSince} ${s.editedSince === 1 ? "person-day" : "person-days"} differ from revision ${s.rev}.` : `Revision ${s.rev} is out and nothing has changed since.`
            : "Draft: not posted yet, so nobody has been told."}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Btn tone={s.kind === "empty" || s.open > 0 ? "ink" : "quiet"} disabled={locked || !!busy} onClick={() => useApp.getState().runBuild({ from: s.from, to: s.to })} title="Place the usual patterns and fill what is left, for this month. Nothing changes until you accept.">Build this month</Btn>
          <Btn disabled={locked || !!busy} onClick={() => useApp.getState().runImprove()} title="Look for a better arrangement of this month. Nothing changes until you accept.">Improve</Btn>
          <Btn tone={s.kind === "ready" || (s.kind === "posted" && s.editedSince > 0) ? "ink" : "quiet"} disabled={locked || s.kind === "empty" || (s.kind === "posted" && s.editedSince === 0)} onClick={post} title={s.kind === "posted" ? `Saves a new copy of the month as revision ${(s.rev ?? 0) + 1}` : "Saves a copy of this month. You can keep editing afterwards."}>
            {s.kind === "posted" ? `Post revision ${(s.rev ?? 0) + 1}` : "Post this month"}
          </Btn>
        </div>
      </div>
      <div className="min-h-0 flex-1"><Wall /></div>
    </div>
  );
}
