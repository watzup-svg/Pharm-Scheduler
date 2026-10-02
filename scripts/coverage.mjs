// `npm run coverage`: run the unit tests with coverage and fail if the rules code and store fall below the floor.
//   node scripts/coverage.mjs            floors: 90% of lines, 82% of branches (it was 94% and 89% when the floor was set)
// Detail goes to test-logs/coverage-<stamp>.log; the screen gets one line.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LINES = 90;
const BRANCHES = 82;
const files = [...fs.readdirSync(path.join(root, "src/lib")).filter((f) => f.endsWith(".test.ts")).map((f) => `src/lib/${f}`),
  ...fs.readdirSync(path.join(root, "src/lib/schedule")).filter((f) => f.endsWith(".test.ts")).map((f) => `src/lib/schedule/${f}`), ...fs.readdirSync(path.join(root, "src/store")).filter((f) => f.endsWith(".test.ts")).map((f) => `src/store/${f}`)];
const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--experimental-test-coverage", "--test", ...files], { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 });
const out = (r.stdout ?? "") + (r.stderr ?? "");
fs.mkdirSync(path.join(root, "test-logs"), { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
fs.writeFileSync(path.join(root, "test-logs", `coverage-${stamp}.log`), out);
const m = out.match(/#\s*all files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/);
if (r.status !== 0 && !m) { console.log("FAIL unit tests did not run; see the coverage log in test-logs/"); process.exit(1); }
if (!m) { console.log("FAIL could not read the coverage summary"); process.exit(1); }
const [lines, branches] = [Number(m[1]), Number(m[2])];
const ok = r.status === 0 && lines >= LINES && branches >= BRANCHES;
console.log(`${ok ? "ok  " : "FAIL"} coverage: lines ${lines}% (floor ${LINES}), branches ${branches}% (floor ${BRANCHES})`);
process.exit(ok ? 0 : 1);
