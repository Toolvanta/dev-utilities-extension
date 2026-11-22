import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Accessibility, Activity, ArrowLeft, BookOpen, Box, Braces, Camera, Code2, Database,
  Eye, FileCode2, FileDown, FileJson, Globe2, Grid3x3, Home, Image, ImagePlus, Layers, Link2,
  List, Maximize2, Minimize2, Monitor, Moon, MousePointer2, Network, Palette, PanelRightOpen, PenLine,
  Pipette, Play, QrCode, RotateCcw, Ruler, Search, Settings2, Share2, Sparkles, Terminal, Trash2,
  Type, Contrast, Video, Wand2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { POPUP_SAFE_TOOLS, TOOLS, TOOL_COUNT } from '../lib/catalog';
import type { ToolCategory } from '../lib/types';
import { addHistory, getLocal, getSetting, onStorageChanged, setLocal, setSetting } from '../lib/storage';
import { describeError, getActiveTab, page } from '../lib/messaging';
import { TOOL_COMPONENTS } from '../tools';
import { Button, IconButton, Notice } from '../components/ui';
import { ErrorBoundary } from './ErrorBoundary';
import { Home as HomeView } from './Home';

const ICONS: Record<string, LucideIcon> = {
  Pipette, Type, Camera, Code2, MousePointer2, Box, Grid3x3, Ruler, Palette, Contrast,
  Sparkles, Braces, Monitor, Image, Accessibility, List, Network,
  Terminal, Database, Activity, Link2, Eye, PenLine, FileCode2, Video, FileDown, QrCode,
  Share2, Wand2, BookOpen, FileJson, Search, ImagePlus, Moon, Layers, Play, Globe2,
};

function ToolIcon({ name, size = 16 }: { name: string; size?: number }) {
  const Icon = ICONS[name] || MousePointer2;
  return <Icon size={size} />;
}

type View = 'home' | 'tool';

export function App({ mode }: { mode: 'popup' | 'sidepanel' }) {
  const [view, setView] = useState<View>('home');
  const [selectedId, setSelectedId] = useState(TOOLS[0].id);
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [pinned, setPinned] = useState<string[]>([]);
  const [focusMode, setFocusMode] = useState(false);
  const [error, setError] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let unsubscribePinned: (() => void) | undefined;
    (async () => {
      setFavorites(await getLocal<string[]>('favorites', []));
      setRecent(await getLocal<string[]>('recentTools', []));
      setPinned(await getLocal<string[]>('pinnedTools', []));
      const accent = await getSetting<string>('accent', '#38bdf8');
      document.documentElement.style.setProperty('--accent', accent);

      // Open straight into the tool the user last picked. In the popup we only
      // restore tools that can run there; page inspectors are handled by the
      // browser side-panel handoff instead.
      const last = await getSetting<string>('lastTool', '');
      const saved = TOOLS.find((tool) => tool.id === last && (mode === 'sidepanel' || POPUP_SAFE_TOOLS.has(tool.id)));
      if (saved) {
        setSelectedId(saved.id);
        setView('tool');
      }

      // If the browser side panel is already open, a tool chosen in the popup
      // should appear there immediately rather than leaving the old tool up.
      unsubscribe = await onStorageChanged('lastTool', (value) => {
        if (typeof value === 'string' && TOOLS.some((tool) => tool.id === value)) {
          setSelectedId(value);
          setView('tool');
        }
      });
      unsubscribePinned = await onStorageChanged('pinnedTools', (value) => {
        if (Array.isArray(value)) {
          setPinned(value.filter((id) => TOOLS.some((tool) => tool.id === id)).slice(0, 10));
        }
      }, 'local');
    })();
    const listener = (message: any) => {
      if (message?.type === 'FOCUS_TOOL' && TOOLS.some((tool) => tool.id === message.toolId)) {
        setSelectedId(message.toolId);
        setView('tool');
        void setSetting('lastTool', message.toolId).catch(() => undefined);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
      unsubscribe?.();
      unsubscribePinned?.();
    };
  }, [mode]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || target?.isContentEditable;
      if (event.key === '/' && !typing) {
        event.preventDefault();
        setView('home');
        setTimeout(() => searchRef.current?.focus(), 40);
      }
      if (event.key === 'Escape' && target === searchRef.current) {
        setQuery('');
        searchRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openSidePanel = async (toolId?: string) => {
    try {
      if (toolId) {
        await setSetting('lastTool', toolId);
        await addHistory('recentTools', toolId, 8);
      }
      const tab = await getActiveTab();
      await chrome.sidePanel.open({ tabId: tab.id! });
      if (mode === 'popup') window.close();
    } catch (e) {
      setError(describeError(e));
    }
  };

  const select = async (id: string) => {
    setError('');
    if (mode === 'popup' && !POPUP_SAFE_TOOLS.has(id)) {
      await openSidePanel(id);
      return;
    }
    setSelectedId(id);
    setView('tool');
    setSetting('lastTool', id);
    setRecent(await addHistory('recentTools', id, 8));
  };

  const goHome = () => {
    setView('home');
    setQuery('');
  };

  const showCategory = (category: ToolCategory) => {
    setView('home');
    setQuery('');
    setTimeout(() => document.getElementById(`category-${category}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
  };

  const toggleFavorite = (id: string) => {
    const next = favorites.includes(id) ? favorites.filter((item) => item !== id) : [...favorites, id];
    setFavorites(next);
    setLocal('favorites', next);
  };

  const togglePin = (id: string) => {
    setError('');
    if (pinned.includes(id)) {
      const next = pinned.filter((item) => item !== id);
      setPinned(next);
      void setLocal('pinnedTools', next);
      return;
    }
    if (pinned.length >= 10) {
      setError('You can pin up to 10 tools. Unpin one first.');
      return;
    }
    const next = [...pinned, id];
    setPinned(next);
    void setLocal('pinnedTools', next);
  };

  const movePin = (id: string, direction: -1 | 1) => {
    const index = pinned.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= pinned.length) return;
    const next = [...pinned];
    [next[index], next[target]] = [next[target], next[index]];
    setPinned(next);
    void setLocal('pinnedTools', next);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TOOLS;
    return TOOLS.filter((tool) => `${tool.name} ${tool.description} ${tool.keywords}`.toLowerCase().includes(q));
  }, [query]);

  const current = TOOLS.find((tool) => tool.id === selectedId) || TOOLS[0];
  const ToolView = TOOL_COMPONENTS[current.id];
  const popupNeedsPanel = mode === 'popup' && !POPUP_SAFE_TOOLS.has(current.id);

  return (
    <div className={`app app-${mode} ${focusMode ? 'app-focus' : ''}`}>
      <header className="app-header">
        <button type="button" className="brand" onClick={goHome} title="Home">
          <span className="brand-mark">{'{ }'}</span>
          <span className="brand-copy"><strong>Dev Utility</strong><small>{TOOL_COUNT} tools</small></span>
        </button>
        <div className="header-actions">
          {view !== 'home' && <IconButton title="Home" onClick={goHome}><Home size={17} /></IconButton>}
          {mode === 'popup' && <IconButton title="Open side panel" onClick={() => openSidePanel()}><PanelRightOpen size={17} /></IconButton>}
          <IconButton
            title="Reload page"
            onClick={async () => { try { const tab = await getActiveTab(); await chrome.tabs.reload(tab.id!); } catch (e) { setError(describeError(e)); } }}
          ><RotateCcw size={16} /></IconButton>
          <IconButton title="Settings" onClick={() => chrome.runtime.openOptionsPage()}><Settings2 size={17} /></IconButton>
        </div>
      </header>

      <Notice>{error}</Notice>

      <div className="app-main">
        <main className="tool-area">
          {view === 'home' ? (
            <div className="tool-scroll">
              <HomeView
                query={query}
                onQueryChange={setQuery}
                searchRef={searchRef}
                favorites={favorites}
                recent={recent}
                pinned={pinned}
                mode={mode}
                onSelect={select}
                onTogglePin={togglePin}
                onToggleFavorite={toggleFavorite}
                onMovePin={movePin}
                filtered={filtered}
                onCategory={showCategory}
                onOpenSidePanel={() => openSidePanel()}
              />
            </div>
          ) : (
            <>
              <div className="tool-area-head">
                <IconButton title="Back to home" onClick={goHome}><ArrowLeft size={15} /></IconButton>
                <ToolIcon name={current.icon} size={16} />
                <span>{current.name}</span>
                <div className="head-actions">
                  {popupNeedsPanel && (
                    <Button variant="primary" icon={<PanelRightOpen size={14} />} onClick={() => openSidePanel(current.id)}>Open in panel</Button>
                  )}
                  <IconButton
                    title="Reset page changes"
                    onClick={async () => { try { await page.reset(); setError(''); } catch (e) { setError(describeError(e)); } }}
                  ><Trash2 size={15} /></IconButton>
                  <IconButton title={focusMode ? 'Exit focus mode' : 'Focus mode'} onClick={() => setFocusMode((v) => !v)}>
                    {focusMode ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                  </IconButton>
                </div>
              </div>
              <div className="tool-scroll">
                <div className="tool-content">
                  {popupNeedsPanel ? (
                    <div className="panel-prompt">
                      <PanelRightOpen size={24} />
                      <h3>Use this tool in the side panel</h3>
                      <p>It needs to stay open while you click elements on the page. The popup would close as soon as the page takes focus.</p>
                      <Button variant="primary" icon={<PanelRightOpen size={14} />} onClick={() => openSidePanel(current.id)}>Open {current.name} in side panel</Button>
                    </div>
                  ) : (
                    <ErrorBoundary key={current.id} toolName={current.name}>
                      {ToolView ? <ToolView /> : <div className="no-results">Tool unavailable.</div>}
                    </ErrorBoundary>
                  )}
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      <footer className="app-footer">
        <span>{view === 'home' ? `${TOOL_COUNT} tools · local only · no telemetry` : current.name}</span>
        <span>{mode === 'popup' ? 'Press / to search' : 'Esc cancels a page pick'}</span>
      </footer>
    </div>
  );
}
