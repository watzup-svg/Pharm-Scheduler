// Queue: what needs a look in the window, serious first. Click a row to see it on the wall.
import { useApp } from "../../store.ts";
import { useIssues, type Issue } from "../../derive.ts";
import { cx, GLYPH } from "../../ui/primitives.tsx";
import { RepairOptions } from "./RepairOptions.tsx";
import { fmtDate, fmtShort, goTo } from "./shared.tsx";

const GROUPS: { kind: Issue["kind"]; title: string; glyph: string }[] = [
  { kind: "open", title: "Needs coverage", glyph: GLYPH.open },
  { kind: "violation", title: "Problems", glyph: GLYPH.serious },
  { kind: "warning", title: "Warnings", glyph: GLYPH.warning },
];

export function Queue() {
  const win = useApp((s) => s.window);
  const asOf = useApp((s) => s.asOf);
  const sel = useApp((s) => s.selection);
  const issues = useIssues();

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
                return (
                  <li key={i.id}>
                    <button
                      type="button"
                      onClick={() => goTo(i.storeId, i.date)}
                      title={`${fmtDate(i.date)} · ${i.text}`}
                      aria-current={on ? "true" : undefined}
                      className={cx("block w-full truncate rounded-md px-2 py-1.5 text-left text-sm ring-1 ring-inset focus-visible:outline-2 focus-visible:outline-ink", on ? "bg-white ring-ink" : "bg-white/70 ring-line hover:bg-white")}
                    >
                      <span className="mr-1.5 font-semibold" aria-hidden="true">{g.glyph}</span>
                      <span className="font-semibold">{fmtDate(i.date)}</span>
                      <span className="text-muted"> · {i.text}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
