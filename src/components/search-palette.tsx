import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { nextNamed } from "@/lib/schedule/jump";
import { storeTag } from "@/lib/schedule/label";
import { shortStoreName } from "@/lib/schedule/fix";
import { useScheduleStore } from "@/store/schedule-store";
import { useViewStore } from "@/store/view-store";

type Item = { id: string; label: string; hint: string; run: () => void };

const PAGES = [
  { to: "/", label: "District" },
  { to: "/schedule", label: "Schedule" },
  { to: "/time-off", label: "Time off" },
  { to: "/holidays", label: "Holidays" },
  { to: "/print", label: "Print" },
  { to: "/people", label: "People" },
  { to: "/stores", label: "Stores" },
  { to: "/style", label: "Style guide" },
] as const;

/** Jump to a page, a store, or a person from anywhere. Opens with the / key or the search button in the header. */
export function SearchPalette() {
  const open = useViewStore((s) => s.searchOpen);
  const setOpen = useViewStore((s) => s.setSearchOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {open ? <PaletteBody close={() => setOpen(false)} /> : null}
    </Dialog>
  );
}

function PaletteBody({ close }: { close: () => void }) {
  const doc = useScheduleStore((s) => s.doc);
  const navigate = useNavigate();
  const goTo = useViewStore((s) => s.goTo);
  const setPerson = useViewStore((s) => s.setPerson);
  const setStoreTab = useViewStore((s) => s.setStoreTab);
  const openSick = useViewStore((s) => s.openSick);
  const setFillOpen = useViewStore((s) => s.setFillOpen);
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const all: Item[] = useMemo(() => {
    const go = (to: string) => () => {
      close();
      void navigate({ to, resetScroll: to === "/schedule" ? false : undefined });
    };
    const pages = PAGES.map((p) => ({ id: `page-${p.to}`, label: p.label, hint: "page", run: go(p.to) }));
    const stores = doc.stores.map((s) => ({
      id: `store-${s.code}`,
      label: `${shortStoreName(s.name)} (${storeTag(doc, s.code)})`,
      hint: [s.code, s.number, s.address?.split(",").slice(-2).join(",").trim(), s.phone].filter(Boolean).join(" · ") || "store",
      run: () => {
        close();
        setStoreTab(s.code);
        void navigate({ to: "/schedule", resetScroll: false });
      },
    }));
    const people = doc.people.map((p) => ({
      id: `person-${p.name}`,
      label: p.name,
      hint: `${p.role === "Float Pharmacist" ? "float" : "home"} ${storeTag(doc, p.home)}`,
      run: () => {
        close();
        setPerson(p.name);
        const target = nextNamed(doc, p.name, null);
        if (target) goTo(target, false);
        void navigate({ to: "/schedule", resetScroll: false });
      },
    }));
    const actions = [
      {
        id: "action-icons",
        label: "Icon guide",
        hint: "what the pictures mean, help, symbols, legend",
        run: () => {
          close();
          useViewStore.getState().setIconGuideOpen(true);
        },
      },
      {
        id: "action-fill",
        label: "Fill shifts with no coverage",
        hint: "a proposal for every empty shift",
        run: () => {
          close();
          setFillOpen(true);
        },
      },
      {
        id: "action-sick",
        label: "Someone called in sick",
        hint: "sick, call-in, absent, find cover",
        run: () => {
          close();
          openSick();
        },
      },
    ];
    return [...actions, ...people, ...stores, ...pages];
  }, [doc, navigate, close, goTo, setPerson, setStoreTab, openSick, setFillOpen]);

  const shown = useMemo(() => {
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return all.slice(0, 12);
    return all
      .filter((it) => {
        const hay = `${it.label} ${it.hint}`.toLowerCase();
        return tokens.every((t) => hay.includes(t));
      })
      .sort((a, b) => Number(b.label.toLowerCase().startsWith(tokens[0]!)) - Number(a.label.toLowerCase().startsWith(tokens[0]!)))
      .slice(0, 12);
  }, [all, q]);

  useEffect(() => setAt(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [at]);

  return (
    <DialogContent sheet title="Jump to…" description="A pharmacist, a store, or a page. Press Enter to go.">
      <div className="flex flex-col gap-2">
        <div className="flex h-12 items-center gap-2 rounded-lg bg-white px-3 ring-1 ring-line focus-within:ring-2 focus-within:ring-brand">
          <Search aria-hidden className="size-4 shrink-0 text-muted" />
          <input
            autoFocus
            role="combobox"
            aria-expanded
            aria-controls="palette-list"
            aria-activedescendant={shown[at] ? `pal-${shown[at]!.id}` : undefined}
            aria-label="Search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setAt((i) => Math.min(shown.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setAt((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter" && shown[at]) {
                e.preventDefault();
                shown[at]!.run();
              }
            }}
            placeholder="Type a name, store or page"
            autoComplete="off"
            enterKeyHint="go"
            className="h-full min-w-0 flex-1 bg-transparent text-base outline-none"
          />
        </div>
        <ul id="palette-list" ref={listRef} role="listbox" aria-label="Results" className="max-h-[50dvh] overflow-y-auto overscroll-contain">
          {shown.length === 0 ? <li className="px-2 py-3 text-sm text-muted">Nothing matches “{q.trim()}”</li> : null}
          {shown.map((it, i) => (
            <li
              key={it.id}
              role="option"
              id={`pal-${it.id}`}
              aria-selected={i === at}
              onClick={it.run}
              onMouseMove={() => setAt(i)}
              className={`flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-md px-2 text-left text-sm ${i === at ? "bg-paper" : ""}`}
            >
              <span className="min-w-0 truncate font-medium">{it.label}</span>
              <span className="shrink-0 truncate text-xs text-muted">{it.hint}</span>
            </li>
          ))}
        </ul>
      </div>
    </DialogContent>
  );
}
