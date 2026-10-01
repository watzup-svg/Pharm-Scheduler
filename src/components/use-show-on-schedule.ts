import { useNavigate } from "@tanstack/react-router";
import type { CellRef } from "@/lib/schedule/types";
import { useViewStore } from "@/store/view-store";

/** Go to the Schedule and land on a cell, from any page. */
export function useShowOnSchedule() {
  const navigate = useNavigate();
  const goTo = useViewStore((s) => s.goTo);
  return (ref: CellRef, edit = false) => {
    goTo(ref, edit);
    void navigate({ to: "/schedule", resetScroll: false });
  };
}
