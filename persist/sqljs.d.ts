// sql.js has no bundled types. Declared here (not a module file, so these are ambient declarations).
declare module "sql.js" {
  const initSqlJs: import("./sql-types.ts").SqlInit;
  export default initSqlJs;
}
declare module "sql.js/dist/sql-wasm-browser.js" {
  const initSqlJs: import("./sql-types.ts").SqlInit;
  export default initSqlJs;
}
