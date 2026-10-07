// View state that belongs to the wall only: the Day view (one date, every store) and the drag in flight.
import { create } from "zustand";
import type { ISODate } from "@domain";

type WallUi = {
  /** The date shown in the Day view, or null for the grid. */
  day: ISODate | null;
  setDay(d: ISODate | null): void;
};
export const useWallUi = create<WallUi>((set) => ({ day: null, setDay: (day) => set({ day }) }));

/** The assignment being dragged to another store on the same date: from a wall block or from a row in the Inspector. */
export type DragInfo = { aid: string; date: string; store: string };
export const drag: { current: DragInfo | null } = { current: null };
