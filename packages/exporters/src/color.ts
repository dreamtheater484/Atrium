/** Atrium's export palette, as pptxgenjs-style hex (no "#"). */
export const PALETTE = {
  text: '1F2433',
  muted: '5B6275',
  faint: '9AA0AE',
  line: 'E4E7EE',
  soft: 'F5F6FA',
  accent: '4F46E5',
  good: '2F9E7A',
  watch: 'E0A526',
  act: 'D9534F',
  unknown: 'C7CBD4',
  white: 'FFFFFF',
} as const;

export type ToneName = 'good' | 'watch' | 'act' | 'neutral';

export const TONE_COLOR: Record<ToneName, string> = {
  good: PALETTE.good,
  watch: PALETTE.watch,
  act: PALETTE.act,
  neutral: PALETTE.accent,
};

const NAMED: Record<string, string> = {
  white: 'FFFFFF',
  black: '000000',
  red: 'FF0000',
  green: '008000',
  blue: '0000FF',
  gray: '808080',
  grey: '808080',
  orange: 'FFA500',
  yellow: 'FFFF00',
  purple: '800080',
  indigo: '4B0082',
  teal: '008080',
};

const clampByte = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const byteHex = (n: number) => clampByte(n).toString(16).padStart(2, '0').toUpperCase();

function parseChannel(raw: string): number {
  const s = raw.trim();
  if (s.endsWith('%')) return (Number.parseFloat(s) / 100) * 255;
  return Number.parseFloat(s);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const conv = (t0: number) => {
    let t = t0;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [conv(hue + 1 / 3) * 255, conv(hue) * 255, conv(hue - 1 / 3) * 255];
}

/**
 * Converts a CSS colour to the "RRGGBB" form pptxgenjs and exceljs expect.
 * Accepts "#rgb", "#rrggbb", "#rrggbbaa", bare hex, "rgb(r,g,b)", "rgba(...)",
 * "hsl(...)" and a few colour names. Anything else returns `fallback`.
 */
export function toHex(
  color: string | null | undefined,
  fallback: string = PALETTE.unknown,
): string {
  if (!color) return fallback;
  const c = color.trim().toLowerCase();
  if (NAMED[c]) return NAMED[c];

  const hex = c.startsWith('#') ? c.slice(1) : c;
  if (/^[0-9a-f]+$/.test(hex)) {
    if (hex.length === 3 || hex.length === 4) {
      return hex
        .slice(0, 3)
        .split('')
        .map((ch) => ch + ch)
        .join('')
        .toUpperCase();
    }
    if (hex.length === 6 || hex.length === 8) return hex.slice(0, 6).toUpperCase();
  }

  const fn = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(c);
  if (fn) {
    const parts = fn[2]!
      .split(/[\s,/]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length < 3) return fallback;
    if (fn[1]!.startsWith('rgb')) {
      const [r, g, b] = parts.slice(0, 3).map(parseChannel) as [number, number, number];
      if ([r, g, b].some((n) => Number.isNaN(n))) return fallback;
      return byteHex(r) + byteHex(g) + byteHex(b);
    }
    const h = Number.parseFloat(parts[0]!);
    const s = Number.parseFloat(parts[1]!) / 100;
    const l = Number.parseFloat(parts[2]!) / 100;
    if ([h, s, l].some((n) => Number.isNaN(n))) return fallback;
    const [r, g, b] = hslToRgb(h, s, l);
    return byteHex(r) + byteHex(g) + byteHex(b);
  }
  return fallback;
}

function rgb(hex: string): [number, number, number] {
  const h = toHex(hex);
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

/** Mixes two colours; `t` = 0 gives `a`, 1 gives `b`. */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  return byteHex(ar + (br - ar) * t) + byteHex(ag + (bg - ag) * t) + byteHex(ab + (bb - ab) * t);
}

/** A lighter version of `hex`; `amount` 0.9 is a very soft background tint. */
export function tint(hex: string, amount: number): string {
  return mix(hex, 'FFFFFF', amount);
}

function luminance(hex: string): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Dark slate or white for text on `background`. White wins whenever it is comfortably
 * legible (3:1, fine for the bold short labels on shapes), which keeps saturated fills crisp.
 */
export function readableText(background: string): string {
  const white = contrast(background, PALETTE.white);
  if (white >= 3) return PALETTE.white;
  return contrast(background, PALETTE.text) >= white ? PALETTE.text : PALETTE.white;
}
