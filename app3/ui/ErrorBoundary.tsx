// A broken screen shows a plain message with a way out instead of a blank page. The schedule lives in the store, not in the screen.
import { Component, useSyncExternalStore, type ReactNode } from "react";
import { useApp } from "../store.ts";
import { getPersist } from "../persist-bridge.ts";
import { copyDiagnostics, record } from "../diagnostics.ts";
import { Btn } from "./primitives.tsx";

// Test hook state: crashNext() makes the next render of the guarded screen throw until a boundary has caught it.
let crashPending = false;
const crashSubs = new Set<() => void>();
export function crashNext(): void { crashPending = true; crashSubs.forEach((f) => f()); }
const subCrash = (f: () => void) => { crashSubs.add(f); return () => { crashSubs.delete(f); }; };
function CrashProbe({ name }: { name: string }) {
  useSyncExternalStore(subCrash, () => crashPending, () => false);
  if (crashPending) throw new Error(`test crash in ${name}`);
  return null;
}

async function saveCopy(): Promise<void> {
  const s = useApp.getState();
  const w = s.world;
  if (!w) { s.say("info", "There is no schedule open to save."); return; }
  try {
    const r = await getPersist().download(w);
    s.say(r.ok ? "info" : "error", r.ok ? "A copy was downloaded." : `Could not download a copy. ${r.error ?? ""}`);
  } catch (e) { record("error", `save a copy: ${String((e as Error)?.message ?? e)}`); s.say("error", "Could not download a copy."); }
}

type Props = { name: string; children: ReactNode; /** Reset when this changes (the screen id), so moving on leaves the broken screen behind. */ resetKey?: unknown; level?: "app" | "screen"; /** Only the main screen takes part in the crashNext test hook. */ probe?: boolean };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    crashPending = false;
    record("error", `${this.props.name} crashed: ${error.message} @ ${(info.componentStack ?? "").trim().split("\n")[0] ?? ""}`);
  }
  componentDidUpdate(prev: Props): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }
  render() {
    const { name, children, level = "screen", probe } = this.props;
    if (!this.state.error) return <>{children}{probe && <CrashProbe name={name} />}</>;
    return (
      <div role="alert" data-testid="screen-crash" className={level === "app" ? "grid h-screen place-items-center bg-paper p-6 text-ink" : "grid h-full place-items-center p-6 text-ink"}>
        <div className="max-w-md rounded-lg border border-line bg-cream p-4 shadow-sm">
          <h2 className="text-base font-semibold">Something broke on this screen. Your schedule is safe.</h2>
          <p className="mt-1 text-sm text-muted">{level === "app" ? "Try again, or save a copy first to be careful." : "The rest of the app still works. You can try again, move to another screen, or save a copy first to be careful."}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn tone="ink" onClick={() => { record("ui", `${name}: try again`); this.setState({ error: null }); }}>Try again</Btn>
            <Btn onClick={() => void saveCopy()}>Save a copy</Btn>
            <Btn onClick={() => void copyDiagnostics().then((ok) => useApp.getState().say(ok ? "ok" : "info", ok ? "Diagnostics copied." : "Could not copy automatically."))}>Copy diagnostics</Btn>
          </div>
        </div>
      </div>
    );
  }
}

/** Errors outside React rendering: record them and tell the user once in a while (never in a loop). */
export function installGlobalHandlers(): void {
  let last = 0;
  let shown = 0;
  const seen = new Set<string>();
  const handle = (kind: string, e: unknown) => {
    try {
      const m = String((e as { message?: unknown })?.message ?? e);
      if (/ResizeObserver loop/.test(m)) return;
      record("error", `${kind}: ${m}`);
      const now = Date.now();
      if (now - last < 10_000 || shown >= 5 || seen.has(m)) return;
      last = now; shown++; seen.add(m);
      useApp.getState().say("error", "Something went wrong in the background. Your schedule is safe. If it keeps happening, use File, Copy diagnostics.");
    } catch { /* never throw from the handler */ }
  };
  window.addEventListener("error", (ev) => handle("window error", ev.error ?? ev.message));
  window.addEventListener("unhandledrejection", (ev) => handle("unhandled rejection", ev.reason));
}
