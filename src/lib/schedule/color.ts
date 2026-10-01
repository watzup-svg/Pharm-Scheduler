/** Eight ink tones from @theme --color-p0 … p7. Hash of name → stable index. */
const PERSON_TONE_COUNT = 8;

export function personToneIndex(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % PERSON_TONE_COUNT;
}

export function personToneClass(name: string, overrideHex?: string): string {
  if (normalizeHex(overrideHex)) return "";
  return `text-p${personToneIndex(name)}`;
}

/** RGB for jsPDF, matching --color-p0…p7 */
const PERSON_RGB: [number, number, number][] = [
  [30, 61, 52],
  [61, 42, 28],
  [28, 48, 74],
  [74, 30, 46],
  [46, 58, 28],
  [58, 28, 74],
  [28, 64, 58],
  [74, 48, 28],
];

function rgbToHex(rgb: [number, number, number]): string {
  return `#${rgb.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

export const PERSON_SWATCHES: string[] = PERSON_RGB.map(rgbToHex);

function normalizeHex(value?: string): string {
  const hex = value?.trim() ?? "";
  if (!/^#?[0-9a-fA-F]{6}$/.test(hex)) return "";
  return hex.startsWith("#") ? hex.toLowerCase() : `#${hex.toLowerCase()}`;
}

export function personRgb(name: string, overrideHex?: string): [number, number, number] {
  const hex = normalizeHex(overrideHex);
  if (hex) {
    const h = hex.slice(1);
    return [
      Number.parseInt(h.slice(0, 2), 16),
      Number.parseInt(h.slice(2, 4), 16),
      Number.parseInt(h.slice(4, 6), 16),
    ];
  }
  return PERSON_RGB[personToneIndex(name)] ?? PERSON_RGB[0]!;
}

export function personColorHex(name: string, overrideHex?: string): string {
  const hex = normalizeHex(overrideHex);
  if (hex) return hex;
  return rgbToHex(personRgb(name));
}

export function toGray(rgb: [number, number, number]): [number, number, number] {
  const y = Math.round(0.3 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2]);
  return [y, y, y];
}
