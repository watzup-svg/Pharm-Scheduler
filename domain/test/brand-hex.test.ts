// The hexagon the app draws must be the logo's hexagon: same width to height ratio and the same corner positions.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { decodePng } from "../../e2e/support/png.mjs";
import { HEX_RATIO, HEX_SHOULDER, hexPoints } from "../../app3/ui/hexShape.ts";

function logoOutline() {
  const { width: W, height: H, data } = decodePng(fs.readFileSync(new URL("../../app3/assets/brand/hsp-badge.png", import.meta.url)));
  const dark = (x: number, y: number) => { const i = (y * W + x) * 4; return data[i + 3]! > 128 && data[i]! < 90 && data[i + 1]! < 90 && data[i + 2]! < 90; };
  const seen = new Uint8Array(W * H);
  let best: number[][] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!dark(x, y) || seen[y * W + x]) continue;
    const pts: number[][] = [], q = [[x, y]];
    seen[y * W + x] = 1;
    while (q.length) {
      const [cx, cy] = q.pop()!; pts.push([cx!, cy!]);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx! + dx, ny = cy! + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && dark(nx, ny) && !seen[ny * W + nx]) { seen[ny * W + nx] = 1; q.push([nx, ny]); }
      }
    }
    if (pts.length > best.length) best = pts;
  }
  const xs = best.map((p) => p[0]!), ys = best.map((p) => p[1]!);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  // the row where the left edge stops sloping and becomes the upright side
  let corner = y0;
  for (let y = y0; y <= y1; y++) { const row = best.filter((p) => p[1] === y).map((p) => p[0]!); if (row.length && Math.min(...row) === x0) { corner = y; break; } }
  return { ratio: (x1 - x0 + 1) / (y1 - y0 + 1), shoulder: (corner - y0) / (y1 - y0 + 1) };
}

test("the app's hexagon has the logo's width to height ratio", () => {
  const m = logoOutline();
  assert.ok(Math.abs(HEX_RATIO - m.ratio) / m.ratio < 0.01, `app ${HEX_RATIO.toFixed(3)} vs logo ${m.ratio.toFixed(3)}`);
  assert.ok(Math.abs(HEX_SHOULDER - m.shoulder) < 0.02, `shoulder ${HEX_SHOULDER} vs logo ${m.shoulder.toFixed(3)}`);
});

test("hexPoints draws six points with a tip at the top and bottom and upright sides", () => {
  const p = hexPoints(162, 100, 2).split(" ").map((s) => s.split(",").map(Number));
  assert.equal(p.length, 6);
  assert.equal(p[0]![0], 81); assert.equal(p[3]![0], 81);
  assert.equal(p[1]![0], p[2]![0]); assert.equal(p[4]![0], p[5]![0]);
  assert.ok(p[0]![1]! < p[1]![1]! && p[3]![1]! > p[2]![1]!);
});
