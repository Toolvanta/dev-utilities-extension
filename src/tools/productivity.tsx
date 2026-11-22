import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Pencil, Play, Trash2 } from 'lucide-react';
import { page, describeError } from '../lib/messaging';
import { parseDeclarations } from '../lib/css';
import { copyText, downloadText, safeJson, uid, truncate, formatBytes } from '../lib/utils';
import { getLocal, setLocal, addHistory, getSetting, setSetting } from '../lib/storage';
import {
  ToolHeader, Card, Button, IconButton, Field, Input, Textarea, Select, Toggle,
  Badge, Notice, EmptyState, Loading, CopyButton, CodeBlock, Tabs,
  Swatch, Stat, ListItem, ShortText, useCopyFeedback,
} from '../components/ui';

const CSS_ID = 'fdu-live-css';

interface CssStyle { id: string; name: string; css: string }
interface Snippet { id: string; name: string; language: 'js' | 'css' | 'html'; code: string }

/* -------------------------------------------------------------------------- */
/* 1. Live CSS Editor                                                          */
/* -------------------------------------------------------------------------- */

const STARTER_CSS = `/* Try it: make every button a little friendlier */
button, [role="button"] {
  border-radius: 8px !important;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
button:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
}`;

export function LiveCssEditorTool() {
  const [css, setCss] = useState(STARTER_CSS);
  const [autoApply, setAutoApply] = useState(false);
  const [keepAfterClose, setKeepAfterClose] = useState(false);
  const [name, setName] = useState('');
  const [library, setLibrary] = useState<CssStyle[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(false);
  const keepRef = useRef(false);
  const { copied, copy } = useCopyFeedback();

  useEffect(() => { keepRef.current = keepAfterClose; }, [keepAfterClose]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [saved, keep] = await Promise.all([
          getLocal<CssStyle[]>('cssLibrary', []),
          getSetting<boolean>('keepCss', false),
        ]);
        if (!alive) return;
        setLibrary(saved || []);
        setKeepAfterClose(!!keep);
      } catch (err) {
        if (alive) setError(describeError(err));
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => () => {
    if (!keepRef.current) page.removeCss(CSS_ID).catch(() => {});
  }, []);

  const apply = async (source: string = css) => {
    try {
      setBusy(true);
      setError('');
      await page.injectCss(CSS_ID, source);
      setApplied(true);
      setNotice('Styles injected into the active page.');
    } catch (err) {
      setError(describeError(err));
      setNotice('');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    try {
      setBusy(true);
      setError('');
      await page.removeCss(CSS_ID);
      setApplied(false);
      setNotice('Injected styles removed from the page.');
    } catch (err) {
      setError(describeError(err));
      setNotice('');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!autoApply) return;
    const timer = setTimeout(() => { void apply(css); }, 400);
    return () => clearTimeout(timer);
  }, [autoApply, css]);

  const saveToLibrary = async () => {
    const label = name.trim() || `Style ${library.length + 1}`;
    const item: CssStyle = { id: uid('css'), name: label, css };
    try {
      setBusy(true);
      setError('');
      const next = [item, ...library];
      await setLocal('cssLibrary', next);
      setLibrary(next);
      setName('');
      setNotice(`Saved “${label}” to your library.`);
    } catch (err) {
      setError(describeError(err));
      setNotice('');
    } finally {
      setBusy(false);
    }
  };

  const deleteSaved = async (id: string) => {
    try {
      setBusy(true);
      const next = library.filter((item) => item.id !== id);
      await setLocal('cssLibrary', next);
      setLibrary(next);
      setNotice('Saved style deleted.');
      setError('');
    } catch (err) {
      setError(describeError(err));
      setNotice('');
    } finally {
      setBusy(false);
    }
  };

  const changeKeep = async (checked: boolean) => {
    setKeepAfterClose(checked);
    try {
      await setSetting('keepCss', checked);
      setNotice(checked ? 'Styles will remain after closing this tool.' : 'Styles will be cleaned up when closing this tool.');
      setError('');
    } catch (err) {
      setError(describeError(err));
      setNotice('');
    }
  };

  const declarationCount = parseDeclarations(css).length;

  return (
    <div className="stack">
      <ToolHeader
        title="Live CSS Editor"
        description="Inject styles into the active tab and preview changes without touching the source."
        badge={`${declarationCount} declarations`}
      />
      <Notice>{error}</Notice>
      <Notice tone="success">{notice}</Notice>
      {busy && <Loading label="Talking to the page…" />}

      <Card
        title="Stylesheet"
        actions={applied ? <Badge tone="success">Injected</Badge> : <Badge>Not applied</Badge>}
      >
        <div className="stack">
          <Field label="CSS" hint={`Injected with the id “${CSS_ID}”. Use !important to override page styles.`}>
            <Textarea
              value={css}
              onChange={(event) => setCss(event.target.value)}
              rows={13}
              spellCheck={false}
              placeholder="/* Your CSS here */"
            />
          </Field>
          <div className="row wrap">
            <Button variant="primary" disabled={busy || !css.trim()} onClick={() => void apply()}>Apply</Button>
            <Button variant="outline" disabled={busy} onClick={() => void remove()}>Remove</Button>
            <Button disabled={copied || !css} onClick={() => void copy(css)}>{copied ? 'Copied' : 'Copy CSS'}</Button>
          </div>
          <div className="divider" />
          <Toggle
            checked={autoApply}
            onChange={setAutoApply}
            label="Auto-apply while typing"
            hint="Re-injects the stylesheet 400 ms after you stop typing."
          />
        </div>
      </Card>

      <Card title="Saved styles">
        <div className="stack">
          <div className="row wrap">
            <Field label="Name" className="row">
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Hide cookie banner" />
            </Field>
            <Button variant="primary" disabled={busy} onClick={() => void saveToLibrary()}>Save to library</Button>
          </div>
          {library.length === 0 ? (
            <EmptyState>No saved styles yet. Name a stylesheet and save it for later.</EmptyState>
          ) : (
            <div className="result-list">
              {library.map((item) => (
                <ListItem
                  key={item.id}
                  title={item.name}
                  subtitle={<ShortText value={item.css} length={70} />}
                  right={
                    <div className="row wrap">
                      <Button variant="soft" disabled={busy} onClick={() => void apply(item.css)}>Apply</Button>
                      <CopyButton value={item.css} label="Copy" />
                      <IconButton title="Delete" onClick={() => void deleteSaved(item.id)}><Trash2 size={14} /></IconButton>
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card title="Behavior">
        <Toggle
          checked={keepAfterClose}
          onChange={(event) => void changeKeep(event)}
          label="Keep styles after closing tool"
          hint="When off, injected CSS is removed automatically when this tool unmounts."
        />
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 2. Snippet Library                                                          */
/* -------------------------------------------------------------------------- */

function seedSnippets(): Snippet[] {
  return [
    {
      id: uid('snip'),
      name: 'Log all images',
      language: 'js',
      code: `(() => {
  const images = [...document.images];
  console.table(images.map((img) => ({ src: img.currentSrc || img.src, alt: img.alt })));
  return images.length;
})();`,
    },
    {
      id: uid('snip'),
      name: 'Outline buttons',
      language: 'css',
      code: `button, [role="button"] {
  outline: 2px solid #ff5722 !important;
  outline-offset: 2px;
}`,
    },
    {
      id: uid('snip'),
      name: 'Inject toast',
      language: 'html',
      code: `<div style="position:fixed;right:20px;bottom:20px;z-index:2147483647;background:#111827;color:#fff;padding:12px 16px;border-radius:10px;font:14px system-ui;box-shadow:0 10px 30px rgba(0,0,0,.35)">Hello from Dev Utility 👋</div>`,
    },
  ];
}

export function SnippetLibraryTool() {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [name, setName] = useState('');
  const [language, setLanguage] = useState<Snippet['language']>('js');
  const [code, setCode] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [result, setResult] = useState('');
  const [resultFor, setResultFor] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [stored, seeded] = await Promise.all([
          getLocal<Snippet[]>('snippets', []),
          getLocal<boolean>('snippetsSeeded', false),
        ]);
        if (!alive) return;
        if ((!stored || !stored.length) && !seeded) {
          const seeds = seedSnippets();
          await setLocal('snippets', seeds);
          await setLocal('snippetsSeeded', true);
          if (alive) setSnippets(seeds);
        } else {
          setSnippets(stored || []);
        }
      } catch (err) {
        if (alive) setError(describeError(err));
      }
    })();
    return () => { alive = false; };
  }, []);

  const resetForm = () => {
    setName('');
    setLanguage('js');
    setCode('');
    setEditingId(null);
  };

  const saveSnippet = async () => {
    if (!name.trim() || !code.trim()) {
      setError('Give the snippet a name and some code first.');
      return;
    }
    try {
      setBusy(true);
      setError('');
      const item: Snippet = { id: editingId || uid('snip'), name: name.trim(), language, code };
      const next = editingId
        ? snippets.map((snippet) => (snippet.id === editingId ? item : snippet))
        : [item, ...snippets];
      await setLocal('snippets', next);
      setSnippets(next);
      resetForm();
      setNotice(editingId ? 'Snippet updated.' : 'Snippet added to your library.');
    } catch (err) {
      setError(describeError(err));
      setNotice('');
    } finally {
      setBusy(false);
    }
  };

  const runSnippet = async (snippet: Snippet) => {
    try {
      setBusy(true);
      setError('');
      setNotice('');
      if (snippet.language === 'js') {
        const value = await page.eval<any>(snippet.code);
        setResult(safeJson(value === undefined ? '(no return value)' : value));
        setResultFor(snippet.id);
        setNotice(`Ran “${snippet.name}”.`);
      } else if (snippet.language === 'css') {
        await page.injectCss(`fdu-snippet-${snippet.id}`, snippet.code);
        setNotice(`Injected CSS from “${snippet.name}”.`);
      } else {
        await page.eval(`document.body.insertAdjacentHTML('beforeend', ${JSON.stringify(snippet.code)});`);
        setNotice(`Injected HTML from “${snippet.name}”.`);
      }
    } catch (err) {
      setError(describeError(err));
      setNotice('');
    } finally {
      setBusy(false);
    }
  };

  const exportAll = () => {
    try {
      downloadText(safeJson(snippets), 'fdu-snippets.json', 'application/json');
      setNotice('Snippets exported as JSON.');
      setError('');
    } catch (err) {
      setError(describeError(err));
      setNotice('');
    }
  };

  return (
    <div className="stack">
      <ToolHeader
        title="Snippet Library"
        description="Save JS, CSS and HTML snippets locally, then run them against the active page."
        badge={`${snippets.length} snippets`}
        actions={<Button onClick={exportAll} disabled={!snippets.length}>Export JSON</Button>}
      />
      <Notice>{error}</Notice>
      <Notice tone="success">{notice}</Notice>
      {busy && <Loading label="Running snippet…" />}

      <Card title={editingId ? 'Edit snippet' : 'Add a snippet'}>
        <div className="stack">
          <div className="grid-2">
            <Field label="Name">
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Highlight headings" />
            </Field>
            <Field label="Language">
              <Select value={language} onChange={(event) => setLanguage(event.target.value as Snippet['language'])}>
                <option value="js">JavaScript</option>
                <option value="css">CSS</option>
                <option value="html">HTML</option>
              </Select>
            </Field>
          </div>
          <Field label="Code" hint="JavaScript runs via page.eval; CSS is injected with a snippet-specific id.">
            <Textarea
              value={code}
              onChange={(event) => setCode(event.target.value)}
              rows={7}
              spellCheck={false}
              placeholder={language === 'js' ? '(() => { /* ... */ })();' : language === 'css' ? '.my-class { color: red; }' : '<div>...</div>'}
            />
          </Field>
          <div className="row wrap">
            <Button variant="primary" disabled={busy} onClick={() => void saveSnippet()}>{editingId ? 'Update snippet' : 'Add snippet'}</Button>
            {editingId && <Button onClick={resetForm}>Cancel edit</Button>}
          </div>
        </div>
      </Card>

      <Card title="Your snippets">
        {snippets.length === 0 ? (
          <EmptyState>No snippets saved. Add one above or export your empty library as JSON.</EmptyState>
        ) : (
          <div className="result-list">
            {snippets.map((snippet) => (
              <ListItem
                key={snippet.id}
                title={
                  <span className="row wrap">
                    {snippet.name} <Badge tone={snippet.language === 'js' ? 'accent' : snippet.language === 'css' ? 'success' : 'warning'}>{snippet.language}</Badge>
                  </span>
                }
                subtitle={<ShortText value={snippet.code} length={80} />}
                right={
                  <div className="row wrap">
                    <Button variant="primary" disabled={busy} onClick={() => void runSnippet(snippet)} icon={<Play size={12} />}>Run</Button>
                    <IconButton
                      title="Edit"
                      onClick={() => {
                        setName(snippet.name);
                        setLanguage(snippet.language);
                        setCode(snippet.code);
                        setEditingId(snippet.id);
                        setError('');
                      }}
                    ><Pencil size={14} /></IconButton>
                    <CopyButton value={snippet.code} label="Copy" />
                    <IconButton title="Delete" onClick={() => void (async () => {
                      try {
                        const next = snippets.filter((item) => item.id !== snippet.id);
                        await setLocal('snippets', next);
                        setSnippets(next);
                        if (editingId === snippet.id) resetForm();
                        setNotice('Snippet deleted.');
                      } catch (err) {
                        setError(describeError(err));
                        setNotice('');
                      }
                    })()}><Trash2 size={14} /></IconButton>
                  </div>
                }
              />
            ))}
          </div>
        )}
      </Card>

      {result && (
        <Card title={`Run result — ${resultFor ? (snippets.find((s) => s.id === resultFor)?.name || 'Snippet') : 'Snippet'}`}>
          <CodeBlock value={result} title="Returned value" />
        </Card>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 3. JSON Viewer                                                              */
/* -------------------------------------------------------------------------- */

function countKeys(value: any): number {
  if (Array.isArray(value)) return value.reduce((sum: number, item: any) => sum + countKeys(item), 0);
  if (value && typeof value === 'object') {
    return Object.keys(value).length + Object.values(value).reduce((sum: number, item: any) => sum + countKeys(item), 0);
  }
  return 0;
}

function JsonNode({ label, value, depth = 0 }: { label?: string; value: any; depth?: number }) {
  const [open, setOpen] = useState(depth < 2);
  const isArray = Array.isArray(value);
  const isObject = value !== null && typeof value === 'object' && !isArray;
  const pad = { paddingLeft: depth * 16 };

  if (!isArray && !isObject) {
    const color = typeof value === 'number' ? '#7dd3fc'
      : typeof value === 'boolean' ? '#f0abfc'
        : value === null ? '#94a3b8' : '#86efac';
    const text = typeof value === 'string' ? `"${value}"` : String(value);
    return (
      <div className="mono" style={pad}>
        {label !== undefined && <span className="muted">{label}: </span>}
        <span style={{ color }}>{text}</span>
      </div>
    );
  }

  const entries: [string, any][] = isArray
    ? value.map((item: any, index: number) => [String(index), item])
    : Object.entries(value);
  const openBracket = isArray ? '[' : '{';
  const closeBracket = isArray ? ']' : '}';
  const head = `${label !== undefined ? `${label}: ` : ''}${openBracket}`;

  return (
    <div className="mono" style={pad}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        title={open ? 'Collapse' : 'Expand'}
        style={{ background: 'none', border: 0, padding: 0, color: 'inherit', cursor: 'pointer', font: 'inherit' }}
      >
        {open ? '▾' : '▸'} {head}
        {!open && <span className="muted"> {entries.length} {isArray ? 'items' : 'keys'} {closeBracket}</span>}
      </button>
      {open && (
        <>
          {entries.map(([key, child]) => (
            <JsonNode key={key} label={isArray ? undefined : key} value={child} depth={depth + 1} />
          ))}
          <div>{closeBracket}</div>
        </>
      )}
    </div>
  );
}

const SAMPLE_JSON = {
  app: 'Frontend Dev Utility',
  version: 1,
  active: true,
  meta: {
    author: { name: 'Dev', email: 'dev@example.com' },
    tags: ['react', 'extension', 'tools'],
  },
  items: [
    { id: 1, label: 'Alpha', flags: { primary: true, locked: false } },
    { id: 2, label: 'Beta', flags: { primary: false, locked: true } },
  ],
  empty: null,
};

export function JsonViewerTool() {
  const [input, setInput] = useState('');
  const [parsed, setParsed] = useState<any>(undefined);
  const [formatted, setFormatted] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [bytes, setBytes] = useState(0);

  const applyJson = (value: any) => {
    try {
      const text = JSON.stringify(value, null, 2);
      setParsed(value);
      setFormatted(text);
      setInput(text);
      setBytes(new TextEncoder().encode(text).length);
      setNotice('JSON parsed and formatted.');
      setError('');
    } catch (err) {
      setError(describeError(err));
      setNotice('');
    }
  };

  const format = () => {
    try {
      applyJson(JSON.parse(input));
    } catch (err) {
      setError(describeError(err));
      setNotice('');
      setParsed(undefined);
      setFormatted('');
      setBytes(0);
    }
  };

  return (
    <div className="stack">
      <ToolHeader title="JSON Viewer" description="Format, inspect and export JSON with an expandable tree." />
      <Notice>{error}</Notice>
      <Notice tone="success">{notice}</Notice>

      <Card title="Input">
        <div className="stack">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={10}
            spellCheck={false}
            placeholder='{ "hello": "world" }'
          />
          <div className="row wrap">
            <Button variant="primary" disabled={!input.trim()} onClick={format}>Format</Button>
            <Button onClick={() => applyJson(SAMPLE_JSON)}>Paste sample</Button>
            <CopyButton value={formatted} label="Copy formatted" />
            <Button disabled={!formatted} onClick={() => {
              try {
                downloadText(formatted, 'formatted.json', 'application/json');
                setNotice('Downloaded formatted.json');
              } catch (err) {
                setError(describeError(err));
              }
            }}>Download .json</Button>
          </div>
        </div>
      </Card>

      {formatted && (
        <>
          <div className="grid-3">
            <Stat label="Size" value={formatBytes(bytes)} hint="UTF-8 encoded" />
            <Stat label="Keys" value={countKeys(parsed)} hint="Recursive key count" />
            <Stat label="Root type" value={Array.isArray(parsed) ? 'array' : typeof parsed} hint="Top-level value" />
          </div>
          <Card title="Tree view" actions={<CopyButton value={formatted} label="Copy JSON" />}>
            <div className="result-list mono">
              <JsonNode value={parsed} />
            </div>
          </Card>
          <Card title="Formatted output">
            <CodeBlock value={formatted} title="JSON" />
          </Card>
        </>
      )}

      {!formatted && !error && <EmptyState>Paste JSON above and press Format to explore it.</EmptyState>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 4. Regex Tester                                                             */
/* -------------------------------------------------------------------------- */

interface RegexMatch { value: string; index: number; groups: string[] }

const REGEX_PRESETS = [
  { label: 'Email', pattern: '[\\w.+-]+@[\\w-]+\\.[\\w.-]+', flags: 'gi', sample: 'Reach ada@example.com or support@dev.tools for help.' },
  { label: 'URL', pattern: 'https?:\\/\\/[^\\s]+', flags: 'gi', sample: 'Docs: https://example.com/docs and http://localhost:5173/app' },
  { label: 'Hex color', pattern: '#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\\b', flags: 'gi', sample: 'Palette: #fff, #4f46e5, #abc, #FF0000 and #xyz' },
  { label: 'CSS class', pattern: '\\.(-?[_a-zA-Z]+[\\w-]*)', flags: 'g', sample: '<div class="card active">.card { color: red; } .btn-primary { }</div>' },
];

export function RegexTesterTool() {
  const [pattern, setPattern] = useState('[\\w.+-]+@[\\w-]+\\.[\\w.-]+');
  const [flags, setFlags] = useState('g');
  const [testText, setTestText] = useState('Reach ada@example.com or support@dev.tools for help.');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const result = useMemo(() => {
    try {
      const regex = new RegExp(pattern, flags);
      const matches: RegexMatch[] = [];
      const isGlobal = flags.includes('g');
      let match: RegExpExecArray;
      let guard = 0;
      regex.lastIndex = 0;
      while ((match = regex.exec(testText)) !== null) {
        matches.push({ value: match[0], index: match.index, groups: match.slice(1) });
        if (!isGlobal) break;
        if (match[0].length === 0) regex.lastIndex += 1;
        guard += 1;
        if (guard > 2000 || regex.lastIndex > testText.length) break;
      }
      return { regex, matches, compileError: '' };
    } catch (err) {
      return { regex: null, matches: [] as RegexMatch[], compileError: describeError(err) };
    }
  }, [pattern, flags, testText]);

  const highlighted: ReactNode[] = [];
  let cursor = 0;
  result.matches.forEach((match, index) => {
    if (match.index > cursor) {
      highlighted.push(<span key={`text-${index}`}>{testText.slice(cursor, match.index)}</span>);
    }
    highlighted.push(
      <mark key={`mark-${index}`} className="match-mark" title={`Match at index ${match.index}`}>
        {match.value || '\u200b'}
      </mark>,
    );
    cursor = match.index + match.value.length;
  });
  if (cursor < testText.length) highlighted.push(<span key="text-tail">{testText.slice(cursor)}</span>);

  const copyMatches = async () => {
    try {
      const ok = await copyText(result.matches.map((match) => match.value).join('\n'));
      setNotice(ok ? 'Copied matched values.' : 'Clipboard permission denied.');
      setError('');
    } catch (err) {
      setError(describeError(err));
      setNotice('');
    }
  };

  return (
    <div className="stack">
      <ToolHeader title="Regex Tester" description="Test patterns live with highlighted matches and capture groups." />
      <Notice>{error || result.compileError}</Notice>
      <Notice tone="success">{notice}</Notice>

      <Card title="Pattern">
        <div className="stack">
          <div className="grid-2">
            <Field label="Regular expression" hint="Written without the surrounding slashes.">
              <Input
                className="mono"
                value={pattern}
                onChange={(event) => setPattern(event.target.value)}
                placeholder="[a-z]+"
                spellCheck={false}
              />
            </Field>
            <Field label="Flags" hint="Try g, i, m, s, u or y.">
              <Input className="mono" value={flags} onChange={(event) => setFlags(event.target.value)} placeholder="g" />
            </Field>
          </div>
          <div className="row wrap">
            {REGEX_PRESETS.map((preset) => (
              <Button
                key={preset.label}
                className="chip"
                onClick={() => {
                  setPattern(preset.pattern);
                  setFlags(preset.flags);
                  setTestText(preset.sample);
                  setNotice(`Loaded the ${preset.label.toLowerCase()} preset.`);
                  setError('');
                }}
              >{preset.label}</Button>
            ))}
          </div>
          <div className="row wrap">
            <Badge tone="accent">/{pattern || '(empty)'}/{flags}</Badge>
            <CopyButton value={`/${pattern}/${flags}`} label="Copy regex literal" />
            <Button disabled={!result.matches.length} onClick={() => void copyMatches()}>Copy matches</Button>
          </div>
        </div>
      </Card>

      <Card title="Test string">
        <Textarea
          value={testText}
          onChange={(event) => setTestText(event.target.value)}
          rows={7}
          spellCheck={false}
          placeholder="Text to search…"
        />
      </Card>

      <div className="grid-3">
        <Stat label="Matches" value={result.matches.length} hint={flags.includes('g') ? 'Global search' : 'First match only'} />
        <Stat label="Groups" value={result.matches.reduce((sum, match) => sum + match.groups.length, 0)} hint="Capture groups across matches" />
        <Stat label="Flags" value={flags || '—'} hint="Active modifiers" />
      </div>

      <Card title="Highlighted output">
        <div className="preview-box mono" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {testText ? highlighted : <span className="muted">Nothing to match yet.</span>}
        </div>
      </Card>

      <Card title="Matches">
        {result.matches.length === 0 ? (
          <EmptyState>No matches. Adjust the pattern or load a preset.</EmptyState>
        ) : (
          <div className="result-list">
            {result.matches.map((match, index) => (
              <ListItem
                key={`${match.index}-${index}`}
                title={<span className="mono">{truncate(match.value || '(zero-length)', 80)}</span>}
                subtitle={
                  <span className="muted mono">
                    index {match.index}
                    {match.groups.length
                      ? ` · groups: ${match.groups.map((group) => (group === undefined ? '∅' : truncate(group, 30))).join(', ')}`
                      : ' · no capture groups'}
                  </span>
                }
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 6. Mock Data                                                                */
/* -------------------------------------------------------------------------- */

const FIRST_NAMES = ['Ada', 'Grace', 'Linus', 'Margaret', 'Alan', 'Barbara', 'Dennis', 'Katherine', 'Tim', 'Radia', 'Guido', 'Anita'];
const LAST_NAMES = ['Lovelace', 'Hopper', 'Torvalds', 'Hamilton', 'Turing', 'Liskov', 'Ritchie', 'Johnson', 'Berners-Lee', 'Perlman', 'Rossum', 'Borg'];
const DOMAINS = ['example.com', 'dev.test', 'frontend.io', 'mock.local', 'sample.dev'];
const CITIES = ['London', 'Berlin', 'Lisbon', 'Oslo', 'Toronto', 'Austin', 'Kyoto', 'Melbourne', 'Amsterdam', 'Dublin'];
const COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#ec4899'];
const LOREM_WORDS = ['lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit', 'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore', 'magna', 'aliqua', 'enim', 'ad', 'minim', 'veniam', 'quis', 'nostrud', 'exercitation', 'ullamco', 'laboris', 'nisi', 'aliquip', 'ex', 'ea', 'commodo', 'consequat', 'duis', 'aute', 'irure', 'in', 'reprehenderit', 'voluptate'];

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function toDelimited(rows: any[], separator: string): string {
  const keys = ['id', 'name', 'email', 'city', 'color', 'active'];
  const escape = (value: any) => `"${String(value).replace(/"/g, '""')}"`;
  return [keys.join(separator), ...rows.map((row) => keys.map((key) => escape(row[key])).join(separator))].join('\n');
}

function makeUuid(): string {
  const candidate = crypto as Crypto & { randomUUID?: () => string };
  if (candidate && typeof candidate.randomUUID === 'function') return candidate.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function MockDataTool() {
  const [tab, setTab] = useState<'users' | 'lorem' | 'uuid'>('users');
  const [count, setCount] = useState(10);
  const [format, setFormat] = useState<'json' | 'csv' | 'tsv'>('json');
  const [usersOutput, setUsersOutput] = useState('');
  const [sentences, setSentences] = useState(4);
  const [paragraphs, setParagraphs] = useState(1);
  const [loremOutput, setLoremOutput] = useState('');
  const [uuidCount, setUuidCount] = useState(10);
  const [uuidOutput, setUuidOutput] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const generateUsers = async () => {
    try {
      setBusy(true);
      setError('');
      const total = Math.max(1, Math.min(100, Math.floor(count) || 1));
      const rows = Array.from({ length: total }, (_, index) => {
        const first = pick(FIRST_NAMES);
        const last = pick(LAST_NAMES);
        return {
          id: index + 1,
          name: `${first} ${last}`,
          email: `${first}.${last}${index + 1}@${pick(DOMAINS)}`.toLowerCase(),
          city: pick(CITIES),
          color: pick(COLORS),
          active: Math.random() > 0.35,
        };
      });
      const output = format === 'json' ? safeJson(rows) : toDelimited(rows, format === 'csv' ? ',' : '\t');
      setUsersOutput(output);
      await addHistory('mockHistory', { count: total, format }, 10);
      setNotice(`Generated ${total} fake users.`);
    } catch (err) {
      setError(describeError(err));
      setNotice('');
    } finally {
      setBusy(false);
    }
  };

  const generateLorem = () => {
    try {
      const makeSentence = () => {
        const length = 6 + Math.floor(Math.random() * 10);
        const words = Array.from({ length }, () => pick(LOREM_WORDS));
        words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
        return `${words.join(' ')}.`;
      };
      const totalParagraphs = Math.max(1, Math.min(20, Math.floor(paragraphs) || 1));
      const totalSentences = Math.max(1, Math.min(20, Math.floor(sentences) || 1));
      const result = Array.from({ length: totalParagraphs }, () =>
        Array.from({ length: totalSentences }, makeSentence).join(' '),
      ).join('\n\n');
      setLoremOutput(result);
      setNotice(`Generated ${totalParagraphs} paragraph(s).`);
      setError('');
    } catch (err) {
      setError(describeError(err));
      setNotice('');
    }
  };

  const generateUuids = () => {
    try {
      const total = Math.max(1, Math.min(100, Math.floor(uuidCount) || 1));
      setUuidOutput(Array.from({ length: total }, makeUuid).join('\n'));
      setNotice(`Generated ${total} UUID(s).`);
      setError('');
    } catch (err) {
      setError(describeError(err));
      setNotice('');
    }
  };

  const activeOutput = tab === 'users' ? usersOutput : tab === 'lorem' ? loremOutput : uuidOutput;
  const extension = tab === 'users' ? (format === 'json' ? 'json' : format) : 'txt';

  return (
    <div className="stack">
      <ToolHeader title="Mock Data" description="Generate fake users, lorem text and UUIDs entirely in your browser." />
      <Notice>{error}</Notice>
      <Notice tone="success">{notice}</Notice>
      {busy && <Loading label="Generating data…" />}
      <Tabs
        active={tab}
        onChange={(id) => setTab(id as 'users' | 'lorem' | 'uuid')}
        tabs={[
          { id: 'users', label: 'Fake users' },
          { id: 'lorem', label: 'Lorem ipsum' },
          { id: 'uuid', label: 'UUIDs' },
        ]}
      />

      {tab === 'users' && (
        <Card title="Fake users">
          <div className="stack">
            <div className="grid-2">
              <Field label="Count" hint="Between 1 and 100 records.">
                <Input type="number" min={1} max={100} value={count} onChange={(event) => setCount(Number(event.target.value) || 0)} />
              </Field>
              <Field label="Format">
                <Select value={format} onChange={(event) => setFormat(event.target.value as 'json' | 'csv' | 'tsv')}>
                  <option value="json">JSON</option>
                  <option value="csv">CSV</option>
                  <option value="tsv">TSV</option>
                </Select>
              </Field>
            </div>
            <Button variant="primary" disabled={busy} onClick={() => void generateUsers()}>Generate users</Button>
          </div>
        </Card>
      )}

      {tab === 'lorem' && (
        <Card title="Lorem ipsum">
          <div className="stack">
            <div className="grid-2">
              <Field label="Sentences per paragraph">
                <Input type="number" min={1} value={sentences} onChange={(event) => setSentences(Number(event.target.value) || 0)} />
              </Field>
              <Field label="Paragraphs">
                <Input type="number" min={1} value={paragraphs} onChange={(event) => setParagraphs(Number(event.target.value) || 0)} />
              </Field>
            </div>
            <Button variant="primary" onClick={generateLorem}>Generate lorem</Button>
          </div>
        </Card>
      )}

      {tab === 'uuid' && (
        <Card title="UUID list">
          <div className="stack">
            <Field label="How many">
              <Input type="number" min={1} max={100} value={uuidCount} onChange={(event) => setUuidCount(Number(event.target.value) || 0)} />
            </Field>
            <Button variant="primary" onClick={generateUuids}>Generate UUIDs</Button>
          </div>
        </Card>
      )}

      {activeOutput ? (
        <Card
          title="Output"
          actions={
            <div className="row wrap">
              <CopyButton value={activeOutput} label="Copy" />
              <Button disabled={busy} onClick={() => {
                try {
                  downloadText(activeOutput, `mock-${tab}.${extension}`, tab === 'users' && format === 'json' ? 'application/json' : 'text/plain');
                  setNotice('Download started.');
                } catch (err) {
                  setError(describeError(err));
                }
              }}>Download</Button>
            </div>
          }
        >
          <CodeBlock value={activeOutput} title={tab === 'users' ? `${format.toUpperCase()} output` : 'Text output'} />
        </Card>
      ) : (
        <EmptyState>Choose options above and generate some data to see it here.</EmptyState>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 7. Placeholder Image                                                        */
/* -------------------------------------------------------------------------- */

const IMAGE_PRESETS = [
  { label: '300 × 150', width: 300, height: 150 },
  { label: '800 × 600', width: 800, height: 600 },
  { label: '1920 × 1080', width: 1920, height: 1080 },
  { label: '64 × 64 avatar', width: 64, height: 64 },
];

export function PlaceholderImageTool() {
  const [width, setWidth] = useState(600);
  const [height, setHeight] = useState(400);
  const [background, setBackground] = useState('4f46e5');
  const [foreground, setForeground] = useState('ffffff');
  const [text, setText] = useState('Hello');
  const [format, setFormat] = useState<'svg' | 'png' | 'jpg'>('svg');
  const [imageError, setImageError] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const cleanColor = (value: string) => value.trim().replace(/^#/, '') || 'cccccc';
  const w = Math.max(1, Math.floor(width) || 1);
  const h = Math.max(1, Math.floor(height) || 1);
  const bg = cleanColor(background);
  const fg = cleanColor(foreground);
  const url = `https://placehold.co/${w}x${h}/${bg}/${fg}.${format}?text=${encodeURIComponent(text)}`;

  useEffect(() => { setImageError(false); }, [url]);

  return (
    <div className="stack">
      <ToolHeader title="Placeholder Image" description="Build a placehold.co URL, preview it, then copy or open it." />
      <Notice>{error}</Notice>
      <Notice tone="success">{notice}</Notice>

      <Card title="Image options">
        <div className="stack">
          <div className="grid-3">
            <Field label="Width (px)">
              <Input type="number" min={1} value={width} onChange={(event) => setWidth(Number(event.target.value) || 0)} />
            </Field>
            <Field label="Height (px)">
              <Input type="number" min={1} value={height} onChange={(event) => setHeight(Number(event.target.value) || 0)} />
            </Field>
            <Field label="Format">
              <Select value={format} onChange={(event) => setFormat(event.target.value as 'svg' | 'png' | 'jpg')}>
                <option value="svg">SVG</option>
                <option value="png">PNG</option>
                <option value="jpg">JPG</option>
              </Select>
            </Field>
          </div>
          <div className="grid-2">
            <Field label="Background color" hint="Hex value, with or without #.">
              <div className="row wrap">
                <Swatch color={`#${bg}`} title={`Background #${bg}`} />
                <Input className="mono" value={background} onChange={(event) => setBackground(event.target.value)} placeholder="4f46e5" />
              </div>
            </Field>
            <Field label="Text color">
              <div className="row wrap">
                <Swatch color={`#${fg}`} title={`Text #${fg}`} />
                <Input className="mono" value={foreground} onChange={(event) => setForeground(event.target.value)} placeholder="ffffff" />
              </div>
            </Field>
          </div>
          <Field label="Text">
            <Input value={text} onChange={(event) => setText(event.target.value)} placeholder="Hello" />
          </Field>
          <div className="row wrap">
            {IMAGE_PRESETS.map((preset) => (
              <Button
                key={preset.label}
                className="chip"
                onClick={() => { setWidth(preset.width); setHeight(preset.height); }}
              >{preset.label}</Button>
            ))}
          </div>
        </div>
      </Card>

      <Card title="Preview">
        <div className="stack">
          <div className="preview-box">
            {imageError ? (
              <div
                style={{
                  background: `#${bg}`, color: `#${fg}`, minHeight: 140, width: '100%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  font: '600 18px system-ui, sans-serif', borderRadius: 8,
                }}
              >
                {text || 'Preview unavailable'}
              </div>
            ) : (
              <img
                src={url}
                alt={`Placeholder ${w} by ${h}`}
                style={{ maxWidth: '100%', maxHeight: 260, display: 'block', margin: '0 auto' }}
                onError={() => setImageError(true)}
                onLoad={() => setImageError(false)}
              />
            )}
          </div>
          {imageError && <Notice tone="info">The remote preview could not load — the URL is still ready to copy or open.</Notice>}
          <div className="mono muted" style={{ wordBreak: 'break-all' }}>{url}</div>
          <div className="row wrap">
            <CopyButton value={url} label="Copy URL" />
            <Button variant="outline" onClick={() => {
              try { window.open(url, '_blank'); setNotice('Opened image in a new tab.'); }
              catch (err) { setError(describeError(err)); }
            }}>Open in new tab</Button>
            <Button onClick={() => {
              try {
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.target = '_blank';
                anchor.rel = 'noopener';
                anchor.download = `placeholder-${w}x${h}.${format}`;
                document.body.appendChild(anchor);
                anchor.click();
                anchor.remove();
                setNotice('Save the opened image with “Save image as…” if the browser does not download it directly.');
              } catch (err) {
                setError(describeError(err));
              }
            }}>Download image</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 8. Dark Mode Simulator                                                      */
/* -------------------------------------------------------------------------- */

export function DarkModeTool() {
  const [enabled, setEnabled] = useState(false);
  const [excludeImages, setExcludeImages] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => () => {
    page.setFilter('dark', null).catch(() => {});
  }, []);

  const apply = async (on: boolean, noImages: boolean) => {
    try {
      setBusy(true);
      setError('');
      await page.setFilter('dark', on ? (noImages ? 'no-images' : 'on') : null);
      setNotice(on ? (noImages ? 'Dark filter active with images excluded.' : 'Dark filter active.') : 'Page filter cleared.');
    } catch (err) {
      setError(describeError(err));
      setNotice('');
    } finally {
      setBusy(false);
    }
  };

  const toggleInvert = (checked: boolean) => {
    setEnabled(checked);
    void apply(checked, excludeImages);
  };

  const toggleImages = async (checked: boolean) => {
    setExcludeImages(checked);
    try {
      setBusy(true);
      setError('');
      if (enabled) {
        await page.setFilter('dark', checked ? 'no-images' : 'on');
        setNotice(checked ? 'Dark filter active with images excluded.' : 'Images are included in the dark filter again.');
      } else {
        await page.setFilter('dark', null);
        setNotice('Preference saved. Turn on the dark filter to apply it.');
      }
    } catch (err) {
      setError(describeError(err));
      setNotice('');
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    try {
      setBusy(true);
      setError('');
      await page.setFilter('dark', null);
      setEnabled(false);
      setExcludeImages(false);
      setNotice('Dark mode reset — the page filter was removed.');
    } catch (err) {
      setError(describeError(err));
      setNotice('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <ToolHeader
        title="Dark Mode Simulator"
        description="Preview a site in inverted colors without changing its stylesheet."
        actions={<Button variant="outline" disabled={busy} onClick={() => void reset()}>Reset</Button>}
      />
      <Notice>{error}</Notice>
      <Notice tone="success">{notice}</Notice>
      {busy && <Loading label="Updating page filter…" />}

      <Card title="Filter">
        <div className="stack">
          <Toggle
            checked={enabled}
            onChange={toggleInvert}
            label="Invert page colors"
            hint="Applies an invert(1) hue-rotate(180deg) filter to the whole page."
          />
          <div className="divider" />
          <Toggle
            checked={excludeImages}
            onChange={toggleImages}
            label="Exclude images from inversion"
            hint="Uses the filter value 'no-images' so photos keep their natural colors."
          />
          <p className="muted">
            The filter is applied to the active tab only. It is cleared automatically whenever this tool closes,
            so the page is never left inverted.
          </p>
        </div>
      </Card>

      <Card title="Preview">
        <div className="grid-2">
          <div>
            <div className="muted" style={{ marginBottom: 8 }}>Before</div>
            <div className="preview-box" style={{ background: '#ffffff', color: '#111827', borderRadius: 8 }}>
              <div className="row wrap" style={{ justifyContent: 'space-between' }}>
                <strong>The quick brown fox</strong>
                <span className="chip">Light</span>
              </div>
              <div style={{ height: 60, marginTop: 10, borderRadius: 6, background: 'linear-gradient(90deg,#38bdf8,#a78bfa,#fb7185)' }} />
            </div>
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 8 }}>After</div>
            <div
              className="preview-box"
              style={{
                background: enabled ? '#111827' : '#ffffff',
                color: enabled ? '#f9fafb' : '#111827',
                filter: enabled && !excludeImages ? 'invert(1) hue-rotate(180deg)' : 'none',
                borderRadius: 8,
              }}
            >
              <div className="row wrap" style={{ justifyContent: 'space-between' }}>
                <strong>The quick brown fox</strong>
                <span className="chip">Dark</span>
              </div>
              <div style={{ height: 60, marginTop: 10, borderRadius: 6, background: 'linear-gradient(90deg,#38bdf8,#a78bfa,#fb7185)' }} />
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
