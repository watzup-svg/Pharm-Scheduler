// Time off: the requests beside one month. Pointing at a request outlines its days; a day opens into who is off, which stores are short and who could be called.
import { useEffect, useRef } from "react";
import { useApp } from "../store.ts";
import { AddDrawer } from "./timeoff/AddDrawer.tsx";
import { DayDetail } from "./timeoff/DayDetail.tsx";
import { Month } from "./timeoff/Month.tsx";
import { Requests } from "./timeoff/Requests.tsx";
import { useWhyLocked } from "./timeoff/lib.ts";
import { useTimeOffUi } from "./timeoff/ui.ts";

export function TimeOff() {
  const world = useApp((s) => s.world);
  const day = useTimeOffUi((s) => s.day);
  const locked = !!useWhyLocked();
  // Keyboard focus follows the day: into its title when it opens, back to its square in the month when it closes.
  const was = useRef<string | null>(null);
  useEffect(() => {
    const prev = was.current;
    was.current = day;
    if (day && !prev) document.getElementById("day-title")?.focus();
    else if (!day && prev) document.querySelector<HTMLElement>(`[data-date="${prev}"]`)?.focus();
  }, [day]);
  if (!world) return null;
  return (
    <div className="mx-auto grid max-w-[1180px] grid-cols-[minmax(0,1fr)_minmax(0,540px)] items-start gap-10 px-6 pb-10 pt-5">
      <h2 className="sr-only">Time off</h2>
      <Requests locked={locked} />
      {day ? <DayDetail locked={locked} /> : <Month />}
      <AddDrawer />
    </div>
  );
}
