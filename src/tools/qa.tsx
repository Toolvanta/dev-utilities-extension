import { useEffect, useState } from 'react';
import { describeError, page } from '../lib/messaging';
import type {
  A11yIssue,
  ConsoleEntry,
  HeadingInfo,
  ImageInfo,
  LinkInfo,
  NetworkEntry,
  PerformanceInfo,
  StorageInfo,
} from '../lib/types';
import {
  copyText,
  downloadText,
  formatBytes,
  safeJson,
  timestampName,
  truncate,
} from '../lib/utils';
import { getLocal, setLocal } from '../lib/storage';
import {
  Badge,
  Button,
  Card,
  CodeBlock,
  CopyButton,
  EmptyState,
  Field,
  Input,
  ListItem,
  Loading,
  Notice,
  Segmented,
  Select,
  ShortText,
  Stat,
  Tabs,
  Textarea,
  Toggle,
  ToolHeader,
  useCopyFeedback,
} from '../components/ui';

/* -------------------------------------------------------------------------- */
/* Viewport Emulator                                                          */
/* -------------------------------------------------------------------------- */

type ViewportPreset = { name: string; width: number; height: number };

const VIEWPORT_PRESETS: ViewportPreset[] = [
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'iPhone 14', width: 390, height: 844 },
  { name: 'iPad', width: 768, height: 1024 },
  { name: 'Laptop', width: 1366, height: 768 },
  { name: 'Desktop', width: 1920, height: 1080 },
];

export function ViewportEmulatorTool() {
  const [width, setWidth] = useState('390');
  const [height, setHeight] = useState('844');
  const [preview, setPreview] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const saved = await getLocal<{ width: number; height: number }>('viewport-size', { width: 390, height: 844 });
        if (active && saved && Number(saved.width) > 0 && Number(saved.height) > 0) {
          setWidth(String(saved.width));
          setHeight(String(saved.height));
        }
      } catch (e) {
        if (active) setError(describeError(e));
      } finally {
        if (active) setRestoring(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const w = Number(width);
  const h = Number(height);
  const valid = Number.isFinite(w) && w >= 200 && w <= 4000 && Number.isFinite(h) && h >= 200 && h <= 4000;

  useEffect(() => {
    if (!preview || !valid) return;
    let active = true;
    (async () => {
      try {
        await page.injectCss('fdu-viewport', `body{max-width:${w}px;margin-inline:auto}`);
      } catch (e) {
        if (active) setError(describeError(e));
      }
    })();
    return () => {
      active = false;
      (async () => {
        try { await page.removeCss('fdu-viewport'); } catch { /* best-effort cleanup on unmount */ }
      })();
    };
  }, [preview, valid, w]);

  useEffect(() => () => {
    (async () => {
      try { await page.removeCss('fdu-viewport'); } catch { /* best-effort cleanup on unmount */ }
    })();
  }, []);

  const choosePreset = async (preset: ViewportPreset) => {
    setWidth(String(preset.width));
    setHeight(String(preset.height));
    setError('');
    try {
      await setLocal('viewport-size', { width: preset.width, height: preset.height });
    } catch (e) {
      setError(describeError(e));
    }
  };

  const openWindow = async () => {
    setError('');
    if (!valid) {
      setError('Enter a width and height between 200 and 4000 pixels.');
      return;
    }
    setBusy(true);
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = tabs[0]?.url;
      if (!url) throw new Error('No active page URL was found.');
      await chrome.windows.create({ url, width: w, height: h });
      await setLocal('viewport-size', { width: w, height: h });
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const resetPreview = async () => {
    setError('');
    try {
      await page.removeCss('fdu-viewport');
      setPreview(false);
    } catch (e) {
      setError(describeError(e));
    }
  };

  if (restoring) return <Loading label="Restoring sizes…" />;

  return (
    <div className="stack">
      <ToolHeader
        title="Viewport Emulator"
        description="Preview the current page at common device sizes."
        badge={`${w || '—'} × ${h || '—'}`}
      />
      <Notice>{error}</Notice>
      <Notice tone="info">
        Extensions cannot change a tab's real viewport without debugger permission. “Open resized window” launches a real
        browser window at the chosen size; the preview toggle only constrains the current page's content width.
      </Notice>

      <Card title="Device presets">
        <div className="row wrap">
          {VIEWPORT_PRESETS.map((preset) => (
            <Button
              key={preset.name}
              variant={w === preset.width && h === preset.height ? 'primary' : 'soft'}
              onClick={() => choosePreset(preset)}
            >
              {preset.name} · {preset.width}×{preset.height}
            </Button>
          ))}
        </div>
      </Card>

      <Card title="Custom size">
        <div className="grid-2">
          <Field label="Width (px)" hint="200–4000">
            <Input type="number" min={200} max={4000} value={width} onChange={(event) => setWidth(event.target.value)} />
          </Field>
          <Field label="Height (px)" hint="200–4000">
            <Input type="number" min={200} max={4000} value={height} onChange={(event) => setHeight(event.target.value)} />
          </Field>
        </div>
        <div className="divider" />
        <div className="row wrap">
          <Button variant="primary" onClick={openWindow} disabled={!valid || busy}>
            {busy ? 'Opening…' : 'Open resized window'}
          </Button>
          <Toggle
            checked={preview && valid}
            onChange={async (next) => {
              setError('');
              if (!next) {
                try { await page.removeCss('fdu-viewport'); } catch (e) { setError(describeError(e)); }
              }
              setPreview(next);
            }}
            label="Preview width in current tab"
            hint="Injects a max-width constraint into the page."
          />
          <Button variant="ghost" onClick={resetPreview}>Reset preview</Button>
        </div>
      </Card>

      <div className="preview-box muted">
        {preview && valid
          ? `Preview active: body max-width: ${w}px; margin-inline: auto.`
          : 'Preview is off. Pick a preset or a custom size, then open a resized window or toggle the width preview.'}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Image Inspector                                                            */
/* -------------------------------------------------------------------------- */

type ImageWithSize = ImageInfo & { bytes?: number; size?: number; fileSize?: number };

export function ImageInspectorTool() {
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setImages((await page.query<ImageInfo[]>('images')) || []);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const missingAlt = images.filter((image) => !image.alt || !image.alt.trim()).length;
  const oversized = images.filter((image) => (
    image.naturalWidth > 0 && image.width > 0 &&
    (image.naturalWidth > image.width * 2 || image.naturalHeight > image.height * 2)
  )).length;
  const needle = search.trim().toLowerCase();
  const filtered = needle ? images.filter((image) => `${image.src} ${image.alt}`.toLowerCase().includes(needle)) : images;

  const reveal = async (image: ImageInfo) => {
    setError('');
    try {
      await page.eval(`document.images[${image.index}]?.scrollIntoView({behavior:"smooth",block:"center"})`);
    } catch (e) {
      setError(describeError(e));
    }
  };

  const openImage = (image: ImageInfo) => {
    setError('');
    try {
      window.open(image.src, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(describeError(e));
    }
  };

  return (
    <div className="stack">
      <ToolHeader title="Image Inspector" description="Review images, alt text, dimensions and source sizes." actions={<Button onClick={load}>Refresh</Button>} />
      <Notice>{error}</Notice>
      {loading ? (
        <Loading label="Scanning images…" />
      ) : (
        <>
          <div className="grid-3">
            <Stat label="Images" value={images.length} />
            <Stat label="Missing alt" value={missingAlt} hint="Accessibility risk" />
            <Stat label="Oversized sources" value={oversized} hint="Source much larger than rendered size" />
          </div>
          <Card title="Images" actions={<CopyButton value={images.map((image) => image.src).join('\n')} label="Copy src list" />}>
            <div className="row wrap">
              <Input placeholder="Search by src or alt text…" value={search} onChange={(event) => setSearch(event.target.value)} />
              <span className="muted">{filtered.length} of {images.length}</span>
            </div>
            {!filtered.length ? (
              <EmptyState>{images.length ? 'No images match this search.' : 'No images were found on this page.'}</EmptyState>
            ) : (
              <div className="result-list">
                {filtered.map((image) => {
                  const extra = image as ImageWithSize;
                  const bytes = extra.bytes ?? extra.size ?? extra.fileSize;
                  const large = image.naturalWidth > 0 && image.width > 0 &&
                    (image.naturalWidth > image.width * 2 || image.naturalHeight > image.height * 2);
                  const upscaled = image.naturalWidth > 0 && image.width > 0 &&
                    (image.width > image.naturalWidth * 1.1 || image.height > image.naturalHeight * 1.1);
                  return (
                    <div key={image.index}>
                      <ListItem
                        onClick={() => reveal(image)}
                        title={
                          <span className="row wrap">
                            <img
                              src={image.src}
                              alt=""
                              style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, background: '#f1f1f1' }}
                            />
                            <span className="mono"><ShortText value={image.src || '(no src)'} length={72} /></span>
                          </span>
                        }
                        subtitle={
                          <span className="row wrap muted">
                            <span>{image.width} × {image.height} rendered</span>
                            <span>natural {image.naturalWidth} × {image.naturalHeight}</span>
                            <span>{bytes ? formatBytes(Number(bytes)) : 'size unavailable'}</span>
                            {image.loading ? <span>loading: {image.loading}</span> : null}
                            {image.srcset ? <span>has srcset</span> : null}
                          </span>
                        }
                        right={
                          <span className="row wrap">
                            {!image.alt || !image.alt.trim() ? <Badge tone="danger">Missing alt</Badge> : null}
                            {large ? <Badge tone="warning">Oversized source</Badge> : null}
                            {upscaled ? <Badge tone="warning">Upscaled</Badge> : null}
                            {!image.complete ? <Badge tone="warning">Not loaded</Badge> : null}
                          </span>
                        }
                      />
                      <div className="row wrap">
                        <CopyButton value={image.src} label="Copy src" />
                        <Button variant="ghost" onClick={() => openImage(image)} title="Open image in a new tab">Download</Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Accessibility Audit                                                        */
/* -------------------------------------------------------------------------- */

type A11yFilter = 'all' | 'error' | 'warning';

const A11Y_FILTERS: { id: A11yFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'error', label: 'Errors' },
  { id: 'warning', label: 'Warnings' },
];

export function AccessibilityAuditTool() {
  const [issues, setIssues] = useState<A11yIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<A11yFilter>('all');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setIssues((await page.query<A11yIssue[]>('a11y')) || []);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const errors = issues.filter((issue) => issue.type === 'error').length;
  const warnings = issues.filter((issue) => issue.type === 'warning').length;
  const filtered = filter === 'all' ? issues : issues.filter((issue) => issue.type === filter);

  const highlight = async (issue: A11yIssue) => {
    setError('');
    try {
      await page.overlay('a11y', { selector: issue.selector });
      if (issue.selector) await page.scrollTo(issue.selector);
    } catch (e) {
      setError(describeError(e));
    }
  };

  const exportReport = () => {
    setError('');
    try {
      const lines = [
        `Accessibility audit — ${new Date().toLocaleString()}`,
        `Errors: ${errors}`,
        `Warnings: ${warnings}`,
        '',
        ...issues.map((issue, index) => (
          `${index + 1}. [${issue.type.toUpperCase()}] ${issue.message}\n   selector: ${issue.selector || 'n/a'}`
        )),
      ];
      downloadText(lines.join('\n'), timestampName('a11y-report', 'txt'));
    } catch (e) {
      setError(describeError(e));
    }
  };

  return (
    <div className="stack">
      <ToolHeader title="Accessibility Audit" description="Quick in-page checks for common accessibility problems." actions={<Button onClick={load}>Refresh</Button>} />
      <Notice>{error}</Notice>
      {loading ? (
        <Loading label="Running accessibility checks…" />
      ) : (
        <>
          <div className="grid-3">
            <Stat label="Total issues" value={issues.length} />
            <Stat label="Errors" value={errors} />
            <Stat label="Warnings" value={warnings} />
          </div>
          <Card
            title="Issues"
            actions={<Button variant="soft" onClick={exportReport}>Export report</Button>}
          >
            <div className="row wrap">
              {A11Y_FILTERS.map((item) => {
                const count = item.id === 'all' ? issues.length : item.id === 'error' ? errors : warnings;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="chip"
                    style={filter === item.id ? { outline: '2px solid currentColor' } : undefined}
                    onClick={() => setFilter(item.id)}
                  >
                    {item.label} ({count})
                  </button>
                );
              })}
            </div>
            <Notice tone="info">Select an issue to highlight and scroll to its element on the page.</Notice>
            {!filtered.length ? (
              <EmptyState>{issues.length ? 'No issues in this category.' : 'No accessibility issues were detected.'}</EmptyState>
            ) : (
              <div className="result-list">
                {filtered.map((issue, index) => (
                  <ListItem
                    key={`${issue.type}-${index}-${issue.selector}`}
                    onClick={() => highlight(issue)}
                    title={issue.message}
                    subtitle={<span className="mono muted"><ShortText value={issue.selector || 'no selector'} length={100} /></span>}
                    right={<Badge tone={issue.type === 'error' ? 'danger' : 'warning'}>{issue.type}</Badge>}
                  />
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Heading Outline                                                            */
/* -------------------------------------------------------------------------- */

export function HeadingOutlineTool() {
  const [headings, setHeadings] = useState<HeadingInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setHeadings((await page.query<HeadingInfo[]>('headings')) || []);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const issues: string[] = [];
  let previousLevel = 0;
  headings.forEach((heading, index) => {
    if (index === 0 && heading.level > 1) {
      issues.push(`The first heading is H${heading.level}; an H1 is usually expected.`);
    } else if (previousLevel && heading.level > previousLevel + 1) {
      issues.push(`H${previousLevel} → H${heading.level}: skipped level before “${truncate(heading.text || 'untitled', 40)}”.`);
    }
    previousLevel = heading.level;
  });

  const markdown = headings.map((heading) => {
    const level = Math.min(6, Math.max(1, heading.level));
    return `${'#'.repeat(level)} ${heading.text || '(empty heading)'}`;
  }).join('\n');

  const scrollTo = async (selector: string) => {
    setError('');
    if (!selector) return;
    try {
      await page.scrollTo(selector);
    } catch (e) {
      setError(describeError(e));
    }
  };

  const copyOutline = async () => {
    setError('');
    try {
      if (await copyText(markdown)) {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }
    } catch (e) {
      setError(describeError(e));
    }
  };

  return (
    <div className="stack">
      <ToolHeader
        title="Heading Outline"
        description="Inspect heading hierarchy and skip levels."
        actions={<Button onClick={load}>Refresh</Button>}
        badge={`${headings.length} headings`}
      />
      <Notice>{error}</Notice>
      {loading ? (
        <Loading label="Reading headings…" />
      ) : (
        <>
          <div className="grid-3">
            <Stat label="Headings" value={headings.length} />
            <Stat label="H1 count" value={headings.filter((heading) => heading.level === 1).length} />
            <Stat label="Level issues" value={issues.length} />
          </div>
          {issues.length > 0 && (
            <Notice tone="info">
              <div className="stack">
                {issues.map((issue, index) => (
                  <div key={index} className="row wrap"><Badge tone="warning">Issue</Badge><span>{issue}</span></div>
                ))}
              </div>
            </Notice>
          )}
          <Card
            title="Document outline"
            actions={<Button variant="soft" onClick={copyOutline} disabled={!headings.length}>{copied ? 'Copied!' : 'Copy Markdown'}</Button>}
          >
            {!headings.length ? (
              <EmptyState>No headings were found on this page.</EmptyState>
            ) : (
              <div className="result-list">
                {headings.map((heading, index) => (
                  <div key={`${heading.selector}-${index}`} style={{ paddingLeft: Math.max(0, (heading.level - 1) * 16) }}>
                    <ListItem
                      onClick={() => scrollTo(heading.selector)}
                      title={
                        <span className="row wrap">
                          <Badge tone="accent">H{heading.level}</Badge>
                          <span>{heading.text || '(empty heading)'}</span>
                        </span>
                      }
                      subtitle={<span className="mono muted"><ShortText value={heading.selector} length={90} /></span>}
                    />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Network Viewer                                                             */
/* -------------------------------------------------------------------------- */

type StatusFilter = 'all' | '2xx' | '3xx' | '4xx' | '5xx';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: '2xx', label: '2xx' },
  { value: '3xx', label: '3xx' },
  { value: '4xx', label: '4xx' },
  { value: '5xx', label: '5xx' },
];

function methodTone(method: string): 'accent' | 'success' | 'danger' | 'default' {
  if (/^(GET|HEAD|OPTIONS)$/i.test(method)) return 'accent';
  if (/^(POST|PUT|PATCH)$/i.test(method)) return 'success';
  if (/^DELETE$/i.test(method)) return 'danger';
  return 'default';
}

function statusTone(status: number): 'success' | 'accent' | 'warning' | 'danger' | 'default' {
  if (status >= 200 && status < 300) return 'success';
  if (status >= 300 && status < 400) return 'accent';
  if (status >= 400 && status < 500) return 'warning';
  if (status >= 500) return 'danger';
  return 'default';
}

export function NetworkViewerTool() {
  const [entries, setEntries] = useState<NetworkEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [method, setMethod] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<NetworkEntry | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setEntries((await page.query<NetworkEntry[]>('network')) || []);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const methods = Array.from(new Set(entries.map((entry) => entry.method).filter(Boolean))).sort();
  const needle = search.trim().toLowerCase();
  const filtered = entries.filter((entry) => {
    if (method !== 'all' && entry.method !== method) return false;
    const statusClass = Number.isFinite(entry.status) ? `${Math.floor(entry.status / 100)}xx` : '';
    if (statusFilter !== 'all' && statusClass !== statusFilter) return false;
    if (needle && !entry.url.toLowerCase().includes(needle)) return false;
    return true;
  });

  const clear = async () => {
    setError('');
    setBusy(true);
    try {
      await page.query('network', { clear: true });
      setSelected(null);
      await load();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <ToolHeader title="Network Viewer" description="Fetch and XHR activity captured on the current page." actions={<Button onClick={load}>Refresh</Button>} />
      <Notice>{error}</Notice>
      {loading ? (
        <Loading label="Reading network log…" />
      ) : (
        <>
          <div className="grid-3">
            <Stat label="Requests" value={entries.length} />
            <Stat label="Failures (4xx+)" value={entries.filter((entry) => entry.status >= 400).length} />
            <Stat label="Transferred" value={formatBytes(entries.reduce((sum, entry) => sum + (Number(entry.size) || 0), 0))} />
          </div>
          <Card
            title="Requests"
            actions={
              <div className="row wrap">
                <CopyButton value={safeJson(entries)} label="Copy JSON" />
                <Button variant="danger" onClick={clear} disabled={busy}>{busy ? 'Clearing…' : 'Clear log'}</Button>
              </div>
            }
          >
            <div className="row wrap">
              <Select value={method} onChange={(event) => setMethod(event.target.value)}>
                <option value="all">All methods</option>
                {methods.map((item) => <option key={item} value={item}>{item}</option>)}
              </Select>
              <Segmented options={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} />
              <Input placeholder="Search URL…" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            {!filtered.length ? (
              <EmptyState>{entries.length ? 'No requests match these filters.' : 'No network requests were captured.'}</EmptyState>
            ) : (
              <>
                <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Method</th>
                      <th style={{ textAlign: 'left' }}>Status</th>
                      <th style={{ textAlign: 'left' }}>Duration</th>
                      <th style={{ textAlign: 'left' }}>Size</th>
                      <th style={{ textAlign: 'left' }}>URL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((entry, index) => (
                      <tr
                        key={`${entry.time}-${index}`}
                        onClick={() => setSelected(selected === entry ? null : entry)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td><Badge tone={methodTone(entry.method)}>{entry.method || '—'}</Badge></td>
                        <td><Badge tone={statusTone(entry.status)}>{entry.status || '—'}</Badge></td>
                        <td className="mono">{Number.isFinite(entry.duration) ? `${Math.round(entry.duration)} ms` : '—'}</td>
                        <td className="mono">{entry.size ? formatBytes(entry.size) : '—'}</td>
                        <td className="mono"><ShortText value={entry.url} length={70} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {selected && <CodeBlock title="Request details" value={safeJson(selected)} />}
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Console Capture                                                            */
/* -------------------------------------------------------------------------- */

const CONSOLE_PATCH = `
(function () {
  if (window.__fduConsolePatched) return;
  window.__fduConsole = window.__fduConsole || [];
  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
    var original = console[level].bind(console);
    console[level] = function () {
      var args = Array.prototype.slice.call(arguments);
      var text = args.map(function (arg) {
        if (typeof arg === 'string') return arg;
        try { return JSON.stringify(arg); } catch (err) { return String(arg); }
      }).join(' ');
      window.__fduConsole.push({ level: level, text: text, time: new Date().toISOString() });
      original.apply(console, args);
    };
  });
  window.__fduConsolePatched = true;
})()
`;

export function ConsoleCaptureTool() {
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [level, setLevel] = useState('all');
  const [monitoring, setMonitoring] = useState(false);
  const { copied, copy } = useCopyFeedback();

  const load = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      setEntries((await page.query<ConsoleEntry[]>('console')) || []);
    } catch (e) {
      setError(describeError(e));
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!monitoring) return;
    const id = setInterval(() => { load(false); }, 2000);
    return () => clearInterval(id);
  }, [monitoring]);

  const levels = Array.from(new Set(['log', 'info', 'warn', 'error', 'debug', ...entries.map((entry) => entry.level)]));
  const filtered = level === 'all' ? entries : entries.filter((entry) => entry.level === level);
  const logText = entries.map((entry) => `[${entry.time}] ${entry.level.toUpperCase()}: ${entry.text}`).join('\n');

  const toggleMonitoring = async (next: boolean) => {
    setError('');
    try {
      if (next) await page.eval(CONSOLE_PATCH);
      setMonitoring(next);
      if (next) await load(false);
    } catch (e) {
      setError(describeError(e));
    }
  };

  const clear = async () => {
    setError('');
    try {
      await page.query('console', { clear: true });
      await load(false);
    } catch (e) {
      setError(describeError(e));
    }
  };

  return (
    <div className="stack">
      <ToolHeader title="Console Capture" description="Logs and page errors from the current tab." actions={<Button onClick={() => load()}>Refresh</Button>} />
      <Notice>{error}</Notice>
      <Notice tone="info">
        The content script records console output for this tab. Turning monitoring on also installs an in-page capture into
        window.__fduConsole; new entries appear automatically while it is on.
      </Notice>
      <Card title="Monitoring">
        <Toggle
          checked={monitoring}
          onChange={toggleMonitoring}
          label="Start monitoring"
          hint="Poll for new console entries every two seconds."
        />
      </Card>
      {loading ? (
        <Loading label="Reading console…" />
      ) : (
        <Card
          title="Console log"
          actions={
            <div className="row wrap">
              <Button variant="soft" onClick={() => copy(logText)}>{copied ? 'Copied!' : 'Copy logs'}</Button>
              <Button variant="danger" onClick={clear}>Clear</Button>
            </div>
          }
        >
          <div className="row wrap">
            <Select value={level} onChange={(event) => setLevel(event.target.value)}>
              <option value="all">All levels</option>
              {levels.map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
            <span className="muted">{filtered.length} of {entries.length} entries</span>
          </div>
          {!filtered.length ? (
            <EmptyState>{entries.length ? 'No entries at this level.' : 'No console output captured yet.'}</EmptyState>
          ) : (
            <div className="result-list">
              {filtered.map((entry, index) => (
                <ListItem
                  key={`${entry.time}-${index}`}
                  title={<span className="mono"><ShortText value={entry.text || '(empty message)'} length={110} /></span>}
                  subtitle={<span className="mono muted">{entry.time}</span>}
                  right={
                    <Badge tone={
                      entry.level === 'error' ? 'danger'
                        : entry.level === 'warn' || entry.level === 'warning' ? 'warning'
                          : entry.level === 'info' ? 'accent' : 'default'
                    }>{entry.level}</Badge>
                  }
                />
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Storage Viewer                                                             */
/* -------------------------------------------------------------------------- */

type StorageTab = 'local' | 'session' | 'cookies' | 'indexedDb';

const STORAGE_TABS: { id: StorageTab; label: string }[] = [
  { id: 'local', label: 'Local' },
  { id: 'session', label: 'Session' },
  { id: 'cookies', label: 'Cookies' },
  { id: 'indexedDb', label: 'IndexedDB' },
];

type StorageRow = { key: string; value: string };

export function StorageViewerTool() {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [active, setActive] = useState<StorageTab>('local');
  const [search, setSearch] = useState('');
  const [entryKey, setEntryKey] = useState('');
  const [entryValue, setEntryValue] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      setInfo(await page.query<StorageInfo>('storage'));
    } catch (e) {
      setError(describeError(e));
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const rows: StorageRow[] = !info ? [] : active === 'local'
    ? info.local.map((item) => ({ key: item.key, value: item.value }))
    : active === 'session'
      ? info.session.map((item) => ({ key: item.key, value: item.value }))
      : active === 'cookies'
        ? info.cookies.map((item) => ({ key: item.name, value: item.value }))
        : info.indexedDb.map((name) => ({ key: name, value: 'IndexedDB database' }));

  const needle = search.trim().toLowerCase();
  const filtered = needle ? rows.filter((row) => `${row.key} ${row.value}`.toLowerCase().includes(needle)) : rows;

  const addEntry = async () => {
    const key = entryKey.trim();
    if (!key) { setError('Enter a key first.'); return; }
    setError('');
    setBusy(true);
    try {
      if (active === 'local') {
        await page.eval(`localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(entryValue)})`);
      } else if (active === 'session') {
        await page.eval(`sessionStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(entryValue)})`);
      } else if (active === 'cookies') {
        const cookie = `${encodeURIComponent(key)}=${encodeURIComponent(entryValue)}; path=/`;
        await page.eval(`document.cookie = ${JSON.stringify(cookie)}`);
      } else {
        setError('IndexedDB databases cannot be added from this tool.');
        return;
      }
      setEntryKey('');
      setEntryValue('');
      await load(false);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const removeEntry = async (key: string) => {
    setError('');
    try {
      if (active === 'local') {
        await page.eval(`localStorage.removeItem(${JSON.stringify(key)})`);
      } else if (active === 'session') {
        await page.eval(`sessionStorage.removeItem(${JSON.stringify(key)})`);
      } else if (active === 'cookies') {
        await page.eval(`document.cookie = ${JSON.stringify(`${encodeURIComponent(key)}=; Max-Age=0; path=/`)}`);
      } else {
        setError('IndexedDB databases cannot be deleted from this tool.');
        return;
      }
      await load(false);
    } catch (e) {
      setError(describeError(e));
    }
  };

  const exportAll = () => {
    setError('');
    try {
      downloadText(safeJson(info), timestampName('storage', 'json'), 'application/json');
    } catch (e) {
      setError(describeError(e));
    }
  };

  return (
    <div className="stack">
      <ToolHeader title="Storage Viewer" description="Inspect and edit storage belonging to the current page." actions={<Button onClick={() => load()}>Refresh</Button>} />
      <Notice>{error}</Notice>
      {loading ? (
        <Loading label="Reading storage…" />
      ) : (
        <>
          <Card
            title="Stored data"
            actions={<Button variant="soft" onClick={exportAll} disabled={!info}>Export JSON</Button>}
          >
            <Tabs tabs={STORAGE_TABS} active={active} onChange={setActive} />
            <div className="row wrap">
              <Input placeholder="Search keys and values…" value={search} onChange={(event) => setSearch(event.target.value)} />
              <span className="muted">{filtered.length} of {rows.length}</span>
            </div>
            {!filtered.length ? (
              <EmptyState>{rows.length ? 'Nothing matches this search.' : `No entries in ${active}.`}</EmptyState>
            ) : (
              <div className="result-list">
                {filtered.map((row, index) => (
                  <ListItem
                    key={`${row.key}-${index}`}
                    title={<span className="mono"><ShortText value={row.key} length={80} /></span>}
                    subtitle={<span className="mono muted"><ShortText value={row.value} length={100} /></span>}
                    right={
                      <div className="row wrap">
                        <CopyButton value={row.value} label="Copy value" />
                        {active !== 'indexedDb' && (
                          <Button variant="danger" onClick={() => removeEntry(row.key)}>Delete</Button>
                        )}
                      </div>
                    }
                  />
                ))}
              </div>
            )}
          </Card>

          <Card title={active === 'indexedDb' ? 'IndexedDB is read-only here' : `Add or edit ${active} entry`}>
            {active === 'indexedDb' ? (
              <Notice tone="info">Database names are listed above; use DevTools to modify IndexedDB contents.</Notice>
            ) : (
              <div className="stack">
                <div className="grid-2">
                  <Field label="Key">
                    <Input value={entryKey} onChange={(event) => setEntryKey(event.target.value)} placeholder={active === 'cookies' ? 'cookie name' : 'storage key'} />
                  </Field>
                  <Field label="Value">
                    <Textarea rows={2} value={entryValue} onChange={(event) => setEntryValue(event.target.value)} placeholder="value" />
                  </Field>
                </div>
                <div className="row wrap">
                  <Button variant="primary" onClick={addEntry} disabled={busy || !entryKey.trim()}>{busy ? 'Saving…' : 'Save entry'}</Button>
                  <span className="muted">Writes are executed on the current page, then the list is reloaded.</span>
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Performance                                                                */
/* -------------------------------------------------------------------------- */

export function PerformanceTool() {
  const [info, setInfo] = useState<PerformanceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setInfo(await page.query<PerformanceInfo>('performance'));
    } catch (e) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const navEntries = info
    ? Object.entries(info.navigation).filter((entry): entry is [string, number] => (
      typeof entry[1] === 'number' && Number.isFinite(entry[1])
    ))
    : [];
  const paintEntries = info ? Object.entries(info.paint) : [];
  const maxNav = Math.max(1, ...navEntries.map(([, value]) => Math.abs(value)));

  return (
    <div className="stack">
      <ToolHeader title="Performance" description="Page weight, paint timings and navigation metrics." actions={<Button onClick={load}>Refresh</Button>} />
      <Notice>{error}</Notice>
      {loading ? (
        <Loading label="Measuring performance…" />
      ) : !info ? (
        <EmptyState>Performance data is unavailable for this page.</EmptyState>
      ) : (
        <>
          <div className="grid-3">
            <Stat label="DOM nodes" value={info.domNodes.toLocaleString()} />
            <Stat label="Resources" value={info.resourceCount.toLocaleString()} />
            <Stat label="Transferred" value={formatBytes(info.resourceBytes)} />
            <Stat label="FCP" value={info.fcp !== null ? `${Math.round(info.fcp)} ms` : '—'} hint="First Contentful Paint" />
            <Stat label="LCP" value={info.lcp !== null ? `${Math.round(info.lcp)} ms` : '—'} hint="Largest Contentful Paint" />
          </div>

          <Card title="Navigation timings" actions={<CopyButton value={safeJson(info)} label="Copy JSON" />}>
            {!navEntries.length ? (
              <EmptyState>No navigation timing entries were reported.</EmptyState>
            ) : (
              <div className="stack">
                {navEntries.map(([name, value]) => (
                  <div key={name} className="stack">
                    <div className="row wrap">
                      <span>{name}</span>
                      <span className="muted mono">{Math.round(value)} ms</span>
                    </div>
                    <div className="bar-track">
                      <div className="bar" style={{ width: `${Math.max(2, Math.min(100, (Math.abs(value) / maxNav) * 100))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Paint entries">
            {!paintEntries.length ? (
              <EmptyState>No paint timing entries were reported.</EmptyState>
            ) : (
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Entry</th>
                    <th style={{ textAlign: 'left' }}>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {paintEntries.map(([name, value]) => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td className="mono">{Math.round(Number(value))} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Link Checker                                                               */
/* -------------------------------------------------------------------------- */

type LinkFilter = 'all' | 'issues' | 'external' | 'internal';

const LINK_FILTERS: { value: LinkFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'issues', label: 'Issues' },
  { value: 'external', label: 'External' },
  { value: 'internal', label: 'Internal' },
];

export function LinkCheckerTool() {
  const [links, setLinks] = useState<LinkInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<LinkFilter>('all');
  const [host, setHost] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      try {
        setHost(new URL(tabs[0]?.url || '').hostname);
      } catch {
        setHost('');
      }
      setLinks((await page.query<LinkInfo[]>('links')) || []);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const broken = links.filter((link) => !!link.issue);
  const isExternal = (href: string) => {
    if (!/^https?:\/\//i.test(href || '')) return false;
    try { return new URL(href).hostname !== host; } catch { return true; }
  };
  const externalCount = links.filter((link) => isExternal(link.href)).length;
  const filtered = links.filter((link) => {
    if (filter === 'issues') return !!link.issue;
    if (filter === 'external') return isExternal(link.href);
    if (filter === 'internal') return !isExternal(link.href);
    return true;
  });

  const openLink = async (link: LinkInfo) => {
    setError('');
    if (!/^https?:\/\//i.test(link.href || '')) return;
    try {
      await chrome.tabs.create({ url: link.href, active: false });
    } catch (e) {
      setError(describeError(e));
    }
  };

  return (
    <div className="stack">
      <ToolHeader title="Link Checker" description="Review anchors for broken, unsafe and external destinations." actions={<Button onClick={load}>Refresh</Button>} />
      <Notice>{error}</Notice>
      {loading ? (
        <Loading label="Scanning links…" />
      ) : (
        <>
          <div className="grid-3">
            <Stat label="Total links" value={links.length} />
            <Stat label="With issues" value={broken.length} />
            <Stat label="External" value={externalCount} />
          </div>
          <Card
            title="Links"
            actions={<CopyButton value={broken.map((link) => link.href).join('\n')} label="Copy broken links" />}
          >
            <Segmented options={LINK_FILTERS} value={filter} onChange={setFilter} />
            <Notice tone="info">Click an http(s) link to open it in a new background tab. Other schemes are ignored.</Notice>
            {!filtered.length ? (
              <EmptyState>{links.length ? 'No links match this filter.' : 'No links were found on this page.'}</EmptyState>
            ) : (
              <div className="result-list">
                {filtered.map((link, index) => (
                  <ListItem
                    key={`${link.href}-${index}`}
                    onClick={() => openLink(link)}
                    title={<span className="mono"><ShortText value={link.href || '(no href)'} length={80} /></span>}
                    subtitle={
                      <span className="row wrap muted">
                        <span>{link.text || '(no text)'}</span>
                        {link.target ? <span>target: {link.target}</span> : null}
                        {link.rel ? <span>rel: {link.rel}</span> : null}
                      </span>
                    }
                    right={
                      <span className="row wrap">
                        {link.issue ? <Badge tone="danger">{link.issue}</Badge> : null}
                        {isExternal(link.href) ? <Badge tone="accent">external</Badge> : null}
                      </span>
                    }
                  />
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Color Blindness                                                            */
/* -------------------------------------------------------------------------- */

type ColorMode = 'normal' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia';

const COLOR_MODES: { id: ColorMode; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'protanopia', label: 'Protanopia' },
  { id: 'deuteranopia', label: 'Deuteranopia' },
  { id: 'tritanopia', label: 'Tritanopia' },
  { id: 'achromatopsia', label: 'Achromatopsia' },
];

const MODE_DESCRIPTIONS: Record<ColorMode, string> = {
  normal: 'No simulation is applied; the page is shown with its original colors.',
  protanopia: 'Reduced sensitivity to red light — reds appear darker and can be confused with greens.',
  deuteranopia: 'Reduced sensitivity to green light — greens and reds look similar and muted.',
  tritanopia: 'Reduced sensitivity to blue light — blues and yellows are harder to distinguish.',
  achromatopsia: 'No color perception — the page is rendered in grayscale.',
};

export function ColorBlindnessTool() {
  const [mode, setMode] = useState<ColorMode>('normal');
  const [restoring, setRestoring] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const saved = await getLocal<ColorMode>('colorblind-mode', 'normal');
        if (!active) return;
        setMode(saved);
        if (saved && saved !== 'normal') await page.setFilter('colorblind', saved);
      } catch (e) {
        if (active) setError(describeError(e));
      } finally {
        if (active) setRestoring(false);
      }
    })();
    return () => {
      active = false;
      (async () => {
        try {
          await page.setFilter('colorblind', null);
          await page.setFilter('dark', null);
        } catch { /* best-effort cleanup on unmount */ }
      })();
    };
  }, []);

  const changeMode = async (next: ColorMode) => {
    setError('');
    setMode(next);
    setBusy(true);
    try {
      await page.setFilter('colorblind', next === 'normal' ? '' : next);
      await setLocal('colorblind-mode', next);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const resetFilters = async () => {
    setError('');
    setBusy(true);
    try {
      await page.setFilter('colorblind', null);
      await page.setFilter('dark', null);
      setMode('normal');
      await setLocal('colorblind-mode', 'normal');
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  if (restoring) return <Loading label="Restoring filter…" />;

  return (
    <div className="stack">
      <ToolHeader title="Color Blindness" description="Simulate common color vision deficiencies on the current page." badge={mode} />
      <Notice>{error}</Notice>
      <Notice tone="info">
        Filters are applied to the inspected tab only. Switching tools or closing the popup removes them automatically.
        {busy ? ' Applying filter…' : ''}
      </Notice>
      <Card title="Simulation mode" actions={<Button variant="soft" onClick={resetFilters} disabled={busy}>Reset filters</Button>}>
        <Tabs tabs={COLOR_MODES} active={mode} onChange={changeMode} />
        <div className="divider" />
        <div className="row wrap">
          <Badge tone={mode === 'normal' ? 'success' : 'accent'}>{mode}</Badge>
          <span>{MODE_DESCRIPTIONS[mode]}</span>
        </div>
      </Card>
      <div className="preview-box muted">
        Colors are transformed in place using CSS filters injected by the extension. Use “Reset filters” to restore the
        page's normal appearance, including dark-mode simulation.
      </div>
    </div>
  );
}
