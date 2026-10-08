// Plans with several moves: the domain's wider repair, run automatically for an open day (or a swap), shown in plain words with a before and after for every store it touches. Nothing is applied here.
import { useEffect, useMemo, useState } from "react";
import type { RepairOption } from "@domain";
import { useApp } from "../../store.ts";
import { Chip } from "../../ui/primitives.tsx";
import { codeOf, nameOf, numWord, plural, type Ctx } from "./lib.ts";
import { Act } from "./ui.tsx";
import { OptionEffect } from "../chrome/OptionEffect.tsx";

/**
 * Plans with several moves for this day (or for this day once a swap has taken someone out): searched automatically as soon as the day is open,
 * so the DM does not have to ask. People on a day off may be asked to take an extra shift; nothing changes until a plan is accepted.
 */
export function MultiMovePlans({ ctx, swapAssignmentId }: { ctx: Ctx; swapAssignmentId?: string | null }) {
  const { state, lock, storeId, date, asOf } = ctx;
  const rr = useApp((s) => s.cellRepair);
  const running = useApp((s) => s.busy);
  const [near, setNear] = useState(false);
  const past = date < asOf;
  const prefix = useMemo(() => (swapAssignmentId ? [{ t: "remove" as const, assignmentId: swapAssignmentId }] : undefined), [swapAssignmentId]);
  const swapKey = prefix ? JSON.stringify(prefix) : undefined;
  const removedPid = swapAssignmentId ? state.assignments[swapAssignmentId]?.pharmacistId : undefined;
  const mine = !!rr && rr.wider && rr.swap === swapKey && rr.gaps.some((g) => g.storeId === storeId && g.date === date);
  const [asked, setAsked] = useState(false);
  const run = () => { setNear(false); void useApp.getState().runRepair([{ storeId, date }], true, prefix, true); };

  // Ask automatically once the day (or the swap) is on screen and nothing else is running; ask again when the schedule changes.
  useEffect(() => {
    setAsked(false);
    if (lock || past) return;
    let t: ReturnType<typeof setTimeout>;
    const tryRun = () => {
      if (useApp.getState().busy) { t = setTimeout(tryRun, 500); return; }
      setAsked(true);
      run();
    };
    t = setTimeout(tryRun, 350);
    return () => clearTimeout(t);
  }, [state, storeId, date, swapKey, lock, past]); // eslint-disable-line react-hooks/exhaustive-deps

  const options = (mine && rr ? rr.result.options : []).filter((o) => !(removedPid && o.edits.some((e) => e.t === "place" && e.pharmacistId === removedPid && e.storeId === storeId && e.date === date)));
  const searching = !!running && !mine;
  return (
    <div className="mt-3 rounded-md bg-fill p-2 text-sm" data-multimove aria-live="polite">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs"><b>Plans with several moves.</b> Where nobody above fits, this tries moving a few people around, and may ask someone on a day off to take an extra shift. Nothing changes until you accept.</p>
        <Act disabled={!!lock || past || !!running} title={lock ?? (past ? "This day has passed" : undefined)} onClick={run}>Search again</Act>
      </div>
      {(searching || (asked && !mine && running)) && <p className="mt-1.5 text-xs text-muted" data-multimove-status="searching">Looking for plans…</p>}
      {running && <div className="mt-1.5"><Act onClick={() => useApp.getState().cancelEngine()}>Cancel</Act></div>}
      {mine && rr && (
        <div className="mt-2">
          {rr.gaps.length > 1 && <p className="mb-1 text-xs text-muted">This search looked at {numWord(rr.gaps.length)} open days together.</p>}
          {rr.result.message && <p data-multimove-status="done">{rr.result.message}</p>}
          {options.length > 0 && (
            <ol className="mt-1 flex flex-col gap-2">
              {options.map((o, i) => <Option key={i} ctx={ctx} option={o} n={i + 1} />)}
            </ol>
          )}
          {options.length === 0 && rr.result.status !== "limit" && rr.result.status !== "cannot-evaluate" && <p className="mt-1 text-muted" data-multimove-status="none">No plan with several moves fits without breaking a rule.</p>}
          {rr.result.excludedUnknownTravel.length > 0 && (
            <p className="mt-2 text-xs text-muted">
              Not considered: drive time not known ({[...new Set(rr.result.excludedUnknownTravel.map((x) => `${state.pharmacists[x.pharmacistId]?.initials ?? x.pharmacistId} to ${codeOf(state, x.storeId)}`))].join(", ")}).
            </p>
          )}
          {rr.result.nearMiss && options.length === 0 && (
            <div className="mt-2">
              <Act pressed={near} onClick={() => setNear(!near)}>{near ? "Hide the closest option" : "Show the closest option"}</Act>
              {near && (
                <div className="mt-1.5">
                  <p className="mb-1 text-xs text-muted">This is the closest the search came. It does not fully fix the problem.</p>
                  <Option ctx={ctx} option={rr.result.nearMiss} n={0} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Option({ ctx, option, n }: { ctx: Ctx; option: RepairOption; n: number }) {
  const { state, lock } = ctx;
  const m = option.metrics;
  const extra = option.edits.filter((e) => e.t === "place").map((e) => (e.t === "place" ? nameOf(state, e.pharmacistId) : ""));
  return (
    <li className="rounded-md bg-white p-2 ring-1 ring-line">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{n ? `Option ${n}` : "Closest option"}</span>
        <Act tone="ink" disabled={!!lock} title={lock ?? undefined} onClick={() => useApp.getState().previewRepair(option)} aria-label={`Preview ${n ? `option ${n}` : "the closest option"}`}>Preview</Act>
      </div>
      <ul className="mt-1 list-disc pl-4 text-sm">
        {option.explanation.map((x, i) => <li key={i}>{x}</li>)}
      </ul>
      <OptionEffect edits={option.edits} />
      <div className="mt-1.5 flex flex-wrap gap-1">
        <Chip tone="info">Changes {m.changedPharmacistDates} {plural(m.changedPharmacistDates, "person", "people")}</Chip>
        <Chip tone="info">Drive {m.travelMinutes} min</Chip>
        {m.overridesNeeded > 0 && <Chip tone="warning">{"▲"} Needs you to accept {m.overridesNeeded} {plural(m.overridesNeeded, "problem", "problems")}</Chip>}
        {m.openRemaining > 0 && <Chip tone="serious">! Still short by {m.openRemaining}</Chip>}
        {m.violationsIntroduced > 0 && <Chip tone="serious">! Breaks {m.violationsIntroduced} {plural(m.violationsIntroduced, "rule", "rules")}</Chip>}
      </div>
      {extra.length > 0 && <p className="mt-1 text-xs text-muted">Asks {extra.join(", ")} to take an extra shift on a day off.</p>}
    </li>
  );
}
