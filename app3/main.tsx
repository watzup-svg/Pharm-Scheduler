import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "./App.tsx";
import { boot } from "./boot.ts";
import { useApp } from "./store.ts";
import { practiceWorld, practiceWorldWithProblems } from "./demo.ts";
import { ErrorBoundary, installGlobalHandlers, crashNext } from "./ui/ErrorBoundary.tsx";
import { record, snapshot } from "./diagnostics.ts";
import { engineKnobs, killWorkerForTest } from "./engine.ts";

installGlobalHandlers();
boot().catch((e) => record("error", `boot: ${String(e?.message ?? e)}`)).then(() => {
  // Ask the browser not to evict our storage; fine if it says no or is not there.
  try { return navigator.storage?.persist?.().then((ok) => record("persist", `storage.persist ${ok ? "granted" : "not granted"}`)); } catch { return undefined; }
});
createRoot(document.getElementById("root")!).render(<ErrorBoundary name="the app" level="app"><App /></ErrorBoundary>);

// Test hook for the browser checks (harmless in real use).
(window as unknown as { __v3: unknown }).__v3 = {
  app: useApp,
  crashNext,
  diagnostics: snapshot,
  engine: engineKnobs,
  killWorker: killWorkerForTest,
  loadProblems: () => { const { world } = practiceWorldWithProblems(); useApp.getState().setWorld(world, { fileName: "Practice with problems.sqlite" }); },
  loadPractice: () => { const { world } = practiceWorld(); useApp.getState().setWorld(world, { fileName: "Practice.sqlite" }); },
};
