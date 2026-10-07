// The Add form (it lives in the right-hand column of the Time off screen): one form for any time off (vacation, sick, other), with what it would leave uncovered shown before saving. An approved record then lists the stores it leaves short, with who could cover.
import { useEffect, useId, useMemo, useState } from "react";
import { addDays, dateRange, type ISODate, type UnavailStatus, type UnavailType } from "@domain";
import { useApp } from "../../store.ts";
import { evaluateCached } from "../../derive.ts";
import { fmtDate, fmtRange } from "../../copy.ts";
import { shortName } from "../../names.ts";
import { Btn, cx } from "../../ui/primitives.tsx";
import { RepairOptions } from "../chrome/RepairOptions.tsx";
import { useChrome } from "../chrome/shared.tsx";
import { Cover } from "./Cover.tsx";
import { AddPreview } from "./Preview.tsx";
import { useWhyLocked } from "./lib.ts";
import { useTimeOffUi } from "./ui.ts";

const KINDS: UnavailType[] = ["Vacation", "Sick", "Other"];
const field = "h-9 w-full rounded-md border border-edge bg-white px-2 text-sm";

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: T[]; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="flex gap-1">
      {options.map((o) => (
        <button key={o} type="button" aria-pressed={value === o} onClick={() => onChange(o)}
          className={cx("h-9 flex-1 rounded-md px-3 text-sm font-medium ring-1 ring-inset focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink", value === o ? "bg-ink text-white ring-ink" : "bg-white text-ink ring-edge hover:bg-fill")}>
          {o}
        </button>
      ))}
    </div>
  );
}

function useActive() {
  const state = useApp((s) => s.world?.state);
  const asOf = useApp((s) => s.asOf);
  return useMemo(() => (state ? Object.values(state.pharmacists).filter((p) => p.inactiveFrom === undefined || p.inactiveFrom > asOf).sort((a, b) => a.name.localeCompare(b.name, "en")) : []), [state, asOf]);
}

export function AddForm({ onDone }: { onDone: () => void }) {
  const uid = useId();
  const state = useApp((s) => s.world!.state);
  const asOf = useApp((s) => s.asOf);
  const seedDate = useTimeOffUi((s) => s.addDate);
  const seedPid = useTimeOffUi((s) => s.addPid);
  const people = useActive();
  const why = useWhyLocked();
  const [pid, setPid] = useState(seedPid ?? "");
  const [first, setFirst] = useState<ISODate>(seedDate ?? asOf);
  const [last, setLast] = useState<string>(useTimeOffUi.getState().addLast ?? "");
  const [type, setType] = useState<UnavailType>("Vacation");
  const [status, setStatus] = useState<UnavailStatus | null>(null);
  const [note, setNote] = useState("");
  const [marked, setMarked] = useState<Marked | null>(null);
  const who = pid && people.some((p) => p.id === pid) ? pid : people[0]?.id ?? "";
  const effStatus: UnavailStatus = status ?? (type === "Vacation" ? "Requested" : "Approved");
  const lastDay = last || first;
  // The sheet highlights the days the form covers, so editing a date moves the highlight.
  useEffect(() => { if (who && first && lastDay >= first) useTimeOffUi.getState().setRange({ pid: who, first, last: lastDay }); }, [who, first, lastDay]);
  const bad = !who ? "Choose who is out." : !first ? "Choose the first day." : lastDay < first ? "The last day is before the first day." : "";
  const rec = useMemo(() => (bad ? null : { pharmacistId: who, first, last: lastDay, status: effStatus, type }), [bad, who, first, lastDay, effStatus, type]);
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (bad) return;
    const name = shortName(state.pharmacists[who]?.name ?? who, 22);
    const ok = useApp.getState().commit(
      [{ t: "unavail.add", pharmacistId: who, first, last: lastDay, status: effStatus, type, ...(note.trim() || type === "Sick" ? { note: note.trim() || "Called in sick" } : {}) }],
      `Time off ${effStatus === "Requested" ? "requested" : "added"} for ${name}, ${fmtRange(first, lastDay)}.`,
    );
    // An approved record can leave stores short: stay open and show them, with who could cover. A request just closes.
    if (ok) { if (effStatus === "Approved") setMarked({ who, first, last: lastDay }); else onDone(); }
  };
  if (marked) return <CoverPanel marked={marked} onDone={onDone} />;
  return (
    <form onSubmit={save} aria-label="Add time off" className="space-y-3">
      <div>
        <label htmlFor={`${uid}-who`} className="mb-1 block text-xs font-medium text-muted">Who</label>
        <select id={`${uid}-who`} className={field} value={who} onChange={(e) => setPid(e.target.value)}>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={`${uid}-first`} className="mb-1 block text-xs font-medium text-muted">First day</label>
          <input id={`${uid}-first`} type="date" className={field} value={first} onChange={(e) => setFirst(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${uid}-last`} className="mb-1 block text-xs font-medium text-muted">Last day (blank is one day)</label>
          <input id={`${uid}-last`} type="date" className={field} value={last} min={first} onChange={(e) => setLast(e.target.value)} />
        </div>
      </div>
      <div>
        <span className="mb-1 block text-xs font-medium text-muted">Kind</span>
        <Choice label="Kind" value={type} options={KINDS} onChange={(t) => { setType(t); setStatus(null); }} />
      </div>
      <div>
        <span className="mb-1 block text-xs font-medium text-muted">Status</span>
        <Choice<UnavailStatus> label="Status" value={effStatus} options={["Approved", "Requested"]} onChange={setStatus} />
      </div>
      <div>
        <label htmlFor={`${uid}-note`} className="mb-1 block text-xs font-medium text-muted">Note</label>
        <input id={`${uid}-note`} className={field} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
      </div>
      <AddPreview state={state} rec={rec} />
      {bad && <p role="alert" className="text-sm text-illegal">▲ {bad}</p>}
      {why && <p className="text-sm text-muted">{why}</p>}
      <div className="flex gap-2 pt-1">
        <Btn type="submit" tone="ink" disabled={!!why || !!bad}>Add time off</Btn>
        <Btn tone="ghost" onClick={onDone}>Cancel</Btn>
      </div>
    </form>
  );
}

type Marked = { who: string; first: ISODate; last: ISODate };

/** After an approved record is saved: the stores that person leaves short on each of those days, each with who could cover (read from the live schedule, so Undo makes them disappear). */
export function CoverPanel({ marked, onDone }: { marked: Marked; onDone: () => void }) {
  const state = useApp((s) => s.world!.state);
  const asOf = useApp((s) => s.asOf);
  const why = useWhyLocked();
  const name = (id: string) => state.pharmacists[id]?.name ?? id;
  const when = (a: ISODate, b: ISODate) => (a === b ? (a === asOf ? "today" : a === addDays(asOf, 1) ? "tomorrow" : fmtDate(a)) : fmtRange(a, b));
  const left = useMemo(() => {
    const ev = evaluateCached(state, asOf, { range: { from: marked.first, to: marked.last } });
    const out: { date: ISODate; cells: NonNullable<(typeof ev.cells)[string]>[] }[] = [];
    for (const d of dateRange(marked.first, marked.last)) {
      const stores = new Set(Object.values(state.assignments).filter((a) => a.pharmacistId === marked.who && a.date === d).map((a) => a.storeId));
      const cells = [...stores].map((id) => ev.cells[`${id}|${d}`]).filter((c) => !!c && c.open > 0).sort((x, y) => (x!.storeId < y!.storeId ? -1 : 1)) as NonNullable<(typeof ev.cells)[string]>[];
      if (cells.length) out.push({ date: d, cells });
    }
    return out;
  }, [state, asOf, marked]);
  const gaps = left.flatMap((g) => g.cells.map((c) => ({ storeId: c.storeId, date: g.date })));
  const findCover = (list: { storeId: string; date: ISODate }[]) => { useChrome.getState().setRepairOrigin("out"); void useApp.getState().runRepair(list); };
  if (marked) {
    return (
      <div aria-label="Cover for the time off" data-sick-cover className="space-y-3">
        <p className="text-sm"><b>{name(marked.who)}</b> is off {when(marked.first, marked.last)}{marked.first === marked.last ? `, ${fmtDate(marked.first)}` : ""}.</p>
        {gaps.length === 0 ? <p className="text-sm text-ok">✓ No store is left short.</p> : (
          <>
            {left.map((g) => (
              <section key={g.date} aria-label={`Stores left short on ${fmtDate(g.date)}`} data-sick-day={g.date} className="space-y-2">
                {left.length > 1 && <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{fmtDate(g.date)}</h3>}
                <ul className="space-y-3" aria-label="Stores left short">
                  {g.cells.map((c) => (
                    <li key={c.storeId} data-open-store={c.storeId} className="rounded-lg bg-cream p-3 ring-1 ring-line">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="text-sm"><b>{state.stores[c.storeId]?.code ?? c.storeId}</b> {c.covered === 0 ? "has nobody" : `needs ${c.open} more`}</p>
                        <Btn disabled={!!why} aria-label={`Find cover for ${state.stores[c.storeId]?.code ?? c.storeId}${left.length > 1 ? ` on ${fmtDate(g.date)}` : ""}`} onClick={() => findCover([{ storeId: c.storeId, date: g.date }])}>Find cover</Btn>
                      </div>
                      <Cover state={state} storeId={c.storeId} date={g.date} exclude={[marked.who]} locked={!!why} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {gaps.length > 1 && <Btn disabled={!!why} onClick={() => findCover(gaps)}>Find cover for all {gaps.length}</Btn>}
            <RepairOptions where="out" />
          </>
        )}
        <div className="pt-1"><Btn tone="ghost" onClick={onDone}>Done</Btn></div>
      </div>
    );
  }
}
