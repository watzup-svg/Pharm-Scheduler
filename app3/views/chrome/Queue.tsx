// Queue: what needs a look in the window, serious first. Click a row to see it on the wall.
import { useApp } from "../../store.ts";
import { useIssues, type Issue } from "../../derive.ts";
import { Btn, Chip, cx, GLYPH } from "../../ui/primitives.tsx";
import { RepairOptions } from "./RepairOptions.tsx";
import { fmtDate, fmtShort, goTo, stepIssue, useChrome } from "./shared.tsx";

const GROUPS: { kind: Issue["kind"]; title: string; glyph: string; tone: "serious" | "warning" }[] = [
  { kind: "open", title: "Needs coverage", glyph: GLYPH.open, tone: "serious" },
  { kind: "violation", title: "Problems", glyph: GLYPH.serious, tone: "serious" },
  { kind: "warning", title: "Warnings", glyph: GLYPH.warning, tone: "warning" },
];

export function Queue() {
  const world = useApp((s) => s.world)!;
  const win = useApp((s) => s.window);
  const asOf = useApp((s) => s.asOf);
  const sel = useApp((s) => s.selection);
  const issues = useIssues();
  const setOrigin = useChrome((s) => s.setRepairOrigin);
  const busy = !!world.session.proposal || (!!world.session.scenario && !world.session.scenario.parked);
  const open = issues.filter((i) => i.kind === "open");
  const next = stepIssue(issues, world.state, 1);

  return (
    <div className="px-3 py-2.5">
      <div className="flex flex-wrap gap-1.5">
        <Btn disabled={!next} onClick={() => next && goTo(next.storeId, next.date)} title="Keyboard: n (next) and p (previous)">Next problem</Btn>
        <Btn
          disabled={!open.length || busy}
          onClick={() => {
            setOrigin("queue");
            useApp.getState().runRepair(open.map((i) => ({ storeId: i.storeId, date: i.date })));
          }}
          title={busy ? "Accept or discard what is open first." : "Looks for ways to cover the first 5 open cells, in date order."}
        >
          Cover all open (up to 5)
        </Btn>
      </div>
      <RepairOptions where="queue" />
      <p className="mt-2 text-xs text-muted">Showing {fmtShort(win.from < asOf ? asOf : win.from)} to {fmtShort(win.to)}.</p>
      {issues.length === 0 && <p className="mt-3 text-sm">Nothing needs attention in this period.</p>}
      {GROUPS.map((g) => {
        const rows = issues.filter((i) => i.kind === g.kind);
        if (!rows.length) return null;
        return (
          <section key={g.kind} className="mt-3" aria-label={g.title}>
            <h3 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
              {g.title}
              <Chip tone={g.tone}>{rows.length}</Chip>
            </h3>
            <ul className="space-y-1">
              {rows.map((i) => {
                const on = sel?.storeId === i.storeId && sel.date === i.date;
                return (
                  <li key={i.id}>
                    <button
                      type="button"
                      onClick={() => goTo(i.storeId, i.date)}
                      aria-current={on ? "true" : undefined}
                      className={cx("block w-full rounded-md px-2 py-1.5 text-left text-sm ring-1 ring-inset focus-visible:outline-2 focus-visible:outline-ink", on ? "bg-white ring-ink" : "bg-white/70 ring-line hover:bg-white")}
                    >
                      <span className="mr-1.5 font-semibold" aria-hidden="true">{g.glyph}</span>
                      <span className="font-semibold">{fmtDate(i.date)}</span>
                      <span className="block text-muted">{i.text}</span>
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
