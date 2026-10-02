// Shared helpers for the pressure tests: load the TypeScript sources, build big and hostile months, a small seeded random.
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const imp = (p) => import(pathToFileURL(path.join(root, p)).href);
export const rng = (seed) => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); };

/** A month with N stores and P people and about 20 placements per store, built through the one write gate. */
export async function bigDoc(N, P, seed = 7) {
  const { createDemo } = await imp("src/lib/schedule/demo.ts");
  const { placeName } = await imp("src/lib/schedule/place.ts");
  const rnd = rng(seed);
  const base = createDemo();
  const stores = Array.from({ length: N }, (_, i) => ({ ...base.stores[i % base.stores.length], code: `S${String(i).padStart(3, "0")}`, name: `Store ${i}` }));
  const people = Array.from({ length: P }, (_, i) => ({ ...base.people[i % base.people.length], name: `Pharmacist Number${i}`, home: stores[i % N].code }));
  let doc = { ...base, stores, people, grid: {}, timeOff: [], holidays: [] };
  for (let i = 0; i < N * 20; i++) doc = placeName(doc, stores[Math.floor(rnd() * N)].code, "pharmacist", 1 + Math.floor(rnd() * 28), people[Math.floor(rnd() * P)].name).doc;
  return doc;
}
