// Runs every e2e/v3-*.mjs check (except the library) one after another; non-zero if any fails.
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const dir = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), "e2e");
const files = readdirSync(dir).filter((f) => /^v3-.+\.mjs$/.test(f) && f !== "v3-lib.mjs").sort();
const only = process.argv[2];
let bad = 0;
for (const f of files) {
  if (only && !f.includes(only)) continue;
  const t = Date.now();
  const r = spawnSync("node", [path.join(dir, f)], { encoding: "utf8", timeout: 600000 });
  const fails = (r.stdout.match(/^FAIL/gm) ?? []).length;
  const oks = (r.stdout.match(/^ok/gm) ?? []).length;
  console.log(`${r.status === 0 && !fails ? "ok  " : "FAIL"} ${f}  ${oks} ok, ${fails} failed, ${((Date.now() - t) / 1000).toFixed(0)}s`);
  if (r.status !== 0 || fails) { bad++; console.log(r.stdout.split("\n").filter((l) => l.startsWith("FAIL")).join("\n"), r.stderr.slice(-400)); }
}
process.exit(bad ? 1 : 0);
