// Static analysis of src/: size, complexity, duplicates, risky patterns, import cycles, layering, unused exports.
// Usage: node scripts/audit/analyze.mjs <out.json>
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ts = createRequire(path.join(root, "package.json"))("typescript");
const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, out); else if (/\.(ts|tsx)$/.test(e.name)) out.push(p); } return out; };
const all = walk(path.join(root, "src"));
const src = all.filter((f) => !/\.test\.ts$/.test(f) && !/routeTree\.gen|\.d\.ts$/.test(f));
const rel = (p) => path.relative(root, p);
const parse = (f) => { const text = fs.readFileSync(f, "utf8"); return { text, sf: ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, f.endsWith("x") ? ts.ScriptKind.TSX : undefined) }; };

const files = [], functions = [], patterns = {}, imports = {}, exportsOf = {}, used = {};
const PATS = { nonNullAssertion: /\w!\.|\w!\)|\w!\]|\w!;/g, doubleCast: /as unknown as/g, anyType: /:\s*any\b|as any\b|<any>/g, tsIgnore: /@ts-ignore|@ts-expect-error|@ts-nocheck/g, consoleLog: /console\.(log|debug)/g, innerHTML: /innerHTML|dangerouslySetInnerHTML/g, evalLike: /\beval\(|new Function\(/g, todo: /TODO|FIXME|HACK|XXX/g, emptyCatch: /catch\s*(\([^)]*\))?\s*\{\s*\}/g, eslintDisable: /eslint-disable/g };
const resolve = (from, spec) => { let b; if (spec.startsWith("@/")) b = path.join(root, "src", spec.slice(2)); else if (spec.startsWith(".")) b = path.resolve(path.dirname(from), spec); else return null; for (const c of [b, b + ".ts", b + ".tsx", b + "/index.ts"]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c; return null; };

for (const f of all) {
  const { text, sf } = parse(f);
  const lines = text.split("\n").length;
  if (src.includes(f)) {
    files.push({ file: rel(f), lines });
    for (const [k, rx] of Object.entries(PATS)) { const n = (text.match(rx) || []).length; if (n) (patterns[k] ??= []).push({ file: rel(f), n }); }
  }
  imports[f] = new Set(); const ex = new Set();
  const stack = [];
  const visit = (n) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier) {
      const t = resolve(f, n.moduleSpecifier.text);
      if (t) { imports[f].add(t); const u = (used[t] ??= new Set());
        if (ts.isImportDeclaration(n) && n.importClause) { const c = n.importClause; if (c.name) u.add("default"); if (c.namedBindings) { if (ts.isNamespaceImport(c.namedBindings)) u.add("*"); else c.namedBindings.elements.forEach((e) => u.add((e.propertyName ?? e.name).text)); } }
        if (ts.isExportDeclaration(n)) { if (!n.exportClause) u.add("*"); else if (ts.isNamedExports(n.exportClause)) n.exportClause.elements.forEach((e) => u.add((e.propertyName ?? e.name).text)); } }
    }
    if (n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) { if (ts.isVariableStatement(n)) n.declarationList.declarations.forEach((d) => ts.isIdentifier(d.name) && ex.add(d.name.text)); else if (n.name && !ts.isInterfaceDeclaration(n) && !ts.isTypeAliasDeclaration(n)) ex.add(n.name.text); }
    const isFn = ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n);
    if (isFn && src.includes(f)) {
      const start = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1, end = sf.getLineAndCharacterOfPosition(n.getEnd()).line + 1;
      let name = n.name?.getText?.() ?? (ts.isVariableDeclaration(n.parent) ? n.parent.name.getText() : ts.isPropertyAssignment(n.parent) ? n.parent.name.getText() : "(anonymous)");
      stack.push({ file: rel(f), name, line: start, length: end - start + 1, cc: 1 });
    }
    const top = stack[stack.length - 1];
    if (top) { const k = n.kind; if (k === ts.SyntaxKind.IfStatement || k === ts.SyntaxKind.ForStatement || k === ts.SyntaxKind.ForInStatement || k === ts.SyntaxKind.ForOfStatement || k === ts.SyntaxKind.WhileStatement || k === ts.SyntaxKind.DoStatement || k === ts.SyntaxKind.CaseClause || k === ts.SyntaxKind.CatchClause || k === ts.SyntaxKind.ConditionalExpression) top.cc++; else if (k === ts.SyntaxKind.BinaryExpression && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(n.operatorToken.kind)) top.cc++; }
    ts.forEachChild(n, visit);
    if (isFn && src.includes(f)) functions.push(stack.pop());
  };
  visit(sf); exportsOf[f] = ex;
}
// duplicates: windows of 7 meaningful lines
const W = 7, seen = new Map(), dups = new Map();
for (const f of src) {
  const ls = fs.readFileSync(f, "utf8").split("\n").map((l, i) => [l.trim().replace(/\s+/g, " "), i + 1]).filter(([l]) => l.length > 12 && !/^(import|export \{|\}|\)|\]|\/\/|\*|\/\*)/.test(l));
  for (let i = 0; i + W <= ls.length; i++) {
    const key = ls.slice(i, i + W).map(([l]) => l).join("\n"); const at = `${rel(f)}:${ls[i][1]}`;
    if (seen.has(key)) { const first = seen.get(key); const pair = `${first.split(":")[0]} <> ${rel(f)}`; const d = dups.get(pair) ?? { pair, windows: 0, example: `${first} / ${at}` }; d.windows++; dups.set(pair, d); } else seen.set(key, at);
  }
}
// cycles + layering + unused exports
const g = Object.fromEntries(all.map((f) => [f, [...imports[f]]]));
const cycles = [], state = {}, stk = [];
const dfs = (n) => { state[n] = 1; stk.push(n); for (const m of g[n] ?? []) { if (state[m] === 1) cycles.push(stk.slice(stk.indexOf(m)).map(rel).concat(rel(m)).join(" > ")); else if (!state[m]) dfs(m); } stk.pop(); state[n] = 2; };
for (const n of Object.keys(g)) if (!state[n]) dfs(n);
const layering = []; for (const f of all.filter((f) => f.includes("/src/lib/"))) for (const t of imports[f]) if (/\/src\/(components|store|routes)\//.test(t)) layering.push(`${rel(f)} -> ${rel(t)}`);
const unusedExports = src.filter((f) => !/\/routes\//.test(f)).map((f) => [rel(f), [...exportsOf[f]].filter((n) => !(used[f]?.has(n) || used[f]?.has("*")))]).filter(([, u]) => u.length);
const referenced = new Set(Object.values(imports).flatMap((s) => [...s]));
const unreferenced = src.filter((f) => !referenced.has(f) && !/main\.tsx$/.test(f)).map(rel);
const out = {
  files: files.sort((a, b) => b.lines - a.lines).slice(0, 25), totalLines: files.reduce((n, f) => n + f.lines, 0), fileCount: files.length,
  complexity: functions.sort((a, b) => b.cc - a.cc).slice(0, 25), longest: [...functions].sort((a, b) => b.length - a.length).slice(0, 15),
  patterns, duplicates: [...dups.values()].sort((a, b) => b.windows - a.windows).slice(0, 20), cycles: cycles.filter((c) => !/routeTree/.test(c)), layering, unusedExports, unreferenced,
};
fs.writeFileSync(process.argv[2] ?? "analyze.json", JSON.stringify(out, null, 1));
console.log(`analyzed ${files.length} files, ${functions.length} functions`);
