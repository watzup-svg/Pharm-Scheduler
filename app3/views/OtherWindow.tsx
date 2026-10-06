import { takeOver, useWindowState } from "../windowLock.ts";
import { Btn } from "../ui/primitives.tsx";
import { useState } from "react";

// Shown instead of the schedule when it is already open in another window of this browser.
export function OtherWindow() {
  const st = useWindowState();
  const [busy, setBusy] = useState(false);
  const displaced = st === "displaced";
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-4 text-ink">
      <h1 className="text-xl font-semibold">{displaced ? "Another window took over" : "This schedule is open in another window"}</h1>
      <p className="text-muted">
        {displaced
          ? "The schedule is now being edited in another window. Your work here was kept in this browser's copy. Close this window, or take it back."
          : "Two windows saving the same file would overwrite each other, so only one can edit at a time. Switch to the other window, or take over here."}
      </p>
      <div className="flex gap-2">
        <Btn tone="ink" disabled={busy} onClick={() => { setBusy(true); takeOver().finally(() => setBusy(false)); }}>{busy ? "Taking over…" : displaced ? "Take it back here" : "Take over here"}</Btn>
      </div>
    </main>
  );
}
