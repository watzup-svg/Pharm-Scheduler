// Practice data for trying the app. Lives in fixtures/*.json, not in code; imported through the same importer as real files.
import demoDoc from "../fixtures/demo-v2.json";
import driveTable from "../fixtures/drive-table.json";
import { importV2, type DriveTable, type ImportReport, type World } from "@domain";

export function importPrototypeFiles(docs: unknown[]): { world: World; report: ImportReport } {
  return importV2(docs, { driveTable: driveTable.pairs as unknown as DriveTable });
}

export function practiceWorld(): { world: World; report: ImportReport } {
  return importPrototypeFiles([demoDoc]);
}
