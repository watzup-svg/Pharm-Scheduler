// Small quiet pieces the People, Stores and Holidays tabs share: a segmented choice, the week and month marks, and a copy-the-list menu.
import { useRef, useState, type ReactNode } from "react";
import { weekday } from "@domain";
import { useApp } from "../../store.ts";
import { record } from "../../diagnostics.ts";
import { Btn, cx } from "../../ui/primitives.tsx";
import { StateMark } from "../../ui/icons.tsx";
import { DAY_SHORT, MON_FIRST, dayLabel, listCsv, listText, type DayMark, type PersonDay, type StoreTick } from "./lib.ts";

/** Two or three plain choices side by side. One is always on. */
export function Segmented<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; aria?: string }[] }) {
  return (
    <div role="group" aria-label={label} className="inline-flex overflow-hidden rounded-md ring-1 ring-edge">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} aria-label={o.aria} onClick={() => onChange(o.value)}
          className={cx("h-8 px-3 text-sm font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink", value === o.value ? "bg-ink text-white" : "bg-fill text-ink hover:bg-line")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const MARK_WORDS: Record<DayMark, string> = {
  home: "At their own store",
  cover: "Covering another store",
  off: "On time off",
  waiting: "Time-off request waiting",
  double: "In two places",
  none: "Not placed",
};

function Mark({ mark }: { mark: DayMark }) {
  if (mark === "home") return <span aria-hidden className="block size-2.5 rounded-[3px] bg-ink/70" />;
  if (mark === "cover") return <StateMark kind="covering" size={16} />;
  if (mark === "off") return <StateMark kind="away" size={16} />;
  if (mark === "waiting") return <StateMark kind="waiting" size={16} />;
  if (mark === "double") return <StateMark kind="double" size={16} />;
  return <span aria-hidden className="block size-1 rounded-full bg-black/15" />;
}

const dayWords = (d: PersonDay): string => {
  const where = d.at.length ? ` (${d.at.join(" and ")})` : "";
  return `${MARK_WORDS[d.mark]}${where}${d.placedWhileOff ? ", on a day of time off" : ""}`;
};

/** One person's week as seven small marks, Monday first. */
export function WeekMarks({ name, days }: { name: string; days: PersonDay[] }) {
  return (
    <span role="img" aria-label={`${name}, this week. ${days.map((d) => `${dayLabel(d.date)}: ${dayWords(d)}`).join(". ")}.`} className="inline-flex" data-week-marks>
      {days.map((d) => (
        <span key={d.date} data-mark={d.mark} data-date={d.date} data-tip={`${dayLabel(d.date)} | ${dayWords(d)}`}
          className={cx("grid size-6 place-items-center", (weekday(d.date) === 6 || weekday(d.date) === 0) && "bg-black/[0.05]")}>
          <Mark mark={d.mark} />
        </span>
      ))}
    </span>
  );
}

/** The seven weekday letters that sit above a column of marks. */
export function WeekdayLetters() {
  return (
    <span aria-hidden className="inline-flex">
      {MON_FIRST.map((w) => <span key={w} className="grid size-6 place-items-center text-xs font-semibold text-muted">{DAY_SHORT[w]![0]}</span>)}
    </span>
  );
}

/** A store's month: one thin tick per day. Tall brick = someone is missing; tall amber = a rule is broken; medium green = covered; short grey = closed. */
export function MonthLine({ label, ticks, summary, tip }: { label: string; ticks: StoreTick[]; summary: string; tip?: string }) {
  return (
    <span role="img" aria-label={`${label}: ${summary}`} data-month-line data-tip={tip} data-tip-list className="flex h-5 items-end gap-px">
      {ticks.map((t) => (
        <span key={t.date} data-tick={t.tick} data-date={t.date} aria-hidden
          className={cx("w-[4px] rounded-[1px]", t.tick === "open" ? "h-5 bg-illegal" : t.tick === "broken" ? "h-5 bg-warn" : t.tick === "covered" ? "h-2.5 bg-ok/55" : "h-1 bg-black/10")} />
      ))}
    </span>
  );
}

type ListData = { header: string[]; rows: string[][] };

/** "List" menu: copy the list as plain text or as CSV. If the browser blocks copying, the text is shown to copy by hand. */
export function ListMenu({ name, build }: { name: string; build: () => ListData }) {
  const say = useApp((s) => s.say);
  const [fallback, setFallback] = useState<string | null>(null);
  const details = useRef<HTMLDetailsElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const copy = async (kind: "text" | "CSV") => {
    const data = build();
    const text = kind === "CSV" ? listCsv(data) : listText(data);
    if (details.current) details.current.open = false;
    setMenuOpen(false);
    try {
      await navigator.clipboard.writeText(text);
      setFallback(null);
      say("ok", `Copied the ${name} list as ${kind === "CSV" ? "CSV" : "plain text"}.`);
    } catch (e) {
      record("ui", `clipboard blocked (${name} list): ${String((e as Error)?.message ?? e)}`);
      setFallback(text);
    }
  };
  return (
    <>
      <details ref={details} className="relative" data-list-menu onToggle={(e) => setMenuOpen(e.currentTarget.open)}>
        <summary aria-label={`Copy the ${name} list`} className="inline-flex h-8 cursor-pointer list-none items-center rounded-md px-3 text-sm font-medium text-ink hover:bg-fill focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink [&::-webkit-details-marker]:hidden">Copy list</summary>
        {menuOpen && <div className="absolute right-0 z-20 mt-1 flex w-44 flex-col rounded-md bg-white p-1 shadow-lg ring-1 ring-line">
          <button type="button" onClick={() => copy("text")} className="h-8 rounded px-2 text-left text-sm hover:bg-fill focus-visible:outline-2 focus-visible:outline-ink">As plain text</button>
          <button type="button" onClick={() => copy("CSV")} className="h-8 rounded px-2 text-left text-sm hover:bg-fill focus-visible:outline-2 focus-visible:outline-ink">As CSV</button>
        </div>}
      </details>
      {fallback !== null && (
        <div className="basis-full">
          <label htmlFor={`list-fallback-${name}`} className="text-xs font-semibold">Copy this by hand (the browser did not allow copying)</label>
          <textarea id={`list-fallback-${name}`} readOnly value={fallback} rows={6} onFocus={(e) => e.currentTarget.select()} className="mt-0.5 w-full rounded-md border border-edge bg-white p-2 font-mono text-xs" />
          <Btn tone="ghost" onClick={() => setFallback(null)}>Hide</Btn>
        </div>
      )}
    </>
  );
}
