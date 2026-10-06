/// <reference types="vite/client" />
declare const __BUILD__: { at: string; sha: string };
declare module "*?worker&inline" { const W: { new (): Worker }; export default W; }
