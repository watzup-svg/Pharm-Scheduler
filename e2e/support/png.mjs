// A tiny PNG reader/writer on node:zlib (no dependency). Reads 8-bit RGB / RGBA non-interlaced files, which is what the browser's screenshot
// call produces; writes 8-bit RGBA. Used by the pixel-comparison suite.
import zlib from "node:zlib";

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** -> { width, height, data: Uint8Array RGBA } */
export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error("not a PNG");
  let pos = 8, width = 0, height = 0, depth = 0, ctype = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("latin1", pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; ctype = body[9]; interlace = body[12]; }
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (depth !== 8 || (ctype !== 2 && ctype !== 6) || interlace !== 0) throw new Error(`unsupported PNG (depth ${depth}, colour type ${ctype}, interlace ${interlace})`);
  const bpp = ctype === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  if (raw.length !== (stride + 1) * height) throw new Error("PNG data has the wrong length");
  const out = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  let cur = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      else if (f !== 0) throw new Error(`bad PNG filter ${f}`);
      cur[i] = v & 255;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      out[o] = cur[x * bpp]; out[o + 1] = cur[x * bpp + 1]; out[o + 2] = cur[x * bpp + 2]; out[o + 3] = bpp === 4 ? cur[x * bpp + 3] : 255;
    }
    [prev, cur] = [cur, prev];
  }
  return { width, height, data: out };
}

/** RGBA -> PNG bytes. Each row picks the filter (none, sub, up, average, Paeth) with the smallest sum of absolute values, which makes flat UI pictures much smaller. */
export function encodePng({ width, height, data }, { level = 9 } = {}) {
  const bpp = 4;
  const stride = width * bpp;
  const raw = Buffer.alloc((stride + 1) * height);
  const cand = [0, 1, 2, 3, 4].map(() => new Uint8Array(stride));
  const zero = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const cur = data.subarray(y * stride, (y + 1) * stride);
    const prev = y ? data.subarray((y - 1) * stride, y * stride) : zero;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      cand[0][i] = cur[i];
      cand[1][i] = (cur[i] - a) & 255;
      cand[2][i] = (cur[i] - b) & 255;
      cand[3][i] = (cur[i] - ((a + b) >> 1)) & 255;
      cand[4][i] = (cur[i] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
    }
    let best = 0, bestSum = Infinity;
    for (let f = 0; f < 5; f++) { let sum = 0; const c = cand[f]; for (let i = 0; i < stride; i++) sum += c[i] < 128 ? c[i] : 256 - c[i]; if (sum < bestSum) { bestSum = sum; best = f; } }
    raw[y * (stride + 1)] = best;
    raw.set(cand[best], y * (stride + 1) + 1);
  }
  const chunk = (type, body) => {
    const b = Buffer.alloc(12 + body.length);
    b.writeUInt32BE(body.length, 0); b.write(type, 4, "latin1"); body.copy(b, 8);
    b.writeUInt32BE(crc32(b.subarray(4, 8 + body.length)), 8 + body.length);
    return b;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([SIG, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level })), chunk("IEND", Buffer.alloc(0))]);
}

/**
 * Compare two RGBA images of the same size. A pixel differs when any channel differs by more than `threshold` (0-255).
 * Returns { differing, total, ratio, bbox, diff } where diff is an RGBA image: the new picture faded, with differing pixels in red.
 */
export function diffImages(a, b, threshold = 24) {
  if (a.width !== b.width || a.height !== b.height) return { sizeMismatch: true, differing: Infinity, total: a.width * a.height, ratio: 1, bbox: null, diff: null };
  const n = a.width * a.height;
  const diff = new Uint8Array(n * 4);
  let differing = 0, x0 = a.width, y0 = a.height, x1 = -1, y1 = -1;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const d = Math.max(Math.abs(a.data[o] - b.data[o]), Math.abs(a.data[o + 1] - b.data[o + 1]), Math.abs(a.data[o + 2] - b.data[o + 2]), Math.abs(a.data[o + 3] - b.data[o + 3]));
    if (d > threshold) {
      differing++;
      const x = i % a.width, y = (i / a.width) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      diff[o] = 230; diff[o + 1] = 20; diff[o + 2] = 20; diff[o + 3] = 255;
    } else {
      const g = 255 - ((255 - b.data[o]) * 0.25) | 0;
      diff[o] = g; diff[o + 1] = g; diff[o + 2] = g; diff[o + 3] = 255;
    }
  }
  return { differing, total: n, ratio: differing / n, bbox: differing ? [x0, y0, x1, y1] : null, diff: { width: a.width, height: a.height, data: diff } };
}
