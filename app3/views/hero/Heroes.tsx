// What the header band says on each view. Every number clicks through to something.
import { useMemo } from "react";
import { api, dateRange, RULES, type DomainState } from "@domain";
import { useApp } from "../../store.ts";
import { useEvaluation, useIssues, useViewState } from "../../derive.ts";
import { countsOf, stepIssue, goTo } from "../chrome/shared.tsx";
import { Pic } from "../../ui/icons.tsx";
import { plural } from "../../copy.ts";
import { Hero, HeroBtn, type Tile } from "./Hero.tsx";
import { MonthDial } from "./MonthDial.tsx";
import { LicenceRings, PaperStack } from "./Graphics.tsx";

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

export function ScheduleHero() {
  const { issues, vs, win, counts, awayCount, unverified } = useScheduleHero();
  const goQueue = () => useApp.getState().setDrawer(true, "queue");
  const fix = () => { if (!vs) return; const next = stepIssue(issues, vs.state, 1); if (next) goTo(next.storeId, next.date); };
  const tiles: Tile[] = [
    { kind: "open", n: counts.open, word: "need cover", onClick: goQueue, tip: "Needs cover | Stores with fewer pharmacists than they need | Open the list" },
    { kind: "double", n: counts.problems + counts.warnings, word: counts.problems + counts.warnings === 1 ? "problem" : "problems", onClick: goQueue, tip: `Problems | ${counts.problems} that stop someone counting, ${counts.warnings} warnings (long drives, many days in a row)${unverified ? `, ${unverified} cannot be fully checked` : ""} | Open the list` },
    { kind: "away", n: awayCount, word: "out", onClick: openOut, tip: "Time off | Records that touch this period | Someone’s out" },
  ];
  const label = monthLabel(win.from);
  return (
    <Hero
      label={label}
      lead={counts.open}
      leadWord={counts.open === 1 ? "store needs cover" : "stores need cover"}
      tiles={tiles}
      actions={<>
        <HeroBtn tone="light" onClick={fix} disabled={!issues.length}>Fix →</HeroBtn>
        <HeroBtn tone="away" onClick={openOut}><Pic icon="timeOff" className="size-4" /> Someone’s out</HeroBtn>
      </>}
      graphic={<MonthDial />}
    />
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
  const ev = api.evaluate(world.state, asOf, { range: win });
  const open = Object.values(ev.cells).reduce((n, c) => n + c.open, 0);
  const days = dateRange(win.from, win.to).length;
  const tiles: Tile[] = [{ kind: "open", n: open, word: "open shifts print as boxes" }, { kind: "pinned", n: snaps.length, word: plural(snaps.length, "posting").replace(/^\d+ /, "") }];
  return <Hero label="Post and print" lead={stores} leadWord={`store pages · ${days} days`} tiles={tiles} graphic={<PaperStack pages={stores} />} />;
}

export function TimeOffHero() {
  const vs = useViewState();
  const asOf = useApp((s) => s.asOf);
  if (!vs) return null;
  const rec = Object.values(vs.state.unavailability).filter((u) => u.last >= asOf);
  const waiting = rec.filter((u) => u.status === "Requested").length;
  const approved = rec.filter((u) => u.status === "Approved" || u.status === "Actual").length;
  const tiles: Tile[] = [{ kind: "waiting", n: waiting, word: "waiting" }, { kind: "away", n: approved, word: "approved" }];
  return <Hero label="Time off" lead={rec.length} leadWord="upcoming" tiles={tiles} actions={<HeroBtn tone="away" onClick={openOut}>Someone’s out</HeroBtn>} />;
}
