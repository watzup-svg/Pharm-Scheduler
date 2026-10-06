// Setup > Pharmacists. Name, initials, base store, licenses per state, active dates. Never deleted: mark inactive from a date.
import { Fragment, useMemo, useState } from "react";
import { isValidDate, type Edit, type ISODate, type Pharmacist, type StateCode } from "@domain";
import { useApp } from "../../store.ts";
import { Btn, Chip, GLYPH } from "../../ui/primitives.tsx";
import { DateField, SelectField, TableShell, TextField, inputCls, nextIdFor, niceDate, pharmacistsSorted, storesSorted, td, th, useLocked } from "./shared.tsx";

const STATES: { code: StateCode; label: string }[] = [{ code: "OR", label: "Oregon" }, { code: "WA", label: "Washington" }];

function statusOf(p: Pharmacist, asOf: ISODate): { tone: "ok" | "warning" | "neutral"; text: string } {
  if (p.inactiveFrom && p.inactiveFrom <= asOf) return { tone: "neutral", text: `Left ${niceDate(p.inactiveFrom)}` };
  if (p.activeFrom && p.activeFrom > asOf) return { tone: "warning", text: `Starts ${niceDate(p.activeFrom)}` };
  if (p.inactiveFrom) return { tone: "warning", text: `Leaves ${niceDate(p.inactiveFrom)}` };
  return { tone: "ok", text: "Active" };
}

function suggestInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((w) => w[0]!.toUpperCase()).join("");
}

export function PharmacistsTab() {
  const world = useApp((s) => s.world)!;
  const asOf = useApp((s) => s.asOf);
  const locked = useLocked();
  const [editing, setEditing] = useState<string | null>(null);
  const list = useMemo(() => pharmacistsSorted(world.state), [world.state]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-2xl text-sm text-muted">
          Pharmacists are never deleted, because the schedule's history refers to them. When someone leaves, mark the first day they are no longer available.
        </p>
        <Btn tone="ink" className="shrink-0 whitespace-nowrap" disabled={!!locked || editing === "new"} onClick={() => setEditing("new")}>Add a pharmacist</Btn>
      </div>
      {editing === "new" && <PharmacistEditor key="new" onDone={() => setEditing(null)} />}
      <TableShell label="Pharmacists">
        <thead>
          <tr>
            <th className={th}>Name</th><th className={th}>Initials</th><th className={th}>Base store</th><th className={th}>Licenses</th><th className={th}>Status</th>
            <th className={th}><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {list.length === 0 && <tr><td className={`${td} text-muted`} colSpan={6}>No pharmacists yet. Use "Add a pharmacist" to start.</td></tr>}
          {list.map((p) => {
            const status = statusOf(p, asOf);
            const base = p.baseStoreId ? world.state.stores[p.baseStoreId]?.code ?? p.baseStoreId : null;
            return (
              <Fragment key={p.id}>
                <tr data-pharmacist-row={p.name}>
                  <td className={`${td} font-semibold`}>{p.name}</td>
                  <td className={td}>{p.initials}</td>
                  <td className={td}>{base ?? <span className="text-muted">None</span>}</td>
                  <td className={td}><Licenses p={p} /></td>
                  <td className={td}><Chip tone={status.tone} className="whitespace-nowrap">{status.tone === "ok" ? GLYPH.ok : status.tone === "warning" ? GLYPH.warning : "–"} {status.text}</Chip></td>
                  <td className={`${td} text-right`}><Btn aria-label={`Edit ${p.name}`} disabled={editing === p.id || !!locked} aria-expanded={editing === p.id} onClick={() => setEditing(p.id)}>Edit</Btn></td>
                </tr>
                {editing === p.id && <tr><td colSpan={6} className="border-b border-line bg-paper p-3"><PharmacistEditor pharmacist={p} onDone={() => setEditing(null)} /></td></tr>}
              </Fragment>
            );
          })}
        </tbody>
      </TableShell>
    </div>
  );
}

function Licenses({ p }: { p: Pharmacist }) {
  if (!p.licenses) return <Chip tone="warning" title="Counted at any store, but flagged as unverified">{GLYPH.info} Not recorded</Chip>;
  const keys = (Object.keys(p.licenses) as StateCode[]).sort();
  if (!keys.length) return <span className="text-muted">Not licensed in OR or WA</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {keys.map((k) => <Chip key={k} tone="info">{k}{p.licenses![k] ? ` until ${niceDate(p.licenses![k])}` : ""}</Chip>)}
    </span>
  );
}

type LicState = Record<StateCode, { on: boolean; until: string }>;

function PharmacistEditor({ pharmacist, onDone }: { pharmacist?: Pharmacist; onDone: () => void }) {
  const world = useApp((s) => s.world)!;
  const locked = useLocked();
  const commit = useApp((s) => s.commit);
  const isNew = !pharmacist;
  const stores = useMemo(() => storesSorted(world.state), [world.state]);

  const [name, setName] = useState(pharmacist?.name ?? "");
  const [initials, setInitials] = useState(pharmacist?.initials ?? "");
  const [initialsTouched, setInitialsTouched] = useState(!!pharmacist);
  const [base, setBase] = useState(pharmacist?.baseStoreId ?? "");
  const [recorded, setRecorded] = useState<boolean>(pharmacist ? !!pharmacist.licenses : true);
  const [lic, setLic] = useState<LicState>(() => ({
    OR: { on: !!pharmacist?.licenses && "OR" in pharmacist.licenses, until: pharmacist?.licenses?.OR ?? "" },
    WA: { on: !!pharmacist?.licenses && "WA" in pharmacist.licenses, until: pharmacist?.licenses?.WA ?? "" },
  }));
  const [activeFrom, setActiveFrom] = useState(pharmacist?.activeFrom ?? "");
  const [leaveFrom, setLeaveFrom] = useState(pharmacist?.inactiveFrom ?? "");
  const [touched, setTouched] = useState(false);

  const others = Object.values(world.state.pharmacists).filter((p) => p.id !== pharmacist?.id);
  const nameError = !name.trim() ? "Give the pharmacist a name." : null;
  const initialsError = !initials.trim() ? "Give the pharmacist initials, for example MQ." : null;
  const dup = others.find((p) => p.initials.trim().toUpperCase() === initials.trim().toUpperCase() && initials.trim());
  const untilError = (c: StateCode) => (recorded && lic[c].on && lic[c].until && !isValidDate(lic[c].until) ? "That is not a date." : null);
  const activeError = activeFrom && pharmacist?.inactiveFrom && pharmacist.inactiveFrom <= activeFrom ? "They would leave before they start." : null;

  const setName2 = (v: string) => {
    setName(v);
    if (!initialsTouched) setInitials(suggestInitials(v));
  };

  const buildLicenses = (): Pharmacist["licenses"] => {
    if (!recorded) return undefined;
    const out: Partial<Record<StateCode, ISODate | null>> = {};
    for (const s of STATES) if (lic[s.code].on) out[s.code] = lic[s.code].until || null;
    return out;
  };

  const save = () => {
    setTouched(true);
    if (nameError || initialsError || activeError || untilError("OR") || untilError("WA")) return;
    const id = pharmacist?.id ?? nextIdFor("P", Object.keys(world.state.pharmacists), world.state.nextId.pharmacist);
    const p: Pharmacist = { id, name: name.trim(), initials: initials.trim().toUpperCase(), baseStoreId: base || null };
    const licenses = buildLicenses();
    if (licenses) p.licenses = licenses;
    if (activeFrom) p.activeFrom = activeFrom;
    if (pharmacist?.inactiveFrom) p.inactiveFrom = pharmacist.inactiveFrom;
    const edits: Edit[] = [{ t: "pharmacist.set", pharmacist: p }];
    if (isNew) { if (commit(edits, `Added pharmacist ${p.name}.`)) onDone(); return; }
    if (JSON.stringify(p) === JSON.stringify(pharmacist)) { useApp.getState().say("info", "Nothing to change."); return; }
    commit(edits, `Updated pharmacist ${p.name}.`);
  };

  const saveLeave = (clear: boolean) => {
    if (!pharmacist) return;
    if (!clear && (!leaveFrom || !isValidDate(leaveFrom))) return;
    const p: Pharmacist = { ...pharmacist };
    if (clear) delete p.inactiveFrom; else p.inactiveFrom = leaveFrom;
    if (commit([{ t: "pharmacist.set", pharmacist: p }], clear ? `Made ${p.name} active again.` : `Marked ${p.name} inactive from ${niceDate(leaveFrom)}.`) && clear) setLeaveFrom("");
  };

  return (
    <div role="group" aria-label={isNew ? "Add a pharmacist" : `Edit ${pharmacist.name}`} className="flex flex-col gap-4 rounded-md bg-white p-3 ring-1 ring-line">
      <h3 className="text-sm font-semibold">{isNew ? "New pharmacist" : pharmacist.name}</h3>
      <div className="flex flex-wrap items-start gap-3">
        <TextField label="Name" value={name} onChange={setName2} className="w-64" error={touched ? nameError : null} />
        <div className="flex flex-col gap-1">
          <TextField label="Initials" value={initials} onChange={(v) => { setInitials(v.toUpperCase()); setInitialsTouched(true); }} maxLength={4} className="w-28" error={touched ? initialsError : null} hint="Shown on the wall" />
          {dup && <p className="max-w-[16rem] text-xs text-warn">▲ {dup.name} also uses {dup.initials}. Two people with the same initials are hard to tell apart on the wall.</p>}
        </div>
        <SelectField label="Base store" value={base} onChange={setBase} options={[{ value: "", label: "None" }, ...stores.map((s) => ({ value: s.id, label: `${s.code}  ${s.name}` }))]} hint="Where drive times start from" className="w-64" />
        <DateField label="Starts (optional)" value={activeFrom} onChange={setActiveFrom} error={touched ? activeError : null} hint="First day available" />
      </div>

      <fieldset className="flex flex-col gap-2 border-t border-line pt-3">
        <legend className="text-xs font-semibold uppercase tracking-wide text-muted">Licenses</legend>
        <div className="flex flex-col gap-1 text-sm">
          <label className="flex items-center gap-2"><input type="radio" name={`lic-${pharmacist?.id ?? "new"}`} checked={!recorded} onChange={() => setRecorded(false)} /> Not recorded</label>
          <p className="ml-6 max-w-xl text-xs text-muted">Not recorded means counted at any store, but flagged as unverified until you record where they are licensed.</p>
          <label className="flex items-center gap-2"><input type="radio" name={`lic-${pharmacist?.id ?? "new"}`} checked={recorded} onChange={() => setRecorded(true)} /> Licensed in:</label>
        </div>
        {recorded && (
          <div className="ml-6 flex flex-col gap-2">
            {STATES.map((s) => (
              <div key={s.code} className="flex flex-wrap items-center gap-3">
                <label className="flex w-44 items-center gap-2 text-sm"><input type="checkbox" checked={lic[s.code].on} onChange={(e) => setLic((p) => ({ ...p, [s.code]: { ...p[s.code], on: e.target.checked } }))} /> {s.label} ({s.code})</label>
                <label className="flex items-center gap-2 text-xs text-muted">Last valid day (optional)
                  <input type="date" aria-label={`${s.label} license last valid day`} disabled={!lic[s.code].on} value={lic[s.code].until} onChange={(e) => setLic((p) => ({ ...p, [s.code]: { ...p[s.code], until: e.target.value } }))} className={`${inputCls} w-40`} />
                </label>
                {untilError(s.code) && <span role="alert" className="text-xs text-illegal">▲ {untilError(s.code)}</span>}
              </div>
            ))}
            {!STATES.some((s) => lic[s.code].on) && <p className="text-xs text-warn">▲ Nothing ticked: they will show as not licensed at every store that has a state.</p>}
          </div>
        )}
      </fieldset>

      <div className="flex gap-2">
        <Btn tone="ink" disabled={!!locked} onClick={save}>{isNew ? "Add pharmacist" : "Save pharmacist"}</Btn>
        <Btn tone="ghost" onClick={onDone}>{isNew ? "Cancel" : "Done"}</Btn>
        {locked && <p className="self-center text-xs text-muted">{locked}</p>}
      </div>

      {!isNew && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">When someone leaves</h4>
          <p className="max-w-xl text-xs text-muted">The date is the first day they are no longer available. Earlier days keep their history.</p>
          <div className="flex flex-wrap items-end gap-3">
            <DateField label="First day away" value={leaveFrom} onChange={setLeaveFrom} />
            <Btn disabled={!!locked || !leaveFrom || !isValidDate(leaveFrom)} onClick={() => saveLeave(false)}>Mark inactive from {leaveFrom ? niceDate(leaveFrom) : "…"}</Btn>
            {pharmacist.inactiveFrom && <Btn tone="ghost" disabled={!!locked} onClick={() => saveLeave(true)}>Make active again</Btn>}
          </div>
        </div>
      )}
    </div>
  );
}
