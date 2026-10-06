// Practice data for trying the app. Lives in fixtures/*.json, not in code; imported through the same importer as real files.
import demoDoc from "../fixtures/demo-v2.json";
import driveTable from "../fixtures/drive-table.json";
import { importV2, problemsWorld, type DriveTable, type ImportReport, type World } from "@domain";
import { todayISO } from "./clock.ts";

export function importPrototypeFiles(docs: unknown[]): { world: World; report: ImportReport } {
  return importV2(docs, { driveTable: driveTable.pairs as unknown as DriveTable });
}

export function practiceWorld(): { world: World; report: ImportReport } {
  return importPrototypeFiles([demoDoc]);
}

/** A practice schedule that already has open shifts, rule breaks, requests waiting and changes to tell people about. */
export function practiceWorldWithProblems(): { world: World; summary: string[] } {
  return problemsWorld(todayISO());
}
