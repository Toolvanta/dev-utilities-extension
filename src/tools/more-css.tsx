import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  Badge, Button, Card, CodeBlock, CopyButton, EmptyState, Field, IconButton, Input,
  ListItem, Notice, Segmented, Select, Stat, Swatch, Tabs, Textarea, Toggle, ToolHeader,
} from '../components/ui';
import { copyText, downloadText, formatBytes, timestampName, uid } from '../lib/utils';
import {
  formatColor, paletteFromColor, parseColor, randomHex, readableTextColor, shiftLightness,
} from '../lib/color';
import type { Harmony } from '../lib/color';
import { getLocal, setLocal } from '../lib/storage';
import { describeError } from '../lib/messaging';

/* ------------------------------------------------------------------ */
/* Shared local helpers                                                */
/* ------------------------------------------------------------------ */

function attempt<T>(fn: () => T): { value: T | null; error: string } {
  try { return { value: fn(), error: '' }; }
  catch (e) { return { value: null, error: describeError(e) }; }
}

const num = (value: string | number, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const byteLength = (value: string): number => new TextEncoder().encode(value).length;

function saveCss(value: string, prefix: string, onError: (message: string) => void): void {
  try {
    if (!value.trim()) throw new Error('There is no CSS to download.');
    downloadText(value, timestampName(prefix, 'css'), 'text/css');
    onError('');
  } catch (e) { onError(describeError(e)); }
}

function normalizeColor(value: string): string {
  const parsed = parseColor(value);
  return parsed ? formatColor(parsed, 'hex') : value.trim() || '#000000';
}

/** Small persisted settings bag. All storage access is guarded and reported. */
function usePersisted<T extends object>(key: string, fallback: T) {
  const [state, setState] = useState<T>(fallback);
  const [error, setError] = useState('');
  const ref = useRef<T>(fallback);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await getLocal<Partial<T>>(key, {} as Partial<T>);
        if (cancelled || !stored || typeof stored !== 'object') return;
        const merged = { ...fallback, ...stored } as T;
        ref.current = merged;
        setState(merged);
      } catch (e) { if (!cancelled) setError(describeError(e)); }
    })();
    return () => { cancelled = true; };
  }, [key]);

  const update = (patch: Partial<T>): void => {
    const merged = { ...ref.current, ...patch } as T;
    ref.current = merged;
    setState(merged);
    void setLocal(key, merged).catch((e: unknown) => setError(describeError(e)));
  };
  return { state, update, error, setError };
}

const CSS_PUNCT = /[{}:;,>+~()]/;

/** Comment- and string-aware CSS compressor. */
function minifyCss(input: string): string {
  let out = '';
  let quote = '';
  let i = 0;
  const canSpace = (): boolean => !!out && !CSS_PUNCT.test(out[out.length - 1]);
  while (i < input.length) {
    const ch = input[i];
    if (quote) {
      out += ch;
      if (ch === '\\' && i + 1 < input.length) { out += input[i + 1]; i += 2; continue; }
      if (ch === quote) quote = '';
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; out += ch; i += 1; continue; }
    if (ch === '/' && input[i + 1] === '*') {
      const end = input.indexOf('*/', i + 2);
      if (canSpace()) out += ' ';
      i = end < 0 ? input.length : end + 2;
      continue;
    }
    if (/\s/.test(ch)) {
      const next = input.slice(i + 1).match(/\S/)?.[0] || '';
      const keep = !CSS_PUNCT.test(next) || (next === '(' && /@[\w-]+$/.test(out));
      if (canSpace() && keep) out += ' ';
      i += 1;
      continue;
    }
    if (CSS_PUNCT.test(ch)) {
      out = out.replace(/\s+$/, '');
      if (ch === '}') out = out.replace(/;$/, '');
      out += ch;
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out.trim();
}

/** Turn compact CSS into indented rules, one declaration per line. */
function formatCss(input: string, indent: number): string {
  const compact = minifyCss(input);
  const pad = ' '.repeat(indent);
  let level = 0;
  let buffer = '';
  let out = '';
  const flush = (): void => {
    const text = buffer.trim();
    buffer = '';
    if (text) out += `${pad.repeat(level)}${text}\n`;
  };
  for (const ch of compact) {
    if (ch === '{') {
      flush();
      out += `${pad.repeat(level)}{\n`;
      level += 1;
    } else if (ch === '}') {
      flush();
      level = Math.max(0, level - 1);
      out += `${pad.repeat(level)}}\n`;
    } else if (ch === ';') {
      buffer += ch;
      flush();
    } else {
      buffer += ch;
    }
  }
  flush();
  return out.trim() ? `${out.trim()}\n` : '';
}

function stripCssComments(input: string, keepLicense: boolean): { output: string; removed: number; kept: number } {
  let out = '';
  let quote = '';
  let removed = 0;
  let kept = 0;
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (quote) {
      out += ch;
      if (ch === '\\' && i + 1 < input.length) { out += input[i + 1]; i += 2; continue; }
      if (ch === quote) quote = '';
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; out += ch; i += 1; continue; }
    if (ch === '/' && input[i + 1] === '*') {
      const end = input.indexOf('*/', i + 2);
      const stop = end < 0 ? input.length : end + 2;
      const comment = input.slice(i, stop);
      if (keepLicense && comment.startsWith('/*!')) { out += comment; kept += 1; }
      else removed += 1;
      i = stop;
      continue;
    }
    out += ch;
    i += 1;
  }
  return { output: out, removed, kept };
}

/* ------------------------------------------------------------------ */
/* 1. CSS Minifier                                                     */
/* ------------------------------------------------------------------ */

export function CssMinifierTool() {
  const [source, setSource] = useState('/* Example card */\n.card { color: #ffffff;  padding: 0 12px; }\n.card:hover { color: rgb(0, 0, 0); }');
  const [error, setError] = useState('');
  const { value: output, error: calcError } = attempt(() => minifyCss(source));
  const minified = output || '';
  const before = byteLength(source);
  const after = byteLength(minified);
  const saved = before ? clamp(((before - after) / before) * 100, 0, 100) : 0;

  return (
    <div className="stack">
      <ToolHeader
        title="CSS Minifier"
        description="Strip comments, collapse whitespace and remove spaces around punctuation."
        badge={`${saved.toFixed(1)}% smaller`}
        actions={<Button variant="primary" onClick={() => saveCss(minified, 'minified', setError)} disabled={!minified}>Download</Button>}
      />
      <Notice>{error}</Notice>
      <Notice>{calcError}</Notice>
      <Card title="Input CSS" actions={<Badge>{formatBytes(before)}</Badge>}>
        <Textarea rows={10} value={source} spellCheck={false} placeholder="Paste CSS here…" onChange={(e) => setSource(e.target.value)} />
      </Card>
      <Card title="Minified output" actions={<CopyButton value={minified} label="Copy minified" />}>
        <div className="grid-3">
          <Stat label="Before" value={formatBytes(before)} hint={`${before} bytes`} />
          <Stat label="After" value={formatBytes(after)} hint={`${after} bytes`} />
          <Stat label="Saved" value={`${saved.toFixed(1)}%`} hint={`${Math.max(0, before - after)} bytes removed`} />
        </div>
        <CodeBlock value={minified} title="Minified CSS" maxHeight={230} />
      </Card>
      <Card title="What is changed">
        <div className="result-list">
          <ListItem title="Comments" subtitle="Both /* … */ comments and extra blank lines are removed." />
          <ListItem title="Whitespace" subtitle="Runs of whitespace collapse to a single space, then drop next to punctuation." />
          <ListItem title="Strings stay intact" subtitle="Quoted values such as content: 'a, b' are never rewritten." />
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 2. CSS Formatter                                                     */
/* ------------------------------------------------------------------ */

export function CssFormatterTool() {
  const { state, update, error } = usePersisted<{ indent: '2' | '4' }>('cssFormatter', { indent: '2' });
  const [source, setSource] = useState('.card{color:#fff;padding:0 12px}.card:hover{color:#000}@media (min-width:700px){.card{padding:16px}}');
  const [saveError, setSaveError] = useState('');
  const { value: output, error: calcError } = attempt(() => formatCss(source, num(state.indent, 2)));
  const pretty = output || '';

  return (
    <div className="stack">
      <ToolHeader
        title="CSS Formatter"
        description="Turn compact or minified CSS into readable, indented rules."
        badge={`${state.indent} spaces`}
        actions={<Button variant="primary" onClick={() => saveCss(pretty, 'formatted', setSaveError)} disabled={!pretty}>Download</Button>}
      />
      <Notice>{error}</Notice>
      <Notice>{saveError}</Notice>
      <Notice>{calcError}</Notice>
      <Card title="Compact CSS" actions={<Button variant="ghost" onClick={() => setSource('')} disabled={!source}>Clear</Button>}>
        <Textarea rows={8} value={source} spellCheck={false} placeholder="Paste minified CSS…" onChange={(e) => setSource(e.target.value)} />
      </Card>
      <Card title="Indent size">
        <Segmented
          options={[{ value: '2', label: '2 spaces' }, { value: '4', label: '4 spaces' }]}
          value={state.indent}
          onChange={(value) => update({ indent: value as '2' | '4' })}
        />
        <p className="muted">The preference is saved locally and reused next time this tool opens.</p>
      </Card>
      <Card title="Formatted output" actions={<CopyButton value={pretty} label="Copy CSS" />}>
        <CodeBlock value={pretty} title="Readable CSS" maxHeight={320} />
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 4. CSS Grid Builder                                                  */
/* ------------------------------------------------------------------ */

export function CssGridBuilderTool() {
  const { state, update, error } = usePersisted<{
    columns: number; rows: number; gap: number; flow: 'row' | 'column' | 'row dense' | 'column dense';
  }>('cssGridBuilder', { columns: 3, rows: 3, gap: 10, flow: 'row' });
  const columns = clamp(Math.round(num(state.columns, 3)), 1, 12);
  const rows = clamp(Math.round(num(state.rows, 3)), 1, 8);
  const gap = clamp(Math.round(num(state.gap, 10)), 0, 80);
  const { value: css, error: calcError } = attempt(() => [
    '.grid {',
    '  display: grid;',
    `  grid-template-columns: repeat(${columns}, minmax(0, 1fr));`,
    `  grid-template-rows: repeat(${rows}, minmax(48px, auto));`,
    `  gap: ${gap}px;`,
    `  grid-auto-flow: ${state.flow};`,
    '}',
  ].join('\n'));
  const previewStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows}, minmax(48px, auto))`,
    gap: `${gap}px`,
    gridAutoFlow: state.flow,
  };

  return (
    <div className="stack">
      <ToolHeader title="CSS Grid Builder" description="Design grid tracks and preview numbered cells instantly." badge={`${columns} × ${rows}`} />
      <Notice>{error}</Notice>
      <Notice>{calcError}</Notice>
      <Card title="Grid settings">
        <div className="grid-2">
          <Field label="Columns"><Input type="number" min={1} max={12} value={state.columns} onChange={(e) => update({ columns: num(e.target.value, 1) })} /></Field>
          <Field label="Rows"><Input type="number" min={1} max={8} value={state.rows} onChange={(e) => update({ rows: num(e.target.value, 1) })} /></Field>
          <Field label="Gap (px)" hint={`${gap}px between cells`}>
            <Input type="range" min={0} max={40} value={gap} onChange={(e) => update({ gap: num(e.target.value) })} />
          </Field>
          <Field label="Auto flow">
            <Select value={state.flow} onChange={(e) => update({ flow: e.target.value as typeof state.flow })}>
              <option value="row">row</option>
              <option value="column">column</option>
              <option value="row dense">row dense</option>
              <option value="column dense">column dense</option>
            </Select>
          </Field>
        </div>
      </Card>
      <Card title="Live preview" actions={<Badge>{columns * rows} cells</Badge>}>
        <div className="preview-box" style={previewStyle}>
          {Array.from({ length: columns * rows }, (_, index) => (
            <div key={index} className="chip mono" style={{ display: 'grid', placeItems: 'center', minHeight: 40, background: 'var(--surface-2)' }}>{index + 1}</div>
          ))}
        </div>
      </Card>
      <Card title="Generated CSS" actions={<CopyButton value={css || ''} label="Copy CSS" />}>
        <CodeBlock value={css || ''} title="Grid CSS" maxHeight={200} />
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 5. Flexbox Playground                                                */
/* ------------------------------------------------------------------ */

export function FlexboxPlaygroundTool() {
  const { state, update, error } = usePersisted<{
    direction: 'row' | 'row-reverse' | 'column' | 'column-reverse';
    justify: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around' | 'space-evenly';
    align: 'stretch' | 'flex-start' | 'center' | 'flex-end' | 'baseline';
    wrap: 'nowrap' | 'wrap' | 'wrap-reverse';
    gap: number;
  }>('flexboxPlayground', {
    direction: 'row', justify: 'space-between', align: 'center', wrap: 'wrap', gap: 10,
  });
  const gap = clamp(Math.round(num(state.gap, 10)), 0, 60);
  const { value: css, error: calcError } = attempt(() => [
    '.flex {',
    '  display: flex;',
    `  flex-direction: ${state.direction};`,
    `  justify-content: ${state.justify};`,
    `  align-items: ${state.align};`,
    `  flex-wrap: ${state.wrap};`,
    `  gap: ${gap}px;`,
    '}',
  ].join('\n'));
  const previewStyle: CSSProperties = {
    display: 'flex',
    flexDirection: state.direction,
    justifyContent: state.justify,
    alignItems: state.align,
    flexWrap: state.wrap,
    gap: `${gap}px`,
    minHeight: 150,
  };

  return (
    <div className="stack">
      <ToolHeader title="Flexbox Playground" description="Experiment with flex alignment and copy the resulting CSS." badge={state.direction} />
      <Notice>{error}</Notice>
      <Notice>{calcError}</Notice>
      <Card title="Container settings">
        <div className="grid-2">
          <Field label="flex-direction">
            <Select value={state.direction} onChange={(e) => update({ direction: e.target.value as typeof state.direction })}>
              {['row', 'row-reverse', 'column', 'column-reverse'].map((value) => <option key={value} value={value}>{value}</option>)}
            </Select>
          </Field>
          <Field label="justify-content">
            <Select value={state.justify} onChange={(e) => update({ justify: e.target.value as typeof state.justify })}>
              {['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'].map((value) => <option key={value} value={value}>{value}</option>)}
            </Select>
          </Field>
          <Field label="align-items">
            <Select value={state.align} onChange={(e) => update({ align: e.target.value as typeof state.align })}>
              {['stretch', 'flex-start', 'center', 'flex-end', 'baseline'].map((value) => <option key={value} value={value}>{value}</option>)}
            </Select>
          </Field>
          <Field label="flex-wrap">
            <Select value={state.wrap} onChange={(e) => update({ wrap: e.target.value as typeof state.wrap })}>
              {['nowrap', 'wrap', 'wrap-reverse'].map((value) => <option key={value} value={value}>{value}</option>)}
            </Select>
          </Field>
          <Field label="Gap (px)" hint={`${gap}px`}>
            <Input type="range" min={0} max={40} value={gap} onChange={(e) => update({ gap: num(e.target.value) })} />
          </Field>
        </div>
      </Card>
      <Card title="Live preview">
        <div className="preview-box" style={previewStyle}>
          {[1, 2, 3, 4, 5].map((item) => (
            <div key={item} className="chip mono" style={{ background: 'var(--surface-2)', minWidth: 40, justifyContent: 'center' }}>{item}</div>
          ))}
        </div>
      </Card>
      <Card title="Generated CSS" actions={<CopyButton value={css || ''} label="Copy CSS" />}>
        <CodeBlock value={css || ''} title="Flex CSS" maxHeight={180} />
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 6. Box Shadow                                                        */
/* ------------------------------------------------------------------ */

interface ShadowLayer { id: string; x: string; y: string; blur: string; spread: string; color: string; inset: boolean }
const SHADOW_FALLBACK: { layers: ShadowLayer[]; selectedId: string } = {
  layers: [{ id: 'base', x: '0', y: '8', blur: '20', spread: '0', color: '#00000066', inset: false }],
  selectedId: 'base',
};

export function BoxShadowTool() {
  const { state, update, error } = usePersisted('cssBoxShadow', SHADOW_FALLBACK);
  const [downloadError, setDownloadError] = useState('');
  const selected = state.layers.find((layer) => layer.id === state.selectedId) || state.layers[0];
  const layerCss = (layer: ShadowLayer): string => [
    layer.inset ? 'inset' : '',
    `${num(layer.x)}px`, `${num(layer.y)}px`, `${num(layer.blur)}px`, `${num(layer.spread)}px`,
    normalizeColor(layer.color),
  ].filter(Boolean).join(' ');
  const { value: value, error: calcError } = attempt(() => {
    if (!state.layers.length) throw new Error('Add at least one shadow layer.');
    return state.layers.map(layerCss).join(', ');
  });
  const shadow = value || 'none';
  const css = `box-shadow: ${shadow};`;
  const patchLayer = (patch: Partial<ShadowLayer>): void => {
    if (!selected) return;
    update({ layers: state.layers.map((layer) => layer.id === selected.id ? { ...layer, ...patch } : layer) });
  };
  const addLayer = (): void => {
    const id = uid('shadow');
    update({
      layers: [...state.layers, { id, x: '0', y: '4', blur: '12', spread: '0', color: '#00000055', inset: false }],
      selectedId: id,
    });
  };
  const removeLayer = (id: string): void => {
    const layers = state.layers.filter((layer) => layer.id !== id);
    update({ layers, selectedId: layers[0]?.id || '' });
  };

  return (
    <div className="stack">
      <ToolHeader
        title="Box Shadow"
        description="Stack multiple inset or outset shadow layers and copy the CSS."
        badge={`${state.layers.length} layer${state.layers.length === 1 ? '' : 's'}`}
        actions={<Button variant="primary" icon={<Plus size={14} />} onClick={addLayer}>Add layer</Button>}
      />
      <Notice>{error}</Notice>
      <Notice>{calcError}</Notice>
      <Notice>{downloadError}</Notice>
      <Card title="Layers">
        {!state.layers.length ? <EmptyState>No shadow layers yet. Add one to begin.</EmptyState> : (
          <div className="result-list">
            {state.layers.map((layer, index) => (
              <div className="row" key={layer.id}>
                <div className="grow">
                  <ListItem
                    title={`Layer ${index + 1}${layer.inset ? ' (inset)' : ''}`}
                    subtitle={<span className="mono">{layerCss(layer)}</span>}
                    selected={layer.id === selected?.id}
                    onClick={() => update({ selectedId: layer.id })}
                  />
                </div>
                <IconButton title="Remove layer" onClick={() => removeLayer(layer.id)}><Trash2 size={14} /></IconButton>
              </div>
            ))}
          </div>
        )}
      </Card>
      {selected && (
        <Card title={`Edit layer ${state.layers.indexOf(selected) + 1}`}>
          <div className="grid-2">
            <Field label="Offset X (px)"><Input type="number" value={selected.x} onChange={(e) => patchLayer({ x: e.target.value })} /></Field>
            <Field label="Offset Y (px)"><Input type="number" value={selected.y} onChange={(e) => patchLayer({ y: e.target.value })} /></Field>
            <Field label="Blur (px)"><Input type="number" min={0} value={selected.blur} onChange={(e) => patchLayer({ blur: e.target.value })} /></Field>
            <Field label="Spread (px)"><Input type="number" value={selected.spread} onChange={(e) => patchLayer({ spread: e.target.value })} /></Field>
            <Field label="Color">
              <div className="row"><Swatch color={normalizeColor(selected.color)} size={26} /><Input value={selected.color} spellCheck={false} onChange={(e) => patchLayer({ color: e.target.value })} /></div>
            </Field>
          </div>
          <Toggle checked={selected.inset} onChange={(inset) => patchLayer({ inset })} label="Inset" hint="Draw the shadow inside the element." />
        </Card>
      )}
      <Card title="Live preview">
        <div className="preview-box"><div className="chip" style={{ boxShadow: shadow, padding: '18px 28px', background: 'var(--surface-2)' }}>Shadow preview</div></div>
      </Card>
      <Card
        title="Generated CSS"
        actions={<Button onClick={() => saveCss(css, 'box-shadow', setDownloadError)} disabled={!value}>Download</Button>}
      >
        <CodeBlock value={css} title="box-shadow" maxHeight={100} />
        <CopyButton value={css} label="Copy CSS" />
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 7. Border Radius                                                     */
/* ------------------------------------------------------------------ */

export function BorderRadiusTool() {
  const { state, update, error } = usePersisted<{ tl: string; tr: string; br: string; bl: string }>('cssBorderRadius', {
    tl: '16', tr: '16', br: '16', bl: '16',
  });
  const radiusValue = (value: string): string => /^-?[\d.]+(px|%|rem|em)$/i.test(value.trim()) ? value.trim() : `${num(value)}px`;
  const values = [state.tl, state.tr, state.br, state.bl].map(radiusValue);
  const uniform = values.every((value) => value === values[0]);
  const radiusPreview = uniform ? values[0] : values.join(' ');
  const css = `border-radius: ${radiusPreview};`;
  const corners: { key: 'tl' | 'tr' | 'br' | 'bl'; label: string }[] = [
    { key: 'tl', label: 'Top left' }, { key: 'tr', label: 'Top right' },
    { key: 'br', label: 'Bottom right' }, { key: 'bl', label: 'Bottom left' },
  ];
  const presets: { label: string; value: Partial<typeof state> }[] = [
    { label: 'Pill', value: { tl: '999px', tr: '999px', br: '999px', bl: '999px' } },
    { label: 'Circle', value: { tl: '50%', tr: '50%', br: '50%', bl: '50%' } },
    { label: 'Soft card', value: { tl: '16px', tr: '16px', br: '16px', bl: '16px' } },
  ];

  return (
    <div className="stack">
      <ToolHeader title="Border Radius" description="Tune each corner with sliders or jump to a common shape." badge={uniform ? values[0] : 'custom'} />
      <Notice>{error}</Notice>
      <Card title="Presets">
        <div className="row wrap">
          {presets.map((preset) => <Button key={preset.label} onClick={() => update(preset.value)}>{preset.label}</Button>)}
        </div>
      </Card>
      <Card title="Corners">
        <div className="grid-2">
          {corners.map((corner, index) => (
            <Field key={corner.key} label={corner.label} hint={values[index]}>
              <div className="row">
                <Input type="range" min={0} max={200} value={clamp(num(state[corner.key]), 0, 200)} onChange={(e) => update({ [corner.key]: e.target.value })} />
                <Input value={state[corner.key]} spellCheck={false} onChange={(e) => update({ [corner.key]: e.target.value })} />
              </div>
            </Field>
          ))}
        </div>
        <p className="muted">Values without a unit are treated as pixels; you can also type %, rem or em.</p>
      </Card>
      <Card title="Live preview">
        <div className="preview-box" style={{ display: 'grid', placeItems: 'center' }}>
          <div className="chip" style={{ borderRadius: radiusPreview, width: 220, height: 86, justifyContent: 'center', background: 'linear-gradient(135deg, #38bdf8, #818cf8)', color: '#04121c', fontWeight: 700 }}>
            {uniform ? 'Radius' : 'Mixed corners'}
          </div>
        </div>
      </Card>
      <Card title="Generated CSS" actions={<CopyButton value={css} label="Copy CSS" />}>
        <CodeBlock value={css} title="border-radius" maxHeight={80} />
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 8. Clip Path                                                         */
/* ------------------------------------------------------------------ */

type ClipShape = 'circle' | 'ellipse' | 'triangle' | 'inset' | 'polygon';
const CLIP_OPTIONS: { value: ClipShape; label: string }[] = [
  { value: 'circle', label: 'Circle' }, { value: 'ellipse', label: 'Ellipse' },
  { value: 'triangle', label: 'Triangle' }, { value: 'inset', label: 'Inset' },
  { value: 'polygon', label: 'Polygon' },
];

export function ClipPathTool() {
  const { state, update, error } = usePersisted<{
    shape: ClipShape; size: number; inset: number; round: number; polygon: string;
  }>('cssClipPath', {
    shape: 'circle', size: 50, inset: 10, round: 12, polygon: 'polygon(50% 0%, 100% 100%, 0% 100%)',
  });
  const size = clamp(num(state.size, 50), 5, 80);
  const inset = clamp(num(state.inset, 10), 0, 49);
  const round = clamp(num(state.round, 12), 0, 100);
  const { value: clip, error: calcError } = attempt(() => {
    if (state.shape === 'polygon' && !/^polygon\([\d.%,\s-]+\)$/i.test(state.polygon.trim())) {
      throw new Error('Custom shapes must be a polygon(…) value using numbers and percentages.');
    }
    switch (state.shape) {
      case 'circle': return `circle(${size}% at 50% 50%)`;
      case 'ellipse': return `ellipse(${size}% ${Math.round(size * 0.7)}% at 50% 50%)`;
      case 'triangle': return 'polygon(50% 0%, 100% 100%, 0% 100%)';
      case 'inset': return `inset(${inset}% round ${round}px)`;
      default: return state.polygon.trim();
    }
  });
  const css = `clip-path: ${clip || 'none'};`;

  return (
    <div className="stack">
      <ToolHeader title="Clip Path" description="Build common clip-path shapes with a live silhouette preview." badge={state.shape} />
      <Notice>{error}</Notice>
      <Notice>{calcError}</Notice>
      <Card title="Shape preset">
        <Segmented options={CLIP_OPTIONS} value={state.shape} onChange={(shape) => update({ shape })} />
      </Card>
      <Card title="Shape settings">
        {(state.shape === 'circle' || state.shape === 'ellipse') && (
          <Field label="Size (%)" hint={`${size}% radius${state.shape === 'ellipse' ? ' (vertical radius is 70%)' : ''}`}>
            <Input type="range" min={5} max={80} value={size} onChange={(e) => update({ size: num(e.target.value) })} />
          </Field>
        )}
        {state.shape === 'inset' && (
          <div className="grid-2">
            <Field label="Inset (%)"><Input type="range" min={0} max={49} value={inset} onChange={(e) => update({ inset: num(e.target.value) })} /></Field>
            <Field label="Round (px)"><Input type="range" min={0} max={100} value={round} onChange={(e) => update({ round: num(e.target.value) })} /></Field>
          </div>
        )}
        {state.shape === 'polygon' && (
          <Field label="Custom polygon" hint="Percentages and numbers only; no URLs or functions.">
            <Textarea rows={3} value={state.polygon} spellCheck={false} onChange={(e) => update({ polygon: e.target.value })} />
          </Field>
        )}
        {state.shape === 'triangle' && <p className="muted">The triangle preset uses a fixed three-point polygon.</p>}
      </Card>
      <Card title="Live preview">
        <div className="preview-box" style={{ display: 'grid', placeItems: 'center', minHeight: 170 }}>
          <div style={{
            width: 180, height: 140, clipPath: clip || 'none',
            background: 'linear-gradient(135deg, #818cf8, #ec4899)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700,
          }}>Clipped</div>
        </div>
      </Card>
      <Card title="Generated CSS" actions={<CopyButton value={css} label="Copy CSS" />}>
        <CodeBlock value={css} title="clip-path" maxHeight={80} />
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 9. Gradient Builder                                                  */
/* ------------------------------------------------------------------ */

interface GradientStop { id: string; color: string; position: number }
type GradientType = 'linear' | 'radial' | 'conic';
const GRADIENT_OPTIONS: { value: GradientType; label: string }[] = [
  { value: 'linear', label: 'Linear' }, { value: 'radial', label: 'Radial' }, { value: 'conic', label: 'Conic' },
];
const GRADIENT_FALLBACK: { type: GradientType; angle: number; stops: GradientStop[] } = {
  type: 'linear', angle: 135, stops: [
    { id: 'stop-a', color: '#6366f1', position: 0 },
    { id: 'stop-b', color: '#ec4899', position: 100 },
  ],
};

export function GradientTool() {
  const { state, update, error } = usePersisted('cssGradientBuilder', GRADIENT_FALLBACK);
  const angle = clamp(num(state.angle, 135), 0, 360);
  const { value: gradient, error: calcError } = attempt(() => {
    if (state.stops.length < 2) throw new Error('A gradient needs at least two color stops.');
    const stops = state.stops
      .map((stop) => `${normalizeColor(stop.color)} ${clamp(num(stop.position), 0, 100)}%`)
      .join(', ');
    if (state.type === 'linear') return `linear-gradient(${angle}deg, ${stops})`;
    if (state.type === 'radial') return `radial-gradient(circle, ${stops})`;
    return `conic-gradient(from ${angle}deg, ${stops})`;
  });
  const css = `background: ${gradient || 'none'};`;
  const changeStop = (id: string, patch: Partial<GradientStop>): void => {
    update({ stops: state.stops.map((stop) => stop.id === id ? { ...stop, ...patch } : stop) });
  };
  const addStop = (): void => {
    const max = state.stops.reduce((acc, stop) => Math.max(acc, stop.position), 0);
    update({ stops: [...state.stops, { id: uid('stop'), color: randomHex(), position: clamp(max + 10, 0, 100) }] });
  };
  const removeStop = (id: string): void => { update({ stops: state.stops.filter((stop) => stop.id !== id) }); };

  return (
    <div className="stack">
      <ToolHeader
        title="Gradient Builder"
        description="Compose linear, radial and conic gradients from editable color stops."
        badge={`${state.stops.length} stops`}
        actions={<Button variant="primary" icon={<Plus size={14} />} onClick={addStop}>Add stop</Button>}
      />
      <Notice>{error}</Notice>
      <Notice>{calcError}</Notice>
      <Card title="Gradient type">
        <Segmented options={GRADIENT_OPTIONS} value={state.type} onChange={(type) => update({ type })} />
        <Field label="Angle" hint={`${angle}deg (linear direction / conic start)`}>
          <Input type="range" min={0} max={360} value={angle} onChange={(e) => update({ angle: num(e.target.value) })} />
        </Field>
      </Card>
      <Card title="Color stops">
        <div className="result-list">
          {state.stops.map((stop, index) => (
            <div className="row" key={stop.id}>
              <div className="grow">
                <ListItem
                  title={<span className="mono">Stop {index + 1} · {normalizeColor(stop.color)}</span>}
                  subtitle={
                    <div className="row wrap">
                      <Swatch color={normalizeColor(stop.color)} size={18} />
                      <input type="color" value={/^#[0-9a-f]{6}$/i.test(stop.color) ? stop.color : '#ffffff'} onChange={(e) => changeStop(stop.id, { color: e.target.value })} aria-label={`Color for stop ${index + 1}`} />
                      <Input type="range" min={0} max={100} value={stop.position} onChange={(e) => changeStop(stop.id, { position: num(e.target.value) })} />
                      <span className="mono">{num(stop.position)}%</span>
                    </div>
                  }
                />
              </div>
              <IconButton title="Remove stop" onClick={() => removeStop(stop.id)} disabled={state.stops.length <= 2}><Trash2 size={14} /></IconButton>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Live preview">
        <div className="preview-box" style={{ background: gradient || 'var(--bg-soft)', minHeight: 130 }} />
      </Card>
      <Card title="Generated CSS" actions={<CopyButton value={css} label="Copy CSS" />}>
        <CodeBlock value={css} title="Gradient" maxHeight={100} />
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 10. Color Shades                                                     */
/* ------------------------------------------------------------------ */

export function ColorShadesTool() {
  const { state, update, error, setError } = usePersisted<{ base: string }>('colorShades', { base: '#6366f1' });
  const [copied, setCopied] = useState('');
  const offsets = [-45, -35, -25, -15, -5, 5, 15, 25, 35, 45];
  const { value: shades, error: calcError } = attempt(() => {
    const rgb = parseColor(state.base);
    if (!rgb) throw new Error('Enter a valid color such as #6366f1, rgb(99,102,241) or indigo.');
    return offsets.map((offset) => {
      const color = shiftLightness(rgb, offset);
      return { offset, hex: formatColor(color, 'hex'), rgb: color };
    });
  });
  const swatches = shades || [];
  const copy = async (hex: string): Promise<void> => {
    if (await copyText(hex)) { setCopied(hex); setError(''); }
  };

  return (
    <div className="stack">
      <ToolHeader
        title="Color Shades"
        description="Generate ten tints and shades by shifting the lightness of a base color."
        actions={<Button onClick={() => update({ base: randomHex() })}>Random base</Button>}
      />
      <Notice>{error}</Notice>
      <Notice>{calcError}</Notice>
      <Notice tone="success">{copied ? `Copied ${copied} to the clipboard.` : ''}</Notice>
      <Card title="Base color">
        <div className="row">
          <Swatch color={normalizeColor(state.base)} size={34} />
          <Input value={state.base} spellCheck={false} onChange={(e) => update({ base: e.target.value })} placeholder="#6366f1" />
          <CopyButton value={normalizeColor(state.base)} label="Copy hex" />
        </div>
      </Card>
      <Card title="Tints & shades" actions={<Badge>{swatches.length} swatches</Badge>}>
        {!swatches.length ? <EmptyState>Enter a valid base color to generate shades.</EmptyState> : (
          <div className="swatch-grid">
            {swatches.map((shade) => (
              <button
                key={shade.offset}
                type="button"
                className="palette-swatch"
                style={{ background: shade.hex, color: readableTextColor(shade.rgb) }}
                title={`Click to copy ${shade.hex}`}
                onClick={() => void copy(shade.hex)}
              >
                <span className="mono">{shade.hex}</span>
                <small>{shade.offset > 0 ? `+${shade.offset}` : shade.offset} lightness</small>
              </button>
            ))}
          </div>
        )}
        <p className="muted">Click any swatch to copy its hex value. Negative offsets are darker, positive offsets are lighter.</p>
      </Card>
      <Card title="CSS variables" actions={<CopyButton value={swatches.map((shade, index) => `--shade-${index + 1}: ${shade.hex};`).join('\n')} label="Copy variables" />}>
        <CodeBlock value={swatches.map((shade, index) => `--shade-${index + 1}: ${shade.hex};`).join('\n')} title="Shade tokens" maxHeight={200} />
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 11. Color Harmony                                                    */
/* ------------------------------------------------------------------ */

type ColorFormat = 'hex' | 'rgb' | 'hsl';
const HARMONIES: Harmony[] = ['complementary', 'analogous', 'triadic', 'tetradic', 'monochromatic', 'shades'];
const FORMAT_OPTIONS: { value: ColorFormat; label: string }[] = [
  { value: 'hex', label: 'HEX' }, { value: 'rgb', label: 'RGB' }, { value: 'hsl', label: 'HSL' },
];

export function ColorHarmonyTool() {
  const { state, update, error, setError } = usePersisted<{ base: string; harmony: Harmony; format: ColorFormat }>('colorHarmony', {
    base: '#38bdf8', harmony: 'triadic', format: 'hex',
  });
  const [copied, setCopied] = useState('');
  const { value: palette, error: calcError } = attempt(() => {
    const rgb = parseColor(state.base);
    if (!rgb) throw new Error('Enter a valid CSS color before building a harmony.');
    return paletteFromColor(rgb, state.harmony).map((color) => ({ color, text: formatColor(color, state.format) }));
  });
  const colors = palette || [];
  const copy = async (text: string): Promise<void> => {
    if (await copyText(text)) { setCopied(text); setError(''); }
  };

  return (
    <div className="stack">
      <ToolHeader title="Color Harmony" description="Derive proven color harmonies from a single base color." badge={state.harmony} />
      <Notice>{error}</Notice>
      <Notice>{calcError}</Notice>
      <Notice tone="success">{copied ? `Copied ${copied}.` : ''}</Notice>
      <Card title="Base color">
        <div className="row">
          <Swatch color={normalizeColor(state.base)} size={34} />
          <Input value={state.base} spellCheck={false} onChange={(e) => update({ base: e.target.value })} />
          <Button onClick={() => update({ base: randomHex() })}>Random</Button>
        </div>
        <div className="grid-2">
          <Field label="Harmony">
            <Select value={state.harmony} onChange={(e) => update({ harmony: e.target.value as Harmony })}>
              {HARMONIES.map((harmony) => <option key={harmony} value={harmony}>{harmony}</option>)}
            </Select>
          </Field>
          <Field label="Output format">
            <Segmented options={FORMAT_OPTIONS} value={state.format} onChange={(format) => update({ format })} />
          </Field>
        </div>
      </Card>
      <Card title="Palette" actions={<CopyButton value={colors.map((item) => item.text).join(', ')} label="Copy palette" />}>
        {!colors.length ? <EmptyState>No palette could be generated from that color.</EmptyState> : (
          <div className="swatch-grid">
            {colors.map((item, index) => (
              <button
                key={`${item.text}-${index}`}
                type="button"
                className="palette-swatch"
                style={{ background: formatColor(item.color, 'hex'), color: readableTextColor(item.color) }}
                title={`Click to copy ${item.text}`}
                onClick={() => void copy(item.text)}
              >
                <span className="mono">{item.text}</span>
              </button>
            ))}
          </div>
        )}
        <p className="muted">Swatches are copied in the selected format. Everything is computed locally.</p>
      </Card>
      <Card title="CSS variables">
        <CodeBlock value={colors.map((item, index) => `--harmony-${index + 1}: ${item.text};`).join('\n')} title="Harmony tokens" maxHeight={180} />
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 12. CSS Animation                                                    */
/* ------------------------------------------------------------------ */

type AnimationName = 'fade' | 'slide' | 'bounce' | 'spin' | 'pulse';
const ANIMATIONS: { value: AnimationName; label: string; keyframes: string; name: string }[] = [
  { value: 'fade', label: 'Fade', name: 'fdu-fade', keyframes: '@keyframes fdu-fade { from { opacity: 0; } to { opacity: 1; } }' },
  { value: 'slide', label: 'Slide', name: 'fdu-slide', keyframes: '@keyframes fdu-slide { from { transform: translateX(-48px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }' },
  { value: 'bounce', label: 'Bounce', name: 'fdu-bounce', keyframes: '@keyframes fdu-bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-24px); } }' },
  { value: 'spin', label: 'Spin', name: 'fdu-spin', keyframes: '@keyframes fdu-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }' },
  { value: 'pulse', label: 'Pulse', name: 'fdu-pulse', keyframes: '@keyframes fdu-pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.15); opacity: .7; } }' },
];

export function CssAnimationTool() {
  const { state, update, error, setError } = usePersisted<{
    preset: AnimationName; duration: string; timing: string; delay: string; iteration: string;
  }>('cssAnimation', { preset: 'fade', duration: '1.2s', timing: 'ease-in-out', delay: '0s', iteration: 'infinite' });
  const { value: generated, error: calcError } = attempt(() => {
    if (!/^\d*\.?\d+(ms|s)$/.test(state.duration.trim())) throw new Error('Duration must look like 0.8s or 400ms.');
    if (!/^\d*\.?\d+(ms|s)$/.test(state.delay.trim())) throw new Error('Delay must look like 0s or 250ms.');
    if (state.iteration !== 'infinite' && !/^\d+$/.test(state.iteration)) throw new Error('Iterations must be a whole number or infinite.');
    const preset = ANIMATIONS.find((item) => item.value === state.preset) || ANIMATIONS[0];
    const shorthand = `${preset.name} ${state.duration.trim()} ${state.timing} ${state.delay.trim()} ${state.iteration}`;
    return {
      shorthand,
      css: `${preset.keyframes}\n\n.animated {\n  animation: ${shorthand};\n}\n`,
    };
  });
  const keyframes = ANIMATIONS.find((item) => item.value === state.preset)?.keyframes || '';

  useEffect(() => {
    const id = 'fdu-css-animation-keyframes';
    try {
      document.getElementById(id)?.remove();
      const style = document.createElement('style');
      style.id = id;
      style.textContent = keyframes;
      document.head.appendChild(style);
    } catch (e) { setError(describeError(e)); }
    return () => {
      try { document.getElementById(id)?.remove(); } catch { /* cleanup is best effort */ }
    };
  }, [keyframes, setError]);

  const previewStyle: CSSProperties = generated ? { animation: generated.shorthand } : {};

  return (
    <div className="stack">
      <ToolHeader title="CSS Animation" description="Generate @keyframes and an animation class with a live preview." badge={state.preset} />
      <Notice>{error}</Notice>
      <Notice>{calcError}</Notice>
      <Card title="Preset">
        <Segmented
          options={ANIMATIONS.map((item) => ({ value: item.value, label: item.label }))}
          value={state.preset}
          onChange={(preset) => update({ preset })}
        />
      </Card>
      <Card title="Timing">
        <div className="grid-2">
          <Field label="Duration"><Input value={state.duration} spellCheck={false} onChange={(e) => update({ duration: e.target.value })} /></Field>
          <Field label="Delay"><Input value={state.delay} spellCheck={false} onChange={(e) => update({ delay: e.target.value })} /></Field>
          <Field label="Timing function">
            <Select value={state.timing} onChange={(e) => update({ timing: e.target.value })}>
              {['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out'].map((value) => <option key={value} value={value}>{value}</option>)}
            </Select>
          </Field>
          <Field label="Iterations"><Input value={state.iteration} spellCheck={false} onChange={(e) => update({ iteration: e.target.value })} /></Field>
        </div>
        <p className="muted">Use a number or the word infinite. Times accept seconds (s) or milliseconds (ms).</p>
      </Card>
      <Card title="Live preview">
        <div className="preview-box" style={{ display: 'grid', placeItems: 'center', minHeight: 130 }}>
          <div className="chip" style={{ ...previewStyle, padding: '16px 24px', background: 'linear-gradient(135deg, #38bdf8, #818cf8)', color: '#04121c', fontWeight: 700 }}>Animated</div>
        </div>
      </Card>
      <Card title="Generated CSS" actions={<CopyButton value={generated?.css || ''} label="Copy CSS" />}>
        <CodeBlock value={generated?.css || ''} title="Keyframes + class" maxHeight={230} />
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 13. Font Stack                                                       */
/* ------------------------------------------------------------------ */

type StackPreset = 'system' | 'sans' | 'serif' | 'mono' | 'geometric';
const STACK_PRESETS: { id: StackPreset; label: string; families: string[] }[] = [
  { id: 'system', label: 'System UI', families: ['system-ui', 'sans-serif'] },
  { id: 'sans', label: 'Sans', families: ['Inter', 'Arial', 'sans-serif'] },
  { id: 'serif', label: 'Serif', families: ['Georgia', 'Times New Roman', 'serif'] },
  { id: 'mono', label: 'Mono', families: ['SFMono-Regular', 'Consolas', 'monospace'] },
  { id: 'geometric', label: 'Geometric', families: ['Futura', 'Avenir Next', 'sans-serif'] },
];
const FAMILIES = [
  'system-ui', 'Inter', 'Arial', 'Helvetica Neue', 'Georgia', 'Times New Roman',
  'SFMono-Regular', 'Consolas', 'Menlo', 'Futura', 'Avenir Next',
  'sans-serif', 'serif', 'monospace',
];
const quoteFamily = (family: string): string => /^[a-z-]+$/i.test(family) ? family : `"${family}"`;

export function FontStackTool() {
  const { state, update, error } = usePersisted<{ selected: string[]; sample: string }>('fontStack', {
    selected: ['system-ui', 'sans-serif'],
    sample: 'The quick brown fox jumps over 13 lazy dogs',
  });
  const stack = state.selected.map(quoteFamily).join(', ');
  const css = `font-family: ${stack || 'inherit'};`;
  const toggle = (family: string, checked: boolean): void => {
    const selected = checked
      ? [...state.selected, family]
      : state.selected.filter((item) => item !== family);
    update({ selected });
  };

  return (
    <div className="stack">
      <ToolHeader title="Font Stack" description="Pick preset stacks or check individual families to build your own." badge={`${state.selected.length} families`} />
      <Notice>{error}</Notice>
      <Card title="Preset stacks">
        <div className="row wrap">
          {STACK_PRESETS.map((preset) => (
            <Button key={preset.id} onClick={() => update({ selected: [...preset.families] })}>{preset.label}</Button>
          ))}
        </div>
      </Card>
      <Card title="Custom stack" actions={<Badge>{stack ? 'ready' : 'empty'}</Badge>}>
        <div className="grid-3">
          {FAMILIES.map((family) => (
            <label className="row" key={family} style={{ gap: 6 }}>
              <input type="checkbox" checked={state.selected.includes(family)} onChange={(e) => toggle(family, e.target.checked)} />
              <span className="mono">{family}</span>
            </label>
          ))}
        </div>
        <p className="muted">Order matters: browsers use the first installed family. Names with spaces are quoted automatically.</p>
      </Card>
      <Card title="Sample preview">
        <Input value={state.sample} onChange={(e) => update({ sample: e.target.value })} placeholder="Type preview text" />
        <div className="preview-box" style={{ fontFamily: stack || 'inherit', fontSize: 20 }}>
          {state.sample || 'Aa Bb Cc 0123'}
        </div>
      </Card>
      <Card title="Generated CSS" actions={<CopyButton value={css} label="Copy CSS" />}>
        <CodeBlock value={state.selected.length ? `.text {\n  ${css}\n}\n` : ''} title="font-family" maxHeight={120} />
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 14. CSS Reset                                                        */
/* ------------------------------------------------------------------ */

type ResetTab = 'modern' | 'minimal' | 'box-sizing';
const RESET_TABS: { id: ResetTab; label: string }[] = [
  { id: 'modern', label: 'Modern reset' },
  { id: 'minimal', label: 'Minimal reset' },
  { id: 'box-sizing', label: 'Box sizing only' },
];
const RESETS: Record<ResetTab, string> = {
  modern: `/* Modern reset */
*, *::before, *::after { box-sizing: border-box; }
html { -moz-text-size-adjust: none; -webkit-text-size-adjust: none; text-size-adjust: none; }
body, h1, h2, h3, h4, p, figure, blockquote, dl, dd { margin: 0; }
ul[role='list'], ol[role='list'] { list-style: none; }
body { min-height: 100vh; line-height: 1.5; }
h1, h2, h3, h4 { line-height: 1.1; text-wrap: balance; }
img, picture, video, canvas, svg { display: block; max-width: 100%; }
input, button, textarea, select { font: inherit; color: inherit; }
p, h1, h2, h3, h4, h5, h6 { overflow-wrap: break-word; }
a { text-underline-offset: 0.2em; }
#root, #__next { isolation: isolate; }
`,
  minimal: `/* Minimal reset */
html, body, div, span, h1, h2, h3, h4, h5, h6, p, a,
img, ul, ol, li, form, button, input, textarea, select {
  margin: 0;
  padding: 0;
  border: 0;
  font-size: 100%;
  vertical-align: baseline;
}
body { line-height: 1.5; }
ul, ol { list-style: none; }
img { max-width: 100%; height: auto; }
table { border-collapse: collapse; border-spacing: 0; }
`,
  'box-sizing': `/* Predictable sizing */
*, *::before, *::after { box-sizing: border-box; }
`,
};

export function CssResetTool() {
  const { state, update, error } = usePersisted<{ tab: ResetTab }>('cssResetTab', { tab: 'modern' });
  const [downloadError, setDownloadError] = useState('');
  const css = RESETS[state.tab] || RESETS.modern;

  return (
    <div className="stack">
      <ToolHeader
        title="CSS Reset"
        description="Copy a proven baseline stylesheet to normalize browser defaults."
        badge={`${css.split('\n').length} lines`}
        actions={<Button variant="primary" onClick={() => saveCss(css, 'reset', setDownloadError)}>Download</Button>}
      />
      <Notice>{error}</Notice>
      <Notice>{downloadError}</Notice>
      <Card title="Reset style">
        <Tabs tabs={RESET_TABS} active={state.tab} onChange={(tab) => update({ tab })} />
        <p className="muted">
          {state.tab === 'modern' && 'A compact modern baseline: border-box sizing, balanced headings and responsive media.'}
          {state.tab === 'minimal' && 'A small classic reset that removes default margins, padding and list markers.'}
          {state.tab === 'box-sizing' && 'The one rule most projects need: padding and borders stay inside declared widths.'}
        </p>
      </Card>
      <Card title="Stylesheet" actions={<CopyButton value={css} label="Copy CSS" />}>
        <CodeBlock value={css} title={`${state.tab} reset`} maxHeight={330} />
      </Card>
      <Card title="Usage">
        <div className="result-list">
          <ListItem title="Load it first" subtitle="Import the reset before your own styles so overrides win by order." />
          <ListItem title="Scoped alternative" subtitle="Wrap the selectors under a class if you only want to reset part of a page." />
          <ListItem title="Local only" subtitle="Nothing is uploaded; the snippets live in this extension bundle." />
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 15. CSS Comment Remover                                              */
/* ------------------------------------------------------------------ */

export function CssCommentRemoverTool() {
  const { state, update, error } = usePersisted<{ source: string; keepLicense: boolean }>('cssCommentRemover', {
    source: '/*! License CSS v1 */\n.card { color: red; } /* helper note */\n/* another note */\n.card:hover { color: blue; }',
    keepLicense: true,
  });
  const [downloadError, setDownloadError] = useState('');
  const { value: result, error: calcError } = attempt(() => stripCssComments(state.source, state.keepLicense));
  const output = result?.output || '';
  const before = byteLength(state.source);
  const after = byteLength(output);

  return (
    <div className="stack">
      <ToolHeader
        title="CSS Comment Remover"
        description="Delete comments from CSS while optionally preserving /*! license headers */."
        badge={`${result?.removed || 0} removed`}
        actions={<Button variant="primary" onClick={() => saveCss(output, 'no-comments', setDownloadError)} disabled={!output}>Download</Button>}
      />
      <Notice>{error}</Notice>
      <Notice>{calcError}</Notice>
      <Notice>{downloadError}</Notice>
      <Card title="Source CSS" actions={<Badge>{formatBytes(before)}</Badge>}>
        <Textarea rows={10} value={state.source} spellCheck={false} placeholder="Paste CSS with comments…" onChange={(e) => update({ source: e.target.value })} />
        <Toggle
          checked={state.keepLicense}
          onChange={(keepLicense) => update({ keepLicense })}
          label="Keep /*! license comments */"
          hint="Banners beginning with an exclamation mark are preserved verbatim."
        />
      </Card>
      <Card title="Statistics">
        <div className="grid-3">
          <Stat label="Comments removed" value={String(result?.removed || 0)} />
          <Stat label="License comments kept" value={String(result?.kept || 0)} />
          <Stat label="Bytes saved" value={formatBytes(Math.max(0, before - after))} hint={`${before} → ${after} bytes`} />
        </div>
      </Card>
      <Card title="Clean CSS" actions={<CopyButton value={output} label="Copy CSS" />}>
        <CodeBlock value={output} title="Without comments" maxHeight={260} />
      </Card>
    </div>
  );
}
