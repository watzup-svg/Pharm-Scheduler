import { Check, ChevronDown, CircleHelp, Copy, FilePlus2, FlaskConical, FolderOpen, History, Redo2, RotateCcw, Save, Table2, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { confirmAction } from "@/components/confirm";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { announce, undoLast, useActionLog } from "@/components/undo";
import { historyEntries } from "@/lib/schedule/history";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { loadArchive, type ArchiveEntry } from "@/lib/schedule/archive";
import { loadBackups, type Backup } from "@/lib/schedule/backup";
import { MONTH_NAMES } from "@/lib/schedule/calendar";
import { csvFileName, gridCsv } from "@/lib/schedule/csv";
import { downloadText } from "@/lib/schedule/file";
import { useScheduleStore } from "@/store/schedule-store";
import { useViewStore } from "@/store/view-store";

function clock(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Undo, Save, and File (Open lives here with Save as, CSV, autosave and sample). */
export function FileMenu() {
  const navigate = useNavigate();
  const lastMessage = useActionLog((s) => s.entries[s.entries.length - 1]?.message ?? "");
  const undoStack = useScheduleStore((s) => s.undoStack);
  const [historyOpen, setHistoryOpen] = useState(false);
  const dirty = useScheduleStore((s) => s.dirty);
  const doc = useScheduleStore((s) => s.doc);
  const steps = useMemo(() => (historyOpen ? historyEntries(undoStack, doc) : []), [historyOpen, undoStack, doc]);
  const canUndo = useScheduleStore((s) => s.undoStack.length > 0);
  const openFile = useScheduleStore((s) => s.openFile);
  const saveFile = useScheduleStore((s) => s.saveFile);
  const loadSample = useScheduleStore((s) => s.loadSample);
  const startWithAllStores = useScheduleStore((s) => s.startWithAllStores);
  const loadDemo = useScheduleStore((s) => s.loadDemo);
  const fileName = useScheduleStore((s) => s.fileName);
  const handle = useScheduleStore((s) => s.handle);
  const lastSavedAt = useScheduleStore((s) => s.lastSavedAt);
  const lastAutosaveAt = useScheduleStore((s) => s.lastAutosaveAt);
  const savedTo = useScheduleStore((s) => s.savedTo);
  const autoFileSave = useScheduleStore((s) => s.autoFileSave);
  const setAutoFileSave = useScheduleStore((s) => s.setAutoFileSave);
  const restoreBackup = useScheduleStore((s) => s.restoreBackup);
  const [backupsOpen, setBackupsOpen] = useState(false);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [monthsOpen, setMonthsOpen] = useState(false);
  const [months, setMonths] = useState<ArchiveEntry[]>([]);
  const openArchived = useScheduleStore((s) => s.openArchived);
  const redo = useScheduleStore((s) => s.redo);
  const textLarge = useViewStore((s) => s.textLarge);
  const setTextLarge = useViewStore((s) => s.setTextLarge);
  const highContrast = useViewStore((s) => s.highContrast);
  const setIconGuideOpen = useViewStore((s) => s.setIconGuideOpen);
  const setHighContrast = useViewStore((s) => s.setHighContrast);

  async function onOpen() {
    if (dirty && !(await confirmAction({ title: "Open another file?", body: "This month has changes that aren’t saved to a file.", effects: ["Those unsaved changes are lost if you open another file."], confirmLabel: "Open another file", tone: "danger", note: "Tip: Cancel, then use Save first." }))) return;
    const result = await openFile();
    if (result === "opened") toast.success("Opened schedule");
    if (result === "error") toast.error("Could not open that file");
  }

  async function onSave(saveAs = false) {
    const result = await saveFile(saveAs);
    if (result === "saved") {
      const st = useScheduleStore.getState();
      toast.success(st.savedTo === "file" ? `Saved to ${st.fileName}` : `Downloaded ${st.fileName}`);
    }
    if (result === "error") toast.error("Could not save");
  }

  async function onSample() {
    if (dirty && !(await confirmAction({ title: "Replace this month with the September sample?", effects: ["The month on screen is replaced.", "Unsaved changes are lost."], confirmLabel: "Replace with sample", tone: "danger", note: "A backup of the current month is kept under File → Restore from a backup." }))) return;
    loadSample();
    toast.success("Loaded September 2026 sample");
  }

  async function onDemo() {
    if (dirty && !(await confirmAction({ title: "Replace this month with the practice month?", body: "The practice month has planted mistakes for you to find and fix.", effects: ["The month on screen is replaced.", "Unsaved changes are lost."], confirmLabel: "Replace with practice month", tone: "danger", note: "A backup of the current month is kept under File → Restore from a backup." }))) return;
    loadDemo();
    toast.success("Loaded the practice month: October 2026, 18 stores, made-up pharmacists");
  }

  async function onAllStores() {
    if (
      !(await confirmAction({
        title: "Start a blank month?",
        body: "A blank month with every store and nobody scheduled.",
        effects: ["People and all scheduled names are removed.", "Unsaved changes are lost."],
        confirmLabel: "Start blank month",
        tone: "danger",
        note: "A backup of the current month is kept under File → Restore from a backup.",
      }))
    ) {
      return;
    }
    startWithAllStores();
    toast.success("Loaded all 18 stores. Add pharmacists on the People page.");
  }

  function onCsv() {
    downloadText(gridCsv(doc), csvFileName(doc.year, doc.month), "text/csv");
    toast.success("Saved CSV");
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <span
        role="status"
        className={cn(
          "hidden h-8 items-center rounded-full px-3 text-xs font-semibold 2xl:inline-flex",
          dirty ? "bg-warn-bg text-warn" : savedTo ? "bg-ok-bg text-ok" : "bg-paper text-muted",
        )}
        title="A browser copy is kept automatically, but it is not a file. Save puts a file on this computer."
      >
        {dirty
          ? savedTo
            ? "Unsaved changes"
            : "Not saved to a file"
          : savedTo
            ? `Saved${lastSavedAt ? ` ${clock(lastSavedAt)}` : ""}`
            : "Browser copy only"}
      </span>
      {canUndo && lastMessage ? (
        <span className="hidden max-w-[13rem] truncate text-xs text-muted 2xl:inline" aria-hidden>
          {lastMessage}
        </span>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={!canUndo}
        onClick={() => undoLast()}
        aria-label={canUndo && lastMessage ? `Undo: ${lastMessage}` : "Undo"}
        title={canUndo && lastMessage ? `Undo: ${lastMessage} (Ctrl+Z)` : "Undo (Ctrl+Z)"}
      >
        <Undo2 />
      </Button>
      <Button
        type="button"
        variant={dirty ? "default" : "secondary"}
        size="sm"
        onClick={() => void onSave(false)}
        title={dirty ? "Unsaved changes" : "Saved"}
        className="relative max-sm:gap-1 max-sm:px-2 max-sm:text-xs"
      >
        <Save />
        Save
        {dirty ? (
          <>
            <span aria-hidden className="absolute -top-1 -right-1 size-3 rounded-full border-2 border-white bg-warn" />
            <span className="sr-only">, unsaved changes</span>
          </>
        ) : null}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="secondary" size="sm" className="px-3 max-sm:gap-1 max-sm:px-2 max-sm:text-xs">
            File
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-64">
          <div className="px-3 py-2 text-xs text-muted">
            <p className="font-medium text-ink">
              {savedTo === "file"
                ? `Saved to file ${fileName}`
                : savedTo === "download"
                  ? `Downloaded ${fileName}`
                  : "Not saved to a file yet"}
              {lastSavedAt ? ` at ${clock(lastSavedAt)}` : ""}
            </p>
            <p>
              {lastAutosaveAt
                ? `Also kept in this browser at ${clock(lastAutosaveAt)}. That copy is not a file.`
                : "Changes are also kept in this browser. That copy is not a file."}
            </p>
            {dirty ? <p className="font-medium text-warn">Unsaved changes</p> : null}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void onOpen()}>
            <FolderOpen className="size-4" />
            Open
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void onSave(true)}>
            <Copy className="size-4" />
            Save a copy as…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onCsv}>
            <Table2 className="size-4" />
            Export grid CSV
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setHistoryOpen(true)}>
            <History className="size-4" />
            Recent changes…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => redo()}>
            <Redo2 className="size-4" />
            Redo
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!handle}
            onSelect={(e) => {
              e.preventDefault();
              setAutoFileSave(!autoFileSave);
            }}
          >
            <span className="flex size-4 items-center justify-center">{autoFileSave ? <Check className="size-4" /> : null}</span>
            <span className="flex flex-col">
              <span>Save to the file automatically</span>
              {!handle ? <span className="text-xs text-muted">Needs a file saved on this computer</span> : null}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setBackups(loadBackups(localStorage));
              setBackupsOpen(true);
            }}
          >
            <History className="size-4" />
            Restore from a backup…
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setMonths(loadArchive(localStorage));
              setMonthsOpen(true);
            }}
          >
            <History className="size-4" />
            Earlier months…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setIconGuideOpen(true)}>
            <CircleHelp className="size-4" />
            Icon guide
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <div className="px-3 pt-1 pb-0.5 text-sm font-semibold text-ink">Display</div>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setTextLarge(!textLarge);
            }}
          >
            <span className="flex size-4 items-center justify-center">{textLarge ? <Check className="size-4" /> : null}</span>
            Larger text
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setHighContrast(!highContrast);
            }}
          >
            <span className="flex size-4 items-center justify-center">{highContrast ? <Check className="size-4" /> : null}</span>
            High contrast
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              try {
                localStorage.removeItem("hischool-tour-v1");
              } catch {
                /* the tour simply won't come back */
              }
              window.dispatchEvent(new Event("hischool-tour-replay"));
              void navigate({ to: "/" });
            }}
          >
            <span className="size-4" />
            Replay the quick tour
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <div className="px-3 pt-1 pb-0.5 text-sm font-semibold text-illegal">Replaces this month</div>
          <DropdownMenuItem onSelect={onAllStores}>
            <FilePlus2 className="size-4" />
            Blank month, all stores
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onDemo}>
            <FlaskConical className="size-4" />
            Practice month with errors
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onSample}>
            <RotateCcw className="size-4" />
            September sample
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent sheet title="Recent changes" description="Newest first. Pick one to go back to just before it. You can redo afterwards.">
          {steps.length ? (
            <ul className="flex max-h-[55dvh] flex-col gap-2 overflow-y-auto text-sm" aria-label="Changes">
              {steps.map((e) => (
                <li key={e.undoSteps} className="flex items-center justify-between gap-3 rounded-lg bg-paper px-3 py-2">
                  <span className="min-w-0 text-pretty">{e.text}</span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      const store = useScheduleStore.getState();
                      for (let i = 0; i < e.undoSteps; i++) store.undo();
                      announce(e.undoSteps === 1 ? "Undid that change" : `Went back ${e.undoSteps} changes`);
                      setHistoryOpen(false);
                    }}
                  >
                    {e.undoSteps === 1 ? "Undo" : `Undo ${e.undoSteps}`}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No changes yet this visit.</p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={!canUndo} onClick={() => undoLast()}>
              Undo the last change
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={monthsOpen} onOpenChange={setMonthsOpen}>
        <DialogContent
          sheet
          title="Earlier months"
          description="Each month is kept on this computer as you work. Opening one replaces what is on screen; the current month is backed up first."
        >
          {months.length === 0 ? (
            <p className="text-sm text-muted">Nothing kept yet. A month is kept when you save it or start the next one.</p>
          ) : (
            <ul className="-mx-1 flex max-h-[55dvh] flex-col gap-2 overflow-y-auto px-1 py-1">
              {months.map((m) => (
                <li key={m.ym} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-line">
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">
                      {MONTH_NAMES[Number(m.ym.slice(5, 7)) - 1]} {m.ym.slice(0, 4)}
                      {m.ym === `${doc.year}-${String(doc.month).padStart(2, "0")}` ? " · on screen" : ""}
                    </p>
                    <p className="truncate text-xs text-muted">kept {new Date(m.savedAt).toLocaleString()}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      if (dirty && !(await confirmAction({ title: "Open this earlier month?", effects: ["The month on screen is replaced."], confirmLabel: "Open it", note: "Unsaved changes to the month on screen are backed up first." }))) return;
                      if (openArchived(m.json, m.fileName)) {
                        setMonthsOpen(false);
                        toast.success("Opened. Save it to keep any changes.");
                      } else toast.error("Could not open that month");
                    }}
                  >
                    Open
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={backupsOpen} onOpenChange={setBackupsOpen}>
        <DialogContent
          sheet
          title="Restore from a backup"
          description="Copies kept in this browser. Restoring keeps the current month as a backup first."
        >
          {backups.length === 0 ? (
            <p className="text-sm text-muted">No backups yet. They are made on every save, and before anything replaces the month.</p>
          ) : (
            <ul className="-mx-1 flex max-h-[55dvh] flex-col gap-2 overflow-y-auto px-1 py-1">
              {backups.map((b) => (
                <li key={b.at} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-line">
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">
                      {MONTH_NAMES[b.month - 1]} {b.year}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {new Date(b.at).toLocaleString()} · {b.reason === "save" ? "saved" : b.reason === "autosave" ? "automatic" : "before replacing"} · {b.fileName}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (restoreBackup(b.at)) {
                        setBackupsOpen(false);
                        toast.success("Restored. Save it to keep it.");
                      } else toast.error("Could not restore that backup");
                    }}
                  >
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
