// What the header band says on each view. Every number clicks through to something.
import { useMemo } from "react";
import { dateRange, RULES, type DomainState } from "@domain";
import { useApp } from "../../store.ts";
import { evaluateCached, useEvaluation, useIssues, useViewState } from "../../derive.ts";
import { countsOf } from "../chrome/shared.tsx";
import { MARKS, Pic } from "../../ui/icons.tsx";
import { explainSelection, type Explain } from "../wall/explain.ts";
import { plural } from "../../copy.ts";
import { Hero, type Tile } from "./Hero.tsx";
import { MonthDial } from "./MonthDial.tsx";
import { LicenceRings, PaperStack } from "./Graphics.tsx";
import { explainTimeOff } from "../timeoff/explain.ts";

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

/** The Schedule's header: it explains whatever is selected (a day at a store, or a person's day) in plain words: a big picture in the issue's colour, a headline, the store and date, and who is involved. Nothing to click here; the month dial stays at the right. */
const CHIP_BG = { bad: "#f0c4ba", warn: "#f2da8f", ok: "#6fb78d" } as const; // the same colours as the blocks on the wall (wall.css)
const CHIP_INK = { bad: "var(--color-illegal)", warn: "var(--color-warn)", ok: "var(--color-ok)" } as const;
const DOT = { bad: "#f0c4ba", warn: "#f2da8f", quiet: "#9fd3b4", ok: "#9fd3b4" } as const;

/** The informational band: a big picture in the issue's colour, a headline, context, extra lines and the people involved. Nothing to click. */
function InfoHero({ ex, label, emptyTitle, emptyText, extra }: { ex: Explain | null; label: string; emptyTitle: string; emptyText: string; extra?: Record<string, string | number> }) {
  const icon = ex?.mark ? MARKS[ex.mark].icon : ex ? "asis" : null;
  return (
    <section aria-label={label} data-explain={ex ? ex.tone : "none"} {...Object.fromEntries(Object.entries(extra ?? {}).map(([k, v]) => [`data-${k}`, v]))} className="hero-band relative mx-3 mt-2 flex min-h-[104px] items-center gap-5 overflow-hidden rounded-xl bg-night px-5 py-3 text-cream shadow-[0_8px_20px_-14px_rgba(32,24,32,0.7)]">
      <span aria-hidden className="grid size-16 shrink-0 place-items-center rounded-2xl" style={ex ? { background: CHIP_BG[ex.tone], color: CHIP_INK[ex.tone] } : { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)", outline: "1px dashed rgba(255,255,255,0.3)", outlineOffset: -1 }}>
        {icon ? <Pic icon={icon} className="size-9" /> : <Pic icon="unverified" className="size-8" />}
      </span>
      <div className="min-w-0 flex-1" aria-live="polite">
        {ex ? (
          <>
            <h2 className="text-[26px] font-semibold leading-tight tracking-tight text-[#f7e9e4]" data-hero-headline>{ex.headline}</h2>
            <p className="mt-0.5 text-sm text-cream/70" data-hero-context>{ex.context}</p>
            {ex.more.length > 0 && <ul className="mt-1 space-y-0.5 text-sm text-cream/85">{ex.more.map((m) => <li key={m}>{m}</li>)}</ul>}
            {ex.people.length > 0 && (
              <ul aria-label="People involved" className="mt-2 flex flex-wrap gap-1.5">
                {ex.people.map((pp, i) => (
                  <li key={pp.name + i} className="inline-flex items-center gap-2 rounded-full bg-white/10 py-1 pl-2.5 pr-3 text-sm ring-1 ring-inset ring-white/10">
                    <span aria-hidden className="size-2.5 rounded-full" style={{ background: DOT[pp.tone] }} />
                    <b className="font-semibold">{pp.name}</b><span className="text-cream/70">{pp.note}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <h2 className="text-[26px] font-semibold leading-tight tracking-tight text-cream/80" data-hero-headline>{emptyTitle}</h2>
            <p className="mt-0.5 text-sm text-cream/60" data-hero-context>{emptyText}</p>
          </>
        )}
      </div>
      <MonthDial size={92} />
    </section>
  );
}

export function ScheduleHero() {
  const { vs, win, counts, asOf } = useScheduleHero();
  const ev = useEvaluation();
  const sel = useApp((s) => s.selection);
  const ex = useMemo(() => (vs && ev ? explainSelection(vs.state, ev, sel, asOf) : null), [vs, ev, sel, asOf]);
  return <InfoHero ex={ex} label={`${monthLabel(win.from)} summary`} emptyTitle="No cell selected" emptyText="Pick a day on the schedule, or a problem on the list, to see what is going on." extra={{ open: counts.open, problems: counts.problems + counts.warnings }} />;
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
  const sel = useApp((s) => s.selection);
  const ex = useMemo(() => (vs ? explainTimeOff(vs.state, sel, asOf) : null), [vs, sel, asOf]);
  if (!vs) return null;
  return <InfoHero ex={ex} label="Time off summary" emptyTitle="No day selected" emptyText="Pick a person's day on the sheet, or a request on the list, to see what it does to the stores." />;
}
