// Client for the engine worker. Falls back to running in the page if a worker cannot start (for example a locked-down browser).
// Robustness: each call has a timeout and can be cancelled (which ends the worker; the next call starts a fresh one);
// if the worker dies mid-call the call is retried once in the page.
import EngineWorker from "./engine.worker.ts?worker&inline";
import { runEngine, type EngineRequest } from "./engine.worker.ts";
import { record } from "./diagnostics.ts";

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };
let worker: Worker | null = null;
let failed = false;
let deaths = 0;
let seq = 0;
const pending = new Map<number, Pending>();

/** Generous: a worst-case Build is seconds; this only catches a runaway. */
export const ENGINE_TIMEOUT_MS = 120_000;
/** Test knobs (window.__v3): a delay before each call starts, and a timeout override. */
export const engineKnobs: { delayMs: number; timeoutMs: number } = { delayMs: 0, timeoutMs: ENGINE_TIMEOUT_MS };

class WorkerDied extends Error {
  constructor(why: string) { super(why); this.name = "WorkerDied"; }
}
export const isCancel = (e: unknown): boolean => (e as Error)?.name === "AbortError";

function dropWorker(why: Error): void {
  const w = worker;
  worker = null;
  try { w?.terminate(); } catch (e) { record("error", `worker terminate: ${String((e as Error)?.message ?? e)}`); }
  const all = [...pending.values()];
  pending.clear();
  for (const p of all) p.reject(why);
}

function start(): Worker | null {
  if (worker || failed) return worker;
  try {
    const w = new EngineWorker();
    w.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.result); else p.reject(new Error(e.data.error));
    };
    const died = (what: string) => {
      record("error", `engine worker ${what}`);
      if (++deaths >= 3) failed = true; // keep falling back to the page rather than restarting forever
      if (worker === w) dropWorker(new WorkerDied(`The search worker stopped (${what}).`));
    };
    w.onerror = (e) => { e.preventDefault?.(); died("error"); };
    w.onmessageerror = () => died("message error");
    worker = w;
  } catch (e) {
    record("error", `engine worker could not start: ${String((e as Error)?.message ?? e)}`);
    failed = true;
  }
  return worker;
}

export type EngineCall = DistributiveOmit<EngineRequest, "id">;
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;

const abortError = () => Object.assign(new Error("Cancelled."), { name: "AbortError" });

/** Test hook: end the worker as if it crashed. */
export function killWorkerForTest(): void {
  if (worker) dropWorker(new WorkerDied("The search worker stopped (killed)."));
}

export async function callEngine<T>(call: EngineCall, opts: { signal?: AbortSignal } = {}): Promise<T> {
  const { signal } = opts;
  const t0 = performance.now();
  const sleep = (ms: number) => new Promise<void>((res, rej) => {
    const t = setTimeout(res, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); rej(abortError()); }, { once: true });
  });
  if (signal?.aborted) throw abortError();
  if (engineKnobs.delayMs > 0) await sleep(engineKnobs.delayMs);
  const inline = (req: EngineRequest) => Promise.resolve().then(() => runEngine(req) as T);
  const viaWorker = (w: Worker, req: EngineRequest) => new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      record("error", `engine ${req.op} timed out`);
      dropWorker(new Error("The search took too long and was stopped. Nothing changed."));
    }, engineKnobs.timeoutMs);
    const onAbort = () => { pending.delete(req.id); clearTimeout(timer); dropWorker(abortError()); reject(abortError()); };
    signal?.addEventListener("abort", onAbort, { once: true });
    const done = () => { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); };
    pending.set(req.id, { resolve: (v) => { done(); resolve(v as T); }, reject: (e) => { done(); reject(e); } });
    try { w.postMessage(req); } catch (e) { pending.delete(req.id); done(); reject(e as Error); }
  });
  const req = { ...call, id: ++seq } as EngineRequest;
  let out: T;
  const w = start();
  try {
    if (!w) out = await inline(req);
    else {
      try { out = await viaWorker(w, req); } catch (e) {
        if (!(e instanceof WorkerDied) || signal?.aborted) throw e;
        record("engine", `${req.op}: worker died, retrying in the page`);
        out = await inline({ ...req, id: ++seq });
      }
    }
  } catch (e) {
    record("engine", `${req.op} failed after ${Math.round(performance.now() - t0)}ms: ${(e as Error).message}`);
    throw e;
  }
  const lim = (out as { limitHit?: boolean; report?: { searchLimitHit?: boolean } } | null);
  record("engine", `${req.op} ${Math.round(performance.now() - t0)}ms${w ? "" : " (in page)"}${lim?.limitHit || lim?.report?.searchLimitHit ? " limitHit" : ""}`);
  return out;
}
