// Small pieces shared by the Setup tabs: form fields, date wording, and a few lookups on the world.
import { useId, type ReactNode } from "react";
import { cmp, weekday, type DomainState, type ISODate, type Pharmacist, type Store } from "@domain";
import { useApp } from "../../store.ts";
import { cx } from "../../ui/primitives.tsx";

export const EPOCH = "0001-01-01";
export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
/** Monday first, the order the DM reads a week in. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const ORDINAL = ["", "1st", "2nd", "3rd", "4th", "5th"] as const;

export const inputCls = "h-8 rounded-md border border-edge bg-white px-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink disabled:opacity-50";

export function Field({ label, hint, error, children, className }: { label: string; hint?: ReactNode; error?: string | null; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="text-xs font-semibold text-muted">{label}</label>
      {children(id)}
      {error ? <p role="alert" className="text-xs text-illegal">▲ {error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function TextField({ label, value, onChange, hint, error, maxLength, placeholder, className, inputClassName }: { label: string; value: string; onChange: (v: string) => void; hint?: ReactNode; error?: string | null; maxLength?: number; placeholder?: string; className?: string; inputClassName?: string }) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(id) => <input id={id} type="text" value={value} maxLength={maxLength} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cx(inputCls, inputClassName)} aria-invalid={!!error} />}
    </Field>
  );
}

export function DateField({ label, value, onChange, hint, error, className, min }: { label: string; value: string; onChange: (v: string) => void; hint?: ReactNode; error?: string | null; className?: string; min?: string }) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(id) => <input id={id} type="date" value={value} min={min} onChange={(e) => onChange(e.target.value)} className={cx(inputCls, "w-40")} aria-invalid={!!error} />}
    </Field>
  );
}

export function SelectField({ label, value, onChange, options, hint, error, className }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; hint?: ReactNode; error?: string | null; className?: string }) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(id) => (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={cx(inputCls, "pr-6")} aria-invalid={!!error}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </Field>
  );
}

/** "Mon 12 Oct 2026". Plain wording for any date; the beginning of time reads as "the beginning". */
export function niceDate(d: ISODate | undefined | null): string {
  if (!d) return "";
  if (d === EPOCH) return "the beginning";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return d;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
}

/** "Tue 6 Oct": short form for lists of upcoming dates. */
export function shortDate(d: ISODate): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return d;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${WEEKDAY_SHORT[weekday(d)]} ${Number(m[3])} ${months[Number(m[2]) - 1]}`;
}

export function listSorted<T extends { id: string }>(rec: Record<string, T>, by: (t: T) => string): T[] {
  return Object.values(rec).sort((a, b) => cmp(by(a), by(b)) || cmp(a.id, b.id));
}

export function storesSorted(s: DomainState): Store[] {
  return listSorted(s.stores, (x) => x.code.toUpperCase());
}
export function pharmacistsSorted(s: DomainState): Pharmacist[] {
  return listSorted(s.pharmacists, (x) => x.name.toUpperCase());
}

/** Next id for a table keyed `<prefix><n>`: one more than the biggest in use, so an id is never reused while it exists. */
export function nextIdFor(prefix: string, ids: string[], counter: number): string {
  let max = Math.max(0, counter - 1);
  for (const id of ids) {
    const n = Number(id.slice(prefix.length));
    if (id.startsWith(prefix) && Number.isFinite(n)) max = Math.max(max, n);
  }
  return `${prefix}${max + 1}`;
}

/** The weekly need for a weekday in force on a date (ignores one-off date changes and closing dates). */
export function weeklyNeedOn(s: DomainState, storeId: string, weekday: number, date: ISODate): number {
  let n = 0;
  let best = "";
  for (const r of Object.values(s.requirements)) {
    if (r.storeId === storeId && r.weekday === weekday && r.effectiveFrom <= date && r.effectiveFrom >= best) { n = r.count; best = r.effectiveFrom; }
  }
  return n;
}

export function storeLabel(s: DomainState, id: string): string {
  const st = s.stores[id];
  return st ? st.code : id;
}

/** Why Setup cannot be changed right now, in words; null when it can. */
export function useLocked(): string | null {
  const world = useApp((s) => s.world);
  const ro = useApp((s) => s.readOnlyProblems);
  if (ro) return "This file opened read-only because some of its data is inconsistent. Setup can be read but not changed.";
  if (world?.session.proposal) return "A proposal is open. Accept or discard it before changing setup.";
  if (world?.session.scenario && !world.session.scenario.parked) return "A what-if scenario is open. Park or discard it before changing setup.";
  return null;
}

export function TableShell({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="overflow-x-auto rounded-md bg-white ring-1 ring-line">
      <table aria-label={label} className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}
export const th = "border-b border-line px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted";
export const td = "border-b border-line/70 px-2 py-1.5 align-top";
