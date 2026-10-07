// The Hi-School badge outline is a hexagon with a point at the top and bottom, upright sides, and about 1.62 times as wide as it is tall.
// Everything in the app that draws a hexagon uses this one shape so it matches the logo. Measured from app3/assets/brand/hsp-badge.png
// (largest dark outline: 397 x 245 px, the upper and lower corners 24.7% of the height in from the tips); domain/test/brand-hex.test.ts re-measures
// the file and fails if these numbers drift.
export const HEX_RATIO = 397 / 245;
export const HEX_SHOULDER = 0.247;

/** Points for a logo-shaped hexagon filling a w x h box, inset by `pad` on every side (use half the stroke width). */
export function hexPoints(w: number, h: number, pad = 0): string {
  const l = pad, r = w - pad, t = pad, b = h - pad, sh = (b - t) * HEX_SHOULDER;
  const pts: [number, number][] = [[w / 2, t], [r, t + sh], [r, b - sh], [w / 2, b], [l, b - sh], [l, t + sh]];
  return pts.map(([x, y]) => `${+x.toFixed(2)},${+y.toFixed(2)}`).join(" ");
}
