// View state of the Time off page, shared by the page, its header band and the Add drawer. Nothing here is schedule data.
import { create } from "zustand";
import type { ISODate } from "@domain";

export type Tab = "waiting" | "approved" | "declined";
export type AddMode = "add";

const KEY = "hs-timeoff-tab";
const readTab = (): Tab | null => {
  try { const v = localStorage.getItem(KEY); return v === "waiting" || v === "approved" || v === "declined" ? v : null; } catch { return null; }
};
const writeTab = (t: Tab) => { try { localStorage.setItem(KEY, t); } catch { /* browser storage may be off; the choice still holds until the page closes */ } };

type TimeOffUi = {
  /** The last filter the DM chose; null until they choose one (then the list opens on Waiting if anything waits). */
  tab: Tab | null;
  /** Text typed in the "Find a person" box above the sheet. */
  filter: string;
  /** The Add drawer: which mode it is in, or null when closed. */
  add: AddMode | null;
  /** A day and a person to start the Add drawer on (from the selected cell). */
  addDate: ISODate | null;
  addPid: string | null;
  addLast: ISODate | null;
  /** The days dragged across on the sheet (one person's row), highlighted until the form closes. */
  range: { pid: string; first: ISODate; last: ISODate } | null;
  setTab(t: Tab): void;
  setFilter(f: string): void;
  openAdd(mode: AddMode | null, date?: ISODate, pid?: string, last?: ISODate): void;
  setRange(r: TimeOffUi["range"]): void;
};

export const useTimeOffUi = create<TimeOffUi>((set) => ({
  tab: readTab(),
  filter: "",
  add: null,
  addDate: null,
  addPid: null,
  addLast: null,
  range: null,
  setTab: (tab) => { writeTab(tab); set({ tab }); },
  setFilter: (filter) => set({ filter }),
  openAdd: (add, date, pid, last) => set({ add, addDate: date ?? null, addPid: pid ?? null, addLast: last ?? null, ...(add === null ? { range: null } : {}) }),
  setRange: (range) => set({ range }),
}));

export const shiftMonth = (ym: string, by: number): string => {
  const n = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + by;
  return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;
};
