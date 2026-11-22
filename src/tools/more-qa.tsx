import { useEffect, useState } from 'react';
import {
  Badge, Button, Card, CodeBlock, CopyButton, EmptyState, Field, Input, ListItem,
  Notice, Segmented, Select, ShortText, Stat, Swatch, Tabs, Textarea,
  Toggle, ToolHeader,
} from '../components/ui';
import { copyText, downloadText, escapeHtml, timestampName } from '../lib/utils';
import { parseColor } from '../lib/color';
import { getLocal, setLocal } from '../lib/storage';
import { describeError } from '../lib/messaging';

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

function usePersistedState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(fallback);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    void getLocal<T>(key, fallback)
      .then((saved) => { if (active && saved !== undefined && saved !== null) setValue(saved); })
      .catch(() => { /* storage is best-effort */ })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [key]);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => { void setLocal(key, value).catch(() => { /* best-effort */ }); }, 250);
    return () => clearTimeout(timer);
  }, [key, ready, value]);
  return [value, setValue] as const;
}

function lineAt(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

function numberValue(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

type LintIssue = { level: 'error' | 'warning'; message: string; line: number };

/* -------------------------------------------------------------------------- */
/* 1. HTML Validator                                                          */
/* -------------------------------------------------------------------------- */

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

const HTML_SAMPLE = '<html>\n  <head><title>Demo</title></head>\n  <body>\n    <img src="hero.png">\n    <a href="">Read more</a>\n    <div id="box"><span class="label">Hi</span></div>\n    <div id="box" style="color:red">Duplicate</div>\n  </body>\n</html>';

function analyzeHtml(html: string): LintIssue[] {
  const issues: LintIssue[] = [];
  const stack: { tag: string; line: number }[] = [];
  const ids = new Map<string, number>();
  const tagRe = /<\/?([a-zA-Z][\w:-]*)\b([^>]*)>/g;
  let match: RegExpExecArray | null;
  let sawHtml = false;
  while ((match = tagRe.exec(html)) !== null) {
    const [full, rawTag, attrs] = match;
    const tag = rawTag.toLowerCase();
    const line = lineAt(html, match.index);
    const closing = full.startsWith('</');
    if (tag === 'html') sawHtml = true;
    if (!closing) {
      if (tag === 'img' && !/\balt\s*=/.test(attrs)) {
        issues.push({ level: 'error', message: '<img> is missing an alt attribute.', line });
      }
      if (tag === 'a' && (!/\bhref\s*=/.test(attrs) || /\bhref\s*=\s*(["'])\s*\1/.test(attrs))) {
        issues.push({ level: 'warning', message: '<a> has an empty or missing href.', line });
      }
      if (/\bstyle\s*=/.test(attrs)) {
        issues.push({ level: 'warning', message: `<${tag}> uses an inline style attribute.`, line });
      }
      const idMatch = /\bid\s*=\s*(["'])([^"']*)\1/.exec(attrs);
      if (idMatch) {
        const id = idMatch[2];
        if (ids.has(id)) {
          issues.push({ level: 'error', message: `Duplicate id "${id}" (first used on line ${ids.get(id)}).`, line });
        } else {
          ids.set(id, line);
        }
      }
      if (!VOID_TAGS.has(tag) && !/\/\s*>$/.test(full)) stack.push({ tag, line });
    } else {
      const open = stack.pop();
      if (!open) {
        issues.push({ level: 'error', message: `Unexpected closing tag </${tag}>.`, line });
      } else if (open.tag !== tag) {
        issues.push({ level: 'error', message: `</${tag}> does not close <${open.tag}> from line ${open.line}.`, line });
        if (stack.length && stack[stack.length - 1].tag === tag) stack.pop();
      }
    }
  }
  if (sawHtml && !/<html\b[^>]*\blang\s*=/i.test(html)) {
    issues.push({ level: 'warning', message: '<html> is missing a lang attribute.', line: 1 });
  }
  stack.forEach((open) => issues.push({
    level: 'error', message: `Unclosed <${open.tag}> opened on line ${open.line}.`, line: open.line,
  }));
  return issues.sort((a, b) => a.line - b.line);
}

export function HtmlValidatorTool() {
  const [html, setHtml] = usePersistedState('qa.html-source', HTML_SAMPLE);
  const [issues, setIssues] = useState<LintIssue[]>([]);
  const [error, setError] = useState('');
  const [checked, setChecked] = useState(false);

  const run = () => {
    setError('');
    try {
      setIssues(analyzeHtml(html));
      setChecked(true);
    } catch (e) {
      setError(describeError(e));
    }
  };

  const errors = issues.filter((issue) => issue.level === 'error').length;
  const warnings = issues.length - errors;

  return (
    <div className="stack">
      <ToolHeader title="HTML Validator" description="Check nesting, alt text, ids, links and inline styles in pasted HTML." badge={checked ? `${issues.length} issues` : undefined} />
      <Notice>{error}</Notice>
      <Card title="HTML source" actions={<Button onClick={run} variant="primary">Validate</Button>}>
        <div className="stack">
          <Textarea rows={10} value={html} onChange={(event) => { setHtml(event.target.value); setChecked(false); }} spellCheck={false} placeholder="Paste HTML here…" />
          <div className="row wrap">
            <Button onClick={() => { setHtml(HTML_SAMPLE); setChecked(false); }}>Load sample</Button>
            <Button variant="ghost" onClick={() => { setHtml(''); setIssues([]); setChecked(false); }}>Clear</Button>
          </div>
        </div>
      </Card>
      {checked && (
        <>
          <div className="grid-3">
            <Stat label="Total issues" value={issues.length} />
            <Stat label="Errors" value={errors} />
            <Stat label="Warnings" value={warnings} />
          </div>
          <Card title="Findings">
            {!issues.length ? (
              <EmptyState>No issues found in this HTML snippet.</EmptyState>
            ) : (
              <div className="result-list">
                {issues.map((issue, index) => (
                  <ListItem
                    key={`${issue.line}-${index}`}
                    title={issue.message}
                    subtitle={<span className="muted mono">Line {issue.line}</span>}
                    right={<Badge tone={issue.level === 'error' ? 'danger' : 'warning'}>{issue.level}</Badge>}
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
/* 2. CSS Lint                                                                */
/* -------------------------------------------------------------------------- */

const CSS_SAMPLE = '.card {\n  color: red\n  padding: 8px;\n}\n.card {\n  margin: 0;\n  border: 0 !important\n}\n';

function analyzeCss(css: string): LintIssue[] {
  const issues: LintIssue[] = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  let opens = 0;
  let closes = 0;
  let firstExtraClose = -1;
  for (let i = 0; i < clean.length; i++) {
    if (clean[i] === '{') opens++;
    if (clean[i] === '}') {
      closes++;
      if (closes > opens && firstExtraClose < 0) firstExtraClose = i;
    }
  }
  if (opens !== closes) {
    const at = firstExtraClose >= 0 ? firstExtraClose : clean.lastIndexOf('{');
    issues.push({
      level: 'error',
      message: firstExtraClose >= 0 ? 'Unexpected closing brace }.' : `${opens - closes} unclosed brace(s) {.`,
      line: lineAt(clean, Math.max(0, at)),
    });
  }
  const selectorRe = /([^{}]+)\{/g;
  const seen = new Map<string, number>();
  let selectorMatch: RegExpExecArray | null;
  while ((selectorMatch = selectorRe.exec(clean)) !== null) {
    const selector = selectorMatch[1].trim().replace(/\s+/g, ' ');
    if (!selector || selector.startsWith('@')) continue;
    const line = lineAt(clean, selectorMatch.index + selectorMatch[1].length);
    if (seen.has(selector)) {
      issues.push({ level: 'warning', message: `Duplicate selector "${selector}" (first on line ${seen.get(selector)}).`, line });
    } else {
      seen.set(selector, line);
    }
  }
  const blockRe = /\{([^{}]*)\}/g;
  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = blockRe.exec(clean)) !== null) {
    const body = blockMatch[1];
    let offset = 0;
    const parts = body.split(';');
    parts.forEach((part, index) => {
      const segmentStart = blockMatch!.index + 1 + offset;
      offset += part.length + 1;
      const colons = (part.match(/:/g) || []).length;
      const isLast = index === parts.length - 1;
      if (!part.trim() || /url\(/.test(part)) return;
      if (!isLast && colons > 1) {
        issues.push({ level: 'warning', message: 'Possible missing semicolon between declarations.', line: lineAt(clean, segmentStart) });
      } else if (isLast && colons >= 1) {
        issues.push({ level: 'warning', message: 'Declaration has no trailing semicolon.', line: lineAt(clean, segmentStart) });
      }
    });
  }
  const importantCount = (clean.match(/!important\b/g) || []).length;
  if (importantCount > 0) {
    issues.push({ level: 'warning', message: `${importantCount} use(s) of !important — consider increasing specificity instead.`, line: 1 });
  }
  return issues.sort((a, b) => a.line - b.line);
}

export function CssLintTool() {
  const [css, setCss] = usePersistedState('qa.css-source', CSS_SAMPLE);
  const [issues, setIssues] = useState<LintIssue[]>([]);
  const [error, setError] = useState('');
  const [checked, setChecked] = useState(false);

  const run = () => {
    setError('');
    try {
      setIssues(analyzeCss(css));
      setChecked(true);
    } catch (e) {
      setError(describeError(e));
    }
  };

  return (
    <div className="stack">
      <ToolHeader title="CSS Lint" description="Find brace errors, missing semicolons, duplicate selectors and !important usage." />
      <Notice>{error}</Notice>
      <Card title="CSS source" actions={<Button variant="primary" onClick={run}>Lint CSS</Button>}>
        <div className="stack">
          <Textarea rows={10} value={css} onChange={(event) => { setCss(event.target.value); setChecked(false); }} spellCheck={false} placeholder="Paste CSS here…" />
          <Button variant="ghost" onClick={() => { setCss(CSS_SAMPLE); setChecked(false); }}>Load sample</Button>
        </div>
      </Card>
      {checked && (
        <>
          <div className="grid-3">
            <Stat label="Warnings" value={issues.filter((i) => i.level === 'warning').length} />
            <Stat label="Errors" value={issues.filter((i) => i.level === 'error').length} />
            <Stat label="Selectors" value={(css.match(/\{/g) || []).length} />
          </div>
          <Card title="Findings">
            {!issues.length ? (
              <EmptyState>No lint warnings found.</EmptyState>
            ) : (
              <div className="result-list">
                {issues.map((issue, index) => (
                  <ListItem
                    key={`${issue.line}-${index}`}
                    title={issue.message}
                    subtitle={<span className="muted mono">Line {issue.line}</span>}
                    right={<Badge tone={issue.level === 'error' ? 'danger' : 'warning'}>{issue.level}</Badge>}
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
/* 3. Bracket Checker                                                         */
/* -------------------------------------------------------------------------- */

type BracketResult = { balanced: boolean; message: string; line: number; column: number };

function checkBrackets(text: string): BracketResult {
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  const stack: { char: string; index: number }[] = [];
  let i = 0;
  let line = 1;
  let lineStart = 0;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '\n') { line++; lineStart = i + 1; i++; continue; }
    if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        if (text[i] === '\n') { line++; lineStart = i + 1; }
        i++;
      }
      i = Math.min(text.length, i + 2);
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      i++;
      while (i < text.length && text[i] !== quote) {
        if (text[i] === '\\') i++;
        if (text[i] === '\n') { line++; lineStart = i + 1; }
        i++;
      }
      i++;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      stack.push({ char: ch, index: i });
    } else if (pairs[ch]) {
      const top = stack.pop();
      if (!top || top.char !== pairs[ch]) {
        return { balanced: false, message: `Expected '${pairs[ch]}' but found '${ch}'.`, line, column: i - lineStart + 1 };
      }
    }
    i++;
  }
  if (stack.length) {
    const top = stack[stack.length - 1];
    const before = text.slice(0, top.index);
    const lastBreak = before.lastIndexOf('\n');
    return {
      balanced: false,
      message: `Unclosed '${top.char}'.`,
      line: before.split('\n').length,
      column: top.index - lastBreak,
    };
  }
  return { balanced: true, message: 'All brackets are balanced.', line: 0, column: 0 };
}

export function BracketCheckerTool() {
  const [source, setSource] = usePersistedState('qa.bracket-source', 'const value = { list: [1, 2, "(not a bracket)"], fn() { return true; } };');
  const [result, setResult] = useState<BracketResult | null>(null);
  const [error, setError] = useState('');

  const run = () => {
    setError('');
    try {
      setResult(checkBrackets(source));
    } catch (e) {
      setError(describeError(e));
    }
  };

  return (
    <div className="stack">
      <ToolHeader title="Bracket Checker" description="Balance (), [] and {} while skipping strings and // or /* */ comments." badge={result ? (result.balanced ? 'Balanced' : 'Mismatch') : undefined} />
      <Notice>{error}</Notice>
      <Card title="Source" actions={<Button variant="primary" onClick={run}>Check brackets</Button>}>
        <Textarea rows={10} value={source} onChange={(event) => { setSource(event.target.value); setResult(null); }} spellCheck={false} placeholder="Paste JS, TS or CSS…" />
      </Card>
      {result && (
        <Card title="Result">
          <div className="grid-3">
            <Stat label="Status" value={result.balanced ? 'Balanced' : 'Mismatch'} />
            <Stat label="Line" value={result.balanced ? '—' : result.line} />
            <Stat label="Column" value={result.balanced ? '—' : result.column} />
          </div>
          <Notice tone={result.balanced ? 'success' : 'error'}>{result.message}</Notice>
        </Card>
      )}
      <Notice tone="info">{'Template literal contents are skipped as strings; nested ${...} expressions are not evaluated.'}</Notice>
    </div>
  );
}
/* -------------------------------------------------------------------------- */
/* 4. Cron Parser                                                             */
/* -------------------------------------------------------------------------- */

const CRON_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CRON_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type CronSpec = {
  key: string; label: string; min: number; max: number;
  names?: string[]; nameOffset?: number;
};

const CRON_FIELDS: CronSpec[] = [
  { key: 'minute', label: 'Minute', min: 0, max: 59 },
  { key: 'hour', label: 'Hour', min: 0, max: 23 },
  { key: 'day', label: 'Day of month', min: 1, max: 31 },
  { key: 'month', label: 'Month', min: 1, max: 12, names: CRON_MONTHS, nameOffset: 1 },
  { key: 'weekday', label: 'Day of week', min: 0, max: 7, names: CRON_DAYS },
];

const CRON_PRESETS = [
  { label: 'Hourly', value: '0 * * * *' },
  { label: 'Daily at midnight', value: '0 0 * * *' },
  { label: 'Weekdays at 9am', value: '0 9 * * 1-5' },
];

type CronFieldResult = { values: number[]; description: string; error: string };

function parseCronField(part: string, spec: CronSpec): CronFieldResult {
  try {
    const values = new Set<number>();
    const resolve = (token: string): number => {
      if (spec.names) {
        const index = spec.names.findIndex((name) => name.toLowerCase() === token.toLowerCase());
        if (index >= 0) return index + (spec.nameOffset ?? 0);
      }
      if (!/^\d+$/.test(token)) throw new Error(`Invalid value "${token}" in ${spec.label}.`);
      return Number(token);
    };
    for (const expression of part.split(',')) {
      if (!expression.trim()) throw new Error(`Empty value in ${spec.label}.`);
      const [range, stepText] = expression.split('/');
      if (stepText !== undefined && !/^\d+$/.test(stepText)) throw new Error(`Invalid step "${stepText}" in ${spec.label}.`);
      const step = stepText === undefined ? 1 : Number(stepText);
      if (step < 1) throw new Error(`Step must be at least 1 in ${spec.label}.`);
      let start: number;
      let end: number;
      if (range === '*') {
        start = spec.min;
        end = spec.max;
      } else if (range.includes('-')) {
        const [from, to] = range.split('-');
        start = resolve(from);
        end = resolve(to);
      } else {
        start = resolve(range);
        end = stepText === undefined ? start : spec.max;
      }
      if (start > end) throw new Error(`Range start is after end in ${spec.label}.`);
      if (start < spec.min || end > spec.max) throw new Error(`${spec.label} value out of range (${spec.min}–${spec.max}).`);
      for (let value = start; value <= end; value += step) {
        values.add(spec.key === 'weekday' && value === 7 ? 0 : value);
      }
    }
    const ordered = [...values].sort((a, b) => a - b);
    const all = spec.key === 'weekday' ? ordered.length === 7 : ordered.length >= spec.max - spec.min + 1;
    let description: string;
    if (all) {
      description = `every ${spec.label.toLowerCase()}`;
    } else {
      const labels = ordered.map((value) => {
        if (spec.names && spec.key === 'month') return spec.names[value - 1] ?? String(value);
        if (spec.names) return spec.names[value] ?? String(value);
        if (spec.key === 'hour') return `${String(value).padStart(2, '0')}:00`;
        return String(value);
      });
      const prefix = spec.key === 'weekday' ? 'on' : spec.key === 'month' ? 'in' : 'at';
      description = `${prefix} ${labels.slice(0, 8).join(', ')}${labels.length > 8 ? ' …' : ''}`;
    }
    return { values: ordered, description, error: '' };
  } catch (e) {
    return { values: [], description: '—', error: describeError(e) };
  }
}

export function CronParserTool() {
  const [expression, setExpression] = usePersistedState('qa.cron-expression', '0 9 * * 1-5');

  let results: CronFieldResult[] = [];
  let structuralError = '';
  try {
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) {
      structuralError = 'A cron expression needs exactly 5 fields: minute hour day month weekday.';
    } else {
      results = CRON_FIELDS.map((spec, index) => parseCronField(parts[index], spec));
    }
  } catch (e) {
    structuralError = describeError(e);
  }

  const error = structuralError || results.find((result) => result.error)?.error || '';
  const valid = results.length === 5 && results.every((result) => !result.error);
  const minuteAll = valid && results[0].values.length === 60;
  const hourAll = valid && results[1].values.length === 24;
  const summary = valid
    ? `Runs at ${minuteAll ? 'every minute' : `minute(s) ${results[0].values.join(', ')}`} during ${
      hourAll ? 'every hour' : `hour(s) ${results[1].values.map((v) => String(v).padStart(2, '0')).join(', ')}`
    }; ${results[2].description}, ${results[3].description} and ${results[4].description}.`
    : '';

  return (
    <div className="stack">
      <ToolHeader title="Cron Parser" description="Validate a 5-field cron expression and explain each field." badge={valid ? 'Valid' : undefined} />
      <Notice>{error}</Notice>
      <Card title="Expression">
        <div className="stack">
          <Field label="Cron (minute hour day month weekday)" hint="Supports *, lists, ranges, steps and month/day names">
            <Input value={expression} onChange={(event) => setExpression(event.target.value)} spellCheck={false} placeholder="0 9 * * 1-5" />
          </Field>
          <div className="row wrap">
            {CRON_PRESETS.map((preset) => (
              <Button key={preset.label} onClick={() => setExpression(preset.value)}>{preset.label}</Button>
            ))}
            <CopyButton value={expression} label="Copy expression" />
          </div>
        </div>
      </Card>
      {valid && (
        <>
          <Card title="Field breakdown">
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={{ textAlign: 'left' }}>Field</th><th style={{ textAlign: 'left' }}>Value</th><th style={{ textAlign: 'left' }}>Meaning</th><th style={{ textAlign: 'left' }}>Status</th></tr></thead>
              <tbody>
                {CRON_FIELDS.map((spec, index) => (
                  <tr key={spec.key}>
                    <td>{spec.label}</td>
                    <td className="mono">{expression.trim().split(/\s+/)[index]}</td>
                    <td>{results[index].description}</td>
                    <td><Badge tone="success">OK</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card title="Human-readable summary"><Notice tone="info">{summary}</Notice></Card>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 5. HTTP Status Reference                                                   */
/* -------------------------------------------------------------------------- */

type StatusClass = 'all' | '1xx' | '2xx' | '3xx' | '4xx' | '5xx';

const STATUS_FILTERS: { value: StatusClass; label: string }[] = [
  { value: 'all', label: 'All' }, { value: '1xx', label: '1xx' }, { value: '2xx', label: '2xx' },
  { value: '3xx', label: '3xx' }, { value: '4xx', label: '4xx' }, { value: '5xx', label: '5xx' },
];

const STATUSES: { code: number; name: string; description: string }[] = [
  { code: 100, name: 'Continue', description: 'The server has received the headers and the client should send the body.' },
  { code: 101, name: 'Switching Protocols', description: 'The server is switching protocols as requested.' },
  { code: 103, name: 'Early Hints', description: 'Preliminary headers sent before the final response.' },
  { code: 200, name: 'OK', description: 'The request succeeded and a response body is included.' },
  { code: 201, name: 'Created', description: 'A new resource was created successfully.' },
  { code: 202, name: 'Accepted', description: 'The request was accepted but processing is not complete.' },
  { code: 204, name: 'No Content', description: 'Success, but there is no response body.' },
  { code: 206, name: 'Partial Content', description: 'Only part of the resource was returned, usually for range requests.' },
  { code: 301, name: 'Moved Permanently', description: 'The resource has a new permanent URL.' },
  { code: 302, name: 'Found', description: 'The resource is temporarily located at another URL.' },
  { code: 304, name: 'Not Modified', description: 'The cached copy is still current; no body is returned.' },
  { code: 307, name: 'Temporary Redirect', description: 'Redirect without changing the request method.' },
  { code: 308, name: 'Permanent Redirect', description: 'Permanent redirect without changing the request method.' },
  { code: 400, name: 'Bad Request', description: 'The request syntax or parameters are invalid.' },
  { code: 401, name: 'Unauthorized', description: 'Authentication is required and has failed or is missing.' },
  { code: 403, name: 'Forbidden', description: 'The server understood the request but refuses to authorize it.' },
  { code: 404, name: 'Not Found', description: 'The requested resource does not exist.' },
  { code: 405, name: 'Method Not Allowed', description: 'The method is not supported for this resource.' },
  { code: 408, name: 'Request Timeout', description: 'The server timed out waiting for the request.' },
  { code: 409, name: 'Conflict', description: 'The request conflicts with the current state of the resource.' },
  { code: 410, name: 'Gone', description: 'The resource was permanently removed.' },
  { code: 413, name: 'Payload Too Large', description: 'The request body exceeds the server limit.' },
  { code: 418, name: "I'm a Teapot", description: 'A playful April Fools status from RFC 2324.' },
  { code: 422, name: 'Unprocessable Content', description: 'Syntax is correct but semantic validation failed.' },
  { code: 429, name: 'Too Many Requests', description: 'The client sent too many requests in a given time.' },
  { code: 431, name: 'Request Header Fields Too Large', description: 'The request headers exceed the allowed size.' },
  { code: 500, name: 'Internal Server Error', description: 'A generic server-side failure.' },
  { code: 501, name: 'Not Implemented', description: 'The server does not support the requested functionality.' },
  { code: 502, name: 'Bad Gateway', description: 'An upstream server returned an invalid response.' },
  { code: 503, name: 'Service Unavailable', description: 'The server is overloaded or under maintenance.' },
  { code: 504, name: 'Gateway Timeout', description: 'An upstream server did not respond in time.' },
  { code: 505, name: 'HTTP Version Not Supported', description: 'The server does not support the requested HTTP version.' },
];

function statusTone(code: number): 'default' | 'accent' | 'success' | 'warning' | 'danger' {
  if (code >= 500) return 'danger';
  if (code >= 400) return 'warning';
  if (code >= 300) return 'accent';
  if (code >= 200) return 'success';
  return 'default';
}

export function HttpStatusTool() {
  const [search, setSearch] = useState('');
  const [statusClass, setStatusClass] = useState<StatusClass>('all');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(0);

  const needle = search.trim().toLowerCase();
  const filtered = STATUSES.filter((item) => {
    if (statusClass !== 'all' && `${Math.floor(item.code / 100)}xx` !== statusClass) return false;
    return !needle || `${item.code} ${item.name} ${item.description}`.toLowerCase().includes(needle);
  });

  const copyCode = async (code: number) => {
    setError('');
    try {
      if (await copyText(String(code))) {
        setCopied(code);
        setTimeout(() => setCopied(0), 1200);
      }
    } catch (e) {
      setError(describeError(e));
    }
  };

  return (
    <div className="stack">
      <ToolHeader title="HTTP Status Codes" description="Search common 1xx–5xx status codes. Click a row to copy its code." badge={`${filtered.length} codes`} />
      <Notice>{error}</Notice>
      <Card title="Reference">
        <div className="stack">
          <div className="row wrap">
            <Input placeholder="Search code, name or description…" value={search} onChange={(event) => setSearch(event.target.value)} />
            <Segmented<StatusClass> options={STATUS_FILTERS} value={statusClass} onChange={setStatusClass} />
          </div>
          {!filtered.length ? (
            <EmptyState>No status codes match this search.</EmptyState>
          ) : (
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={{ textAlign: 'left' }}>Code</th><th style={{ textAlign: 'left' }}>Name</th><th style={{ textAlign: 'left' }}>Description</th></tr></thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.code} onClick={() => void copyCode(item.code)} style={{ cursor: 'pointer' }}>
                    <td><Badge tone={statusTone(item.code)}>{copied === item.code ? 'Copied' : item.code}</Badge></td>
                    <td>{item.name}</td>
                    <td className="muted">{item.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 6. MIME Types                                                              */
/* -------------------------------------------------------------------------- */

const MIME_TYPES: { ext: string; mime: string }[] = [
  { ext: '.html', mime: 'text/html' }, { ext: '.htm', mime: 'text/html' },
  { ext: '.css', mime: 'text/css' }, { ext: '.js', mime: 'text/javascript' },
  { ext: '.mjs', mime: 'text/javascript' }, { ext: '.ts', mime: 'text/plain' },
  { ext: '.json', mime: 'application/json' }, { ext: '.xml', mime: 'application/xml' },
  { ext: '.txt', mime: 'text/plain' }, { ext: '.md', mime: 'text/markdown' },
  { ext: '.csv', mime: 'text/csv' }, { ext: '.pdf', mime: 'application/pdf' },
  { ext: '.zip', mime: 'application/zip' }, { ext: '.gz', mime: 'application/gzip' },
  { ext: '.tar', mime: 'application/x-tar' }, { ext: '.rar', mime: 'application/vnd.rar' },
  { ext: '.7z', mime: 'application/x-7z-compressed' }, { ext: '.png', mime: 'image/png' },
  { ext: '.jpg', mime: 'image/jpeg' }, { ext: '.jpeg', mime: 'image/jpeg' },
  { ext: '.gif', mime: 'image/gif' }, { ext: '.webp', mime: 'image/webp' },
  { ext: '.svg', mime: 'image/svg+xml' }, { ext: '.ico', mime: 'image/x-icon' },
  { ext: '.avif', mime: 'image/avif' }, { ext: '.bmp', mime: 'image/bmp' },
  { ext: '.mp3', mime: 'audio/mpeg' }, { ext: '.ogg', mime: 'audio/ogg' },
  { ext: '.wav', mime: 'audio/wav' }, { ext: '.m4a', mime: 'audio/mp4' },
  { ext: '.mp4', mime: 'video/mp4' }, { ext: '.webm', mime: 'video/webm' },
  { ext: '.mov', mime: 'video/quicktime' }, { ext: '.mkv', mime: 'video/x-matroska' },
  { ext: '.woff', mime: 'font/woff' }, { ext: '.woff2', mime: 'font/woff2' },
  { ext: '.ttf', mime: 'font/ttf' }, { ext: '.otf', mime: 'font/otf' },
  { ext: '.eot', mime: 'application/vnd.ms-fontobject' }, { ext: '.wasm', mime: 'application/wasm' },
  { ext: '.rtf', mime: 'application/rtf' }, { ext: '.doc', mime: 'application/msword' },
  { ext: '.xls', mime: 'application/vnd.ms-excel' }, { ext: '.ppt', mime: 'application/vnd.ms-powerpoint' },
];

export function MimeTypesTool() {
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const needle = search.trim().toLowerCase().replace(/^\./, '');
  const filtered = needle
    ? MIME_TYPES.filter((item) => `${item.ext} ${item.mime}`.toLowerCase().includes(needle))
    : MIME_TYPES;

  const copyMime = async (mime: string) => {
    setError('');
    try {
      if (await copyText(mime)) {
        setCopied(mime);
        setTimeout(() => setCopied(''), 1200);
      }
    } catch (e) {
      setError(describeError(e));
    }
  };

  return (
    <div className="stack">
      <ToolHeader title="MIME Types" description="Look up common file extensions and MIME types. Click a row to copy the type." badge={`${filtered.length} mappings`} />
      <Notice>{error}</Notice>
      <Card title="Lookup">
        <div className="stack">
          <Input placeholder="Search .webp, image/, application/json…" value={search} onChange={(event) => setSearch(event.target.value)} />
          {!filtered.length ? (
            <EmptyState>No MIME type matches this search.</EmptyState>
          ) : (
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={{ textAlign: 'left' }}>Extension</th><th style={{ textAlign: 'left' }}>MIME type</th></tr></thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.ext} onClick={() => void copyMime(item.mime)} style={{ cursor: 'pointer' }}>
                    <td className="mono">{item.ext}</td>
                    <td className="mono">{copied === item.mime ? 'Copied!' : item.mime}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 11. SEO Meta Inspector                                                     */
/* -------------------------------------------------------------------------- */

function attrValue(tag: string, name: string): string {
  const re = new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i');
  const match = re.exec(tag);
  return match ? match[2].trim() : '';
}

function metaValue(head: string, key: string, attribute: 'name' | 'property'): string {
  const re = new RegExp(`<meta\\b[^>]*\\b${attribute}\\s*=\\s*(["'])${key}\\1[^>]*>`, 'gi');
  const match = re.exec(head);
  return match ? attrValue(match[0], 'content') : '';
}

type SeoSuggestion = { level: 'error' | 'warning'; message: string };

function auditSeo(head: string): { found: { label: string; value: string }[]; suggestions: SeoSuggestion[] } {
  const found: { label: string; value: string }[] = [];
  const suggestions: SeoSuggestion[] = [];
  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(head);
  const title = titleMatch ? titleMatch[1].trim() : '';
  const description = metaValue(head, 'description', 'name');
  const viewport = metaValue(head, 'viewport', 'name');
  let canonical = '';
  const linkRe = /<link\b[^>]*>/gi;
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = linkRe.exec(head)) !== null) {
    if (/rel\s*=\s*(["'])canonical\1/i.test(linkMatch[0])) {
      canonical = attrValue(linkMatch[0], 'href');
      break;
    }
  }
  found.push(
    { label: 'Title', value: title },
    { label: 'Description', value: description },
    { label: 'Canonical', value: canonical },
    { label: 'Viewport', value: viewport },
  );
  ['og:title', 'og:description', 'og:image', 'og:type', 'og:url'].forEach((key) => {
    found.push({ label: key, value: metaValue(head, key, 'property') });
  });
  ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image'].forEach((key) => {
    found.push({ label: key, value: metaValue(head, key, 'name') || metaValue(head, key, 'property') });
  });

  if (!title) suggestions.push({ level: 'error', message: 'Missing <title> tag — add a unique, descriptive title.' });
  else if (title.length < 15) suggestions.push({ level: 'warning', message: 'Title is short (under 15 characters); aim for 15–60.' });
  else if (title.length > 60) suggestions.push({ level: 'warning', message: 'Title is long (over 60 characters) and may be truncated.' });
  if (!description) suggestions.push({ level: 'error', message: 'Missing meta description — add one around 50–160 characters.' });
  else if (description.length < 50) suggestions.push({ level: 'warning', message: 'Description is under 50 characters; add more useful context.' });
  else if (description.length > 160) suggestions.push({ level: 'warning', message: 'Description exceeds 160 characters and may be truncated.' });
  if (!canonical) suggestions.push({ level: 'warning', message: 'No canonical link found — specify the preferred URL.' });
  if (!viewport) suggestions.push({ level: 'error', message: 'Missing viewport meta tag — required for responsive mobile rendering.' });
  if (!found.some((item) => item.label === 'og:title' && item.value)) suggestions.push({ level: 'warning', message: 'Missing og:title for social previews.' });
  if (!found.some((item) => item.label === 'og:image' && item.value)) suggestions.push({ level: 'warning', message: 'Missing og:image for rich link previews.' });
  if (!found.some((item) => item.label === 'twitter:card' && item.value)) suggestions.push({ level: 'warning', message: 'Missing twitter:card for X/Twitter previews.' });
  return { found, suggestions };
}

export function SeoMetaTool() {
  const [head, setHead] = usePersistedState('qa.seo-head', '<head>\n  <title>Home</title>\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <meta name="description" content="Short.">\n</head>');
  const [audited, setAudited] = useState(false);
  let error = '';
  let report = { found: [] as { label: string; value: string }[], suggestions: [] as SeoSuggestion[] };
  try {
    if (audited) report = auditSeo(head);
  } catch (e) {
    error = describeError(e);
  }

  return (
    <div className="stack">
      <ToolHeader title="SEO Meta Inspector" description="Audit a pasted <head> block for title, description, canonical, viewport and social tags." />
      <Notice>{error}</Notice>
      <Card title="Head HTML" actions={<Button variant="primary" onClick={() => setAudited(true)}>Audit head</Button>}>
        <Textarea rows={9} value={head} onChange={(event) => { setHead(event.target.value); setAudited(false); }} spellCheck={false} placeholder="Paste a <head> block…" />
      </Card>
      {audited && (
        <>
          <Card title="Detected tags">
            <div className="result-list">
              {report.found.map((item) => (
                <ListItem
                  key={item.label}
                  title={item.label}
                  subtitle={<span className="mono muted"><ShortText value={item.value || 'Not found'} length={110} /></span>}
                  right={<Badge tone={item.value ? 'success' : 'warning'}>{item.value ? `${item.value.length} chars` : 'Missing'}</Badge>}
                />
              ))}
            </div>
          </Card>
          <Card title="Suggestions" actions={<Badge tone={report.suggestions.length ? 'warning' : 'success'}>{report.suggestions.length} items</Badge>}>
            {!report.suggestions.length ? (
              <EmptyState>All checked SEO metadata looks healthy.</EmptyState>
            ) : (
              <div className="result-list">
                {report.suggestions.map((suggestion, index) => (
                  <ListItem
                    key={index}
                    title={suggestion.message}
                    right={<Badge tone={suggestion.level === 'error' ? 'danger' : 'warning'}>{suggestion.level}</Badge>}
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
/* 12. Accessibility Checklist                                                */
/* -------------------------------------------------------------------------- */

const A11Y_GROUPS: { title: string; items: string[] }[] = [
  {
    title: 'Semantics',
    items: ['One clear <h1> describes the page', 'Headings follow a logical order', 'Landmark regions (nav, main, footer) are used', 'Lists and tables use proper markup'],
  },
  {
    title: 'Keyboard',
    items: ['All interactive controls are keyboard reachable', 'Focus indicators are visible', 'Tab order matches visual order', 'No keyboard traps or custom key hacks'],
  },
  {
    title: 'Contrast',
    items: ['Normal text meets 4.5:1 contrast', 'Large text meets 3:1 contrast', 'UI borders and icons meet 3:1', 'Meaning is never conveyed by color alone'],
  },
  {
    title: 'Forms',
    items: ['Every input has an associated label', 'Errors are announced and described', 'Required fields are clearly indicated', 'Form submission works without a mouse'],
  },
  {
    title: 'Media',
    items: ['Informative images have alt text', 'Decorative images use empty alt', 'Videos have captions', 'Audio has transcripts and no forced autoplay'],
  },
];

export function A11yChecklistTool() {
  const [checked, setChecked] = usePersistedState<Record<string, boolean>>('qa.a11y-checklist', {});
  const [error, setError] = useState('');
  const total = A11Y_GROUPS.reduce((sum, group) => sum + group.items.length, 0);
  const done = A11Y_GROUPS.reduce((sum, group) => sum + group.items.filter((item) => checked?.[item]).length, 0);
  const percent = total ? Math.round((done / total) * 100) : 0;

  const toggle = (item: string, value: boolean) => {
    setError('');
    try {
      setChecked((previous) => ({ ...previous, [item]: value }));
    } catch (e) {
      setError(describeError(e));
    }
  };

  const reset = async () => {
    setError('');
    try {
      setChecked({});
      await setLocal('qa.a11y-checklist', {});
    } catch (e) {
      setError(describeError(e));
    }
  };

  return (
    <div className="stack">
      <ToolHeader title="Accessibility Checklist" description="Track common accessibility requirements across five categories." badge={`${done}/${total}`} />
      <Notice>{error}</Notice>
      <Card title="Progress" actions={<Button variant="ghost" onClick={() => void reset()}>Reset</Button>}>
        <div className="stack">
          <div className="row wrap"><span className="grow">{done} of {total} items checked</span><Badge tone={percent === 100 ? 'success' : 'accent'}>{percent}%</Badge></div>
          <div className="bar-track"><div className="bar" style={{ width: `${percent}%` }} /></div>
        </div>
      </Card>
      {A11Y_GROUPS.map((group) => (
        <Card key={group.title} title={group.title}>
          <div className="stack">
            {group.items.map((item) => (
              <Toggle key={item} checked={!!checked?.[item]} onChange={(value) => toggle(item, value)} label={item} />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 13. Meta Tag Generator                                                     */
/* -------------------------------------------------------------------------- */

type MetaTab = 'standard' | 'og' | 'twitter' | 'all';

const META_TABS: { id: MetaTab; label: string }[] = [
  { id: 'standard', label: 'Standard' }, { id: 'og', label: 'Open Graph' },
  { id: 'twitter', label: 'Twitter' }, { id: 'all', label: 'All' },
];

const DEFAULT_META_FIELDS = { title: '', description: '', url: '', image: '', theme: '#ffffff', twitter: '' };
type MetaFields = typeof DEFAULT_META_FIELDS;

export function MetaTagGeneratorTool() {
  const [fields, setFields] = usePersistedState<MetaFields>('qa.meta-fields', DEFAULT_META_FIELDS);
  const [tab, setTab] = useState<MetaTab>('all');
  const [error, setError] = useState('');
  const value = (key: keyof MetaFields) => fields?.[key] ?? '';
  const esc = (key: keyof MetaFields) => escapeHtml(value(key).trim());

  const standard = [
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    value('title') ? `<title>${esc('title')}</title>` : '',
    value('description') ? `<meta name="description" content="${esc('description')}">` : '',
    value('url') ? `<link rel="canonical" href="${esc('url')}">` : '',
    value('theme') ? `<meta name="theme-color" content="${esc('theme')}">` : '',
  ].filter(Boolean);
  const og = [
    value('title') ? `<meta property="og:title" content="${esc('title')}">` : '',
    '<meta property="og:type" content="website">',
    value('url') ? `<meta property="og:url" content="${esc('url')}">` : '',
    value('description') ? `<meta property="og:description" content="${esc('description')}">` : '',
    value('image') ? `<meta property="og:image" content="${esc('image')}">` : '',
  ].filter(Boolean);
  const twitter = [
    value('image') ? '<meta name="twitter:card" content="summary_large_image">' : '<meta name="twitter:card" content="summary">',
    value('title') ? `<meta name="twitter:title" content="${esc('title')}">` : '',
    value('description') ? `<meta name="twitter:description" content="${esc('description')}">` : '',
    value('image') ? `<meta name="twitter:image" content="${esc('image')}">` : '',
    value('twitter') ? `<meta name="twitter:site" content="${esc('twitter')}">` : '',
  ].filter(Boolean);
  const groups: Record<MetaTab, string[]> = { standard, og, twitter, all: [...standard, ...og, ...twitter] };
  const generated = groups[tab].join('\n');

  const setField = (key: keyof MetaFields, next: string) => {
    setError('');
    setFields((previous) => ({ ...previous, [key]: next }));
  };

  const download = () => {
    setError('');
    try {
      downloadText(groups.all.join('\n'), timestampName('meta-tags', 'html'), 'text/html');
    } catch (e) {
      setError(describeError(e));
    }
  };

  return (
    <div className="stack">
      <ToolHeader title="Meta Tag Generator" description="Build standard, Open Graph and Twitter Card tags for a page." badge={`${groups.all.length} tags`} />
      <Notice>{error}</Notice>
      <Card title="Page details">
        <div className="grid-2">
          <Field label="Title"><Input value={value('title')} onChange={(event) => setField('title', event.target.value)} placeholder="Page title" /></Field>
          <Field label="Description"><Input value={value('description')} onChange={(event) => setField('description', event.target.value)} placeholder="Short description" /></Field>
          <Field label="Canonical URL"><Input value={value('url')} onChange={(event) => setField('url', event.target.value)} placeholder="https://example.com/page" /></Field>
          <Field label="Preview image URL"><Input value={value('image')} onChange={(event) => setField('image', event.target.value)} placeholder="https://example.com/og.png" /></Field>
          <Field label="Twitter handle">
            <Input value={value('twitter')} onChange={(event) => setField('twitter', event.target.value)} placeholder="@example" />
          </Field>
          <Field label="Theme color">
            <div className="row wrap">
              {parseColor(value('theme')) && <Swatch color={value('theme')} size={26} />}
              <Input value={value('theme')} onChange={(event) => setField('theme', event.target.value)} placeholder="#ffffff" />
            </div>
          </Field>
        </div>
      </Card>
      <Card title="Generated tags" actions={<Button variant="soft" onClick={download}>Download HTML</Button>}>
        <div className="stack">
          <Tabs<MetaTab> tabs={META_TABS} active={tab} onChange={setTab} />
          <CodeBlock value={generated} title={`${tab} tags`} maxHeight={240} />
          <div className="row wrap"><CopyButton value={groups.all.join('\n')} label="Copy all tags" /></div>
        </div>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 14. Media Query Builder                                                    */
/* -------------------------------------------------------------------------- */

type Orientation = 'any' | 'portrait' | 'landscape';
type Scheme = 'any' | 'light' | 'dark';
type Motion = 'any' | 'no-preference' | 'reduce';

const ORIENTATIONS: { value: Orientation; label: string }[] = [
  { value: 'any', label: 'Any' }, { value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' },
];
const SCHEMES: { value: Scheme; label: string }[] = [
  { value: 'any', label: 'Any' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' },
];
const MOTIONS: { value: Motion; label: string }[] = [
  { value: 'any', label: 'Any' }, { value: 'no-preference', label: 'No preference' }, { value: 'reduce', label: 'Reduce' },
];

const DEFAULT_MEDIA_STATE = { minWidth: '', maxWidth: '', orientation: 'any' as Orientation, scheme: 'any' as Scheme, motion: 'any' as Motion };
type MediaState = typeof DEFAULT_MEDIA_STATE;

export function MediaQueryBuilderTool() {
  const [state, setState] = usePersistedState<MediaState>('qa.media-query', DEFAULT_MEDIA_STATE);

  let error = '';
  let rule = '';
  try {
    const conditions: string[] = [];
    const min = numberValue(state?.minWidth ?? '');
    const max = numberValue(state?.maxWidth ?? '');
    if (min > 0) conditions.push(`(min-width: ${min}px)`);
    if (max > 0) conditions.push(`(max-width: ${max}px)`);
    if (state?.orientation && state.orientation !== 'any') conditions.push(`(orientation: ${state.orientation})`);
    if (state?.scheme && state.scheme !== 'any') conditions.push(`(prefers-color-scheme: ${state.scheme})`);
    if (state?.motion && state.motion !== 'any') conditions.push(`(prefers-reduced-motion: ${state.motion})`);
    const body = state?.scheme === 'dark'
      ? '  .demo {\n    color-scheme: dark;\n    background: #111827;\n    color: #f9fafb;\n  }'
      : '  .demo {\n    padding: 12px;\n    border-radius: 8px;\n    background: #eef2ff;\n  }';
    rule = `@media ${conditions.length ? conditions.join(' and ') : 'all'} {\n${body}\n}`;
  } catch (e) {
    error = describeError(e);
  }

  const update = (key: keyof MediaState, value: string) => {
    setState((previous) => ({ ...previous, [key]: value }));
  };

  return (
    <div className="stack">
      <ToolHeader title="Media Query Builder" description="Compose a @media rule from width, orientation and preference controls." />
      <Notice>{error}</Notice>
      <Card title="Conditions">
        <div className="stack">
          <div className="grid-2">
            <Field label="Min width (px)"><Input type="number" min={0} value={state?.minWidth ?? ''} onChange={(event) => update('minWidth', event.target.value)} placeholder="768" /></Field>
            <Field label="Max width (px)"><Input type="number" min={0} value={state?.maxWidth ?? ''} onChange={(event) => update('maxWidth', event.target.value)} placeholder="1279" /></Field>
          </div>
          <Field label="Orientation"><Select value={state?.orientation ?? 'any'} onChange={(event) => update('orientation', event.target.value)}>{ORIENTATIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></Field>
          <Field label="Color scheme preference"><Select value={state?.scheme ?? 'any'} onChange={(event) => update('scheme', event.target.value)}>{SCHEMES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></Field>
          <Field label="Motion preference"><Select value={state?.motion ?? 'any'} onChange={(event) => update('motion', event.target.value)}>{MOTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></Field>
        </div>
      </Card>
      <Card title="Generated CSS" actions={<CopyButton value={rule} label="Copy rule" />}>
        <div className="stack">
          <CodeBlock value={rule} title="@media" maxHeight={180} />
          <div className="preview-box demo">Preview box — the generated .demo rule styles this element.</div>
        </div>
      </Card>
    </div>
  );
}
