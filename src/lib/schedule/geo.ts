import { tableFor } from "./drive-table.ts";
import type { ScheduleDoc, Store } from "./types.ts";

const EARTH_MILES = 3958.8;

/** Straight-line miles between two points. Roads are longer; this is for ranking, not driving directions. */
export function distanceMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_MILES * Math.asin(Math.sqrt(h));
}

function hasPoint(s: Store | undefined): s is Store & { lat: number; lng: number } {
  return s?.lat != null && s.lng != null;
}

/** Miles between two stores, or null when either has no location. */
export function storeDistance(doc: Pick<ScheduleDoc, "stores">, from: string, to: string): number | null {
  if (from === to) return 0;
  const a = doc.stores.find((s) => s.code === from);
  const b = doc.stores.find((s) => s.code === to);
  return hasPoint(a) && hasPoint(b) ? distanceMiles(a, b) : null;
}

/** Key for a hand-set drive time: the two store codes, alphabetical. */
export function driveKey(a: string, b: string): string {
  return a <= b ? `${a}|${b}` : `${b}|${a}`;
}

/** The Columbia River crossings the district's roads use, west to east. Stores on opposite banks drive through one of these. */
const CROSSINGS: { name: string; lat: number; lng: number }[] = [
  { name: "Lewis & Clark Bridge (Longview–Rainier)", lat: 46.1109, lng: -122.9548 },
  { name: "I-5 Interstate Bridge (Vancouver)", lat: 45.6203, lng: -122.6769 },
  { name: "I-205 Glenn Jackson Bridge", lat: 45.5848, lng: -122.5489 },
  { name: "Bridge of the Gods (Cascade Locks)", lat: 45.662, lng: -121.8998 },
  { name: "Hood River–White Salmon Bridge", lat: 45.7136, lng: -121.5123 },
];

const stateOf = (s: Store | undefined) => /,\s*([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?\s*$/.exec(s?.address ?? "")?.[1] ?? "";

/**
 * Estimated road miles between two stores. Straight line x 1.3, except where the Columbia River is between them (one store in
 * Washington, one in Oregon): then the trip goes through the best crossing, so it is never shorter than getting to a bridge and on.
 */
function roadMilesEstimate(doc: Pick<ScheduleDoc, "stores">, from: string, to: string): { miles: number; via: string | null } | null {
  const a = doc.stores.find((s) => s.code === from);
  const b = doc.stores.find((s) => s.code === to);
  if (!hasPoint(a) || !hasPoint(b)) return null;
  const direct = distanceMiles(a, b);
  const sa = stateOf(a);
  const sb = stateOf(b);
  if (sa && sb && sa !== sb && ["OR", "WA"].includes(sa) && ["OR", "WA"].includes(sb)) {
    let best: { miles: number; via: string } | null = null;
    for (const c of CROSSINGS) {
      const m = distanceMiles(a, c) + distanceMiles(c, b);
      if (!best || m < best.miles) best = { miles: m, via: c.name };
    }
    if (best && best.miles > direct) return { miles: best.miles * 1.3, via: best.via };
  }
  return { miles: direct * 1.3, via: null };
}

/** Drive minutes between two stores: the manager's number if they set one, else a rough estimate (road miles at 45 mph). */
export function driveBetween(doc: Pick<ScheduleDoc, "stores" | "driveMinutes"> & Partial<Pick<ScheduleDoc, "driveMiles">>, from: string, to: string): { minutes: number; estimated: boolean; miles: number | null; roadMiles?: number; via?: string | null; ferry?: boolean } | null {
  if (from === to) return { minutes: 0, estimated: false, miles: 0 };
  const miles = storeDistance(doc, from, to);
  const set = doc.driveMinutes?.[driveKey(from, to)];
  const road = roadMilesEstimate(doc, from, to);
  if (set != null) return { minutes: set, estimated: false, miles, roadMiles: road?.miles, via: road?.via };
  const handMiles = doc.driveMiles?.[driveKey(from, to)];
  const measured = handMiles == null ? tableFor(doc.stores, from, to) : null;
  if (measured) return { minutes: measured.minutes, estimated: false, miles, roadMiles: measured.miles, via: road?.via, ferry: measured.ferry };
  if (handMiles != null) return { minutes: Math.round((handMiles / 45) * 60), estimated: true, miles, roadMiles: handMiles, via: road?.via };
  if (miles == null || !road) return null;
  return { minutes: Math.round((road.miles / 45) * 60), estimated: true, miles, roadMiles: road.miles, via: road.via };
}

export type MilesSource = "set" | "table" | "estimated" | "missing";

/** One-way road miles between two stores: the manager's number if set, else the estimate from addresses, else missing. */
export function pairMiles(doc: Pick<ScheduleDoc, "stores" | "driveMiles">, from: string, to: string): { miles: number | null; source: MilesSource } {
  if (from === to) return { miles: 0, source: "set" };
  const set = doc.driveMiles?.[driveKey(from, to)];
  if (set != null) return { miles: set, source: "set" };
  const measured = tableFor(doc.stores, from, to);
  if (measured) return { miles: measured.miles, source: "table" };
  const road = roadMilesEstimate(doc, from, to);
  return road ? { miles: Math.round(road.miles * 10) / 10, source: "estimated" } : { miles: null, source: "missing" };
}
