import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "./App.tsx";
import { boot } from "./boot.ts";
import { useApp } from "./store.ts";
import { practiceWorld } from "./demo.ts";

boot();
createRoot(document.getElementById("root")!).render(<App />);

// Test hook for the browser checks (harmless in real use).
(window as unknown as { __v3: unknown }).__v3 = {
  app: useApp,
  loadPractice: () => { const { world } = practiceWorld(); useApp.getState().setWorld(world, { fileName: "Practice.sqlite" }); },
};
