import { DoorClosed } from "lucide-react";
import { announce } from "@/components/undo";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { monthName } from "@/lib/schedule/calendar";
import { CLOSURE_REASONS } from "@/lib/schedule/closure";
import { shortStoreName } from "@/lib/schedule/fix";
import { useScheduleStore } from "@/store/schedule-store";

/**
 * "Close this store for the day", one click with the reason. The reason prints on the poster ("Closed: Short-staffed") and
 * everyone scheduled there comes off the shift, so they are free to cover elsewhere.
 */
export function CloseStoreMenu({ store, day, variant = "ghost", onDone }: { store: string; day: number; variant?: "ghost" | "secondary"; onDone?: () => void }) {
  const doc = useScheduleStore((s) => s.doc);
  const close = useScheduleStore((s) => s.closeStoreDay);
  const name = shortStoreName(doc.stores.find((s) => s.code === store)?.name ?? store);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant={variant} size="sm" className={variant === "ghost" ? "justify-start px-0 underline underline-offset-4 hover:bg-transparent" : undefined} aria-label={`Close ${name} for the day`}>
          <DoorClosed />
          Close {name} today…
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <div className="px-3 py-2 text-xs text-muted">Why is it closed? This prints on the poster.</div>
        {CLOSURE_REASONS.map((reason) => (
          <DropdownMenuItem
            key={reason}
            onSelect={() => {
              close(store, day, reason);
              announce(`${name} closed on ${monthName(doc.year, doc.month).slice(0, 3)} ${day}: ${reason}. Its pharmacist is free.`);
              onDone?.();
            }}
          >
            {reason}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
