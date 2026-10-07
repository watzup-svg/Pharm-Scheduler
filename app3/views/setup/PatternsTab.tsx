// Setup > Patterns. Standing assignments: who usually works where. A recurrence builder with a live preview of the next matching dates.
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { addDays, cmp, dateRange, expectedOn, weekday, isValidDate, standingMatches, type DomainState, type Edit, type ISODate, type Recurrence, type Standing } from "@domain";
import { useApp } from "../../store.ts";
import { Btn, Chip, GLYPH } from "../../ui/primitives.tsx";
import { Hint } from "../chrome/Title.tsx";
import { dayLabel, daysOffRuns, mondayOf, previewDaysOff, previewPattern, weeklyNeed } from "./lib.ts";
import { Grid, type RowDef } from "../wall/Grid.tsx";
import { DOW_LONG, activePharmacists } from "../wall/model.ts";
import { monthBounds, monthName, shiftYm } from "../ahead/lib.ts";
import { paintFromPatterns, standardRows, weekIndexOf } from "./standard.ts";
import { PersonDisc } from "../../ui/PersonDisc.tsx";
import { shortName } from "../../names.ts";
import { DateField, ORDINAL, SelectField, TableShell, WEEKDAY_SHORT, WEEK_ORDER, niceDate, shortDate, pharmacistsSorted, storesSorted, td, th, useLocked } from "./shared.tsx";

const WINDOW_DAYS = 56; // the next 8 weeks

export function describeRecurrence(r: Recurrence): string {
  const days = WEEK_ORDER.filter((w) => r.weekdays.includes(w)).map((w) => WEEKDAY_SHORT[w]).join(", ") || "no days";
  const cycle = r.cycleWeeks === 1 ? "every week" : `every ${r.cycleWeeks} weeks (week 1 is the week of ${niceDate(r.anchor)})`;
  const nth = r.nth && r.nth.length ? `, only the ${r.nth.slice().sort().map((n) => ORDINAL[n]).join(" and ")} of the month` : "";
  return `${days}, ${cycle}${nth}`;
}

/** Next `count` dates a pattern applies, from `from`. */
export function nextMatches(t: Standing, from: ISODate, count: number): ISODate[] {
  const out: ISODate[] = [];
  const start = t.effectiveFrom > from ? t.effectiveFrom : from;
  for (let i = 0; i < 900 && out.length < count; i++) {
    const d = addDays(start, i);
    if (t.effectiveTo !== undefined && d > t.effectiveTo) break;
    if (standingMatches(t, d)) out.push(d);
  }
  return out;
}

type Conflict = { pharmacistId: string; date: ISODate; storeIds: string[]; standingIds: string[] };

/** Pharmacists the patterns put at two stores on one date, over the next 8 weeks (and any extra dates). */
export function findConflicts(state: DomainState, from: ISODate, extraDates: ISODate[] = []): Conflict[] {
  const dates = new Set<ISODate>(extraDates);
  for (let i = 0; i < WINDOW_DAYS; i++) dates.add(addDays(from, i));
  const out: Conflict[] = [];
  for (const date of [...dates].sort()) {
    const byP = new Map<string, { stores: string[]; ids: string[] }>();
    for (const e of expectedOn(state, date)) {
      const cur = byP.get(e.pharmacistId) ?? { stores: [], ids: [] };
      cur.stores.push(e.storeId); cur.ids.push(e.standingId);
      byP.set(e.pharmacistId, cur);
    }
    for (const [p, v] of byP) if (v.stores.length > 1) out.push({ pharmacistId: p, date, storeIds: v.stores, standingIds: v.ids });
  }
  return out;
}

export function PatternsTab() {
  const world = useApp((s) => s.world)!;
  const asOf = useApp((s) => s.asOf);
  const locked = useLocked();
  const commit = useApp((s) => s.commit);
  const [storeFilter, setStoreFilter] = useState("");
  const [phFilter, setPhFilter] = useState("");
  const [load, setLoad] = useState<{ pid: string; date: ISODate; n: number } | null>(null);
  const st = world.state;
  const stores = useMemo(() => storesSorted(st), [st]);
  const phs = useMemo(() => pharmacistsSorted(st), [st]);
  const conflicts = useMemo(() => findConflicts(st, asOf), [st, asOf]);
  const conflictedIds = new Set(conflicts.flatMap((c) => c.standingIds));

  const rows = Object.values(st.standing)
    .filter((t) => (!storeFilter || t.storeId === storeFilter) && (!phFilter || t.pharmacistId === phFilter))
    .sort((a, b) => cmp(st.stores[a.storeId]?.code ?? "", st.stores[b.storeId]?.code ?? "") || cmp(st.pharmacists[a.pharmacistId]?.name ?? "", st.pharmacists[b.pharmacistId]?.name ?? "") || cmp(a.id, b.id));

  const remove = (t: Standing) => {
    const ph = st.pharmacists[t.pharmacistId]?.name ?? t.pharmacistId;
    commit([{ t: "standing.remove", id: t.id }], `Removed pattern: ${ph} at ${st.stores[t.storeId]?.code ?? t.storeId}.`);
  };

  return (
    <div className="flex flex-col gap-3">
      <Hint title="Patterns" line="Who usually works where." tip="Build places these first; you can still change any day. | Patterns never place anyone on their own." />
      {conflicts.length > 0 && (
        <div role="alert" aria-label="Pattern conflicts" className="rounded-md bg-warn-bg p-3 text-sm text-warn ring-1 ring-warn/35">
          <p className="font-semibold">{GLYPH.warning} Build will skip both: pattern conflict</p>
          <ul className="mt-1 list-disc pl-5">
            {conflictSummary(st, conflicts).map((line) => <li key={line}>{line}</li>)}
          </ul>
        </div>
      )}

      <StandardMonth onPick={(pid, date) => setLoad((l) => ({ pid, date, n: (l?.n ?? 0) + 1 }))} />

      <div className="flex flex-wrap items-end gap-3">
        <h3 className="text-sm font-semibold">Current patterns</h3>
        <SelectField label="Store" value={storeFilter} onChange={setStoreFilter} options={[{ value: "", label: "All stores" }, ...stores.map((s) => ({ value: s.id, label: s.code }))]} />
        <SelectField label="Pharmacist" value={phFilter} onChange={setPhFilter} options={[{ value: "", label: "Everyone" }, ...phs.map((p) => ({ value: p.id, label: p.name }))]} />
      </div>
      <TableShell label="Patterns">
        <thead><tr><th className={th}>Store</th><th className={th}>Pharmacist</th><th className={th}>When</th><th className={th}>From</th><th className={th}>Until</th><th className={th}>Next dates</th><th className={th}><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={7} className={`${td} text-muted`}>No patterns{storeFilter || phFilter ? " for this choice" : " yet"}.</td></tr>}
          {rows.map((t) => {
            const next = nextMatches(t, asOf, 3);
            return (
              <Fragment key={t.id}>
                <tr data-pattern={t.id}>
                  <td className={`${td} font-semibold`}>{st.stores[t.storeId]?.code ?? t.storeId}</td>
                  <td className={td}>{st.pharmacists[t.pharmacistId]?.name ?? t.pharmacistId}</td>
                  <td className={td}>{describeRecurrence(t.recurrence)}{conflictedIds.has(t.id) && <Chip tone="warning" className="ml-2">{GLYPH.warning} Conflict</Chip>}</td>
                  <td className={`${td} whitespace-nowrap`}>{niceDate(t.effectiveFrom)}</td>
                  <td className={`${td} whitespace-nowrap`}>{t.effectiveTo ? niceDate(t.effectiveTo) : <span className="text-muted">No end</span>}</td>
                  <td className={`${td} text-xs text-muted`}>{next.length ? next.map(shortDate).join(", ") : "none coming up"}</td>
                  <td className={`${td} text-right`}><Btn disabled={!!locked} aria-label={`Remove pattern ${t.id}`} onClick={() => remove(t)}>Remove</Btn></td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </TableShell>

      <PatternBuilder load={load} />
    </div>
  );
}

/** A typical month: pharmacists down the side, days across, each cell the store their patterns put them at (no time off, no sickness). Click a day to edit that person's pattern below. */
function StandardMonth({ onPick }: { onPick: (pid: string, date: ISODate) => void }) {
  const world = useApp((s) => s.world)!;
  const asOf = useApp((s) => s.asOf);
  const [ym, setYm] = useState(asOf.slice(0, 7));
  const st = world.state;
  const b = monthBounds(ym);
  const dates = useMemo(() => dateRange(b.from, b.to), [b.from, b.to]);
  const rows = useMemo<RowDef[]>(() => {
    const people = activePharmacists(st, b).filter((p) => Object.values(st.standing).some((t) => t.pharmacistId === p.id));
    const models = standardRows(st, people, dates, asOf);
    return people.map((p, i) => ({
      key: p.id, label: `${p.name}, typical month`, tip: `${p.name} | Click a day to edit their pattern`,
      head: <span className="w-person"><PersonDisc id={p.id} size={24} /><span className="w-pname">{shortName(p.name, 12)}</span></span>,
      cells: models[i]!,
    }));
  }, [st, dates, asOf]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section aria-label="A typical month" data-standard-month className="rounded-md bg-white ring-1 ring-line">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-3 py-2">
        <h3 className="text-sm font-semibold">A typical month</h3>
        <div role="group" aria-label="Month" className="flex items-center gap-1">
          <button type="button" className="w-btn" aria-label="Previous month" onClick={() => setYm(shiftYm(ym, -1))}>{"‹"}</button>
          <b className="min-w-32 text-center text-sm" data-standard-title>{monthName(ym)}</b>
          <button type="button" className="w-btn" aria-label="Next month" onClick={() => setYm(shiftYm(ym, 1))}>{"›"}</button>
        </div>
        <p className="text-xs text-muted">Only what the patterns say: no time off, no sickness. Click a day to edit that person's pattern below.</p>
      </div>
      {rows.length === 0 ? <p className="p-4 text-sm text-muted">No patterns yet. Add one below and it shows up here.</p> : (
        <div className="w-scroll max-h-[420px]">
          <Grid rows={rows} dates={dates} axis="pharmacist" asOf={asOf} corner="People" ariaLabel="Typical month by pharmacist" dayButtons={false} onPick={(c) => c.pharmacistId && onPick(c.pharmacistId, c.date)} />
        </div>
      )}
    </section>
  );
}

function conflictSummary(st: DomainState, conflicts: Conflict[]): string[] {
  // One line per pharmacist and set of stores, with the first date and how many dates.
  const groups = new Map<string, { c: Conflict; n: number }>();
  for (const c of conflicts) {
    const k = `${c.pharmacistId}|${c.storeIds.join(",")}`;
    const g = groups.get(k);
    if (g) g.n++; else groups.set(k, { c, n: 1 });
  }
  return [...groups.values()].map(({ c, n }) => {
    const ph = st.pharmacists[c.pharmacistId]?.name ?? c.pharmacistId;
    const stores = c.storeIds.map((s) => st.stores[s]?.code ?? s).join(" and ");
    return `${ph} is set for ${stores} on ${niceDate(c.date)}${n > 1 ? ` and ${n - 1} more day${n > 2 ? "s" : ""} in the next 8 weeks` : ""}.`;
  });
}

type Brush = "" | "off" | "erase" | string; // a store id paints work; "off" paints a usual day off; "erase" clears
type Paint = Record<string, string>; // `${weekIndex}|${weekday}` -> store id or "off"

/** Everything the grid says, as the patterns it means: one per store and week of the cycle, plus the days off. Identical weeks collapse to "every week". */
function patternsFromGrid(paint: Paint, cycle: 1 | 2 | 3 | 4, from: ISODate, personId: string, nth: number[]): { work: Standing[]; off: Standing[] } {
  const base = mondayOf(from);
  const byKey = new Map<string, number[]>(); // `${who}|${week}` -> weekdays
  for (const [k, who] of Object.entries(paint)) {
    const [w, d] = k.split("|").map(Number) as [number, number];
    const key = `${who}|${w}`;
    byKey.set(key, [...(byKey.get(key) ?? []), d]);
  }
  const who = new Set([...byKey.keys()].map((k) => k.split("|")[0]!));
  const out: { work: Standing[]; off: Standing[] } = { work: [], off: [] };
  let n = 0;
  for (const person of [...who].sort()) {
    const weeks = Array.from({ length: cycle }, (_, w) => (byKey.get(`${person}|${w}`) ?? []).slice().sort((a, b) => a - b));
    const same = weeks.every((x) => x.join() === weeks[0]!.join());
    const groups: { weekdays: number[]; anchor: ISODate; cycleWeeks: 1 | 2 | 3 | 4 }[] = same ? (weeks[0]!.length ? [{ weekdays: weeks[0]!, anchor: base, cycleWeeks: 1 }] : []) : weeks.map((wd, w) => ({ weekdays: wd, anchor: addDays(base, 7 * w), cycleWeeks: cycle })).filter((g) => g.weekdays.length);
    for (const g of groups) {
      const recurrence: Recurrence = { weekdays: g.weekdays, cycleWeeks: g.cycleWeeks, anchor: g.anchor };
      if (nth.length) recurrence.nth = nth.slice().sort((a, b) => a - b);
      const st: Standing = { id: `draft${n++}`, storeId: person === "off" ? "" : person, pharmacistId: personId, recurrence, effectiveFrom: from };
      (person === "off" ? out.off : out.work).push(st);
    }
  }
  return out;
}

function PatternBuilder({ load }: { load: { pid: string; date: ISODate; n: number } | null }) {
  const world = useApp((s) => s.world)!;
  const asOf = useApp((s) => s.asOf);
  const locked = useLocked();
  const commit = useApp((s) => s.commit);
  const say = useApp((s) => s.say);
  const st = world.state;
  const stores = useMemo(() => storesSorted(st), [st]);
  const phs = useMemo(() => pharmacistsSorted(st), [st]);
  const HORIZON_WEEKS = 26;

  const [phId, setPhId] = useState("");
  const [brush, setBrush] = useState<Brush>("");
  const [cycle, setCycle] = useState<1 | 2 | 3 | 4>(1);
  const [paint, setPaint] = useState<Paint>({});
  const [from, setFrom] = useState<string>(asOf);
  const [to, setTo] = useState("");
  const [nth, setNth] = useState<number[]>([]);
  const [touched, setTouched] = useState(false);
  const painting = useRef(false);
  const top = useRef<HTMLDivElement>(null);
  // Editing someone's existing pattern (loaded by clicking them in the typical month): saving replaces their patterns.
  const [editing, setEditing] = useState<{ pid: string; replaced: string[]; simplified: boolean } | null>(null);

  const person = phId ? st.pharmacists[phId] : undefined;
  const effBrush: Brush = brush || person?.baseStoreId || "";
  const apply = (w: number, d: number) => {
    if (!effBrush) return;
    setPaint((p) => {
      const k = `${w}|${d}`;
      const next = { ...p };
      if (effBrush === "erase" || next[k] === effBrush) delete next[k]; else next[k] = effBrush;
      return next;
    });
  };
  // Dragging paints with one value: the first cell decides whether the drag paints or erases.
  const dragMode = useRef<"paint" | "erase">("paint");
  const down = (w: number, d: number) => { painting.current = true; dragMode.current = effBrush !== "erase" && paint[`${w}|${d}`] !== effBrush ? "paint" : "erase"; apply(w, d); };
  const over = (w: number, d: number) => {
    if (!painting.current || !effBrush) return;
    setPaint((p) => {
      const k = `${w}|${d}`;
      const next = { ...p };
      if (dragMode.current === "erase") delete next[k]; else next[k] = effBrush;
      return next;
    });
  };
  useEffect(() => { const up = () => { painting.current = false; }; window.addEventListener("pointerup", up); return () => window.removeEventListener("pointerup", up); }, []);

  useEffect(() => {
    if (!load) return;
    if (editing && editing.pid === load.pid) {
      // Already editing this person: a click on a day in the typical month paints that weekday (of that week of the cycle) with the chosen brush.
      if (!effBrush) return;
      const w = weekIndexOf(load.date, from, cycle);
      apply(w, weekday(load.date));
      return;
    }
    const base = mondayOf(isValidDate(from) ? from : asOf);
    const got = paintFromPatterns(st, load.pid, base);
    setPhId(load.pid); setCycle(got.cycle); setPaint(got.paint); setBrush(""); setNth([]); setTo(""); setTouched(false);
    setEditing({ pid: load.pid, replaced: Object.values(st.standing).filter((t) => t.pharmacistId === load.pid).map((t) => t.id), simplified: got.simplified });
    top.current?.scrollIntoView({ block: "start" });
  }, [load?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (editing && editing.pid !== phId) setEditing(null); }, [phId]); // eslint-disable-line react-hooks/exhaustive-deps

  const cells = useMemo(() => Object.fromEntries(Object.entries(paint).filter(([k]) => Number(k.split("|")[0]) < cycle)), [paint, cycle]);
  const errors = {
    ph: !phId ? "Choose a pharmacist." : null,
    cells: Object.keys(cells).length === 0 && !editing ? "Paint at least one day: choose a store, then click or drag across the days." : null,
    from: !isValidDate(from) ? "Pick the first date the pattern applies." : null,
    to: to && (!isValidDate(to) || to < from) ? "The end date cannot be before the start." : null,
  };
  const anyError = Object.values(errors).some(Boolean);
  const pats = useMemo(() => (phId && isValidDate(from) ? patternsFromGrid(cells, cycle, from, phId, nth) : { work: [], off: [] }), [cells, cycle, from, phId, nth]);
  const offEnd = to || addDays(from, HORIZON_WEEKS * 7 - 1);

  // A four-week picture of what this gives: work days with their store code, usual days off in rose, and what to look at.
  type Day = { date: ISODate; kind?: "work" | "off"; code?: string; issue?: string; text?: string };
  const cal = useMemo(() => {
    if (!phId || !isValidDate(from) || (!pats.work.length && !pats.off.length)) return null;
    const start = asOf > from ? asOf : from;
    const byDate = new Map<ISODate, Day>();
    for (const t of pats.work) for (const r of previewPattern(st, t, start, 4).rows.flat()) if (r.hit) byDate.set(r.date, { date: r.date, kind: "work", code: st.stores[t.storeId]?.code ?? "", ...(r.issue ? { issue: r.issue } : {}), ...(r.text ? { text: r.text } : {}) });
    for (const t of pats.off) for (const r of previewDaysOff(st, t, start, 4).rows.flat()) if (r.hit) byDate.set(r.date, { date: r.date, kind: "off", ...(r.issue ? { issue: r.issue } : {}), ...(r.text ? { text: r.text } : {}) });
    const monday = mondayOf(start);
    const rows: Day[][] = Array.from({ length: 4 }, (_, w) => Array.from({ length: 7 }, (_, i) => { const date = addDays(monday, w * 7 + i); return byDate.get(date) ?? { date }; }));
    // "Already placed there" and "already off" just confirm what is there; only real problems are flagged.
    const worry = (d: Day) => !!d.issue && !(d.kind === "work" ? d.issue === "placed" : d.issue === "off");
    const all = rows.flat().filter((d) => d.kind);
    return { rows, hits: all.length, flagged: all.filter(worry).length, worry };
  }, [pats, st, asOf, from, phId]);

  const wouldConflict = useMemo(() => {
    if (!pats.work.length) return [] as Conflict[];
    const withDraft: DomainState = { ...st, standing: { ...st.standing, ...Object.fromEntries(pats.work.map((t) => [t.id, t])) } };
    const ids = new Set(pats.work.map((t) => t.id));
    return findConflicts(withDraft, asOf).filter((c) => c.standingIds.some((x) => ids.has(x)));
  }, [pats, st, asOf]);

  const offRuns = useMemo(() => pats.off.flatMap((t) => daysOffRuns(st, t, from, offEnd)), [pats, st, from, offEnd]);
  const offDays = offRuns.reduce((n, r) => n + dateRange(r.first, r.last).length, 0);

  // Problems with what is painted, said up front: a store that is never open that weekday, a store in a state they are not licensed for, days the store is closed, a clash with another pattern.
  const problems = useMemo(() => {
    const out: string[] = [];
    const first = person?.name.split(" ")[0] ?? "They";
    const seen = new Set<string>();
    for (const [k, who] of Object.entries(cells)) {
      if (who === "off") continue;
      const d = Number(k.split("|")[1]);
      const store = st.stores[who];
      if (!store) continue;
      const key = `${who}|${d}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (isValidDate(from) && weeklyNeed(st, who, d, from) === 0) out.push(`${store.code} is never open on ${DOW_LONG[d]}s, so painting ${DOW_LONG[d]} there places nobody. Clear that day, or change the store's hours in Setup.`);
    }
    const stateCodes = [...new Set(Object.values(cells).filter((w) => w !== "off").map((w) => st.stores[w]).filter((x) => !!x))];
    for (const store of stateCodes) {
      if (store && person?.licenses && store.state && !(store.state in person.licenses)) out.push(`${first} is not licensed in ${store.state}, where ${store.code} is, so ${first} would not count there.`);
    }
    // Closed days that are not just "this store never opens that weekday" (holidays and other date changes).
    const dateChanges = (cal ? cal.rows.flat() : []).filter((d) => {
      if (d.kind !== "work" || d.issue !== "closed") return false;
      const store = Object.values(st.stores).find((x) => x.code === d.code);
      return !store || weeklyNeed(st, store.id, weekday(d.date), d.date) > 0;
    }).map((d) => d.date);
    if (dateChanges.length) out.push(`${dateChanges.length} painted ${dateChanges.length === 1 ? "day falls" : "days fall"} on days the store is closed (${dateChanges.slice(0, 4).map(dayLabel).join(", ")}${dateChanges.length > 4 ? "…" : ""}). Nobody would be placed those days.`);
    for (const c of wouldConflict.slice(0, 1)) out.push(`Build will skip both: pattern conflict. ${conflictSummary(st, [c])[0]}`);
    return out;
  }, [cells, st, from, person, cal, wouldConflict]);
  const closedKeys = useMemo(() => new Set(Object.entries(cells).filter(([k, who]) => who !== "off" && isValidDate(from) && weeklyNeed(st, who, Number(k.split("|")[1]), from) === 0).map(([k]) => k)), [cells, st, from]);

  const save = () => {
    setTouched(true);
    if (anyError || !person) return;
    const edits: Edit[] = [
      ...(editing && editing.pid === phId ? editing.replaced.filter((id) => !!st.standing[id]).map((id): Edit => ({ t: "standing.remove", id })) : []),
      ...pats.work.map((t): Edit => ({ t: "standing.add", storeId: t.storeId, pharmacistId: phId, recurrence: t.recurrence, effectiveFrom: from, ...(to ? { effectiveTo: to } : {}) })),
      ...offRuns.map((r): Edit => ({ t: "unavail.add", pharmacistId: phId, first: r.first, last: r.last, status: "Approved", type: "Other", note: "Usual day off" })),
    ];
    if (!edits.length) { say("info", "Nothing to add: those days are already marked."); return; }
    const parts = [pats.work.length ? `${pats.work.length} work ${pats.work.length === 1 ? "pattern" : "patterns"}` : "", offDays ? `${offDays} usual ${offDays === 1 ? "day" : "days"} off (to ${niceDate(offEnd)})` : ""].filter(Boolean).join(" and ");
    const verb = editing && editing.pid === phId ? "Changed the pattern for" : "Added for";
    if (commit(edits, `${verb} ${person.name}: ${parts || "no work days"}.`)) { setPaint({}); setNth([]); setTo(""); setTouched(false); setEditing(null); }
  };

  const brushLabel = (b: Brush) => (b === "off" ? "Day off" : b === "erase" ? "Erase" : st.stores[b]?.code ?? "");
  const chip = (v: string) => (v === "off" ? { text: "Off", cls: "bg-[#f0c4ba] text-illegal ring-[#d98b7b]" } : { text: st.stores[v]?.code ?? "?", cls: "bg-ink text-white ring-ink" });

  return (
    <div ref={top} role="group" aria-label="Add a pattern" className="flex scroll-mt-4 flex-col gap-3 rounded-md bg-white p-3 ring-1 ring-line">
      <h3 className="text-sm font-semibold">{editing ? "Edit a pattern" : "Add a pattern"}</h3>
      {editing && person && (
        <div role="status" data-editing className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-fill px-3 py-2 text-sm">
          <p><b>Editing {person.name}'s pattern.</b> Saving replaces their {editing.replaced.length} current {editing.replaced.length === 1 ? "pattern" : "patterns"}; Undo puts them back.{editing.simplified ? " Date limits and weeks-of-the-month on the old patterns are dropped." : ""}</p>
          <Btn tone="ghost" onClick={() => { setEditing(null); setPaint({}); }}>Cancel editing</Btn>
        </div>
      )}
      <p className="-mt-2 text-xs text-muted">Pick a person, pick what to paint, then click or drag across the days. Use more than one week to show a pattern that changes week to week.</p>
      <div className="flex flex-wrap items-start gap-3">
        <SelectField label="Pharmacist" value={phId} onChange={(v) => { setPhId(v); setBrush(""); }} options={[{ value: "", label: "Choose…" }, ...phs.map((p) => ({ value: p.id, label: p.name }))]} error={touched ? errors.ph : null} className="w-56" />
        <SelectField label="Paint with" value={effBrush} onChange={(v) => setBrush(v)} options={[{ value: "", label: "Choose…" }, ...stores.map((s) => ({ value: s.id, label: `${s.code}  ${s.name}` })), { value: "off", label: "Day off" }, { value: "erase", label: "Erase" }]} className="w-64" hint={person?.baseStoreId && !brush ? "Starts on their home store" : undefined} />
        <SelectField label="The pattern repeats every" value={String(cycle)} onChange={(v) => setCycle(Number(v) as 1 | 2 | 3 | 4)} options={[{ value: "1", label: "week" }, { value: "2", label: "2 weeks" }, { value: "3", label: "3 weeks" }, { value: "4", label: "4 weeks" }]} className="w-40" />
      </div>

      <div role="grid" aria-label="Weekly pattern" className="w-max select-none rounded-lg bg-paper p-2" onPointerLeave={() => { /* keep painting if the pointer returns before release */ }}>
        <div role="row" className="grid grid-cols-[4.5rem_repeat(7,3.25rem)] gap-1 pb-1">
          <span />
          {WEEK_ORDER.map((d) => <span key={d} role="columnheader" className="text-center text-xs font-semibold text-muted">{WEEKDAY_SHORT[d]}</span>)}
        </div>
        {Array.from({ length: cycle }, (_, w) => (
          <div key={w} role="row" className="grid grid-cols-[4.5rem_repeat(7,3.25rem)] gap-1 py-0.5">
            <span role="rowheader" className="self-center text-xs font-semibold text-muted">Week {w + 1}</span>
            {WEEK_ORDER.map((d) => {
              const v = cells[`${w}|${d}`];
              const c = v ? chip(v) : null;
              return (
                <button key={d} type="button" role="gridcell" data-week={w} data-day={d} data-paint={v ?? ""} data-warn={closedKeys.has(`${w}|${d}`) ? "closed" : undefined} aria-label={`Week ${w + 1} ${WEEKDAY_SHORT[d]}: ${v ? (v === "off" ? "day off" : st.stores[v]?.code) : "nothing"}`}
                  disabled={!effBrush}
                  onPointerDown={(e) => { e.preventDefault(); down(w, d); }} onPointerEnter={() => over(w, d)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); apply(w, d); } }}
                  className={`grid h-10 place-items-center rounded-md text-xs font-bold ring-1 ring-inset focus-visible:outline-2 focus-visible:outline-ink ${c ? c.cls : "bg-white text-muted/50 ring-line hover:bg-fill"} ${closedKeys.has(`${w}|${d}`) ? "outline outline-2 outline-offset-1 outline-warn" : ""}`}>
                  {c ? c.text : "·"}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {touched && errors.cells && <p role="alert" className="text-xs text-illegal">▲ {errors.cells}</p>}
      {problems.length > 0 && (
        <div role="alert" aria-label="Problems with this pattern" data-pattern-alert className="rounded-md bg-warn-bg p-3 text-sm text-warn ring-1 ring-warn/35">
          <p className="font-semibold">{GLYPH.warning} {problems.length === 1 ? "This pattern has a problem" : `This pattern has ${problems.length} problems`}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">{problems.map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
      )}
      {effBrush && <p className="-mt-1 text-xs text-muted">Painting: <b className="text-ink">{brushLabel(effBrush)}</b>. Click a painted day again to clear it.</p>}

      <div className="flex flex-wrap items-start gap-3">
        <DateField label="Applies from" value={from} onChange={setFrom} error={touched ? errors.from : null} />
        <DateField label="Applies until (optional)" value={to} onChange={setTo} error={touched ? errors.to : null} hint={pats.off.length ? `Last day; blank means no end for work, and the next ${HORIZON_WEEKS} weeks for days off` : "Last day; blank means no end"} />
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-xs font-semibold text-muted">Only certain weeks of the month (optional)</summary>
        <fieldset className="mt-1 flex flex-col gap-1">
          <legend className="sr-only">Weeks of the month</legend>
          <div className="flex h-8 items-center gap-3">
            {[1, 2, 3, 4, 5].map((n) => <label key={n} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={nth.includes(n)} onChange={() => setNth((l) => (l.includes(n) ? l.filter((x) => x !== n) : [...l, n]))} /> {ORDINAL[n]}</label>)}
          </div>
          <p className="text-xs text-muted">For example 1st and 3rd means the first and third Tuesday, if Tuesday is painted.</p>
        </fieldset>
      </details>

      <div aria-live="polite" className="rounded-md bg-paper p-3 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">What this gives over the next 4 weeks</p>
          {cal && cal.hits > 0 && <p className="text-xs text-muted" data-testid="pattern-preview-count">{cal.hits} {cal.hits === 1 ? "day" : "days"}{cal.flagged ? `, ${cal.flagged} to look at` : ""}</p>}
        </div>
        {!cal ? <p className="mt-1 text-muted">Choose a pharmacist and paint some days to see them here.</p> : cal.hits === 0 ? <p className="mt-1 text-muted">This pattern matches no days. Check the painted days, the weeks of the month and the dates.</p> : (
          <>
            <div className="mt-2 grid w-max grid-cols-7 gap-1">
              {WEEK_ORDER.map((w) => <span key={w} aria-hidden className="text-center text-xs font-semibold text-muted">{WEEKDAY_SHORT[w]![0]}</span>)}
            </div>
            <div data-testid="pattern-preview" role="list" aria-label="Days the pattern lands on" className="mt-1 grid w-max grid-cols-7 gap-1">
              {cal.rows.flat().map((d) => d.kind ? (
                <span key={d.date} role="listitem" data-hit="yes" data-kind={d.kind} data-date={d.date} data-issue={d.issue ?? ""} aria-label={`${dayLabel(d.date)}${d.kind === "off" ? ", usual day off" : `, ${d.code}`}${d.text ? `. ${d.text}` : ""}`} data-tip={`${dayLabel(d.date)} | ${d.kind === "off" ? "Usual day off" : `Works at ${d.code}`}${d.text ? ` | ${d.text}` : ""}`}
                  className={`grid size-10 place-items-center rounded-md text-[11px] font-bold leading-none tabular-nums ${cal.worry(d) ? "bg-warn-bg text-warn ring-2 ring-warn/50" : d.kind === "off" ? "bg-[#f0c4ba] text-illegal ring-1 ring-[#d98b7b]" : "bg-ink text-white"}`}>
                  <span>{Number(d.date.slice(8))}</span><span className="text-[10px] font-semibold opacity-90">{d.kind === "off" ? "off" : d.code}</span>
                </span>
              ) : (
                <span key={d.date} aria-hidden data-hit="no" data-date={d.date} className="grid size-10 place-items-center rounded-md text-sm tabular-nums text-muted/60">{Number(d.date.slice(8))}</span>
              ))}
            </div>
          </>
        )}
        {pats.off.length > 0 && <p className="mt-2 text-xs text-muted" data-testid="days-off-summary">{offDays ? `Days off: ${offDays} days through ${niceDate(offEnd)} are saved as approved time off, which you can see on the Time off screen.` : "Every one of those days off is already marked."}</p>}
      </div>
      <div className="flex items-center gap-2">
        <Btn tone="ink" disabled={!!locked} onClick={save}>{pats.off.length && !pats.work.length ? "Mark days off" : "Add pattern"}</Btn>
        {locked && <p className="text-xs text-muted">{locked}</p>}
      </div>
    </div>
  );
}
