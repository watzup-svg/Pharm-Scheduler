import { storeTag as labelOf } from "@/lib/schedule/label";
import { Undo2 } from "lucide-react";
import { useMemo } from "react";
import { Mark } from "@/components/icons";
import { StateMark } from "@/components/marks";
import { announce } from "@/components/undo";
import { Button } from "@/components/ui/button";
import { acceptedItems } from "@/lib/schedule/accept";
import { monthName, weekdayShort } from "@/lib/schedule/calendar";
import { closuresInMonth } from "@/lib/schedule/closure";
import { shortStoreName } from "@/lib/schedule/fix";
import { useScheduleStore } from "@/store/schedule-store";
import { useViewStore } from "@/store/view-store";

/**
 * Everything the district manager decided to live with: problems accepted instead of fixed, and stores closed on purpose.
 * Each one can be taken back with one click.
 */
export function AcceptedList({ onGo }: { onGo?: () => void }) {
  const doc = useScheduleStore((s) => s.doc);
  const ev = useScheduleStore((s) => s.evaluation);
  const unaccept = useScheduleStore((s) => s.unacceptProblems);
  const reopen = useScheduleStore((s) => s.reopenStoreDay);
  const goTo = useViewStore((s) => s.goTo);
  const items = useMemo(() => acceptedItems(doc, ev), [doc, ev]);
  const closures = useMemo(() => closuresInMonth(doc), [doc]);
  if (!items.length && !closures.length) return <p className="text-sm text-muted">Nothing left as is. Problems you leave instead of fixing are listed here.</p>;
  const mon = monthName(doc.year, doc.month).slice(0, 3);
  return (
    <ul className="flex flex-col gap-1">
      {closures.map((c) => (
        <li key={`c|${c.store}|${c.day}`} className="flex items-center gap-2 rounded-lg bg-white px-3 py-1 ring-1 ring-line">
          <Mark icon="closed" tip={false} className="size-5 text-muted" />
          <button
            type="button"
            onClick={() => {
              goTo({ store: c.store, slot: "pharmacist", day: c.day }, false);
              onGo?.();
            }}
            className="min-h-11 min-w-0 flex-1 text-left text-sm"
          >
            <span className="font-medium">
              {shortStoreName(doc.stores.find((s) => s.code === c.store)?.name ?? c.store)} closed, {weekdayShort(doc.year, doc.month, c.day)} {mon} {c.day}
            </span>
            <span className="block text-xs text-muted">{c.label}</span>
          </button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              reopen(c.store, c.day);
              announce(`Reopened ${labelOf(doc, c.store)} on the ${c.day}. The shifts are open again.`);
            }}
          >
            <Undo2 />
            Reopen
          </Button>
        </li>
      ))}
      {items.map((it) => (
        <li key={it.key} className="flex items-center gap-2 rounded-lg bg-white px-3 py-1 ring-1 ring-line">
          <StateMark kind="asis" size={20} tip={false} />
          <button
            type="button"
            onClick={() => {
              const store = it.store || doc.stores.find((s) => ev.byKey[`${s.code}|${it.day}`]?.doubledAccepted.includes(it.name))?.code || doc.stores[0]?.code || "";
              goTo({ store, slot: "pharmacist", day: it.day }, false);
              onGo?.();
            }}
            className="min-h-11 min-w-0 flex-1 text-left text-sm"
          >
            <span className="font-medium">{it.label}</span>
            <span className="block text-xs text-muted">
              Left as is {new Date(it.at).toLocaleDateString([], { month: "short", day: "numeric" })}
            </span>
          </button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              unaccept([it.key]);
              announce("Back on the to-fix list");
            }}
          >
            <Undo2 />
            Put back
          </Button>
        </li>
      ))}
    </ul>
  );
}
