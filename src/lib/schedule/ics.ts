import { daysInMonth, isoDate, isStoreOpen, monthName, weekdayShort } from "./calendar.ts";
import { awayFromHome } from "./dashboard.ts";
import { shortStoreName } from "./fix.ts";
import { getCell } from "./grid.ts";
import { formatDateList, isApproved, timeOffDates } from "./pto.ts";
import { RPH_SLOTS } from "./slots.ts";
import type { ScheduleDoc } from "./types.ts";

function esc(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines longer than 75 bytes are folded, as calendar programs expect. */
function fold(line: string): string[] {
  const bytes = new TextEncoder();
  const parts: string[] = [];
  let cur = "";
  for (const ch of line) {
    const limit = parts.length === 0 ? 75 : 74;
    if (bytes.encode(cur + ch).length > limit) {
      parts.push(cur);
      cur = ch;
    } else cur += ch;
  }
  parts.push(cur);
  return parts.map((p, i) => (i === 0 ? p : ` ${p}`));
}

function compact(iso: string): string {
  return iso.replace(/-/g, "");
}

function nextDay(iso: string): string {
  const t = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) + 1));
  return t.toISOString().slice(0, 10);
}

type Shift = { day: number; store: string; storeName: string; address: string; phone: string; away: string | null; second: boolean };

function shiftsOf(doc: ScheduleDoc, name: string): Shift[] {
  const out: Shift[] = [];
  const last = daysInMonth(doc.year, doc.month);
  for (let day = 1; day <= last; day++) {
    for (const store of doc.stores) {
      if (!isStoreOpen(store, doc.year, doc.month, day, last, doc.holidays)) continue;
      const slot = RPH_SLOTS.find((s) => getCell(doc.grid, store.code, s, day).trim() === name);
      if (!slot) continue;
      out.push({
        day,
        store: store.code,
        storeName: store.name,
        address: store.address,
        phone: store.phone ?? "",
        away: awayFromHome(doc, name, store.code),
        second: slot === "pharmacist2",
      });
    }
  }
  return out;
}

/** An all-day event on every day this person works, for a phone or computer calendar. */
export function personIcs(doc: ScheduleDoc, name: string, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Hi-School Pharmacy//Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(`${name} — ${monthName(doc.year, doc.month)} ${doc.year}`)}`,
  ];
  for (const s of shiftsOf(doc, name)) {
    const date = isoDate(doc.year, doc.month, s.day);
    const desc = [
      s.away ? `Working away from home store (${s.away}).` : "",
      s.second ? "Second pharmacist." : "",
      s.phone ? `Store phone: ${s.phone}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const event = [
      "BEGIN:VEVENT",
      `UID:${slug}-${date}-${s.store.toLowerCase()}${s.second ? "-2" : ""}@hischool-schedule`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(date)}`,
      `DTEND;VALUE=DATE:${compact(nextDay(date))}`,
      `SUMMARY:${esc(`Work: ${shortStoreName(s.storeName)}${s.away ? ` (away from ${s.away})` : ""}`)}`,
      ...(s.address ? [`LOCATION:${esc(s.address)}`] : []),
      ...(desc ? [`DESCRIPTION:${esc(desc)}`] : []),
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    ];
    lines.push(...event);
  }
  lines.push("END:VCALENDAR");
  return lines.flatMap(fold).join("\r\n") + "\r\n";
}

/** A short plain-text schedule to paste into a message. */
export function personText(doc: ScheduleDoc, name: string): string {
  const shifts = shiftsOf(doc, name);
  const first = name.split(" ")[0];
  const out = [`${first}, your schedule for ${monthName(doc.year, doc.month)} ${doc.year}:`, ""];
  if (!shifts.length) out.push("Nothing scheduled.");
  for (const s of shifts) {
    const where = shortStoreName(s.storeName);
    out.push(
      `${weekdayShort(doc.year, doc.month, s.day)} ${monthName(doc.year, doc.month).slice(0, 3)} ${s.day}: ${where}${s.second ? " (second pharmacist)" : ""}${s.away ? ` — away from ${s.away}` : ""}`,
    );
  }
  const off = doc.timeOff.filter((t) => t.name === name && isApproved(t)).flatMap(timeOffDates);
  if (off.length) out.push("", `Time off: ${formatDateList(off)}`);
  const stores = [...new Map(shifts.map((s) => [s.store, s])).values()].filter((s) => s.phone || s.address);
  if (stores.length) {
    out.push("");
    for (const s of stores) out.push(`${shortStoreName(s.storeName)}: ${[s.address, s.phone].filter(Boolean).join(" · ")}`);
  }
  return out.join("\n");
}
