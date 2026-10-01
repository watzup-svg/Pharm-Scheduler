import { confirmAction } from "@/components/confirm";
import { weekdayLong, weekdaySun0 } from "@/lib/schedule/calendar";
import type { ScheduleDoc } from "@/lib/schedule/types";

/**
 * Placing someone on their usual weekly day off is allowed, but she is asked first. Resolves true when there is
 * nothing to ask about (not their day off) or she confirms.
 */
export async function okToPlace(doc: ScheduleDoc, name: string, day: number): Promise<boolean> {
  const person = doc.people.find((p) => p.name === name);
  if (!person?.unavailableDays?.includes(weekdaySun0(doc.year, doc.month, day))) return true;
  const weekday = weekdayLong(doc.year, doc.month, day);
  return confirmAction({
    title: `${name.split(" ")[0]} usually has ${weekday}s off`,
    body: `Schedule ${name} on ${weekday}, ${day} anyway?`,
    effects: ["This is a one-time override. Their usual days off stay as they are."],
    confirmLabel: "Schedule anyway",
    note: "Or Cancel and pick someone else.",
  });
}
