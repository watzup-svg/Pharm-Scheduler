// Run a command with a built page served on a free port: `node scripts/with-server.mjs <trial|real> <command> [args...]`.
// The address is passed as BASE (trial) or REAL_BASE (real), which the browser scripts already read. Exit code is the command's.
import { spawn } from "node:child_process";
import { serve } from "./serve.mjs";

const [which, cmd, ...rest] = process.argv.slice(2);
const s = await serve(which === "real" ? "dist-real" : "dist-spa");
const env = { ...process.env, [which === "real" ? "REAL_BASE" : "BASE"]: s.base };
spawn(cmd, rest, { env, stdio: "inherit" }).on("close", (code) => { s.close(); process.exit(code ?? 1); });
