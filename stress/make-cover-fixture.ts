// A made-up Thursday: everyone is on time off or busy except two pharmacists working together at Woodland, and Medicine on Time
// has nobody. The only short answer is to move Woodland's second pharmacist. Used by the browser test.
import fs from "node:fs";
import { createDemo } from "../src/lib/schedule/demo.ts";
import { placeName } from "../src/lib/schedule/place.ts";
import { coverPlans, bestDirectDrive } from "../src/lib/schedule/cover-plan.ts";
import { RPH_SLOTS } from "../src/lib/schedule/slots.ts";
import { isoDate } from "../src/lib/schedule/calendar.ts";
let doc = createDemo();
const day = 22;
const date = isoDate(doc.year, doc.month, day);
const rph = doc.people.filter((p) => p.role === "Pharmacist" || p.role === "Float Pharmacist").map((p) => p.name);
const wood = rph.filter((n) => doc.people.find((p) => p.name === n)!.home === "WOO");
const keep = new Set([wood[0]!, rph.find((n) => !wood.includes(n) && doc.people.find((p) => p.name === n)!.licensedStates?.includes("WA"))!]);
// clear the day, then set the scene
for (const s of doc.stores) for (const sl of RPH_SLOTS) doc = placeName(doc, s.code, sl, day, "").doc;
const [a, b] = [...keep];
doc = placeName(doc, "WOO", "pharmacist", day, a!).doc;
doc = placeName(doc, "WOO", "pharmacist2", day, b!).doc;
for (const n of rph) if (!keep.has(n)) doc = { ...doc, timeOff: [...doc.timeOff, { name: n, dates: [date], from: date, to: date, note: "", status: undefined as never }] };
doc = { ...doc, timeOff: doc.timeOff.map((t) => (t.status === undefined ? (({ status: _s, ...rest }) => rest)(t as never) as never : t)) };
const r = coverPlans(doc, "MOT", day);
console.log("day", day, "keep", a, b, "direct", bestDirectDrive(doc, "MOT", day), r.reason, r.plans.map((p) => p.moves.map((m) => `${m.name} ${m.from ?? m.origin}>${m.to} ${m.minutes}`).join(" | ")));
fs.writeFileSync("e2e/fixtures/cover-doc.json", JSON.stringify({ doc, fileName: "cover-fixture.hisp.json", dirty: false }));
