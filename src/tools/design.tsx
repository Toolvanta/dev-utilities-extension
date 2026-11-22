import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { page, describeError } from '../lib/messaging';
import type { PickedElement, ColorUsage } from '../lib/types';
import type { Declaration } from '../lib/css';
import { parseColor, formatColor, contrastRatio, readableTextColor, randomHex } from '../lib/color';
import type { RGB } from '../lib/color';
import { declarationsToCss, toPixels, round } from '../lib/css';
import { downloadText, timestampName } from '../lib/utils';
import { getLocal, setLocal, addHistory } from '../lib/storage';
import {
  ToolHeader, Card, Button, Field, Input, Textarea, Select, Badge, Notice,
  EmptyState, Loading, CopyButton, CodeBlock, Tabs, Segmented, Swatch, Stat, ShortText, ListItem,
} from '../components/ui';

/* ------------------------------------------------------------------ */
/* Small local helpers — all real work is delegated to the shared libs  */
/* ------------------------------------------------------------------ */

const BLACK: RGB = { r: 0, g: 0, b: 0 };
const WHITE: RGB = { r: 255, g: 255, b: 255 };

function safeColor(value: string): RGB | null {
  try {
    return parseColor(value);
  } catch {
    return null;
  }
}

function colorHex(value: string): string {
  const parsed = safeColor(value);
  return parsed ? formatColor(parsed, 'hex') : value;
}

function numberValue(value: string, fallback = 0): number {
  if (!String(value).trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pxFromCss(value: string): number {
  const text = (value || '').trim();
  const amount = text.match(/-?[\d.]+/);
  if (!amount) return 0;
  const parsed = Number(amount[0]);
  if (!Number.isFinite(parsed)) return 0;
  const unitMatch = text.match(/(px|rem|em|%|pt|pc|in|cm|mm|q|vh|vw|vmin|vmax)$/i);
  const unit = (unitMatch ? unitMatch[1] : 'px').toLowerCase();
  const pixels = toPixels(parsed, unit);
  return Number.isFinite(pixels) ? pixels : 0;
}

function styleValue(element: PickedElement, property: string, fallback = '0px'): string {
  const found = element.styles?.find((item) => item.property === property);
  return found && found.value ? found.value : fallback;
}

/* ------------------------------------------------------------------ */
/* 1. Computed CSS                                                     */
/* ------------------------------------------------------------------ */

export function ComputedCssTool() {
  const [element, setElement] = useState<PickedElement | null>(null);
  const [search, setSearch] = useState('');
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');

  const pick = async () => {
    setPicking(true);
    setError('');
    try {
      setElement(await page.pick<PickedElement>('css'));
    } catch (err) {
      setError(describeError(err));
    } finally {
      setPicking(false);
    }
  };

  const all = element?.styles || [];
  const query = search.trim().toLowerCase();
  const filtered = query
    ? all.filter((item) => `${item.property} ${item.value}`.toLowerCase().includes(query))
    : all;
  const css = declarationsToCss(filtered, element?.selector || ':root');

  return (
    <div className="stack">
      <ToolHeader
        title="Computed CSS"
        description="Pick an element and browse every computed declaration."
        badge={element ? element.tag : 'No element'}
        actions={<Button variant="primary" onClick={pick} disabled={picking}>{picking ? 'Picking…' : 'Pick element'}</Button>}
      />
      <Notice>{error}</Notice>
      {picking && <Loading label="Click an element on the page…" />}

      <Card title="Selected element">
        {!element ? (
          <EmptyState>Pick an element to inspect its computed styles.</EmptyState>
        ) : (
          <div className="stack">
            <div className="row wrap">
              <Badge tone="accent">{element.tag}</Badge>
              <span className="mono muted"><ShortText value={element.selector} length={110} /></span>
            </div>
            <div className="grid-3">
              <Stat label="Font" value={element.font?.family || '—'} hint={`${element.font?.size || '—'} / ${element.font?.lineHeight || '—'}`} />
              <Stat label="Foreground" value={colorHex(element.color?.foreground || '')} />
              <Stat label="Background" value={colorHex(element.color?.background || '')} />
            </div>
          </div>
        )}
      </Card>

      <Card
        title="Declarations"
        actions={<Badge>{filtered.length} of {all.length} shown</Badge>}
      >
        <div className="stack">
          <div className="row wrap">
            <Field label="Filter styles" hint="Matches property names and values.">
              <Input
                value={search}
                placeholder="e.g. color, display, transform"
                onChange={(event) => setSearch(event.target.value)}
                disabled={!element}
              />
            </Field>
            <CopyButton value={css} label="Copy CSS" />
          </div>
          {element && !filtered.length && <EmptyState>No declarations match that filter.</EmptyState>}
          {!!filtered.length && (
            <div className="result-list">
              <table className="table">
                <thead>
                  <tr><th>Property</th><th>Value</th></tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.property}>
                      <td className="mono">{item.property}</td>
                      <td className="mono">{item.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <CodeBlock value={css} title="CSS" maxHeight={240} />
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Selector Copier                                                  */
/* ------------------------------------------------------------------ */

export function SelectorCopierTool() {
  const [element, setElement] = useState<PickedElement | null>(null);
  const [manual, setManual] = useState('');
  const [matched, setMatched] = useState<PickedElement | null>(null);
  const [picking, setPicking] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const pick = async () => {
    setPicking(true);
    setError('');
    setNote('');
    try {
      setElement(await page.pick<PickedElement>('selector'));
    } catch (err) {
      setError(describeError(err));
    } finally {
      setPicking(false);
    }
  };

  const test = async () => {
    const selector = manual.trim();
    if (!selector) {
      setError('Enter a CSS selector first.');
      return;
    }
    setTesting(true);
    setError('');
    setNote('');
    setMatched(null);
    try {
      const result = await page.query<any>('selected', { selector });
      const found = Array.isArray(result) ? result[0] : result;
      if (found && typeof found === 'object' && 'selector' in found) {
        setMatched(found as PickedElement);
        setNote('The selector matched an element on the page.');
      } else {
        await page.scrollTo(selector);
        setNote('No element details were returned; the page was scrolled to the selector.');
      }
    } catch (err) {
      setError(describeError(err));
    } finally {
      setTesting(false);
    }
  };

  const tagSummary = element
    ? `${element.tag}${element.id ? `#${element.id}` : ''}${element.classes?.length ? `.${element.classes.join('.')}` : ''}`
    : '';
  const allText = [
    element ? `CSS selector: ${element.selector}` : '',
    element ? `XPath: ${element.xpath}` : '',
    element ? `Element: ${tagSummary}` : '',
    manual.trim() ? `Manual selector: ${manual.trim()}` : '',
    matched ? `Test match: ${matched.selector}` : '',
  ].filter(Boolean).join('\n');

  return (
    <div className="stack">
      <ToolHeader
        title="Selector Copier"
        description="Grab a stable CSS selector, an XPath, or test your own selector."
        actions={<Button variant="primary" onClick={pick} disabled={picking}>{picking ? 'Picking…' : 'Pick element'}</Button>}
      />
      <Notice>{error}</Notice>
      {!!note && <Notice tone="info">{note}</Notice>}
      {picking && <Loading label="Click an element on the page…" />}

      <Card title="Picked element">
        {!element ? (
          <EmptyState>Pick an element to copy its selector and XPath.</EmptyState>
        ) : (
          <div className="stack">
            <div className="row wrap">
              <Badge tone="accent">{element.tag}</Badge>
              <Badge>{element.classes?.length || 0} classes</Badge>
            </div>
            <div className="result-list">
              <ListItem
                title="CSS selector"
                subtitle={<span className="mono"><ShortText value={element.selector} length={140} /></span>}
                right={<CopyButton value={element.selector} label="Copy selector" />}
              />
              <ListItem
                title="XPath"
                subtitle={<span className="mono"><ShortText value={element.xpath} length={140} /></span>}
                right={<CopyButton value={element.xpath} label="Copy XPath" />}
              />
              <ListItem
                title="Tag, id and classes"
                subtitle={<span className="mono"><ShortText value={tagSummary} length={140} /></span>}
                right={<CopyButton value={tagSummary} label="Copy tag" />}
              />
            </div>
          </div>
        )}
      </Card>

      <Card title="Test a CSS selector">
        <div className="stack">
          <div className="row wrap">
            <Field label="CSS selector" hint="The page will be scrolled to a matching element.">
              <Input
                value={manual}
                placeholder="main .card > h2"
                onChange={(event) => setManual(event.target.value)}
              />
            </Field>
            <Button variant="primary" onClick={test} disabled={testing || !manual.trim()}>
              {testing ? 'Testing…' : 'Test selector'}
            </Button>
          </div>
          {testing && <Loading label="Querying the page…" />}
          {matched && (
            <div className="row wrap">
              <Badge tone="success">Matched</Badge>
              <span className="mono"><ShortText value={matched.selector} length={130} /></span>
              <CopyButton value={matched.selector} label="Copy match" />
            </div>
          )}
        </div>
      </Card>

      <Card title="Copy everything" actions={<CopyButton value={allText} label="Copy all" />}>
        <CodeBlock value={allText} title="Selector summary" maxHeight={180} />
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Box Model                                                        */
/* ------------------------------------------------------------------ */

export function BoxModelTool() {
  const [element, setElement] = useState<PickedElement | null>(null);
  const [overlayOn, setOverlayOn] = useState(false);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => {
    if (overlayOn) void page.overlay('none').catch(() => undefined);
  }, [overlayOn]);

  const showOverlay = async (selector?: string) => {
    setBusy(true);
    setError('');
    try {
      await page.overlay('boxmodel', { selector });
      setOverlayOn(true);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const hideOverlay = async () => {
    setBusy(true);
    setError('');
    try {
      await page.overlay('none');
      setOverlayOn(false);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const pick = async () => {
    setPicking(true);
    setError('');
    try {
      const picked = await page.pick<PickedElement>('css');
      setElement(picked);
      await showOverlay(picked.selector);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setPicking(false);
    }
  };

  const sides = ['top', 'right', 'bottom', 'left'];
  const pxSide = (prefix: string, side: string) => pxFromCss(styleValue(element, `${prefix}-${side}`, '0px'));
  const box = element ? {
    width: styleValue(element, 'width', `${round(element.rect?.width || 0, 1)}px`),
    height: styleValue(element, 'height', `${round(element.rect?.height || 0, 1)}px`),
    margin: sides.map((side) => round(pxSide('margin', side), 1)),
    padding: sides.map((side) => round(pxSide('padding', side), 1)),
    border: sides.map((side) => round(pxSide('border', side === 'top' ? 'top-width' : side === 'right' ? 'right-width' : side === 'bottom' ? 'bottom-width' : 'left-width'), 1)),
  } : null;

  const shorthand = (values: number[]) => values.map((value) => `${value}px`).join(' ');
  const css = element && box
    ? declarationsToCss([
      { property: 'width', value: box.width },
      { property: 'height', value: box.height },
      { property: 'margin', value: shorthand(box.margin) },
      { property: 'padding', value: shorthand(box.padding) },
      { property: 'border-width', value: shorthand(box.border) },
    ], element.selector)
    : '';

  return (
    <div className="stack">
      <ToolHeader
        title="Box Model"
        description="Visualize content, padding, border and margin on the live page."
        badge={element ? element.tag : 'No element'}
        actions={(
          <div className="row wrap">
            <Button variant="primary" onClick={pick} disabled={picking || busy}>{picking ? 'Picking…' : 'Pick element'}</Button>
            <Button
              variant={overlayOn ? 'danger' : 'soft'}
              onClick={overlayOn ? hideOverlay : () => showOverlay(element?.selector)}
              disabled={busy || picking}
            >{overlayOn ? 'Overlay off' : 'Overlay on'}</Button>
          </div>
        )}
      />
      <Notice>{error}</Notice>
      {picking && <Loading label="Click an element on the page…" />}
      {busy && <Loading label="Updating page overlay…" />}

      {!element ? (
        <EmptyState>Pick an element to see its box model.</EmptyState>
      ) : (
        <>
          <Notice tone="info">
            The page overlay highlights the picked element. It is removed automatically when you leave this tool.
          </Notice>
          <Card title="Measured values">
            <div className="grid-3">
              <Stat label="Width" value={`${round(pxFromCss(box.width), 1)} px`} hint={box.width} />
              <Stat label="Height" value={`${round(pxFromCss(box.height), 1)} px`} hint={box.height} />
              <Stat label="Border" value={shorthand(box.border)} hint="top right bottom left" />
              <Stat label="Padding" value={shorthand(box.padding)} hint="top right bottom left" />
              <Stat label="Margin" value={shorthand(box.margin)} hint="top right bottom left" />
              <Stat label="Page rect" value={`${round(element.rect?.width || 0, 0)} × ${round(element.rect?.height || 0, 0)}`} hint="rendered size in px" />
            </div>
          </Card>

          <Card title="Diagram">
            <div className="preview-box">
              <div style={{
                margin: shorthand(box.margin),
                border: `${box.border[0]}px dashed #8b5cf6`,
                padding: shorthand(box.padding),
              }}>
                <div className="chip mono" style={{ width: `${Math.max(8, Math.min(pxFromCss(box.width), 100))}%` }}>
                  content {box.width} × {box.height}
                </div>
              </div>
            </div>
            <p className="muted">Purple dashed line = border · spacing around it = margin and padding.</p>
          </Card>

          <Card title="Copyable CSS" actions={<CopyButton value={css} label="Copy CSS" />}>
            <CodeBlock value={css} title="Box model CSS" maxHeight={180} />
          </Card>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Grid / Flex overlay                                              */
/* ------------------------------------------------------------------ */

const GRID_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ec4899', '#38bdf8'];

export function GridOverlayTool() {
  const [active, setActive] = useState(false);
  const [color, setColor] = useState(GRID_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => {
    if (active) void page.overlay('none').catch(() => undefined);
  }, [active]);

  const toggleOverlay = async (enabled: boolean, nextColor = color) => {
    setBusy(true);
    setError('');
    try {
      await page.overlay(enabled ? 'grid' : 'none', enabled ? { color: nextColor } : undefined);
      setActive(enabled);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const changeColor = (next: string) => {
    setColor(next);
    if (active) void toggleOverlay(true, next);
  };

  return (
    <div className="stack">
      <ToolHeader
        title="Grid & Flex Overlay"
        description="Highlight layout containers directly on the page."
        badge={active ? 'Overlay active' : 'Overlay off'}
        actions={(
          <Button
            variant={active ? 'danger' : 'primary'}
            onClick={() => toggleOverlay(!active)}
            disabled={busy}
          >{busy ? 'Working…' : active ? 'Hide overlay' : 'Show overlay'}</Button>
        )}
      />
      <Notice>{error}</Notice>
      {busy && <Loading label="Updating page overlay…" />}

      <Notice tone="info">
        Containers using <span className="mono">display: grid</span> or <span className="mono">display: flex</span> are highlighted,
        together with their gaps and track boundaries. The overlay is removed when you leave this tool.
      </Notice>

      <Card title="Highlight color">
        <div className="stack">
          <Field label="Color" hint="Changing it while active reapplies the overlay.">
            <Select value={color} onChange={(event) => changeColor(event.target.value)}>
              {GRID_COLORS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </Select>
          </Field>
          <div className="swatch-row">
            {GRID_COLORS.map((option) => (
              <button
                key={option}
                type="button"
                className="chip"
                title={`Use ${option}`}
                aria-pressed={option === color}
                onClick={() => changeColor(option)}
              >
                <Swatch color={option} size={16} />
                <span className="mono">{option}</span>
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card title="What to look for">
        <div className="result-list">
          <ListItem title="Grid tracks" subtitle="See columns, rows and gap spacing." />
          <ListItem title="Flex containers" subtitle="Spot flex direction, wrapping and alignment issues." />
          <ListItem title="Nested layouts" subtitle="Distinguish parent grids from nested child containers." />
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 5. Ruler                                                            */
/* ------------------------------------------------------------------ */

export function RulerTool() {
  const [start, setStart] = useState<PickedElement | null>(null);
  const [end, setEnd] = useState<PickedElement | null>(null);
  const [picking, setPicking] = useState<0 | 1 | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!start || !end) return;
    let cancelled = false;
    (async () => {
      try {
        await page.overlay('ruler', { start: start.selector, end: end.selector });
      } catch (err) {
        if (!cancelled) setError(describeError(err));
      }
    })();
    return () => {
      cancelled = true;
      void page.overlay('none').catch(() => undefined);
    };
  }, [start, end]);

  const measure = async (index: 0 | 1) => {
    setPicking(index);
    setError('');
    try {
      const picked = await page.pick<PickedElement>('measure', index);
      if (index === 0) setStart(picked);
      else setEnd(picked);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setPicking(null);
    }
  };

  const clear = () => {
    setStart(null);
    setEnd(null);
    setError('');
  };

  const dx = start && end ? Math.abs((end.rect?.left || 0) - (start.rect?.left || 0)) : 0;
  const dy = start && end ? Math.abs((end.rect?.top || 0) - (start.rect?.top || 0)) : 0;
  const diagonal = Math.sqrt(dx * dx + dy * dy);

  return (
    <div className="stack">
      <ToolHeader
        title="Element Ruler"
        description="Measure horizontal, vertical and diagonal distance between two elements."
        badge={start && end ? 'Ready' : `${start ? 1 : 0} / 2 points`}
        actions={<Button variant="soft" onClick={clear} disabled={!start && !end}>Clear</Button>}
      />
      <Notice>{error}</Notice>
      {picking !== null && <Loading label={`Click the ${picking === 0 ? 'start' : 'end'} element on the page…`} />}

      <div className="grid-2">
        <Card title="Start point" actions={<Button onClick={() => measure(0)} disabled={picking !== null}>Set start point</Button>}>
          {!start ? <EmptyState>No start point yet.</EmptyState> : (
            <div className="stack">
              <Badge tone="accent">{start.tag}</Badge>
              <span className="mono muted"><ShortText value={start.selector} length={120} /></span>
              <Button variant="ghost" onClick={() => setStart(null)}>Clear start</Button>
            </div>
          )}
        </Card>
        <Card title="End point" actions={<Button onClick={() => measure(1)} disabled={picking !== null}>Set end point</Button>}>
          {!end ? <EmptyState>No end point yet.</EmptyState> : (
            <div className="stack">
              <Badge tone="accent">{end.tag}</Badge>
              <span className="mono muted"><ShortText value={end.selector} length={120} /></span>
              <Button variant="ghost" onClick={() => setEnd(null)}>Clear end</Button>
            </div>
          )}
        </Card>
      </div>

      <Card title="Distances">
        {!start || !end ? (
          <EmptyState>Pick both points to calculate distances.</EmptyState>
        ) : (
          <div className="stack">
            <div className="grid-3">
              <Stat label="Horizontal (dx)" value={`${round(dx, 1)} px`} hint="absolute left offset" />
              <Stat label="Vertical (dy)" value={`${round(dy, 1)} px`} hint="absolute top offset" />
              <Stat label="Diagonal" value={`${round(diagonal, 1)} px`} hint="straight-line distance" />
            </div>
            <Notice tone="info">
              A ruler overlay between <span className="mono">{start.selector}</span> and{' '}
              <span className="mono">{end.selector}</span> is active on the page.
            </Notice>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 6. Palette Extractor                                                */
/* ------------------------------------------------------------------ */

export function PaletteExtractorTool() {
  const [usage, setUsage] = useState<ColorUsage[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [colors, stored] = await Promise.all([
          page.query<ColorUsage[]>('colors'),
          getLocal<string[]>('savedPalette', []),
        ]);
        if (!cancelled) {
          setUsage(Array.isArray(colors) ? colors : []);
          setSaved(Array.isArray(stored) ? stored : []);
        }
      } catch (err) {
        if (!cancelled) setError(describeError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const addColor = async (value: string) => {
    const parsed = safeColor(value);
    if (!parsed) {
      setError('That color could not be parsed.');
      return;
    }
    const hex = formatColor(parsed, 'hex');
    setBusy(true);
    setError('');
    try {
      setSaved(await addHistory<string>('savedPalette', hex));
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const pickColor = async () => {
    setPicking(true);
    setError('');
    try {
      const picked = await page.pick<{ color: { foreground: string; background: string } }>('color');
      const raw = picked?.color?.background || picked?.color?.foreground;
      if (raw) await addColor(raw);
      else setError('The picker did not return a color.');
    } catch (err) {
      setError(describeError(err));
    } finally {
      setPicking(false);
    }
  };

  const clearSaved = async () => {
    setBusy(true);
    setError('');
    try {
      await setLocal('savedPalette', []);
      setSaved([]);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const exportPalette = () => {
    if (!saved.length) {
      setError('Save at least one color before exporting.');
      return;
    }
    try {
      const css = `:root {\n${saved.map((hex, index) => `  --palette-${index + 1}: ${hex};`).join('\n')}\n}\n`;
      downloadText(css, timestampName('palette', 'css'), 'text/css');
    } catch (err) {
      setError(describeError(err));
    }
  };

  const unique = new Map<string, { hex: string; count: number; property: string; sample: string }>();
  for (const item of usage) {
    const parsed = safeColor(item.color);
    if (!parsed) continue;
    const hex = formatColor(parsed, 'hex');
    const previous = unique.get(hex);
    if (previous) previous.count += numberValue(String(item.count), 1);
    else unique.set(hex, { hex, count: numberValue(String(item.count), 1), property: item.property, sample: item.sample });
  }
  const colors = Array.from(unique.values()).sort((a, b) => b.count - a.count);
  const paletteCss = saved.length
    ? `:root {\n${saved.map((hex, index) => `  --palette-${index + 1}: ${hex};`).join('\n')}\n}`
    : '';

  return (
    <div className="stack">
      <ToolHeader
        title="Palette Extractor"
        description="Collect the colors used on the page and build your own palette."
        badge={`${colors.length} unique`}
        actions={(
          <div className="row wrap">
            <Button variant="primary" onClick={pickColor} disabled={picking || busy}>{picking ? 'Picking…' : 'Pick a color'}</Button>
            <Button onClick={exportPalette} disabled={!saved.length}>Export CSS</Button>
          </div>
        )}
      />
      <Notice>{error}</Notice>
      {loading && <Loading label="Scanning page colors…" />}
      {picking && <Loading label="Click a color on the page…" />}
      {busy && <Loading label="Updating saved palette…" />}

      <Card title="Colors on the page" actions={<Badge>{colors.length} unique colors</Badge>}>
        {!loading && !colors.length ? (
          <EmptyState>No usable colors were found on this page.</EmptyState>
        ) : (
          <div className="swatch-grid">
            {colors.map((item) => (
              <div className="swatch-row" key={item.hex}>
                <Swatch color={item.hex} size={32} title={item.hex} />
                <div className="stack">
                  <span className="mono">{item.hex}</span>
                  <span className="muted">{item.count}× on {item.property || 'page'}</span>
                </div>
                <div className="row wrap">
                  <CopyButton value={item.hex} label="Copy hex" />
                  <Button variant="ghost" onClick={() => addColor(item.hex)} disabled={busy}>Save</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Saved palette"
        actions={(
          <div className="row wrap">
            <CopyButton value={paletteCss} label="Copy CSS" />
            <Button variant="danger" onClick={clearSaved} disabled={!saved.length || busy}>Clear</Button>
          </div>
        )}
      >
        {!saved.length ? (
          <EmptyState>Pick a page color or use the eyedropper to start a palette.</EmptyState>
        ) : (
          <div className="stack">
            <div className="swatch-grid">
              {saved.map((hex, index) => (
                <div className="swatch-row" key={`${hex}-${index}`}>
                  <Swatch color={hex} size={28} title={hex} />
                  <span className="mono">{hex}</span>
                  <CopyButton value={hex} label="Copy" />
                </div>
              ))}
            </div>
            <CodeBlock value={paletteCss} title="Palette tokens" maxHeight={200} />
          </div>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 7. Contrast Checker                                                 */
/* ------------------------------------------------------------------ */

const CONTRAST_PRESETS = [
  { label: 'Black on white', foreground: '#000000', background: '#ffffff' },
  { label: 'White on black', foreground: '#ffffff', background: '#000000' },
  { label: 'Gray on white', foreground: '#6b7280', background: '#ffffff' },
];

const CONTRAST_TARGETS = [
  { label: 'AA normal', min: 4.5 },
  { label: 'AA large', min: 3 },
  { label: 'AAA normal', min: 7 },
  { label: 'AAA large', min: 4.5 },
];

export function ContrastCheckerTool() {
  const [foreground, setForeground] = useState('#111827');
  const [background, setBackground] = useState('#ffffff');

  const fg = safeColor(foreground);
  const bg = safeColor(background);
  const ratio = contrastRatio(fg || BLACK, bg || WHITE);
  const readable = readableTextColor(bg || WHITE);
  const css = `color: ${foreground};\nbackground-color: ${background};`;

  return (
    <div className="stack">
      <ToolHeader
        title="Contrast Checker"
        description="Check WCAG contrast for text and background color pairs."
        badge={`${ratio}:1`}
      />

      {(!fg || !bg) && (
        <Notice tone="info">One of the colors could not be parsed; enter a hex, rgb(), hsl() or named color.</Notice>
      )}

      <Card title="Colors">
        <div className="stack">
          <div className="grid-2">
            <Field label="Text color" hint="Foreground color">
              <div className="row wrap">
                <Swatch color={fg ? formatColor(fg, 'hex') : '#000000'} size={28} />
                <Input value={foreground} onChange={(event) => setForeground(event.target.value)} spellCheck={false} />
              </div>
            </Field>
            <Field label="Background color" hint="Surface color">
              <div className="row wrap">
                <Swatch color={bg ? formatColor(bg, 'hex') : '#ffffff'} size={28} />
                <Input value={background} onChange={(event) => setBackground(event.target.value)} spellCheck={false} />
              </div>
            </Field>
          </div>
          <div className="row wrap">
            {CONTRAST_PRESETS.map((preset) => (
              <Button
                key={preset.label}
                onClick={() => { setForeground(preset.foreground); setBackground(preset.background); }}
              >{preset.label}</Button>
            ))}
            <Button variant="ghost" onClick={() => { setForeground(randomHex()); setBackground(randomHex()); }}>Randomize</Button>
          </div>
        </div>
      </Card>

      <Card title="Result" actions={<Badge tone={ratio >= 4.5 ? 'success' : 'danger'}>{ratio}:1</Badge>}>
        <div className="stack">
          <div className="preview-box" style={{ color: foreground, background: background }}>
            <strong>Aa Bb Cc</strong> — The quick brown fox jumps over the lazy dog.
          </div>
          <div className="row wrap">
            {CONTRAST_TARGETS.map((target) => (
              <Badge key={target.label} tone={ratio >= target.min ? 'success' : 'danger'}>
                {ratio >= target.min ? 'Pass' : 'Fail'} · {target.label} ({target.min}:1)
              </Badge>
            ))}
          </div>
          <div className="row wrap">
            <CopyButton value={String(ratio)} label="Copy ratio" />
            <CopyButton value={css} label="Copy CSS" />
          </div>
          <CodeBlock value={css} title="CSS" maxHeight={120} />
        </div>
      </Card>

      <Card title="Recommended readable text">
        <div className="row wrap">
          <Swatch color={readable} size={28} />
          <span className="mono">{readable}</span>
          <Badge tone="success">{contrastRatio(safeColor(readable) || WHITE, bg || WHITE)}:1 on background</Badge>
          <CopyButton value={readable} label="Copy color" />
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 9. CSS Generators                                                   */
/* ------------------------------------------------------------------ */

type GeneratorTab = 'gradient' | 'shadow' | 'radius' | 'clip';
const GENERATOR_TABS: { id: GeneratorTab; label: string }[] = [
  { id: 'gradient', label: 'Gradient' },
  { id: 'shadow', label: 'Shadow' },
  { id: 'radius', label: 'Radius' },
  { id: 'clip', label: 'Clip-path' },
];
const GRADIENT_TYPES: { value: 'linear' | 'radial'; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'radial', label: 'Radial' },
];
const RADIUS_MODES: { value: 'uniform' | 'custom'; label: string }[] = [
  { value: 'uniform', label: 'Uniform' },
  { value: 'custom', label: 'Per corner' },
];
const CLIP_SHAPES = ['circle', 'ellipse', 'triangle', 'inset', 'polygon'];

export function CssGeneratorsTool() {
  const [tab, setTab] = useState<GeneratorTab>('gradient');

  const [gradientType, setGradientType] = useState<'linear' | 'radial'>('linear');
  const [colorA, setColorA] = useState('#6366f1');
  const [colorB, setColorB] = useState('#ec4899');
  const [angle, setAngle] = useState('135');

  const [shadowX, setShadowX] = useState('0');
  const [shadowY, setShadowY] = useState('8');
  const [blur, setBlur] = useState('20');
  const [spread, setSpread] = useState('0');
  const [shadowColor, setShadowColor] = useState('#000000');
  const [opacity, setOpacity] = useState('0.25');

  const [radiusMode, setRadiusMode] = useState<'uniform' | 'custom'>('uniform');
  const [radius, setRadius] = useState('16');
  const [tl, setTL] = useState('8');
  const [tr, setTR] = useState('16');
  const [br, setBR] = useState('24');
  const [bl, setBL] = useState('32');

  const [shape, setShape] = useState('circle');
  const [clipSize, setClipSize] = useState('50');
  const [inset, setInset] = useState('10');
  const [roundness, setRoundness] = useState('12');
  const [polygon, setPolygon] = useState('polygon(50% 0%, 100% 100%, 0% 100%)');

  const parsedA = safeColor(colorA);
  const parsedB = safeColor(colorB);
  const hexA = parsedA ? formatColor(parsedA, 'hex') : colorA;
  const hexB = parsedB ? formatColor(parsedB, 'hex') : colorB;
  const gradientValue = gradientType === 'linear'
    ? `linear-gradient(${numberValue(angle, 135)}deg, ${hexA}, ${hexB})`
    : `radial-gradient(circle, ${hexA}, ${hexB})`;
  const gradientCss = `background: ${gradientValue};`;
  const gradientTailwind = gradientType === 'linear'
    ? `bg-[linear-gradient(${numberValue(angle, 135)}deg,${hexA},${hexB})]`
    : `bg-[radial-gradient(circle,${hexA},${hexB})]`;

  const shadowRgb = safeColor(shadowColor) || BLACK;
  const shadowAlpha = round(Math.min(1, Math.max(0, numberValue(opacity, 0.25))), 2);
  const shadowValue = [
    `${numberValue(shadowX)}px`,
    `${numberValue(shadowY)}px`,
    `${numberValue(blur)}px`,
    `${numberValue(spread)}px`,
    `rgba(${shadowRgb.r},${shadowRgb.g},${shadowRgb.b},${shadowAlpha})`,
  ].join(' ');
  const shadowCss = `box-shadow: ${shadowValue};`;
  const shadowTailwind = `shadow-[${shadowValue.replace(/ /g, '_')}]`;

  const radiusValue = radiusMode === 'uniform'
    ? `${numberValue(radius)}px`
    : [tl, tr, br, bl].map((value) => `${numberValue(value)}px`).join(' ');
  const radiusCss = `border-radius: ${radiusValue};`;
  const radiusTailwind = `rounded-[${radiusValue.replace(/ /g, '_')}]`;

  const clipValue = shape === 'circle'
    ? `circle(${numberValue(clipSize, 50)}% at 50% 50%)`
    : shape === 'ellipse'
      ? `ellipse(${numberValue(clipSize, 50)}% ${Math.round(numberValue(clipSize, 50) * 0.7)}% at 50% 50%)`
      : shape === 'triangle'
        ? 'polygon(50% 0%, 100% 100%, 0% 100%)'
        : shape === 'inset'
          ? `inset(${numberValue(inset)}% round ${numberValue(roundness)}px)`
          : (polygon.trim() || 'polygon(50% 0%, 100% 100%, 0% 100%)');
  const clipCss = `clip-path: ${clipValue};`;
  const clipTailwind = `[clip-path:${clipValue.replace(/\s+/g, '_')}]`;

  const generated = tab === 'gradient'
    ? { css: gradientCss, tailwind: gradientTailwind, style: { background: gradientValue } as CSSProperties }
    : tab === 'shadow'
      ? { css: shadowCss, tailwind: shadowTailwind, style: { boxShadow: shadowValue } as CSSProperties }
      : tab === 'radius'
        ? { css: radiusCss, tailwind: radiusTailwind, style: { borderRadius: radiusValue } as CSSProperties }
        : { css: clipCss, tailwind: clipTailwind, style: { background: hexA, clipPath: clipValue } as CSSProperties };

  return (
    <div className="stack">
      <ToolHeader
        title="CSS Generators"
        description="Build gradients, shadows, radii and clip-paths with live previews."
      />
      <Tabs tabs={GENERATOR_TABS} active={tab} onChange={setTab} />

      <Card title="Controls">
        {tab === 'gradient' && (
          <div className="stack">
            <Segmented options={GRADIENT_TYPES} value={gradientType} onChange={setGradientType} />
            <div className="grid-2">
              <Field label="Start color">
                <div className="row wrap">
                  <Swatch color={hexA} size={28} />
                  <Input value={colorA} onChange={(event) => setColorA(event.target.value)} spellCheck={false} />
                </div>
              </Field>
              <Field label="End color">
                <div className="row wrap">
                  <Swatch color={hexB} size={28} />
                  <Input value={colorB} onChange={(event) => setColorB(event.target.value)} spellCheck={false} />
                </div>
              </Field>
            </div>
            <Field label="Angle (linear only)" hint={`${numberValue(angle, 135)}deg`}>
              <Input type="range" min={0} max={360} step={1} value={angle} onChange={(event) => setAngle(event.target.value)} />
            </Field>
            <div className="row wrap">
              <Button onClick={() => setColorA(randomHex())}>Random start</Button>
              <Button onClick={() => setColorB(randomHex())}>Random end</Button>
            </div>
            {(!parsedA || !parsedB) && <Notice tone="info">Unparsed color text is used as-is in the generated CSS.</Notice>}
          </div>
        )}

        {tab === 'shadow' && (
          <div className="stack">
            <div className="grid-2">
              <Field label="Offset X (px)"><Input type="number" value={shadowX} onChange={(event) => setShadowX(event.target.value)} /></Field>
              <Field label="Offset Y (px)"><Input type="number" value={shadowY} onChange={(event) => setShadowY(event.target.value)} /></Field>
              <Field label="Blur (px)"><Input type="number" min={0} value={blur} onChange={(event) => setBlur(event.target.value)} /></Field>
              <Field label="Spread (px)"><Input type="number" value={spread} onChange={(event) => setSpread(event.target.value)} /></Field>
              <Field label="Color">
                <div className="row wrap">
                  <Swatch color={safeColor(shadowColor) ? colorHex(shadowColor) : '#000000'} size={28} />
                  <Input value={shadowColor} onChange={(event) => setShadowColor(event.target.value)} spellCheck={false} />
                </div>
              </Field>
              <Field label="Opacity" hint={String(shadowAlpha)}>
                <Input type="range" min={0} max={1} step={0.05} value={opacity} onChange={(event) => setOpacity(event.target.value)} />
              </Field>
            </div>
          </div>
        )}

        {tab === 'radius' && (
          <div className="stack">
            <Segmented options={RADIUS_MODES} value={radiusMode} onChange={setRadiusMode} />
            {radiusMode === 'uniform' ? (
              <Field label="Radius (px)"><Input type="number" min={0} value={radius} onChange={(event) => setRadius(event.target.value)} /></Field>
            ) : (
              <div className="grid-2">
                <Field label="Top left"><Input type="number" min={0} value={tl} onChange={(event) => setTL(event.target.value)} /></Field>
                <Field label="Top right"><Input type="number" min={0} value={tr} onChange={(event) => setTR(event.target.value)} /></Field>
                <Field label="Bottom right"><Input type="number" min={0} value={br} onChange={(event) => setBR(event.target.value)} /></Field>
                <Field label="Bottom left"><Input type="number" min={0} value={bl} onChange={(event) => setBL(event.target.value)} /></Field>
              </div>
            )}
          </div>
        )}

        {tab === 'clip' && (
          <div className="stack">
            <Field label="Shape">
              <Select value={shape} onChange={(event) => setShape(event.target.value)}>
                {CLIP_SHAPES.map((option) => <option key={option} value={option}>{option}</option>)}
              </Select>
            </Field>
            {(shape === 'circle' || shape === 'ellipse') && (
              <Field label="Size (%)" hint="Circle radius or ellipse horizontal radius.">
                <Input type="range" min={5} max={75} value={clipSize} onChange={(event) => setClipSize(event.target.value)} />
              </Field>
            )}
            {shape === 'inset' && (
              <div className="grid-2">
                <Field label="Inset (%)"><Input type="number" min={0} max={50} value={inset} onChange={(event) => setInset(event.target.value)} /></Field>
                <Field label="Corner roundness (px)"><Input type="number" min={0} value={roundness} onChange={(event) => setRoundness(event.target.value)} /></Field>
              </div>
            )}
            {shape === 'polygon' && (
              <Field label="Polygon points" hint="Any valid CSS polygon() value.">
                <Textarea rows={3} value={polygon} onChange={(event) => setPolygon(event.target.value)} spellCheck={false} />
              </Field>
            )}
          </div>
        )}
      </Card>

      <Card title="Live preview">
        <div className="preview-box">
          <div className="chip" style={generated.style}>Preview</div>
        </div>
      </Card>

      <Card title="Generated CSS" actions={<CopyButton value={generated.css} label="Copy CSS" />}>
        <div className="stack">
          <CodeBlock value={generated.css} title="CSS" maxHeight={120} />
          <div className="row wrap">
            <CopyButton value={generated.tailwind} label="Copy Tailwind arbitrary value" />
          </div>
          <p className="muted">Tailwind arbitrary values use underscores for spaces.</p>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 10. CSS Variables                                                   */
/* ------------------------------------------------------------------ */

export function CssVariablesTool() {
  const [variables, setVariables] = useState<Declaration[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setRefreshing(true);
    setError('');
    try {
      const result = await page.query<Declaration[]>('variables');
      setVariables(Array.isArray(result) ? result : []);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const query = search.trim().toLowerCase();
  const filtered = query
    ? variables.filter((item) => `${item.property} ${item.value}`.toLowerCase().includes(query))
    : variables;
  const css = declarationsToCss(filtered, ':root');

  const download = () => {
    if (!filtered.length) {
      setError('There are no variables to export.');
      return;
    }
    try {
      downloadText(css, timestampName('tokens', 'css'), 'text/css');
    } catch (err) {
      setError(describeError(err));
    }
  };

  return (
    <div className="stack">
      <ToolHeader
        title="CSS Variables"
        description="Inspect custom properties and design tokens used on the page."
        badge={`${variables.length} variables`}
        actions={(
          <div className="row wrap">
            <Button onClick={load} disabled={refreshing}>{refreshing ? 'Loading…' : 'Refresh'}</Button>
            <Button variant="primary" onClick={download} disabled={!filtered.length}>Download tokens</Button>
          </div>
        )}
      />
      <Notice>{error}</Notice>
      {loading && <Loading label="Reading CSS custom properties…" />}

      <Card title="Custom properties" actions={<Badge>{filtered.length} of {variables.length} shown</Badge>}>
        <div className="stack">
          <Field label="Filter variables" hint="Matches names and values.">
            <Input value={search} placeholder="e.g. --color, --space" onChange={(event) => setSearch(event.target.value)} />
          </Field>
          {!loading && !filtered.length && (
            <EmptyState>{variables.length ? 'No variables match that filter.' : 'No CSS variables were found on this page.'}</EmptyState>
          )}
          {!!filtered.length && (
            <div className="result-list">
              <table className="table">
                <thead>
                  <tr><th>Variable</th><th>Value</th><th>Copy</th></tr>
                </thead>
                <tbody>
                  {filtered.map((item) => {
                    const parsed = safeColor(item.value);
                    return (
                      <tr key={item.property}>
                        <td className="mono">{item.property}</td>
                        <td>
                          <div className="row wrap">
                            {parsed && <Swatch color={formatColor(parsed, 'hex')} size={16} title={item.value} />}
                            <span className="mono"><ShortText value={item.value} length={60} /></span>
                          </div>
                        </td>
                        <td><CopyButton value={item.value} label="Copy value" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <Card title="Tokens CSS" actions={<CopyButton value={css} label="Copy all" />}>
        <CodeBlock value={css} title=":root tokens" maxHeight={260} />
      </Card>
    </div>
  );
}
