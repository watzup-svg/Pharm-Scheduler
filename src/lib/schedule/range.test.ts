import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTsv, rectCells, tsvCells } from "./range.ts";
import { createSample } from "./sample.ts";
import { gridCsv } from "./csv.ts";
import { daysWorked, namePlacements } from "./coverage.ts";
import { copyPatternStore, getPatternCell, setPatternCell, stampWeekday } from "./stamp.ts";
import { getCell } from "./grid.ts";
import { packPageCount } from "./print-model.ts";
import { buildPackBytes, buildPdfBytes } from "./pdf.ts";
import { buildEmployeeCalendar, buildStorePoster } from "./print-model.ts";

describe("range and remaining steal helpers", () => {
  it("builds a slot × day rectangle in one store", () => {
    const doc = createSample();
    const cells = rectCells(
      doc,
      { store: "EST", slot: "pharmacist", day: 1 },
      { store: "EST", slot: "pharmacist2", day: 3 },
    );
    assert.equal(cells.length, 6);
    assert.ok(cells.some((c) => c.slot === "pharmacist2" && c.day === 2));
  });

  it("pastes TSV from the focused cell as top-left", () => {
    const table = parseTsv("Jane Smith\tTom Reyes\nSusan Brown");
    const cells = tsvCells({ store: "EST", slot: "pharmacist", day: 8 }, table);
    assert.equal(cells[0]?.ref.slot, "pharmacist");
    assert.equal(cells[0]?.ref.day, 8);
    assert.equal(cells[1]?.name, "Tom Reyes");
    assert.equal(cells[2]?.ref.slot, "pharmacist2");
    assert.equal(cells[2]?.name, "Susan Brown");
  });

  it("exports only filled cells as CSV", () => {
    const csv = gridCsv(createSample());
    assert.ok(csv.startsWith("Store,Slot,Day,Weekday,Name"));
    assert.ok(csv.includes("EST,RPh,1,Tue,Jane Smith"));
    assert.ok(!csv.includes("EST,RPh,16,"));
  });

  it("counts unique days Jane works, not slots", () => {
    const doc = createSample();
    assert.ok(daysWorked(doc, "Jane Smith") >= 20);
    const places = namePlacements(doc, "Jane Smith");
    assert.ok(places.some((p) => p.store === "MOL" && p.day === 4));
  });

  it("stamp does not overwrite a filled Monday", () => {
    let doc = createSample();
    doc = { ...doc, pattern: setPatternCell(doc.pattern, "EST", "pharmacist", 1, "Tom Reyes") };
    const res = stampWeekday(doc, 1, "EST");
    assert.equal(getCell(res.doc.grid, "EST", "pharmacist", 21), "Jane Smith");
  });

  it("copies a typical-week stencil between stores", () => {
    let pattern = setPatternCell({}, "EST", "pharmacist", 2, "Jane Smith");
    pattern = copyPatternStore(pattern, "EST", "MOL");
    assert.equal(getPatternCell(pattern, "MOL", "pharmacist", 2), "Jane Smith");
  });

  it("two-up pack is a valid PDF and page count matches", () => {
    const doc = createSample();
    const models = [
      buildStorePoster(doc, "EST")!,
      buildEmployeeCalendar(doc, "Jane Smith")!,
      buildEmployeeCalendar(doc, "Tom Reyes")!,
    ];
    assert.equal(packPageCount(1, 2, true), 2);
    const bytes = new Uint8Array(
      buildPackBytes(models, {
        paper: "letter",
        typeSize: "normal",
        grayscale: true,
        twoUp: true,
        punch: true,
        draft: true,
      }),
    );
    assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
    const one = new Uint8Array(buildPdfBytes(models[1]!));
    assert.equal(new TextDecoder().decode(one.slice(0, 5)), "%PDF-");
  });
});
