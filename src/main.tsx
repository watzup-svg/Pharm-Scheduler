import { createHashHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { routeTree } from "./routeTree.gen";
import { useScheduleStore } from "./store/schedule-store";

// The real copy (`--mode real`) starts like a fresh install: the Welcome screen, nothing invented, and the browser's own
// confirm() left alone. Everything below this line only applies to the trial copy.
const TRIAL = import.meta.env.MODE !== "real";

if (TRIAL) {
  // The hosted viewer makes confirm() return false, which would silently cancel "replace this month?"
  // prompts. This is a trial copy with invented data, so accept them.
  window.confirm = () => true;

  // First visit to this trial opens on the demo month. After that, this browser's own autosave wins.
  const DEMO_SEEN = "hischool-trial-demo-v1";
  try {
    if (!localStorage.getItem(DEMO_SEEN)) {
      useScheduleStore.getState().loadDemo();
      localStorage.setItem(DEMO_SEEN, "1");
      localStorage.setItem("hischool-schedule-welcomed", "1");
    }
  } catch {
    useScheduleStore.getState().loadDemo();
  }
}

const router = createRouter({ routeTree, history: createHashHistory() });
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
