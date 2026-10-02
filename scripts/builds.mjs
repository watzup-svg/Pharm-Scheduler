// The built single-file copies kept for sharing (default /mnt/project-files/builds). Each build carries the commit it was made from
// (the File menu shows it, and it is written into the file), so a copy can always be checked against the code.
//   node scripts/builds.mjs publish [dir]   build the trial and real copies from this commit, copy them to the folder, and verify
//   node scripts/builds.mjs verify [dir]    check the copies in the folder were built from this commit (or an ancestor, with --allow-older)
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [cmd, dirArg] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const dir = dirArg ?? "/mnt/project-files/builds";
const sh = (c) => execSync(c, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const FILES = { "HiSchool_Scheduler_TRIAL.html": "dist-spa/spa.html", "HiSchool_Scheduler_REAL.html": "dist-real/spa.html" };

const head = sh("git rev-parse --short HEAD");
const dirty = sh("git status --porcelain -- src package.json vite.spa.config.ts").length > 0;
if (cmd === "publish") {
  if (dirty) { console.log("FAIL uncommitted changes in src: commit first so the copies match a commit"); process.exit(1); }
  sh("npm run build:trial");
  sh("npm run build:real");
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, src] of Object.entries(FILES)) fs.copyFileSync(path.join(root, src), path.join(dir, name));
}
let bad = 0;
for (const name of Object.keys(FILES)) {
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) { console.log(`FAIL ${name}: not in ${dir}`); bad += 1; continue; }
  const text = fs.readFileSync(file, "utf8");
  const sha = text.match(/sha:[`"']([0-9a-f]{7,40})[`"']/)?.[1];
  const ok = sha && (sha === head || head.startsWith(sha) || sha.startsWith(head));
  const older = sha && !ok && process.argv.includes("--allow-older") && (() => { try { sh(`git merge-base --is-ancestor ${sha} HEAD`); return true; } catch { return false; } })();
  console.log(`${ok || older ? "ok  " : "FAIL"} ${name}: built from ${sha ?? "an unknown commit"}; this commit is ${head}${older ? " (older, allowed)" : ""}`);
  if (!(ok || older)) bad += 1;
}
process.exit(bad ? 1 : 0);
