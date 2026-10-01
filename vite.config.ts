import path from "node:path";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const r = (p: string) => path.resolve(import.meta.dirname, p);

// Harness only. The real app has its own scaffold; auth/db/preview shell are omitted.
export default defineConfig({
  resolve: {
    alias: [
      { find: "@/lib/utils", replacement: r("harness/stubs/utils.ts") },
      { find: "@/lib/auth/provider", replacement: r("harness/stubs/auth/provider.tsx") },
      { find: "@/lib/error-component", replacement: r("harness/stubs/error-component.tsx") },
      { find: "@/lib/preview-host-bridge", replacement: r("harness/stubs/preview-host-bridge.ts") },
      { find: /^@\//, replacement: r("src") + "/" },
    ],
  },
  plugins: [tanstackStart(), viteReact(), tailwindcss()],
});
