import { announce } from "@/components/undo";
import { storeLabel } from "@/lib/schedule/fix";
import { getCell } from "@/lib/schedule/grid";
import { RPH_SLOTS } from "@/lib/schedule/slots";
import type { SlotId } from "@/lib/schedule/types";
import { useScheduleStore } from "@/store/schedule-store";

/** Trade places with anyone else booked this day. The same swap as dragging one name onto another; one undo puts both back. */
export function SwapWith({ store, slot, day, name }: { store: string; slot: SlotId; day: number; name: string }) {
  const doc = useScheduleStore((s) => s.doc);
  const swap = useScheduleStore((s) => s.swap);
  const others = doc.stores.flatMap((st) =>
    RPH_SLOTS.map((sl) => ({ store: st.code, slot: sl, who: getCell(doc.grid, st.code, sl, day).trim() })).filter((o) => o.who && !(o.store === store && o.slot === slot)),
  );
  if (!others.length) return null;
  return (
    <select
      aria-label={`Swap ${name.split(" ")[0]} with`}
      value=""
      className="h-11 min-h-11 rounded-md bg-fill px-2 text-sm font-semibold text-ink ring-1 ring-edge"
      onChange={(e) => {
        const o = others[Number(e.target.value)];
        if (!o) return;
        const before = JSON.stringify(doc.grid);
        swap({ store, slot, day }, { store: o.store, slot: o.slot, day });
        const after = useScheduleStore.getState().doc;
        if (JSON.stringify(after.grid) === before) announce(`Could not swap ${name.split(" ")[0]} and ${o.who.split(" ")[0]}. One of them can't be placed there.`);
        else announce(`Swapped ${name.split(" ")[0]} and ${o.who.split(" ")[0]}`);
      }}
    >
      <option value="">Swap with…</option>
      {others.map((o, i) => (
        <option key={`${o.store}-${o.slot}`} value={i}>
          {o.who} · {storeLabel(doc, o.store)}
        </option>
      ))}
    </select>
  );
}
