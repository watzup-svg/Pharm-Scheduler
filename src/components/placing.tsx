import { Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/graphics";
import { RoleMark } from "@/components/icons";
import { announce } from "@/components/undo";
import { useStoreTag } from "@/components/use-store-tag";
import { okToPlace } from "@/components/usual-off";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { monthName } from "@/lib/schedule/calendar";
import { glowFor, glowKey, type Glow } from "@/lib/schedule/glow";
import { shortStoreName } from "@/lib/schedule/fix";
import { isRphRole } from "@/lib/schedule/slots";
import { cn } from "@/lib/utils";
import { useScheduleStore } from "@/store/schedule-store";
import { useViewStore } from "@/store/view-store";

/** The glow for the person being placed, or an empty map. One pass over the month; recomputed only when the schedule changes. */
export function usePlacingGlow(): { name: string | null; glow: Map<string, Glow> } {
  const doc = useScheduleStore((s) => s.doc);
  const name = useViewStore((s) => s.placing);
  const glow = useMemo(() => (name ? glowFor(doc, name) : new Map<string, Glow>()), [doc, name]);
  return { name, glow };
}

/**
 * Tap a green day to put the chosen person there. Goes through the same placement as everything else, asks first on a
 * usual day off, and explains why any other day is not offered. Returns true when it handled the tap.
 */
export async function placeFromBench(store: string, day: number): Promise<boolean> {
  const view = useViewStore.getState();
  const name = view.placing;
  if (!name) return false;
  const st = useScheduleStore.getState();
  const glow = glowFor(st.doc, name).get(glowKey(store, day));
  const first = name.split(" ")[0];
  const storeName = shortStoreName(st.doc.stores.find((s) => s.code === store)?.name ?? store);
  const when = `${monthName(st.doc.year, st.doc.month).slice(0, 3)} ${day}`;
  if (glow === "filled") {
    announce(`${storeName} on ${when} already has someone. Turn off placing to change it.`);
    return true;
  }
  if (glow === "double") {
    announce(`${first} is already working that day. Open the day to move them.`);
    return true;
  }
  if (glow === "off") {
    announce(`${first} is on time off ${when}.`);
    return true;
  }
  if (glow === "blocked" || glow === undefined) {
    announce(`${first} can’t be placed at ${storeName} (not licensed there, or the store is closed).`);
    return true;
  }
  if (glow === "dayoff" && !(await okToPlace(st.doc, name, day))) return true;
  st.setCell(store, "pharmacist", day, name);
  announce(`${name} on ${storeName}, ${when}`);
  return true;
}

/** The bar above the calendars: pick someone to place, or see who is being placed and finish. */
/** `bar` is the green strip shown while placing; `button` is the "Place a person" trigger. Both default to showing whichever applies. */
export function PlaceBar({ part }: { part?: "bar" | "button" } = {}) {
  const placing = useViewStore((s) => s.placing);
  const setPlacing = useViewStore((s) => s.setPlacing);
  const doc = useScheduleStore((s) => s.doc);
  const tag = useStoreTag();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const people = useMemo(
    () => doc.people.filter((p) => isRphRole(p.role) && p.name.toLowerCase().includes(q.trim().toLowerCase())),
    [doc.people, q],
  );
  // Leaving the calendars (or the page) ends placing, so nothing stays armed.
  useEffect(() => () => setPlacing(null), [setPlacing]);
  useEffect(() => {
    if (!placing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPlacing(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placing, setPlacing]);

  if (placing) {
    if (part === "button") return null;
    return (
      <div role="status" className="sticky top-14 z-20 flex items-center gap-3 rounded-xl bg-ok-bg px-3 py-2 ring-1 ring-ok/40">
        <Avatar name={placing} />
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-semibold">{placing}</span>
        </p>
        <Button type="button" size="sm" onClick={() => setPlacing(null)}>
          <X />
          Done
        </Button>
      </div>
    );
  }
  if (part === "bar") return null;
  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Place a person
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {open ? (
          <DialogContent sheet title="Place a person" description="Pick someone. Days they can work turn green; tap one to place them.">
            <div className="relative mb-2">
              <Search aria-hidden className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted" />
              <Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a pharmacist" placeholder="Find a pharmacist" autoComplete="off" />
            </div>
            <ul className="flex max-h-[50dvh] flex-col gap-1 overflow-y-auto">
              {people.map((p) => (
                <li key={p.name}>
                  <button
                    type="button"
                    onClick={() => {
                      setPlacing(p.name);
                      setOpen(false);
                    }}
                    className="flex min-h-12 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-paper"
                  >
                    <Avatar name={p.name} />
                    <span className="min-w-0 flex-1 text-sm font-medium">{p.name}</span>
                    {p.home && p.home !== "—" ? <RoleMark float={p.role === "Float Pharmacist"} store={tag(p.home)} className="text-xs text-muted" /> : null}
                  </button>
                </li>
              ))}
            </ul>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}

/** Classes for a day while someone is being placed. */
export function glowClass(g: Glow | undefined): string {
  switch (g) {
    case "free":
      return "bg-ok-bg ring-2 ring-ok";
    case "dayoff":
      return "border-2 border-dashed border-warn bg-warn-bg/40";
    case "double":
    case "off":
      return "opacity-60 ring-1 ring-warn/50";
    case "filled":
      return "opacity-35";
    default:
      return cn("opacity-25");
  }
}
