import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, Card, Field, Input, Notice, Select, Toggle, ToolHeader } from '../components/ui';
import { TOOLS } from '../lib/catalog';
import { getLocal, getSetting, setLocal, setSetting } from '../lib/storage';
import '../app/styles.css';

const ACCENTS = ['#38bdf8', '#818cf8', '#a78bfa', '#f472b6', '#4ade80', '#fbbf24', '#fb7185', '#22d3ee'];

function OptionsPage() {
  const [accent, setAccent] = useState('#38bdf8');
  const [defaultTool, setDefaultTool] = useState('color-picker');
  const [keepCss, setKeepCss] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    (async () => {
      setAccent(await getSetting('accent', '#38bdf8'));
      setDefaultTool(await getSetting('lastTool', 'color-picker'));
      setKeepCss(await getSetting('keepCss', false));
      setFavorites(await getLocal<string[]>('favorites', []));
    })();
  }, []);

  useEffect(() => { document.documentElement.style.setProperty('--accent', accent); }, [accent]);

  const flash = (message: string) => { setNotice(message); setTimeout(() => setNotice(''), 1800); };

  return (
    <div className="options-page stack">
      <ToolHeader title="Dev Utility Settings" description="Preferences are stored locally in your browser." />
      <Notice tone="info">{notice}</Notice>

      <Card title="Appearance">
        <Field label="Accent color">
          <div className="row wrap">
            {ACCENTS.map((color) => (
              <button
                key={color}
                title={color}
                onClick={async () => { setAccent(color); await setSetting('accent', color); flash('Accent updated'); }}
                style={{ width: 30, height: 30, borderRadius: 8, border: accent === color ? '2px solid #fff' : '1px solid #334155', background: color }}
              />
            ))}
          </div>
        </Field>
      </Card>

      <Card title="Behavior">
        <Field label="Default tool" hint="Opened when the extension starts">
          <Select value={defaultTool} onChange={(e) => { setDefaultTool(e.target.value); setSetting('lastTool', e.target.value); }}>
            {TOOLS.map((tool) => <option key={tool.id} value={tool.id}>{tool.name}</option>)}
          </Select>
        </Field>
        <Toggle
          checked={keepCss}
          label="Keep injected CSS after closing the tool"
          hint="Applies to the Live CSS Editor. Off by default so pages are never left modified."
          onChange={async (value) => { setKeepCss(value); await setSetting('keepCss', value); }}
        />
      </Card>

      <Card title="Favorites" actions={<Button variant="ghost" onClick={async () => { await setLocal('favorites', []); setFavorites([]); flash('Favorites cleared'); }}>Clear all</Button>}>
        {favorites.length ? (
          <div className="row wrap">
            {favorites.map((id) => {
              const tool = TOOLS.find((item) => item.id === id);
              return <span className="chip" key={id}>{tool?.name || id}</span>;
            })}
          </div>
        ) : <p className="muted">Star tools in the sidebar to pin them here.</p>}
      </Card>

      <Card title="Keyboard shortcuts">
        <div className="stack">
          <div className="row"><span className="chip mono">Ctrl/⌘ + Shift + U</span><span>Open the tool panel</span></div>
          <div className="row"><span className="chip mono">Ctrl/⌘ + Shift + S</span><span>Capture a screenshot</span></div>
          <div className="row"><span className="chip mono">Ctrl/⌘ + Shift + C</span><span>Open the color picker</span></div>
          <div className="row"><span className="chip mono">/</span><span>Search tools while the panel is open</span></div>
          <p className="muted">Shortcuts can be changed at chrome://extensions/shortcuts.</p>
        </div>
      </Card>

      <Card title="Data">
        <Button variant="danger" onClick={async () => {
          await chrome.storage.local.clear();
          setFavorites([]);
          flash('Local data cleared (history, snippets, saved styles).');
        }}>Clear local data</Button>
        <p className="muted">This removes saved colors, fonts, snippets, CSS styles, and environments. Settings in sync storage are kept.</p>
      </Card>

      <Card title="About">
        <p className="muted">Frontend Dev Utility v1.0 · {TOOLS.length} tools · Runs entirely in your browser. No analytics, no remote code, no accounts.</p>
      </Card>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<OptionsPage />);
