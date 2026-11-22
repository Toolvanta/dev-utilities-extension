import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { ArrowLeftRight, Check, Copy, Download, Plus, Trash2 } from 'lucide-react';
import {
  Badge, Button, Card, CodeBlock, EmptyState, Field, IconButton, Input, ListItem,
  Notice, Segmented, Select, Stat, Textarea, Toggle, ToolHeader,
} from '../components/ui';
import { copyText, downloadText, escapeHtml, formatBytes, timestampName, uid } from '../lib/utils';
import { getLocal, setLocal } from '../lib/storage';
import { describeError } from '../lib/messaging';

function usePersistedState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>, string] {
  const [value, setValue] = useState<T>(initial);
  const [error, setError] = useState('');
  const ready = useRef(false);

  useEffect(() => {
    let live = true;
    getLocal<T>(key, initial)
      .then((stored) => {
        if (!live) return;
        setValue(stored);
        ready.current = true;
      })
      .catch((e) => { if (live) setError(describeError(e)); });
    return () => { live = false; };
  }, [key]);

  const update: Dispatch<SetStateAction<T>> = (next) => {
    setValue((current) => {
      const resolved = typeof next === 'function' ? (next as (prev: T) => T)(current) : next;
      if (ready.current) void setLocal(key, resolved).catch((e) => setError(describeError(e)));
      return resolved;
    });
  };
  return [value, update, error];
}

function CopyAction({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(id);
  }, [copied]);
  return (
    <Button
      variant='ghost'
      disabled={!value}
      icon={copied ? <Check size={14} /> : <Copy size={14} />}
      onClick={async () => { if (await copyText(value)) setCopied(true); }}
    >{copied ? 'Copied' : label}</Button>
  );
}

function DownloadButton({ value, prefix, ext, mime = 'text/plain', label = 'Download' }: {
  value: string; prefix: string; ext: string; mime?: string; label?: string;
}) {
  return (
    <Button
      variant='outline'
      disabled={!value}
      icon={<Download size={14} />}
      onClick={() => downloadText(value, timestampName(prefix, ext), mime)}
    >{label}</Button>
  );
}

function ResultCard({ value, prefix, ext, title = 'Result', mime = 'text/plain', maxHeight = 240 }: {
  value: string; prefix: string; ext: string; title?: string; mime?: string; maxHeight?: number;
}) {
  return (
    <Card title={title} actions={<div className='row wrap'><CopyAction value={value} /><DownloadButton value={value} prefix={prefix} ext={ext} mime={mime} /></div>}>
      {value ? <CodeBlock value={value} maxHeight={maxHeight} /> : <EmptyState>There is no output yet.</EmptyState>}
    </Card>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.trunc(value))) : min;
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : '';
}

function pascalCaseName(input: string): string {
  const joined = input
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  const safe = /^[A-Za-z_]/.test(joined) ? joined : `Type${joined}`;
  return safe || 'Anonymous';
}

function uniqueName(base: string, used: Set<string>): string {
  const safeBase = base || 'Anonymous';
  let name = safeBase;
  let index = 2;
  while (used.has(name)) name = `${safeBase}${index++}`;
  used.add(name);
  return name;
}

function inferTsType(value: unknown, hint: string, declarations: string[], used: Set<string>, readOnly: boolean): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'unknown[]';
    const types = Array.from(new Set(value.map((item, index) => inferTsType(item, `${hint}Item${index}`, declarations, used, readOnly))));
    return types.length === 1 ? `${types[0]}[]` : `Array<${types.join(' | ')}>`;
  }
  if (isRecord(value)) {
    const name = uniqueName(pascalCaseName(hint), used);
    const start = declarations.length;
    const fields = Object.entries(value).map(([key, fieldValue]) => {
      const fieldName = /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
      const fieldType = inferTsType(fieldValue, key, declarations, used, readOnly);
      return `  ${readOnly ? 'readonly ' : ''}${fieldName}: ${fieldType};`;
    });
    declarations.splice(start, 0, `interface ${name} {\n${fields.join('\n')}\n}`);
    return name;
  }
  return 'unknown';
}

function parseCsv(text: string, delimiter: string): string[][] {
  if (delimiter.length !== 1) throw new Error('Delimiter must be a single character.');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else quoted = false;
      } else field += char;
    } else if (char === '"' && field === '') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (quoted) throw new Error('Unterminated quoted field.');
  if (field !== '' || row.length > 0) rows.push([...row, field]);
  return rows;
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined
    ? ''
    : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const VOID_HTML_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

function formatHtml(input: string, unit: string): string {
  const tokens = input.match(/<!--[\s\S]*?-->|<pre\b[\s\S]*?<\/pre\s*>|<textarea\b[\s\S]*?<\/textarea\s*>|<script\b[\s\S]*?<\/script\s*>|<style\b[\s\S]*?<\/style\s*>|<[^>]*>|[^<]+/gi) ?? [];
  const out: string[] = [];
  let depth = 0;
  for (const raw of tokens) {
    const token = raw.trim();
    if (!token) continue;
    const indent = unit.repeat(depth);
    if (/^<!--|^<(pre|textarea|script|style)\b/i.test(token)) {
      out.push(indent + token);
      continue;
    }
    if (/^<\//.test(token)) {
      depth = Math.max(0, depth - 1);
      out.push(unit.repeat(depth) + token);
      continue;
    }
    const open = token.match(/^<([A-Za-z][\w:-]*)/);
    if (open && /^<[^!?]/.test(token)) {
      const tag = open[1].toLowerCase();
      const selfClosed = token.endsWith('/>') || new RegExp(`</${tag}\\s*>$`, 'i').test(token);
      out.push(indent + token);
      if (!VOID_HTML_TAGS.has(tag) && !selfClosed) depth += 1;
      continue;
    }
    out.push(indent + token);
  }
  return out.join('\n');
}

interface ParamRow { id: string; key: string; value: string }

function isAbsoluteUrl(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value);
}

function parseUrlRows(value: string): ParamRow[] {
  if (!value.trim()) return [];
  const url = new URL(value, window.location.origin);
  return Array.from(url.searchParams.entries()).map(([key, item]) => ({ id: uid('param'), key, value: item }));
}

function buildUrlWithRows(source: string, rows: ParamRow[]): string {
  if (!source.trim()) return '';
  const url = new URL(source, window.location.origin);
  url.search = '';
  for (const row of rows) if (row.key) url.searchParams.append(row.key, row.value);
  return isAbsoluteUrl(source) ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
}

function splitWords(input: string): string[] {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—', ndash: '–', laquo: '«', raquo: '»',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-zA-Z][a-zA-Z0-9]+);/gi, (match, code: string) => {
    if (code[0] !== '#') return NAMED_ENTITIES[code.toLowerCase()] ?? match;
    const hex = code[1]?.toLowerCase() === 'x';
    const point = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
    if (!Number.isFinite(point) || point < 0 || point > 0x10ffff) return match;
    try { return String.fromCodePoint(point); } catch { return match; }
  });
}

function escapeUnicode(input: string): string {
  let output = '';
  for (const char of input) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x7f) { output += char; continue; }
    if (code <= 0xffff) { output += `\\u${code.toString(16).padStart(4, '0')}`; continue; }
    const offset = code - 0x10000;
    const high = 0xd800 + (offset >> 10);
    const low = 0xdc00 + (offset & 0x3ff);
    output += `\\u${high.toString(16).padStart(4, '0')}\\u${low.toString(16).padStart(4, '0')}`;
  }
  return output;
}

function unescapeUnicode(input: string): string {
  return input.replace(/\\u([0-9a-f]{4})/gi, (match, hex: string) => {
    const code = Number.parseInt(hex, 16);
    return Number.isNaN(code) ? match : String.fromCharCode(code);
  });
}

type DiffKind = 'same' | 'added' | 'removed';
interface DiffLine { kind: DiffKind; text: string }

function lineDiff(left: string, right: string): DiffLine[] {
  const a = left.length ? left.replace(/\r\n/g, '\n').split('\n') : [];
  const b = right.length ? right.replace(/\r\n/g, '\n').split('\n') : [];
  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { lines.push({ kind: 'same', text: a[i] ?? '' }); i += 1; j += 1; }
    else if (table[i + 1][j] >= table[i][j + 1]) { lines.push({ kind: 'removed', text: a[i] ?? '' }); i += 1; }
    else { lines.push({ kind: 'added', text: b[j] ?? '' }); j += 1; }
  }
  while (i < a.length) { lines.push({ kind: 'removed', text: a[i] ?? '' }); i += 1; }
  while (j < b.length) { lines.push({ kind: 'added', text: b[j] ?? '' }); j += 1; }
  return lines;
}

const LOREM_WORDS = ['lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit', 'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'magna', 'aliqua', 'enim', 'ad', 'minim', 'veniam', 'quis', 'nostrud', 'exercitation', 'ullamco', 'laboris', 'nisi', 'aliquip', 'ex', 'ea', 'commodo', 'consequat'];

function generateLorem(paragraphs: number, sentences: number, words: number): string {
  const makeSentence = () => {
    const picked = Array.from({ length: clamp(words, 1, 60) }, () => LOREM_WORDS[Math.floor(Math.random() * LOREM_WORDS.length)]);
    return `${capitalize(picked.join(' '))}.`;
  };
  return Array.from({ length: clamp(paragraphs, 1, 20) }, () =>
    Array.from({ length: clamp(sentences, 1, 20) }, makeSentence).join(' ')).join('\n\n');
}

type IndentChoice = '2' | '4' | 'tab';
type UrlEncodeMode = 'component' | 'decodeComponent' | 'uri';
type Base64Direction = 'encode' | 'decode';
type EntityMode = 'encode' | 'decode';
type UnicodeDirection = 'escape' | 'unescape';
type SlugSeparator = '-' | '_';

const URL_ENCODE_MODES: { value: UrlEncodeMode; label: string }[] = [
  { value: 'component', label: 'encodeURIComponent' },
  { value: 'decodeComponent', label: 'decodeURIComponent' },
  { value: 'uri', label: 'encodeURI' },
];
const BASE64_DIRECTIONS: { value: Base64Direction; label: string }[] = [
  { value: 'encode', label: 'Encode' },
  { value: 'decode', label: 'Decode' },
];
const ENTITY_MODES: { value: EntityMode; label: string }[] = [
  { value: 'encode', label: 'Encode' },
  { value: 'decode', label: 'Decode' },
];
const UNICODE_DIRECTIONS: { value: UnicodeDirection; label: string }[] = [
  { value: 'escape', label: 'Escape' },
  { value: 'unescape', label: 'Unescape' },
];
const SLUG_SEPARATORS: { value: SlugSeparator; label: string }[] = [
  { value: '-', label: 'Hyphen (-)' },
  { value: '_', label: 'Underscore (_)' },
];

export function HtmlMinifierTool() {
  const [html, setHtml, storageError] = usePersistedState('html-minifier:input', '<!doctype html>\n<html>\n  <body>\n    <p>Hello   world</p>\n  </body>\n</html>');
  const result = useMemo(() => {
    try {
      const before = new TextEncoder().encode(html).length;
      const value = html
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/>\s+</g, '><')
        .replace(/[\t\r\n]+/g, ' ')
        .replace(/ {2,}/g, ' ')
        .trim();
      const after = new TextEncoder().encode(value).length;
      const saved = before ? Math.max(0, (1 - after / before) * 100) : 0;
      return { value, before, after, saved, error: '' };
    } catch (e) { return { value: '', before: 0, after: 0, saved: 0, error: describeError(e) }; }
  }, [html]);

  return (
    <div className='stack'>
      <ToolHeader title='HTML Minifier' description='Strip comments and collapse redundant whitespace between tags.' actions={<Badge tone='accent'>{result.saved.toFixed(1)}% saved</Badge>} />
      <Notice>{storageError}</Notice>
      <Notice>{result.error}</Notice>
      <Card title='Source HTML'>
        <Field label='HTML' hint='Paste markup. Your input is stored locally in this browser.'>
          <Textarea className='mono' rows={9} spellCheck={false} value={html} onChange={(e) => setHtml(e.target.value)} />
        </Field>
      </Card>
      <Card title='Size comparison'>
        <div className='grid-3'>
          <Stat label='Before' value={formatBytes(result.before)} />
          <Stat label='After' value={formatBytes(result.after)} />
          <Stat label='Saved' value={`${result.saved.toFixed(1)}%`} />
        </div>
      </Card>
      <ResultCard title='Minified HTML' value={result.value} prefix='minified' ext='html' mime='text/html' />
    </div>
  );
}

export function HtmlFormatterTool() {
  const [html, setHtml, htmlStoreError] = usePersistedState('html-formatter:input', '<div class="card"><h2>Hello</h2><p>World</p></div>');
  const [indent, setIndent, indentStoreError] = usePersistedState<IndentChoice>('html-formatter:indent', '2');
  const unit = indent === 'tab' ? '\t' : ' '.repeat(indent === '4' ? 4 : 2);
  const format = useMemo(() => {
    try { return { value: formatHtml(html, unit), error: '' }; }
    catch (e) { return { value: '', error: describeError(e) }; }
  }, [html, unit]);

  return (
    <div className='stack'>
      <ToolHeader title='HTML Formatter' description='Pretty print markup with nesting-aware indentation.' actions={<Badge>{unit === '\t' ? 'Tab' : `${unit.length} spaces`}</Badge>} />
      <Notice>{htmlStoreError || indentStoreError}</Notice>
      <Notice>{format.error}</Notice>
      <Card title='Unformatted HTML'>
        <Field label='HTML' hint='Content inside pre, textarea, script and style blocks is kept together.'>
          <Textarea className='mono' rows={9} spellCheck={false} value={html} onChange={(e) => setHtml(e.target.value)} />
        </Field>
      </Card>
      <Card title='Formatting options' actions={<Button disabled={!format.value} onClick={() => setHtml(format.value)}>Apply result</Button>}>
        <div className='grid-2'>
          <Field label='Indentation'>
            <Select value={indent} onChange={(e) => setIndent(e.target.value as IndentChoice)}>
              <option value='2'>2 spaces</option>
              <option value='4'>4 spaces</option>
              <option value='tab'>Tab</option>
            </Select>
          </Field>
          <div className='stack'>
            <span className='muted'>Output uses one line per tag and indents by nesting depth.</span>
            <span className='chip mono'>{format.value.split('\n').length} lines</span>
          </div>
        </div>
      </Card>
      <ResultCard title='Formatted HTML' value={format.value} prefix='formatted' ext='html' mime='text/html' maxHeight={320} />
    </div>
  );
}

export function JsonToTypescriptTool() {
  const [json, setJson, jsonStoreError] = usePersistedState('json-to-ts:input', '{\n  "id": 1,\n  "name": "Ada",\n  "tags": ["dev", "ts"],\n  "meta": { "active": true }\n}');
  const [options, setOptions, optionStoreError] = usePersistedState<{ exportType: boolean; readOnly: boolean }>('json-to-ts:options', { exportType: true, readOnly: false });
  const result = useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(json);
      if (!isRecord(parsed)) throw new Error('The root value must be a JSON object.');
      const declarations: string[] = [];
      inferTsType(parsed, 'Root', declarations, new Set<string>(), options.readOnly);
      const keyword = options.exportType ? 'export ' : '';
      const value = declarations.map((item) => item.replace(/^interface /, `${keyword}interface `)).join('\n\n');
      return { value, error: '' };
    } catch (e) { return { value: '', error: describeError(e) }; }
  }, [json, options]);

  return (
    <div className='stack'>
      <ToolHeader title='JSON to TypeScript' description='Infer interfaces from a JSON object, including arrays and nested objects.' />
      <Notice>{jsonStoreError || optionStoreError}</Notice>
      <Notice>{result.error}</Notice>
      <Card title='JSON object'>
        <Field label='JSON' hint='Paste a single object. Types are inferred from the values you provide.'>
          <Textarea className='mono' rows={10} spellCheck={false} value={json} onChange={(e) => setJson(e.target.value)} />
        </Field>
      </Card>
      <Card title='Options'>
        <div className='stack'>
          <Toggle checked={options.exportType} onChange={(checked) => setOptions((prev) => ({ ...prev, exportType: checked }))} label='Export interfaces' hint='Prefix every generated interface with export.' />
          <Toggle checked={options.readOnly} onChange={(checked) => setOptions((prev) => ({ ...prev, readOnly: checked }))} label='Readonly properties' hint='Mark each generated field as readonly.' />
        </div>
      </Card>
      <ResultCard title='TypeScript' value={result.value} prefix='types' ext='ts' mime='text/typescript' maxHeight={320} />
    </div>
  );
}

type CsvDelimiter = ',' | ';' | '\t' | '|';

export function CsvToJsonTool() {
  const [csv, setCsv, csvStoreError] = usePersistedState('csv-to-json:input', 'name,role,notes\nAda,Engineer,"Loves \"quotes\" and, commas"\nGrace,Admiral,Hello world');
  const [delimiter, setDelimiter, delimiterStoreError] = usePersistedState<CsvDelimiter>('csv-to-json:delimiter', ',');
  const result = useMemo(() => {
    try {
      const rows = parseCsv(csv, delimiter);
      if (rows.length === 0) return { value: '', count: 0, error: '' };
      const headers = (rows[0] ?? []).map((header, index) => header.trim() || `column_${index + 1}`);
      const objects = rows.slice(1)
        .filter((row) => row.some((cell) => cell.trim() !== ''))
        .map((row) => {
          const item: Record<string, string> = {};
          headers.forEach((header, index) => { item[header] = row[index] ?? ''; });
          return item;
        });
      return { value: JSON.stringify(objects, null, 2), count: objects.length, error: '' };
    } catch (e) { return { value: '', count: 0, error: describeError(e) }; }
  }, [csv, delimiter]);

  return (
    <div className='stack'>
      <ToolHeader title='CSV to JSON' description='Convert delimited rows into a JSON array using the first row as headers.' actions={<Badge>{result.count} rows</Badge>} />
      <Notice>{csvStoreError || delimiterStoreError}</Notice>
      <Notice>{result.error}</Notice>
      <Card title='CSV input'>
        <Field label='Delimited text' hint='Quoted fields may contain delimiters, newlines and escaped double quotes.'>
          <Textarea className='mono' rows={9} spellCheck={false} value={csv} onChange={(e) => setCsv(e.target.value)} />
        </Field>
        <div className='divider' />
        <Field label='Delimiter'>
          <Select value={delimiter} onChange={(e) => setDelimiter(e.target.value as CsvDelimiter)}>
            <option value=',' >Comma (,)</option>
            <option value=';'>Semicolon (;)</option>
            <option value={'\t'}>Tab</option>
            <option value='|'>Pipe (|)</option>
          </Select>
        </Field>
      </Card>
      <ResultCard title='JSON array' value={result.value} prefix='from-csv' ext='json' mime='application/json' />
    </div>
  );
}

export function JsonToCsvTool() {
  const [json, setJson, storeError] = usePersistedState('json-to-csv:input', '[\n  { "name": "Ada", "role": "Engineer" },\n  { "name": "Grace", "role": "Admiral", "note": "Hello, world" }\n]');
  const result = useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(json);
      if (!Array.isArray(parsed)) throw new Error('JSON must be an array of objects.');
      const rows = parsed.map((item, index) => {
        if (!isRecord(item)) throw new Error(`Item ${index + 1} is not an object.`);
        return item;
      });
      const keys: string[] = [];
      for (const row of rows) for (const key of Object.keys(row)) if (!keys.includes(key)) keys.push(key);
      if (keys.length === 0) return { value: '', count: 0, error: '' };
      const value = [keys.map(csvCell).join(','), ...rows.map((row) => keys.map((key) => csvCell(row[key])).join(','))].join('\n');
      return { value, count: rows.length, error: '' };
    } catch (e) { return { value: '', count: 0, error: describeError(e) }; }
  }, [json]);

  return (
    <div className='stack'>
      <ToolHeader title='JSON to CSV' description='Flatten an array of objects into comma-separated columns with safe escaping.' actions={<Badge>{result.count} objects</Badge>} />
      <Notice>{storeError}</Notice>
      <Notice>{result.error}</Notice>
      <Card title='JSON array'>
        <Field label='JSON' hint='Object keys are collected in order to build the header row.'>
          <Textarea className='mono' rows={10} spellCheck={false} value={json} onChange={(e) => setJson(e.target.value)} />
        </Field>
      </Card>
      <ResultCard title='CSV output' value={result.value} prefix='from-json' ext='csv' mime='text/csv' />
    </div>
  );
}

export function UrlParamsTool() {
  const [source, setSource, sourceError] = usePersistedState('url-params:source', '');
  const [rows, setRows, rowsStoreError] = usePersistedState<ParamRow[]>('url-params:rows', []);
  const [error, setError] = useState('');

  const result = useMemo(() => {
    try { return { value: buildUrlWithRows(source, rows), error: '' }; }
    catch (e) { return { value: '', error: describeError(e) }; }
  }, [source, rows]);

  const onSourceChange = (value: string) => {
    setSource(value);
    try { setRows(parseUrlRows(value)); setError(''); }
    catch (e) { setRows([]); setError(describeError(e)); }
  };

  const commitRows = (next: ParamRow[]) => {
    setRows(next);
    try { setSource(buildUrlWithRows(source, next)); setError(''); }
    catch (e) { setError(describeError(e)); }
  };

  const patchRow = (id: string, patch: Partial<Pick<ParamRow, 'key' | 'value'>>) => {
    commitRows(rows.map((row) => row.id === id ? { ...row, ...patch } : row));
  };

  return (
    <div className='stack'>
      <ToolHeader title='URL Parameters' description='Parse, edit and rebuild query strings without leaving the panel.' actions={<Badge>{rows.length} params</Badge>} />
      <Notice>{sourceError || rowsStoreError}</Notice>
      <Notice>{error}</Notice>
      <Notice>{result.error}</Notice>
      <Card title='URL'>
        <Field label='Paste a URL' hint='Absolute URLs and site-relative paths are both supported.'>
          <Input className='mono' value={source} placeholder='https://example.com/search?q=hello' onChange={(e) => onSourceChange(e.target.value)} />
        </Field>
      </Card>
      <Card title='Query parameters' actions={<Button icon={<Plus size={14} />} onClick={() => commitRows([...rows, { id: uid('param'), key: '', value: '' }])}>Add param</Button>}>
        {rows.length === 0 ? (
          <EmptyState>Enter a URL with a query string, or add a parameter manually.</EmptyState>
        ) : (
          <div className='stack'>
            {rows.map((row) => (
              <div key={row.id} className='row'>
                <Input aria-label='Parameter name' className='grow mono' placeholder='key' value={row.key} onChange={(e) => patchRow(row.id, { key: e.target.value })} />
                <Input aria-label='Parameter value' className='grow mono' placeholder='value' value={row.value} onChange={(e) => patchRow(row.id, { value: e.target.value })} />
                <IconButton title='Remove parameter' onClick={() => commitRows(rows.filter((item) => item.id !== row.id))}><Trash2 size={15} /></IconButton>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title='Rebuilt URL' actions={<CopyAction value={result.value} />}>
        <CodeBlock value={result.value} maxHeight={140} />
      </Card>
    </div>
  );
}

export function UrlEncoderTool() {
  const [input, setInput, storeError] = usePersistedState('url-encoder:input', '');
  const [mode, setMode, modeError] = usePersistedState<UrlEncodeMode>('url-encoder:mode', 'component');
  const result = useMemo(() => {
    try {
      let value = '';
      if (mode === 'component') value = encodeURIComponent(input);
      if (mode === 'decodeComponent') value = decodeURIComponent(input);
      if (mode === 'uri') value = encodeURI(input);
      return { value, error: '' };
    } catch (e) { return { value: '', error: describeError(e) }; }
  }, [input, mode]);

  return (
    <div className='stack'>
      <ToolHeader title='URL Encoder / Decoder' description='Convert text with encodeURIComponent, decodeURIComponent or encodeURI.' />
      <Notice>{storeError || modeError}</Notice>
      <Notice>{result.error}</Notice>
      <Card title='Input and mode'>
        <div className='stack'>
          <Segmented options={URL_ENCODE_MODES} value={mode} onChange={setMode} />
          <Field label='Text'>
            <Textarea className='mono' rows={6} spellCheck={false} value={input} onChange={(e) => setInput(e.target.value)} placeholder='https://example.com/a b?x=1&y=2' />
          </Field>
        </div>
      </Card>
      <Card title='Output' actions={<CopyAction value={result.value} />}>
        <Textarea className='mono' rows={6} readOnly value={result.value} placeholder='Result appears here' />
      </Card>
    </div>
  );
}

function bytesToBinary(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return binary;
}

function binaryToBytes(binary: string): Uint8Array {
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i) & 0xff;
  return bytes;
}

function encodeBase64Utf8(text: string): string {
  return btoa(bytesToBinary(new TextEncoder().encode(text)));
}

function decodeBase64Utf8(text: string): string {
  const binary = atob(text.replace(/\s+/g, ''));
  return new TextDecoder('utf-8', { fatal: true }).decode(binaryToBytes(binary));
}

export function Base64Tool() {
  const [input, setInput, storeError] = usePersistedState('base64:input', '');
  const [direction, setDirection, directionError] = usePersistedState<Base64Direction>('base64:direction', 'encode');
  const result = useMemo(() => {
    try { return { value: direction === 'encode' ? encodeBase64Utf8(input) : decodeBase64Utf8(input), error: '' }; }
    catch (e) { return { value: '', error: describeError(e) }; }
  }, [input, direction]);
  const swap = () => { setDirection(direction === 'encode' ? 'decode' : 'encode'); setInput(result.value); };

  return (
    <div className='stack'>
      <ToolHeader title='Base64 Tool' description='Encode and decode UTF-8 text, including emoji and other non-ASCII characters.' actions={<Badge tone='accent'>{direction === 'encode' ? 'Text → Base64' : 'Base64 → Text'}</Badge>} />
      <Notice>{storeError || directionError}</Notice>
      <Notice>{result.error}</Notice>
      <Card title='Input' actions={<Button icon={<ArrowLeftRight size={14} />} onClick={swap}>Swap direction</Button>}>
        <div className='stack'>
          <Segmented options={BASE64_DIRECTIONS} value={direction} onChange={setDirection} />
          <Field label={direction === 'encode' ? 'UTF-8 text' : 'Base64 text'}>
            <Textarea className='mono' rows={7} spellCheck={false} value={input} onChange={(e) => setInput(e.target.value)} placeholder={direction === 'encode' ? 'Héllo 🌍' : 'SMOp6Gkgw7yB8J+Tig=='} />
          </Field>
        </div>
      </Card>
      <Card title='Output' actions={<CopyAction value={result.value} />}>
        <Textarea className='mono' rows={7} readOnly value={result.value} placeholder='Result appears here' />
      </Card>
    </div>
  );
}

export function TextCaseTool() {
  const [input, setInput, storeError] = usePersistedState('text-case:input', 'helloWorld_dev user-name');
  const cases = useMemo(() => {
    const words = splitWords(input);
    const lower = words.map((word) => word.toLowerCase());
    const upper = words.map((word) => word.toUpperCase());
    const titled = words.map(capitalize);
    return [
      { label: 'camelCase', value: lower.map((word, index) => index === 0 ? word : capitalize(word)).join('') },
      { label: 'PascalCase', value: titled.join('') },
      { label: 'snake_case', value: lower.join('_') },
      { label: 'kebab-case', value: lower.join('-') },
      { label: 'Title Case', value: titled.join(' ') },
      { label: 'UPPERCASE', value: input.toUpperCase() },
      { label: 'lowercase', value: input.toLowerCase() },
      { label: 'CONSTANT_CASE', value: upper.join('_') },
    ];
  }, [input]);

  return (
    <div className='stack'>
      <ToolHeader title='Text Case' description='Convert one phrase into eight common naming styles.' actions={<Badge>{cases.length} variants</Badge>} />
      <Notice>{storeError}</Notice>
      <Card title='Source text'>
        <Field label='Text' hint='CamelCase and acronym boundaries are detected automatically.'>
          <Textarea rows={5} value={input} onChange={(e) => setInput(e.target.value)} placeholder='some text to convert' />
        </Field>
      </Card>
      <Card title='Conversions'>
        <div className='result-list'>
          {cases.map((item) => (
            <ListItem
              key={item.label}
              title={item.label}
              subtitle={<span className='mono'>{item.value || '—'}</span>}
              right={<CopyAction value={item.value} label='Copy' />}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}

interface SlugOptions { lower: boolean; separator: SlugSeparator; maxLength: number; stripAccents: boolean }

export function SlugGeneratorTool() {
  const [input, setInput, storeError] = usePersistedState('slug:input', 'Héllo World — With Emoji 🚀');
  const [options, setOptions, optionError] = usePersistedState<SlugOptions>('slug:options', { lower: true, separator: '-', maxLength: 60, stripAccents: true });
  const result = useMemo(() => {
    try {
      let value = options.stripAccents
        ? input.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
        : input;
      if (options.lower) value = value.toLowerCase();
      value = value.replace(/[^\x00-\x7F]+/g, '').replace(/[^a-zA-Z0-9]+/g, options.separator);
      const escaped = options.separator === '-' ? '\\-' : '_';
      value = value.replace(new RegExp(`${escaped}+`, 'g'), options.separator)
        .replace(new RegExp(`^${escaped}|${escaped}$`, 'g'), '');
      const max = clamp(options.maxLength, 1, 200);
      if (value.length > max) value = value.slice(0, max).replace(new RegExp(`${escaped}$`), '');
      return { value, error: '' };
    } catch (e) { return { value: '', error: describeError(e) }; }
  }, [input, options]);

  return (
    <div className='stack'>
      <ToolHeader title='Slug Generator' description='Create URL-friendly slugs from free-form text.' actions={<Badge>{result.value.length} chars</Badge>} />
      <Notice>{storeError || optionError}</Notice>
      <Notice>{result.error}</Notice>
      <Card title='Text'>
        <Field label='Title or heading'>
          <Textarea rows={4} value={input} onChange={(e) => setInput(e.target.value)} placeholder='My new blog post title' />
        </Field>
      </Card>
      <Card title='Options'>
        <div className='stack'>
          <div className='grid-2'>
            <Field label='Separator'>
              <Segmented options={SLUG_SEPARATORS} value={options.separator} onChange={(separator) => setOptions((prev) => ({ ...prev, separator }))} />
            </Field>
            <Field label='Max length' hint='Between 1 and 200 characters'>
              <Input type='number' min={1} max={200} value={options.maxLength} onChange={(e) => setOptions((prev) => ({ ...prev, maxLength: Number(e.target.value) }))} />
            </Field>
          </div>
          <Toggle checked={options.lower} onChange={(lower) => setOptions((prev) => ({ ...prev, lower }))} label='Lowercase' />
          <Toggle checked={options.stripAccents} onChange={(stripAccents) => setOptions((prev) => ({ ...prev, stripAccents }))} label='Strip accents' hint='Convert é to e instead of dropping it.' />
        </div>
      </Card>
      <Card title='Slug' actions={<CopyAction value={result.value} />}>
        <div className='preview-box mono'>{result.value || 'your-slug'}</div>
        <p className='muted mono'>https://example.com/blog/{result.value || 'your-slug'}</p>
      </Card>
    </div>
  );
}

interface LoremOptions { paragraphs: number; sentences: number; words: number }

export function LoremGeneratorTool() {
  const fallback = useMemo(() => generateLorem(3, 4, 8), []);
  const [text, setText, textStoreError] = usePersistedState('lorem:text', fallback);
  const [options, setOptions, optionError] = usePersistedState<LoremOptions>('lorem:options', { paragraphs: 3, sentences: 4, words: 8 });
  const [error, setError] = useState('');
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const generate = () => {
    try { setText(generateLorem(options.paragraphs, options.sentences, options.words)); setError(''); }
    catch (e) { setError(describeError(e)); }
  };
  const numberField = (label: string, key: keyof LoremOptions, max: number) => (
    <Field label={label}>
      <Input type='number' min={1} max={max} value={options[key]} onChange={(e) => setOptions((prev) => ({ ...prev, [key]: Number(e.target.value) }))} />
    </Field>
  );

  return (
    <div className='stack'>
      <ToolHeader title='Lorem Generator' description='Create placeholder paragraphs, sentences and filler text.' actions={<Badge>{wordCount} words</Badge>} />
      <Notice>{textStoreError || optionError}</Notice>
      <Notice>{error}</Notice>
      <Card title='Generation settings' actions={<Button variant='primary' onClick={generate}>Generate</Button>}>
        <div className='grid-3'>
          {numberField('Paragraphs', 'paragraphs', 20)}
          {numberField('Sentences / paragraph', 'sentences', 20)}
          {numberField('Words / sentence', 'words', 60)}
        </div>
      </Card>
      <ResultCard title='Generated text' value={text} prefix='lorem' ext='txt' maxHeight={360} />
    </div>
  );
}

export function HtmlEntitiesTool() {
  const [input, setInput, storeError] = usePersistedState('entities:input', '<p>Tom &amp; Jerry said "hello" &#x1F600;</p>');
  const [mode, setMode, modeError] = usePersistedState<EntityMode>('entities:mode', 'decode');
  const result = useMemo(() => {
    try { return { value: mode === 'encode' ? escapeHtml(input) : decodeEntities(input), error: '' }; }
    catch (e) { return { value: '', error: describeError(e) }; }
  }, [input, mode]);

  return (
    <div className='stack'>
      <ToolHeader title='HTML Entities' description='Encode reserved HTML characters or decode numeric and common named entities.' />
      <Notice>{storeError || modeError}</Notice>
      <Notice>{result.error}</Notice>
      <Card title='Input'>
        <div className='stack'>
          <Segmented options={ENTITY_MODES} value={mode} onChange={setMode} />
          <Field label='Text'>
            <Textarea className='mono' rows={7} spellCheck={false} value={input} onChange={(e) => setInput(e.target.value)} />
          </Field>
        </div>
      </Card>
      <Card title='Output' actions={<CopyAction value={result.value} />}>
        <Textarea className='mono' rows={7} readOnly value={result.value} placeholder='Result appears here' />
        <p className='muted'>Named entities include amp, lt, gt, quot, apos, nbsp, copy and several typographic symbols.</p>
      </Card>
    </div>
  );
}

export function UnicodeEscaperTool() {
  const [input, setInput, storeError] = usePersistedState('unicode:input', 'Café 🚀 你好');
  const [direction, setDirection, directionError] = usePersistedState<UnicodeDirection>('unicode:direction', 'escape');
  const result = useMemo(() => {
    try { return { value: direction === 'escape' ? escapeUnicode(input) : unescapeUnicode(input), error: '' }; }
    catch (e) { return { value: '', error: describeError(e) }; }
  }, [input, direction]);
  const swap = () => { setDirection(direction === 'escape' ? 'unescape' : 'escape'); setInput(result.value); };

  return (
    <div className='stack'>
      <ToolHeader title='Unicode Escaper' description={'Convert non-ASCII characters to \\uXXXX escapes and back again.'} actions={<Badge tone='accent'>{direction === 'escape' ? 'Escape' : 'Unescape'}</Badge>} />
      <Notice>{storeError || directionError}</Notice>
      <Notice>{result.error}</Notice>
      <Card title='Input' actions={<Button icon={<ArrowLeftRight size={14} />} onClick={swap}>Swap direction</Button>}>
        <div className='stack'>
          <Segmented options={UNICODE_DIRECTIONS} value={direction} onChange={setDirection} />
          <Field label='Text' hint='Astral characters are written as surrogate pairs.'>
            <Textarea className='mono' rows={7} spellCheck={false} value={input} onChange={(e) => setInput(e.target.value)} />
          </Field>
        </div>
      </Card>
      <Card title='Output' actions={<CopyAction value={result.value} />}>
        <Textarea className='mono' rows={7} readOnly value={result.value} placeholder='Result appears here' />
      </Card>
    </div>
  );
}

export function TextDiffTool() {
  const [left, setLeft, leftStoreError] = usePersistedState('diff:left', 'alpha\nbeta\ngamma');
  const [right, setRight, rightStoreError] = usePersistedState('diff:right', 'alpha\nBETA\ngamma\ndelta');
  const result = useMemo(() => {
    try {
      const lines = lineDiff(left, right);
      const added = lines.filter((line) => line.kind === 'added').length;
      const removed = lines.filter((line) => line.kind === 'removed').length;
      const prefix: Record<DiffKind, string> = { same: ' ', added: '+', removed: '-' };
      const value = lines.map((line) => `${prefix[line.kind]}${line.text}`).join('\n');
      return { value, added, removed, error: '' };
    } catch (e) { return { value: '', added: 0, removed: 0, error: describeError(e) }; }
  }, [left, right]);

  return (
    <div className='stack'>
      <ToolHeader title='Text Diff' description='Compare two blocks of text line by line with a unified-style result.' actions={<Badge tone={result.added || result.removed ? 'warning' : 'success'}>+{result.added} / -{result.removed}</Badge>} />
      <Notice>{leftStoreError || rightStoreError}</Notice>
      <Notice>{result.error}</Notice>
      <Card title='Compare'>
        <div className='grid-2'>
          <Field label='Original'>
            <Textarea className='mono' rows={10} spellCheck={false} value={left} onChange={(e) => setLeft(e.target.value)} />
          </Field>
          <Field label='Revised'>
            <Textarea className='mono' rows={10} spellCheck={false} value={right} onChange={(e) => setRight(e.target.value)} />
          </Field>
        </div>
      </Card>
      <Card title='Summary'>
        <div className='grid-3'>
          <Stat label='Added' value={`+${result.added}`} />
          <Stat label='Removed' value={`-${result.removed}`} />
          <Stat label='Unchanged' value={result.value.split('\n').filter((line) => line.startsWith(' ')).length} />
        </div>
      </Card>
      <ResultCard title='Unified diff' value={result.value} prefix='text-diff' ext='diff' maxHeight={360} />
    </div>
  );
}
