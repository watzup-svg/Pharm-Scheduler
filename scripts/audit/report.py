"""Merge the audit JSON/logs in <dir> into REPORT.md. Usage: report.py <dir> <repo-root>. Plain stdlib."""
import glob, json, os, re, sys

d, root = sys.argv[1], sys.argv[2]
def load(n, dflt=None):
    try:
        return json.load(open(os.path.join(d, n)))
    except Exception:
        return dflt
def text(n):
    try:
        return open(os.path.join(d, n), errors="replace").read()
    except Exception:
        return ""

out, flags = [], []
w = out.append
steps = load("steps.json", [])
w("# Health audit\n")
w("| step | result | secs |\n|---|---|---|")
for s in steps:
    w(f"| {s['name']} | {'ok' if s['ok'] else '**FAIL**'} | {s['secs']} |")
    if not s["ok"] and s["name"] not in ("npm-outdated", "npm-audit"):
        flags.append(f"step failed: {s['name']} (see {s['name']}.log)")

a = load("analyze.json")
if a:
    w(f"\n## Size and shape\n{a['fileCount']} source files, {a['totalLines']:,} lines.\n")
    w("Largest files:\n\n| file | lines |\n|---|---|")
    for f in a["files"][:8]:
        w(f"| {f['file']} | {f['lines']} |")
    w("\nMost complex functions (branch count):\n\n| function | where | cc | length |\n|---|---|---|---|")
    for c in a["complexity"][:10]:
        w(f"| {c['name']} | {c['file']}:{c['line']} | {c['cc']} | {c['length']} |")
    w(f"\nImport cycles: {len(a['cycles'])}. Layering violations: {len(a['layering'])}. Unreferenced files: {len(a['unreferenced'])}.")
    p = a["patterns"]
    w(f"\nRisky patterns: eslint-disable {len(p['eslintDisable'])}, non-null assertions {len(p['nonNullAssertion'])}, TODO-style {len(p['todo'])}.")
    if a["duplicates"]:
        w("\nDuplicated code:\n")
        for x in a["duplicates"]:
            w(f"- {x['pair']} ({x['windows']} windows), e.g. {x['example']}")
    if a["unusedExports"]:
        w("\nExports nothing imports:\n")
        for f, names in a["unusedExports"]:
            w(f"- {f}: {', '.join(names)}")
    if a["cycles"] or a["layering"]:
        flags.append("import cycle or layering violation")

pf = load("perf.json")
if pf:
    w("\n## Speed\n")
    w("```\n" + json.dumps(pf, indent=1)[:3000] + "\n```")

cov = text("coverage.log")
rows = []
for ln in cov.splitlines():
    m = re.match(r"#\s*([^|]+?)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)", ln)
    if m and not m.group(1).startswith(("file", "all files")) and "." in m.group(1):
        rows.append((m.group(1).strip(" "), float(m.group(2)), float(m.group(3))))
allm = re.search(r"#\s*all files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)", cov)
w("\n## Unit-test coverage (rules code and store only; the UI is covered by browser tests, which don't count here)\n")
if allm:
    w(f"All files: lines {allm.group(1)}%, branches {allm.group(2)}%, functions {allm.group(3)}%.\n")
lows = sorted([r for r in rows if not r[0].endswith(".test.ts") and r[1] < 85], key=lambda r: r[1])[:12]
if lows:
    w("Least covered:\n\n| file | lines % | branches % |\n|---|---|---|")
    for f, l, b in lows:
        w(f"| {f} | {l} | {b} |")

w("\n## Dependencies\n")
au = load("npm-audit.log", {})
v = (au or {}).get("metadata", {}).get("vulnerabilities", {})
if v:
    w("npm audit: " + (", ".join(f"{k} {n}" for k, n in v.items() if n) or "no known vulnerabilities"))
    if v.get("high", 0) or v.get("critical", 0):
        flags.append("npm audit reports high or critical issues")
else:
    w("npm audit: no result (offline or blocked). **Not checked.**")
ou = load("npm-outdated.log", {}) or {}
if ou:
    w("\nOutdated:\n\n| package | current | latest |\n|---|---|---|")
    for k, x in list(ou.items())[:20]:
        w(f"| {k} | {x.get('current')} | {x.get('latest')} |")
else:
    w("Outdated: none reported (or the registry was unreachable).")

sw = sorted(glob.glob(os.path.join(root, "test-logs", "sweep-*.json")), key=lambda p: len(json.load(open(p)).get("rows", [])) if isinstance(json.load(open(p)), dict) else len(json.load(open(p))))
w("\n## Seed sweep\n")
if sw:
    sj = json.load(open(sw[-1]))
    rowsw = sj.get("rows", sj) if isinstance(sj, dict) else sj
    bad = [r for r in rowsw if not r.get("ok")]
    w(f"{len(rowsw)} seeds, {len(bad)} failing.")
    for r in bad[:10]:
        w(f"- seed {r['seed']}: {r.get('failure')}")
    if bad:
        flags.append(f"{len(bad)} sweep seeds fail")

dl = sorted(glob.glob(os.path.join(root, "test-logs", "all-*.log")) + glob.glob(os.path.join(root, "test-logs", "deep-*.log")))
w("\n## Deep run\n" + ("see " + os.path.relpath(dl[-1], root) if dl else "see deep.log in this folder"))
tail = text("deep.log").strip().splitlines()[-12:]
if tail:
    w("```\n" + "\n".join(tail) + "\n```")

w("\n## Flags\n" + ("\n".join("- " + f for f in flags) if flags else "None. Every step passed."))
open(os.path.join(d, "REPORT.md"), "w").write("\n".join(out) + "\n")
print(f"{len(flags)} flag(s)" + ("" if not flags else ": " + "; ".join(flags)))
