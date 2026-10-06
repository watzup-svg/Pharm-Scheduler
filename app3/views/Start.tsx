// Start: shown when no schedule is open. Three plain paths (open a file, bring in an old file, start new) and a quiet practice link.
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ImportReport, StateCode, World } from "@domain";
import { useApp } from "../store.ts";
import { getPersist } from "../persist-bridge.ts";
import type { BootResult, OpenResult, Offer } from "../persist-types.ts";
import { importPrototypeFiles, practiceWorld, practiceWorldWithProblems } from "../demo.ts";
import { hischoolStarter, newWorld, setupDefaults } from "../newWorld.ts";
import { Btn } from "../ui/primitives.tsx";
import { BrandMark } from "../ui/brand.tsx";

type Problem =
  | { kind: "refused"; reason: string; error: string; offers: Offer[] }
  | { kind: "message"; text: string; reconnect?: boolean }
  | { kind: "recovery"; fileRev: number; mirrorRev: number; world: World; mirrorWorld: World };

type Screen =
  | { name: "home" }
  | { name: "import"; world: World; report: ImportReport; fileName: string; unused: { file: string; why: string }[] }
  | { name: "new" };

function usePersistStatus() {
  const [, tick] = useState(0);
  useEffect(() => getPersist().subscribe(() => tick((n) => n + 1)), []);
  return getPersist().status();
}

/** What the save layer reported at start-up (set by boot.ts). It may arrive just after the first paint. */
function useBootState(): string | undefined {
  const read = () => (window as unknown as { __bootResult?: string }).__bootResult;
  const [v, setV] = useState<string | undefined>(read);
  useEffect(() => {
    if (v !== undefined) return;
    let n = 0;
    const t = setInterval(() => {
      const r = read();
      if (r !== undefined || ++n > 40) { setV(r); clearInterval(t); }
    }, 150);
    return () => clearInterval(t);
  }, [v]);
  return v;
}

function offerWords(o: Offer): string {
  const when = o.at ? ` from ${o.at}` : "";
  if (o.source === "mirror") return `Use the copy this browser kept${when}`;
  if (o.source === "idb-ckpt") return `Use the checkpoint${o.name ? ` "${o.name}"` : ""} this browser kept${when}`;
  return `Use the checkpoint${o.name ? ` "${o.name}"` : ""} stored in the file${when}`;
}

export function Start() {
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  const status = usePersistStatus();
  const boot = useBootState();

  const openWorld = (world: World, opts: { fileName?: string | null; readOnly?: string[] | null; view?: "wall" | "setup" } = {}) => {
    const app = useApp.getState();
    app.setWorld(world, { fileName: opts.fileName ?? getPersist().status().fileName, readOnlyProblems: opts.readOnly ?? null });
    app.setView(opts.view ?? "wall");
  };

  const handleOpen = (r: OpenResult) => {
    if (r.state === "world") { setProblem(null); openWorld(r.world, { readOnly: r.readOnly?.problems ?? null }); if (r.readOnly) useApp.getState().say("info", "This file opened read-only because some of its data is inconsistent."); }
    else if (r.state === "cancelled") { /* the person changed their mind */ }
    else if (r.state === "unsaved-changes") setProblem({ kind: "message", text: "There are changes that have not been saved yet. Save them before opening another file." });
    else setProblem({ kind: "refused", reason: r.reason, error: r.error, offers: r.offers });
  };

  const handleBoot = (r: BootResult) => {
    if (r.state === "world") { setProblem(null); openWorld(r.world); }
    else if (r.state === "needs-permission") setProblem({ kind: "message", text: `Your browser needs your permission to read "${r.fileName}" again. Choose "Allow access" to continue.`, reconnect: true });
    else if (r.state === "recovery") setProblem({ kind: "recovery", fileRev: r.fileRev, mirrorRev: r.mirrorRev, world: r.world, mirrorWorld: r.mirrorWorld });
    else if (r.state === "refused") setProblem({ kind: "refused", reason: r.reason, error: r.error, offers: r.offers });
  };

  const guard = async (f: () => Promise<void>) => {
    setBusy(true);
    try { await f(); } catch (e) { setProblem({ kind: "message", text: `That did not work: ${String((e as Error)?.message ?? e)}` }); } finally { setBusy(false); }
  };

  const open = () => guard(async () => handleOpen(await getPersist().open()));
  const reconnect = () => guard(async () => handleBoot(await getPersist().reconnect()));
  const restore = (o: Offer) => guard(async () => handleOpen(await getPersist().restore(o)));

  const startupTrouble = !problem && (status.needsPermission || boot === "needs-permission" || boot === "recovery" || boot === "refused");

  return (
    <div className="flex min-h-screen justify-center bg-paper px-4 py-12 text-ink">
      <main className="flex w-full max-w-[580px] flex-col gap-5">
        <header className="flex items-center gap-4">
          <BrandMark className="h-14" />
          <div className="flex flex-col gap-0.5">
            <h1 className="font-display text-3xl font-semibold">Hi-School Scheduler</h1>
            <p className="text-sm text-muted">Nothing is placed until you decide it.</p>
          </div>
        </header>

        {startupTrouble && <StartupNote boot={boot} fileName={status.fileName} needsPermission={status.needsPermission || boot === "needs-permission"} busy={busy} onReconnect={reconnect} />}
        {problem && <ProblemNote problem={problem} busy={busy} onRestore={restore} onReconnect={reconnect} onPickRecovery={(w) => { getPersist().adopt(w).catch(() => {}); setProblem(null); openWorld(w); }} onDismiss={() => setProblem(null)} />}
        {status.error && <p role="alert" className="text-sm text-illegal">▲ {status.error}</p>}

        {screen.name === "home" && (
          <>
            <ol className="flex flex-col gap-3">
              <PathCard n={1} title="Open a schedule file" text="One you saved before.">
                <Btn tone="ink" disabled={busy} onClick={open}>Open a schedule file</Btn>
              </PathCard>
              <ImportCard busy={busy} setBusy={setBusy} onProblem={(t) => setProblem(t ? { kind: "message", text: t } : null)} onReady={(world, report, fileName, unused) => { setProblem(null); setScreen({ name: "import", world, report, fileName, unused }); }} />
              <PathCard n={3} title="Start a new schedule" text="With the Hi-School pharmacies, or empty.">
                <Btn disabled={busy} onClick={() => { setProblem(null); setScreen({ name: "new" }); }}>Start a new schedule</Btn>
              </PathCard>
            </ol>
            <p className="text-sm text-muted">
              Just looking around?{" "}
              <button type="button" className="underline underline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                onClick={() => { const { world } = practiceWorld(); openWorld(world, { fileName: "Practice.sqlite" }); }}>
                Try the practice month
              </button>
              {" or "}
              <button type="button" data-practice-problems className="underline underline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                onClick={() => { const { world, summary } = practiceWorldWithProblems(); openWorld(world, { fileName: "Practice with problems.sqlite" }); useApp.getState().say("info", `Practice month with problems: ${summary.join("; ")}.`); }}>
                one that already has problems to fix
              </button>
              . Everything in it is invented.
            </p>
          </>
        )}

        {screen.name === "import" && (
          <ImportReportView report={screen.report} unused={screen.unused} onBack={() => setScreen({ name: "home" })}
            onOpen={() => {
              openWorld(screen.world, { fileName: screen.fileName });
              getPersist().adopt(screen.world, screen.fileName).catch((e) => useApp.getState().say("error", `Could not keep a browser copy: ${String(e?.message ?? e)}`));
            }} />
        )}

        {screen.name === "new" && <NewScheduleCard onBack={() => setScreen({ name: "home" })} onCreate={(world, view) => {
          const fileName = "New schedule.sqlite";
          openWorld(world, { fileName, view });
          getPersist().adopt(world, fileName).catch((e) => useApp.getState().say("error", `Could not keep a browser copy: ${String(e?.message ?? e)}`));
        }} />}
      </main>
    </div>
  );
}

function PathCard({ n, title, text, children }: { n: number; title: string; text: string; children: ReactNode }) {
  return (
    <li className="surface flex items-center justify-between gap-4 p-4">
      <div className="flex gap-3">
        <span aria-hidden className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fill text-xs font-semibold">{n}</span>
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-sm text-muted">{text}</p>
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </li>
  );
}

// ---------- path 2: bring in a file from the old scheduler ----------

type OldDoc = { format: string; year: number; month: number; stores: unknown[]; people: unknown[] };

function checkOldFile(x: unknown): string | null {
  if (!x || typeof x !== "object") return "it is not a schedule file";
  const d = x as Partial<OldDoc>;
  if (d.format !== "hischool-schedule") return "it is not a Hi-School schedule file (its format is not hischool-schedule)";
  if (!Array.isArray(d.stores) || !Array.isArray(d.people)) return "it has no list of stores or people";
  if (!Number.isInteger(d.year) || !Number.isInteger(d.month) || d.month! < 1 || d.month! > 12) return "it has no valid month";
  return null;
}

function ImportCard({ busy, setBusy, onProblem, onReady }: { busy: boolean; setBusy: (b: boolean) => void; onProblem: (t: string | null) => void; onReady: (w: World, r: ImportReport, fileName: string, unused: { file: string; why: string }[]) => void }) {
  const input = useRef<HTMLInputElement>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      const docs: unknown[] = [];
      const unused: { file: string; why: string }[] = [];
      for (const f of Array.from(files)) {
        let parsed: unknown;
        try { parsed = JSON.parse(await f.text()); } catch { unused.push({ file: f.name, why: "it could not be read as a schedule file" }); continue; }
        const why = checkOldFile(parsed);
        if (why) unused.push({ file: f.name, why }); else docs.push(parsed);
      }
      if (!docs.length) {
        onProblem(`Nothing could be brought in. ${unused.map((u) => `${u.file}: ${u.why}.`).join(" ")}`);
        return;
      }
      try {
        const { world, report } = importPrototypeFiles(docs);
        onReady(world, report, "Imported schedule.sqlite", unused);
      } catch (e) {
        onProblem(`These files could not be brought in: ${String((e as Error)?.message ?? e)}`);
      }
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <PathCard n={2} title="Bring in a file from the old scheduler" text="Months saved by the old scheduler (.hisp.json).">
      <input ref={input} type="file" multiple accept=".json,application/json" data-testid="import-input" aria-label="Choose files from the old scheduler" className="sr-only" tabIndex={-1} onChange={(e) => onFiles(e.target.files)} />
      <Btn disabled={busy} onClick={() => input.current?.click()}>Choose old files</Btn>
    </PathCard>
  );
}

function ImportReportView({ report, unused, onOpen, onBack }: { report: ImportReport; unused: { file: string; why: string }[]; onOpen: () => void; onBack: () => void }) {
  const counts: [number, string, string][] = [
    [report.stores, "store", "stores"], [report.pharmacists, "pharmacist", "pharmacists"], [report.assignments, "shift placed", "shifts placed"],
    [report.unavailability, "time-off record", "time-off records"], [report.standing, "pattern", "patterns"], [report.travelPairs, "drive time", "drive times"],
  ];
  return (
    <section aria-label="What was brought in" className="surface flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-base font-semibold">Here is what was brought in</h2>
        <p className="text-sm text-muted">Months: {report.months.join(", ")}. Nothing has been changed in your old files.</p>
      </div>
      <ul aria-label="Counts" className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        {counts.map(([n, one, many]) => <li key={one}><span className="font-semibold">{n}</span> {n === 1 ? one : many}</li>)}
      </ul>
      {unused.length > 0 && (
        <ReportList title="Files that were not used" scroll items={unused.map((u) => `${u.file}: ${u.why}.`)} />
      )}
      <ReportList title={`Left out (${report.skipped.length})`} empty="Nothing was left out." scroll items={report.skipped.map((s) => `${s.what}: ${s.why}.`)} />
      {report.dropped.length > 0 && <ReportList title="Not carried over (no home for it yet)" items={report.dropped} />}
      <ReportList title="Choices made for you" items={report.assumptions} />
      <div className="flex gap-2">
        <Btn tone="ink" onClick={onOpen}>Open it</Btn>
        <Btn tone="ghost" onClick={onBack}>Back</Btn>
      </div>
    </section>
  );
}

function ReportList({ title, items, empty, scroll }: { title: string; items: string[]; empty?: string; scroll?: boolean }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {items.length === 0 ? <p className="text-sm text-muted">{empty}</p> : (
        <ul {...(scroll ? { tabIndex: 0 } : {})} aria-label={title} className={`mt-1 list-disc pl-5 text-sm focus-visible:outline-2 focus-visible:outline-ink ${scroll ? "max-h-64 overflow-y-auto" : ""}`}>
          {items.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      )}
    </div>
  );
}

// ---------- path 3: new schedule ----------

function NewScheduleCard({ onCreate, onBack }: { onCreate: (w: World, view: "setup") => void; onBack: () => void }) {
  const [start, setStart] = useState<"hischool" | "empty">("hischool");
  const [state, setState] = useState<string>("");
  const starter = hischoolStarter();
  return (
    <section aria-label="Start a new schedule" className="surface flex flex-col gap-4 p-4">
      <h2 className="text-base font-semibold">Start a new schedule</h2>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Which stores?</legend>
        <label className="flex items-start gap-2 text-sm"><input type="radio" name="start" className="mt-1" checked={start === "hischool"} onChange={() => setStart("hischool")} />
          <span><span className="font-semibold">Use the Hi-School pharmacies</span><br /><span className="text-muted">{starter.stores.length} stores with their states and the measured drive times between them. You add the pharmacists.</span></span></label>
        <label className="flex items-start gap-2 text-sm"><input type="radio" name="start" className="mt-1" checked={start === "empty"} onChange={() => setStart("empty")} />
          <span><span className="font-semibold">Start empty</span><br /><span className="text-muted">No stores and no people. You add them in Setup.</span></span></label>
      </fieldset>
      {start === "empty" && (
        <div className="flex flex-col gap-1">
          <label htmlFor="new-state" className="text-xs font-semibold text-muted">State for new stores</label>
          <select id="new-state" value={state} onChange={(e) => setState(e.target.value)} className="h-8 w-56 rounded-md border border-edge bg-white px-2 text-sm">
            <option value="">Not recorded</option><option value="OR">Oregon (OR)</option><option value="WA">Washington (WA)</option>
          </select>
          <p className="text-xs text-muted">{state ? "New stores in Setup start with this state. You can change it per store." : "With no state recorded, licensing is not checked at that store."}</p>
        </div>
      )}
      <div className="flex gap-2">
        <Btn tone="ink" onClick={() => {
          setupDefaults.state = start === "empty" && state ? (state as StateCode) : null;
          onCreate(start === "hischool" ? newWorld(starter) : newWorld(), "setup");
        }}>Create and go to Setup</Btn>
        <Btn tone="ghost" onClick={onBack}>Back</Btn>
      </div>
    </section>
  );
}

// ---------- start-up trouble ----------

function StartupNote({ boot, fileName, needsPermission, busy, onReconnect }: { boot: string | undefined; fileName: string | null; needsPermission: boolean; busy: boolean; onReconnect: () => void }) {
  return (
    <div role="status" className="surface accent-away flex flex-col gap-2 p-4">
      {needsPermission ? (
        <p className="text-sm">Your last schedule{fileName ? ` ("${fileName}")` : ""} is saved on this computer, and your browser needs your permission to read it again.</p>
      ) : (
        <p className="text-sm">Your last schedule could not be opened on its own{boot === "recovery" ? ": the saved file and the copy kept in this browser do not agree" : boot === "refused" ? ": something in it looked wrong" : ""}. Nothing has been changed.</p>
      )}
      <div><Btn tone="ink" disabled={busy} onClick={onReconnect}>{needsPermission ? "Allow access" : "Look at it again"}</Btn></div>
    </div>
  );
}

function ProblemNote({ problem, busy, onRestore, onReconnect, onPickRecovery, onDismiss }: { problem: Problem; busy: boolean; onRestore: (o: Offer) => void; onReconnect: () => void; onPickRecovery: (w: World) => void; onDismiss: () => void }) {
  if (problem.kind === "message") {
    return (
      <div role="alert" className="surface accent-away flex items-start justify-between gap-3 p-4">
        <p className="text-sm">{problem.text}</p>
        <div className="flex shrink-0 gap-2">
          {problem.reconnect && <Btn tone="ink" disabled={busy} onClick={onReconnect}>Allow access</Btn>}
          <Btn tone="ghost" onClick={onDismiss}>Dismiss</Btn>
        </div>
      </div>
    );
  }
  if (problem.kind === "recovery") {
    return (
      <div role="alert" className="surface accent-problem flex flex-col gap-2 p-4">
        <p className="text-sm font-semibold">The saved file and this browser's copy are different.</p>
        <p className="text-sm text-muted">Choose which one to keep working from. The other one is not deleted.</p>
        <div className="flex flex-wrap gap-2">
          <Btn tone="ink" onClick={() => onPickRecovery(problem.world)}>Use the saved file (revision {problem.fileRev})</Btn>
          <Btn onClick={() => onPickRecovery(problem.mirrorWorld)}>Use this browser's copy (revision {problem.mirrorRev})</Btn>
          <Btn tone="ghost" onClick={onDismiss}>Neither for now</Btn>
        </div>
      </div>
    );
  }
  return (
    <div role="alert" className="surface accent-problem flex flex-col gap-2 p-4">
      <p className="text-sm font-semibold">That file could not be opened.</p>
      <p className="text-sm">{problem.reason}</p>
      {problem.error && <p className="text-xs text-muted">{problem.error}</p>}
      {problem.offers.length > 0 && <p className="text-sm text-muted">These earlier copies can be brought back instead:</p>}
      <div className="flex flex-wrap gap-2">
        {problem.offers.map((o, i) => <Btn key={i} tone={i === 0 ? "ink" : "quiet"} disabled={busy} onClick={() => onRestore(o)}>{offerWords(o)}</Btn>)}
        <Btn tone="ghost" onClick={onDismiss}>Dismiss</Btn>
      </div>
    </div>
  );
}
