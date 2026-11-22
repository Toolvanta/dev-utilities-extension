import { useEffect, useMemo, useState } from 'react';
import { Camera, Check, Copy, Crop, Download, Eye, Maximize2, Monitor, Pipette, RefreshCw, Type, Wand2 } from 'lucide-react';
import {
  Badge, Button, Card, CodeBlock, CopyButton, EmptyState, Field, Input, Loading, Notice,
  Segmented, Swatch, Tabs, ToolHeader,
} from '../components/ui';
import { page, describeError, getActiveTab } from '../lib/messaging';
import {
  contrastRatio, formatColor, hslToRgb, paletteFromColor, parseColor, randomHex,
  readableTextColor, rgbToHsl, type Harmony, type RGB,
} from '../lib/color';
import { copyText, downloadDataUrl, timestampName } from '../lib/utils';
import { addHistory, getLocal, setLocal } from '../lib/storage';
import type { PickedElement } from '../lib/types';

const SYSTEM_FONTS = ['Arial', 'Arial Black', 'Georgia', 'Helvetica', 'Times New Roman', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Courier New', 'Comic Sans MS', 'Impact', 'system-ui'];
const GOOGLE_FONTS = ['Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Source Sans 3', 'Nunito', 'Work Sans', 'DM Sans', 'Outfit', 'Space Grotesk', 'Playfair Display', 'Merriweather', 'Fira Code', 'JetBrains Mono'];

export function ColorPickerTool() {
  const [color, setColor] = useState<RGB>({ r: 56, g: 189, b: 248 });
  const [input, setInput] = useState('#38bdf8');
  const [format, setFormat] = useState<'hex' | 'rgb' | 'hsl' | 'tailwind'>('hex');
  const [harmony, setHarmony] = useState<Harmony>('analogous');
  const [recent, setRecent] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => formatColor(color, format), [color, format]);
  const hsl = useMemo(() => rgbToHsl(color.r, color.g, color.b), [color]);

  useEffect(() => { getLocal<string[]>('recentColors', []).then(setRecent); }, []);

  const apply = (next: RGB, asString?: string) => {
    setColor(next);
    setInput(asString ?? formatColor(next, format));
    setError('');
  };

  const commitInput = async () => {
    const parsed = parseColor(input);
    if (!parsed) { setError('Could not read that color. Try #3b82f6, rgb(59,130,246) or a color name.'); return; }
    apply({ r: parsed.r, g: parsed.g, b: parsed.b, a: parsed.a });
    setRecent(await addHistory('recentColors', formatColor(parsed, 'hex')));
  };

  const channel = (key: 'r' | 'g' | 'b', value: number) => apply({ ...color, [key]: Math.max(0, Math.min(255, value)) });

  const eyedropper = async () => {
    try {
      const EyeDropperCtor = (window as any).EyeDropper;
      if (!EyeDropperCtor) { setError('EyeDropper is not available in this browser. Use "Pick from page" instead.'); return; }
      const result = await new EyeDropperCtor().open();
      const parsed = parseColor(result.sRGBHex);
      if (parsed) apply(parsed, result.sRGBHex);
      setRecent(await addHistory('recentColors', result.sRGBHex));
    } catch (e) { if (!(e instanceof DOMException && e.name === 'AbortError')) setError(describeError(e)); }
  };

  const pickFromPage = async () => {
    try {
      const picked = await page.pick<{ color: { foreground: string; background: string } }>('color');
      const parsed = parseColor(picked.color.foreground);
      if (parsed) apply(parsed, picked.color.foreground);
    } catch (e) { setError(describeError(e)); }
  };

  const copy = async () => { if (await copyText(text)) { setCopied(true); setTimeout(() => setCopied(false), 1400); } };
  const whiteRatio = contrastRatio(color, { r: 255, g: 255, b: 255 });
  const blackRatio = contrastRatio(color, { r: 0, g: 0, b: 0 });
  const palette = paletteFromColor(color, harmony);

  return (
    <div className="stack">
      <ToolHeader
        title="Color Picker"
        description="Sample colors, convert formats, and build palettes."
        actions={<Button icon={<Pipette size={14} />} variant="primary" onClick={eyedropper}>Eyedropper</Button>}
      />
      <Notice>{error}</Notice>

      <Card title="Current color">
        <div className="row color-main">
          <div className="color-preview" style={{ background: formatColor(color, 'hex'), color: readableTextColor(color) }}>
            <span>{formatColor(color, 'hex')}</span>
          </div>
          <div className="stack grow">
            <Field label="Value" hint="Paste any CSS color value">
              <Input value={input} onChange={(e) => setInput(e.target.value)} onBlur={commitInput} onKeyDown={(e) => { if (e.key === 'Enter') commitInput(); }} />
            </Field>
            <Segmented options={[{ value: 'hex', label: 'HEX' }, { value: 'rgb', label: 'RGB' }, { value: 'hsl', label: 'HSL' }, { value: 'tailwind', label: 'TW' }]} value={format} onChange={(next) => { setFormat(next); setInput(formatColor(color, next)); }} />
            <div className="row wrap">
              <Button onClick={copy} icon={copied ? <Check size={14} /> : <Copy size={14} />}>{copied ? 'Copied' : 'Copy value'}</Button>
              <Button onClick={pickFromPage} icon={<Eye size={14} />}>Pick from page</Button>
              <Button onClick={() => { const next = parseColor(randomHex()); if (next) apply(next); }} icon={<RefreshCw size={14} />}>Random</Button>
            </div>
          </div>
        </div>
      </Card>

      <Card title="Channels">
        <div className="stack">
          {(['r', 'g', 'b'] as const).map((key) => (
            <div className="row channel-row" key={key}>
              <span className="channel-label">{key.toUpperCase()}</span>
              <input type="range" min={0} max={255} value={Math.round(color[key])} onChange={(e) => channel(key, Number(e.target.value))} />
              <Input type="number" min={0} max={255} value={Math.round(color[key])} onChange={(e) => channel(key, Number(e.target.value))} />
            </div>
          ))}
          <div className="divider" />
          {([
            ['Hue', 'h', 360, hsl.h],
            ['Saturation', 's', 100, hsl.s],
            ['Lightness', 'l', 100, hsl.l],
          ] as const).map(([label, key, max, value]) => (
            <div className="row channel-row" key={key}>
              <span className="channel-label">{label}</span>
              <input type="range" min={0} max={max} value={value} onChange={(e) => {
                const next = { h: hsl.h, s: hsl.s, l: hsl.l, [key]: Number(e.target.value) };
                apply(hslToRgb(next.h, next.s, next.l));
              }} />
              <span className="mono">{value}{key === 'h' ? '°' : '%'}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Contrast" actions={<Badge tone={whiteRatio >= 4.5 ? 'success' : 'warning'}>Readable</Badge>}>
        <div className="grid-2">
          <div className="contrast-tile" style={{ background: '#ffffff', color: readableTextColor({ r: 255, g: 255, b: 255 }) }}>
            <span>On white</span><strong className="mono">{whiteRatio}:1</strong>
          </div>
          <div className="contrast-tile" style={{ background: '#000000', color: '#ffffff' }}>
            <span>On black</span><strong className="mono">{blackRatio}:1</strong>
          </div>
        </div>
        <p className="muted">WCAG AA needs 4.5:1 for normal text and 3:1 for large text.</p>
      </Card>

      <Card title="Color harmony" actions={<select className="select select-sm" value={harmony} onChange={(e) => setHarmony(e.target.value as Harmony)}>
        {(['complementary', 'analogous', 'triadic', 'tetradic', 'monochromatic', 'shades'] as Harmony[]).map((name) => <option key={name} value={name}>{name}</option>)}
      </select>}>
        <div className="swatch-grid">
          {palette.map((item, index) => (
            <button key={index} className="palette-swatch" style={{ background: formatColor(item, 'hex'), color: readableTextColor(item) }} onClick={() => apply(item)} title="Use this color">
              {formatColor(item, 'hex')}
            </button>
          ))}
        </div>
        <CopyButton value={palette.map((item) => formatColor(item, 'hex')).join(', ')} label="Copy palette" />
      </Card>

      {recent.length > 0 && (
        <Card title="Recent colors" actions={<Button variant="ghost" onClick={async () => { await setLocal('recentColors', []); setRecent([]); }}>Clear</Button>}>
          <div className="swatch-row">
            {recent.map((item, index) => <Swatch key={index} color={item} size={30} title={item} />)}
          </div>
        </Card>
      )}
    </div>
  );
}

export function FontPickerTool() {
  const [picked, setPicked] = useState<PickedElement | null>(null);
  const [previewFont, setPreviewFont] = useState('Inter');
  const [search, setSearch] = useState('');
  const [size, setSize] = useState(32);
  const [sample, setSample] = useState('The quick brown fox jumps over 13 lazy dogs');
  const [applied, setApplied] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { getLocal<string[]>('recentFonts', []).then(setRecent); }, []);
  useEffect(() => () => { page.removeCss('fdu-font').catch(() => {}); }, []);

  const pick = async () => {
    setBusy(true); setError('');
    try {
      const result = await page.pick<PickedElement>('font');
      setPicked(result);
      const family = result.font.family.split(',')[0].replace(/["']/g, '').trim();
      if (family) setPreviewFont(family);
    } catch (e) { setError(describeError(e)); }
    finally { setBusy(false); }
  };

  const fonts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...GOOGLE_FONTS.map((name) => ({ name, source: 'Google' })), ...SYSTEM_FONTS.map((name) => ({ name, source: 'System' }))]
      .filter((font) => !q || font.name.toLowerCase().includes(q));
  }, [search]);

  const loadGoogleFont = async (family: string) => {
    const href = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@400;600;700&display=swap`;
    await page.eval(`(function(){if(!document.getElementById('fdu-gfont-${family.replace(/[^a-z0-9]/gi, '')}')){var l=document.createElement('link');l.id='fdu-gfont-${family.replace(/[^a-z0-9]/gi, '')}';l.rel='stylesheet';l.href='${href}';document.head.appendChild(l);}})()`);
  };

  const applyFont = async (family: string) => {
    try {
      if (GOOGLE_FONTS.includes(family)) await loadGoogleFont(family);
      const selector = picked?.selector || 'body';
      const css = `${selector}{font-family:${family.includes(' ') ? `'${family}'` : family},sans-serif !important;}`;
      await page.injectCss('fdu-font', css);
      setApplied(css);
      setRecent(await addHistory('recentFonts', family));
      setError('');
    } catch (e) { setError(describeError(e)); }
  };

  const cssDeclaration = picked
    ? `font-family: ${picked.font.family};\nfont-size: ${picked.font.size};\nfont-weight: ${picked.font.weight};\nline-height: ${picked.font.lineHeight};\nletter-spacing: ${picked.font.letterSpacing};`
    : '';

  return (
    <div className="stack">
      <ToolHeader
        title="Font Picker"
        description="Inspect a page element, preview fonts, and apply them instantly."
        actions={<Button variant="primary" icon={<Type size={14} />} onClick={pick} disabled={busy}>{busy ? 'Picking…' : 'Pick element'}</Button>}
      />
      <Notice>{error}</Notice>

      {picked ? (
        <Card title={`Selected: ${picked.tag}${picked.id ? '#' + picked.id : ''}`} actions={<CopyButton value={cssDeclaration} label="Copy CSS" />}>
          <div className="grid-2">
            <div><span className="muted">Family</span><div className="mono">{picked.font.family}</div></div>
            <div><span className="muted">Size / weight</span><div className="mono">{picked.font.size} / {picked.font.weight}</div></div>
            <div><span className="muted">Line height</span><div className="mono">{picked.font.lineHeight}</div></div>
            <div><span className="muted">Letter spacing</span><div className="mono">{picked.font.letterSpacing}</div></div>
          </div>
        </Card>
      ) : <EmptyState icon={<Type size={22} />}>Click “Pick element”, then click any text on the page.</EmptyState>}

      <Card title="Preview">
        <Input value={sample} onChange={(e) => setSample(e.target.value)} placeholder="Type preview text" />
        <div className="row">
          <Field label="Size"><Input type="number" min={8} max={120} value={size} onChange={(e) => setSize(Number(e.target.value))} /></Field>
          <Field label="Font"><Input value={previewFont} onChange={(e) => setPreviewFont(e.target.value)} /></Field>
        </div>
        <div className="preview-box" style={{ fontFamily: `'${previewFont}', sans-serif`, fontSize: `${size}px`, lineHeight: 1.35 }}>
          {sample}
        </div>
        <div className="row wrap">
          <Button variant="primary" icon={<Wand2 size={14} />} onClick={() => applyFont(previewFont)}>Apply to page</Button>
          <Button icon={<RefreshCw size={14} />} onClick={() => page.removeCss('fdu-font')}>Remove override</Button>
        </div>
        {applied && <CodeBlock title="Injected CSS" value={applied} maxHeight={100} />}
      </Card>

      <Card title="Font library" actions={<Input className="search-input small" placeholder="Search fonts" value={search} onChange={(e) => setSearch(e.target.value)} />}>
        <div className="font-list">
          {fonts.map((font) => (
            <button key={font.name} className={`font-item ${previewFont === font.name ? 'selected' : ''}`} onClick={() => { setPreviewFont(font.name); if (GOOGLE_FONTS.includes(font.name)) loadGoogleFont(font.name).catch(() => {}); }}>
              <span className="font-sample" style={{ fontFamily: `'${font.name}', sans-serif` }}>{font.name}</span>
              <Badge>{font.source}</Badge>
            </button>
          ))}
        </div>
      </Card>

      {recent.length > 0 && <Card title="Recently used"><div className="row wrap">{recent.map((font, i) => <Button key={i} variant="ghost" onClick={() => setPreviewFont(font)}>{font}</Button>)}</div></Card>}
    </div>
  );
}

type CaptureMode = 'viewport' | 'fullpage' | 'element';

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  return image;
}

function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png');
}

export function ScreenshotTool() {
  const [mode, setMode] = useState<CaptureMode>('viewport');
  const [image, setImage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const metrics = async () => page.eval<{ w: number; h: number; dpr: number; scrollW: number; scrollH: number; scrollY: number }>(
    '({w:window.innerWidth,h:window.innerHeight,dpr:window.devicePixelRatio||1,scrollW:document.documentElement.scrollWidth,scrollH:document.documentElement.scrollHeight,scrollY:window.scrollY})',
  );

  const capture = async () => {
    setBusy(true); setError(''); setImage('');
    try {
      const tab = await getActiveTab();
      const tabId = tab.id!;
      const result = await page.query<{ left: number; top: number; width: number; height: number }>('rect');
      const m = await metrics();
      const shot = await chrome.tabs.captureVisibleTab(tabId, { format: 'png' });
      const source = await loadImage(shot);
      const scale = source.naturalWidth / m.w;

      if (mode === 'viewport') {
        setImage(shot);
        setInfo(`${source.naturalWidth} × ${source.naturalHeight}px · viewport`);
      } else if (mode === 'element') {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(result.width * scale));
        canvas.height = Math.max(1, Math.round(result.height * scale));
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(source, result.left * scale, result.top * scale, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
        setImage(canvasToDataUrl(canvas));
        setInfo(`${canvas.width} × ${canvas.height}px · element`);
      } else {
        const originalScroll = m.scrollY;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(Math.min(m.scrollW, m.w) * scale);
        canvas.height = Math.round(m.scrollH * scale);
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const step = Math.max(200, m.h - 40);
        for (let y = 0; y < m.scrollH; y += step) {
          await page.eval(`window.scrollTo(0, ${y})`);
          await new Promise((resolve) => setTimeout(resolve, 140));
          const slice = await chrome.tabs.captureVisibleTab(tabId, { format: 'png' });
          const sliceImage = await loadImage(slice);
          ctx.drawImage(sliceImage, 0, y * scale, canvas.width, sliceImage.naturalHeight);
        }
        await page.eval(`window.scrollTo(0, ${originalScroll})`);
        setImage(canvasToDataUrl(canvas));
        setInfo(`${canvas.width} × ${canvas.height}px · full page`);
      }
    } catch (e) { setError(describeError(e)); }
    finally { setBusy(false); }
  };

  const openEditor = async () => {
    await setLocal('annotateImage', image);
    await chrome.tabs.create({ url: chrome.runtime.getURL('annotate.html') });
  };

  return (
    <div className="stack">
      <ToolHeader
        title="Screenshot"
        description="Capture the viewport, an element, or the entire page."
        actions={<Button variant="primary" icon={<Camera size={14} />} onClick={capture} disabled={busy}>{busy ? 'Capturing…' : 'Capture'}</Button>}
      />
      <Notice>{error}</Notice>
      <Segmented
        options={[
          { value: 'viewport', label: 'Viewport' },
          { value: 'element', label: 'Element' },
          { value: 'fullpage', label: 'Full page' },
        ]}
        value={mode}
        onChange={(next) => setMode(next as CaptureMode)}
      />
      <Card title="Capture mode">
        <div className="row mode-info">
          {mode === 'viewport' && <><Monitor size={18} /><span>What you currently see. Fastest option.</span></>}
          {mode === 'element' && <><Crop size={18} /><span>Uses the last inspected element. Use Selector Copier or Computed CSS to pick one first.</span></>}
          {mode === 'fullpage' && <><Maximize2 size={18} /><span>Scrolls the page and stitches frames together. Sticky elements may repeat.</span></>}
        </div>
      </Card>

      {busy && <Loading label="Capturing screenshot…" />}
      {image ? (
        <Card title="Result" actions={<span className="muted">{info}</span>}>
          <img className="screenshot-preview" src={image} alt="Captured screenshot" />
          <div className="row wrap">
            <Button variant="primary" icon={<Download size={14} />} onClick={() => downloadDataUrl(image, timestampName('screenshot', 'png'))}>Download PNG</Button>
            <Button icon={<Wand2 size={14} />} onClick={openEditor}>Annotate</Button>
            <CopyButton value={image} label="Copy data URL" />
          </div>
        </Card>
      ) : !busy && <EmptyState icon={<Camera size={22} />}>Choose a mode and click Capture.</EmptyState>}
    </div>
  );
}
