// Reproducible build check: builds dist-v3/v3.html twice into temporary directories (dist-v3 itself is left alone) and requires the two
// files to be byte-identical. Prints the sha256 of the build. A difference means the output depends on the clock, random ids or the machine.
//   node scripts/v3-repro-build.mjs
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const vite = path.join(root, "node_modules", "vite", "bin", "vite.js");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "v3-repro-"));
const sha = (f) => createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const outs = [];
try {
  for (const n of [1, 2]) {
    const out = path.join(tmp, `build${n}`);
    // Wait a little so a clock-dependent output would differ between the two builds.
    if (n === 2) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1100);
    execFileSync(process.execPath, [vite, "build", "-c", "vite.v3.config.ts", "--outDir", out, "--emptyOutDir"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    outs.push(path.join(out, "v3.html"));
  }
  const [a, b] = outs.map((f) => fs.readFileSync(f));
  const ha = sha(outs[0]), hb = sha(outs[1]);
  console.log(`build 1: ${a.length} bytes sha256 ${ha}`);
  console.log(`build 2: ${b.length} bytes sha256 ${hb}`);
  if (ha !== hb) {
    // Say where they first differ, with a little context, to point at the cause (timestamp, random id, absolute path).
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    const ctx = (x) => JSON.stringify(x.subarray(Math.max(0, i - 60), i + 80).toString("utf8"));
    console.log(`FAIL not reproducible: first difference at byte ${i}\n  1: ${ctx(a)}\n  2: ${ctx(b)}`);
    const abs = [root, os.tmpdir()].filter((p) => a.includes(p) || b.includes(p));
    if (abs.length) console.log(`  absolute paths found in the output: ${abs.join(", ")}`);
    process.exitCode = 1;
  } else {
    const abs = [root, tmp].filter((p) => a.includes(Buffer.from(p)));
    if (abs.length) { console.log(`FAIL build contains absolute paths: ${abs.join(", ")}`); process.exitCode = 1; }
    else console.log(`ok   byte-identical, no absolute paths, sha256 ${ha}`);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
