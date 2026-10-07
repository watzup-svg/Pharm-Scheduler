// The Overview's header band: the one number that matters (shifts needing cover), three quiet figures, the next problem as a calendar page,
// and the month dial. Every figure is a button that jumps to where it can be dealt with. Same dark band as the other screens.
import { Check } from "lucide-react";
import { useApp } from "../../store.ts";
import { cx } from "../../ui/primitives.tsx";
import { MARKS, StateMark, type MarkKind } from "../../ui/icons.tsx";
import { fmtDate } from "../../copy.ts";
import { MonthDial } from "./MonthDial.tsx";
import { useMonthFacts, type MonthFacts } from "../overview/facts.ts";
import { monthBounds, monthName, nextMonthOf, prevMonthOf } from "../overview/lib.ts";
import { openTimeOff, seeAllProblems, showProblem } from "../overview/actions.ts";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Twice: 1 problem marks 2 cells" per kind of mark, so the numbers explain themselves. */
export function markLines(m: MonthFacts, skipOpen: boolean): string[] {
  return Object.entries(m.marks.byKind)
    .filter(([k]) => !(skipOpen && k === "open"))
    .map(([k, c]) => `${MARKS[k as MarkKind]?.name ?? k}: ${plural(c.problems, "problem")}, ${plural(c.cells, "cell")} marked`);
}

function Figure({ kind, n, word, tip, tone, onClick }: { kind: MarkKind; n: number; word: string; tip: string; tone?: "bad" | "off"; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} data-figure={kind} data-tip={tip} data-tip-tone={n > 0 ? tone : undefined} aria-label={`${n} ${word}. ${tip.split(" | ").slice(1).join(". ")}`}
      className={cx("inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-lg bg-white/[0.07] px-3 ring-1 ring-inset ring-white/10 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white", n === 0 && "opacity-70")}>
      <StateMark kind={kind} size={20} />
      <span className="text-xl font-semibold leading-none tabular-nums">{n}</span>
      <span className="text-sm text-cream/75">{word}</span>
    </button>
  );
}

/** The next problem as a small tear-off calendar page (the old build's "next gap"). */
function Leaf({ m }: { m: MonthFacts }) {
  const next = m.problems.find((p) => p.date >= m.asOf);
  if (!next) return null;
  const d = fmtDate(next.date).split(" ");
  const code = next.storeIds.length;
  return (
    <button type="button" data-figure="next" onClick={() => showProblem(next)}
      aria-label={`Next problem: ${fmtDate(next.date)}. ${next.text}. Open it on the wall`}
      data-tip={`Next problem · ${fmtDate(next.date)} | ${next.text}${code > 1 ? ` (${code} stores)` : ""} | Open it on the wall`}
      className="relative block w-14 shrink-0 overflow-hidden rounded-lg bg-white text-center shadow-[0_8px_18px_-8px_rgba(0,0,0,0.7)] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
      <span aria-hidden className="block bg-illegal text-[10px] font-bold leading-4 tracking-widest text-white">{d[1]!.toUpperCase()}</span>
      <span aria-hidden className="block text-3xl font-bold leading-8 tabular-nums text-ink">{d[2]}</span>
      <span aria-hidden className="block pb-0.5 text-[10px] font-semibold leading-3 text-muted">{d[0]!.toUpperCase()}</span>
    </button>
  );
}

export function OverviewHero() {
  const world = useApp((s) => s.world);
  const m = useMonthFacts();
  if (!world || !m || Object.keys(world.state.stores).length === 0) return null;
  const setMonth = (ym: string) => { const b = monthBounds(ym); useApp.getState().setWindow(b.from, b.to); };
  const firstOpen = m.problems.find((p) => p.kind === "open");
  const firstBreak = m.problems.find((p) => p.kind === "violation");
  const calm = m.openShifts === 0;
  const openTip = `Needs cover | ${plural(m.openShifts, "open shift")}${m.openCells !== m.openShifts ? ` at ${plural(m.openCells, "store day")}` : ""} from ${fmtDate(m.asOf)} on | ${firstOpen ? "Open the first one on the wall" : "Open the problem list"}`;
  const breakTip = `Rule breaks | ${m.ruleBreaks === 0 ? "None" : `${plural(m.ruleBreaks, "break")} from ${fmtDate(m.asOf)} on`}| ${markLines(m, true).join(" | ") || "Open the problem list"}`;
  return (
    <section aria-label="Month summary" className="hero-band relative mx-3 mt-3 overflow-hidden rounded-xl bg-night text-cream shadow-[0_10px_24px_-14px_rgba(32,24,32,0.7)]">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-52 rotate-12 opacity-[0.07]" style={{ background: "repeating-linear-gradient(60deg,#fff 0 1px,transparent 1px 14px)" }} />
      <div className="relative flex min-h-[116px] items-center gap-6 px-5 py-3">
        <div className="min-w-[210px]">
          <div className="flex items-center gap-1 text-sm text-cream/80">
            <button type="button" aria-label="Previous month" onClick={() => setMonth(prevMonthOf(m.ym))} className="rounded px-1.5 py-0.5 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white">‹</button>
            <span data-month-label className="min-w-[8.5rem] text-center font-semibold text-cream">{monthName(m.ym)} {m.ym.slice(0, 4)}</span>
            <button type="button" aria-label="Next month" onClick={() => setMonth(nextMonthOf(m.ym))} className="rounded px-1.5 py-0.5 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white">›</button>
          </div>
          <button type="button" data-figure="open" onClick={() => (firstOpen ? showProblem(firstOpen) : seeAllProblems())} data-tip={openTip} data-tip-tone={calm ? "ok" : "bad"}
            aria-label={`${m.openShifts} ${m.openShifts === 1 ? "shift needs" : "shifts need"} cover. ${openTip.split(" | ").slice(1).join(". ")}`}
            className="mt-1 flex items-center gap-3 rounded-lg px-1 text-left hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white">
            {calm ? <span aria-hidden className="grid size-11 place-items-center rounded-full bg-ok-lite text-night"><Check className="size-6" /></span>
              : <span className="text-[48px] font-light leading-none tracking-tight text-[#f3dcd6] tabular-nums" style={{ textShadow: "0 0 18px rgba(243,220,214,0.25)" }}>{m.openShifts}</span>}
            <span className="whitespace-pre-line text-sm leading-tight text-cream/75">{calm ? "Every shift\nis covered" : m.openShifts === 1 ? "shift needs\ncover" : "shifts need\ncover"}</span>
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Figure kind="double" n={m.ruleBreaks} word={m.ruleBreaks === 1 ? "rule break" : "rule breaks"} tone="bad" tip={breakTip} onClick={() => (firstBreak ? showProblem(firstBreak) : seeAllProblems())} />
          <Figure kind="waiting" n={m.waiting} word="waiting" tone="off" tip={`Requests waiting | Time off you have not answered yet | Open Time off`} onClick={openTimeOff} />
          <Figure kind="away" n={m.outToday.length} word="out today" tip={`Out today · ${fmtDate(m.asOf)} | ${m.outToday.length ? m.outToday.join(", ") : "Nobody"} | Open Time off`} onClick={openTimeOff} />
        </div>
        <div className="ml-auto flex items-center gap-5">
          <Leaf m={m} />
          <MonthDial size={96} />
        </div>
      </div>
    </section>
  );
}
