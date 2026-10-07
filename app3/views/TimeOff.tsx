// Time off: pharmacists down the side, days across, with the request list on the left and the selected day on the right (see App.tsx).
// The page itself is the sheet plus the Add drawer.
import { useApp } from "../store.ts";
import { AddDrawer } from "./timeoff/AddDrawer.tsx";
import { Sheet } from "./timeoff/Sheet.tsx";

export function TimeOff() {
  const world = useApp((s) => s.world);
  if (!world) return null;
  return (
    <>
      <h2 className="sr-only">Time off</h2>
      <Sheet />
      <AddDrawer />
    </>
  );
}
