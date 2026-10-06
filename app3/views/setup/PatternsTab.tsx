// Setup > Patterns. Standing assignments: who usually works where. A recurrence builder with a live preview of the next matching dates.
import { Fragment, useMemo, useState } from "react";
import { addDays, cmp, deepEqual, expectedOn, isValidDate, standingMatches, type DomainState, type ISODate, type Recurrence, type Standing } from "@domain";
import { useApp } from "../../store.ts";
import { Btn, Chip, GLYPH } from "../../ui/primitives.tsx";
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
      <p className="max-w-2xl text-sm text-muted">
        A pattern says who usually works where. Build places these first; you can still change any day. Patterns never place anyone on their own.
      </p>
      {conflicts.length > 0 && (
        <div role="alert" aria-label="Pattern conflicts" className="rounded-md bg-warn-bg p-3 text-sm text-warn ring-1 ring-warn/35">
          <p className="font-semibold">{GLYPH.warning} Build will skip both: pattern conflict</p>
          <ul className="mt-1 list-disc pl-5">
            {conflictSummary(st, conflicts).map((line) => <li key={line}>{line}</li>)}
          </ul>
        </div>
      )}

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

      <PatternBuilder />
    </div>
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

function PatternBuilder() {
  const world = useApp((s) => s.world)!;
  const asOf = useApp((s) => s.asOf);
  const locked = useLocked();
  const commit = useApp((s) => s.commit);
  const say = useApp((s) => s.say);
  const st = world.state;
  const stores = useMemo(() => storesSorted(st), [st]);
  const phs = useMemo(() => pharmacistsSorted(st), [st]);

  const [storeId, setStoreId] = useState("");
  const [phId, setPhId] = useState("");
  const [days, setDays] = useState<number[]>([]);
  const [cycle, setCycle] = useState<1 | 2 | 3 | 4>(1);
  const [anchor, setAnchor] = useState<string>(asOf);
  const [nth, setNth] = useState<number[]>([]);
  const [from, setFrom] = useState<string>(asOf);
  const [to, setTo] = useState("");
  const [touched, setTouched] = useState(false);

  const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const errors = {
    store: !storeId ? "Choose a store." : null,
    ph: !phId ? "Choose a pharmacist." : null,
    days: days.length === 0 ? "Tick at least one weekday." : null,
    anchor: cycle > 1 && !isValidDate(anchor) ? "Pick a date in week 1 of the cycle." : null,
    from: !isValidDate(from) ? "Pick the first date the pattern applies." : null,
    to: to && (!isValidDate(to) || to < from) ? "The end date cannot be before the start." : null,
  };
  const anyError = Object.values(errors).some(Boolean);

  const draft: Standing | null = useMemo(() => {
    if (!storeId || !phId || !days.length || !isValidDate(from) || (to && (!isValidDate(to) || to < from)) || (cycle > 1 && !isValidDate(anchor))) return null;
    const recurrence: Recurrence = { weekdays: days.slice().sort((a, b) => a - b), cycleWeeks: cycle, anchor: cycle > 1 ? anchor : from };
    if (nth.length) recurrence.nth = nth.slice().sort((a, b) => a - b);
    return { id: "draft", storeId, pharmacistId: phId, recurrence, effectiveFrom: from, ...(to ? { effectiveTo: to } : {}) };
  }, [storeId, phId, days, cycle, anchor, nth, from, to]);

  const preview = useMemo(() => (draft ? nextMatches(draft, asOf > from ? asOf : from, 8) : []), [draft, asOf, from]);

  // Would this pattern put the pharmacist at two stores on one date? Check with the draft added.
  const wouldConflict = useMemo(() => {
    if (!draft) return [] as Conflict[];
    const withDraft: DomainState = { ...st, standing: { ...st.standing, [draft.id]: draft } };
    return findConflicts(withDraft, asOf, preview).filter((c) => c.standingIds.includes(draft.id));
  }, [draft, st, asOf, preview]);

  const duplicate = draft && Object.values(st.standing).some((t) => t.storeId === draft.storeId && t.pharmacistId === draft.pharmacistId && t.effectiveFrom === draft.effectiveFrom && t.effectiveTo === draft.effectiveTo && deepEqual(t.recurrence, draft.recurrence));

  const add = () => {
    setTouched(true);
    if (anyError || !draft) return;
    if (duplicate) { say("info", "That pattern is already there, so nothing was added."); return; }
    const ph = st.pharmacists[phId]!;
    const label = `Added pattern: ${ph.name} at ${st.stores[storeId]!.code}, ${describeRecurrence(draft.recurrence)}.`;
    if (commit([{ t: "standing.add", storeId, pharmacistId: phId, recurrence: draft.recurrence, effectiveFrom: from, ...(to ? { effectiveTo: to } : {}) }], label)) {
      setDays([]); setNth([]); setTo("");
    }
  };

  return (
    <div role="group" aria-label="Add a pattern" className="flex flex-col gap-3 rounded-md bg-white p-3 ring-1 ring-line">
      <h3 className="text-sm font-semibold">Add a pattern</h3>
      <div className="flex flex-wrap items-start gap-3">
        <SelectField label="Store" value={storeId} onChange={setStoreId} options={[{ value: "", label: "Choose…" }, ...stores.map((s) => ({ value: s.id, label: `${s.code}  ${s.name}` }))]} error={touched ? errors.store : null} className="w-64" />
        <SelectField label="Pharmacist" value={phId} onChange={setPhId} options={[{ value: "", label: "Choose…" }, ...phs.map((p) => ({ value: p.id, label: p.name }))]} error={touched ? errors.ph : null} className="w-56" />
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-xs font-semibold text-muted">Works on</legend>
        <div className="flex flex-wrap gap-3">
          {WEEK_ORDER.map((w) => (
            <label key={w} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={days.includes(w)} onChange={() => setDays((d) => toggle(d, w))} /> {WEEKDAY_SHORT[w]}</label>
          ))}
        </div>
        {touched && errors.days && <p role="alert" className="text-xs text-illegal">▲ {errors.days}</p>}
      </fieldset>
      <div className="flex flex-wrap items-start gap-3">
        <SelectField label="Repeats" value={String(cycle)} onChange={(v) => setCycle(Number(v) as 1 | 2 | 3 | 4)} options={[{ value: "1", label: "Every week" }, { value: "2", label: "Every 2nd week" }, { value: "3", label: "Every 3rd week" }, { value: "4", label: "Every 4th week" }]} className="w-44" />
        {cycle > 1 && <DateField label="Week 1 is the week of" value={anchor} onChange={setAnchor} error={touched ? errors.anchor : null} hint="Any date in that week" />}
        <fieldset className="flex flex-col gap-1">
          <legend className="text-xs font-semibold text-muted">Only certain weeks of the month (optional)</legend>
          <div className="flex h-8 items-center gap-3">
            {[1, 2, 3, 4, 5].map((n) => <label key={n} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={nth.includes(n)} onChange={() => setNth((l) => toggle(l, n))} /> {ORDINAL[n]}</label>)}
          </div>
          <p className="text-xs text-muted">For example 1st and 3rd means the first and third Tuesday, if Tuesday is ticked.</p>
        </fieldset>
      </div>
      <div className="flex flex-wrap items-start gap-3">
        <DateField label="Applies from" value={from} onChange={setFrom} error={touched ? errors.from : null} />
        <DateField label="Applies until (optional)" value={to} onChange={setTo} error={touched ? errors.to : null} hint="Last day; blank means no end" />
      </div>

      <div aria-live="polite" className="rounded-md bg-paper p-2 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Next 8 matching dates</p>
        {!draft ? <p className="text-muted">Fill in the store, pharmacist and weekdays to see the dates.</p> : preview.length === 0 ? <p className="text-muted">This pattern matches no dates. Check the weekdays, the weeks of the month and the dates.</p> : (
          <ol data-testid="pattern-preview" className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
            {preview.map((d) => <li key={d}>{shortDate(d)}</li>)}
          </ol>
        )}
        {wouldConflict.length > 0 && <p role="alert" className="mt-2 text-sm text-warn">{GLYPH.warning} Build will skip both: pattern conflict. {conflictSummary(st, wouldConflict)[0]}</p>}
        {duplicate && <p className="mt-2 text-xs text-muted">This exact pattern already exists. Adding it again changes nothing.</p>}
      </div>
      <div className="flex items-center gap-2">
        <Btn tone="ink" disabled={!!locked} onClick={add}>Add pattern</Btn>
        {locked && <p className="text-xs text-muted">{locked}</p>}
      </div>
    </div>
  );
}
