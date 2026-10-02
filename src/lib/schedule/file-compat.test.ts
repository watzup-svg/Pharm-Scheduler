// Saved files keep opening. The two files in fixtures/ are frozen: saved-v2.json is what the app writes today, saved-v1.json is
// the older format (time off as from-to ranges). If the file format changes on purpose, regenerate them in the same change.
import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import { evaluate } from "./rules.ts";
import { parseDoc, serializeDoc } from "./file.ts";

const load = (name: string) => fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

describe("saved files", () => {
  it("the current format opens and saves back byte for byte", () => {
    const text = load("saved-v2.json");
    assert.equal(serializeDoc(parseDoc(text)), text);
  });

  it("an older v1 file opens, is upgraded to the current format, and keeps its schedule", () => {
    const old = parseDoc(load("saved-v1.json"));
    const now = parseDoc(load("saved-v2.json"));
    assert.deepEqual(old.grid, now.grid);
    assert.deepEqual(old.people.map((p) => p.name), now.people.map((p) => p.name));
    assert.equal(old.holidays.length, now.holidays.length);
    assert.equal(old.timeOff.length, now.timeOff.length);
    assert.equal(JSON.parse(serializeDoc(old)).version, 2);
    const ev = evaluate(old);
    assert.equal(ev.holes, evaluate(now).holes);
  });

  it("saving twice gives the same file (no drift)", () => {
    const once = serializeDoc(parseDoc(load("saved-v1.json")));
    assert.equal(serializeDoc(parseDoc(once)), once);
  });

  it("damaged or foreign files are refused, not half-opened", () => {
    const text = load("saved-v2.json");
    for (const bad of [text.slice(0, text.length / 2), text.replace('"hischool-schedule"', '"other"'), text.replace('"version": 2', '"version": 99'), "{}", ""]) {
      assert.throws(() => parseDoc(bad));
    }
  });
});
