import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { jsPDF } from "jspdf";
import { clip, fitLines } from "./pdf.ts";

const STRESS = ["Anders Kowalczykowski-Vandenberghe", "Cutter’s Hi-School Pharmacy & Variety Store of Molalla", "Short-staffed while two pharmacists are out sick", "Inventory count, close at 4:00 PM sharp please", "Jo"];

describe("pdf text fitting", () => {
  it("clip never exceeds the width and marks what it cut", () => {
    const pdf = new jsPDF({ unit: "in", format: "letter" });
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    for (const text of STRESS) {
      for (const width of [0.6, 1, 2.5]) {
        const out = clip(pdf, text, width);
        assert.ok(pdf.getTextWidth(out) <= width + 0.001, `${text} @${width}`);
        if (out !== text) assert.ok(out.endsWith("…"));
      }
    }
  });

  it("fitLines keeps to the line count and the width", () => {
    const pdf = new jsPDF({ unit: "in", format: "letter" });
    pdf.setFont("helvetica", "bold");
    for (const text of STRESS) {
      for (const [width, lines] of [[1.1, 2], [1.1, 3], [0.9, 1]] as const) {
        const fit = fitLines(pdf, text, width, lines, 10, 6.5);
        pdf.setFontSize(fit.size);
        assert.ok(fit.lines.length <= lines, `${text}: ${fit.lines.length} lines`);
        for (const l of fit.lines) assert.ok(pdf.getTextWidth(l) <= width + 0.001, `${text}: "${l}"`);
        assert.ok(fit.size >= 6.5 && fit.size <= 10);
      }
    }
  });
});

describe("clean copy in the real PDF", () => {
  it("normal pack carries the commentary; clean pack has none of it but keeps the names", async () => {
    const pdfMod = await import("./pdf.ts");
    const pm = await import("./print-model.ts");
    const { createDemo } = await import("./demo.ts");
    const { DEFAULT_PRINT_PREFS } = await import("./types.ts");
    const doc = createDemo();
    const person = doc.people.find((p) => p.role === "Float Pharmacist") ?? doc.people[0]!;
    const build = (clean: boolean) => {
      const models = [pm.buildDistrictSheet(doc), ...doc.stores.slice(0, 3).map((s) => pm.buildStorePoster(doc, s.code)!), pm.buildEmployeeCalendar(doc, person.name)!];
      return (clean ? models.map((m) => pm.cleanModel(m)) : models);
    };
    const text = (models: ReturnType<typeof build>) => {
      const bytes = pdfMod.buildPackBytes(models, { ...DEFAULT_PRINT_PREFS, draft: false, logo: null });
      return Buffer.from(bytes).toString("latin1");
    };
    const normal = text(build(false));
    const clean = text(build(true));
    assert.match(normal, /from XXX|DBL|PTO|holes|No coverage|Left as is/);
    assert.doesNotMatch(clean, /from XXX|cover: not their home|PTO: time off|DBL|Left as is and planned|No coverage:|holes/);
    assert.match(clean, /Posted/);
    assert.match(clean, new RegExp(person.name.split(" ")[0]!));
  });
});
