import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPdfBytes } from "./pdf.ts";
import {
  buildDistrictSheet,
  buildEmployeeCalendar,
  buildStorePoster,
  employeeHeaderMeta,
  employeeMark,
  employeePdfName,
  filledSlotLines,
  firstNames,
  packPages,
  storePdfName,
} from "./print-model.ts";
import { setCellValue } from "./grid.ts";
import { createSample } from "./sample.ts";

describe("print model", () => {
  const doc = createSample();

  it("employee marks match the sample lessons", () => {
    assert.equal(employeeMark(doc, "Jane Smith", 1), "EST");
    assert.equal(employeeMark(doc, "Jane Smith", 4), "DBL");
    assert.equal(employeeMark(doc, "Jane Smith", 6), "OFF");
    assert.equal(employeeMark(doc, "Jane Smith", 14), "PTO");
    assert.equal(employeeMark(doc, "Jane Smith", 16), "OFF");
    assert.equal(employeeMark(doc, "Susan Brown", 14), "EST");
  });

  it("store poster lists pharmacist names only and marks shut days CLOSED", () => {
    const sat = filledSlotLines(doc, "EST", 5);
    assert.deepEqual(sat, ["RPh: Jane Smith"]);
    const hole = filledSlotLines(doc, "EST", 16);
    assert.deepEqual(hole, []);
    const cover = filledSlotLines(doc, "EST", 14);
    assert.deepEqual(cover, ["RPh2: Susan Brown"]);
    const poster = buildStorePoster(doc, "EST");
    assert.ok(poster);
    assert.equal(poster.address.includes("Estacada"), true);
    const sun = poster.weeks.flat().find((c) => c.day === 6);
    assert.equal(sun?.closed, true);
    assert.deepEqual(sun?.lines, ["CLOSED"]);
  });

  it("uses the requested file names", () => {
    assert.equal(storePdfName("EST", 2026, 9), "EST-2026-09.pdf");
    assert.equal(employeePdfName("Jane Smith", 2026, 9), "Jane-Smith-2026-09.pdf");
    assert.equal(buildStorePoster(doc, "EST")?.filename, "EST-2026-09.pdf");
    assert.equal(
      buildEmployeeCalendar(doc, "Jane Smith")?.filename,
      "Jane-Smith-2026-09.pdf",
    );
  });

  it("prints a phone on the pharmacist calendar only, with days and Saturdays", () => {
    const phone = "555-0199";
    const withPhone = {
      ...doc,
      people: doc.people.map((p) => (p.name === "Jane Smith" ? { ...p, phone } : p)),
    };
    const emp = buildEmployeeCalendar(withPhone, "Jane Smith");
    assert.ok(emp);
    assert.ok(emp.days > 0);
    assert.ok(emp.saturdays > 0);
    assert.match(employeeHeaderMeta(emp), /Pharmacist/);
    assert.match(employeeHeaderMeta(emp), /home EST/);
    assert.match(employeeHeaderMeta(emp), /days/);
    assert.match(employeeHeaderMeta(emp), /Sat/);
    assert.ok(employeeHeaderMeta(emp).includes(phone));
    const bytes = new TextDecoder("latin1").decode(new Uint8Array(buildPdfBytes(emp)));
    assert.equal(bytes.includes(phone), true);
    const poster = buildStorePoster(withPhone, "EST");
    assert.ok(poster);
    const storeBytes = new TextDecoder("latin1").decode(new Uint8Array(buildPdfBytes(poster)));
    assert.equal(storeBytes.includes(phone), false);
    const district = buildDistrictSheet(withPhone);
    const districtBytes = new TextDecoder("latin1").decode(new Uint8Array(buildPdfBytes(district)));
    assert.equal(districtBytes.includes(phone), false);
    const mol4 = district.stores.find((s) => s.code === "MOL")?.days.find((d) => d.day === 4);
    assert.deepEqual(firstNames(mol4?.names ?? []), ["Tom", "Jane"]);
  });

  it("marks a pharmacist away from home as cover, not a home-store float", () => {
    const susan = buildEmployeeCalendar(doc, "Susan Brown");
    const homeDay = susan?.weeks.flat().find((c) => c.day === 14);
    assert.equal(homeDay?.mark, "EST");
    assert.equal(homeDay?.cover, false);
    const chris = buildEmployeeCalendar(doc, "Chris Hale");
    const mol = chris?.weeks.flat().find((c) => c.day === 18);
    assert.equal(mol?.mark, "MOL");
    assert.equal(mol?.cover, false);
    const away = {
      ...doc,
      grid: setCellValue(doc.grid, "SCA", "pharmacist2", 8, "Susan Brown"),
    };
    const moved = buildEmployeeCalendar(away, "Susan Brown");
    const sca = moved?.weeks.flat().find((c) => c.day === 8);
    assert.equal(sca?.mark, "SCA");
    assert.equal(sca?.cover, true);
  });

  it("writes a one-page letter PDF", () => {
    const model = buildStorePoster(doc, "EST");
    assert.ok(model);
    const bytes = new Uint8Array(buildPdfBytes(model));
    const head = new TextDecoder().decode(bytes.slice(0, 5));
    assert.equal(head, "%PDF-");
    const emp = buildEmployeeCalendar(doc, "Jane Smith");
    assert.ok(emp);
    const ebytes = new Uint8Array(buildPdfBytes(emp));
    assert.equal(new TextDecoder().decode(ebytes.slice(0, 5)), "%PDF-");
  });

  it("pack pages list stores then employees, pairing when two-up", () => {
    const models = [
      buildStorePoster(doc, "EST")!,
      buildEmployeeCalendar(doc, "Jane Smith")!,
      buildEmployeeCalendar(doc, "Tom Reyes")!,
    ];
    const pages = packPages(models, true);
    assert.equal(pages.length, 2);
    assert.equal(pages[0]?.kind, "store");
    assert.equal(pages[1]?.kind, "twoUp");
  });
});
