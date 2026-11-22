import type { RefObject } from 'react';
import {
  Activity, ArrowDown, ArrowRight, ArrowUp, Camera, Clock, Code2, Download, Layers, Palette,
  PanelRightOpen, Pin, PinOff, Pipette, Search, ShieldCheck, Sparkles, Star, Type, Wand2, X,
} from 'lucide-react';
import { IconButton } from '../components/ui';
import { CATEGORY_LABELS, CATEGORY_ORDER, FEATURED_TOOLS, TOOLS, TOOL_COUNT } from '../lib/catalog';
import type { ToolDefinition } from '../lib/catalog';
import type { ToolCategory } from '../lib/types';

const CATEGORY_ICONS: Record<ToolCategory, typeof Sparkles> = {
  core: Sparkles,
  design: Palette,
  qa: ShieldCheck,
  export: Download,
  productivity: Wand2,
  extras: Layers,
};

const TOOL_ICONS: Record<string, typeof Sparkles> = {
  'color-picker': Pipette,
  screenshot: Camera,
  'font-picker': Type,
  'computed-css': Code2,
  'contrast-checker': Activity,
};

interface HomeProps {
  query: string;
  onQueryChange: (value: string) => void;
  searchRef: RefObject<HTMLInputElement>;
  favorites: string[];
  recent: string[];
  pinned: string[];
  filtered: ToolDefinition[];
  mode: 'popup' | 'sidepanel';
  onSelect: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onMovePin: (id: string, direction: -1 | 1) => void;
  onCategory: (category: ToolCategory) => void;
  onOpenSidePanel: () => void;
}

export function Home({
  query, onQueryChange, searchRef, favorites, recent, pinned, filtered, mode,
  onSelect, onTogglePin, onToggleFavorite, onMovePin, onCategory, onOpenSidePanel,
}: HomeProps) {
  const toolById = (id: string) => TOOLS.find((tool) => tool.id === id);
  const quick = FEATURED_TOOLS.map(toolById).filter(Boolean).slice(0, 3);
  const recentTools = recent.map(toolById).filter(Boolean).slice(0, 6);
  const favoriteTools = favorites.map(toolById).filter(Boolean).slice(0, 8);
  const pinnedTools = pinned.map(toolById).filter(Boolean);
  const searching = query.trim().length > 0;

  const toolChip = (tool: ToolDefinition) => (
    <span className="cat-tool" key={tool.id}>
      <button type="button" className="cat-tool-open" onClick={() => onSelect(tool.id)} title={tool.description}>{tool.name}</button>
      <button
        type="button"
        className={`cat-tool-pin ${pinned.includes(tool.id) ? 'pinned' : ''}`}
        title={pinned.includes(tool.id) ? 'Unpin tool' : 'Pin to top 10'}
        onClick={() => onTogglePin(tool.id)}
      >
        <Pin size={10} fill={pinned.includes(tool.id) ? 'currentColor' : 'none'} />
      </button>
      <button
        type="button"
        className={`cat-tool-star ${favorites.includes(tool.id) ? 'favorited' : ''}`}
        title={favorites.includes(tool.id) ? 'Remove favorite' : 'Add favorite'}
        onClick={() => onToggleFavorite(tool.id)}
      >
        <Star size={10} fill={favorites.includes(tool.id) ? 'currentColor' : 'none'} />
      </button>
    </span>
  );

  return (
    <div className="home">
      <section className="home-hero">
        <div className="hero-glow" />
        <div className="hero-content">
          <span className="hero-badge"><Sparkles size={12} /> {TOOL_COUNT} tools · one workspace</span>
          <h1>Everything you need to build, inspect & ship.</h1>
          <p>Pick colors, inspect layouts, capture anything, and check quality — without leaving the page.</p>
          <div className="home-search">
            <Search size={16} />
            <input
              ref={searchRef}
              className="home-search-input"
              placeholder="Search tools, e.g. “contrast”"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
            />
            {query ? (
              <IconButton title="Clear search" onClick={() => { onQueryChange(''); searchRef.current?.focus(); }}><X size={13} /></IconButton>
            ) : (
              <kbd>/</kbd>
            )}
          </div>
        </div>
      </section>

      {searching ? (
        <section className="home-section">
          <div className="section-heading">
            <h2>Search results</h2>
            <span>{filtered.length} {filtered.length === 1 ? 'tool' : 'tools'} match “{query.trim()}”</span>
          </div>
          {filtered.length > 0 ? (
            <div className="category-tools search-results">{filtered.map(toolChip)}</div>
          ) : (
            <div className="pinned-empty">
              <Search size={15} />
              <span>No tools match “{query.trim()}”. Try a different word or category.</span>
            </div>
          )}
        </section>
      ) : (
        <>
          <section className="home-section">
            <div className="section-heading">
              <h2><Pin size={14} /> Pinned tools</h2>
              <span>{pinned.length}/10 · your personal shortcuts</span>
            </div>
            {pinnedTools.length > 0 ? (
              <div className="pinned-grid">
                {pinnedTools.map((tool, index) => (
                  <div className="pinned-item" key={tool!.id}>
                    <button type="button" className="pinned-open" onClick={() => onSelect(tool!.id)} title={tool!.description}>
                      <span className="pinned-index">{index + 1}</span>
                      <span className="pinned-name">{tool!.name}</span>
                    </button>
                    <div className="pinned-actions">
                      <IconButton title="Move up" disabled={index === 0} onClick={() => onMovePin(tool!.id, -1)}><ArrowUp size={12} /></IconButton>
                      <IconButton title="Move down" disabled={index === pinnedTools.length - 1} onClick={() => onMovePin(tool!.id, 1)}><ArrowDown size={12} /></IconButton>
                      <IconButton title="Unpin" onClick={() => onTogglePin(tool!.id)}><PinOff size={12} /></IconButton>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="pinned-empty">
                <Pin size={15} />
                <span>Pin your most-used tools here — up to 10. Use the pin icon next to any tool in the list below.</span>
              </div>
            )}
          </section>

          <section className="home-section">
            <div className="section-heading">
              <h2>Quick start</h2>
              <span>The three most useful tools</span>
            </div>
            <div className="quick-grid">
              {quick.map((tool) => {
                const Icon = TOOL_ICONS[tool!.id] || Sparkles;
                return (
                  <button key={tool!.id} type="button" className="quick-card" onClick={() => onSelect(tool!.id)}>
                    <span className="quick-icon"><Icon size={19} /></span>
                    <span className="quick-copy">
                      <strong>{tool!.name}</strong>
                      <small>{tool!.description}</small>
                    </span>
                    <ArrowRight size={15} className="quick-arrow" />
                  </button>
                );
              })}
            </div>
          </section>

          {recentTools.length > 0 && (
            <section className="home-section">
              <div className="section-heading"><h2><Clock size={14} /> Recently used</h2></div>
              <div className="chip-grid">
                {recentTools.map((tool) => (
                  <button key={tool!.id} type="button" className="tool-chip" onClick={() => onSelect(tool!.id)}>
                    {tool!.name}
                  </button>
                ))}
              </div>
            </section>
          )}

          {favoriteTools.length > 0 && (
            <section className="home-section">
              <div className="section-heading"><h2><Star size={14} /> Favorites</h2></div>
              <div className="chip-grid">
                {favoriteTools.map((tool) => (
                  <button key={tool!.id} type="button" className="tool-chip favorite" onClick={() => onSelect(tool!.id)}>
                    {tool!.name}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="home-section">
            <div className="section-heading">
              <h2>All tools</h2>
              <span>{TOOL_COUNT} tools · click any name to open it</span>
            </div>
            <div className="category-grid">
              {CATEGORY_ORDER.map((category) => {
                const Icon = CATEGORY_ICONS[category];
                const categoryTools = TOOLS.filter((tool) => tool.category === category);
                return (
                  <div className="category-card" id={`category-${category}`} key={category}>
                    <button type="button" className="category-head" onClick={() => onCategory(category)}>
                      <span className={`category-icon category-${category}`}><Icon size={16} /></span>
                      <span className="category-copy"><strong>{CATEGORY_LABELS[category]}</strong><small>{categoryTools.length} tools</small></span>
                      <ArrowRight size={14} />
                    </button>
                    <div className="category-tools">
                      {categoryTools.map(toolChip)}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {mode === 'popup' && (
            <section className="home-tip">
              <PanelRightOpen size={18} />
              <div>
                <strong>Need to click the page?</strong>
                <p>Page inspectors and overlays live in the side panel so they stay open while you click.</p>
              </div>
              <button type="button" className="link-button" onClick={onOpenSidePanel}>Open panel <ArrowRight size={13} /></button>
            </section>
          )}
        </>
      )}
    </div>
  );
}
