// A small PDF text reader for Chromium's print output (Skia/PDF): flate streams, Type0 fonts with a ToUnicode map, text drawn with Tj / TJ.
// Not a general PDF parser: it exists so a test can ask "which words are on page N" with no external tool. Returns null when the file is not
// shaped like that (the caller then skips its text checks with a note).
import zlib from "node:zlib";

export function readPdf(buf) {
  const s = Buffer.from(buf).toString("latin1");
  if (!s.startsWith("%PDF-")) return null;
  const objs = new Map();
  for (const m of s.matchAll(/(\d+) 0 obj\s*([\s\S]*?)endobj/g)) objs.set(Number(m[1]), m[2]);
  const streamOf = (n) => {
    const body = objs.get(n);
    if (body === undefined) return null;
    const i = body.indexOf("stream");
    if (i < 0) return null;
    let a = i + 6;
    if (body[a] === "\r") a++;
    if (body[a] === "\n") a++;
    const raw = Buffer.from(body.slice(a, body.lastIndexOf("endstream")), "latin1");
    if (/\/FlateDecode/.test(body.slice(0, i))) { try { return zlib.inflateSync(raw).toString("latin1"); } catch { return null; } }
    return raw.toString("latin1");
  };
  const ref = (txt, key) => { const m = new RegExp(`/${key}\\s+(\\d+)\\s+0\\s+R`).exec(txt); return m ? Number(m[1]) : null; };

  // ToUnicode maps, by font object number
  const cmapCache = new Map();
  const hexU = (h) => { let out = ""; for (let i = 0; i + 3 < h.length; i += 4) out += String.fromCharCode(parseInt(h.slice(i, i + 4), 16)); return out; };
  const cmapOf = (fontObj) => {
    if (cmapCache.has(fontObj)) return cmapCache.get(fontObj);
    const map = new Map();
    const tu = ref(objs.get(fontObj) ?? "", "ToUnicode");
    const st = tu ? streamOf(tu) : null;
    if (st) {
      for (const blk of st.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) for (const m of blk[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) map.set(parseInt(m[1], 16), hexU(m[2]));
      for (const blk of st.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
        for (const m of blk[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(\[[^\]]*\]|<[0-9A-Fa-f]+>)/g)) {
          const lo = parseInt(m[1], 16), hi = parseInt(m[2], 16);
          if (m[3].startsWith("[")) { const items = [...m[3].matchAll(/<([0-9A-Fa-f]+)>/g)].map((x) => hexU(x[1])); for (let c = lo; c <= hi; c++) map.set(c, items[c - lo] ?? ""); }
          else { const base = hexU(m[3].slice(1, -1)); for (let c = lo; c <= hi; c++) map.set(c, base.slice(0, -1) + String.fromCharCode(base.charCodeAt(base.length - 1) + (c - lo))); }
        }
      }
    }
    cmapCache.set(fontObj, map);
    return map;
  };

  const pagesObj = [...objs.entries()].find(([, b]) => /\/Type\s*\/Pages\b/.test(b) && /\/Kids/.test(b) && !/\/Parent/.test(b));
  if (!pagesObj) return null;
  const kids = (function walk(body) {
    const arr = /\/Kids\s*\[([^\]]*)\]/.exec(body)?.[1] ?? "";
    const out = [];
    for (const m of arr.matchAll(/(\d+)\s+0\s+R/g)) {
      const b = objs.get(Number(m[1])) ?? "";
      if (/\/Type\s*\/Pages\b/.test(b)) out.push(...walk(b)); else out.push(Number(m[1]));
    }
    return out;
  })(pagesObj[1]);

  const pages = [];
  for (const id of kids) {
    const body = objs.get(id) ?? "";
    const mb = /\/MediaBox\s*\[([^\]]*)\]/.exec(body)?.[1]?.trim().split(/\s+/).map(Number) ?? null;
    let res = body;
    const rref = ref(body, "Resources");
    if (rref) res = objs.get(rref) ?? body;
    const fontsTxt = /\/Font\s*<<([\s\S]*?)>>/.exec(res)?.[1] ?? (ref(res, "Font") ? objs.get(ref(res, "Font")) : "") ?? "";
    const fonts = new Map();
    for (const m of fontsTxt.matchAll(/\/(F\w+)\s+(\d+)\s+0\s+R/g)) fonts.set(m[1], Number(m[2]));
    const contents = [];
    const carr = /\/Contents\s*\[([^\]]*)\]/.exec(body)?.[1];
    if (carr) for (const m of carr.matchAll(/(\d+)\s+0\s+R/g)) contents.push(Number(m[1]));
    else { const c = ref(body, "Contents"); if (c) contents.push(c); }
    const text = [];
    for (const c of contents) {
      const st = streamOf(c);
      if (!st) continue;
      let cmap = new Map();
      for (const blk of st.split(/\bBT\b/).slice(1)) {
        const part = blk.split(/\bET\b/)[0];
        let str = "";
        for (const t of part.matchAll(/\/(F\w+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f]+)>\s*Tj|\[([^\]]*)\]\s*TJ/g)) {
          if (t[1]) { cmap = cmapOf(fonts.get(t[1]) ?? -1); continue; }
          const hexes = t[2] !== undefined ? [t[2]] : [...t[3].matchAll(/<([0-9A-Fa-f]+)>/g)].map((x) => x[1]);
          for (const h of hexes) for (let i = 0; i + 3 < h.length; i += 4) str += cmap.get(parseInt(h.slice(i, i + 4), 16)) ?? "";
        }
        if (str) text.push(str);
      }
    }
    pages.push({ mediaBox: mb, text });
  }
  return { pages, size: buf.length };
}
