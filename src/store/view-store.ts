import "../lib/safe-storage.ts";
import { create } from "zustand";
import type { IssueAnchor } from "../lib/schedule/issue-cursor.ts";
import type { CellRef, SlotId } from "../lib/schedule/types.ts";

/**
 * Where the person is on the Schedule screen. UI only: never saved in the file,
 * never on the undo stack. It lives outside the screen so Time off, Holidays and
 * Print can hand the person back to the same store, cell and scroll position.
 */
export type BoardMode = "calendars" | "week" | "day";

/** What one Copy took: the names on one store-day, by row. */
export type Clip = { store: string; day: number; names: { slot: SlotId; name: string }[] };

export type PrintTarget = { kind: "store" | "person"; id: string } | null;

const DISPLAY_KEY = "hischool-display-v1";
function readDisplay(): { large: boolean; contrast: boolean } {
  try {
    const v = JSON.parse(localStorage.getItem(DISPLAY_KEY) ?? "{}") as { large?: boolean; contrast?: boolean };
    return { large: Boolean(v.large), contrast: Boolean(v.contrast) };
  } catch {
    return { large: false, contrast: false };
  }
}

export type ViewState = {
  /** "Larger text" and "High contrast", from the File menu. Kept in this browser. */
  textLarge: boolean;
  highContrast: boolean;
  setTextLarge: (on: boolean) => void;
  setHighContrast: (on: boolean) => void;
  /** "all" or a store code. */
  storeTab: string;
  /** Which stores the board lists: everything, only stores with problems, or one state ("OR"). */
  storeFilter: string;
  mode: BoardMode;
  /** First day of the week being shown in Week mode (a Sunday, or day 1). */
  weekStart: number;
  /** The date shown in Day mode. */
  dayPick: number;
  /** The cell that is highlighted on the calendar. */
  focus: CellRef | null;
  /** The issue the header arrows stand on, and the month it belongs to ("2026-10"). Null when she is not stepping. */
  issue: (IssueAnchor & { ym: string }) | null;
  setIssue: (issue: (IssueAnchor & { ym: string }) | null) => void;
  /** The kind of problem the header arrows are narrowed to (a tile was clicked). Null: every kind. */
  issueKind: "hole" | "double" | "leftover" | "license" | null;
  setIssueKind: (kind: "hole" | "double" | "leftover" | "license" | null) => void;
  /**
   * What the pointer is over in the header or a calendar, so the other one can answer: days to light on the ring and
   * cells to outline below. Laptop hover only; nothing is chosen or changed.
   */
  hover: { days: number[]; cells: string[]; dim: boolean } | null;
  setHover: (hover: { days: number[]; cells: string[]; dim: boolean } | null) => void;
  /** The day being edited, or null when no sheet is open. `run` keeps going to the next problem after each fix. */
  sheet: { store: string; day: number; slot: SlotId; seed: string; run: boolean } | null;
  /** Person whose days are highlighted, or "". */
  person: string;
  /** Overview open on phone. Always open on a laptop. */
  overviewOpen: boolean;
  /** Show every problem in the overview instead of the first two. */
  problemsOpen: boolean;
  helpOpen: boolean;
  /** The jump-to search box. */
  searchOpen: boolean;
  /** The "Fill the month" proposal. */
  /** Someone picked on the Schedule to place on empty days by tapping. UI only. */
  /** A phone number waiting to be called. Phone links open this sheet instead of navigating the page. */
  dial: { who: string; tel: string; display: string } | null;
  setDial: (d: { who: string; tel: string; display: string } | null) => void;
  placing: string | null;
  setPlacing: (name: string | null) => void;
  iconGuideOpen: boolean;
  setIconGuideOpen: (open: boolean) => void;
  fillOpen: boolean;
  setFillOpen: (open: boolean) => void;
  /** The "someone called in sick" helper; the seed pre-fills who and which day. */
  sick: { name: string; day: number } | null;
  /** Last name placed, for the ' shortcut. */
  lastName: string;
  clip: Clip | null;
  /** Set by "Print this store" so the Print page opens on it. */
  printTarget: PrintTarget;
  /** Which tab Time off was on, so coming back lands in the same place. */
  timeOffFilter: "waiting" | "approved" | "declined" | null;
  setTimeOffFilter: (f: "waiting" | "approved" | "declined") => void;
  /** Page scroll to restore when the Schedule comes back. */
  scrollY: number;
  /** Set by a jump from another page; the Schedule scrolls to `focus` once and clears it. */
  pendingScroll: boolean;
  setStoreTab: (tab: string) => void;
  setStoreFilter: (filter: string) => void;
  setMode: (mode: BoardMode) => void;
  setWeekStart: (day: number) => void;
  setDayPick: (day: number) => void;
  setPerson: (name: string) => void;
  setOverviewOpen: (open: boolean) => void;
  setProblemsOpen: (open: boolean) => void;
  setHelpOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  openSick: (seed?: { name?: string; day?: number }) => void;
  closeSick: () => void;
  setLastName: (name: string) => void;
  setClip: (clip: Clip | null) => void;
  setPrintTarget: (target: PrintTarget) => void;
  setScrollY: (y: number) => void;
  /** Land on a cell. `edit` opens the day sheet on it. `run` keeps stepping through problems. Works from any page. */
  goTo: (ref: CellRef, edit?: boolean, seed?: string, run?: boolean) => void;
  openSheet: (store: string, day: number, slot?: SlotId, seed?: string, run?: boolean) => void;
  closeSheet: () => void;
  setFocus: (ref: CellRef | null) => void;
  consumePendingScroll: () => boolean;
};

export const useViewStore = create<ViewState>((set, get) => ({
  textLarge: readDisplay().large,
  highContrast: readDisplay().contrast,
  setTextLarge: (on) => {
    set({ textLarge: on });
    try {
      localStorage.setItem(DISPLAY_KEY, JSON.stringify({ large: on, contrast: get().highContrast }));
    } catch {
      /* not saved */
    }
  },
  setHighContrast: (on) => {
    set({ highContrast: on });
    try {
      localStorage.setItem(DISPLAY_KEY, JSON.stringify({ large: get().textLarge, contrast: on }));
    } catch {
      /* not saved */
    }
  },
  storeTab: "all",
  storeFilter: "all",
  mode: "calendars",
  weekStart: 1,
  dayPick: 1,
  focus: null,
  issue: null,
  setIssue: (issue) => set(issue ? { issue } : { issue, issueKind: null }),
  issueKind: null,
  setIssueKind: (issueKind) => set({ issueKind }),
  hover: null,
  setHover: (hover) => set({ hover }),
  sheet: null,
  person: "",
  // On a phone the overview starts folded so the calendars are not a screen and a half away; on a laptop it is always shown.
  overviewOpen: typeof window === "undefined" || typeof window.matchMedia !== "function" ? true : window.matchMedia("(min-width: 1024px)").matches,
  problemsOpen: false,
  helpOpen: false,
  searchOpen: false,
  dial: null,
  setDial: (d) => set({ dial: d }),
  placing: null,
  setPlacing: (name) => set({ placing: name }),
  iconGuideOpen: false,
  setIconGuideOpen: (open) => set({ iconGuideOpen: open }),
  fillOpen: false,
  setFillOpen: (open) => set({ fillOpen: open }),
  sick: null,
  lastName: "",
  clip: null,
  printTarget: null,
  timeOffFilter: null,
  setTimeOffFilter: (f) => set({ timeOffFilter: f }),
  scrollY: 0,
  pendingScroll: false,

  setStoreTab: (tab) => set({ storeTab: tab }),
  setStoreFilter: (filter) => set({ storeFilter: filter, storeTab: "all" }),
  setMode: (mode) => set({ mode }),
  setWeekStart: (day) => set({ weekStart: day }),
  setDayPick: (day) => set({ dayPick: day }),
  setPerson: (name) => set({ person: name }),
  setOverviewOpen: (open) => set({ overviewOpen: open }),
  setProblemsOpen: (open) => set({ problemsOpen: open }),
  setHelpOpen: (open) => set({ helpOpen: open }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  openSick: (seed) => set({ sick: { name: seed?.name ?? "", day: seed?.day ?? 0 } }),
  closeSick: () => set({ sick: null }),
  setLastName: (name) => set({ lastName: name }),
  setClip: (clip) => set({ clip }),
  setPrintTarget: (target) => set({ printTarget: target }),
  setScrollY: (y) => set({ scrollY: y }),

  goTo: (ref, edit = false, seed = "", run = false) =>
    set((s) => ({
      focus: ref,
      // Landing on a cell means seeing it: back to the calendars, on a store that is shown.
      mode: "calendars",
      storeFilter: "all",
      storeTab: s.storeTab === "all" || s.storeTab === ref.store ? s.storeTab : ref.store,
      sheet: edit ? { store: ref.store, day: ref.day, slot: ref.slot, seed, run } : null,
      pendingScroll: true,
    })),

  openSheet: (store, day, slot = "pharmacist", seed = "", run = false) =>
    set({ sheet: { store, day, slot, seed, run }, focus: { store, slot, day } }),

  closeSheet: () => set({ sheet: null }),
  setFocus: (ref) => set({ focus: ref }),

  consumePendingScroll: () => {
    const pending = get().pendingScroll;
    if (pending) set({ pendingScroll: false });
    return pending;
  },
}));
