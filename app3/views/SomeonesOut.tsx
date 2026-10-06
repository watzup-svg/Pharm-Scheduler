// "Someone's out": quick add for time off, what it affects, cover, and the upcoming records.
import { useMemo, useState } from "react";
import { api, applyScratch, type DomainState, type ISODate, type Unavailability, type UnavailStatus, type UnavailType } from "@domain";
import { useApp } from "../store.ts";
import { Btn, Chip, Section, type ChipTone } from "../ui/primitives.tsx";
import { RepairOptions } from "./chrome/RepairOptions.tsx";
import { codeOf, fmtShort, plural, useChrome } from "./chrome/shared.tsx";

const TYPES: UnavailType[] = ["Vacation", "Sick", "Other", "Turned-down"];
const STATUS_TONE: Record<UnavailStatus, ChipTone> = { Requested: "warning", Approved: "info", Actual: "info", Denied: "neutral" };
const STATUS_MARK: Record<UnavailStatus, string> = { Requested: "? ", Approved: "✓ ", Actual: "✓ ", Denied: "– " };

const field = "h-8 w-full rounded-md border border-edge bg-white px-1.5 text-sm";

const span = (u: { first: ISODate; last: ISODate }) => (u.first === u.last ? fmtShort(u.first) : `${fmtShort(u.first)} to ${fmtShort(u.last)}`);

/** Assignments of this person inside the record's dates that fail availability once the record counts. */
function affectedBy(state: DomainState, u: Unavailability, asOf: ISODate, withRequested: boolean) {
  const ev = api.evaluate(state, asOf, { range: { from: u.first, to: u.last }, includeRequested: withRequested });
  const out: { storeId: string; date: ISODate }[] = [];
  for (const a of Object.values(state.assignments)) {
    if (a.pharmacistId !== u.pharmacistId || a.date < u.first || a.date > u.last) continue;
    const r = ev.assignments[a.id]?.results.find((x) => x.ruleId === "availability");
    if (r && r.verdict === "Fail" && !r.overridden) out.push({ storeId: a.storeId, date: a.date });
  }
  return out;
}

/** How many cells would newly be open if this requested record were approved. Nothing is committed. */
function openIfApproved(state: DomainState, u: Unavailability, asOf: ISODate): number {
  const range = { from: u.first, to: u.last };
  const base = api.evaluate(state, asOf, { range });
  const next = applyScratch(state, [{ t: "unavail.update", id: u.id, patch: { status: "Approved" } }]);
  if ("refused" in next) return 0;
  const ev = api.evaluate(next, asOf, { range });
  let n = 0;
  for (const [k, c] of Object.entries(ev.cells)) if (c.date >= asOf && c.open > (base.cells[k]?.open ?? 0)) n++;
  return n;
}

type Added = { id: string; pharmacistId: string };

export function SomeonesOut({ compact = false, onClose }: { compact?: boolean; onClose?: () => void } = {}) {
  const world = useApp((s) => s.world);
  const asOf = useApp((s) => s.asOf);
  const [pid, setPid] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [type, setType] = useState<UnavailType>("Vacation");
  const [status, setStatus] = useState<UnavailStatus | null>(null);
  const [storeId, setStoreId] = useState("");
  const [added, setAdded] = useState<Added | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [formOpen, setFormOpen] = useState(compact);
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
  const records = useMemo(
    () => (state ? Object.values(state.unavailability).filter((u) => u.last >= asOf).sort((a, b) => (a.first < b.first ? -1 : a.first > b.first ? 1 : a.id < b.id ? -1 : 1)) : []),
    [state, asOf],
  );
  const previews = useMemo(() => {
    const m = new Map<string, number>();
    if (state) for (const u of records) if (u.status === "Requested") m.set(u.id, openIfApproved(state, u, asOf));
    return m;
  }, [state, records, asOf]);

  // What the record just added does to the schedule, read fresh from the world each time.
  const addedRec = added && state ? state.unavailability[added.id] : undefined;
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
      setAdded({ id, pharmacistId: chosenPid });
      if (compact) onClose?.(); else setFormOpen(false);
      setFirst("");
      setLast("");
    }
  };
  const update = (u: Unavailability, st: UnavailStatus) =>
    useApp.getState().commit([{ t: "unavail.update", id: u.id, patch: { status: st } }], `Time off ${st.toLowerCase()} for ${state.pharmacists[u.pharmacistId]?.name ?? u.pharmacistId}.`);
  const remove = (u: Unavailability) => {
    useApp.getState().commit([{ t: "unavail.remove", id: u.id }], `Time off removed for ${state.pharmacists[u.pharmacistId]?.name ?? u.pharmacistId}.`);
    if (added?.id === u.id) setAdded(null);
  };

  return (
    <Section title="Someone's out" className="bg-cream">
      {sc && (
        <div className="mb-2 rounded-md bg-warn-bg/60 p-2 text-sm ring-1 ring-inset ring-warn/35" role="region" aria-label="What-if">
          <p className="font-semibold">▲ {sc.parked ? "What-if parked (not saved)" : "What-if open (not saved)"}: {sc.name}</p>
          {sc.stale ? (
            <p className="mt-0.5">The live schedule changed after you parked this, so it can only be discarded.</p>
          ) : sc.parked ? (
            <p className="mt-0.5">The live schedule is open for changes again. This what-if waits, and goes stale if the live schedule changes.</p>
          ) : (
            <p className="mt-0.5">The live schedule is read-only while a what-if is open.</p>
          )}
          {confirmDiscard ? (
            <div className="mt-1.5">
              <p>Discard it? Its {plural(sc.edits.length, "edit")} are not kept anywhere else.</p>
              <div className="mt-1 flex gap-1.5">
                <Btn tone="ink" onClick={() => { useApp.getState().discardScenario(); setConfirmDiscard(false); }}>Discard what-if</Btn>
                <Btn tone="ghost" onClick={() => setConfirmDiscard(false)}>Keep it</Btn>
              </div>
            </div>
          ) : (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {!sc.parked && !sc.stale && <Btn onClick={() => useApp.getState().parkScenario()}>Park what-if and open live</Btn>}
              <Btn onClick={() => setConfirmDiscard(true)}>Discard</Btn>
            </div>
          )}
        </div>
      )}

      {compact ? <Btn tone="ghost" onClick={() => onClose?.()} className="mb-2">Cancel</Btn> : <Btn aria-expanded={formOpen} onClick={() => setFormOpen((o) => !o)} className="mb-2">{formOpen ? "Close" : "+ Someone's out…"}</Btn>}
      {formOpen && (
      <form onSubmit={add} aria-label="Add time off" className="space-y-1.5">
        <div>
          <label htmlFor="out-who" className="text-xs font-medium">Who</label>
          <select id="out-who" className={field} value={chosenPid} onChange={(e) => setPid(e.target.value)}>
            {pharmacists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <label htmlFor="out-first" className="text-xs font-medium">{type === "Turned-down" ? "Day" : "First day"}</label>
            <input id="out-first" type="date" className={field} value={firstDay} onChange={(e) => setFirst(e.target.value)} />
          </div>
          {type !== "Turned-down" && (
            <div>
              <label htmlFor="out-last" className="text-xs font-medium">Last day (blank = one day)</label>
              <input id="out-last" type="date" className={field} value={last} min={firstDay} onChange={(e) => setLast(e.target.value)} />
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <label htmlFor="out-type" className="text-xs font-medium">Type</label>
            <select id="out-type" className={field} value={type} onChange={(e) => { setType(e.target.value as UnavailType); setStatus(null); }}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="out-status" className="text-xs font-medium">Status</label>
            <select id="out-status" className={field} value={effStatus} onChange={(e) => setStatus(e.target.value as UnavailStatus)}>
              <option value="Approved">Approved</option>
              <option value="Requested">Requested</option>
            </select>
          </div>
        </div>
        {type === "Turned-down" && (
          <div>
            <label htmlFor="out-store" className="text-xs font-medium">Turned down at store</label>
            <select id="out-store" className={field} value={effStore} onChange={(e) => setStoreId(e.target.value)}>
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
      )}

      {addedRec && addedInfo && (
        <div className="mt-2 rounded-md bg-white p-2 text-sm ring-1 ring-line" role="status" aria-label="What this changes">
          <p className="font-semibold">
            {addedInfo.counts
              ? `${plural(addedInfo.affected.length, "shift")} affected`
              : `${plural(addedInfo.affected.length, "shift")} would be affected if approved`}
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

      {!compact && <h4 className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Upcoming</h4>}
      {!compact && records.length === 0 && <p className="text-sm">No time off recorded from {fmtShort(asOf)} on.</p>}
      {!compact && <ul tabIndex={0} className="max-h-[200px] space-y-1.5 overflow-y-auto focus-visible:outline-2 focus-visible:outline-ink" aria-label="Upcoming time off">
        {records.map((u) => {
          const p = state.pharmacists[u.pharmacistId];
          const prev = previews.get(u.id);
          return (
            <li key={u.id} className="rounded-md bg-white p-2 text-sm ring-1 ring-line" data-unavail={u.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold" title={p?.name}>{p?.name ?? u.pharmacistId}</p>
                  <p className="text-xs text-muted">{span(u)} · {u.type}{u.scopeStoreId ? ` at ${codeOf(state, u.scopeStoreId)}` : ""}</p>
                </div>
                <Chip tone={STATUS_TONE[u.status]}>{STATUS_MARK[u.status]}{u.status}</Chip>
              </div>
              {u.status === "Requested" && prev !== undefined && (
                <p className="mt-0.5 text-xs">{prev === 0 ? "If approved: no cells open" : `If approved: ${plural(prev, "cell")} open`}</p>
              )}
              <div className="mt-1 flex flex-wrap gap-1">
                {(u.status === "Requested" || u.status === "Denied") && <Btn aria-label={`Approve: ${p?.name} ${span(u)}`} disabled={busy} onClick={() => update(u, "Approved")}>Approve</Btn>}
                {u.status === "Requested" && <Btn aria-label={`Deny: ${p?.name} ${span(u)}`} disabled={busy} onClick={() => update(u, "Denied")}>Deny</Btn>}
                <Btn tone="ghost" aria-label={`Remove: ${p?.name} ${span(u)}`} disabled={busy} onClick={() => remove(u)}>Remove</Btn>
              </div>
            </li>
          );
        })}
      </ul>}
    </Section>
  );
}
