// Runs the slow domain searches (Build, Improve, Repair) off the page's thread so the screen never freezes.
// Pure: it gets a world, returns a result. The domain has no clock or randomness, so results match the in-page fallback exactly.
import { api } from "@domain";

export type EngineRequest =
  | { id: number; op: "build"; world: Parameters<typeof api.build>[0]; range: { from: string; to: string }; asOf: string }
  | { id: number; op: "improve"; world: Parameters<typeof api.improve>[0]; opts: Parameters<typeof api.improve>[1]; asOf: string }
  | { id: number; op: "repair"; world: Parameters<typeof api.repair>[0]; gaps: Parameters<typeof api.repair>[1]; opts: Parameters<typeof api.repair>[2]; asOf: string };

export function runEngine(req: EngineRequest): unknown {
  switch (req.op) {
    case "build": return api.build(req.world, req.range, req.asOf);
    case "improve": return api.improve(req.world, req.opts, req.asOf);
    case "repair": return api.repair(req.world, req.gaps, req.opts, req.asOf);
  }
}

if (typeof self !== "undefined" && typeof (self as unknown as { document?: unknown }).document === "undefined" && typeof (self as unknown as { postMessage?: unknown }).postMessage === "function") {
  (self as unknown as { onmessage: (e: MessageEvent<EngineRequest>) => void }).onmessage = (e) => {
    try {
      (self as unknown as { postMessage: (m: unknown) => void }).postMessage({ id: e.data.id, ok: true, result: runEngine(e.data) });
    } catch (err) {
      (self as unknown as { postMessage: (m: unknown) => void }).postMessage({ id: e.data.id, ok: false, error: String((err as Error)?.message ?? err) });
    }
  };
}
