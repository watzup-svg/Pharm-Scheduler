// The options a cover search found. Preview opens a proposal in the Proposal Bar; nothing is saved from here.
import { useApp } from "../../store.ts";
import { Btn, Chip, cx } from "../../ui/primitives.tsx";
import { codeOf, fmtDate, plural, useChrome } from "./shared.tsx";
import { OptionEffect } from "./OptionEffect.tsx";

export function RepairOptions({ where }: { where: "queue" | "out" }) {
  const rr = useApp((s) => s.repairResult);
  const world = useApp((s) => s.world);
  const origin = useChrome((s) => s.repairOrigin);
  if (!rr || !world || origin !== where || rr.inline || world.session.proposal) return null;
  const r = rr.result;
  const state = world.state;
  const used = r.gapsUsed.map((g) => `${codeOf(state, g.storeId)} ${fmtDate(g.date)}`).join(", ");
  const dismiss = () => useApp.setState({ repairResult: null });
  return (
    <div role="region" aria-label="Cover options" className="mt-2 rounded-md bg-white p-2.5 text-sm ring-1 ring-line">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold">{r.status === "options" ? "Ways to cover" : "No cover found"}</p>
        <button type="button" onClick={dismiss} className="text-xs text-muted underline">Dismiss</button>
      </div>
      {used && <p className="mt-0.5 text-xs text-muted">Looking at {used}.</p>}
      {r.message && <p className="mt-1 text-xs" role="status">{r.message}</p>}
      {r.options.map((o, i) => (
        <div key={i} className="mt-2 rounded-md bg-fill p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Option {i + 1}</span>
            <Btn tone="ink" aria-label={`Preview option ${i + 1}`} onClick={() => useApp.getState().previewRepair(o)}>Preview</Btn>
          </div>
          <ul className="mt-1 list-disc pl-4 text-xs">
            {o.explanation.map((line, j) => <li key={j}>{line}</li>)}
          </ul>
          <OptionEffect edits={o.edits} />
          <div className="mt-1 flex flex-wrap gap-1">
            <Chip tone={o.metrics.openRemaining ? "serious" : "ok"}>{o.metrics.openRemaining ? `□ ${o.metrics.openRemaining} still open` : "✓ Fills every gap"}</Chip>
            {o.metrics.violationsIntroduced > 0 && <Chip tone="serious">! {plural(o.metrics.violationsIntroduced, "new problem")}</Chip>}
            {o.metrics.overridesNeeded > 0 && <Chip tone="warning">▲ {plural(o.metrics.overridesNeeded, "override")} to accept</Chip>}
          </div>
        </div>
      ))}
      {r.status !== "options" && !rr.wider && r.status !== "cannot-evaluate" && (
        <Btn className="mt-2" onClick={() => useApp.getState().runRepair(rr.gaps, true)}>Look wider</Btn>
      )}
      {r.status === "cannot-evaluate" && r.missing && <p className={cx("mt-1 text-xs text-muted")}>Fill in what is missing in Setup or Travel, then try again.</p>}
    </div>
  );
}
