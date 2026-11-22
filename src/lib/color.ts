export interface RGB { r: number; g: number; b: number; a?: number }
export interface HSL { h: number; s: number; l: number }

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const round = (n: number, digits = 0) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

export function hexToRgb(hex: string): RGB | null {
  const clean = hex.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(clean)) {
    return {
      r: parseInt(clean[0] + clean[0], 16),
      g: parseInt(clean[1] + clean[1], 16),
      b: parseInt(clean[2] + clean[2], 16),
    };
  }
  if (/^[0-9a-f]{6}$/i.test(clean)) {
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
    };
  }
  if (/^[0-9a-f]{8}$/i.test(clean)) {
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
      a: round(parseInt(clean.slice(6, 8), 16) / 255, 2),
    };
  }
  return null;
}

export function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function rgbToHsl(r: number, g: number, b: number): HSL {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h: round(h), s: round(s * 100), l: round(l * 100) };
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let parts: number[] = [0, 0, 0];
  if (h < 60) parts = [c, x, 0];
  else if (h < 120) parts = [x, c, 0];
  else if (h < 180) parts = [0, c, x];
  else if (h < 240) parts = [0, x, c];
  else if (h < 300) parts = [x, 0, c];
  else parts = [c, 0, x];
  return {
    r: Math.round((parts[0] + m) * 255),
    g: Math.round((parts[1] + m) * 255),
    b: Math.round((parts[2] + m) * 255),
  };
}

export function parseColor(input: string): RGB | null {
  const value = input.trim();
  if (!value) return null;
  const hex = hexToRgb(value);
  if (hex) return hex;

  const rgba = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/i);
  if (rgba) {
    const a = rgba[4] === undefined ? 1 : Number(rgba[4]);
    return { r: clamp(Number(rgba[1]), 0, 255), g: clamp(Number(rgba[2]), 0, 255), b: clamp(Number(rgba[3]), 0, 255), a: clamp(a, 0, 1) };
  }

  const hsla = value.match(/^hsla?\(\s*([\d.]+)[,\s]+([\d.]+)%?[,\s]+([\d.]+)%?(?:[,\s/]+([\d.]+))?\s*\)$/i);
  if (hsla) {
    const rgb = hslToRgb(Number(hsla[1]), Number(hsla[2]), Number(hsla[3]));
    return { ...rgb, a: hsla[4] === undefined ? 1 : clamp(Number(hsla[4]), 0, 1) };
  }

  // Fall back to the browser's CSS parser (supports named colors, color(display-p3 ...), etc.)
  try {
    const el = document.createElement('span');
    el.style.color = '';
    el.style.color = value;
    document.body.appendChild(el);
    const computed = getComputedStyle(el).color;
    el.remove();
    if (!computed) return null;
    const match = computed.match(/[\d.]+/g);
    if (!match || match.length < 3) return null;
    return { r: Number(match[0]), g: Number(match[1]), b: Number(match[2]), a: match[3] === undefined ? 1 : Number(match[3]) };
  } catch {
    return null;
  }
}

export function formatColor(color: RGB, format: 'hex' | 'rgb' | 'hsl' | 'tailwind' = 'hex'): string {
  const { r, g, b, a = 1 } = color;
  if (format === 'hex') {
    const base = rgbToHex(r, g, b);
    if (a < 1) return base + Math.round(a * 255).toString(16).padStart(2, '0');
    return base;
  }
  if (format === 'rgb') {
    return a < 1 ? `rgba(${r}, ${g}, ${b}, ${round(a, 2)})` : `rgb(${r}, ${g}, ${b})`;
  }
  if (format === 'hsl') {
    const { h, s, l } = rgbToHsl(r, g, b);
    return a < 1 ? `hsla(${h}, ${s}%, ${l}%, ${round(a, 2)})` : `hsl(${h}, ${s}%, ${l}%)`;
  }
  return `rgb(${r} ${g} ${b}${a < 1 ? ` / ${round(a, 2)}` : ''})`;
}

export function luminance(color: RGB): number {
  const channel = (v: number) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

export function contrastRatio(a: RGB, b: RGB): number {
  const l1 = luminance(a), l2 = luminance(b);
  const light = Math.max(l1, l2), dark = Math.min(l1, l2);
  return round((light + 0.05) / (dark + 0.05), 2);
}

export function readableTextColor(background: RGB): string {
  return contrastRatio(background, { r: 255, g: 255, b: 255 }) >= contrastRatio(background, { r: 0, g: 0, b: 0 })
    ? '#ffffff'
    : '#000000';
}

export function randomHex(): string {
  return rgbToHex(Math.random() * 256, Math.random() * 256, Math.random() * 256);
}

export function shiftLightness(color: RGB, amount: number): RGB {
  const { h, s, l } = rgbToHsl(color.r, color.g, color.b);
  return hslToRgb(h, s, clamp(l + amount, 0, 100));
}

export function shiftHue(color: RGB, degrees: number): RGB {
  const { h, s, l } = rgbToHsl(color.r, color.g, color.b);
  return hslToRgb((h + degrees + 360) % 360, s, l);
}

export type Harmony = 'complementary' | 'analogous' | 'triadic' | 'tetradic' | 'monochromatic' | 'shades';

export function paletteFromColor(color: RGB, harmony: Harmony): RGB[] {
  switch (harmony) {
    case 'complementary':
      return [color, shiftHue(color, 180)];
    case 'analogous':
      return [shiftHue(color, -30), color, shiftHue(color, 30)];
    case 'triadic':
      return [color, shiftHue(color, 120), shiftHue(color, 240)];
    case 'tetradic':
      return [color, shiftHue(color, 90), shiftHue(color, 180), shiftHue(color, 270)];
    case 'monochromatic':
      return [-40, -20, 0, 20, 40].map((d) => shiftLightness(color, d));
    case 'shades':
      return [-50, -30, -10, 10, 30, 50].map((d) => shiftLightness(color, d));
  }
}
