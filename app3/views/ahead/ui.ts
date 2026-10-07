// View state of Plan ahead: which future month is open. Nothing here is schedule data.
import { create } from "zustand";

type AheadUi = { month: string | null; setMonth(m: string | null): void };
export const useAheadUi = create<AheadUi>((set) => ({ month: null, setMonth: (month) => set({ month }) }));
