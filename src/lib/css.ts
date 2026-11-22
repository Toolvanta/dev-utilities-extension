export interface Declaration { property: string; value: string }

export function parseDeclarations(cssText: string): Declaration[] {
  return cssText
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const index = part.indexOf(':');
      if (index < 0) return { property: part, value: '' };
      return { property: part.slice(0, index).trim(), value: part.slice(index + 1).trim() };
    });
}

export function declarationsToCss(declarations: Declaration[], selector = ':root'): string {
  const body = declarations
    .filter((d) => d.property && d.value)
    .map((d) => `  ${d.property}: ${d.value};`)
    .join('\n');
  return `${selector} {\n${body}\n}`;
}

const UNIT_FACTORS: Record<string, number> = {
  px: 1,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  pt: 96 / 72,
  pc: 16,
  q: 96 / 101.6,
};

export function toPixels(value: number, unit: string, rootFontSize = 16, viewport = 1440, container = 1440): number {
  if (UNIT_FACTORS[unit]) return value * UNIT_FACTORS[unit];
  if (unit === 'rem') return value * rootFontSize;
  if (unit === 'em') return value * rootFontSize;
  if (unit === 'vw') return (value / 100) * viewport;
  if (unit === 'vh') return (value / 100) * 900;
  if (unit === 'vmin') return (value / 100) * Math.min(viewport, 900);
  if (unit === 'vmax') return (value / 100) * Math.max(viewport, 900);
  if (unit === '%') return (value / 100) * container;
  return value;
}

export function fromPixels(px: number, unit: string, rootFontSize = 16, viewport = 1440): number {
  if (UNIT_FACTORS[unit]) return px / UNIT_FACTORS[unit];
  if (unit === 'rem' || unit === 'em') return px / rootFontSize;
  if (unit === 'vw') return (px / viewport) * 100;
  if (unit === 'vh') return (px / 900) * 100;
  if (unit === '%') return px;
  return px;
}

export function round(value: number, digits = 3): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export function clampCssValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
