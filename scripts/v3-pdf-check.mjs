// The printed packet, checked as a file. No browser: app3/print/model.ts and pdf.ts are pure, so this runs the real code in Node.
//   node scripts/v3-pdf-check.mjs
// For the practice month and a larger generated month it posts a snapshot, builds the PDF and asserts: valid PDF framing, the page
// count (EXPECTED_PAGES below; a change means the packet layout changed, update it on purpose), no blank page, every store code and
// every set of initials used in the data is in the page text, and building twice is byte-identical (the creation date is a fixed
// stamp from the snapshot, so nothing needs normalising; the two builds are still compared after masking dates and ids).
// Text comes from the content streams (jsPDF writes them uncompressed); `pdftotext` is used as a second opinion when installed.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { api } from "../domain/src/api.ts";
import { importV2 } from "../domain/src/index.ts";
import { genWorld } from "./v3-pressure/lib.ts";
import { DEFAULT_PRINT_OPTIONS, paginate, snapshotToPrintModel } from "../app3/print/model.ts";
import { buildPacketBytes } from "../app3/print/pdf.ts";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let failures = 0;
const check = (name, ok, detail = "") => { if (!ok) failures++; console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && detail ? ` - ${detail}` : ""}`); };

// Pages per case and option set: default (letter, large type) and tabloid two-up. Default = 1 at-a-glance sheet + one per store.
const EXPECTED_PAGES = {
  practice: { default: 17, twoUp: 9 },
  large: { default: 41, twoUp: 21 },
};

const json = (f) => JSON.parse(fs.readFileSync(path.join(root, "fixtures", f), "utf8"));
const practice = importV2([json("demo-v2.json")], { driveTable: json("drive-table.json").pairs }).world;
const large = genWorld({ seed: 31, stores: 40, pharmacists: 150, kind: "normal", start: "2026-10-01", days: 31 });
const cases = [
  { id: "practice", world: practice, from: "2026-10-01", to: "2026-10-31", asOf: "2026-10-06" },
  { id: "large", world: large, from: "2026-10-01", to: "2026-10-31", asOf: "2026-10-06" },
];
const optionSets = { default: DEFAULT_PRINT_OPTIONS, twoUp: { ...DEFAULT_PRINT_OPTIONS, paper: "tabloid", twoUp: true } };

/** Decode a PDF string literal: \( \) \\ \n and octal escapes. */
const unescape = (s) => s.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, c) => (/[0-7]/.test(c) ? String.fromCharCode(parseInt(c, 8)) : ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" })[c] ?? c));

/** Pages with their text operators, from the raw file. Returns null when the streams are compressed (cannot parse). */
function pagesText(buf) {
  const s = Buffer.from(buf).toString("latin1");
  if (/\/Filter\s*\/FlateDecode/.test(s)) return null;
  const contents = [...s.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map((m) => m[1]);
  return contents.map((c) => {
    const strs = [...c.matchAll(/\(((?:\\.|[^\\()])*)\)\s*Tj/g)].map((m) => unescape(m[1]));
    return { strs, ops: (c.match(/\bT[jJ]\b/g) ?? []).length, drawOps: (c.match(/\s(re|l|f|S|B)\r?\n/g) ?? []).length };
  });
}

/** Everything that must be on the paper, from the snapshot (not from the model the PDF was drawn from). */
function expectedTokens(world, snap) {
  const codes = new Set();
  const initials = new Set();
  for (const [k, c] of Object.entries(snap.cells)) {
    const st = world.state.stores[k.split("|")[0]];
    if (st) codes.add(st.code);
    for (const i of c.initials) initials.add(i);
  }
  for (const st of Object.values(world.state.stores)) {
    const from = !st.activeFrom || st.activeFrom <= snap.to;
    const to = !st.inactiveFrom || st.inactiveFrom > snap.from;
    if (from && to) codes.add(st.code);
  }
  return { codes: [...codes], initials: [...initials] };
}

const hasPdftotext = spawnSync("pdftotext", ["-v"], { encoding: "utf8" }).error === undefined;
if (!hasPdftotext) console.log("note pdftotext is not installed; text is read from the PDF content streams instead");
const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "v3-pdf-"));

for (const c of cases) {
  const { world, snapshot } = api.post(c.world, { from: c.from, to: c.to }, c.asOf);
  const model = snapshotToPrintModel(snapshot, world.state);
  const exp = expectedTokens(world, snapshot);
  console.log(`     ${c.id}: ${model.stores.length} store pages, ${exp.codes.length} codes, ${exp.initials.length} initials`);
  check(`${c.id}: the data has stores and people to look for`, exp.codes.length > 5 && exp.initials.length > 3);
  for (const [oname, opts] of Object.entries(optionSets)) {
    const tag = `${c.id}/${oname}`;
    const a = Buffer.from(buildPacketBytes(model, opts));
    const b = Buffer.from(buildPacketBytes(snapshotToPrintModel(snapshot, world.state), opts));
    const s = a.toString("latin1");
    check(`${tag}: PDF header and trailer`, s.startsWith("%PDF-1.") && /startxref\r?\n\d+\r?\n%%EOF\s*$/.test(s) && /\btrailer\b/.test(s), s.slice(0, 12));
    const pageObjs = (s.match(/\/Type\s*\/Page\b(?!s)/g) ?? []).length;
    const countDecl = Number(/\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/.exec(s)?.[1] ?? -1);
    const sheets = paginate(model, opts).length;
    check(`${tag}: page count ${pageObjs} agrees with /Count and with the layout (${sheets})`, pageObjs === countDecl && pageObjs === sheets, `${pageObjs} / ${countDecl} / ${sheets}`);
    const want = EXPECTED_PAGES[c.id][oname];
    if (want !== null) check(`${tag}: page count is the expected ${want}`, pageObjs === want, `got ${pageObjs}`);
    // Determinism. Dates and file ids are masked first so a clock or id change would not be the cause; none is expected anyway.
    const mask = (x) => x.toString("latin1").replace(/\/(CreationDate|ModDate)\s*\([^)]*\)/g, "/$1()").replace(/\/ID\s*\[[^\]]*\]/g, "/ID[]");
    check(`${tag}: two builds are identical (${a.length} bytes)`, mask(a) === mask(b));
    check(`${tag}: two builds are identical without masking`, a.equals(b), "differs only by a stamp?");
    const pages = pagesText(a);
    if (!pages) { console.log(`note ${tag}: content streams are compressed; text checks skipped`); continue; }
    // Content streams: one per page (jsPDF) plus no others of text. Keep only streams that have page text.
    const withText = pages.filter((p) => p.ops > 0);
    check(`${tag}: no blank page (every page has text and drawing)`, withText.length === pageObjs && pages.slice(0, pageObjs).every((p) => p.ops > 3 && p.drawOps > 3), `${withText.length} text streams for ${pageObjs} pages, ops ${pages.map((p) => p.ops).join(",")}`);
    if (c.id === 'practice' && oname === 'default') console.log(`     ${pages.reduce((n, p) => n + p.strs.length, 0)} text strings parsed`);
    const all = new Set(pages.flatMap((p) => p.strs.map((x) => x.trim())));
    const allText = pages.flatMap((p) => p.strs).join("\n");
    const missCodes = exp.codes.filter((k) => !allText.includes(k));
    check(`${tag}: every store code is on the paper (${exp.codes.length})`, !missCodes.length, `missing ${missCodes.slice(0, 8).join(",")}`);
    const missIni = exp.initials.filter((k) => !all.has(k));
    check(`${tag}: every set of initials is on the paper (${exp.initials.length})`, !missIni.length, `missing ${missIni.slice(0, 8).join(",")}`);
    const per = pages.slice(0, pageObjs).map((p) => p.strs.join(" ").trim().length);
    check(`${tag}: no page has under 20 characters of text`, per.every((n) => n >= 20), per.join(","));
    if (hasPdftotext && oname === "default") {
      const f = path.join(tmp, `${c.id}.pdf`);
      fs.writeFileSync(f, a);
      const r = spawnSync("pdftotext", ["-layout", f, "-"], { encoding: "utf8" });
      const miss = exp.codes.filter((k) => !r.stdout.includes(k));
      check(`${tag}: pdftotext also finds every store code`, r.status === 0 && !miss.length, miss.slice(0, 8).join(","));
    }
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failures ? `\n${failures} check(s) failed` : "\nall pdf checks passed");
process.exit(failures ? 1 : 0);
