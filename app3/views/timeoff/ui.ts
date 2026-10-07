// View state of the Time off page, shared by the page, its header band and the Add drawer. Nothing here is schedule data.
import { create } from "zustand";
import type { ISODate } from "@domain";

export type Tab = "waiting" | "approved" | "declined";
export type AddMode = "add" | "sick";

const KEY = "hs-timeoff-tab";
const readTab = (): Tab | null => {
  try { const v = localStorage.getItem(KEY); return v === "waiting" || v === "approved" || v === "declined" ? v : null; } catch { return null; }
};
const writeTab = (t: Tab) => { try { localStorage.setItem(KEY, t); } catch { /* browser storage may be off; the choice still holds until the page closes */ } };

type TimeOffUi = {
  /** The last filter the DM chose; null until they choose one (then the page opens on Waiting if anything waits). */
  tab: Tab | null;
  /** Month on show, "2026-10"; null = the month of the as-of date. */
  month: string | null;
  /** The open day, if any. */
  day: ISODate | null;
  /** A request's dates, outlined on the month while its row is pointed at. */
  lit: { first: ISODate; last: ISODate } | null;
  /** The Add drawer: which mode it is in, or null when closed. */
  add: AddMode | null;
  /** A day to start the Add drawer on (from the open day). */
  addDate: ISODate | null;
  setTab(t: Tab): void;
  setMonth(m: string | null): void;
  openDay(d: ISODate | null): void;
  setLit(l: TimeOffUi["lit"]): void;
  openAdd(mode: AddMode | null, date?: ISODate): void;
};

export const useTimeOffUi = create<TimeOffUi>((set) => ({
  tab: readTab(),
  month: null,
  day: null,
  lit: null,
  add: null,
  addDate: null,
  setTab: (tab) => { writeTab(tab); set({ tab }); },
  setMonth: (month) => set({ month, day: null }),
  openDay: (day) => set(day ? { day, month: day.slice(0, 7) } : { day: null }),
  setLit: (lit) => set({ lit }),
  openAdd: (add, date) => set({ add, addDate: date ?? null }),
}));

export const shiftMonth = (ym: string, by: number): string => {
  const n = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + by;
  return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;
};
