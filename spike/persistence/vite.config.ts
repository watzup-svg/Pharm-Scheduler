import path from "node:path";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const root = import.meta.dirname;
// One self-contained HTML file, opened by double-clicking it.
export default defineConfig({
  root,
  base: "./",
  plugins: [viteSingleFile()],
  build: { outDir: path.resolve(root, "../../dist-persistence-spike"), emptyOutDir: true, target: "es2022" },
});
