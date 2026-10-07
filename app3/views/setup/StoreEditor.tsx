// The store form: details, weekly need from a date, and closing a store from a date. Each Save is one change set.
import { useMemo, useState } from "react";
import { isValidDate, type Edit, type StateCode, type Store } from "@domain";
import { useApp } from "../../store.ts";
import { setupDefaults } from "../../newWorld.ts";
import { Btn } from "../../ui/primitives.tsx";
import { DateField, EPOCH, SelectField, TextField, WEEK_ORDER, WEEKDAY_LONG, WEEKDAY_SHORT, inputCls, nextIdFor, niceDate, td, th, useLocked, weeklyNeedOn } from "./shared.tsx";

const STATE_OPTIONS = [
  { value: "", label: "Not recorded" },
  { value: "OR", label: "Oregon (OR)" },
  { value: "WA", label: "Washington (WA)" },
];

export function StoreEditor({ store, onDone }: { store?: Store; onDone: (newStoreId?: string) => void }) {
  const world = useApp((s) => s.world)!;
  const asOf = useApp((s) => s.asOf);
  const locked = useLocked();
  const commit = useApp((s) => s.commit);
  const isNew = !store;

  const [code, setCode] = useState(store?.code ?? "");
  const [name, setName] = useState(store?.name ?? "");
  const [state, setState] = useState<string>(store ? store.state ?? "" : setupDefaults.state ?? "");
  const [activeFrom, setActiveFrom] = useState(store?.activeFrom ?? "");
  const [touched, setTouched] = useState(false);

  // weekly need: for a new store, the starting numbers; for an existing one, changes from a date
  const [newNeed, setNewNeed] = useState<Record<number, string>>({ 0: "0", 1: "1", 2: "1", 3: "1", 4: "1", 5: "1", 6: "0" });
  const [effFrom, setEffFrom] = useState<string>(asOf);
  const [edited, setEdited] = useState<Record<number, string>>({});
  const [needTouched, setNeedTouched] = useState(false);
  const [closeFrom, setCloseFrom] = useState<string>(store?.inactiveFrom ?? "");

  const others = Object.values(world.state.stores).filter((s) => s.id !== store?.id);
  const codeError = !code.trim() ? "Give the store a short code, for example EST." : others.some((s) => s.code.trim().toUpperCase() === code.trim().toUpperCase()) ? `Another store already uses the code ${code.trim().toUpperCase()}.` : null;
  const nameError = !name.trim() ? "Give the store a name." : null;
  const activeError = activeFrom && !isValidDate(activeFrom) ? "That is not a date." : activeFrom && store?.inactiveFrom && store.inactiveFrom <= activeFrom ? "The store would be closed before it opens." : null;

  const countOk = (v: string) => /^\d$/.test(v.trim());
  const shown = (w: number): string => (isNew ? newNeed[w]! : edited[w] ?? String(weeklyNeedOn(world.state, store!.id, w, effFrom || asOf)));
  const needErrors = WEEK_ORDER.filter((w) => !countOk(shown(w)));

  const history = useMemo(() => {
    if (!store) return {} as Record<number, string>;
    const out: Record<number, string> = {};
    for (let w = 0; w < 7; w++) {
      const rows = Object.values(world.state.requirements).filter((r) => r.storeId === store.id && r.weekday === w).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
      out[w] = rows.map((r) => `${r.count === 0 ? "closed" : r.count} from ${niceDate(r.effectiveFrom)}`).join(", then ") || "no need recorded";
    }
    return out;
  }, [store, world.state.requirements]);

  const build = (over: Partial<Store> = {}): Store => {
    const out: Store = { id: store?.id ?? "", code: code.trim().toUpperCase(), name: name.trim(), state: (state || null) as StateCode | null };
    if (activeFrom) out.activeFrom = activeFrom;
    const inactive = "inactiveFrom" in over ? over.inactiveFrom : store?.inactiveFrom;
    if (inactive) out.inactiveFrom = inactive;
    return out;
  };

  const saveDetails = () => {
    setTouched(true);
    if (codeError || nameError || activeError) return;
    if (isNew) {
      if (needErrors.length) { setNeedTouched(true); return; }
      const id = nextIdFor("S", Object.keys(world.state.stores), world.state.nextId.store);
      const st = { ...build(), id };
      const edits: Edit[] = [{ t: "store.set", store: st }];
      for (let w = 0; w < 7; w++) edits.push({ t: "requirement.set", storeId: id, weekday: w, effectiveFrom: EPOCH, count: Number(newNeed[w]) });
      if (commit(edits, `Added store ${st.code}.`)) onDone(id);
      return;
    }
    const next = build();
    next.id = store.id;
    const same = next.code === store.code && next.name === store.name && next.state === store.state && next.activeFrom === store.activeFrom;
    if (same) { useApp.getState().say("info", "Nothing to change."); return; }
    commit([{ t: "store.set", store: next }], `Updated store ${next.code}.`);
  };

  const saveNeed = () => {
    if (!store) return;
    setNeedTouched(true);
    if (!effFrom || !isValidDate(effFrom) || needErrors.length) return;
    const edits: Edit[] = [];
    const days: string[] = [];
    for (const w of WEEK_ORDER) {
      const n = Number(shown(w));
      if (n !== weeklyNeedOn(world.state, store.id, w, effFrom)) { edits.push({ t: "requirement.set", storeId: store.id, weekday: w, effectiveFrom: effFrom, count: n }); days.push(`${WEEKDAY_SHORT[w]} ${n}`); }
    }
    if (!edits.length) { useApp.getState().say("info", "No weekday has a different number from that date."); return; }
    if (commit(edits, `Changed ${store.code} weekly need from ${niceDate(effFrom)}: ${days.join(", ")}.`)) setEdited({});
  };

  const saveClose = (clear: boolean) => {
    if (!store) return;
    if (!clear && (!closeFrom || !isValidDate(closeFrom))) return;
    const next: Store = { ...store };
    if (clear) delete next.inactiveFrom; else next.inactiveFrom = closeFrom;
    if (commit([{ t: "store.set", store: next }], clear ? `Made store ${store.code} active again.` : `Marked store ${store.code} inactive from ${niceDate(closeFrom)}.`) && clear) setCloseFrom("");
  };

  const stateNote = state === "" ? "Licensing is not checked at this store while its state is not recorded." : null;

  return (
    <div role="group" aria-label={isNew ? "Add a store" : `Edit store ${store.code}`} className="flex flex-col gap-4 rounded-md bg-white p-3 ring-1 ring-line">
      <h3 className="text-sm font-semibold">{isNew ? "New store" : `Store ${store.code}`}</h3>
      <div className="flex flex-wrap items-start gap-3">
        <TextField label="Code" value={code} onChange={(v) => setCode(v.toUpperCase())} maxLength={5} className="w-28" error={touched ? codeError : null} hint="Short letters shown on the wall" />
        <TextField label="Name" value={name} onChange={setName} className="w-72" error={touched ? nameError : null} />
        <SelectField label="State" value={state} onChange={setState} options={STATE_OPTIONS} hint={stateNote ?? "Used to check pharmacist licenses"} className="w-56" />
        <DateField label="Active from (optional)" value={activeFrom} onChange={setActiveFrom} error={touched ? activeError : null} hint="First day it needs staff" />
      </div>
      <div className="flex gap-2">
        <Btn tone="ink" disabled={!!locked} onClick={saveDetails}>{isNew ? "Add store" : "Save store details"}</Btn>
        <Btn tone="ghost" onClick={() => onDone()}>{isNew ? "Cancel" : "Done"}</Btn>
        {locked && <p className="self-center text-xs text-muted">{locked}</p>}
      </div>

      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Weekly need</h4>
        {!isNew && (
          <div className="flex flex-wrap items-end gap-3">
            <DateField label="Change from" value={effFrom} onChange={setEffFrom} error={needTouched && !isValidDate(effFrom) ? "Pick the date the new numbers start." : null} hint="Earlier dates keep their old numbers" />
          </div>
        )}
        <div className="overflow-x-auto"><table aria-label="Weekly need" className="text-sm">
          <thead><tr><th className={th}>Day</th><th className={th}>Pharmacists needed</th>{!isNew && <th className={th}>History</th>}</tr></thead>
          <tbody>
            {WEEK_ORDER.map((w) => {
              const v = shown(w);
              const bad = !countOk(v);
              return (
                <tr key={w}>
                  <td className={td}>{WEEKDAY_LONG[w]}</td>
                  <td className={td}>
                    <input aria-label={`${WEEKDAY_LONG[w]} pharmacists needed`} inputMode="numeric" value={v} onChange={(e) => (isNew ? setNewNeed((p) => ({ ...p, [w]: e.target.value })) : setEdited((p) => ({ ...p, [w]: e.target.value })))} className={`${inputCls} w-16 text-center`} aria-invalid={bad} />
                    {v.trim() === "0" && <span className="ml-2 text-xs text-muted">closed</span>}
                    {bad && needTouched && <span role="alert" className="ml-2 text-xs text-illegal">▲ Use a whole number from 0 to 9.</span>}
                  </td>
                  {!isNew && <td className={`${td} text-xs text-muted`}>{history[w]}</td>}
                </tr>
              );
            })}
          </tbody>
        </table></div>
        {!isNew && <div><Btn tone="ink" disabled={!!locked} onClick={saveNeed}>Save weekly need</Btn></div>}
      </div>

      {!isNew && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Closing this store</h4>
          <p className="max-w-xl text-xs text-muted">The date is the first day the store stays closed. Earlier days keep their history.</p>
          <div className="flex flex-wrap items-end gap-3">
            <DateField label="First closed day" value={closeFrom} onChange={setCloseFrom} />
            <Btn tone="quiet" disabled={!!locked || !closeFrom || !isValidDate(closeFrom)} onClick={() => saveClose(false)}>Mark inactive from {closeFrom ? niceDate(closeFrom) : "…"}</Btn>
            {store.inactiveFrom && <Btn tone="ghost" disabled={!!locked} onClick={() => saveClose(true)}>Make active again</Btn>}
          </div>
        </div>
      )}
    </div>
  );
}
