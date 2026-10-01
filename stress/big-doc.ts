import { createDemo } from "../src/lib/schedule/demo.ts";
import { placeName } from "../src/lib/schedule/place.ts";
import fs from "node:fs";
let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const base = createDemo();
const N = Number(process.argv[2] ?? 40), P = Number(process.argv[3] ?? 150);
const stores = Array.from({ length: N }, (_, i) => ({ ...base.stores[i % base.stores.length]!, code: `S${String(i).padStart(2, "0")}`, name: `Store ${i} Hi-School Pharmacy`, number: String(2000 + i) }));
const people = Array.from({ length: P }, (_, i) => ({ ...base.people[i % base.people.length]!, name: `Pharmacist Number${i}`, home: stores[i % N]!.code, licensedStates: ["OR", "WA"] }));
let doc: any = { ...base, stores, people, grid: {}, timeOff: [], holidays: [] };
for (let i = 0; i < N * 20; i++) { const r = placeName(doc, stores[Math.floor(rnd() * N)]!.code, "pharmacist", 1 + Math.floor(rnd() * 31), people[Math.floor(rnd() * P)]!.name); if (r.ok) doc = r.doc; }
fs.writeFileSync(process.argv[4] ?? "/tmp/big-doc.json", JSON.stringify({ doc, fileName: "big.hisp.json", dirty: false }));
console.log("wrote", N, "stores", P, "people");
