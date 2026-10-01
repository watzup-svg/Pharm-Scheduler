import { useLayoutEffect } from "react";
import { MonthBoard } from "@/components/month-board";
import { StatusStrip } from "@/components/status-strip";
import { useViewStore } from "@/store/view-store";

/**
 * The status strip, then the month. Leaving to Time off, Holidays or Print and coming back lands on the same place.
 */
export function ScheduleScreen() {
  useLayoutEffect(() => {
    const view = useViewStore.getState();
    // A jump from another page scrolls to its cell; otherwise put the page back where it was.
    if (!view.pendingScroll) window.scrollTo(0, view.scrollY);
    let frame = 0;
    function onScroll() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => useViewStore.getState().setScrollY(window.scrollY));
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // On a laptop the day panel sits on the right, so the page leaves room for it and the calendars stay in view.
  const panelOpen = useViewStore((s) => s.sheet != null);
  return (
    <div className={"mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-4 py-4 sm:px-6 lg:py-6 " + (panelOpen ? "lg:pr-[27.5rem]" : "")}>
      <h1 className="sr-only">Schedule</h1>
      <StatusStrip />
      <MonthBoard />
    </div>
  );
}
