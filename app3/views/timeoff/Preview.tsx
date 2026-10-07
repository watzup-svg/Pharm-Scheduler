// What a new record would leave uncovered, shown before it is saved. Used by the Add drawer and the compact "Someone's out" form.
import { useMemo } from "react";
import type { DomainState, ISODate, UnavailStatus, UnavailType } from "@domain";
import { useApp } from "../../store.ts";
import { plural } from "../../copy.ts";
import { cx } from "../../ui/primitives.tsx";
import { callers, consequenceText, previewNewRecord } from "./calc.ts";

export type NewRecord = { pharmacistId: string; first: ISODate; last: ISODate; status: UnavailStatus; type: UnavailType };

export function AddPreview({ state, rec, label = "Before you save" }: { state: DomainState; rec: NewRecord | null; label?: string }) {
  const asOf = useApp((s) => s.asOf);
  const p = useMemo(() => (rec ? previewNewRecord(state, asOf, rec) : null), [state, asOf, rec?.pharmacistId, rec?.first, rec?.last, rec?.status, rec?.type]); // eslint-disable-line react-hooks/exhaustive-deps
  const first = p?.cells[0];
  const pid = rec?.pharmacistId;
  const covers = useMemo(() => (p && first && pid ? callers(p.after, first.storeId, first.date, asOf, [pid]).length : 0), [p, first, pid, asOf]);
  if (!rec || !p) return null;
  const who = state.pharmacists[rec.pharmacistId]?.name ?? "They";
  const text = consequenceText((id) => state.stores[id]?.code ?? id, p.cells, covers, rec.status === "Requested" ? "Approving this" : "Saving this");
  const tone = !p.cells.length ? "text-ok" : covers === 0 ? "text-illegal" : "text-warn";
  return (
    <div role="status" aria-label={label} data-add-preview className="rounded-lg bg-fill/60 px-3 py-2 text-sm">
      <p className="text-xs text-muted">{p.shifts ? `${who} is scheduled for ${plural(p.shifts, "shift")} in those days.` : `${who} has no shifts in those days.`}</p>
      <p className={cx("mt-0.5", tone)}><span aria-hidden>{!p.cells.length ? "✓" : "▲"}</span> {text}</p>
    </div>
  );
}
