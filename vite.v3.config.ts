import path from "node:path";
import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const r = (p: string) => path.resolve(import.meta.dirname, p);

// v3 app: one self-contained HTML file (sql.js WASM inlined). No server, no network at runtime.
function buildStamp() {
  let sha = "";
  try {
    sha = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    /* built outside git */
  }
  return { at: new Date().toISOString(), sha };
}

export default defineConfig({
  define: { __BUILD__: JSON.stringify(buildStamp()) },
  resolve: { alias: [{ find: /^@v3\//, replacement: r("app3") + "/" }, { find: /^@domain$/, replacement: r("domain/src/index.ts") }, { find: /^@persist$/, replacement: r("persist/index.ts") }] },
  plugins: [viteReact(), tailwindcss(), viteSingleFile()],
  build: { outDir: "dist-v3", emptyOutDir: true, assetsInlineLimit: 100_000_000, rollupOptions: { input: r("v3.html") } },
});
