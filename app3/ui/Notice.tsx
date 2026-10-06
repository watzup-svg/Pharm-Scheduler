import { useEffect } from "react";
import { useApp } from "../store.ts";
import { cx } from "./primitives.tsx";
import { useApp as useStore } from "../store.ts";

/** One line at the bottom-right. Errors stay until dismissed; others fade. */
export function Notice() {
  const n = useApp((s) => s.notice);
  const clear = useApp((s) => s.clearNotice);
  useEffect(() => {
    if (!n || n.kind === "error") return;
    const t = setTimeout(clear, n.undoId ? 9000 : 5000);
    return () => clearTimeout(t);
  }, [n, clear]);
  if (!n) return null;
  return (
    <div role={n.kind === "error" ? "alert" : "status"} className={cx("fixed bottom-4 right-4 z-50 max-w-sm rounded-md px-3 py-2 text-sm shadow-lg ring-1", n.kind === "error" ? "bg-illegal-bg text-illegal ring-illegal/30" : "bg-white text-ink ring-line")}>
      <span>{n.kind === "error" ? "▲ " : n.kind === "ok" ? "✓ " : ""}{n.text}</span>
      {n.undoId && <button type="button" onClick={() => { const id = n.undoId!; clear(); const st = useStore.getState(); if (st.undo(id)) st.say("info", "Undone."); }} className="ml-3 font-semibold underline">Undo</button>}
      <button type="button" aria-label="Dismiss" onClick={clear} className="ml-3 text-muted underline">Dismiss</button>
    </div>
  );
}
