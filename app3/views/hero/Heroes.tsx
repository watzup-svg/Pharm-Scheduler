// What the header band says on each view. Every number clicks through to something.
import { useMemo } from "react";
import { dateRange, RULES, type DomainState } from "@domain";
import { useApp } from "../../store.ts";
import { evaluateCached, useEvaluation, useIssues, useViewState } from "../../derive.ts";
import { countsOf, stepProblem, fmtDate } from "../chrome/shared.tsx";
import { Pic } from "../../ui/icons.tsx";
import { plural } from "../../copy.ts";
import { Hero, HeroBtn, type Tile } from "./Hero.tsx";
import { MonthDial } from "./MonthDial.tsx";
import { LicenceRings, PaperStack } from "./Graphics.tsx";
import { Standing } from "../timeoff/Standing.tsx";
import { troubleDay } from "../timeoff/calc.ts";
import { monthLoads } from "../timeoff/lib.ts";
import { useTimeOffUi } from "../timeoff/ui.ts";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthLabel = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

function useScheduleHero() {
  const issues = useIssues();
  const ev = useEvaluation();
  const vs = useViewState();
  const win = useApp((s) => s.window);
  const asOf = useApp((s) => s.asOf);
  const counts = countsOf(issues, ev);
  const awayCount = useMemo(() => {
    if (!vs) return 0;
    return Object.values(vs.state.unavailability).filter((u) => (u.status === "Approved" || u.status === "Actual" || u.status === "Requested") && u.last >= asOf && u.first <= win.to).length;
  }, [vs, asOf, win]);
  const unverified = ev ? Object.values(ev.cells).filter((c) => c.date >= asOf).reduce((n, c) => n + c.unverified, 0) : 0;
  return { issues, vs, win, asOf, counts, awayCount, unverified };
}

function openOut() {
  const a = useApp.getState();
  a.setView("wall");
  a.setOutForm(true);
}

/** The Schedule's header: one calm line. "3 shifts need cover · 5 problems", then Fix (next problem) and Someone's out. The month dial stays at the right. */
export function ScheduleHero() {
  const { issues, vs, win, counts, awayCount, unverified } = useScheduleHero();
  const goQueue = () => useApp.getState().setDrawer(true, "queue");
  const step = (dir: 1 | -1) => { if (vs) stepProblem(issues, vs.state, dir); };
  const problems = counts.problems + counts.warnings;
  void awayCount;
  const tipOpen = "Needs cover | Shifts with fewer pharmacists than the store needs | Open the list";
  const tipProblems = `Problems | ${counts.problems} that stop someone counting, ${counts.warnings} warnings (long drives, many days in a row)${unverified ? `, ${unverified} cannot be fully checked` : ""} | Open the list`;
  const num = "text-2xl font-semibold leading-none tracking-tight text-[#f3dcd6]";
  const link = "inline-flex items-baseline gap-1.5 rounded-md px-1.5 py-1 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white";
  return (
    <section aria-label={`${monthLabel(win.from)} summary`} data-open={counts.open} data-problems={problems} className="hero-band relative mx-3 mt-2 flex h-14 items-center gap-3 overflow-hidden rounded-xl bg-night px-4 text-cream shadow-[0_8px_20px_-14px_rgba(32,24,32,0.7)]">
      <p className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap text-sm text-cream/80" aria-live="polite">
        {counts.open > 0 ? (
          <button type="button" onClick={goQueue} data-tip={tipOpen} className={link}><b className={num}>{counts.open}</b><span>{counts.open === 1 ? "shift needs cover" : "shifts need cover"}</span></button>
        ) : (
          <span className="px-1.5">{problems > 0 ? "All shifts covered" : "Everything is covered"}</span>
        )}
        {problems > 0 && <>
          <span aria-hidden className="text-cream/40">·</span>
          <button type="button" onClick={goQueue} data-tip={tipProblems} className={link}><b className={num}>{problems}</b><span>{problems === 1 ? "problem" : "problems"}</span></button>
        </>}
      </p>
      <div className="ml-auto flex items-center gap-2">
        <div className="flex items-center gap-0.5">
          <HeroBtn tone="ghost" onClick={() => step(-1)} disabled={!issues.length} title="Previous problem | Press Shift+N" aria-label="Previous problem">‹</HeroBtn>
          <HeroBtn tone="light" onClick={() => step(1)} disabled={!issues.length} title="Next problem | Press N" aria-label="Fix: next problem">Fix →</HeroBtn>
        </div>
        <HeroBtn tone="away" onClick={openOut}><Pic icon="timeOff" className="size-4" /> Someone’s out</HeroBtn>
        <MonthDial size={44} />
      </div>
    </section>
  );
}

function licensedIn(state: DomainState, code: "OR" | "WA") {
  return Object.values(state.pharmacists).filter((p) => p.licenses && code in p.licenses).length;
}

export function SetupHero() {
  const vs = useViewState();
  if (!vs) return null;
  const s = vs.state;
  const n = Object.keys(s.pharmacists).length;
  const tiles: Tile[] = [
    { kind: "covering", n: Object.keys(s.stores).length, word: "stores" },
    { kind: "licence", n: Object.values(s.pharmacists).filter((p) => !p.licenses).length, word: "licences not recorded", onClick: () => useApp.getState().setView("checks") },
    { kind: "pinned", n: Object.keys(s.standing).length, word: "patterns" },
  ];
  return <Hero label="Setup" lead={n} leadWord={n === 1 ? "pharmacist" : "pharmacists"} tiles={tiles} graphic={<LicenceRings total={n} or={licensedIn(s, "OR")} wa={licensedIn(s, "WA")} />} />;
}

export function TravelHero() {
  const vs = useViewState();
  if (!vs) return null;
  const s = vs.state;
  const ids = Object.keys(s.stores);
  const total = ids.length * (ids.length - 1);
  const known = Object.keys(s.travel).length;
  const over = Object.values(s.travel).filter((t) => t.minutes > s.config.travelSoftMinutes).length;
  const tiles: Tile[] = [
    { kind: "unverified", n: Math.max(0, total - known), word: "unknown" },
    { kind: "drive", n: over, word: `over ${s.config.travelSoftMinutes} min` },
  ];
  return <Hero label="Travel and mileage" lead={known} leadWord={`of ${total} drive times known`} tiles={tiles} />;
}

export function RulesHero() {
  const vs = useViewState();
  if (!vs) return null;
  const c = vs.state.config;
  const tiles: Tile[] = [
    { kind: "drive", n: c.travelSoftMinutes, word: "min long drive" },
    { kind: "streak", n: c.maxConsecutiveDays, word: "days in a row" },
  ];
  return <Hero label="Rules" lead={RULES.length} leadWord="rules" tiles={tiles} />;
}

export function ChecksHero() {
  const vs = useViewState();
  if (!vs) return null;
  const s = vs.state;
  const missing = Object.values(s.pharmacists).filter((p) => !p.licenses || p.baseStoreId === null).length;
  const tiles: Tile[] = [{ kind: "licence", n: Object.values(s.pharmacists).filter((p) => !p.licenses).length, word: "licences not recorded" }, { kind: "drive", n: Math.max(0, Object.keys(s.stores).length * (Object.keys(s.stores).length - 1) - Object.keys(s.travel).length), word: "drive times unknown" }];
  return <Hero label="Setup Check" lead={missing} leadWord={missing === 1 ? "person to complete" : "people to complete"} tiles={tiles} />;
}

export function PrintHero() {
  const world = useApp((s) => s.world);
  const win = useApp((s) => s.window);
  const asOf = useApp((s) => s.asOf);
  if (!world) return null;
  const snaps = world.journal.snapshots;
  const stores = Object.keys(world.state.stores).length;
  const ev = evaluateCached(world.state, asOf, { range: win });
  const open = Object.values(ev.cells).reduce((n, c) => n + c.open, 0);
  const days = dateRange(win.from, win.to).length;
  const tiles: Tile[] = [{ kind: "open", n: open, word: "open shifts print as boxes" }, { kind: "pinned", n: snaps.length, word: plural(snaps.length, "posting").replace(/^\d+ /, "") }];
  return <Hero label="Post and print" lead={stores} leadWord={`store pages · ${days} days`} tiles={tiles} graphic={<PaperStack pages={stores} />} />;
}

export function TimeOffHero() {
  const vs = useViewState();
  const asOf = useApp((s) => s.asOf);
  const ui = useTimeOffUi();
  const month = ui.month ?? asOf.slice(0, 7);
  const state = vs?.state;
  const trouble = useMemo(() => (state ? troubleDay(monthLoads(state, asOf, month)) : null), [state, asOf, month]);
  if (!state) return null;
  const rec = Object.values(state.unavailability).filter((u) => u.last >= asOf && u.type !== "Turned-down");
  const waiting = rec.filter((u) => u.status === "Requested").length;
  const approved = rec.filter((u) => u.status === "Approved" || u.status === "Actual").length;
  const declined = rec.filter((u) => u.status === "Denied").length;
  const tiles: Tile[] = trouble
    ? [{ kind: "open", n: trouble.short.length, word: trouble.short.length === 1 ? "store short on the worst day" : "stores short on the worst day", onClick: () => ui.openDay(trouble.date), tip: `Worst day | ${fmtDate(trouble.date)} | Open the day` }]
    : [];
  return (
    <Hero
      label="Time off"
      lead={waiting}
      leadWord="to approve"
      tiles={tiles}
      actions={<>
        <HeroBtn tone="away" onClick={() => ui.openAdd("add")}><Pic icon="timeOff" className="size-4" /> Add time off</HeroBtn>
        <HeroBtn onClick={() => ui.openAdd("sick")}>Sick today</HeroBtn>
      </>}
      graphic={<Standing waiting={waiting} approved={approved} declined={declined} />}
    />
  );
}
