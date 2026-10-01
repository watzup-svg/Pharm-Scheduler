import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dropCaption, dropName } from "./drag.ts";
import { getCell, setCellValue } from "./grid.ts";
import { createSample } from "./sample.ts";

describe("drop a name on the grid", () => {
  it("moves Jane from Tuesday 1 onto the Estacada Wednesday 16 hole", () => {
    const doc = createSample();
    assert.equal(getCell(doc.grid, "EST", "pharmacist", 1), "Jane Smith");
    assert.equal(getCell(doc.grid, "EST", "pharmacist", 16), "");
    const next = dropName(
      doc,
      { store: "EST", slot: "pharmacist", day: 16 },
      { name: "Jane Smith", from: { store: "EST", slot: "pharmacist", day: 1 } },
      false,
    );
    assert.equal(getCell(next.grid, "EST", "pharmacist", 16), "Jane Smith");
    assert.equal(getCell(next.grid, "EST", "pharmacist", 1), "");
    assert.equal(getCell(next.grid, "EST", "pharmacist", 2), "Jane Smith");
  });

  it("Alt/copy keeps the source cell", () => {
    const doc = createSample();
    const next = dropName(
      doc,
      { store: "EST", slot: "pharmacist", day: 16 },
      { name: "Jane Smith", from: { store: "EST", slot: "pharmacist", day: 1 } },
      true,
    );
    assert.equal(getCell(next.grid, "EST", "pharmacist", 16), "Jane Smith");
    assert.equal(getCell(next.grid, "EST", "pharmacist", 1), "Jane Smith");
  });

  it("dropping a name onto another name swaps the two cells", () => {
    const doc = createSample();
    assert.equal(getCell(doc.grid, "MOL", "pharmacist", 4), "Tom Reyes");
    assert.equal(getCell(doc.grid, "MOL", "pharmacist2", 4), "Jane Smith");
    const next = dropName(
      doc,
      { store: "MOL", slot: "pharmacist2", day: 4 },
      { name: "Tom Reyes", from: { store: "MOL", slot: "pharmacist", day: 4 } },
      false,
    );
    assert.equal(getCell(next.grid, "MOL", "pharmacist2", 4), "Tom Reyes");
    assert.equal(getCell(next.grid, "MOL", "pharmacist", 4), "Jane Smith");
  });

  it("rejects a drop onto a shut Sunday", () => {
    const doc = createSample();
    const next = dropName(
      doc,
      { store: "EST", slot: "pharmacist", day: 20 },
      { name: "Jane Smith", from: { store: "EST", slot: "pharmacist", day: 1 } },
      false,
    );
    assert.equal(getCell(next.grid, "EST", "pharmacist", 20), "");
    assert.equal(getCell(next.grid, "EST", "pharmacist", 1), "Jane Smith");
    assert.equal(getCell(next.grid, "EST", "pharmacist2", 20), "");
  });

  it("roster drop (no from) copies onto a vacant open cell", () => {
    const doc = createSample();
    const next = dropName(doc, { store: "EST", slot: "pharmacist", day: 16 }, { name: "Susan Brown" }, false);
    assert.equal(getCell(next.grid, "EST", "pharmacist", 16), "Susan Brown");
  });

  it("moves Mark off a shut West Linn Saturday onto an open cell", () => {
    const base = createSample();
    const doc = {
      ...base,
      grid: setCellValue(base.grid, "WL", "pharmacist", 5, "Mark Chen"),
    };
    assert.equal(getCell(doc.grid, "WL", "pharmacist", 5), "Mark Chen");
    const next = dropName(
      doc,
      { store: "EST", slot: "pharmacist2", day: 16 },
      { name: "Mark Chen", from: { store: "WL", slot: "pharmacist", day: 5 } },
      false,
    );
    assert.equal(getCell(next.grid, "EST", "pharmacist2", 16), "Mark Chen");
    assert.equal(getCell(next.grid, "WL", "pharmacist", 5), "");
  });

  it("drop onto a selected range fills those cells without auto-filling other holes", () => {
    const doc = createSample();
    const range = [
      { store: "EST", slot: "pharmacist2", day: 1 } as const,
      { store: "EST", slot: "pharmacist2", day: 2 } as const,
    ];
    const next = dropName(
      doc,
      { store: "EST", slot: "pharmacist2", day: 1 },
      { name: "Susan Brown" },
      true,
      [...range],
    );
    assert.equal(getCell(next.grid, "EST", "pharmacist2", 1), "Susan Brown");
    assert.equal(getCell(next.grid, "EST", "pharmacist2", 2), "Susan Brown");
    assert.equal(getCell(next.grid, "EST", "pharmacist", 16), "");
  });

  it("drop caption names move, swap, fill, and shut", () => {
    const doc = createSample();
    assert.equal(
      dropCaption(
        doc,
        { store: "EST", slot: "pharmacist", day: 16 },
        { name: "Jane Smith", from: { store: "EST", slot: "pharmacist", day: 1 } },
        false,
      ),
      "Move Jane Smith",
    );
    assert.equal(
      dropCaption(
        doc,
        { store: "MOL", slot: "pharmacist2", day: 4 },
        { name: "Tom Reyes", from: { store: "MOL", slot: "pharmacist", day: 4 } },
        false,
      ),
      "Swap Tom Reyes ↔ Jane Smith",
    );
    assert.match(
      dropCaption(
        doc,
        { store: "EST", slot: "pharmacist", day: 20 },
        { name: "Jane Smith", from: { store: "EST", slot: "pharmacist", day: 1 } },
        false,
      ),
      /shut/i,
    );
    assert.equal(
      dropCaption(
        doc,
        { store: "EST", slot: "pharmacist2", day: 1 },
        { name: "Susan Brown" },
        true,
        [
          { store: "EST", slot: "pharmacist2", day: 1 },
          { store: "EST", slot: "pharmacist2", day: 2 },
        ],
      ),
      "Fill 2 open days with Susan Brown",
    );
  });
});
