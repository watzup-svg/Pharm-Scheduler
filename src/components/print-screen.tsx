import { useStoreTag } from "@/components/use-store-tag";
import { ChevronDown, ChevronLeft, ChevronRight, FileDown, Printer } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { announce } from "@/components/undo";
import { confirmAction } from "@/components/confirm";
import { changesSince } from "@/lib/schedule/changes";
import { monthKey } from "@/lib/schedule/archive";
import { readPrinted } from "@/components/print-extras";
import { BADGE_DATA_URL } from "@/components/brand-mark";
import { SendSchedules, SinceLastPrint } from "@/components/print-extras";
import { LetterSheet, TwoUpSheet } from "@/components/letter-sheet";
import { Button } from "@/components/ui/button";
import { AlarmMark } from "@/components/marks";
import { Count, HeroLead, PageStrip } from "@/components/page-strip";
import { PaperStack } from "@/components/hero-graphics";
import { Mark } from "@/components/icons";
import { usePrintStatus } from "@/components/use-print-status";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useShowOnSchedule } from "@/components/use-show-on-schedule";
import { sortPeopleByHome, stepRef } from "@/lib/schedule/fix";
import { stateName, stateOfStore, statesInUse } from "@/lib/schedule/hints";
import { ProblemRow } from "@/components/problem-row";
import { printGate, scopeSteps } from "@/lib/schedule/gate";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { isRphRole } from "@/lib/schedule/slots";
import {
  downloadPack,
  downloadPdf,
  packFileName,
  printBlob,
  printPdf,
  packBlob,
  type DrawOpts,
} from "@/lib/schedule/pdf";
import {
  buildDistrictSheet,
  cleanModel,
  buildEmployeeCalendar,
  buildStorePoster,
  packPageCount,
  packPages,
  type PrintModel,
} from "@/lib/schedule/print-model";
import { cn } from "@/lib/utils";
import { useScheduleStore } from "@/store/schedule-store";
import { useViewStore } from "@/store/view-store";
import { PROBLEM_KINDS, PROBLEM_NAME } from "@/lib/schedule/problem-kinds";

type Mode = "store" | "employee" | "district";

/** The "problems elsewhere" notice is shown once per session (until the page is reloaded). */
let acknowledgedElsewhere = false;

export function PrintScreen() {
  const tag = useStoreTag();
  const doc = useScheduleStore((s) => s.doc);
  const setPrintPrefs = useScheduleStore((s) => s.setPrintPrefs);
  const recordPrinted = useScheduleStore((s) => s.recordPrinted);
  const acceptAllOpen = useScheduleStore((s) => s.acceptAllOpen);
  const [printedVersion, setPrintedVersion] = useState(0);
  const ev = useScheduleStore((s) => s.evaluation);
  const gate = useMemo(() => printGate(doc, ev), [doc, ev]);
  const steps = gate.steps;
  const printStatus = usePrintStatus();
  const badStores = new Set(steps.flatMap((st) => [st.store, ...st.stores]));
  const badPeople = new Set(steps.flatMap((st) => st.names));
  const showOnSchedule = useShowOnSchedule();
  const prefs = doc.printPrefs;
  const [mode, setMode] = useState<Mode>("store");
  const [storeCode, setStoreCode] = useState(doc.stores[0]?.code ?? "");
  const rphNames = doc.people.filter((p) => isRphRole(p.role)).map((p) => p.name);
  const peopleList = sortPeopleByHome(doc, rphNames);
  const [personName, setPersonName] = useState(peopleList[0] ?? "");
  const [pickedStores, setPickedStores] = useState<string[]>(doc.stores.map((s) => s.code));
  const [pickedPeople, setPickedPeople] = useState<string[]>(() =>
    doc.people.filter((p) => isRphRole(p.role)).map((p) => p.name),
  );
  const [pageId, setPageId] = useState<string | null>(null);
  const [choose, setChoose] = useState(false);
  const [onePageOpen, setOnePageOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  // The picks belong to one month's stores and people. When those change (a file was opened, the demo
  // loaded, next month started) start again from "everything" so nothing is left out of the pack.
  const rosterKey = doc.stores.map((x) => x.code).join("|") + "#" + rphNames.join("|");
  useEffect(() => {
    setPickedStores(doc.stores.map((x) => x.code));
    setPickedPeople(rphNames);
    setStoreCode((cur) => (doc.stores.some((x) => x.code === cur) ? cur : (doc.stores[0]?.code ?? "")));
    setPersonName((cur) => (rphNames.includes(cur) ? cur : (rphNames[0] ?? "")));
    setPageId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosterKey]);
  const printTarget = useViewStore((s) => s.printTarget);
  const setPrintTarget = useViewStore((s) => s.setPrintTarget);

  // "Print this store" and "Print calendar" land here with one page already chosen.
  useEffect(() => {
    if (!printTarget) return;
    if (printTarget.kind === "store") {
      setMode("store");
      setStoreCode(printTarget.id);
    } else {
      setMode("employee");
      setPersonName(printTarget.id);
    }
    setPrintTarget(null);
    setOnePageOpen(true);
    window.setTimeout(() => document.getElementById("one-page")?.scrollIntoView({ block: "start" }), 50);
  }, [printTarget, setPrintTarget]);

  const states = statesInUse(doc);
  const groups = [
    ...states.map((code) => ({ code, label: stateName(code), stores: doc.stores.filter((s) => stateOfStore(s) === code) })),
    { code: "", label: "Other", stores: doc.stores.filter((s) => !stateOfStore(s)) },
  ].filter((g) => g.stores.length);

  // A clean copy is a choice for this print only; it is not saved in the file.
  const [clean, setClean] = useState(false);

  const singleModel: PrintModel | null = useMemo(() => {
    const m = mode === "store" ? buildStorePoster(doc, storeCode) : mode === "district" ? buildDistrictSheet(doc) : buildEmployeeCalendar(doc, personName);
    return m && clean ? cleanModel(m) : m;
  }, [doc, mode, storeCode, personName, clean]);

  const packModels = useMemo(() => {
    const snap = readPrinted(monthKey(doc.year, doc.month));
    const changedStores = new Set(Object.keys(changesSince(doc, snap).stores));
    const district = buildDistrictSheet(doc);
    const stores = pickedStores
      .map((c) => buildStorePoster(doc, c))
      .filter((m): m is NonNullable<typeof m> => Boolean(m))
      .map((m) => (changedStores.has(m.code) ? { ...m, revised: true } : m));
    const people = sortPeopleByHome(doc, pickedPeople)
      .map((n) => buildEmployeeCalendar(doc, n))
      .filter((m): m is NonNullable<typeof m> => Boolean(m));
    const all = [district, ...stores, ...people];
    return clean ? all.map((m) => cleanModel(m)) : all;
  }, [doc, pickedStores, pickedPeople, clean]);

  const pages = useMemo(() => packPages(packModels, prefs.twoUp), [packModels, prefs.twoUp]);
  const active = pages.find((p) => p.id === pageId) ?? pages[0] ?? null;
  const pageTotal = packPageCount(pickedStores.length, pickedPeople.length, prefs.twoUp, true);
  const blocked = gate.blocked;
  /** Accept every problem that can be accepted. Shifts with no coverage are asked about first; the rest are held to confirm. */
  async function leaveAllAsIs() {
    const acceptable = steps.filter((st) => st.kind !== "license");
    const holes = acceptable.filter((st) => st.kind === "hole").length;
    if (holes) {
      const ok = await confirmAction({
        title: `Print with ${holes} ${holes === 1 ? "shift" : "shifts"} with no coverage?`,
        body: breakdown(acceptable),
        effects: ["They print with no one named on those days and are listed on the district page."],
        confirmLabel: "Leave as is",
        note: "You can undo this afterwards.",
      });
      if (!ok) return;
    }
    const n = acceptAllOpen();
    announce(`Left ${n} ${n === 1 ? "problem" : "problems"} as is. They’re listed on the district page.`);
  }

  const opts: DrawOpts = { ...prefs, draft: blocked, logo: BADGE_DATA_URL };
  const packName = packFileName(doc.year, doc.month);
  const homeOf = new Map(doc.people.map((p) => [p.name, p.home]));

  function runPack(kind: "print" | "save") {
    if (blocked) return;
    if (!packModels.length) {
      toast.error("Choose at least one store or pharmacist.");
      return;
    }
    try {
      if (kind === "save") downloadPack(packModels, packName, opts);
      else printBlob(packBlob(packModels, opts));
      recordPrinted(pickedStores);
      setPrintedVersion((v) => v + 1);
      toast.success(kind === "save" ? `Saved ${packName}` : "Sent the pack to the printer.");
    } catch {
      toast.error("Could not make the PDF.");
    }
  }

  // One page: only problems that touch this store or pharmacist hold it back. Problems elsewhere need an acknowledgement.
  const { own: ownSteps, other: otherSteps } = useMemo(
    () => (mode === "district" ? { own: [], other: [] } : scopeSteps(steps, mode === "store" ? { kind: "store", code: storeCode } : { kind: "person", name: personName })),
    [steps, mode, storeCode, personName],
  );
  const singleBlocked = ownSteps.length > 0;
  const [ackFor, setAckFor] = useState<"print" | "save" | null>(null);

  function askSingle(kind: "print" | "save") {
    if (singleBlocked || !singleModel) return;
    if (otherSteps.length && !acknowledgedElsewhere) setAckFor(kind);
    else runSingle(kind);
  }

  function runSingle(kind: "print" | "save") {
    if (singleBlocked || !singleModel) return;
    try {
      // The district page is the problem list itself, so it may print while problems are open; then it is marked as a draft.
      const draft = mode === "district" && steps.length > 0;
      if (kind === "save") downloadPdf(singleModel, { ...opts, draft });
      else printPdf(singleModel, { ...opts, draft });
      if (mode === "store") {
        recordPrinted([storeCode]);
        setPrintedVersion((v) => v + 1);
      }
      toast.success(kind === "save" ? `Saved ${singleModel.filename}` : "Sent the page to the printer.");
    } catch {
      toast.error("Could not make the PDF.");
    }
  }

  const everything = pickedStores.length === doc.stores.length && pickedPeople.length === rphNames.length;
  const onlyState = groups.find((g) => g.code && g.stores.length === pickedStores.length && g.stores.every((x) => pickedStores.includes(x.code)))?.code ?? "";

  function pickEverything() {
    setPickedStores(doc.stores.map((x) => x.code));
    setPickedPeople(rphNames);
  }

  function pickState(code: string) {
    const g = groups.find((x) => x.code === code);
    if (!g) return;
    const codes = g.stores.map((x) => x.code);
    setPickedStores(codes);
    setPickedPeople(rphNames.filter((n) => codes.includes(homeOf.get(n) ?? "")));
  }

  function toggleStore(code: string) {
    setPickedStores((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }

  function togglePerson(name: string) {
    setPickedPeople((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  }

  const PRINT_KIND = PROBLEM_NAME;
  const firstStep = steps[0] ?? null;
  const leavable = steps.filter((st) => st.kind !== "license");
  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-4 py-4 sm:px-6 lg:py-6">
      <PageStrip
        title="Print"
        lead={
          <HeroLead n={steps.length} tone="bad" done={!steps.length} tip={steps.length ? `${steps.length} ${steps.length === 1 ? "problem" : "problems"} to fix | ${steps[0]?.headline ?? ""}` : "Ready to print | Nothing left to fix"} onClick={firstStep ? () => showOnSchedule(stepRef(firstStep), true) : undefined} />
        }
        tiles={
          <>
            {PROBLEM_KINDS.map((k) => {
              const list = steps.filter((st) => st.kind === k);
              return list.length ? (
                <Count key={k} tone="bad" n={list.length} tip={`${PRINT_KIND[k]} · ${list.length} | ${list[0]!.headline}`} onClick={() => showOnSchedule(stepRef(list[0]!), true)}>
                  <AlarmMark kind={k} size={28} tip={false} onDark />
                </Count>
              ) : null;
            })}
          </>
        }
        actions={
          <>
            {blocked && firstStep ? (
              <Button type="button" variant="light" onClick={() => showOnSchedule(stepRef(firstStep), true)}>
                Fix
                <ChevronRight />
              </Button>
            ) : null}
            {blocked && leavable.length ? (
              <Button type="button" variant="lightGhost" onClick={() => void leaveAllAsIs()}>
                Leave {leavable.length} as is
              </Button>
            ) : null}
            <span data-tip={blocked ? `Fix or leave the ${steps.length} problems first | Then the pack can print` : `Print the whole pack | ${pageTotal} pages`} className="inline-flex">
              <Button type="button" variant={blocked ? "lightGhost" : "light"} disabled={blocked || !packModels.length} onClick={() => runPack("print")}>
                <Printer />
                Print · {pageTotal} pages
              </Button>
            </span>
            <Button type="button" variant="lightGhost" disabled={blocked || !packModels.length} onClick={() => runPack("save")}>
              <FileDown />
              Save PDF
            </Button>
          </>
        }
        graphic={<PaperStack pages={pageTotal} flagged={pickedStores.map((c) => steps.some((st) => st.store === c || st.stores.includes(c)))} tip={`Pages · ${pageTotal} | The district page, ${pickedStores.length} store posters, ${pickedPeople.length} pharmacist calendars`} />}
      />

      <SinceLastPrint
        doc={doc}
        version={printedVersion}
        onlyChanged={(stores, people) => {
          setPickedStores(stores);
          setPickedPeople(people);
          toast.success("Chosen: only the pages that changed. The district page is always included.");
        }}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[21rem_minmax(0,1fr)]">
        <section aria-label="Options" className="surface flex flex-col gap-4 p-4 sm:p-5">
          <button
            type="button"
            role="switch"
            aria-checked={clean}
            title="A copy to hand out with names and days only: no warnings, colors or notes. Only for this print."
            onClick={() => setClean(!clean)}
            className={cn("hs-select flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-sm font-semibold", clean ? "bg-ink text-white" : "bg-cream ring-1 ring-edge")}
          >
            <span className="inline-flex items-center gap-2">
              <Mark icon="clean" tip={false} className="size-4" />
              Clean copy
            </span>
            <span className="text-xs font-bold tracking-wide uppercase">{clean ? "On" : "Off"}</span>
          </button>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Paper</Label>
              <div className="mt-1 flex gap-1">
                <SegBtn active={prefs.paper === "letter"} onClick={() => setPrintPrefs({ paper: "letter" })}>Letter</SegBtn>
                <SegBtn active={prefs.paper === "tabloid"} onClick={() => setPrintPrefs({ paper: "tabloid" })}>Tabloid</SegBtn>
              </div>
            </div>
            <div>
              <Label>Type</Label>
              <div className="mt-1 flex gap-1">
                <SegBtn active={prefs.typeSize === "normal"} onClick={() => setPrintPrefs({ typeSize: "normal" })}>Normal</SegBtn>
                <SegBtn active={prefs.typeSize === "large"} onClick={() => setPrintPrefs({ typeSize: "large" })}>Large</SegBtn>
              </div>
            </div>
          </div>

          <div className="flex flex-col">
            {(
              [
                ["grayscale", "Grayscale"],
                ["twoUp", "Two calendars per letter"],
                ["punch", "3-hole punch margin"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex h-11 items-center gap-2 text-sm">
                <input type="checkbox" className="size-5 accent-ink" checked={prefs[key]} onChange={(e) => setPrintPrefs({ [key]: e.target.checked })} />
                {label}
              </label>
            ))}
          </div>

        <div className="mt-4 border-t border-line pt-3">
          <button
            type="button"
            aria-expanded={choose}
            onClick={() => setChoose(!choose)}
            className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-sm font-semibold"
          >
            <span>Choose pages{everything ? "" : " · custom"}</span>
            <ChevronDown className={cn("size-4 transition-transform", choose && "rotate-180")} />
          </button>
          {choose ? (
            <div>
              <div className="mt-1 flex flex-wrap gap-2" role="group" aria-label="Presets">
                <SegBtn active={everything} onClick={pickEverything}>
                  Everything
                </SegBtn>
                {groups.filter((g) => g.code && groups.filter((x) => x.code).length > 1).map((g) => (
                  <SegBtn key={g.code} active={onlyState === g.code} onClick={() => pickState(g.code)}>
                    {g.label} only
                  </SegBtn>
                ))}
              </div>
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <label className="flex h-11 items-center gap-2">
            <input
              type="checkbox"
              className="size-5 accent-ink"
              checked={pickedStores.length === doc.stores.length && doc.stores.length > 0}
              onChange={() =>
                setPickedStores(
                  pickedStores.length === doc.stores.length ? [] : doc.stores.map((s) => s.code),
                )
              }
            />
            All stores ({doc.stores.length})
          </label>
          <label className="flex h-11 items-center gap-2">
            <input
              type="checkbox"
              className="size-5 accent-ink"
              checked={pickedPeople.length === peopleList.length && peopleList.length > 0}
              onChange={() =>
                setPickedPeople(pickedPeople.length === peopleList.length ? [] : [...peopleList])
              }
            />
            All pharmacists ({peopleList.length})
          </label>
        </div>

        <div className="mt-3 grid gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            {groups.map((g) => {
              const codes = g.stores.map((s) => s.code);
              const all = codes.every((c) => pickedStores.includes(c));
              const some = codes.some((c) => pickedStores.includes(c));
              return (
                <fieldset key={g.code || "other"} className="flex flex-col">
                  <legend className="sr-only">{g.label}</legend>
                  <label className="flex h-11 items-center gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      className="size-5 accent-ink"
                      checked={all}
                      ref={(el) => {
                        if (el) el.indeterminate = some && !all;
                      }}
                      onChange={() =>
                        setPickedStores((prev) =>
                          all ? prev.filter((c) => !codes.includes(c)) : [...new Set([...prev, ...codes])],
                        )
                      }
                    />
                    {g.label} ({g.stores.length})
                  </label>
                  <ul className="grid gap-0.5 pl-6">
                    {g.stores.map((s) => (
                      <li key={s.code}>
                        <label className="flex h-11 items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="size-5 accent-ink"
                            checked={pickedStores.includes(s.code)}
                            onChange={() => toggleStore(s.code)}
                          />
                          <span className="font-medium">{tag(s.code)}</span>
                          <span className="min-w-0 truncate text-muted">{s.name}</span>
                          <PageStatus problem={badStores.has(s.code)} changed={printStatus.stores.has(s.code)} />
                        </label>
                      </li>
                    ))}
                  </ul>
                </fieldset>
              );
            })}
          </div>
          <ul className="grid gap-1">
            {peopleList.map((name) => (
              <li key={name}>
                <label className="flex h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-5 accent-ink"
                    checked={pickedPeople.includes(name)}
                    onChange={() => togglePerson(name)}
                  />
                  <span className="font-medium">{name}</span>
                  <span className="text-muted">{homeOf.get(name) ? tag(homeOf.get(name)!) : "—"}</span>
                  <PageStatus problem={badPeople.has(name)} changed={printStatus.people.has(name)} />
                </label>
              </li>
            ))}
          </ul>
        </div>

            </div>
          ) : null}
        </div>
        </section>

        <div className="flex min-w-0 flex-col gap-3">
          {active ? (
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Preview page">
              <Button type="button" variant="secondary" size="icon" aria-label="Previous page" disabled={pages.indexOf(active) <= 0} onClick={() => setPageId(pages[pages.indexOf(active) - 1]?.id ?? null)}>
                <ChevronLeft />
              </Button>
              <NativeSelect aria-label="Preview page" id="pack-page" className="min-w-0 flex-1" value={active.id} onChange={(e) => setPageId(e.target.value)}>
                {pages.map((pg) => (
                  <option key={pg.id} value={pg.id}>
                    {pg.kicker} · {pg.label}
                  </option>
                ))}
              </NativeSelect>
              <Button type="button" variant="secondary" size="icon" aria-label="Next page" disabled={pages.indexOf(active) >= pages.length - 1} onClick={() => setPageId(pages[pages.indexOf(active) + 1]?.id ?? null)}>
                <ChevronRight />
              </Button>
            </div>
          ) : null}
          {active ? (
            <FitWidth label="Page preview">
              {active.kind === "twoUp" ? (
                <TwoUpSheet a={active.a} b={active.b} draft={blocked} grayscale={prefs.grayscale} punch={prefs.punch} />
              ) : (
                <LetterSheet model={active.model} draft={blocked} paper={prefs.paper} grayscale={prefs.grayscale} punch={prefs.punch} />
              )}
            </FitWidth>
          ) : (
            <p className="text-sm text-muted">Choose at least one store or pharmacist to preview.</p>
          )}
        </div>
      </div>

      <details id="one-page" open={onePageOpen} onToggle={(e) => setOnePageOpen((e.currentTarget as HTMLDetailsElement).open)} className="group surface scroll-mt-16">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 sm:px-5 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block text-base font-semibold">Just one page</span>
          </span>
          <ChevronDown aria-hidden className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-line p-4 sm:p-5">

        <div className="mt-3 flex flex-wrap gap-2">
          <SegBtn active={mode === "store"} onClick={() => setMode("store")}>
            Store poster
          </SegBtn>
          <SegBtn active={mode === "employee"} onClick={() => setMode("employee")}>
            Employee calendar
          </SegBtn>
          <SegBtn active={mode === "district"} onClick={() => setMode("district")}>
            District page
          </SegBtn>
        </div>
        <div className="mt-3 max-w-sm">
          {mode === "store" ? (
            <>
              <Label htmlFor="one-store">Store</Label>
              <NativeSelect id="one-store" value={storeCode} onChange={(e) => setStoreCode(e.target.value)}>
                {doc.stores.map((s) => (
                  <option key={s.code} value={s.code}>
                    {tag(s.code)} · {s.name}
                  </option>
                ))}
              </NativeSelect>
            </>
          ) : mode === "district" ? (
            <p className="text-sm text-muted">The one-page list of who covers what. It can print while problems are open, marked as a draft.</p>
          ) : (
            <>
              <Label htmlFor="one-person">Employee</Label>
              <NativeSelect id="one-person" value={personName} onChange={(e) => setPersonName(e.target.value)}>
                {peopleList.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </NativeSelect>
            </>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={singleBlocked || !singleModel} onClick={() => askSingle("print")}>
            <Printer />
            Print
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={singleBlocked || !singleModel}
            onClick={() => askSingle("save")}
          >
            <FileDown />
            Save PDF
          </Button>
        </div>
        {singleBlocked ? (
          <div className="mt-3 flex flex-col gap-2 text-sm" role="status">
            <p className="font-semibold text-illegal">
              {mode === "store" ? "This store has" : `${personName} has`} {ownSteps.length === 1 ? "a problem" : `${ownSteps.length} problems`} to fix first:
            </p>
            <ul className="flex flex-col gap-2">
              {ownSteps.slice(0, 3).map((step) => (
                <li key={`${step.kind}|${step.store}|${step.day}|${step.names.join()}`}>
                  <ProblemRow step={step} onClick={() => showOnSchedule(stepRef(step), true)} />
                </li>
              ))}
            </ul>
          </div>
        ) : otherSteps.length ? (
          <p className="mt-3 text-sm text-muted">
            This {mode === "store" ? "store" : "pharmacist"} is clear. {otherSteps.length} {otherSteps.length === 1 ? "problem" : "problems"} elsewhere won’t stop it. You’ll be asked to confirm once.
          </p>
        ) : null}
              </div>
      </details>

      <details open={sendOpen} onToggle={(e) => setSendOpen((e.currentTarget as HTMLDetailsElement).open)} className="group surface">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 sm:px-5 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block text-base font-semibold">Send someone their schedule</span>
          </span>
          <ChevronDown aria-hidden className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-line">
          <SendSchedules doc={doc} names={peopleList} />
        </div>
      </details>

      <Dialog open={ackFor !== null} onOpenChange={(o) => !o && setAckFor(null)}>
        <DialogContent
          title="Problems remain elsewhere"
          description={`${otherSteps.length} open ${otherSteps.length === 1 ? "problem" : "problems"} on other ${otherSteps.length === 1 ? "page" : "pages"}. This ${mode === "store" ? "store" : "calendar"} is clear.`}
        >
          <ul className="flex flex-col gap-2 text-sm">
            {otherSteps.slice(0, 4).map((step) => (
              <li key={`${step.kind}|${step.store}|${step.day}|${step.names.join()}`} className="rounded-lg bg-paper px-3 py-2 ring-1 ring-line">
                {step.headline}
              </li>
            ))}
          </ul>
          {otherSteps.length > 4 ? <p className="mt-2 text-sm text-muted">and {otherSteps.length - 4} more.</p> : null}
          <p className="mt-3 text-sm text-muted">Printing this page doesn’t change them. You won’t be asked again until you reload.</p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAckFor(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                const kind = ackFor;
                acknowledgedElsewhere = true;
                setAckFor(null);
                if (kind) runSingle(kind);
              }}
            >
              {ackFor === "save" ? "Save" : "Print"} this page
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Shrinks the page preview to the width it has, so the whole poster can be checked on a phone. */
function FitWidth({ children, label }: { children: React.ReactNode; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fit = () => {
      const b = box.current;
      const i = inner.current;
      if (!b || !i) return;
      i.style.zoom = "1";
      const natural = i.scrollWidth;
      i.style.zoom = natural > b.clientWidth ? String(Math.max(0.3, (b.clientWidth - 2) / natural)) : "1";
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (box.current) ro.observe(box.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  });
  return (
    <div ref={box} className="overflow-x-auto" tabIndex={0} role="region" aria-label={`${label}, shrunk to fit`}>
      <div ref={inner}>{children}</div>
    </div>
  );
}

function SegBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-11 items-center rounded-md px-3 text-sm font-semibold",
        active ? "bg-ink text-cream" : "bg-cream text-ink ring-1 ring-edge hover:bg-paper",
      )}
    >
      {children}
    </button>
  );
}

/** "4 shifts with no coverage, 3 names on closed days" for the accept-all note. */
function breakdown(steps: { kind: string }[]): string {
  const n = (k: string) => steps.filter((s) => s.kind === k).length;
  const parts = [
    n("hole") ? `${n("hole")} ${n("hole") === 1 ? "shift" : "shifts"} with no coverage` : "",
    n("double") ? `${n("double")} ${n("double") === 1 ? "person" : "people"} at two stores` : "",
    n("leftover") ? `${n("leftover")} ${n("leftover") === 1 ? "name" : "names"} on closed days` : "",
  ].filter(Boolean);
  return parts.join(", ");
}

/** A tick when the page is clear, a warning when it isn’t, and a pencil when it changed after it was last printed. */
function PageStatus({ problem, changed }: { problem: boolean; changed: boolean }) {
  return (
    <span className="ml-auto inline-flex items-center gap-2">
      {changed ? <Mark icon="changed" label="Changed since printed" className="text-warn" /> : null}
      {problem ? <Mark icon="problem" label="Has a problem" className="text-illegal" /> : <Mark icon="clean" label="No problems" className="text-ok" />}
    </span>
  );
}
