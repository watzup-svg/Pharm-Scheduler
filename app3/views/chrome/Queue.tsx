// Queue: what needs a look in the window, serious first. Click a row to see it on the wall. Each row wears the colour of its issue (rose = needs cover or a rule is broken, yellow = take a look), the same colours as the schedule.
import { useState } from "react";
import { useApp } from "../../store.ts";
import { useIssues, type Issue } from "../../derive.ts";
import { cx, GLYPH } from "../../ui/primitives.tsx";
import { BlockMark, RULE_MARK, type MarkKind } from "../../ui/icons.tsx";
import { RepairOptions } from "./RepairOptions.tsx";
import { fmtDate, fmtShort, goTo } from "./shared.tsx";

const TOP = 5;
const GROUPS: { kind: Issue["kind"]; title: string; glyph: string }[] = [
  { kind: "open", title: "Needs coverage", glyph: GLYPH.open },
  { kind: "violation", title: "Problems", glyph: GLYPH.serious },
  { kind: "warning", title: "Warnings", glyph: GLYPH.warning },
];

export function Queue() {
  const win = useApp((s) => s.window);
  const asOf = useApp((s) => s.asOf);
  const sel = useApp((s) => s.selection);
  const all = useIssues();
  const [seeAll, setSeeAll] = useState(false);
  // Open spots first, then broken rules, then warnings: the drawer shows the top few; the rest sit behind "See all".
  const rank = (i: Issue) => GROUPS.findIndex((g) => g.kind === i.kind);
  const ordered = all.slice().sort((a, b) => rank(a) - rank(b));
  const issues = seeAll ? all : ordered.slice(0, TOP);

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
                  <li key={i.id}>
                    <button
                      type="button"
                      onClick={() => goTo(i.storeId, i.date)}
                      title={`${fmtDate(i.date)} · ${i.text}`}
                      aria-current={on ? "true" : undefined}
                      data-sev={sev}
                      className={cx("q-row flex w-full items-start gap-2.5 rounded-lg py-2 pl-2.5 pr-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-ink", on && "q-on")}
                    >
                      <BlockMark kind={mark} tone={sev} size={24} className="mt-px" />
                      <span className="min-w-0"><span className="block font-semibold">{fmtDate(i.date)}</span><span className="block text-ink/80">{i.text}</span></span>
                    </button>
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
