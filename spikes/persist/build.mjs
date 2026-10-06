// Builds dist/persist-spike.html: one file, sql.js JS + WASM (base64) + app all inlined. No network at runtime.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const here = new URL('.', import.meta.url).pathname;
const dist = here + 'dist/'; mkdirSync(dist, { recursive: true });
const sqljs = readFileSync(here + 'node_modules/sql.js/dist/sql-wasm-browser.js', 'utf8');
const wasm = readFileSync(here + 'node_modules/sql.js/dist/sql-wasm-browser.wasm').toString('base64');
const app = (await build({ entryPoints: [here + 'app.js'], bundle: true, minify: true, format: 'iife', write: false, target: 'chrome110' })).outputFiles[0].text;
const safe = (s) => s.replaceAll('</script', '<\\/script');
const scripts = `<script>${safe(sqljs)}</script>\n<script>window.__WASM_B64__="${wasm}";</script>\n<script>${safe(app)}</script>`;
const html = readFileSync(here + 'template.html', 'utf8').replace('<!--SCRIPTS-->', () => scripts);
writeFileSync(dist + 'persist-spike.html', html);
console.log('built', (html.length / 1024).toFixed(0) + ' KB', '(wasm ' + (wasm.length / 1024).toFixed(0) + ' KB b64)');
