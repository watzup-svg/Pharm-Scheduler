// Throwaway harness for Phase 1. All the logic under test is in src/domain; this only wires buttons to it.
import { ConflictError, Session, type FileSink, type OpenReport } from "../../src/domain/store.ts";
import { sha256 } from "../../src/domain/hash.ts";
import { DownloadSink, FsaSink, IdbMirror, hasFilePicker, listMirrorIds, pickOpen, pickSave, recallHandle, rememberHandle } from "./browser-io.ts";
import { findConflictCopies } from "./conflicts.ts";

let session: Session | null = null;
let sink: FileSink | null = null;
let n = 0;
const $ = (id: string) => document.getElementById(id)!;
const logEl = $("log");
const log = (m: string) => {
  logEl.textContent = `${m}\n${logEl.textContent}`.slice(0, 4000);
};
// The "stamp" and the db id come from the page, never from inside the domain.
const stamp = () => new Date().toISOString();
const newId = () => `db-${crypto.randomUUID()}`;
const mirrorFor = (id: string) => new IdbMirror(id);

function show(extra = "") {
  const s = session;
  $("status").textContent = s ? `${s.readOnly ? "READ-ONLY · " : ""}db ${s.db.id.slice(0, 12)} · change sets ${s.db.seq} · checkpoints ${s.db.checkpoints.length} · unsaved lines ${s.unsavedLines} ${extra}` : `No database open ${extra}`;
}

const edit = (i: number) => ({
  label: `edit ${i}`,
  source: "manual",
  stamp: stamp(),
  events: [{ op: "put" as const, table: "assignment", id: `A${String(i % 5000).padStart(5, "0")}`, row: { pharmacist: `P${i % 40}`, store: `S${i % 18}`, date: "2026-10-01", source: "manual", agreed: i % 2 === 0 } }],
});

async function afterOpen(r: { session: Session | null; report: OpenReport }) {
  session = r.session;
  log(`open: from=${r.report.from} file=${r.report.fileStatus} browser=${r.report.mirrorStatus} recovered=${r.report.recovered} diverged=${r.report.diverged} ${r.report.detail}`);
  show();
  return r.report;
}

let autoTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleAuto() {
  if (!($("auto") as HTMLInputElement).checked || !session || !sink || sink instanceof DownloadSink) return;
  if (autoTimer) clearTimeout(autoTimer);
  autoTimer = setTimeout(() => void doSave(), 2000);
}
async function doSave(): Promise<"saved" | "conflict" | "failed" | "none"> {
  if (!session) return "none";
  try {
    await session.save();
    log("saved");
    show();
    return "saved";
  } catch (e) {
    show();
    if (e instanceof ConflictError) {
      log("NOT saved: the file changed outside this page. Use Save As to keep your copy.");
      return "conflict";
    }
    log(`save failed: ${(e as Error).message}`);
    return "failed";
  }
}

const api = {
  hasFilePicker,
  async newDb(id = newId()) {
    session = await Session.create({ dbId: id, sink: null, mirror: mirrorFor(id) });
    sink = null;
    show();
    return id;
  },
  async edits(count: number) {
    for (let i = 0; i < count; i++) await session!.commit(edit(++n));
    show();
    scheduleAuto();
    return session!.db.seq;
  },
  async checkpoint(name = `cp${session!.db.checkpoints.length + 1}`) {
    await session!.checkpoint(name, stamp());
    show();
    return name;
  },
  async revert(name?: string) {
    const nm = name ?? session!.db.checkpoints.at(-1)!.name;
    await session!.revert(nm, stamp());
    show();
  },
  async openText(text: string, fileName = "upload.hspdb", recoverId?: string) {
    sink = new DownloadSink(text, fileName);
    const id = text ? undefined : recoverId;
    return afterOpen(await Session.open({ sink, mirrorFor, recoverId: id }));
  },
  async recoverFromBrowser(id: string) {
    sink = new DownloadSink(null, "recovered.hspdb");
    return afterOpen(await Session.open({ sink, mirrorFor, recoverId: id }));
  },
  async openHandle(h: FileSystemFileHandle) {
    sink = new FsaSink(h);
    return afterOpen(await Session.open({ sink, mirrorFor }));
  },
  async saveToHandle(h: FileSystemFileHandle) {
    sink = new FsaSink(h);
    await session!.saveAs(sink);
    show();
  },
  save: doSave,
  async saveAs(newSink: FileSink) {
    await session!.saveAs(newSink);
    sink = newSink;
    show();
  },
  text: () => session!.text(),
  state: () => ({ seq: session?.db.seq ?? -1, unsaved: session?.unsavedLines ?? -1, readOnly: session?.readOnly ?? false, checkpoints: session?.db.checkpoints.length ?? 0, hash: session ? sha256(JSON.stringify(session.db.tables)) : "" }),
  rows: () => Object.keys(session?.db.tables.assignment ?? {}).length,
  listMirrorIds,
  findConflictCopies,
  FsaSink,
  /** Timings for the findings: per-commit cost with the strict IndexedDB mirror, and load/save at a realistic size. */
  async bench() {
    const id = newId();
    const s = await Session.create({ dbId: id, sink: null, mirror: mirrorFor(id) });
    const seed = [];
    for (let i = 0; i < 17000; i++) seed.push({ op: "put" as const, table: "assignment", id: `A${String(i).padStart(6, "0")}`, row: { pharmacist: `P${i % 40}`, store: `S${i % 18}`, date: "2026-10-01", source: "pattern", agreed: true } });
    let t = performance.now();
    await s.commit({ label: "seed", source: "import", stamp: stamp(), events: seed });
    const seedMs = performance.now() - t;
    const lat: number[] = [];
    for (let i = 0; i < 200; i++) {
      t = performance.now();
      await s.commit({ label: `e${i}`, source: "manual", stamp: stamp(), events: [{ op: "put", table: "assignment", id: `A${String(i).padStart(6, "0")}`, row: { pharmacist: "PX", store: "S1", date: "2026-10-02", source: "manual", agreed: true } }] });
      lat.push(performance.now() - t);
    }
    lat.sort((a, b) => a - b);
    const text = s.text();
    t = performance.now();
    const m = new DownloadSink(text, "x");
    const opened = await Session.open({ sink: m, mirrorFor: () => new IdbMirror(id + "-b") });
    const openMs = performance.now() - t;
    t = performance.now();
    sha256(text);
    const hashMs = performance.now() - t;
    return { rows: 17000, changeSets: s.db.seq, fileKB: Math.round(text.length / 1024), seedCommitMs: Math.round(seedMs), editMsMedian: lat[100]!, editMsP95: lat[190]!, openFullFileMs: Math.round(openMs), sha256WholeFileMs: Math.round(hashMs), opened: opened.session?.db.seq };
  },
};
(window as unknown as { h: typeof api }).h = api;

$("new").onclick = () => void api.newDb();
$("edit1").onclick = () => void api.edits(1);
$("edit100").onclick = () => void api.edits(100);
$("cp").onclick = () => void api.checkpoint();
$("revert").onclick = () => void api.revert();
$("save").onclick = async () => {
  if (!sink || sink instanceof DownloadSink) return void $("saveas").click();
  await doSave();
};
$("saveas").onclick = async () => {
  if (!session) return;
  if (hasFilePicker()) {
    const h = await pickSave("schedule.hspdb");
    await api.saveToHandle(h);
    await rememberHandle(h);
    log("saved to the chosen file");
  } else $("download").click();
};
$("download").onclick = async () => {
  if (!session) return;
  await session.saveAs(new DownloadSink(null, "schedule.hspdb"));
  show("(downloaded a copy)");
};
$("open").onclick = async () => {
  if (hasFilePicker()) {
    const h = await pickOpen();
    await api.openHandle(h);
    await rememberHandle(h);
  } else log("This browser has no file access; use the file chooser below.");
};
($("upload") as HTMLInputElement).onchange = async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) await api.openText(await f.text(), f.name);
};
$("recover").onclick = async () => {
  const ids = await listMirrorIds();
  $("recoverIds").textContent = ids.length ? "" : "nothing kept in this browser";
  for (const id of ids) {
    const b = document.createElement("button");
    b.textContent = id.slice(0, 12);
    b.onclick = () => void api.recoverFromBrowser(id);
    $("recoverIds").appendChild(b);
  }
};
if (!hasFilePicker()) $("fallback").insertAdjacentHTML("afterbegin", '<span class="warn">This browser cannot save to a file you pick; changes are kept in the browser, and Save a copy downloads a file.</span> ');
void recallHandle().then((h) => h && log("A file was used last time; click Open file… to continue (Chrome asks you to allow it again)."));
show();
