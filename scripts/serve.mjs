// A tiny static server for the built sample page on a free port, shared by the scripts here. Returns { base, close }.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export async function serve(dirName = "dist-spa") {
  if (process.env.BASE) return { base: process.env.BASE, close() {} };
  const dir = path.join(root, dirName);
  if (!fs.existsSync(path.join(dir, "spa.html"))) throw new Error(`Build first: npm run build:${dirName === "dist-real" ? "real" : "trial"}`);
  const server = http.createServer((req, res) => {
    const f = path.join(dir, decodeURIComponent((req.url ?? "/").split("?")[0]).replace(/^\/+/, "") || "spa.html");
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": f.endsWith(".html") ? "text/html" : "application/octet-stream" }).end(fs.readFileSync(f));
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  return { base: `http://127.0.0.1:${server.address().port}/spa.html`, close: () => server.close() };
}
