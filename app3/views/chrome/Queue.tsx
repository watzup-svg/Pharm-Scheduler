// Queue: what needs a look in the window, serious first. Click a row to see it on the wall. Each row wears the colour of its issue (rose = needs cover or a rule is broken, yellow = take a look), the same colours as the schedule.
import { useMemo, useState } from "react";
import { useApp } from "../../store.ts";
import { greedyBest } from "../../suggestions.ts";
import type { Suggestion } from "@domain";
import { shortName } from "../../names.ts";
import { Act } from "../inspector/ui.tsx";
import { useLock } from "../inspector/lib.ts";
import { useIssues, type Issue } from "../../derive.ts";
import { cx, GLYPH } from "../../ui/primitives.tsx";
import { BlockMark, RULE_MARK, type MarkKind } from "../../ui/icons.tsx";
import { HexBadge } from "../../ui/HexBadge.tsx";
import { RepairOptions } from "./RepairOptions.tsx";
import { fmtDate, fmtShort, goTo } from "./shared.tsx";

const TOP = 5;
const GROUPS: { kind: Issue["kind"]; title: string; glyph: string }[] = [
  { kind: "open", title: "Needs coverage", glyph: GLYPH.open },
  { kind: "violation", title: "Problems", glyph: GLYPH.serious },
  { kind: "warning", title: "Warnings", glyph: GLYPH.warning },
];

/** The best single person for an open day, in a few lines, with a Preview that opens the same proposal bar a cover option does. */
function SuggestionRow({ storeId, date, sg }: { storeId: string; date: string; sg: Suggestion | null | undefined }) {
  const state = useApp((s) => s.world?.state);
  const lock = useLock();
  if (!state || sg === undefined) return null;
  if (!sg) return <p className="px-2.5 pb-2 pl-[44px] text-sm text-muted" data-queue-suggestion="none">Nobody can cover this alone. Open the day for plans with several moves.</p>;
  const c = sg.choice;
  const name = state.pharmacists[c.pharmacistId]?.name ?? c.pharmacistId;
  const longDrive = sg.costs.some((x) => x.kind === "drive");
  const other = sg.costs.filter((x) => x.kind !== "drive");
  return (
    <div className="pb-2 pl-[44px] pr-2.5" data-queue-suggestion={sg.clean ? "clean" : "costs"}>
      <div className="flex items-center justify-between gap-2">
        <b className="min-w-0 truncate text-sm">Best: {shortName(name, 22)}</b>
        <Act tone="ink" disabled={!!lock} title={lock ?? undefined} aria-label={`Preview ${name} at ${state.stores[storeId]?.code ?? storeId}`} onClick={() => { goTo(storeId, date); useApp.getState().previewEdits(sg.edits, [sg.sentence]); }} className="shrink-0">Preview</Act>
      </div>
      <p className="text-sm text-ink/80">
        {sg.detail.replace(/\.$/, "")}
        {c.travelMinutes ? <span className={longDrive ? "font-semibold text-[#6b5400]" : ""}> · {c.travelMinutes} min drive</span> : null}
      </p>
      {other.length > 0 && <p className="text-sm text-muted">Costs: {other.map((x) => x.text).join(" · ")}</p>}
    </div>
  );
}

export function Queue() {
  const win = useApp((s) => s.window);
  const asOf = useApp((s) => s.asOf);
  const sel = useApp((s) => s.selection);
  const all = useIssues();
  const [seeAll, setSeeAll] = useState(false);
  const store = (id: string) => useApp.getState().world?.state.stores[id]?.code ?? id;
  // Open spots first, then broken rules, then warnings: the drawer shows the top few; the rest sit behind "See all".
  const rank = (i: Issue) => GROUPS.findIndex((g) => g.kind === i.kind);
  const ordered = all.slice().sort((a, b) => rank(a) - rank(b));
  const issues = seeAll ? all : ordered.slice(0, TOP);
  // One suggestion per open day, in date order, each assuming the ones before it were accepted.
  const state = useApp((s) => s.world?.state);
  const openList = useMemo(() => all.filter((i) => i.kind === "open").sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)), [all]);
  const wanted = new Set(issues.map((i) => i.id));
  const last = openList.reduce((n, i, k) => (wanted.has(i.id) ? k : n), -1);
  const sugg = useMemo(() => (state && last >= 0 ? greedyBest(state, asOf, openList.slice(0, last + 1)) : []), [state, asOf, openList, last]);
  const suggFor = (id: string) => { const k = openList.findIndex((i) => i.id === id); return k >= 0 && k < sugg.length ? sugg[k] : undefined; };

  return (
    <div className="px-3 py-2.5">
      <RepairOptions where="queue" />
      <p className="text-xs text-muted">{fmtShort(win.from < asOf ? asOf : win.from)} to {fmtShort(win.to)}</p>
      {issues.length === 0 && <p className="mt-3 text-sm">Nothing needs attention.</p>}
      {GROUPS.map((g) => {
        const rows = issues.filter((i) => i.kind === g.kind);
        if (!rows.length) return null;
        return (
          <section key={g.kind} className="mt-3" aria-label={g.title}>
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{g.title}</h2>
            <ul className="space-y-1">
              {rows.map((i) => {
                const on = sel?.storeId === i.storeId && sel.date === i.date;
                const mark: MarkKind = i.kind === "open" ? "open" : RULE_MARK[i.ruleId ?? ""] ?? "double";
                const sev = i.severity === "serious" ? "bad" : "warn";
                return (
                  <li key={i.id} data-sev={sev} className={cx("q-row rounded-lg", on && "q-on")}>
                    <button
                      type="button"
                      onClick={() => goTo(i.storeId, i.date)}
                      title={`${fmtDate(i.date)} · ${i.text}`}
                      aria-current={on ? "true" : undefined}
                      className="flex w-full items-start gap-2.5 rounded-lg py-2 pl-2.5 pr-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-ink"
                    >
                      <BlockMark kind={mark} tone={sev} size={24} className="mt-px" />
                      <span className="min-w-0"><span className="block font-semibold">{fmtDate(i.date)}</span><span className="flex flex-wrap items-center gap-1 text-ink/80">{i.kind === "open" ? <><HexBadge label={store(i.storeId)} size={24} />{i.text.replace(new RegExp(`^${store(i.storeId)}\\s+`), "")}</> : i.text}</span></span>
                    </button>
                    {i.kind === "open" && <SuggestionRow storeId={i.storeId} date={i.date} sg={suggFor(i.id)} />}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {all.length > TOP && (
        <button type="button" onClick={() => setSeeAll(!seeAll)} aria-expanded={seeAll} className="mt-3 rounded px-1 py-0.5 text-sm font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ink">{seeAll ? "Show fewer" : `See all ${all.length}`}</button>
      )}
    </div>
  );
}
