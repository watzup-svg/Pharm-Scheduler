import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parsePeopleList } from "./people-list.ts";
import { HI_SCHOOL_STORES } from "./stores.ts";
import type { Person } from "./types.ts";

describe("paste a roster", () => {
  const stores = HI_SCHOOL_STORES;
  it("reads comma and tab separated lines, floats, states, and store names", () => {
    const text = [
      "Name, Home, Type, Licensed in",
      "Jane Smith, EST",
      "Fenn Ritter, mol, float, OR",
      "Ines Calloway\tWS\tPharmacist\tWA OR",
      "Kip Alder, Wind River, float, OR WA",
    ].join("\n");
    const { people, problems } = parsePeopleList(text, stores, []);
    assert.deepEqual(problems, []);
    assert.equal(people.length, 4);
    assert.deepEqual(people[0], { name: "Jane Smith", role: "Pharmacist", home: "EST", lead: false, phone: "", color: "", licensedStates: ["OR"] });
    assert.equal(people[1]!.role, "Float Pharmacist");
    assert.equal(people[1]!.home, "MOL");
    assert.deepEqual(people[2]!.licensedStates, ["WA", "OR"]);
    assert.equal(people[3]!.home, "WIN");
    assert.deepEqual(people[3]!.licensedStates, ["OR", "WA"]);
  });

  it("defaults a missing license to the home store's state (Washington store)", () => {
    const { people } = parsePeopleList("Yara Bellamy, WOO", stores, []);
    assert.deepEqual(people[0]!.licensedStates, ["WA"]);
  });

  it("reports what it cannot use instead of guessing", () => {
    const existing: Person[] = [{ name: "Jane Smith", role: "Pharmacist", home: "EST", lead: false, phone: "", color: "" }];
    const { people, problems } = parsePeopleList("Jane Smith, EST\nBob Ng, ZZZ\n, EST\nAmy Lo\nAmy Park, SCA\nAmy Park, SCA", stores, existing);
    assert.deepEqual(people.map((p) => p.name), ["Amy Park"]);
    assert.deepEqual(
      problems.map((p) => [p.line, p.why]),
      [
        [1, "Already on the roster"],
        [2, "No store matches “ZZZ”"],
        [3, "No name"],
        [4, "No home store"],
        [6, "Already on the roster"],
      ],
    );
  });
});
