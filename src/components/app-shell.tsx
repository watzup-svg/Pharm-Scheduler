import { useActionLog } from "@/components/undo";
import { isWaiting } from "@/lib/schedule/timeoff-view";
import { useSelectionFeedback } from "@/components/use-feedback";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { CalendarDays, ChevronRight, Ellipsis, LayoutDashboard, Printer, Search, SlidersHorizontal, Palmtree } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import { BrandMark } from "@/components/brand-mark";
import { FillDialog } from "@/components/fill-dialog";
import { IconGuide } from "@/components/icon-guide";
import { HoverTips } from "@/components/hover-tips";
import { DialSheet, useDialLinks } from "@/components/dial-sheet";
import { Mark } from "@/components/icons";
import { usePrintStatus } from "@/components/use-print-status";
import { SickDialog } from "@/components/sick-dialog";
import { ConfirmHost } from "@/components/confirm";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { SearchPalette } from "@/components/search-palette";
import { FileMenu } from "@/components/file-menu";
import { undoLast } from "@/components/undo";
import { Welcome, WELCOME_KEY } from "@/components/welcome";
import { AUTOSAVE_KEY } from "@/lib/schedule/file";
import { monthName } from "@/lib/schedule/calendar";
import { DEMO_FILE_NAME } from "@/lib/schedule/demo";
import { SAMPLE_FILE_NAME } from "@/lib/schedule/sample";
import { monthStatus } from "@/lib/schedule/dashboard";
import { stepRef } from "@/lib/schedule/fix";
import { cn } from "@/lib/utils";
import { useScheduleStore } from "@/store/schedule-store";
import { useViewStore } from "@/store/view-store";

const NAV = [
  { to: "/", label: "District", icon: LayoutDashboard, match: (p: string) => p === "/", more: false },
  { to: "/schedule", label: "Schedule", icon: CalendarDays, match: (p: string) => p === "/schedule", more: false },
  { to: "/time-off", label: "Time off", icon: Palmtree, match: (p: string) => p === "/time-off", more: false },
  { to: "/print", label: "Print", icon: Printer, match: (p: string) => p === "/print", more: false },
  // People, Stores and Holidays change rarely, so they share one tab with a switcher at the top of each.
  { to: "/people", label: "Setup", icon: SlidersHorizontal, match: (p: string) => p === "/people" || p === "/lists" || p === "/stores" || p === "/holidays", more: false },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const moreActive = NAV.some((item) => item.more && item.match(pathname));
  useSelectionFeedback();
  useDialLinks();
  const [moreOpen, setMoreOpen] = useState(false);
  const navigate = useNavigate();
  const [bootstrapped, setBootstrapped] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const doc = useScheduleStore((s) => s.doc);
  const dirty = useScheduleStore((s) => s.dirty);
  const fileName = useScheduleStore((s) => s.fileName);
  const isSample = fileName === DEMO_FILE_NAME || fileName === SAMPLE_FILE_NAME;
  const ev = useScheduleStore((s) => s.evaluation);
  const persistAutosave = useScheduleStore((s) => s.persistAutosave);
  const hydrateFromStorage = useScheduleStore((s) => s.hydrateFromStorage);
  const autoSaveToFile = useScheduleStore((s) => s.autoSaveToFile);
  const redo = useScheduleStore((s) => s.redo);
  const goTo = useViewStore((s) => s.goTo);
  const setSearchOpen = useViewStore((s) => s.setSearchOpen);
  const textLarge = useViewStore((s) => s.textLarge);
  const highContrast = useViewStore((s) => s.highContrast);
  const requests = doc.timeOff.filter((t) => isWaiting(doc, t)).length;
  const status = useMemo(() => monthStatus(doc, ev), [doc, ev]);
  const printStatus = usePrintStatus();

  useEffect(() => {
    // A computer that has never opened this app, with no saved work: offer a real start.
    try {
      setWelcome(!localStorage.getItem(AUTOSAVE_KEY) && !localStorage.getItem(WELCOME_KEY));
    } catch {
      /* storage blocked: skip the welcome */
    }
    hydrateFromStorage();
    setBootstrapped(true);
  }, [hydrateFromStorage]);

  useEffect(() => {
    if (!bootstrapped) return;
    const t = window.setTimeout(() => persistAutosave(), 800);
    return () => window.clearTimeout(t);
  }, [doc, persistAutosave, bootstrapped]);

  // Tab closed, phone locked, app switched away: write the browser copy now instead of waiting for the timer.
  useEffect(() => {
    if (!bootstrapped) return;
    const flush = () => persistAutosave();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [persistAutosave, bootstrapped]);

  // With a real file open and "save automatically" on, write it a few seconds after the last edit.
  useEffect(() => {
    if (!bootstrapped) return;
    const t = window.setTimeout(() => void autoSaveToFile().catch(() => {}), 4000);
    return () => window.clearTimeout(t);
  }, [doc, autoSaveToFile, bootstrapped]);

  // Once per visit, if a real amount of work is only in the browser copy, offer to put a file on the computer.
  const changes = useActionLog((s) => s.changes);
  const savedTo = useScheduleStore((s) => s.savedTo);
  const nudged = useRef(false);
  useEffect(() => {
    if (!bootstrapped || nudged.current || savedTo || !dirty) return;
    const nudge = () => {
      if (nudged.current || useScheduleStore.getState().savedTo) return;
      nudged.current = true;
      toast("Save a copy to this computer?", {
        description: "Changes are kept in this browser only. Save a file to keep them safe.",
        duration: 15000,
        action: { label: "Save", onClick: () => void useScheduleStore.getState().saveFile(false) },
      });
    };
    if (changes >= 10) {
      nudge();
      return;
    }
    const t = window.setTimeout(nudge, 30 * 60 * 1000);
    return () => window.clearTimeout(t);
  }, [bootstrapped, changes, dirty, savedTo]);

  useEffect(() => {
    function onLeave(e: BeforeUnloadEvent) {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  // Undo and redo from the keyboard, anywhere except while typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const key = e.key.toLowerCase();
      if (key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undoLast();
      } else if (key === "y") {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [redo]);

  useEffect(() => {
    document.documentElement.classList.toggle("text-large", textLarge);
    document.documentElement.classList.toggle("contrast", highContrast);
  }, [textLarge, highContrast]);

  // One plain title per page, so tabs and history read well.
  useEffect(() => {
    const names: Record<string, string> = {
      "/": "District",
      "/schedule": "Schedule",
      "/time-off": "Time off",
      "/holidays": "Holidays",
      "/print": "Print",
      "/people": "People",
      "/lists": "People",
      "/stores": "Stores",
      "/style": "Style guide",
    };
    document.title = `${names[pathname] ?? "Not found"} · Hi-School Pharmacy Schedule`;
  }, [pathname]);

  // "/" opens the jump-to box from anywhere, except while typing or with a dialog open.
  useEffect(() => {
    function onSlash(e: KeyboardEvent) {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.defaultPrevented) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (document.querySelector("[role=dialog], [role=menu]")) return;
      e.preventDefault();
      setSearchOpen(true);
    }
    window.addEventListener("keydown", onSlash);
    return () => window.removeEventListener("keydown", onSlash);
  }, [setSearchOpen]);

  const title = `${monthName(doc.year, doc.month)} ${doc.year}`;

  function openFirstProblem() {
    if (status.next && doc.people.length > 0) goTo(stepRef(status.next), true, "", true);
    void navigate({ to: "/schedule", resetScroll: false });
  }

  return (
    <div className="flex min-h-dvh min-w-0 flex-col overflow-x-clip bg-paper text-ink">
      {pathname === "/schedule" ? (
        <button
          type="button"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-brand focus:px-4 focus:py-3 focus:text-sm focus:text-brand-fg"
          onClick={() => document.querySelector<HTMLElement>('[data-day][tabindex="0"]')?.focus()}
        >
          Skip to the month
        </button>
      ) : null}
      <header className="app-shell-header sticky top-0 z-40 border-b border-line bg-cream/90 shadow-[0_8px_16px_-14px_rgb(28_25_23/0.3)] backdrop-blur-md print:hidden">
        <div className="mx-auto flex h-14 w-full max-w-[1500px] items-center gap-2 px-4 sm:px-6">
          <Link to="/" aria-label="Hi-School Pharmacy, district page" className="hidden h-11 shrink-0 items-center min-[520px]:flex">
            <BrandMark />
          </Link>
          <button
            type="button"
            onClick={openFirstProblem}
            className="flex h-11 min-w-0 flex-1 flex-col justify-center text-left lg:w-52 lg:flex-initial xl:w-72"
            aria-label={
              status.ready ? `${title}. Ready to print.` : `${title}. ${status.steps.length} to fix. Show the first.`
            }
          >
            <span className="text-base leading-tight break-words font-semibold">
              {bootstrapped ? title : "Opening…"}
              {bootstrapped && isSample ? (
                <span data-tip="Sample data | Not the district's real schedule" className="ml-2 hidden rounded-full bg-fill px-2 py-0.5 align-middle text-xs font-medium text-muted ring-1 ring-edge sm:inline-block">Sample</span>
              ) : null}
            </span>
            {bootstrapped ? (
              <span
                data-tip={doc.people.length === 0 ? "Add pharmacists to start" : status.ready ? "Ready to print" : `${status.steps.length} to fix | ${status.next?.headline ?? ""}`}
                className={cn("flex items-center gap-1 text-xs leading-tight font-semibold", status.ready ? "text-ok" : "text-illegal")}
              >
                {isSample ? <span className="rounded-full bg-fill px-1.5 text-[11px] font-medium text-muted ring-1 ring-edge sm:hidden">Sample</span> : null}
                {doc.people.length === 0 ? (
                  <Mark icon="problem" tip={false} className="size-3.5" />
                ) : status.ready ? (
                  <>
                    <Mark icon="clean" tip={false} className="size-3.5" />
                    {printStatus.printedAt ? <Mark icon={printStatus.changed ? "changed" : "printed"} tip={false} className={cn("size-3.5", printStatus.changed ? "text-warn" : "text-muted")} /> : null}
                  </>
                ) : (
                  <>
                    <Mark icon="problem" tip={false} className="size-3.5" />
                    <span className="tabular-nums">{status.steps.length}</span>
                  </>
                )}
              </span>
            ) : null}
          </button>
          <nav className="hidden min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] lg:flex" aria-label="Pages">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                resetScroll={item.to === "/schedule" ? false : undefined}
                className={cn(
                  "inline-flex h-11 items-center rounded-md px-3 text-sm font-medium whitespace-nowrap xl:px-3",
                  item.match(pathname) ? "bg-ink text-cream" : "text-ink hover:bg-paper",
                )}
              >
                {item.label}
                {item.to === "/time-off" && requests > 0 ? (
                  <span className="ml-2 rounded-full bg-warn-bg px-2 text-xs font-bold text-warn ring-1 ring-warn/40" aria-label={`${requests} requests waiting`}>
                    {requests}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>
          <div className="hidden flex-1 lg:block" />
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search: jump to a pharmacist, store or page"
            title="Search (press /)"
            className="inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-md px-3 text-ink hover:bg-paper"
          >
            <Search className="size-5" />
            <span className="hidden text-sm text-muted 2xl:inline">Search</span>
            <kbd className="hidden rounded-sm bg-fill px-2 text-xs font-semibold text-muted 2xl:inline">/</kbd>
          </button>
          <FileMenu />
        </div>
      </header>
      <main className="min-w-0 flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        {bootstrapped ? (
          <div key={pathname} className="hs-fade">
            {children}
          </div>
        ) : (
          <p className="px-4 py-8 text-sm text-muted sm:px-6">Opening the schedule on this computer…</p>
        )}
      </main>
      <nav
        className="app-shell-tabs fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-cream pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden"
        aria-label="Pages"
      >
        {NAV.filter((item) => !item.more).map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              resetScroll={item.to === "/schedule" ? false : undefined}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-14 min-w-0 flex-col items-center justify-center gap-0.5 text-xs font-medium",
                active ? "font-bold text-ink" : "text-muted",
              )}
            >
              <span className="relative">
                <Icon className={cn("size-5", active && "stroke-[2.4]")} />
                {item.to === "/time-off" && requests > 0 ? (
                  <span className="absolute -top-1.5 -right-2.5 min-w-4 rounded-full bg-warn-bg px-1 text-center text-xs leading-4 font-bold text-warn ring-1 ring-warn/40" aria-label={`${requests} requests waiting`}>
                    {requests}
                  </span>
                ) : null}
              </span>
              <span className="max-w-full truncate">{item.label}</span>
              {active ? <span className="sr-only">(current page)</span> : null}
            </Link>
          );
        })}
        {NAV.some((item) => item.more) ? (
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            className={cn("flex h-14 min-w-0 flex-col items-center justify-center gap-0.5 text-xs font-medium", moreActive ? "font-bold text-ink" : "text-muted")}
          >
            <Ellipsis className={cn("size-5", moreActive && "stroke-[2.4]")} />
            <span className="max-w-full truncate">More</span>
            {moreActive ? <span className="sr-only">(current section)</span> : null}
          </button>
        ) : null}
      </nav>
      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent sheet title="More">
          <ul className="flex flex-col gap-1">
            {NAV.filter((item) => item.more).map((item) => {
              const Icon = item.icon;
              const active = item.match(pathname);
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    onClick={() => setMoreOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn("flex min-h-14 items-center gap-3 rounded-lg px-3 text-base font-medium", active ? "bg-ink text-cream" : "bg-fill text-ink")}
                  >
                    <Icon aria-hidden className="size-5" />
                    <span className="flex-1">{item.label}</span>
                    <ChevronRight aria-hidden className="size-4" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>
      <SearchPalette />
      <SickDialog />
      <ConfirmHost />
      <FillDialog />
      <IconGuide />
      <DialSheet />
      <HoverTips />
      <Welcome open={welcome && bootstrapped} onClose={() => setWelcome(false)} />
      <Toaster
        position="top-center"
        offset={64}
        className="print:hidden"
        toastOptions={{
          classNames: {
            toast: "hs-rise !rounded-[10px] !border !border-line !bg-white !text-ink !shadow-[0_12px_28px_-14px_rgba(28,25,23,0.45)] !font-sans",
            success: "!border-l-4 !border-l-ok",
            error: "!border-l-4 !border-l-illegal",
            warning: "!border-l-4 !border-l-warn",
            actionButton: "!h-11 !min-w-16 !rounded-[10px] !bg-night !px-4 !text-sm !font-semibold !text-white",
            icon: "!text-ink",
          },
        }}
      />
    </div>
  );
}
