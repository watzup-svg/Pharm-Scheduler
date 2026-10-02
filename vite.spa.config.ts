import path from "node:path";
import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const r = (p: string) => path.resolve(import.meta.dirname, p);

// One self-contained HTML file. Two flavours from the same source:
//   default      the trial copy (dist-spa/spa.html): opens on the practice month on a first visit, for trying it out
//   --mode real  the copy for real use (dist-real/spa.html): opens on the Welcome screen with no invented data
// Which build this is, shown at the bottom of the File menu so you can tell a fresh build from an old one.
function buildStamp(mode: string) {
  let sha = "";
  try {
    sha = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    /* built outside git: no sha */
  }
  return { kind: mode === "real" ? "Real" : "Trial", at: new Date().toISOString(), sha };
}

export default defineConfig(({ mode }) => ({
  define: { __BUILD__: JSON.stringify(buildStamp(mode)) },
  resolve: {
    alias: [
      { find: /^\.\/routes\/__root$/, replacement: r("harness/spa/root.tsx") },
      { find: "@/lib/utils", replacement: r("harness/stubs/utils.ts") },
      { find: "@/lib/auth/provider", replacement: r("harness/stubs/auth/provider.tsx") },
      { find: "@/lib/error-component", replacement: r("harness/stubs/error-component.tsx") },
      { find: "@/lib/preview-host-bridge", replacement: r("harness/stubs/preview-host-bridge.ts") },
      { find: /^@\//, replacement: r("src") + "/" },
    ],
  },
  plugins: [viteReact(), tailwindcss(), viteSingleFile()],
  build: { outDir: mode === "real" ? "dist-real" : "dist-spa", emptyOutDir: true, rollupOptions: { input: r("spa.html") } },
}));
