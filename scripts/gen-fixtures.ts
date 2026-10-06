// Regenerates fixtures/*.json from the prototype's built-in data. Run once; the output is committed.
//   node --experimental-strip-types scripts/gen-fixtures.ts
import { writeFileSync } from "node:fs";
import { createDemo } from "../src/lib/schedule/demo.ts";
import { createSample } from "../src/lib/schedule/sample.ts";
import { DRIVE_TABLE, DRIVE_TABLE_DATE } from "../src/lib/schedule/drive-table.ts";
import { HI_SCHOOL_STORES } from "../src/lib/schedule/stores.ts";

const out = (name: string, v: unknown) => writeFileSync(new URL(`../fixtures/${name}`, import.meta.url), `${JSON.stringify(v, null, 1)}\n`);
out("demo-v2.json", createDemo());
out("sample-v2.json", createSample());
out("drive-table.json", { measuredOn: DRIVE_TABLE_DATE, pairs: DRIVE_TABLE });
out("hischool-stores.json", HI_SCHOOL_STORES);
