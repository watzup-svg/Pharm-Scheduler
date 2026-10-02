import { useMemo, useState } from "react";
import { announce } from "@/components/undo";
import { useStoreTag } from "@/components/use-store-tag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { driveKey, pairMiles } from "@/lib/schedule/geo";
import { storesNeedingDistances } from "@/lib/schedule/new-store";
import { useScheduleStore } from "@/store/schedule-store";

/**
 * Shown only when a store has no measured distances (a store was added, or its address changed). Collapsed to one line;
 * open it for one row per other store. Blank rows stay as they are. Closing a store needs nothing here: removing it
 * removes its distances and it drops out of suggestions.
 */
export function NewStoreDistances() {
  const doc = useScheduleStore((s) => s.doc);
  const save = useScheduleStore((s) => s.importDriveMiles);
  const tag = useStoreTag();
  const needs = useMemo(() => storesNeedingDistances(doc), [doc]);
  const [pick, setPick] = useState("");
  const [vals, setVals] = useState<Record<string, { miles: string; min: string }>>({});
  // The store that most needs it first: the one with the most open pairs (a newly added store lists every other store).
  const ordered = [...needs].sort((a, b) => b.others.length - a.others.length);
  const current = ordered.find((n) => n.code === pick) ?? ordered[0];
  if (!current) return null;
  const store = doc.stores.find((s) => s.code === current.code)!;
  const nameOf = (c: string) => doc.stores.find((s) => s.code === c)?.name ?? c;
  const get = (c: string) => vals[c] ?? { miles: "", min: "" };
  const set = (c: string, part: Partial<{ miles: string; min: string }>) => setVals((v) => ({ ...v, [c]: { ...get(c), ...part } }));
  const filled = current.others.filter((c) => Number(get(c).miles) >= 0.1 || Number(get(c).min) >= 1);

  return (
    <details className="surface" data-testid="new-store-distances">
      <summary className="flex min-h-11 cursor-pointer items-center px-5 text-sm font-semibold">
        {tag(store.code)} · {store.name} has no measured distances to {current.others.length} store{current.others.length === 1 ? "" : "s"}. Add them
      </summary>
      <div className="flex flex-col gap-3 px-5 pb-5">
        <p className="text-sm text-pretty text-muted">
          Enter one-way road miles and drive minutes from this store to each other store (from a map). Leave a row blank to keep the estimate. If you give miles but no minutes, minutes are worked out from the miles.
        </p>
        {ordered.length > 1 ? (
          <NativeSelect aria-label="Store to fill in" value={current.code} onChange={(e) => setPick(e.target.value)}>
            {ordered.map((n) => (
              <option key={n.code} value={n.code}>
                {tag(n.code)} · {nameOf(n.code)} ({n.others.length} open)
              </option>
            ))}
          </NativeSelect>
        ) : null}
        <ul className="flex max-h-[50dvh] flex-col gap-1 overflow-y-auto" aria-label="Distances to fill in">
          {current.others.map((c) => {
            const est = pairMiles(doc, current.code, c).miles;
            return (
              <li key={c} className="grid grid-cols-[1fr_5.5rem_5.5rem] items-center gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-line">
                <span className="min-w-0 truncate text-sm">
                  {tag(c)} · {nameOf(c)}
                </span>
                <Input aria-label={`Miles to ${nameOf(c)}`} inputMode="decimal" placeholder={est != null ? `~${est}` : "miles"} value={get(c).miles} onChange={(e) => set(c, { miles: e.target.value.replace(/[^\d.]/g, "").slice(0, 6) })} />
                <Input aria-label={`Minutes to ${nameOf(c)}`} inputMode="numeric" placeholder="min" value={get(c).min} onChange={(e) => set(c, { min: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
              </li>
            );
          })}
        </ul>
        <div>
          <Button
            type="button"
            variant="secondary"
            disabled={!filled.length}
            onClick={() => {
              const miles: Record<string, number> = {};
              const minutes: Record<string, number> = {};
              for (const c of filled) {
                const k = driveKey(current.code, c);
                const v = get(c);
                if (Number(v.miles) >= 0.1) miles[k] = Number(v.miles);
                if (Number(v.min) >= 1) minutes[k] = Number(v.min);
              }
              save(miles, minutes);
              announce(`${filled.length} distance${filled.length === 1 ? "" : "s"} saved for ${tag(current.code)}`);
              setVals({});
            }}
          >
            Save {filled.length || ""} distance{filled.length === 1 ? "" : "s"}
          </Button>
        </div>
      </div>
    </details>
  );
}
