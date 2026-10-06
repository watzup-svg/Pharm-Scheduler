// The thresholds the rules read. Editable here; saved through config.set. Validation is plain: whole numbers, soft limit not above hard limit.
import { useState } from "react";
import type { Config } from "@domain";
import { useApp } from "../../store.ts";
import { Btn } from "../../ui/primitives.tsx";

type Key = "travelSoftMinutes" | "travelHardMinutes" | "maxConsecutiveDays" | "minRestoredStanding" | "minTravelSavedMinutes" | "maxChanged" | "excludeNextDays" | "searchNodeLimit";
type FieldDef = { key: Key; label: string; unit: string; help: string; min: number; max: number };

const read = (c: Config, k: Key): number =>
  k === "minRestoredStanding" || k === "minTravelSavedMinutes" || k === "maxChanged" || k === "excludeNextDays" ? c.improve[k] : c[k];

const RULE_FIELDS: FieldDef[] = [
  { key: "travelSoftMinutes", label: "Long drive", unit: "minutes", help: "A one-way drive over this is flagged as a long drive (warning).", min: 1, max: 1440 },
  { key: "travelHardMinutes", label: "Hard drive limit", unit: "minutes", help: "A one-way drive over this is flagged as over the hard limit (warning). Not below the long drive.", min: 1, max: 1440 },
  { key: "maxConsecutiveDays", label: "Most days in a row", unit: "days", help: "A pharmacist working more days in a row than this is flagged on the extra days.", min: 1, max: 31 },
];
const IMPROVE_FIELDS: FieldDef[] = [
  { key: "minRestoredStanding", label: "Standing assignments restored", unit: "assignments", help: "Improve counts a change as worth proposing if it puts back at least this many standing assignments.", min: 1, max: 100 },
  { key: "minTravelSavedMinutes", label: "Travel saved", unit: "minutes", help: "...or if it saves at least this many total drive minutes.", min: 1, max: 10000 },
  { key: "maxChanged", label: "Most assignments changed", unit: "assignments", help: "Improve never proposes changing more than this many assignments at once.", min: 1, max: 100 },
  { key: "excludeNextDays", label: "Leave the next days alone", unit: "days", help: "Improve does not touch the next this-many days unless you ask it to.", min: 0, max: 365 },
];
const SEARCH_FIELD: FieldDef = { key: "searchNodeLimit", label: "Search effort", unit: "candidates", help: "How hard the search tries before it says so: a count of options looked at, never time. Higher looks longer and the answer for the same data stays the same.", min: 1, max: 100_000_000 };

const ALL = [...RULE_FIELDS, ...IMPROVE_FIELDS, SEARCH_FIELD];

export function ConfigForm({ config }: { config: Config }) {
  const commit = useApp((s) => s.commit);
  const [draft, setDraft] = useState<Record<Key, string>>(() => Object.fromEntries(ALL.map((f) => [f.key, String(read(config, f.key))])) as Record<Key, string>);

  const errors: Partial<Record<Key, string>> = {};
  const num: Partial<Record<Key, number>> = {};
  for (const f of ALL) {
    const raw = draft[f.key].trim();
    if (!/^\d+$/.test(raw)) { errors[f.key] = "Use a whole number."; continue; }
    const n = Number(raw);
    if (n < f.min || n > f.max) { errors[f.key] = `Use a whole number from ${f.min.toLocaleString("en-US")} to ${f.max.toLocaleString("en-US")}.`; continue; }
    num[f.key] = n;
  }
  if (!errors.travelSoftMinutes && !errors.travelHardMinutes && num.travelSoftMinutes! > num.travelHardMinutes!) {
    errors.travelHardMinutes = "The hard limit cannot be lower than the long drive.";
  }
  const dirty = ALL.some((f) => draft[f.key].trim() !== String(read(config, f.key)));
  const invalid = Object.keys(errors).length > 0;

  const save = () => {
    if (invalid || !dirty) return;
    const n = num as Record<Key, number>;
    commit([{
      t: "config.set",
      patch: {
        travelSoftMinutes: n.travelSoftMinutes, travelHardMinutes: n.travelHardMinutes, maxConsecutiveDays: n.maxConsecutiveDays, searchNodeLimit: n.searchNodeLimit,
        improve: { minRestoredStanding: n.minRestoredStanding, minTravelSavedMinutes: n.minTravelSavedMinutes, maxChanged: n.maxChanged, excludeNextDays: n.excludeNextDays },
      },
    }], "Changed the rule settings.");
  };

  const row = (f: FieldDef) => (
    <div key={f.key} className="grid grid-cols-[14rem_6.5rem_1fr] items-start gap-x-3 py-1.5">
      <label htmlFor={`cfg-${f.key}`} className="pt-1 text-sm font-semibold">{f.label} <span className="font-normal text-muted">({f.unit})</span></label>
      <input
        id={`cfg-${f.key}`} inputMode="numeric" value={draft[f.key]} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
        aria-invalid={!!errors[f.key]} aria-describedby={`cfg-${f.key}-h`}
        className={`h-8 rounded-md border bg-white px-2 text-right text-sm tabular-nums ${errors[f.key] ? "border-illegal" : "border-edge"}`}
      />
      <div id={`cfg-${f.key}-h`} className="pt-0.5 text-xs text-muted">
        {errors[f.key] ? <span role="alert" className="font-semibold text-illegal">▲ {errors[f.key]} </span> : null}
        {f.help}
      </div>
    </div>
  );

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} aria-label="Rule settings">
      <h3 className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted">Rule limits</h3>
      {RULE_FIELDS.map(row)}
      <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Improve</h3>
      {IMPROVE_FIELDS.map(row)}
      <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Search</h3>
      {row(SEARCH_FIELD)}
      <div className="mt-3 flex items-center gap-2">
        <Btn tone="ink" type="submit" disabled={!dirty || invalid}>Save settings</Btn>
        {dirty && <Btn onClick={() => setDraft(Object.fromEntries(ALL.map((f) => [f.key, String(read(config, f.key))])) as Record<Key, string>)}>Undo my typing</Btn>}
        {invalid && <span className="text-xs font-semibold text-illegal">▲ Fix the marked fields to save.</span>}
      </div>
    </form>
  );
}
