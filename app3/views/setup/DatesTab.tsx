// Setup > Dates. One-off changes to a store's need on a date: holidays and closures (0), clinics (+N), or an exact number.
import { useMemo, useState } from "react";
import { cmp, isValidDate, weekday, type DateOverride, type Edit } from "@domain";
import { useApp } from "../../store.ts";
import { Btn, Chip, GLYPH } from "../../ui/primitives.tsx";
import { DateField, SelectField, TableShell, TextField, WEEKDAY_SHORT, inputCls, niceDate, storesSorted, td, th, useLocked, weeklyNeedOn } from "./shared.tsx";

type Kind = "closed" | "extra" | "exact";

export function DatesTab() {
  const world = useApp((s) => s.world)!;
  const asOf = useApp((s) => s.asOf);
  const locked = useLocked();
  const commit = useApp((s) => s.commit);
  const st = world.state;
  const stores = useMemo(() => storesSorted(st), [st]);

  const [filter, setFilter] = useState("");
  const [showPast, setShowPast] = useState(false);

  // form
  const [date, setDate] = useState<string>("");
  const [storeId, setStoreId] = useState("");
  const [kind, setKind] = useState<Kind>("closed");
  const [n, setN] = useState("1");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);

  const rows = Object.values(st.dateOverrides)
    .filter((o) => (!filter || o.storeId === filter) && (showPast || o.date >= asOf))
    .sort((a, b) => cmp(a.date, b.date) || cmp(st.stores[a.storeId]?.code ?? "", st.stores[b.storeId]?.code ?? ""));
  const hiddenPast = Object.values(st.dateOverrides).filter((o) => (!filter || o.storeId === filter) && o.date < asOf).length;

  const nOk = /^\d{1,2}$/.test(n.trim()) && (kind === "exact" ? true : Number(n) >= 1);
  const errors = {
    date: !date || !isValidDate(date) ? "Pick a date." : null,
    store: !storeId ? "Choose a store." : null,
    n: kind !== "closed" && !nOk ? (kind === "extra" ? "Use a whole number of 1 or more." : "Use a whole number from 0 to 99.") : null,
  };

  const countFor = (sid: string): number => (kind === "closed" ? 0 : kind === "exact" ? Number(n) : weeklyNeedOn(st, sid, weekday(date), date) + Number(n));
  const phraseFor = (c: number): string => (c === 0 ? "closed" : `needing ${c}`);

  const add = () => {
    setTouched(true);
    if (errors.date || errors.store || errors.n) return;
    const c = countFor(storeId);
    const code = st.stores[storeId]!.code;
    commit([{ t: "dateOverride.set", storeId, date, count: c, note: note.trim() }], `Set ${code} on ${niceDate(date)} to ${phraseFor(c)}${note.trim() ? ` (${note.trim()})` : ""}.`);
  };

  const closeAll = () => {
    setTouched(true);
    if (errors.date) return;
    const open = stores.filter((s) => !(s.inactiveFrom && s.inactiveFrom <= date));
    if (!open.length) { useApp.getState().say("info", "There are no stores to close."); return; }
    const edits: Edit[] = open.map((s) => ({ t: "dateOverride.set", storeId: s.id, date, count: 0, note: note.trim() }));
    commit(edits, `Closed all ${open.length} stores on ${niceDate(date)}${note.trim() ? ` (${note.trim()})` : ""}.`);
  };

  const remove = (o: DateOverride) => {
    commit([{ t: "dateOverride.clear", storeId: o.storeId, date: o.date }], `Removed the change for ${st.stores[o.storeId]?.code ?? o.storeId} on ${niceDate(o.date)}.`);
  };

  const edit = (o: DateOverride) => {
    setDate(o.date); setStoreId(o.storeId); setNote(o.note);
    if (o.count === 0) setKind("closed"); else { setKind("exact"); setN(String(o.count)); }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-2xl text-sm text-muted">One-off changes to how many pharmacists a store needs on a date: a holiday or closure (0), a clinic day (some extra), or an exact number. They replace the weekly need on that date only.</p>

      <div role="group" aria-label="Add a date change" className="flex flex-col gap-3 rounded-md bg-white p-3 ring-1 ring-line">
        <h3 className="text-sm font-semibold">Add or change a date</h3>
        <div className="flex flex-wrap items-start gap-3">
          <DateField label="Date" value={date} onChange={setDate} error={touched ? errors.date : null} />
          <SelectField label="Store" value={storeId} onChange={setStoreId} options={[{ value: "", label: "Choose…" }, ...stores.map((s) => ({ value: s.id, label: `${s.code}  ${s.name}` }))]} error={touched ? errors.store : null} className="w-64" />
          <SelectField label="What happens" value={kind} onChange={(v) => setKind(v as Kind)} options={[{ value: "closed", label: "Closed (holiday or closure)" }, { value: "extra", label: "Extra pharmacists (clinic)" }, { value: "exact", label: "An exact number" }]} className="w-60" />
          {kind !== "closed" && (
            <div className="flex flex-col gap-1">
              <label htmlFor="date-n" className="text-xs font-semibold text-muted">{kind === "extra" ? "How many more" : "Pharmacists needed"}</label>
              <input id="date-n" inputMode="numeric" value={n} onChange={(e) => setN(e.target.value)} className={`${inputCls} w-20 text-center`} aria-invalid={!!errors.n} />
              {touched && errors.n && <p role="alert" className="text-xs text-illegal">▲ {errors.n}</p>}
            </div>
          )}
          <TextField label="Note (optional)" value={note} onChange={setNote} placeholder="Labor Day" className="w-56" />
        </div>
        {kind === "extra" && storeId && date && isValidDate(date) && !errors.n && (
          <p className="text-xs text-muted">{st.stores[storeId]?.code} usually needs {weeklyNeedOn(st, storeId, weekday(date), date)} on a {WEEKDAY_SHORT[weekday(date)]}; with {n} more it will need {countFor(storeId)}.</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Btn tone="ink" disabled={!!locked} onClick={add}>Save date change</Btn>
          <Btn disabled={!!locked} onClick={closeAll} title="Marks every store closed on the chosen date">Close all stores on this date</Btn>
          {locked && <p className="text-xs text-muted">{locked}</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <h3 className="text-sm font-semibold">Dates with a change</h3>
        <SelectField label="Store" value={filter} onChange={setFilter} options={[{ value: "", label: "All stores" }, ...stores.map((s) => ({ value: s.id, label: s.code }))]} />
        <label className="flex h-8 items-center gap-2 text-sm"><input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} /> Show dates before {niceDate(asOf)}{hiddenPast && !showPast ? ` (${hiddenPast} hidden)` : ""}</label>
      </div>
      <TableShell label="Date changes">
        <thead><tr><th className={th}>Date</th><th className={th}>Store</th><th className={th}>Needs</th><th className={th}>Note</th><th className={th}><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={5} className={`${td} text-muted`}>No date changes{filter ? " for this store" : ""}.</td></tr>}
          {rows.map((o) => {
            const usual = weeklyNeedOn(st, o.storeId, weekday(o.date), o.date);
            return (
              <tr key={`${o.storeId}|${o.date}`} data-override={`${st.stores[o.storeId]?.code}|${o.date}`}>
                <td className={`${td} whitespace-nowrap`}>{WEEKDAY_SHORT[weekday(o.date)]} {niceDate(o.date)}</td>
                <td className={`${td} font-semibold`}>{st.stores[o.storeId]?.code ?? o.storeId}</td>
                <td className={td}>
                  {o.count === 0 ? <Chip tone="neutral">– Closed</Chip> : <Chip tone="info">{o.count > usual ? "+" : GLYPH.info} Needs {o.count}</Chip>}
                  <span className="ml-2 text-xs text-muted">usually {usual === 0 ? "closed" : usual}</span>
                </td>
                <td className={td}>{o.note || <span className="text-muted">No note</span>}</td>
                <td className={`${td} text-right`}>
                  <span className="inline-flex gap-1">
                    <Btn tone="ghost" onClick={() => edit(o)} aria-label={`Edit ${st.stores[o.storeId]?.code} on ${o.date}`}>Edit</Btn>
                    <Btn disabled={!!locked} onClick={() => remove(o)} aria-label={`Remove ${st.stores[o.storeId]?.code} on ${o.date}`}>Remove</Btn>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableShell>
    </div>
  );
}

