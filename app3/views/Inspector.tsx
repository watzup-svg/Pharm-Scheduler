// The docked Inspector: details and actions for the selected store day or pharmacist day.
import { useApp } from "../store.ts";
import { PharmacistDay } from "./inspector/PharmacistDay.tsx";
import { StoreCell } from "./inspector/StoreCell.tsx";
import { useLock } from "./inspector/lib.ts";

export function Inspector() {
  const world = useApp((s) => s.world);
  const sel = useApp((s) => s.selection);
  const lock = useLock();
  if (!world) return null;
  return (
    <div aria-label="Inspector details" className="flex-1">
      {lock && sel && (
        <p role="status" className="border-b border-line bg-warn-bg/60 px-3 py-1.5 text-sm" data-testid="inspector-lock">▲ {lock}</p>
      )}
      {!sel && <p className="p-3 text-sm text-muted">Select a store day or a person on the schedule to see details here.</p>}
      {sel?.storeId && <StoreCell key={`s|${sel.storeId}|${sel.date}`} storeId={sel.storeId} date={sel.date} />}
      {sel && !sel.storeId && sel.pharmacistId && <PharmacistDay key={`p|${sel.pharmacistId}|${sel.date}`} pharmacistId={sel.pharmacistId} date={sel.date} />}
    </div>
  );
}
