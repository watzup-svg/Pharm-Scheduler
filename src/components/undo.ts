import { toast } from "sonner";
import { create } from "zustand";
import { useScheduleStore } from "@/store/schedule-store";

export type LogEntry = { at: number; message: string };

/** What was said about each recent change, newest last. Lives in memory for this visit only. */
export const useActionLog = create<{ entries: LogEntry[]; changes: number }>(() => ({ entries: [], changes: 0 }));

/** Undo the last edit and drop any "…Undo" toast, so no old toast can undo something newer. */
export function undoLast() {
  useScheduleStore.getState().undo();
  toast.dismiss();
  useActionLog.setState((s) => ({ entries: s.entries.slice(0, -1) }));
}

/** Approve toast: the action is "Undo approval" and puts the entry back on Requests, for a few seconds. */
export function announceApproval(message: string, index: number, warn?: string) {
  toast.dismiss();
  toast(message, {
    duration: 6000,
    action: {
      label: "Undo approval",
      onClick: () => {
        useScheduleStore.getState().setTimeOffStatus(index, "requested");
        toast.dismiss();
      },
    },
  });
  if (warn) toast.warning(warn, { duration: 6000 });
  useActionLog.setState((s) => ({ entries: [...s.entries.slice(-49), { at: Date.now(), message }], changes: s.changes + 1 }));
}

/** Say what just happened, with an Undo that always means exactly this action. */
export function announce(message: string, warn?: string) {
  toast.dismiss();
  toast(message, { duration: 8000, action: { label: "Undo", onClick: () => undoLast() } });
  if (warn) toast.warning(warn, { duration: 8000 });
  useActionLog.setState((s) => ({ entries: [...s.entries.slice(-49), { at: Date.now(), message }], changes: s.changes + 1 }));
}
