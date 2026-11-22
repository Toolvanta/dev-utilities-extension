import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { page, describeError, getActiveTab } from '../lib/messaging';
import type { PickedElement } from '../lib/types';
import type { Declaration } from '../lib/css';
import { declarationsToCss, parseDeclarations } from '../lib/css';
import { copyText, downloadDataUrl, downloadText, formatBytes, safeJson, timestampName, truncate } from '../lib/utils';
import { getLocal, setLocal } from '../lib/storage';
import {
  Badge, Button, Card, CodeBlock, CopyButton, EmptyState, Field, Input, Loading,
  Notice, Segmented, Stat, Tabs, Textarea, ToolHeader,
} from '../components/ui';

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

export function AnnotatedScreenshotTool() {
  const [image, setImage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await getLocal<string>('annotateImage', '');
        if (!cancelled) setImage(saved);
      } catch (caught) {
        if (!cancelled) setError(describeError(caught));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const capture = async () => {
    setBusy(true);
    setError('');
    try {
      const tab = await getActiveTab();
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
      await setLocal('annotateImage', dataUrl);
      setImage(dataUrl);
      await chrome.tabs.create({ url: chrome.runtime.getURL('annotate.html') });
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <ToolHeader
        title="Screenshot Editor"
        description="Capture the visible viewport, annotate it in a new tab, and save the PNG."
        actions={<Badge tone="accent">Local only</Badge>}
      />
      <Card title="Capture">
        <div className="stack">
          <div className="row wrap">
            <Button variant="primary" disabled={busy} onClick={() => void capture()}>
              Capture &amp; annotate
            </Button>
            <Button
              variant="outline"
              disabled={!image}
              onClick={() => image && downloadDataUrl(image, timestampName('annotated-screenshot', 'png'))}
            >
              Download raw PNG
            </Button>
          </div>
          {busy && <Loading label="Capturing viewport…" />}
          <Notice>{error}</Notice>
          <Notice tone="info">
            The capture is stored in this extension’s local storage and opened in the annotation editor. Nothing is uploaded.
          </Notice>
        </div>
      </Card>
      <Card title="Preview">
        {image ? (
          <div className="preview-box" style={{ padding: 0, overflow: 'hidden', display: 'flex', justifyContent: 'center' }}>
            <img src={image} alt="Last viewport capture" style={{ maxWidth: '100%', maxHeight: 220, objectFit: 'contain' }} />
          </div>
        ) : (
          <EmptyState>No capture yet. Click “Capture &amp; annotate” to start.</EmptyState>
        )}
      </Card>
    </div>
  );
}

type SnapshotTab = 'html' | 'css' | 'combined';

export function ElementSnapshotTool() {
  const [picked, setPicked] = useState<PickedElement | null>(null);
  const [tab, setTab] = useState<SnapshotTab>('combined');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pick = async () => {
    setBusy(true);
    setError('');
    try {
      const element = await page.pick<PickedElement>('element');
      if (!element) throw new Error('No element was picked.');
      setPicked(element);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  };

  const html = picked ? (picked.outerHtml || picked.html || '') : '';
  const css = picked ? declarationsToCss(picked.styles || [], picked.selector || picked.tag) : '';
  const combined = picked
    ? `<!-- ${picked.tag} · ${picked.selector} -->\n${html}\n\n<style>\n${css}\n</style>\n`
    : '';
  const content = tab === 'html' ? html : tab === 'css' ? css : combined;

  return (
    <div className="stack">
      <ToolHeader
        title="Element Snapshot"
        description="Pick an element and export its markup together with its computed styles."
        actions={<Button variant="primary" disabled={busy} onClick={() => void pick()}>Pick element</Button>}
      />
      {busy && <Loading label="Waiting for a click on the page…" />}
      <Notice>{error}</Notice>

      <Card title="Selected element">
        {picked ? (
          <div className="stack">
            <div className="row wrap">
              <Badge tone="accent">{picked.tag}</Badge>
              <span className="mono" title={picked.selector}>{truncate(picked.selector, 120)}</span>
            </div>
            <div className="muted">XPath: <span className="mono">{truncate(picked.xpath, 120)}</span></div>
          </div>
        ) : (
          <EmptyState>Pick an element to build an HTML + CSS snapshot.</EmptyState>
        )}
      </Card>

      <Card title="Snippet">
        <div className="stack">
          <Tabs<SnapshotTab>
            tabs={[
              { id: 'html', label: 'HTML' },
              { id: 'css', label: 'CSS' },
              { id: 'combined', label: 'Combined' },
            ]}
            active={tab}
            onChange={setTab}
          />
          <CodeBlock value={content} title={tab === 'css' ? 'Computed CSS' : tab === 'html' ? 'Markup' : 'HTML + CSS'} />
          <div className="row wrap">
            <CopyButton value={content} label="Copy snippet" />
            <Button
              variant="outline"
              disabled={!content}
              onClick={() => downloadText(content, timestampName('element-snapshot', 'html'), 'text/html')}
            >
              Download .html
            </Button>
          </div>
          <Notice tone="info">
            The CSS tab uses the element’s own selector, so the snippet can be pasted into a stylesheet without renaming.
          </Notice>
        </div>
      </Card>
    </div>
  );
}

export function ScreenRecorderTool() {
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [size, setSize] = useState(0);
  const [dataUrl, setDataUrl] = useState('');
  const [error, setError] = useState('');

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const mimeRef = useRef('video/webm');

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => () => {
    clearTimer();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      try { recorder.stop(); } catch { /* already stopping */ }
    }
    if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
  }, []);

  const start = async () => {
    setError('');
    setStarting(true);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('Screen recording is not supported in this browser.');
      }
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      mimeRef.current = mimeType;

      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current = [];
      setSize(0);
      setDataUrl('');
      setElapsed(0);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
          setSize((current) => current + event.data.size);
        }
      };
      recorder.onerror = (event) => {
        setError(describeError((event as any).error || 'Recording failed.'));
        setRecording(false);
        clearTimer();
      };
      recorder.onstop = () => {
        clearTimer();
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);

        const blob = new Blob(chunksRef.current, { type: mimeRef.current });
        if (!blob.size) return;
        setSize(blob.size);
        const reader = new FileReader();
        reader.onload = () => {
          const result = typeof reader.result === 'string' ? reader.result : '';
          if (!result) return;
          setDataUrl(result);
          downloadDataUrl(result, timestampName('recording', 'webm'));
        };
        reader.onerror = () => setError('Could not read the recorded video.');
        reader.readAsDataURL(blob);
      };

      stream.getVideoTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          if (recorder.state === 'recording') recorder.stop();
        });
      });

      recorder.start(250);
      startRef.current = Date.now();
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }, 250);
    } catch (caught) {
      setError(describeError(caught));
      if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      clearTimer();
      setRecording(false);
    } finally {
      setStarting(false);
    }
  };

  const stop = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch (caught) {
        setError(describeError(caught));
      }
    }
    clearTimer();
    setRecording(false);
  };

  return (
    <div className="stack">
      <ToolHeader
        title="Screen Recorder"
        description="Record a tab or window as a WebM video, saved straight to your downloads."
        actions={<Badge tone={recording ? 'danger' : 'default'}>{recording ? 'Recording' : 'Idle'}</Badge>}
      />
      <Card title="Recording">
        <div className="stack">
          <Notice tone="info">
            Your browser will ask which tab, window, or screen to share. Pick the tab you want to record before starting.
          </Notice>
          <div className="row wrap">
            <Button variant="primary" disabled={recording || starting} onClick={() => void start()}>
              Start recording
            </Button>
            <Button variant="danger" disabled={!recording} onClick={stop}>Stop</Button>
          </div>
          {starting && <Loading label="Waiting for screen selection…" />}
          <Notice>{error}</Notice>
          <div className="grid-3">
            <Stat label="Timer" value={<span className="mono">{formatDuration(elapsed)}</span>} />
            <Stat label="Captured size" value={formatBytes(size)} />
            <Stat label="Format" value={mimeRef.current.includes('vp9') ? 'WebM · VP9' : 'WebM'} />
          </div>
        </div>
      </Card>
      {dataUrl && (
        <Card title="Last recording">
          <div className="stack">
            <video src={dataUrl} controls style={{ width: '100%', maxHeight: 260 }} />
            <Button
              variant="outline"
              onClick={() => downloadDataUrl(dataUrl, timestampName('recording', 'webm'))}
            >
              Download again
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

export function PdfExportTool() {
  const [mode, setMode] = useState<'whole' | 'selection'>('whole');
  const [picked, setPicked] = useState<PickedElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const injectedRef = useRef(false);

  useEffect(() => () => {
    if (injectedRef.current) page.removeCss('fdu-print').catch(() => { /* page may be gone */ });
  }, []);

  const exportPdf = async () => {
    setBusy(true);
    setError('');
    setDone('');
    try {
      if (mode === 'whole') {
        await page.print();
        setDone('Print dialog opened. Choose “Save as PDF” as the destination.');
        return;
      }

      let element = picked;
      if (!element) {
        element = await page.pick<PickedElement>('element');
        if (!element) throw new Error('No element was selected.');
        setPicked(element);
      }
      const selector = element.selector || element.tag;
      const css = `@media print {\n  body * { visibility: hidden !important; }\n  ${selector}, ${selector} * { visibility: visible !important; }\n  ${selector} { position: absolute; left: 0; top: 0; }\n}\n`;
      await page.injectCss('fdu-print', css);
      injectedRef.current = true;
      await page.print();
      setDone('Selection print styles applied. Choose “Save as PDF” in the dialog.');
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    setError('');
    setDone('');
    try {
      await page.removeCss('fdu-print');
      injectedRef.current = false;
      setDone('Print styles removed from the page.');
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <ToolHeader
        title="PDF Export"
        description="Use the browser print dialog to save the whole page or just one element as a PDF."
        actions={injectedRef.current ? <Badge tone="warning">Selection CSS active</Badge> : <Badge tone="default">Ready</Badge>}
      />
      <Card title="Export options">
        <div className="stack">
          <Segmented<'whole' | 'selection'>
            options={[{ value: 'whole', label: 'Whole page' }, { value: 'selection', label: 'Selection only' }]}
            value={mode}
            onChange={setMode}
          />
          {mode === 'selection' && picked && (
            <div className="muted">
              Selected: <span className="mono">{truncate(picked.selector, 120)}</span>
            </div>
          )}
          <div className="row wrap">
            <Button variant="primary" disabled={busy} onClick={() => void exportPdf()}>
              Open print dialog
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void reset()}>Reset page</Button>
          </div>
          {busy && <Loading label={mode === 'selection' && !picked ? 'Waiting for a click on the page…' : 'Preparing print view…'} />}
          <Notice>{error}</Notice>
          <Notice tone="success">{done}</Notice>
          <Notice tone="info">
            The extension prepares the view; the browser’s print dialog does the final save. Select “Save as PDF” as the destination.
          </Notice>
        </div>
      </Card>
    </div>
  );
}

export function QrCodeTool() {
  const [url, setUrl] = useState('');
  const [dataUrl, setDataUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const generate = async (value: string) => {
    setError('');
    if (!value.trim()) {
      setError('Enter a URL to generate a QR code.');
      return;
    }
    setBusy(true);
    try {
      const result = await QRCode.toDataURL(value.trim(), {
        width: 320,
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' },
      });
      setDataUrl(result);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tab = await getActiveTab();
        const initial = tab.url || '';
        if (!cancelled) {
          setUrl(initial);
          if (initial) await generate(initial);
        }
      } catch (caught) {
        if (!cancelled) setError(describeError(caught));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const copyUrl = async () => {
    setError('');
    try {
      if (await copyText(url)) {
        setCopied(true);
      } else {
        setError('Clipboard permission was denied.');
      }
    } catch (caught) {
      setError(describeError(caught));
    }
  };

  return (
    <div className="stack">
      <ToolHeader
        title="QR Code"
        description="Create a scannable QR code for the current tab or any URL you paste in."
        actions={<Badge tone="accent">320 × 320</Badge>}
      />
      <Card title="URL">
        <div className="stack">
          <Field label="QR content" hint="Edit the URL, then regenerate.">
            <Input
              value={url}
              placeholder="https://example.com"
              onChange={(event) => { setUrl(event.target.value); setCopied(false); }}
            />
          </Field>
          <div className="row wrap">
            <Button variant="primary" disabled={busy} onClick={() => void generate(url)}>Regenerate</Button>
            <Button variant="soft" disabled={!url} onClick={() => void copyUrl()}>{copied ? 'URL copied' : 'Copy URL'}</Button>
            <CopyButton value={dataUrl} label="Copy data URL" />
            <Button
              variant="outline"
              disabled={!dataUrl}
              onClick={() => dataUrl && downloadDataUrl(dataUrl, timestampName('qr-code', 'png'))}
            >
              Download PNG
            </Button>
          </div>
          {busy && <Loading label="Generating QR code…" />}
          <Notice>{error}</Notice>
        </div>
      </Card>
      <Card title="Preview">
        {dataUrl ? (
          <div className="preview-box" style={{ display: 'flex', justifyContent: 'center' }}>
            <img src={dataUrl} alt="QR code" width={320} height={320} style={{ imageRendering: 'pixelated' }} />
          </div>
        ) : (
          <EmptyState>No QR code yet. Enter a URL and generate one.</EmptyState>
        )}
      </Card>
    </div>
  );
}

type ExportFormat = 'css' | 'scss' | 'tailwind';

function buildTokenOutput(format: ExportFormat, variables: Declaration[]): string {
  if (format === 'scss') {
    return `${variables
      .map((variable) => `$${variable.property.replace(/^--/, '')}: ${variable.value};`)
      .join('\n')}\n`;
  }
  if (format === 'tailwind') {
    const entries = variables
      .map((variable) => {
        const key = variable.property.replace(/^--/, '').replace(/'/g, "\\'");
        const value = variable.value.replace(/'/g, "\\'");
        return `      '${key}': '${value}',`;
      })
      .join('\n');
    return `module.exports = {\n  theme: {\n    extend: {\n      colors: {\n${entries}\n      },\n    },\n  },\n};\n`;
  }
  const body = variables.map((variable) => `  ${variable.property}: ${variable.value};`).join('\n');
  return `:root {\n${body}\n}\n`;
}

export function CssExportTool() {
  const [format, setFormat] = useState<ExportFormat>('css');
  const [variables, setVariables] = useState<Declaration[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const load = async () => {
    setBusy(true);
    setError('');
    setDone('');
    try {
      const result = await page.query<Declaration[]>('variables');
      const list = Array.isArray(result)
        ? result.filter((item) => item && item.property && item.value)
        : [];
      setVariables(list);
      setText(buildTokenOutput(format, list));
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const changeFormat = (next: ExportFormat) => {
    setFormat(next);
    setText(buildTokenOutput(next, variables));
  };

  const addPickedColors = async () => {
    setBusy(true);
    setError('');
    setDone('');
    try {
      const element = await page.pick<PickedElement>('color');
      if (!element) throw new Error('No element was picked.');
      const additions: Declaration[] = [];
      if (element.color && element.color.foreground) {
        additions.push({ property: '--picked-foreground', value: element.color.foreground });
      }
      if (element.color && element.color.background) {
        additions.push({ property: '--picked-background', value: element.color.background });
      }
      if (!additions.length) throw new Error('The picked element did not expose any colors.');
      const next = [
        ...variables.filter((variable) => !additions.some((item) => item.property === variable.property)),
        ...additions,
      ];
      setVariables(next);
      setText(buildTokenOutput(format, next));
      setDone(`${additions.length} picked color${additions.length === 1 ? '' : 's'} added.`);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  };

  const reformat = () => {
    setError('');
    try {
      const cleaned = text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !/^(module|theme|extend|colors|:root|\{|\}|\/\/)/.test(line))
        .map((line) => line.replace(/,$/, '').replace(/;$/, ''))
        .join(';\n');
      const parsed: Declaration[] = parseDeclarations(cleaned)
        .map((item) => ({
          property: item.property.replace(/^\$/, '').replace(/^['"]|['"]$/g, ''),
          value: item.value.replace(/,$/, '').replace(/^['"]|['"]$/g, ''),
        }))
        .filter((item) => item.property && item.value && !['theme', 'extend', 'colors'].includes(item.property));
      setVariables(parsed);
      setText(buildTokenOutput(format, parsed));
      setDone(`Reformatted ${parsed.length} token${parsed.length === 1 ? '' : 's'}.`);
    } catch (caught) {
      setError(describeError(caught));
    }
  };

  const extension = format === 'css' ? 'css' : format === 'scss' ? 'scss' : 'js';
  const mimeType = format === 'css' ? 'text/css' : format === 'scss' ? 'text/x-scss' : 'text/javascript';

  return (
    <div className="stack">
      <ToolHeader
        title="CSS Export"
        description="Export page variables as CSS, SCSS, or a Tailwind color config, then edit the result."
        actions={<Badge>{variables.length} tokens</Badge>}
      />
      <Card title="Format">
        <div className="stack">
          <Tabs<ExportFormat>
            tabs={[
              { id: 'css', label: 'CSS' },
              { id: 'scss', label: 'SCSS' },
              { id: 'tailwind', label: 'Tailwind' },
            ]}
            active={format}
            onChange={changeFormat}
          />
          <div className="row wrap">
            <Button variant="soft" disabled={busy} onClick={() => void load()}>Reload variables</Button>
            <Button variant="outline" disabled={busy} onClick={() => void addPickedColors()}>Add picked colors</Button>
            <Button variant="ghost" disabled={!text} onClick={reformat}>Reformat edited tokens</Button>
          </div>
          {busy && <Loading label={format === 'css' ? 'Reading page variables…' : 'Working…'} />}
          <Notice>{error}</Notice>
          <Notice tone="success">{done}</Notice>
          {!variables.length && (
            <EmptyState>No CSS variables found. Reload after the page loads, or add colors from an element.</EmptyState>
          )}
        </div>
      </Card>
      <Card title="Output" actions={<CopyButton value={text} label="Copy output" />}>
        <div className="stack">
          <Textarea value={text} rows={14} spellCheck={false} onChange={(event) => setText(event.target.value)} />
          <div className="row wrap">
            <Button
              variant="primary"
              disabled={!text}
              onClick={() => downloadText(text, timestampName('tokens', extension), mimeType)}
            >
              Download .{extension}
            </Button>
            <CopyButton value={safeJson(variables)} label="Copy token JSON" />
          </div>
          <Notice tone="info">
            Edits in the textarea are included in the download. Use “Reformat edited tokens” to apply your edits across formats.
          </Notice>
        </div>
      </Card>
    </div>
  );
}
