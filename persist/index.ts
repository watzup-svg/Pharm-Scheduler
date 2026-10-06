// Save layer: SQLite (sql.js) as the file format, File System Access for the user's file, IndexedDB as the browser mirror.
export { createPersist } from "./core.ts";
export type { Persist, PersistDeps } from "./core.ts";
export { APP_ID, APP_NAME, SCHEMA_VERSION, DDL, KEYED_TABLES, worldToDb, dbToWorld, exportWorld, loadBytes, openChecked, salvageBytes, readMeta, savedForm, sameSaved, CodecError } from "./codec.ts";
export type { FileMeta, LoadOk, CheckFail } from "./codec.ts";
export { idbMem, idbReal } from "./idb.ts";
export type { Kv } from "./idb.ts";
export { fsaBackend, downloadBackend, detectBackend } from "./backends.ts";
export type { FileBackend, HandleLike, Picked } from "./backends.ts";
export { replayEntry, makeEntry, diffTold } from "./replay.ts";
export type { JournalEntry } from "./replay.ts";
export type { SqlJs, SqlDatabase, SqlInit } from "./sql-types.ts";
