// The small part of sql.js this layer uses. sql.js ships no types; this keeps the code honest without adding a dependency.
export interface SqlStatement {
  bind(values?: unknown[]): boolean;
  step(): boolean;
  get(): unknown[];
  run(values?: unknown[]): void;
  free(): boolean;
}
export type SqlExecResult = { columns: string[]; values: unknown[][] };
export interface SqlDatabase {
  run(sql: string, params?: unknown[]): SqlDatabase;
  exec(sql: string, params?: unknown[]): SqlExecResult[];
  prepare(sql: string, params?: unknown[]): SqlStatement;
  export(): Uint8Array;
  close(): void;
}
export interface SqlJs {
  Database: new (data?: ArrayLike<number> | null) => SqlDatabase;
}
export type SqlInit = (config?: { locateFile?: (file: string) => string; wasmBinary?: ArrayBuffer | Uint8Array }) => Promise<SqlJs>;
