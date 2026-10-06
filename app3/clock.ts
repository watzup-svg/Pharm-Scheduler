// The only place the app reads the wall clock. The domain never does; it is handed `asOf`.
import type { ISODate } from "@domain";

export function todayISO(): ISODate {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
