// Client for the engine worker. Falls back to running in the page if a worker cannot start (for example a locked-down browser).
import EngineWorker from "./engine.worker.ts?worker&inline";
import { runEngine, type EngineRequest } from "./engine.worker.ts";

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };
let worker: Worker | null = null;
let failed = false;
let seq = 0;
const pending = new Map<number, Pending>();

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
    w.onerror = () => {
      failed = true;
      worker = null;
      for (const [, p] of pending) p.reject(new Error("The search could not run."));
      pending.clear();
    };
    worker = w;
  } catch {
    failed = true;
  }
  return worker;
}

export type EngineCall = DistributiveOmit<EngineRequest, "id">;
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;

export function callEngine<T>(call: EngineCall): Promise<T> {
  const w = start();
  const id = ++seq;
  const req = { ...call, id } as EngineRequest;
  if (!w) return Promise.resolve().then(() => runEngine(req) as T);
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    try { w.postMessage(req); } catch (e) { pending.delete(id); reject(e as Error); }
  });
}
