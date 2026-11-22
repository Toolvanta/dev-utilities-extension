import { useEffect, useMemo, useState } from 'react';
import {
  Badge, Button, Card, CodeBlock, CopyButton, EmptyState, Field, IconButton, Input,
  ListItem, Notice, Segmented, Select, Stat, Swatch, Tabs, Textarea, Toggle, ToolHeader,
} from '../components/ui';
import {
  copyText, downloadText, escapeHtml, safeJson, timestampName, truncate, uid,
} from '../lib/utils';
import { hexToRgb, parseColor, rgbToHex } from '../lib/color';
import { getLocal, setLocal } from '../lib/storage';
import { describeError } from '../lib/messaging';
import { Copy, Download, Plus, RefreshCw, Trash2 } from 'lucide-react';

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

function usePersistedState<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    getLocal<T>(key, initial)
      .then((saved) => { if (alive) { setValue(saved); setReady(true); } })
      .catch(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [key]);
  const update = (next: T) => {
    setValue(next);
    if (ready) void setLocal(key, next).catch(() => {});
  };
  return [value, update];
}

function useCopyNotice() {
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const copy = async (value: string, label = 'Copied to clipboard.') => {
    try {
      const ok = await copyText(value);
      if (!ok) { setError('Clipboard permission denied.'); setNotice(''); return; }
      setNotice(label);
      setError('');
    } catch (e) {
      setError(describeError(e));
      setNotice('');
    }
  };
  return { error, notice, copy };
}

/* -------------------------------------------------------------------------- */
/* 1. UUID Generator                                                          */
/* -------------------------------------------------------------------------- */

function makeUuid(): string {
  const candidate = crypto as Crypto & { randomUUID?: () => string };
  if (candidate && typeof candidate.randomUUID === 'function') return candidate.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function UuidGeneratorTool() {
  const [count, setCount] = usePersistedState<number>('uuidCount', 5);
  const [values, setValues] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const all = values.join('\n');

  const generate = () => {
    try {
      const total = Math.min(50, Math.max(1, Math.floor(Number(count) || 1)));
      if (total !== count) setCount(total);
      setValues(Array.from({ length: total }, makeUuid));
      setNotice(`Generated ${total} UUID${total === 1 ? '' : 's'}.`);
      setError('');
    } catch (e) { setError(describeError(e)); setNotice(''); }
  };

  const copyAll = async () => {
    try {
      const ok = await copyText(all);
      if (!ok) { setError('Clipboard permission denied.'); return; }
      setNotice('Copied every UUID.');
      setError('');
    } catch (e) { setError(describeError(e)); }
  };

  const download = () => {
    try {
      downloadText(all, timestampName('uuids', 'txt'));
      setNotice('Downloaded the UUID list.');
      setError('');
    } catch (e) { setError(describeError(e)); }
  };

  return (
    <div className="stack">
      <ToolHeader
        title="UUID Generator"
        description="Create RFC 4122 v4 identifiers locally with crypto.randomUUID and a safe fallback."
        badge={values.length ? `${values.length} generated` : undefined}
        actions={<Button variant="primary" icon={<RefreshCw size={14} />} onClick={generate}>Generate</Button>}
      />
      <Notice>{error}</Notice>
      <Notice tone="success">{notice}</Notice>

      <Card title="Options">
        <div className="row wrap">
          <Field label="How many (1–50)">
            <Input type="number" min={1} max={50} value={count} onChange={(e) => setCount(Number(e.target.value))} />
          </Field>
          <Button variant="primary" onClick={generate}>Generate UUIDs</Button>
        </div>
      </Card>

      <Card
        title="UUIDs"
        actions={
          <div className="row wrap">
            <Button variant="ghost" icon={<Copy size={14} />} disabled={!all} onClick={() => void copyAll()}>Copy all</Button>
            <Button variant="ghost" icon={<Download size={14} />} disabled={!all} onClick={download}>Download</Button>
          </div>
        }
      >
        {values.length === 0 ? (
          <EmptyState>Choose a count and press Generate to create some UUIDs.</EmptyState>
        ) : (
          <div className="result-list">
            {values.map((value, index) => (
              <ListItem
                key={`${index}-${value}`}
                title={<span className="mono">{value}</span>}
                subtitle={`UUID #${index + 1}`}
                right={<CopyButton value={value} label="Copy" />}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 3. React Component Generator                                               */
/* -------------------------------------------------------------------------- */

interface ComponentProp { id: string; name: string; type: string; required: boolean }

const DEFAULT_PROPS: ComponentProp[] = [
  { id: 'prop-title', name: 'title', type: 'string', required: true },
  { id: 'prop-count', name: 'count', type: 'number', required: false },
];

function toPascalCase(value: string): string {
  const words = value.trim().replace(/[^a-zA-Z0-9]+/g, ' ').split(/\s+/).filter(Boolean);
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('') || 'MyComponent';
}

function buildComponent(name: string, props: ComponentProp[]): string {
  const comp = toPascalCase(name);
  const camel = comp.charAt(0).toLowerCase() + comp.slice(1);
  const iface = `${comp}Props`;
  const valid = props.filter((prop) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(prop.name.trim()));
  const lines: string[] = ["import React from 'react';", ''];

  if (valid.length) {
    lines.push(`export interface ${iface} {`);
    valid.forEach((prop) => {
      lines.push(`  ${prop.name.trim()}${prop.required ? '' : '?'}: ${prop.type.trim() || 'unknown'};`);
    });
    lines.push('}', '');
  }

  const signature = valid.length
    ? `export function ${comp}({ ${valid.map((p) => p.name.trim()).join(', ')} }: ${iface}) {`
    : `export function ${comp}() {`;
  lines.push(signature, '  return (', `    <section className="${camel}">`);

  if (valid.length) {
    valid.forEach((prop) => {
      const key = prop.name.trim();
      const value = prop.required ? `{${key}}` : `{${key} !== undefined ? String(${key}) : null}`;
      lines.push(`      <div className="${camel}-${key.toLowerCase()}">${value}</div>`);
    });
  } else {
    lines.push('      <p>No props supplied.</p>');
  }

  lines.push('    </section>', '  );', '}', '', `export default ${comp};`, '');
  return lines.join('\n');
}

export function ReactComponentGeneratorTool() {
  const [name, setName] = usePersistedState<string>('reactComponentName', 'UserCard');
  const [props, setProps] = usePersistedState<ComponentProp[]>('reactComponentProps', DEFAULT_PROPS);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    try { setCode(buildComponent(name, props)); setError(''); }
    catch (e) { setError(describeError(e)); }
  }, [name, props]);

  const updateProp = (id: string, patch: Partial<ComponentProp>) => {
    setProps(props.map((prop) => (prop.id === id ? { ...prop, ...patch } : prop)));
  };
  const addProp = () => {
    setProps([...props, { id: uid('prop'), name: '', type: 'string', required: false }]);
  };
  const removeProp = (id: string) => setProps(props.filter((prop) => prop.id !== id));

  const download = () => {
    try {
      downloadText(code, `${toPascalCase(name)}.tsx`, 'text/plain');
    } catch (e) { setError(describeError(e)); }
  };

  return (
    <div className="stack">
      <ToolHeader
        title="React Component Generator"
        description="Turn a name and a prop list into a typed TSX component you can copy into any project."
      />
      <Notice>{error}</Notice>

      <Card title="Component">
        <Field label="Component name" hint="PascalCase is applied automatically.">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="UserCard" />
        </Field>
      </Card>

      <Card title="Props" actions={<Button icon={<Plus size={14} />} onClick={addProp}>Add prop</Button>}>
        {props.length === 0 ? (
          <EmptyState>No props yet. Add one to include an interface in the output.</EmptyState>
        ) : (
          <div className="stack">
            {props.map((prop) => (
              <div className="row wrap" key={prop.id}>
                <Input aria-label="Prop name" value={prop.name} placeholder="name" onChange={(e) => updateProp(prop.id, { name: e.target.value })} />
                <Input aria-label="Prop type" className="mono" value={prop.type} placeholder="string" onChange={(e) => updateProp(prop.id, { type: e.target.value })} />
                <Button variant={prop.required ? 'primary' : 'soft'} onClick={() => updateProp(prop.id, { required: !prop.required })}>
                  {prop.required ? 'required' : 'optional'}
                </Button>
                <IconButton title="Remove prop" onClick={() => removeProp(prop.id)}><Trash2 size={14} /></IconButton>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Generated TSX" actions={
        <div className="row wrap">
          <CopyButton value={code} label="Copy code" />
          <Button variant="ghost" icon={<Download size={14} />} onClick={download}>Download</Button>
        </div>
      }>
        <CodeBlock title={`${toPascalCase(name)}.tsx`} value={code} />
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 4. HTML Boilerplate                                                        */
/* -------------------------------------------------------------------------- */

interface HtmlOptions {
  lang: string;
  title: string;
  description: string;
  viewport: boolean;
  font: string;
  script: string;
}

function buildHtml(o: HtmlOptions): string {
  const title = escapeHtml(o.title.trim() || 'Untitled page');
  const description = escapeHtml(o.description.trim());
  const lang = escapeHtml(o.lang.trim() || 'en');
  const fontName = o.font.trim();
  const fontLink = fontName
    ? [
      '  <link rel="preconnect" href="https://fonts.googleapis.com" />',
      '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />',
      `  <link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName).replace(/%20/g, '+')}:wght@400;600;700&display=swap" rel="stylesheet" />`,
    ].join('\n') + '\n'
    : '';
  const viewport = o.viewport ? '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n' : '';
  const meta = description ? `  <meta name="description" content="${description}" />\n` : '';
  const rawScript = o.script.trim();
  const script = rawScript
    ? `\n    <script>\n${rawScript.replace(/<\/script/gi, '<\\/script')}\n    </script>`
    : '';

  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8" />
${viewport}${meta}${fontLink}  <title>${title}</title>
</head>
<body>
  <div id="root"></div>${script}
</body>
</html>
`;
}

export function HtmlBoilerplateTool() {
  const [options, setOptions] = usePersistedState<HtmlOptions>('htmlBoilerplateOptions', {
    lang: 'en', title: 'My New Page', description: 'A short description of this page.',
    viewport: true, font: '', script: '',
  });
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    try { setHtml(buildHtml(options)); setError(''); }
    catch (e) { setError(describeError(e)); }
  }, [options]);

  const set = (patch: Partial<HtmlOptions>) => setOptions({ ...options, ...patch });
  const download = () => {
    try { downloadText(html, 'index.html', 'text/html'); }
    catch (e) { setError(describeError(e)); }
  };

  return (
    <div className="stack">
      <ToolHeader
        title="HTML Boilerplate"
        description="Generate a clean HTML5 skeleton with metadata, fonts and an optional inline script."
      />
      <Notice>{error}</Notice>

      <Card title="Document options">
        <div className="stack">
          <div className="grid-2">
            <Field label="Language">
              <Input value={options.lang} onChange={(e) => set({ lang: e.target.value })} placeholder="en" />
            </Field>
            <Field label="Title">
              <Input value={options.title} onChange={(e) => set({ title: e.target.value })} placeholder="My New Page" />
            </Field>
          </div>
          <Field label="Description">
            <Input value={options.description} onChange={(e) => set({ description: e.target.value })} placeholder="A short description" />
          </Field>
          <Field label="Google Font family" hint="Leave blank to skip the font links entirely.">
            <Input value={options.font} onChange={(e) => set({ font: e.target.value })} placeholder="Inter" />
          </Field>
          <Toggle
            checked={options.viewport}
            onChange={(viewport) => set({ viewport })}
            label="Include viewport meta tag"
            hint="Recommended for responsive pages."
          />
          <Field label="Inline script" hint="Placed at the end of <body>. Closing script tags are escaped.">
            <Textarea rows={4} className="mono" value={options.script} onChange={(e) => set({ script: e.target.value })} placeholder="console.log('ready');" />
          </Field>
        </div>
      </Card>

      <Card title="index.html" actions={
        <div className="row wrap">
          <CopyButton value={html} label="Copy HTML" />
          <Button variant="ghost" icon={<Download size={14} />} onClick={download}>Download</Button>
        </div>
      }>
        <CodeBlock title="HTML" value={html} />
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 5. package.json Generator                                                  */
/* -------------------------------------------------------------------------- */

interface PackageDependency { id: string; name: string; version: string }
interface PackageOptions {
  name: string;
  version: string;
  description: string;
  license: string;
  manager: 'npm' | 'pnpm' | 'yarn' | 'bun';
}

function packageName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9._-]/g, '') || 'my-package';
}

function buildPackageJson(o: PackageOptions, deps: PackageDependency[]): string {
  const dependencies: Record<string, string> = {};
  deps.forEach((dep) => {
    const name = dep.name.trim();
    if (name) dependencies[name] = dep.version.trim() || 'latest';
  });
  const data: Record<string, unknown> = {
    name: packageName(o.name),
    version: o.version.trim() || '1.0.0',
    private: true,
    description: o.description.trim(),
    license: o.license.trim() || 'MIT',
    scripts: {
      dev: 'vite',
      build: 'tsc && vite build',
      preview: 'vite preview',
      typecheck: 'tsc --noEmit',
    },
    dependencies,
    devDependencies: { typescript: '^5.7.0', vite: '^5.4.0' },
  };
  if (o.manager !== 'npm') data.packageManager = `${o.manager}@9.0.0`;
  return safeJson(data);
}

export function PackageJsonGeneratorTool() {
  const [options, setOptions] = usePersistedState<PackageOptions>('packageJsonOptions', {
    name: 'my-frontend-app', version: '1.0.0', description: 'A small frontend project.',
    license: 'MIT', manager: 'npm',
  });
  const [deps, setDeps] = usePersistedState<PackageDependency[]>('packageJsonDeps', [
    { id: 'dep-react', name: 'react', version: '^18.3.1' },
    { id: 'dep-react-dom', name: 'react-dom', version: '^18.3.1' },
  ]);
  const [json, setJson] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    try { setJson(buildPackageJson(options, deps)); setError(''); }
    catch (e) { setError(describeError(e)); }
  }, [options, deps]);

  const set = (patch: Partial<PackageOptions>) => setOptions({ ...options, ...patch });
  const updateDep = (id: string, patch: Partial<PackageDependency>) => {
    setDeps(deps.map((dep) => (dep.id === id ? { ...dep, ...patch } : dep)));
  };

  const download = () => {
    try { downloadText(json, 'package.json', 'application/json'); }
    catch (e) { setError(describeError(e)); }
  };

  return (
    <div className="stack">
      <ToolHeader
        title="package.json Generator"
        description="Compose package metadata, scripts and dependencies without touching a terminal."
      />
      <Notice>{error}</Notice>

      <Card title="Package metadata">
        <div className="stack">
          <div className="grid-2">
            <Field label="Name">
              <Input value={options.name} onChange={(e) => set({ name: e.target.value })} placeholder="my-frontend-app" />
            </Field>
            <Field label="Version">
              <Input value={options.version} onChange={(e) => set({ version: e.target.value })} placeholder="1.0.0" />
            </Field>
          </div>
          <Field label="Description">
            <Input value={options.description} onChange={(e) => set({ description: e.target.value })} />
          </Field>
          <div className="grid-2">
            <Field label="License">
              <Input value={options.license} onChange={(e) => set({ license: e.target.value })} placeholder="MIT" />
            </Field>
            <Field label="Package manager">
              <Select value={options.manager} onChange={(e) => set({ manager: e.target.value as PackageOptions['manager'] })}>
                <option value="npm">npm</option>
                <option value="pnpm">pnpm</option>
                <option value="yarn">yarn</option>
                <option value="bun">bun</option>
              </Select>
            </Field>
          </div>
        </div>
      </Card>

      <Card title="Dependencies" actions={
        <Button icon={<Plus size={14} />} onClick={() => setDeps([...deps, { id: uid('dep'), name: '', version: '' }])}>Add dependency</Button>
      }>
        {deps.length === 0 ? (
          <EmptyState>No dependencies added — the generated file will have an empty dependencies object.</EmptyState>
        ) : (
          <div className="stack">
            {deps.map((dep) => (
              <div className="row wrap" key={dep.id}>
                <Input aria-label="Dependency name" value={dep.name} placeholder="package-name" onChange={(e) => updateDep(dep.id, { name: e.target.value })} />
                <Input aria-label="Dependency version" className="mono" value={dep.version} placeholder="^1.0.0" onChange={(e) => updateDep(dep.id, { version: e.target.value })} />
                <IconButton title="Remove dependency" onClick={() => setDeps(deps.filter((item) => item.id !== dep.id))}><Trash2 size={14} /></IconButton>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="package.json" actions={
        <div className="row wrap">
          <CopyButton value={json} label="Copy JSON" />
          <Button variant="ghost" icon={<Download size={14} />} onClick={download}>Download</Button>
        </div>
      }>
        <CodeBlock title="package.json" value={json} />
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 6. Vite Config Generator                                                   */
/* -------------------------------------------------------------------------- */

interface ViteOptions {
  framework: 'react' | 'vue' | 'vanilla';
  port: number;
  aliasKey: string;
  aliasPath: string;
  plugins: string;
}

function pluginDefinition(pkg: string): { importLine: string; call: string } {
  const known: Record<string, string> = {
    '@vitejs/plugin-react': 'react',
    '@vitejs/plugin-react-swc': 'react',
    '@vitejs/plugin-vue': 'vue',
  };
  const id = known[pkg]
    || (pkg.split('/').pop() || 'plugin').replace(/^vite-plugin-/, '').replace(/[^a-zA-Z0-9]/g, '')
    || 'plugin';
  return { importLine: `import ${id} from '${pkg}';`, call: `${id}()` };
}

function buildViteConfig(o: ViteOptions): string {
  const packages = o.plugins.trim()
    ? o.plugins.split(',').map((item) => item.trim()).filter(Boolean)
    : o.framework === 'react' ? ['@vitejs/plugin-react'] : o.framework === 'vue' ? ['@vitejs/plugin-vue'] : [];
  const plugins = packages.map(pluginDefinition);
  const key = o.aliasKey.trim();
  const target = o.aliasPath.trim();
  const hasAlias = !!(key && target);
  const port = Math.min(65535, Math.max(1, Math.floor(Number(o.port) || 5173)));

  const lines: string[] = ["import { defineConfig } from 'vite';"];
  plugins.forEach((plugin) => lines.push(plugin.importLine));
  if (hasAlias) lines.push("import path from 'node:path';");
  lines.push('', 'export default defineConfig({');
  if (plugins.length) lines.push(`  plugins: [${plugins.map((plugin) => plugin.call).join(', ')}],`);
  lines.push(`  server: { port: ${port}, open: true },`);
  if (hasAlias) {
    lines.push(
      '  resolve: {',
      '    alias: {',
      `      '${key}': path.resolve(__dirname, '${target}'),`,
      '    },',
      '  },',
    );
  }
  lines.push('});', '');
  return lines.join('\n');
}

export function ViteConfigGeneratorTool() {
  const [options, setOptions] = usePersistedState<ViteOptions>('viteConfigOptions', {
    framework: 'react', port: 5173, aliasKey: '@', aliasPath: './src', plugins: '',
  });
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    try { setCode(buildViteConfig(options)); setError(''); }
    catch (e) { setError(describeError(e)); }
  }, [options]);

  const set = (patch: Partial<ViteOptions>) => setOptions({ ...options, ...patch });
  const download = () => {
    try { downloadText(code, 'vite.config.ts', 'text/plain'); }
    catch (e) { setError(describeError(e)); }
  };

  return (
    <div className="stack">
      <ToolHeader
        title="Vite Config Generator"
        description="Produce a focused vite.config.ts for React, Vue or plain JavaScript projects."
      />
      <Notice>{error}</Notice>

      <Card title="Project setup">
        <div className="stack">
          <div className="grid-2">
            <Field label="Framework">
              <Select value={options.framework} onChange={(e) => set({ framework: e.target.value as ViteOptions['framework'] })}>
                <option value="react">React</option>
                <option value="vue">Vue</option>
                <option value="vanilla">Vanilla</option>
              </Select>
            </Field>
            <Field label="Dev server port">
              <Input type="number" min={1} max={65535} value={options.port} onChange={(e) => set({ port: Number(e.target.value) })} />
            </Field>
          </div>
          <Field label="Plugins" hint="Comma-separated packages. Blank uses the framework default.">
            <Input className="mono" value={options.plugins} onChange={(e) => set({ plugins: e.target.value })} placeholder="@vitejs/plugin-react, vite-plugin-pwa" />
          </Field>
          <div className="divider" />
          <div className="grid-2">
            <Field label="Alias key" hint="Optional import prefix.">
              <Input className="mono" value={options.aliasKey} onChange={(e) => set({ aliasKey: e.target.value })} placeholder="@" />
            </Field>
            <Field label="Alias target" hint="Path relative to the config file.">
              <Input className="mono" value={options.aliasPath} onChange={(e) => set({ aliasPath: e.target.value })} placeholder="./src" />
            </Field>
          </div>
        </div>
      </Card>

      <Card title="vite.config.ts" actions={
        <div className="row wrap">
          <CopyButton value={code} label="Copy config" />
          <Button variant="ghost" icon={<Download size={14} />} onClick={download}>Download</Button>
        </div>
      }>
        <CodeBlock title="vite.config.ts" value={code} />
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 7. .gitignore Generator                                                    */
/* -------------------------------------------------------------------------- */

const GITIGNORE_GROUPS: { key: string; label: string; lines: string[] }[] = [
  { key: 'node', label: 'Node', lines: ['node_modules/', 'npm-debug.log*', 'yarn-error.log*', 'pnpm-debug.log*', '.npm/'] },
  { key: 'react', label: 'React', lines: ['/.cache/', 'build/', '.eslintcache'] },
  { key: 'next', label: 'Next.js', lines: ['.next/', 'out/', 'next-env.d.ts'] },
  { key: 'vue', label: 'Vue', lines: ['.vite/', '.vuepress/dist/', '*.local'] },
  { key: 'vscode', label: 'VS Code', lines: ['.vscode/*', '!.vscode/extensions.json', '!.vscode/settings.json'] },
  { key: 'macos', label: 'macOS', lines: ['.DS_Store', '.AppleDouble', '.LSOverride', '._*'] },
  { key: 'windows', label: 'Windows', lines: ['Thumbs.db', 'ehthumbs.db', 'Desktop.ini', '$RECYCLE.BIN/'] },
  { key: 'env', label: 'Env files', lines: ['.env', '.env.*', '!.env.example'] },
  { key: 'dist', label: 'Build output', lines: ['dist/', 'build/', 'out/', '*.tsbuildinfo'] },
  { key: 'coverage', label: 'Coverage', lines: ['coverage/', '.nyc_output/', '*.lcov'] },
];

function buildGitignore(selected: string[]): string {
  const blocks = GITIGNORE_GROUPS
    .filter((group) => selected.includes(group.key))
    .map((group) => `# ${group.label}\n${group.lines.join('\n')}`);
  return ['# Generated by Frontend Dev Utility', ...blocks].join('\n\n') + '\n';
}

export function GitignoreGeneratorTool() {
  const [selected, setSelected] = usePersistedState<string[]>('gitignorePresets', ['node', 'dist', 'env', 'vscode']);
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    try { setOutput(buildGitignore(selected)); setError(''); }
    catch (e) { setError(describeError(e)); }
  }, [selected]);

  const toggle = (key: string, checked: boolean) => {
    setSelected(checked ? [...selected, key] : selected.filter((item) => item !== key));
  };
  const download = () => {
    try { downloadText(output, '.gitignore'); }
    catch (e) { setError(describeError(e)); }
  };

  return (
    <div className="stack">
      <ToolHeader
        title=".gitignore Generator"
        description="Pick the stacks and operating systems you use, then copy a tidy ignore file."
        badge={`${selected.length} presets`}
        actions={<Button variant="ghost" onClick={() => setSelected([])}>Clear all</Button>}
      />
      <Notice>{error}</Notice>

      <Card title="Presets">
        <div className="grid-2">
          {GITIGNORE_GROUPS.map((group) => (
            <Toggle
              key={group.key}
              checked={selected.includes(group.key)}
              onChange={(checked) => toggle(group.key, checked)}
              label={group.label}
              hint={group.lines.slice(0, 2).join(', ')}
            />
          ))}
        </div>
      </Card>

      <Card title=".gitignore" actions={
        <div className="row wrap">
          <CopyButton value={output} label="Copy .gitignore" />
          <Button variant="ghost" icon={<Download size={14} />} onClick={download}>Download</Button>
        </div>
      }>
        {selected.length === 0 ? (
          <EmptyState>Select at least one preset to build an ignore file.</EmptyState>
        ) : (
          <CodeBlock title=".gitignore" value={output} />
        )}
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 8. Env Template                                                            */
/* -------------------------------------------------------------------------- */

interface EnvRow { id: string; key: string; value: string; note: string }

const DEFAULT_ENV_ROWS: EnvRow[] = [
  { id: 'env-1', key: 'API_URL', value: 'http://localhost:3000', note: 'Base URL for the API' },
  { id: 'env-2', key: 'API_KEY', value: '', note: 'Never commit a real secret' },
  { id: 'env-3', key: 'DEBUG', value: 'false', note: 'Enable verbose logging' },
];

function buildEnv(rows: EnvRow[]): string {
  const blocks = rows.map((row) => {
    const note = row.note.trim();
    const key = row.key.trim();
    if (!key) return note ? `# ${note}` : '';
    const safeKey = key.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase();
    return `${note ? `# ${note}\n` : ''}${safeKey}=${row.value}`;
  }).filter((block) => block.length > 0);
  return blocks.length ? blocks.join('\n\n') + '\n' : '';
}

export function EnvTemplateTool() {
  const [rows, setRows] = usePersistedState<EnvRow[]>('envTemplateRows', DEFAULT_ENV_ROWS);
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    try { setOutput(buildEnv(rows)); setError(''); }
    catch (e) { setError(describeError(e)); }
  }, [rows]);

  const update = (id: string, patch: Partial<EnvRow>) => {
    setRows(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };
  const download = () => {
    try { downloadText(output, '.env.example'); }
    catch (e) { setError(describeError(e)); }
  };

  return (
    <div className="stack">
      <ToolHeader
        title="Env Template"
        description="Document environment variables as a commented .env.example you can safely commit."
      />
      <Notice>{error}</Notice>

      <Card title="Variables" actions={
        <Button icon={<Plus size={14} />} onClick={() => setRows([...rows, { id: uid('env'), key: '', value: '', note: '' }])}>Add row</Button>
      }>
        {rows.length === 0 ? (
          <EmptyState>No rows yet. Add one to start your template.</EmptyState>
        ) : (
          <div className="stack">
            <div className="row muted mono"><span style={{ width: 100 }}>KEY</span><span style={{ width: 140 }}>VALUE</span><span>COMMENT</span></div>
            {rows.map((row) => (
              <div className="row wrap" key={row.id}>
                <Input aria-label="Environment key" style={{ width: 100 }} value={row.key} placeholder="KEY" onChange={(e) => update(row.id, { key: e.target.value })} />
                <Input aria-label="Environment value" style={{ width: 140 }} value={row.value} placeholder="value" onChange={(e) => update(row.id, { value: e.target.value })} />
                <Input aria-label="Environment comment" className="grow" value={row.note} placeholder="What is this for?" onChange={(e) => update(row.id, { note: e.target.value })} />
                <IconButton title="Remove row" onClick={() => setRows(rows.filter((item) => item.id !== row.id))}><Trash2 size={14} /></IconButton>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title=".env.example" actions={
        <div className="row wrap">
          <CopyButton value={output} label="Copy template" />
          <Button variant="ghost" icon={<Download size={14} />} onClick={download}>Download</Button>
        </div>
      }>
        <CodeBlock title=".env.example" value={output} />
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 9. Tailwind Reference                                                      */
/* -------------------------------------------------------------------------- */

const TAILWIND_GROUPS: { name: string; items: { cls: string; desc: string }[] }[] = [
  { name: 'Layout', items: [
    { cls: 'block', desc: 'Display as block' }, { cls: 'inline-block', desc: 'Inline block box' },
    { cls: 'inline', desc: 'Inline box' }, { cls: 'flex', desc: 'Flex container' },
    { cls: 'grid', desc: 'Grid container' }, { cls: 'hidden', desc: 'display: none' },
    { cls: 'container', desc: 'Centered max-width wrapper' }, { cls: 'relative', desc: 'Relative positioning' },
    { cls: 'absolute', desc: 'Absolute positioning' }, { cls: 'fixed', desc: 'Fixed positioning' },
    { cls: 'sticky', desc: 'Sticky positioning' }, { cls: 'inset-0', desc: 'All offsets zero' },
    { cls: 'z-10', desc: 'Stacking order 10' }, { cls: 'overflow-hidden', desc: 'Clip overflowing content' },
  ] },
  { name: 'Flexbox', items: [
    { cls: 'flex-row', desc: 'Main axis left to right' }, { cls: 'flex-col', desc: 'Main axis top to bottom' },
    { cls: 'flex-wrap', desc: 'Allow items to wrap' }, { cls: 'flex-1', desc: 'Grow and shrink to fill' },
    { cls: 'items-center', desc: 'Align on cross axis' }, { cls: 'items-start', desc: 'Align to cross start' },
    { cls: 'justify-center', desc: 'Center on main axis' }, { cls: 'justify-between', desc: 'Space between items' },
    { cls: 'self-center', desc: 'Align a single item' }, { cls: 'gap-4', desc: 'Gap between items' },
    { cls: 'order-first', desc: 'First in visual order' },
  ] },
  { name: 'Spacing', items: [
    { cls: 'p-4', desc: 'Padding on all sides' }, { cls: 'px-4', desc: 'Horizontal padding' },
    { cls: 'py-2', desc: 'Vertical padding' }, { cls: 'm-4', desc: 'Margin on all sides' },
    { cls: 'mx-auto', desc: 'Centered horizontally' }, { cls: 'mt-2', desc: 'Top margin' },
    { cls: 'mb-4', desc: 'Bottom margin' }, { cls: 'space-x-4', desc: 'Space between siblings (x)' },
    { cls: 'space-y-2', desc: 'Space between siblings (y)' }, { cls: 'w-full', desc: 'Full width' },
    { cls: 'h-full', desc: 'Full height' }, { cls: 'max-w-md', desc: 'Maximum medium width' },
  ] },
  { name: 'Typography', items: [
    { cls: 'text-sm', desc: 'Small text size' }, { cls: 'text-lg', desc: 'Large text size' },
    { cls: 'text-xl', desc: 'Extra large text' }, { cls: 'font-bold', desc: 'Bold weight' },
    { cls: 'font-medium', desc: 'Medium weight' }, { cls: 'text-center', desc: 'Centered text' },
    { cls: 'text-left', desc: 'Left aligned text' }, { cls: 'underline', desc: 'Underlined text' },
    { cls: 'uppercase', desc: 'Uppercase transform' }, { cls: 'italic', desc: 'Italic style' },
    { cls: 'tracking-wide', desc: 'Letter spacing' }, { cls: 'leading-relaxed', desc: 'Line height' },
  ] },
  { name: 'Colors', items: [
    { cls: 'text-white', desc: 'White text' }, { cls: 'text-slate-500', desc: 'Slate 500 text' },
    { cls: 'text-blue-600', desc: 'Blue 600 text' }, { cls: 'bg-blue-500', desc: 'Blue 500 background' },
    { cls: 'bg-slate-900', desc: 'Dark background' }, { cls: 'bg-transparent', desc: 'No background' },
    { cls: 'bg-red-500', desc: 'Red 500 background' }, { cls: 'fill-current', desc: 'SVG fill from color' },
    { cls: 'stroke-current', desc: 'SVG stroke from color' }, { cls: 'placeholder-gray-400', desc: 'Placeholder color' },
  ] },
  { name: 'Borders', items: [
    { cls: 'border', desc: '1px border on all sides' }, { cls: 'border-2', desc: '2px border' },
    { cls: 'border-0', desc: 'Remove borders' }, { cls: 'border-gray-300', desc: 'Border color' },
    { cls: 'border-dashed', desc: 'Dashed border style' }, { cls: 'rounded', desc: 'Small corner radius' },
    { cls: 'rounded-lg', desc: 'Large corner radius' }, { cls: 'rounded-full', desc: 'Pill or circle' },
    { cls: 'divide-y', desc: 'Dividers between children' }, { cls: 'ring-2', desc: 'Focus ring' },
    { cls: 'shadow-md', desc: 'Medium box shadow' },
  ] },
];

export function TailwindReferenceTool() {
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState('');
  const { error, notice, copy } = useCopyNotice();

  const groups = useMemo(() => {
    const query = search.trim().toLowerCase();
    return TAILWIND_GROUPS
      .map((group) => ({
        name: group.name,
        items: group.items.filter((item) => !query
          || item.cls.toLowerCase().includes(query)
          || item.desc.toLowerCase().includes(query)),
      }))
      .filter((group) => group.items.length > 0);
  }, [search]);
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);

  const copyClass = async (cls: string) => {
    await copy(cls, `Copied “${cls}”.`);
    setCopied(cls);
  };

  return (
    <div className="stack">
      <ToolHeader
        title="Tailwind Reference"
        description="A compact cheat sheet of common utility classes. Click any class to copy it."
        badge={`${total} classes`}
      />
      <Notice>{error}</Notice>
      <Notice tone="success">{notice}</Notice>

      <Card title="Search utilities">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Try flex, rounded, text-sm…" />
      </Card>

      {total === 0 ? (
        <EmptyState>No utility classes match “{search}”.</EmptyState>
      ) : groups.map((group) => (
        <Card key={group.name} title={group.name} actions={<Badge>{group.items.length}</Badge>}>
          <div className="result-list">
            {group.items.map((item) => (
              <ListItem
                key={item.cls}
                title={<span className="mono">{item.cls}</span>}
                subtitle={truncate(item.desc, 70)}
                selected={copied === item.cls}
                onClick={() => void copyClass(item.cls)}
                right={<Badge>Click to copy</Badge>}
              />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 10. Design Token Generator                                                 */
/* -------------------------------------------------------------------------- */

interface TokenOptions { color: string; count: number; spacing: number }
interface TokenData {
  css: string;
  json: string;
  shades: { name: string; hex: string }[];
  spaces: { name: string; value: string }[];
}

function mix(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }, amount: number) {
  return {
    r: Math.round(a.r + (b.r - a.r) * amount),
    g: Math.round(a.g + (b.g - a.g) * amount),
    b: Math.round(a.b + (b.b - a.b) * amount),
  };
}

function buildTokens(o: TokenOptions): TokenData {
  const parsed = parseColor(o.color);
  const base = parsed ? { r: parsed.r, g: parsed.g, b: parsed.b } : { r: 79, g: 70, b: 229 };
  const count = Math.min(12, Math.max(2, Math.floor(Number(o.count) || 5)));
  const spacing = Math.min(64, Math.max(1, Math.floor(Number(o.spacing) || 4)));

  const shades = Array.from({ length: count }, (_, index) => {
    const position = count === 1 ? 0.5 : index / (count - 1);
    const amount = Math.abs(position - 0.5) * 2 * 0.85;
    const target = position < 0.5 ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };
    const result = mix(base, target, amount);
    return { name: `brand-${(index + 1) * 100}`, hex: rgbToHex(result.r, result.g, result.b) };
  });
  const spaces = Array.from({ length: 8 }, (_, index) => ({
    name: `space-${index + 1}`,
    value: `${spacing * (index + 1)}px`,
  }));

  const css = `:root {\n${shades.map((shade) => `  --color-${shade.name}: ${shade.hex};`).join('\n')}\n\n`
    + `${spaces.map((space) => `  --${space.name}: ${space.value};`).join('\n')}\n}\n`;
  const json = safeJson({
    color: Object.fromEntries(shades.map((shade) => [shade.name, shade.hex])),
    spacing: Object.fromEntries(spaces.map((space) => [space.name.replace('space-', ''), space.value])),
  });
  return { css, json, shades, spaces };
}

export function DesignTokenGeneratorTool() {
  const [options, setOptions] = usePersistedState<TokenOptions>('designTokenOptions', {
    color: '#4f46e5', count: 5, spacing: 4,
  });
  const [tab, setTab] = useState<'css' | 'json'>('css');
  const [downloadError, setDownloadError] = useState('');
  const built = useMemo(() => {
    try { return { data: buildTokens(options), error: '' }; }
    catch (e) { return { data: null, error: describeError(e) }; }
  }, [options]);
  const set = (patch: Partial<TokenOptions>) => setOptions({ ...options, ...patch });
  const output = built.data ? (tab === 'css' ? built.data.css : built.data.json) : '';
  const download = () => {
    try { downloadText(output, tab === 'css' ? 'tokens.css' : 'tokens.json'); setDownloadError(''); }
    catch (e) { setDownloadError(describeError(e)); }
  };

  return (
    <div className="stack">
      <ToolHeader
        title="Design Token Generator"
        description="Derive a color scale and spacing ramp, then export them as CSS variables or JSON tokens."
      />
      <Notice>{built.error}</Notice>
      <Notice>{downloadError}</Notice>

      <Card title="Token basis">
        <div className="grid-3">
          <Field label="Base color" hint="Any CSS color value">
            <Input className="mono" value={options.color} onChange={(e) => set({ color: e.target.value })} placeholder="#4f46e5" />
          </Field>
          <Field label="Shade count" hint="2–12 shades">
            <Input type="number" min={2} max={12} value={options.count} onChange={(e) => set({ count: Number(e.target.value) })} />
          </Field>
          <Field label="Spacing base (px)" hint="Multiplied by 1–8">
            <Input type="number" min={1} max={64} value={options.spacing} onChange={(e) => set({ spacing: Number(e.target.value) })} />
          </Field>
        </div>
      </Card>

      {built.data && (
        <>
          <Card title="Color shades">
            <div className="swatch-grid">
              {built.data.shades.map((shade) => (
                <div key={shade.name} className="stack" style={{ alignItems: 'center', gap: 4 }}>
                  <Swatch color={shade.hex} size={40} title={shade.hex} />
                  <span className="mono muted" style={{ fontSize: 10 }}>{shade.name}</span>
                </div>
              ))}
            </div>
            <div className="row wrap" style={{ marginTop: 10 }}>
              {built.data.shades.map((shade) => (
                <button key={shade.name} className="chip mono" type="button" onClick={() => void copyText(shade.hex)} title="Copy hex">
                  {shade.hex}
                </button>
              ))}
            </div>
          </Card>

          <Card title="Spacing scale">
            <div className="row wrap">
              {built.data.spaces.map((space) => (
                <Badge key={space.name} tone="accent">{space.name}: {space.value}</Badge>
              ))}
            </div>
          </Card>

          <Card title="Output" actions={
            <div className="row wrap">
              <CopyButton value={output} label="Copy output" />
              <Button variant="ghost" icon={<Download size={14} />} onClick={download}>Download</Button>
            </div>
          }>
            <Tabs tabs={[{ id: 'css', label: 'CSS variables' }, { id: 'json', label: 'JSON tokens' }]} active={tab} onChange={setTab} />
            <CodeBlock title={tab === 'css' ? 'tokens.css' : 'tokens.json'} value={output} />
          </Card>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 11. SVG Placeholder                                                        */
/* -------------------------------------------------------------------------- */

interface SvgOptions {
  width: number;
  height: number;
  background: string;
  textColor: string;
  label: string;
}

function buildSvg(o: SvgOptions): string {
  const width = Math.min(4000, Math.max(1, Math.floor(Number(o.width) || 1)));
  const height = Math.min(4000, Math.max(1, Math.floor(Number(o.height) || 1)));
  const bg = hexToRgb(o.background) || { r: 15, g: 23, b: 42 };
  const fg = hexToRgb(o.textColor) || { r: 255, g: 255, b: 255 };
  const background = rgbToHex(bg.r, bg.g, bg.b);
  const foreground = rgbToHex(fg.r, fg.g, fg.b);
  const fontSize = Math.max(10, Math.min(width / 8, height / 4));
  const label = escapeHtml(o.label.trim() || `${width} × ${height}`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${background}"/>
  <text x="${width / 2}" y="${height / 2}" fill="${foreground}" font-family="system-ui, sans-serif" font-size="${fontSize}" font-weight="600" text-anchor="middle" dominant-baseline="middle">${label}</text>
</svg>`;
}

export function SvgPlaceholderTool() {
  const [options, setOptions] = usePersistedState<SvgOptions>('svgPlaceholderOptions', {
    width: 600, height: 400, background: '#1e293b', textColor: '#e2e8f0', label: 'Your image here',
  });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const built = useMemo(() => {
    try {
      const svg = buildSvg(options);
      return { svg, uri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, error: '' };
    } catch (e) { return { svg: '', uri: '', error: describeError(e) }; }
  }, [options]);
  const set = (patch: Partial<SvgOptions>) => setOptions({ ...options, ...patch });

  const copy = async (value: string, label: string) => {
    try {
      const ok = await copyText(value);
      if (!ok) { setError('Clipboard permission denied.'); return; }
      setNotice(label);
      setError('');
    } catch (e) { setError(describeError(e)); }
  };
  const download = () => {
    try {
      downloadText(built.svg, timestampName('placeholder', 'svg'), 'image/svg+xml');
      setNotice('Downloaded placeholder.svg');
      setError('');
    } catch (e) { setError(describeError(e)); }
  };

  return (
    <div className="stack">
      <ToolHeader
        title="SVG Placeholder"
        description="Generate a self-contained SVG placeholder plus a data URI, with a live preview."
      />
      <Notice>{error}</Notice>
      <Notice>{built.error}</Notice>
      <Notice tone="success">{notice}</Notice>

      <Card title="Image options">
        <div className="stack">
          <div className="grid-2">
            <Field label="Width (px)">
              <Input type="number" min={1} max={4000} value={options.width} onChange={(e) => set({ width: Number(e.target.value) })} />
            </Field>
            <Field label="Height (px)">
              <Input type="number" min={1} max={4000} value={options.height} onChange={(e) => set({ height: Number(e.target.value) })} />
            </Field>
          </div>
          <div className="grid-2">
            <Field label="Background">
              <div className="row">
                <Swatch color={hexToRgb(options.background) ? options.background : '#1e293b'} size={30} />
                <Input className="mono" value={options.background} onChange={(e) => set({ background: e.target.value })} placeholder="#1e293b" />
              </div>
            </Field>
            <Field label="Text color">
              <div className="row">
                <Swatch color={hexToRgb(options.textColor) ? options.textColor : '#e2e8f0'} size={30} />
                <Input className="mono" value={options.textColor} onChange={(e) => set({ textColor: e.target.value })} placeholder="#e2e8f0" />
              </div>
            </Field>
          </div>
          <Field label="Label">
            <Input value={options.label} onChange={(e) => set({ label: e.target.value })} placeholder="Your image here" />
          </Field>
        </div>
      </Card>

      <Card title="Preview">
        <div className="stack">
          <div className="preview-box" style={{ display: 'flex', justifyContent: 'center' }}>
            <img src={built.uri} alt="SVG placeholder preview" style={{ maxWidth: '100%', maxHeight: 240, display: 'block' }} />
          </div>
          <div className="row wrap">
            <CopyButton value={built.svg} label="Copy SVG" />
            <Button variant="ghost" icon={<Copy size={14} />} onClick={() => void copy(built.uri, 'Copied data URI.')}>Copy data URI</Button>
            <Button variant="ghost" icon={<Download size={14} />} onClick={download}>Download SVG</Button>
          </div>
          <CodeBlock title="Inline SVG" value={built.svg} maxHeight={160} />
          <div className="mono muted" style={{ wordBreak: 'break-all', fontSize: 11 }}>{built.uri}</div>
        </div>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 13. JSON Schema                                                            */
/* -------------------------------------------------------------------------- */

type Schema = Record<string, unknown>;

function inferSchema(value: unknown): Schema {
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) {
    if (!value.length) return { type: 'array', items: {} };
    const items = value.map(inferSchema) as Schema[];
    if (items.every((item) => item.type === 'object')) {
      const properties: Record<string, unknown> = {};
      let required: string[] | null = null;
      items.forEach((item) => {
        Object.assign(properties, (item.properties || {}) as Record<string, unknown>);
        const childRequired = (item.required || []) as string[];
        required = required === null ? [...childRequired] : required.filter((key) => childRequired.includes(key));
      });
      return {
        type: 'array',
        items: { type: 'object', properties, required: required || [], additionalProperties: false },
      };
    }
    return { type: 'array', items: items[0] };
  }
  switch (typeof value) {
    case 'string': return { type: 'string' };
    case 'number': return { type: Number.isInteger(value) ? 'integer' : 'number' };
    case 'boolean': return { type: 'boolean' };
    case 'object': {
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
        properties[key] = inferSchema(child);
        if (child !== undefined) required.push(key);
      });
      return { type: 'object', properties, required, additionalProperties: false };
    }
    default: return {};
  }
}

const SCHEMA_SAMPLE = `{
  "id": 1,
  "name": "Ada",
  "active": true,
  "profile": { "city": "London", "score": 9.5 },
  "tags": ["react", "typescript"]
}`;

export function JsonSchemaTool() {
  const [input, setInput] = usePersistedState<string>('jsonSchemaInput', SCHEMA_SAMPLE);
  const [schema, setSchema] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const infer = () => {
    try {
      const parsed: unknown = JSON.parse(input);
      if (parsed === null || typeof parsed !== 'object') {
        setError('Paste a JSON object or array at the root.');
        setNotice('');
        return;
      }
      const result = inferSchema(parsed);
      setSchema(safeJson(result));
      setNotice('Schema inferred from your JSON.');
      setError('');
    } catch (e) { setError(describeError(e)); setNotice(''); }
  };

  useEffect(() => { infer(); }, [input]);

  const download = () => {
    try { downloadText(schema, 'schema.json', 'application/json'); }
    catch (e) { setError(describeError(e)); }
  };

  return (
    <div className="stack">
      <ToolHeader
        title="JSON Schema Generator"
        description="Infer a simple draft-style schema with nested objects, array items and required fields."
      />
      <Notice>{error}</Notice>
      <Notice tone="success">{notice}</Notice>

      <Card title="Sample JSON" actions={
        <div className="row wrap">
          <Button variant="primary" onClick={infer} disabled={!input.trim()}>Infer schema</Button>
          <Button variant="ghost" onClick={() => setInput(SCHEMA_SAMPLE)}>Load sample</Button>
        </div>
      }>
        <Textarea rows={12} className="mono" value={input} onChange={(e) => setInput(e.target.value)} spellCheck={false} placeholder='{ "key": "value" }' />
      </Card>

      <Card title="Inferred schema" actions={
        <div className="row wrap">
          <CopyButton value={schema} label="Copy schema" />
          <Button variant="ghost" icon={<Download size={14} />} onClick={download}>Download</Button>
        </div>
      }>
        {schema ? <CodeBlock title="schema.json" value={schema} /> : <EmptyState>Paste valid JSON and press Infer schema.</EmptyState>}
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 14. Color Names                                                            */
/* -------------------------------------------------------------------------- */

const NAMED_COLORS: { name: string; hex: string; type: 'basic' | 'gray' | 'extended' }[] = [
  { name: 'red', hex: '#ff0000', type: 'basic' }, { name: 'lime', hex: '#00ff00', type: 'basic' },
  { name: 'blue', hex: '#0000ff', type: 'basic' }, { name: 'yellow', hex: '#ffff00', type: 'basic' },
  { name: 'cyan', hex: '#00ffff', type: 'basic' }, { name: 'magenta', hex: '#ff00ff', type: 'basic' },
  { name: 'white', hex: '#ffffff', type: 'basic' }, { name: 'black', hex: '#000000', type: 'basic' },
  { name: 'maroon', hex: '#800000', type: 'basic' }, { name: 'olive', hex: '#808000', type: 'basic' },
  { name: 'green', hex: '#008000', type: 'basic' }, { name: 'purple', hex: '#800080', type: 'basic' },
  { name: 'teal', hex: '#008080', type: 'basic' }, { name: 'navy', hex: '#000080', type: 'basic' },
  { name: 'silver', hex: '#c0c0c0', type: 'gray' }, { name: 'gray', hex: '#808080', type: 'gray' },
  { name: 'darkgray', hex: '#a9a9a9', type: 'gray' }, { name: 'dimgray', hex: '#696969', type: 'gray' },
  { name: 'lightgray', hex: '#d3d3d3', type: 'gray' }, { name: 'slategray', hex: '#708090', type: 'gray' },
  { name: 'darkslategray', hex: '#2f4f4f', type: 'gray' }, { name: 'lightslategray', hex: '#778899', type: 'gray' },
  { name: 'whitesmoke', hex: '#f5f5f5', type: 'gray' }, { name: 'gainsboro', hex: '#dcdcdc', type: 'gray' },
  { name: 'orange', hex: '#ffa500', type: 'extended' }, { name: 'pink', hex: '#ffc0cb', type: 'extended' },
  { name: 'brown', hex: '#a52a2a', type: 'extended' }, { name: 'gold', hex: '#ffd700', type: 'extended' },
  { name: 'violet', hex: '#ee82ee', type: 'extended' }, { name: 'indigo', hex: '#4b0082', type: 'extended' },
  { name: 'turquoise', hex: '#40e0d0', type: 'extended' }, { name: 'coral', hex: '#ff7f50', type: 'extended' },
  { name: 'crimson', hex: '#dc143c', type: 'extended' }, { name: 'tomato', hex: '#ff6347', type: 'extended' },
  { name: 'salmon', hex: '#fa8072', type: 'extended' }, { name: 'khaki', hex: '#f0e68c', type: 'extended' },
  { name: 'beige', hex: '#f5f5dc', type: 'extended' }, { name: 'ivory', hex: '#fffff0', type: 'extended' },
  { name: 'lavender', hex: '#e6e6fa', type: 'extended' }, { name: 'plum', hex: '#dda0dd', type: 'extended' },
  { name: 'orchid', hex: '#da70d6', type: 'extended' }, { name: 'chartreuse', hex: '#7fff00', type: 'extended' },
  { name: 'springgreen', hex: '#00ff7f', type: 'extended' }, { name: 'aquamarine', hex: '#7fffd4', type: 'extended' },
  { name: 'skyblue', hex: '#87ceeb', type: 'extended' }, { name: 'steelblue', hex: '#4682b4', type: 'extended' },
  { name: 'midnightblue', hex: '#191970', type: 'extended' }, { name: 'seagreen', hex: '#2e8b57', type: 'extended' },
  { name: 'forestgreen', hex: '#228b22', type: 'extended' }, { name: 'sienna', hex: '#a0522d', type: 'extended' },
  { name: 'saddlebrown', hex: '#8b4513', type: 'extended' }, { name: 'peru', hex: '#cd853f', type: 'extended' },
  { name: 'tan', hex: '#d2b48c', type: 'extended' }, { name: 'deeppink', hex: '#ff1493', type: 'extended' },
  { name: 'hotpink', hex: '#ff69b4', type: 'extended' }, { name: 'lightblue', hex: '#add8e6', type: 'extended' },
  { name: 'mintcream', hex: '#f5fffa', type: 'extended' }, { name: 'honeydew', hex: '#f0fff0', type: 'extended' },
];

export function ColorNamesTool() {
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState('');
  const { error, notice, copy } = useCopyNotice();

  const colors = useMemo(() => {
    const query = search.trim().toLowerCase();
    return NAMED_COLORS.filter((color) => !query
      || color.name.includes(query)
      || color.hex.includes(query)
      || color.type.includes(query));
  }, [search]);

  const copyHex = async (hex: string) => {
    await copy(hex, `Copied ${hex}.`);
    setCopied(hex);
  };

  return (
    <div className="stack">
      <ToolHeader
        title="CSS Color Names"
        description="Browse common named colors with their hex values. Click a row to copy the hex."
        badge={`${colors.length} colors`}
      />
      <Notice>{error}</Notice>
      <Notice tone="success">{notice}</Notice>

      <Card title="Search colors">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Try blue, #ff, gray…" />
      </Card>

      <Card title="Named colors">
        {colors.length === 0 ? (
          <EmptyState>No colors match “{search}”.</EmptyState>
        ) : (
          <div className="result-list">
            {colors.map((color) => (
              <ListItem
                key={color.name}
                title={
                  <span className="row">
                    <Swatch color={color.hex} size={20} title={color.hex} />
                    <span>{color.name}</span>
                  </span>
                }
                subtitle={<span className="mono muted">{color.hex} · {color.type}</span>}
                selected={copied === color.hex}
                onClick={() => void copyHex(color.hex)}
                right={<Badge tone={copied === color.hex ? 'success' : color.type === 'basic' ? 'accent' : color.type === 'gray' ? 'default' : 'success'}>{copied === color.hex ? 'Copied' : color.type}</Badge>}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 15. Regex Cheatsheet                                                       */
/* -------------------------------------------------------------------------- */

const REGEX_GROUPS: { name: string; items: { token: string; desc: string; example: string }[] }[] = [
  { name: 'Anchors', items: [
    { token: '^', desc: 'Start of string or line', example: '^Hello' },
    { token: '$', desc: 'End of string or line', example: 'world$' },
    { token: '\\b', desc: 'Word boundary', example: '\\bcat\\b' },
    { token: '\\B', desc: 'Not a word boundary', example: '\\Bcat' },
  ] },
  { name: 'Quantifiers', items: [
    { token: '*', desc: 'Zero or more times', example: 'ab*c' },
    { token: '+', desc: 'One or more times', example: 'ab+c' },
    { token: '?', desc: 'Zero or one time', example: 'ab?c' },
    { token: '{n}', desc: 'Exactly n times', example: '\\d{4}' },
    { token: '{n,}', desc: 'At least n times', example: '\\d{2,}' },
    { token: '{n,m}', desc: 'Between n and m times', example: '\\d{2,4}' },
    { token: '*?', desc: 'Lazy zero or more', example: '<.*?>' },
  ] },
  { name: 'Character classes', items: [
    { token: '.', desc: 'Any character except newline', example: 'a.c' },
    { token: '\\d', desc: 'Digit 0–9', example: '\\d+' },
    { token: '\\D', desc: 'Anything but a digit', example: '\\D+' },
    { token: '\\w', desc: 'Word character', example: '\\w+' },
    { token: '\\W', desc: 'Non-word character', example: '\\W+' },
    { token: '\\s', desc: 'Whitespace character', example: '\\s+' },
    { token: '\\S', desc: 'Non-whitespace character', example: '\\S+' },
    { token: '[abc]', desc: 'Any listed character', example: '[abc]+' },
    { token: '[^abc]', desc: 'None of the listed characters', example: '[^abc]+' },
    { token: '[a-z]', desc: 'Any character in the range', example: '[a-z]+' },
  ] },
  { name: 'Groups', items: [
    { token: '(...)', desc: 'Capturing group', example: '(\\d+)-(\\d+)' },
    { token: '(?:...)', desc: 'Non-capturing group', example: '(?:ab)+' },
    { token: '(?<name>...)', desc: 'Named capturing group', example: '(?<year>\\d{4})' },
    { token: 'a|b', desc: 'Alternation', example: 'cat|dog' },
    { token: '\\1', desc: 'Backreference to group 1', example: '(\\w)\\1' },
  ] },
  { name: 'Lookarounds', items: [
    { token: '(?=...)', desc: 'Positive lookahead', example: '\\d+(?=px)' },
    { token: '(?!...)', desc: 'Negative lookahead', example: '\\d+(?!px)' },
    { token: '(?<=...)', desc: 'Positive lookbehind', example: '(?<=\\$)\\d+' },
    { token: '(?<!...)', desc: 'Negative lookbehind', example: '(?<!\\$)\\d+' },
  ] },
  { name: 'Flags', items: [
    { token: 'g', desc: 'Global — find every match', example: '/cat/g' },
    { token: 'i', desc: 'Case-insensitive matching', example: '/cat/i' },
    { token: 'm', desc: 'Multiline ^ and $', example: '/^x/m' },
    { token: 's', desc: 'Dot matches newlines', example: '/a.b/s' },
    { token: 'u', desc: 'Unicode mode', example: '/\\p{L}/u' },
    { token: 'y', desc: 'Sticky from lastIndex', example: '/a/y' },
  ] },
];

export function RegexCheatsheetTool() {
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState('');
  const { error, notice, copy } = useCopyNotice();

  const groups = useMemo(() => {
    const query = search.trim().toLowerCase();
    return REGEX_GROUPS
      .map((group) => ({
        name: group.name,
        items: group.items.filter((item) => !query
          || item.token.toLowerCase().includes(query)
          || item.desc.toLowerCase().includes(query)
          || item.example.toLowerCase().includes(query)),
      }))
      .filter((group) => group.items.length > 0);
  }, [search]);
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);

  const copyToken = async (token: string) => {
    await copy(token, `Copied “${token}”.`);
    setCopied(token);
  };

  return (
    <div className="stack">
      <ToolHeader
        title="Regex Cheatsheet"
        description="Look up anchors, quantifiers, classes, groups, lookarounds and flags. Click to copy."
        badge={`${total} tokens`}
      />
      <Notice>{error}</Notice>
      <Notice tone="success">{notice}</Notice>

      <Card title="Search tokens">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Try lookahead, \\d, global…" />
      </Card>

      {total === 0 ? (
        <EmptyState>No regex tokens match “{search}”.</EmptyState>
      ) : groups.map((group) => (
        <Card key={group.name} title={group.name} actions={<Badge>{group.items.length}</Badge>}>
          <div className="result-list">
            {group.items.map((item) => (
              <ListItem
                key={`${group.name}-${item.token}`}
                title={<span className="mono">{item.token}</span>}
                subtitle={`${item.desc} · e.g. ${item.example}`}
                selected={copied === item.token}
                onClick={() => void copyToken(item.token)}
                right={<Badge>Click to copy</Badge>}
              />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
