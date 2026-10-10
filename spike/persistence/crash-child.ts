// Child process for the kill tests: edit and save in a loop, print an acknowledgement line after each durable step, until killed.
import { Session } from "../../src/domain/store.ts";
import { AtomicFileSink, FileMirror, InPlaceFileSink } from "./node-io.ts";
import type { DbEvent } from "../../src/domain/db.ts";

const [dir, kind, saveEvery] = process.argv.slice(2) as [string, string, string];
const file = `${dir}/schedule.hspdb`;
const sink = kind === "inplace" ? new InPlaceFileSink(file) : new AtomicFileSink(file);
const mirror = new FileMirror(`${dir}/mirror.txt`);
const s = await Session.create({ dbId: "kill-test", sink, mirror });
// A realistic size so a save takes real time: about 2,000 assignment rows.
const seed: DbEvent[] = [];
for (let i = 0; i < 2000; i++) seed.push({ op: "put", table: "assignment", id: `A${String(i).padStart(5, "0")}`, row: { pharmacist: `P${i % 40}`, store: `S${i % 18}`, date: "2026-10-01", source: "pattern", agreed: true } });
await s.commit({ label: "seed", source: "import", stamp: "t0", events: seed });
await s.save();
console.log("S 1");
for (let k = 2; ; k++) {
  await s.commit({ label: `edit ${k}`, source: "manual", stamp: "t", events: [{ op: "put", table: "assignment", id: `A${String(k % 2000).padStart(5, "0")}`, row: { pharmacist: `P${k}`, store: "S1", date: "2026-10-02", source: "manual", agreed: true } }] });
  console.log(`C ${s.db.seq}`);
  if (k % Number(saveEvery) === 0) {
    await s.save();
    console.log(`S ${s.db.seq}`);
  }
}
