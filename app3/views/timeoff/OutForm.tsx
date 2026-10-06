// The one "Someone's out" form, used in the right column (compact) and on the Time off page.
import { useId, useMemo, useState } from "react";
import { api, type UnavailStatus, type UnavailType } from "@domain";
import { useApp } from "../../store.ts";
import { Btn } from "../../ui/primitives.tsx";
import { RepairOptions } from "../chrome/RepairOptions.tsx";
import { plural, useChrome } from "../chrome/shared.tsx";
import { affectedBy, span } from "./lib.ts";

const TYPES: UnavailType[] = ["Vacation", "Sick", "Other", "Turned-down"];
const field = "h-8 w-full rounded-md border border-edge bg-white px-1.5 text-sm";

export function OutForm({ onAdded, label = "Add time off" }: { onAdded?: () => void; label?: string }) {
  const uid = useId();
  const world = useApp((s) => s.world);
  const asOf = useApp((s) => s.asOf);
  const [pid, setPid] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [type, setType] = useState<UnavailType>("Vacation");
  const [status, setStatus] = useState<UnavailStatus | null>(null);
  const [storeId, setStoreId] = useState("");
  const [added, setAdded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const state = world?.state;
  const sc = world?.session.scenario ?? null;
  const proposal = world?.session.proposal ?? null;
  const busy = !!proposal || (!!sc && !sc.parked);

  const pharmacists = useMemo(
    () => (state ? Object.values(state.pharmacists).filter((p) => p.inactiveFrom === undefined || p.inactiveFrom > asOf).sort((a, b) => a.name.localeCompare(b.name, "en")) : []),
    [state, asOf],
  );
  const stores = useMemo(
    () => (state ? Object.values(state.stores).filter((s) => s.inactiveFrom === undefined || s.inactiveFrom > asOf).sort((a, b) => a.code.localeCompare(b.code, "en")) : []),
    [state, asOf],
  );
  // What the record just added does to the schedule, read fresh from the world each time.
  const addedRec = added && state ? state.unavailability[added] : undefined;
  const addedInfo = useMemo(() => {
    if (!state || !addedRec) return null;
    const counts = addedRec.status === "Approved" || addedRec.status === "Actual";
    const affected = affectedBy(state, addedRec, asOf, !counts);
    const ev = api.evaluate(state, asOf, { range: { from: addedRec.first, to: addedRec.last } });
    const gaps = affected.filter((g) => g.date >= asOf && (ev.cells[`${g.storeId}|${g.date}`]?.open ?? 0) > 0);
    return { counts, affected, gaps };
  }, [state, addedRec, asOf]);
  if (!world || !state) return null;

  const chosenPid = pid && pharmacists.some((p) => p.id === pid) ? pid : pharmacists[0]?.id ?? "";
  const effStatus: UnavailStatus = status ?? (type === "Vacation" ? "Requested" : "Approved");
  const firstDay = first || asOf;
  const lastDay = type === "Turned-down" ? firstDay : last || firstDay;
  const effStore = storeId && stores.some((s) => s.id === storeId) ? storeId : stores[0]?.id ?? "";

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!chosenPid) { setError("Choose who is out."); return; }
    if (lastDay < firstDay) { setError("The last day is before the first day."); return; }
    if (type === "Turned-down" && !effStore) { setError("Turned-down needs a store."); return; }
    const id = `U${state.nextId.unavail}`;
    const who = state.pharmacists[chosenPid]?.name ?? chosenPid;
    const ok = useApp.getState().commit(
      [{ t: "unavail.add", pharmacistId: chosenPid, first: firstDay, last: lastDay, status: effStatus, type, ...(type === "Turned-down" ? { scopeStoreId: effStore } : {}) }],
      `Time off added for ${who}: ${type} ${span({ first: firstDay, last: lastDay })}, ${effStatus}.`,
    );
    if (ok) {
      setAdded(id);
      setFirst("");
      setLast("");
      onAdded?.();
    }
  };

  return (
    <>
      <form onSubmit={add} aria-label={label} className="space-y-1.5">
        <div>
          <label htmlFor={`${uid}-who`} className="text-xs font-medium">Who</label>
          <select id={`${uid}-who`} className={field} value={chosenPid} onChange={(e) => setPid(e.target.value)}>
            {pharmacists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <label htmlFor={`${uid}-first`} className="text-xs font-medium">{type === "Turned-down" ? "Day" : "First day"}</label>
            <input id={`${uid}-first`} type="date" className={field} value={firstDay} onChange={(e) => setFirst(e.target.value)} />
          </div>
          {type !== "Turned-down" && (
            <div>
              <label htmlFor={`${uid}-last`} className="text-xs font-medium">Last day (blank = one day)</label>
              <input id={`${uid}-last`} type="date" className={field} value={last} min={firstDay} onChange={(e) => setLast(e.target.value)} />
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <label htmlFor={`${uid}-type`} className="text-xs font-medium">Type</label>
            <select id={`${uid}-type`} className={field} value={type} onChange={(e) => { setType(e.target.value as UnavailType); setStatus(null); }}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`${uid}-status`} className="text-xs font-medium">Status</label>
            <select id={`${uid}-status`} className={field} value={effStatus} onChange={(e) => setStatus(e.target.value as UnavailStatus)}>
              <option value="Approved">Approved</option>
              <option value="Requested">Requested</option>
            </select>
          </div>
        </div>
        {type === "Turned-down" && (
          <div>
            <label htmlFor={`${uid}-store`} className="text-xs font-medium">Turned down at store</label>
            <select id={`${uid}-store`} className={field} value={effStore} onChange={(e) => setStoreId(e.target.value)}>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.code} {s.name}</option>)}
            </select>
          </div>
        )}
        {error && <p role="alert" className="text-xs text-illegal">▲ {error}</p>}
        <div className="flex items-center gap-2">
          <Btn type="submit" tone="ink" disabled={busy || !chosenPid}>Add time off</Btn>
          {busy && <span className="text-xs text-muted">{proposal ? "Accept or discard the proposal first." : "Park or discard the what-if first."}</span>}
        </div>
      </form>

      {addedRec && addedInfo && (
        <div className="mt-2 rounded-md bg-white p-2 text-sm ring-1 ring-line" role="status" aria-label="What this changes">
          <p className="font-semibold">
            {addedInfo.counts ? `${plural(addedInfo.affected.length, "shift")} affected` : `${plural(addedInfo.affected.length, "shift")} would be affected if approved`}
          </p>
          <p className="text-xs text-muted">{state.pharmacists[addedRec.pharmacistId]?.name}, {span(addedRec)}.</p>
          {addedInfo.counts && addedInfo.gaps.length > 0 && (
            <Btn
              className="mt-1.5"
              disabled={busy}
              onClick={() => {
                useChrome.getState().setRepairOrigin("out");
                useApp.getState().runRepair(addedInfo.gaps);
              }}
            >
              Find cover for these (up to 5)
            </Btn>
          )}
          {addedInfo.counts && addedInfo.affected.length > 0 && addedInfo.gaps.length === 0 && <p className="text-xs">Nothing is open because of this.</p>}
        </div>
      )}
      <RepairOptions where="out" />
    </>
  );
}
