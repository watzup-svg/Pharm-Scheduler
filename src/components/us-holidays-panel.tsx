import { useStoreTag } from "@/components/use-store-tag";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { announce } from "@/components/undo";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import { weekdayLong } from "@/lib/schedule/calendar";
import { usHolidays } from "@/lib/schedule/us-holidays";
import type { Holiday } from "@/lib/schedule/types";
import { useScheduleStore } from "@/store/schedule-store";

const COMMON = new Set(["newyear", "memorial", "july4", "labor", "thanksgiving", "christmas"]);

function niceDate(iso: string): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return `${weekdayLong(y, m, d).slice(0, 3)} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${d}`;
}

/** Common U.S. holidays, worked out here (no internet). The manager picks which ones close which stores. */
export function UsHolidaysPanel() {
  const tag = useStoreTag();
  const doc = useScheduleStore((s) => s.doc);
  const addHolidays = useScheduleStore((s) => s.addHolidays);
  const [year, setYear] = useState(doc.year);
  const [picked, setPicked] = useState<Set<string>>(new Set(COMMON));
  const [allStores, setAllStores] = useState(true);
  const [stores, setStores] = useState<Set<string>>(new Set());
  const [observed, setObserved] = useState(false);
  const list = useMemo(() => usHolidays(year), [year]);

  function toggle<T>(set: Set<T>, v: T, apply: (s: Set<T>) => void) {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    apply(next);
  }

  const chosen = list.filter((h) => picked.has(h.key));
  const targets = allStores ? ["ALL"] : doc.stores.map((s) => s.code).filter((c) => stores.has(c));
  const total = chosen.length * targets.length;

  function onAdd() {
    if (!chosen.length) return toast.error("Choose at least one holiday.");
    if (!targets.length) return toast.error("Choose at least one store, or all stores.");
    const rows: Holiday[] = [];
    for (const h of chosen) {
      const date = observed && h.observed ? h.observed : h.date;
      for (const store of targets) rows.push({ date, store, label: h.label, repeat: h.fixed && !(observed && h.observed) });
    }
    const n = addHolidays(rows);
    if (n === 0) return toast.message("Those are already on the list.");
    announce(`Added ${n} ${n === 1 ? "holiday" : "holidays"}${n < rows.length ? ` (${rows.length - n} were already there)` : ""}`);
  }

  return (
    <section aria-label="Common U.S. holidays" className="surface p-4 sm:p-5">
      <h2 className="text-base font-semibold">Add common U.S. holidays</h2>
      <p className="mt-1 mb-3 max-w-2xl text-xs text-pretty text-muted">
        Worked out on this computer. Which ones your stores really close for is up to you, and the list starts with the usual six.
        Fixed dates repeat every year; the others (Labor Day, Thanksgiving…) move, so they are added for {year} only.
      </p>
      <div className="mb-3 flex flex-col gap-2 sm:w-40">
        <Label htmlFor="us-year">Year</Label>
        <NativeSelect id="us-year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[doc.year - 1, doc.year, doc.year + 1].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </NativeSelect>
      </div>
      <ul className="grid gap-x-4 sm:grid-cols-2">
        {list.map((h) => (
          <li key={h.key}>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" className="size-5 accent-ink" checked={picked.has(h.key)} onChange={() => toggle(picked, h.key, setPicked)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{h.label}</span>
                <span className="block text-xs text-muted">
                  {niceDate(h.date)}
                  {h.observed ? ` · observed ${niceDate(h.observed)}` : ""}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" className="size-5 accent-ink" checked={observed} onChange={(e) => setObserved(e.target.checked)} />
        When one falls on a weekend, close the observed weekday instead
      </label>
      <fieldset className="mt-2">
        <legend className="text-sm font-medium">Closes</legend>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" className="size-5 accent-ink" checked={allStores} onChange={(e) => setAllStores(e.target.checked)} />
          Every store
        </label>
        {!allStores ? (
          <ul className="grid gap-x-4 sm:grid-cols-3">
            {doc.stores.map((s) => (
              <li key={s.code}>
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input type="checkbox" className="size-5 accent-ink" checked={stores.has(s.code)} onChange={() => toggle(stores, s.code, setStores)} />
                  <span className="truncate">
                    {tag(s.code)} · {s.name}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ) : null}
      </fieldset>
      <div className="mt-3">
        <Button type="button" variant="secondary" onClick={onAdd} disabled={total === 0}>
          {total ? `Add ${total} ${total === 1 ? "holiday" : "holidays"}` : "Add holidays"}
        </Button>
      </div>
    </section>
  );
}
