// "Find cover": ask the domain's repair for options for this open day, show them in plain words, and preview one. Nothing is applied here.
import { useState } from "react";
import type { RepairOption } from "@domain";
import { useApp } from "../../store.ts";
import { Chip } from "../../ui/primitives.tsx";
import { codeOf, nameOf, numWord, plural, type Ctx } from "./lib.ts";
import { Act } from "./ui.tsx";
import { OptionEffect } from "../chrome/OptionEffect.tsx";

export function SearchWider({ ctx }: { ctx: Ctx }) {
  const { state, lock, storeId, date, asOf } = ctx;
  const rr = useApp((s) => s.repairResult);
  const [near, setNear] = useState(false);
  const past = date < asOf;
  const mine = !!rr && rr.wider && rr.gaps.some((g) => g.storeId === storeId && g.date === date);
  const [busy, setBusy] = useState(false);
  const running = useApp((s) => s.busy);
  // The search runs in the page; let "Searching..." paint first, since a wider search can take a while.
  const run = () => {
    setNear(false);
    setBusy(true);
    setTimeout(() => { try { useApp.getState().runRepair([{ storeId, date }], true); } finally { setBusy(false); } }, 30);
  };

  return (
    <div className="mt-3 rounded-md bg-fill p-2 text-sm">
      <p className="text-xs">Nobody above fits? Searching wider tries plans with several moves, and may ask people on their day off to take extra shifts. Nothing changes until you accept.</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <Act tone="ink" disabled={!!lock || past || busy} title={lock ?? (past ? "This day has passed" : undefined)} onClick={run}>{busy ? "Searching..." : "Search wider"}</Act>
        {running && <Act onClick={() => useApp.getState().cancelEngine()}>Cancel</Act>}
      </div>
      {mine && rr && (
        <div className="mt-2" aria-live="polite">
          {rr.gaps.length > 1 && <p className="mb-1 text-xs text-muted">This search looked at {numWord(rr.gaps.length)} open days together.</p>}
          {rr.result.message && <p>{rr.result.message}</p>}
          {rr.result.status === "options" && rr.result.options.length > 0 && (
            <ol className="mt-1 flex flex-col gap-2">
              {rr.result.options.map((o, i) => <Option key={i} ctx={ctx} option={o} n={i + 1} />)}
            </ol>
          )}
          {rr.result.options.length === 0 && rr.result.status === "none" && <p className="mt-1 text-muted">Nothing fits without breaking a rule.</p>}
          {rr.result.excludedUnknownTravel.length > 0 && (
            <p className="mt-2 text-xs text-muted">
              Not considered: drive time not known ({[...new Set(rr.result.excludedUnknownTravel.map((x) => `${state.pharmacists[x.pharmacistId]?.initials ?? x.pharmacistId} to ${codeOf(state, x.storeId)}`))].join(", ")}).
            </p>
          )}
          {rr.result.nearMiss && (
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
          <div className="mt-2"><Act onClick={() => useApp.setState({ repairResult: null })}>Clear these results</Act></div>
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
