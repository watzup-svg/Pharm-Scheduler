import path from "node:path";
import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const r = (p: string) => path.resolve(import.meta.dirname, p);

// v3 app: one self-contained HTML file (sql.js WASM inlined). No server, no network at runtime.
// Reproducible: the stamp is a function of the commit (its hash and commit time), never of the wall clock.
function buildStamp() {
  let sha = "", at = "";
  try {
    sha = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    at = execSync("git log -1 --format=%cI", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    /* built outside git */
  }
  return { at, sha };
}

// For running it from a cloud machine or another computer: `npm run dev:v3` (live) or `npm run serve:v3` (the built file). The page address is
// the server root, so "/" shows the app. Hosts are not restricted because the address of a cloud preview changes.
const rootIsApp = { name: "v3-root", configureServer(s: { middlewares: { use: (f: (req: { url?: string }, res: unknown, next: () => void) => void) => void } }) { s.middlewares.use((req, _res, next) => { if (req.url === "/" || req.url?.startsWith("/?")) req.url = "/v3.html"; next(); }); }, configurePreviewServer(s: { middlewares: { use: (f: (req: { url?: string }, res: unknown, next: () => void) => void) => void } }) { s.middlewares.use((req, _res, next) => { if (req.url === "/" || req.url?.startsWith("/?")) req.url = "/v3.html"; next(); }); } };

export default defineConfig({
  server: { host: "0.0.0.0", port: 3000, allowedHosts: true },
  preview: { host: "0.0.0.0", port: 3000, allowedHosts: true },
  define: { __BUILD__: JSON.stringify(buildStamp()) },
  resolve: { alias: [{ find: /^@v3\//, replacement: r("app3") + "/" }, { find: /^@domain$/, replacement: r("domain/src/index.ts") }, { find: /^@persist$/, replacement: r("persist/index.ts") }] },
  plugins: [viteReact(), tailwindcss(), viteSingleFile(), rootIsApp],
  build: { outDir: "dist-v3", emptyOutDir: true, assetsInlineLimit: 100_000_000, rollupOptions: { input: r("v3.html") } },
});
