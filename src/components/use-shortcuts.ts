import { useEffect } from "react";
import { toast } from "sonner";
import { announce } from "@/components/undo";
import { daysInMonth, todayParts } from "@/lib/schedule/calendar";
import { stepRef } from "@/lib/schedule/fix";
import { getCell } from "@/lib/schedule/grid";
import { isOpenDay } from "@/lib/schedule/place";
import { monthStatus } from "@/lib/schedule/dashboard";
import { RPH_SLOTS } from "@/lib/schedule/slots";
import { shortStoreName } from "@/lib/schedule/fix";
import { useScheduleStore } from "@/store/schedule-store";
import { useViewStore } from "@/store/view-store";

export const SHORTCUTS: { keys: string; does: string }[] = [
  { keys: "Arrow keys", does: "Move between days in a store" },
  { keys: "Enter", does: "Open the day" },
  { keys: "A–Z", does: "Open the day and search names as you type" },
  { keys: "Ctrl+C", does: "Copy the names on this day" },
  { keys: "Ctrl+X", does: "Cut the names on this day" },
  { keys: "Ctrl+V", does: "Paste onto this day (any store)" },
  { keys: "Delete", does: "Remove the names on this day" },
  { keys: "Ctrl+D", does: "Repeat these names on the next open day (never overwrites)" },
  { keys: "'", does: "Add the last name you scheduled to this day" },
  { keys: "]  /  [", does: "Next / previous problem" },
  { keys: ".", does: "Go to today" },
  { keys: "Ctrl+Z  /  Ctrl+Y", does: "Undo / redo" },
  { keys: "/", does: "Jump to a pharmacist, store or page (from any page)" },
  { keys: "?", does: "Show this list" },
];

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable === true
  );
}

/** The day button that has keyboard focus, or null. Keys that change the schedule only act on this. */
function focusedCell(): { store: string; day: number } | null {
  const id = (document.activeElement as HTMLElement | null)?.id ?? "";
  const m = /^day-([A-Za-z0-9]+)-(\d+)$/.exec(id);
  return m ? { store: m[1]!, day: Number(m[2]) } : null;
}

/** Where "next problem" starts from: the focused day, else the highlighted one. */
function activeCell(): { store: string; day: number } | null {
  const f = useViewStore.getState().focus;
  return focusedCell() ?? (f ? { store: f.store, day: f.day } : null);
}

function namesAt(store: string, day: number) {
  const { doc } = useScheduleStore.getState();
  return RPH_SLOTS.flatMap((slot) => {
    const name = getCell(doc.grid, store, slot, day).trim();
    return name ? [{ slot, name }] : [];
  });
}

/** Copy, cut, paste, delete, repeat, next problem, today and help. Mounted on the Schedule only. */
export function useShortcuts() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || isTyping(e.target)) return;
      // A dialog or menu owns the keyboard while it is open.
      if (document.querySelector("[role=dialog], [role=menu]")) return;
      const mod = e.ctrlKey || e.metaKey;
      const s = useScheduleStore.getState();
      const v = useViewStore.getState();
      // Changing keys need real focus on a day. A highlight alone (after closing a sheet, or a jump) is not enough,
      // so Backspace on an idle page can never wipe a day.
      const cell = focusedCell();
      const label = (store: string, day: number) => `${shortStoreName(s.doc.stores.find((x) => x.code === store)?.name ?? store)} ${day}`;

      if (!mod && !e.altKey && (e.key === "?" || (e.key === "/" && e.shiftKey))) {
        e.preventDefault();
        v.setHelpOpen(true);
        return;
      }

      if (mod && !e.altKey && ["c", "x", "v", "d"].includes(e.key.toLowerCase())) {
        if (!cell) return;
        const key = e.key.toLowerCase();
        e.preventDefault();
        const names = namesAt(cell.store, cell.day);
        if (key === "c" || key === "x") {
          if (!names.length) {
            toast("Nothing on that day to copy");
            return;
          }
          v.setClip({ store: cell.store, day: cell.day, names });
          void navigator.clipboard?.writeText(names.map((n) => n.name).join("\n")).catch(() => {});
          if (key === "x") {
            s.clearRange(names.map((n) => ({ store: cell.store, slot: n.slot, day: cell.day })));
            announce(`Cut ${names.map((n) => n.name).join(", ")} from ${label(cell.store, cell.day)}`);
          } else {
            toast(`Copied ${names.map((n) => n.name).join(", ")}`);
          }
          return;
        }
        if (key === "v") {
          const clip = v.clip;
          if (!clip) {
            toast("Copy a day first (Ctrl+C)");
            return;
          }
          const res = s.placeNames(cell.store, cell.day, clip.names);
          if (res === "shut") toast.error(`${label(cell.store, cell.day)} is closed, so nothing was pasted`);
          else if (res === "unlicensed") toast.error(`Not licensed in that state, so nothing was pasted onto ${label(cell.store, cell.day)}`);
          else announce(`Pasted ${clip.names.map((n) => n.name).join(", ")} onto ${label(cell.store, cell.day)}`);
          return;
        }
        // Ctrl+D: repeat on the next open day, only into rows that are empty.
        if (!names.length) {
          toast("Nothing on that day to repeat");
          return;
        }
        const last = daysInMonth(s.doc.year, s.doc.month);
        let next = cell.day + 1;
        while (next <= last && !isOpenDay(s.doc, cell.store, next)) next += 1;
        if (next > last) {
          toast(`No later open day at ${label(cell.store, cell.day).replace(/ \d+$/, "")}`);
          return;
        }
        const empty = names.filter((n) => !getCell(s.doc.grid, cell.store, n.slot, next).trim());
        if (empty.length) {
          const res = s.placeNames(cell.store, next, empty);
          if (res === "unlicensed") toast.error(`Not licensed in ${label(cell.store, next)}’s state, so nothing was repeated`);
          else announce(`${empty.map((n) => n.name).join(", ")} repeated on ${label(cell.store, next)}`);
        } else {
          toast(`${label(cell.store, next)} already has a name, so it was left alone`);
        }
        v.goTo({ store: cell.store, slot: "pharmacist", day: next }, false);
        return;
      }

      if (mod || e.altKey) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        if (!cell) return;
        const names = namesAt(cell.store, cell.day);
        if (!names.length) return;
        e.preventDefault();
        s.clearRange(names.map((n) => ({ store: cell.store, slot: n.slot, day: cell.day })));
        announce(`Cleared ${names.map((n) => n.name).join(", ")} from ${label(cell.store, cell.day)}`);
        return;
      }

      if (e.key === "'") {
        if (!cell) return;
        e.preventDefault();
        if (!v.lastName) {
          toast("Schedule someone first, then press ' to repeat them");
          return;
        }
        if (getCell(s.doc.grid, cell.store, "pharmacist", cell.day).trim()) {
          toast("That day already has a pharmacist. Open it to change.");
          return;
        }
        const res = s.placeNames(cell.store, cell.day, [{ slot: "pharmacist", name: v.lastName }]);
        if (res === "shut" || res === "unlicensed") {
          toast.error(res === "shut" ? `${label(cell.store, cell.day)} is closed` : `${v.lastName} isn’t licensed in that state`);
          return;
        }
        announce(`${v.lastName} on ${label(cell.store, cell.day)}`);
        return;
      }

      if (e.key === "]" || e.key === "[") {
        e.preventDefault();
        const steps = monthStatus(s.doc, s.evaluation).steps;
        if (!steps.length) {
          toast("Nothing left to fix");
          return;
        }
        const here = activeCell();
        const at = here ? steps.findIndex((st) => st.store === here.store && st.day === here.day) : -1;
        const dir = e.key === "]" ? 1 : -1;
        const idx = at < 0 ? (dir > 0 ? 0 : steps.length - 1) : (at + dir + steps.length) % steps.length;
        v.goTo(stepRef(steps[idx]!), true, "", true);
        return;
      }

      if (e.key === ".") {
        const t = todayParts();
        if (t.year !== s.doc.year || t.month !== s.doc.month) {
          toast("Today is not in this month");
          return;
        }
        e.preventDefault();
        const store = s.doc.stores.find((x) => isOpenDay(s.doc, x.code, t.day))?.code ?? s.doc.stores[0]?.code;
        if (store) v.goTo({ store, slot: "pharmacist", day: t.day }, false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
