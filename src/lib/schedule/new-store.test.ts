import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDemo } from "./demo.ts";
import { driveKey } from "./geo.ts";
import { storesNeedingDistances } from "./new-store.ts";

describe("stores needing distances", () => {
  it("none for the measured district; a new store needs all pairs until they are entered", () => {
    const doc = createDemo();
    assert.deepEqual(storesNeedingDistances(doc), []);
    const added = { ...doc, stores: [...doc.stores, { ...doc.stores[0]!, code: "NEW", address: "1 Main St, Newtown, OR 97000", lat: undefined, lng: undefined }] };
    const need = storesNeedingDistances(added);
    const neu = need.find((n) => n.code === "NEW")!;
    assert.equal(neu.others.length, doc.stores.length);
    assert.equal(need.length, doc.stores.length + 1, "each other store lists the new one");
    const some = { ...added, driveMiles: { [driveKey("NEW", "CAT")]: 30 }, driveMinutes: { [driveKey("NEW", "CLA")]: 40 } };
    assert.equal(storesNeedingDistances(some).find((n) => n.code === "NEW")!.others.length, doc.stores.length - 2);
  });
});
