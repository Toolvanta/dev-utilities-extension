/// <reference types="chrome" />
import type {
  A11yIssue, AnimationInfo, BreakpointInfo, ColorUsage, ConsoleEntry, FontUsage,
  ImageInfo, LinkInfo, NetworkEntry, PageRequest, PageResponse, PerformanceInfo,
  PickedElement, RectInfo, StorageInfo,
} from '../lib/types';

/* ------------------------------------------------------------------ */
/* Instrumentation: injected into the page's main world so console and  */
/* network activity from page scripts can be observed from the isolated */
/* content-script world through the DOM.                                */
/* ------------------------------------------------------------------ */

const INSTRUMENTATION = `(() => {
  try {
    let logs = [], net = [];
    const store = (id, data) => {
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement('script');
        el.type = 'application/json';
        el.id = id;
        el.style.display = 'none';
        (document.head || document.documentElement).appendChild(el);
      }
      el.textContent = JSON.stringify(data.slice(-400));
    };
    const stringify = (value) => {
      if (typeof value === 'string') return value;
      try { return JSON.stringify(value); } catch (e) { return String(value); }
    };
    ['log','info','warn','error','debug'].forEach((level) => {
      const original = console[level];
      console[level] = function () {
        try {
          logs.push({ level, text: Array.prototype.map.call(arguments, stringify).join(' '), time: new Date().toLocaleTimeString() });
          store('fdu-data-console', logs);
        } catch (e) {}
        return original.apply(console, arguments);
      };
    });
    window.addEventListener('error', (event) => {
      logs.push({ level: 'error', text: event.message || 'Uncaught error', time: new Date().toLocaleTimeString() });
      store('fdu-data-console', logs);
    });
    window.addEventListener('unhandledrejection', (event) => {
      logs.push({ level: 'error', text: 'Unhandled rejection: ' + stringify(event.reason), time: new Date().toLocaleTimeString() });
      store('fdu-data-console', logs);
    });
    const originalFetch = window.fetch;
    if (originalFetch) {
      window.fetch = function (input, init) {
        const url = typeof input === 'string' ? input : (input && input.url) || String(input);
        const method = (init && init.method) || (input && input.method) || 'GET';
        const start = performance.now();
        return originalFetch.apply(this, arguments).then((response) => {
          net.push({ method, url, status: response.status, duration: Math.round(performance.now() - start), size: Number(response.headers && response.headers.get('content-length') || 0), time: new Date().toLocaleTimeString(), type: 'fetch' });
          store('fdu-data-network', net);
          return response;
        }).catch((error) => {
          net.push({ method, url, status: 0, duration: Math.round(performance.now() - start), size: 0, time: new Date().toLocaleTimeString(), type: 'fetch' });
          store('fdu-data-network', net);
          throw error;
        });
      };
    }
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      (this as any).__fduMeta = { method, url, start: performance.now() };
      return originalOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      const request = this;
      request.addEventListener('loadend', () => {
        const meta = (request as any).__fduMeta || { method: 'GET', url: '', start: performance.now() };
        net.push({ method: meta.method, url: meta.url, status: request.status, duration: Math.round(performance.now() - meta.start), size: Number(request.responseText && request.responseText.length || 0), time: new Date().toLocaleTimeString(), type: 'xhr' });
        store('fdu-data-network', net);
      });
      return originalSend.apply(this, arguments);
    };
    document.addEventListener('fdu-command', (event: any) => {
      const command = event.detail;
      if (command === 'clear-console') { logs = []; store('fdu-data-console', logs); }
      if (command === 'clear-network') { net = []; store('fdu-data-network', net); }
    });
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          store('fdu-lcp', [{ startTime: entry.startTime, size: (entry as any).size || 0 }]);
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (e) {}
  } catch (e) {}
})();`;

function installInstrumentation() {
  try {
    if (document.getElementById('fdu-instrumentation')) return;
    const script = document.createElement('script');
    script.id = 'fdu-instrumentation';
    script.textContent = INSTRUMENTATION;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  } catch { /* CSP may block inline scripts; queries fall back to empty */ }
}

if (document.documentElement) installInstrumentation();
else document.addEventListener('DOMContentLoaded', installInstrumentation, { once: true });

/* ------------------------------------------------------------------ */
/* Utilities                                                           */
/* ------------------------------------------------------------------ */

const OVERLAY_ID = 'fdu-overlay-root';
const clampNumber = (value: string | number | undefined | null) => {
  const parsed = parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
};
const px = (value: number) => `${Math.round(value)}px`;

function overlayRoot(): HTMLElement {
  let root = document.getElementById(OVERLAY_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = OVERLAY_ID;
    root.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;overflow:hidden;';
    (document.body || document.documentElement).appendChild(root);
  }
  return root;
}

function clearOverlay() {
  document.getElementById(OVERLAY_ID)?.remove();
}

function label(text: string, top: number, left: number, color = '#38bdf8'): HTMLElement {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = `position:absolute;top:${Math.max(0, top - 18)}px;left:${Math.max(0, left)}px;background:${color};color:#04070d;font:600 10px/16px ui-monospace,monospace;padding:0 5px;border-radius:3px;white-space:nowrap;`;
  return el;
}

function box(top: number, left: number, width: number, height: number, color: string, border = 1): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = `position:absolute;top:${top}px;left:${left}px;width:${width}px;height:${height}px;border:${border}px solid ${color};box-sizing:border-box;background:${color}1a;`;
  return el;
}

function rectOf(element: Element): RectInfo {
  const r = element.getBoundingClientRect();
  return { x: r.x, y: r.y, top: r.top, left: r.left, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
}

function uniqueSelector(element: Element): string {
  if (!(element instanceof HTMLElement)) return element.tagName.toLowerCase();
  if (element.id && !/^[0-9]/.test(element.id)) return `#${CSS.escape(element.id)}`;
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.documentElement && parts.length < 8) {
    const tag = current.tagName.toLowerCase();
    let part = tag;
    if (current.id && !/^[0-9]/.test(current.id)) { parts.unshift(`#${CSS.escape(current.id)}`); break; }
    const classes = Array.from(current.classList).slice(0, 2).filter((c) => !/^[0-9]/.test(c));
    if (classes.length) part += '.' + classes.map((c) => CSS.escape(c)).join('.');
    const parent: Element | null = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((child) => child.tagName === current!.tagName);
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
    }
    parts.unshift(part);
    current = parent;
  }
  return parts.join(' > ');
}

function xpathOf(element: Element): string {
  const segments: string[] = [];
  let current: Element | null = element;
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let segment = current.tagName.toLowerCase();
    const parent: Element | null = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((child) => child.tagName === current!.tagName);
      if (siblings.length > 1) segment += `[${siblings.indexOf(current) + 1}]`;
    }
    segments.unshift(segment);
    current = parent;
  }
  return '/' + segments.join('/');
}

function describeElement(element: Element): PickedElement {
  const style = getComputedStyle(element);
  const html = element as HTMLElement;
  const declarations = Array.from(style).map((property) => ({ property, value: style.getPropertyValue(property) }));
  return {
    tag: element.tagName.toLowerCase(),
    id: html.id || '',
    classes: Array.from(element.classList),
    selector: uniqueSelector(element),
    xpath: xpathOf(element),
    text: (element.textContent || '').trim().slice(0, 400),
    html: html.innerHTML?.slice(0, 20000) || '',
    outerHtml: html.outerHTML?.slice(0, 20000) || '',
    rect: rectOf(element),
    font: {
      family: style.fontFamily || '',
      size: style.fontSize || '',
      weight: style.fontWeight || '',
      lineHeight: style.lineHeight || '',
      letterSpacing: style.letterSpacing || '',
      style: style.fontStyle || '',
    },
    color: { foreground: style.color || '', background: style.backgroundColor || '' },
    styles: declarations,
  };
}

let lastSelected: Element | null = null;

function resolveTarget(payload?: any): Element {
  if (payload?.selector) {
    try { const found = document.querySelector(payload.selector); if (found) return found; } catch { /* invalid selector */ }
  }
  return lastSelected || document.body;
}

function domData(id: string): any {
  try {
    const text = document.getElementById(id)?.textContent;
    return text ? JSON.parse(text) : [];
  } catch { return []; }
}

function commandMainWorld(command: string) {
  document.dispatchEvent(new CustomEvent('fdu-command', { detail: command }));
}

/* ------------------------------------------------------------------ */
/* Element picker                                                      */
/* ------------------------------------------------------------------ */

type PickMode = 'font' | 'css' | 'selector' | 'measure' | 'image' | 'element' | 'color';
let activePick: {
  mode: PickMode;
  index?: number;
  highlight: HTMLElement;
  label: HTMLElement;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
} | null = null;

function cancelPick(reason = 'Selection cancelled.') {
  if (!activePick) return;
  const { resolve, reject, highlight, label } = activePick;
  activePick = null;
  highlight.remove();
  label.remove();
  window.removeEventListener('mousemove', onPickMove, true);
  window.removeEventListener('click', onPickClick, true);
  window.removeEventListener('keydown', onPickKey, true);
  reject(new Error(reason));
  void resolve;
}

function onPickMove(event: MouseEvent) {
  if (!activePick) return;
  const target = document.elementFromPoint(event.clientX, event.clientY);
  if (!target || target.closest(`#${OVERLAY_ID}`)) return;
  const rect = rectOf(target);
  activePick.highlight.style.cssText = `position:absolute;top:${rect.top}px;left:${rect.left}px;width:${rect.width}px;height:${rect.height}px;border:2px solid #38bdf8;background:#38bdf822;box-sizing:border-box;`;
  activePick.label.textContent = `${target.tagName.toLowerCase()}${target.id ? '#' + target.id : ''}  ${Math.round(rect.width)}×${Math.round(rect.height)}`;
  activePick.label.style.cssText = `position:absolute;top:${Math.max(0, rect.top - 20)}px;left:${Math.max(0, rect.left)}px;background:#38bdf8;color:#04070d;font:600 11px/18px ui-monospace,monospace;padding:0 6px;border-radius:3px;white-space:nowrap;`;
}

function onPickClick(event: MouseEvent) {
  if (!activePick) return;
  event.preventDefault();
  event.stopPropagation();
  const target = document.elementFromPoint(event.clientX, event.clientY);
  if (!target) return;
  lastSelected = target;
  const data = describeElement(target);
  const { resolve, highlight, label, mode, index } = activePick;
  activePick = null;
  highlight.remove();
  label.remove();
  window.removeEventListener('mousemove', onPickMove, true);
  window.removeEventListener('click', onPickClick, true);
  window.removeEventListener('keydown', onPickKey, true);
  resolve({ ...data, mode, index });
}

function onPickKey(event: KeyboardEvent) {
  if (event.key === 'Escape') cancelPick();
}

function startPick(mode: PickMode, index?: number): Promise<PickedElement> {
  return new Promise((resolve, reject) => {
    cancelPick('Selection replaced.');
    const root = overlayRoot();
    const highlight = document.createElement('div');
    const label = document.createElement('div');
    root.append(highlight, label);
    activePick = { mode, index, highlight, label, resolve, reject };
    window.addEventListener('mousemove', onPickMove, true);
    window.addEventListener('click', onPickClick, true);
    window.addEventListener('keydown', onPickKey, true);
  });
}

/* ------------------------------------------------------------------ */
/* Overlays                                                            */
/* ------------------------------------------------------------------ */

let overlayRenderer: (() => void) | null = null;
let overlayScrollHandler: (() => void) | null = null;

function setOverlay(type: string, payload?: any) {
  if (overlayScrollHandler) {
    window.removeEventListener('scroll', overlayScrollHandler, true);
    window.removeEventListener('resize', overlayScrollHandler);
  }
  overlayRenderer = null;
  overlayScrollHandler = null;
  clearOverlay();
  if (type === 'none') return;

  const root = overlayRoot();
  if (type === 'boxmodel') {
    const target = resolveTarget(payload);
    overlayRenderer = () => {
      root.innerHTML = '';
      const style = getComputedStyle(target);
      const r = rectOf(target);
      const mt = clampNumber(style.marginTop), mr = clampNumber(style.marginRight);
      const mb = clampNumber(style.marginBottom), ml = clampNumber(style.marginLeft);
      const bt = clampNumber(style.borderTopWidth), br = clampNumber(style.borderRightWidth);
      const bb = clampNumber(style.borderBottomWidth), bl = clampNumber(style.borderLeftWidth);
      const pt = clampNumber(style.paddingTop), pr = clampNumber(style.paddingRight);
      const pb = clampNumber(style.paddingBottom), pl = clampNumber(style.paddingLeft);
      const layers: [number, number, number, number, string, string][] = [
        [r.top - mt, r.left - ml, r.width + ml + mr, r.height + mt + mb, '#f59e0b', `margin ${mt} ${mr} ${mb} ${ml}`],
        [r.top, r.left, r.width, r.height, '#eab308', `border ${bt} ${br} ${bb} ${bl}`],
        [r.top + bt, r.left + bl, r.width - bl - br, r.height - bt - bb, '#22c55e', `padding ${pt} ${pr} ${pb} ${pl}`],
        [r.top + bt + pt, r.left + bl + pl, r.width - bl - br - pl - pr, r.height - bt - bb - pt - pb, '#38bdf8', `content ${Math.round(r.width - bl - br - pl - pr)}×${Math.round(r.height - bt - bb - pt - pb)}`],
      ];
      layers.forEach(([top, left, width, height, color, text]) => {
        root.appendChild(box(top, left, Math.max(0, width), Math.max(0, height), color));
        root.appendChild(label(text, top, left, color));
      });
    };
  } else if (type === 'grid') {
    const color = payload?.color || '#a78bfa';
    overlayRenderer = () => {
      root.innerHTML = '';
      let count = 0;
      const all = Array.from(document.querySelectorAll('body *'));
      for (const element of all) {
        if (count >= 60) break;
        const style = getComputedStyle(element);
        const display = style.display || '';
        if (!display.includes('grid') && !display.includes('flex')) continue;
        const r = rectOf(element);
        if (r.width < 4 || r.height < 4) continue;
        count++;
        root.appendChild(box(r.top, r.left, r.width, r.height, color, 2));
        root.appendChild(label(`${display} · ${uniqueSelector(element).slice(0, 44)}`, r.top, r.left, color));
        if (display.includes('grid')) {
          const columns = style.gridTemplateColumns.split(' ').filter((v) => v.endsWith('px')).map(clampNumber);
          let offset = r.left + clampNumber(style.paddingLeft) + clampNumber(style.borderLeftWidth);
          columns.forEach((width) => {
            if (width > 0) {
              const line = document.createElement('div');
              line.style.cssText = `position:absolute;top:${r.top}px;left:${offset + width}px;width:1px;height:${r.height}px;background:${color};opacity:.7;`;
              root.appendChild(line);
              offset += width + clampNumber(style.columnGap);
            }
          });
        }
      }
      root.appendChild(label(`${count} layout containers`, 2, 2, color));
    };
  } else if (type === 'ruler') {
    const start = payload?.start ? document.querySelector(payload.start) : null;
    const end = payload?.end ? document.querySelector(payload.end) : null;
    overlayRenderer = () => {
      root.innerHTML = '';
      if (!start || !end) return;
      const a = rectOf(start), b = rectOf(end);
      const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
      const bx = b.left + b.width / 2, by = b.top + b.height / 2;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%;overflow:visible;');
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(ax)); line.setAttribute('y1', String(ay));
      line.setAttribute('x2', String(bx)); line.setAttribute('y2', String(by));
      line.setAttribute('stroke', '#f472b6'); line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke-dasharray', '6 4');
      svg.appendChild(line);
      [a, b].forEach((rect) => {
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', String(rect.left + rect.width / 2));
        dot.setAttribute('cy', String(rect.top + rect.height / 2));
        dot.setAttribute('r', '5'); dot.setAttribute('fill', '#f472b6');
        svg.appendChild(dot);
      });
      root.appendChild(svg);
      const dx = Math.abs(bx - ax), dy = Math.abs(by - ay);
      const distance = Math.sqrt(dx * dx + dy * dy);
      root.appendChild(label(`Δx ${Math.round(dx)}px  Δy ${Math.round(dy)}px  ∕ ${Math.round(distance)}px`, Math.min(ay, by) - 10, (ax + bx) / 2, '#f472b6'));
      root.appendChild(box(a.top, a.left, a.width, a.height, '#f472b6', 2));
      root.appendChild(box(b.top, b.left, b.width, b.height, '#f472b6', 2));
    };
  } else if (type === 'headings') {
    overlayRenderer = () => {
      root.innerHTML = '';
      const colors = ['#f87171', '#fb923c', '#facc15', '#4ade80', '#38bdf8', '#a78bfa'];
      document.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((heading) => {
        const level = Number(heading.tagName.slice(1)) - 1;
        const r = rectOf(heading);
        if (r.width < 1 || r.height < 1) return;
        root.appendChild(box(r.top, r.left, r.width, r.height, colors[level], 2));
        root.appendChild(label(`H${level + 1}`, r.top, r.left, colors[level]));
      });
    };
  } else if (type === 'a11y') {
    const selectors: string[] = payload?.selectors || (payload?.selector ? [payload.selector] : []);
    overlayRenderer = () => {
      root.innerHTML = '';
      selectors.slice(0, 80).forEach((selector) => {
        try {
          const element = document.querySelector(selector);
          if (!element) return;
          const r = rectOf(element);
          root.appendChild(box(r.top, r.left, r.width, r.height, '#ef4444', 2));
        } catch { /* invalid selector */ }
      });
    };
  }

  overlayRenderer();
  overlayScrollHandler = () => overlayRenderer?.();
  window.addEventListener('scroll', overlayScrollHandler, true);
  window.addEventListener('resize', overlayScrollHandler);
}

/* ------------------------------------------------------------------ */
/* CSS injection and filters                                           */
/* ------------------------------------------------------------------ */

function injectCss(id: string, css: string) {
  const styleId = `fdu-style-${id}`;
  let style = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = styleId;
    (document.head || document.documentElement).appendChild(style);
  }
  style.textContent = css;
}

function removeCss(id: string) {
  document.getElementById(`fdu-style-${id}`)?.remove();
}

const COLORBLIND_MATRICES: Record<string, string> = {
  protanopia: '0.567 0.433 0 0 0 0.558 0.442 0 0 0 0 0.242 0.758 0 0 0 0 0 0 1 0',
  deuteranopia: '0.625 0.375 0 0 0 0.7 0.3 0 0 0 0 0.3 0.7 0 0 0 0 0 0 1 0',
  tritanopia: '0.95 0.05 0 0 0 0 0.433 0.567 0 0 0 0.475 0.525 0 0 0 0 0 0 1 0',
  achromatopsia: '0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0 0 0 0 1 0',
};

function setFilter(kind: 'dark' | 'colorblind', value: string | null) {
  if (kind === 'dark') {
    if (!value) { removeCss('filter-dark'); return; }
    const noImages = value === 'no-images';
    injectCss('filter-dark', noImages
      ? 'html{filter:invert(1) hue-rotate(180deg)!important;}img,video,canvas,[style*="background-image"]{filter:invert(1) hue-rotate(180deg)!important;}'
      : 'html{filter:invert(1) hue-rotate(180deg)!important;}');
    return;
  }
  if (!value || value === 'normal') { removeCss('filter-colorblind'); return; }
  const matrix = COLORBLIND_MATRICES[value];
  if (!matrix) { removeCss('filter-colorblind'); return; }
  let svg: Element | null = document.getElementById('fdu-cb-svg');
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'fdu-cb-svg';
    svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;');
    (document.body || document.documentElement).appendChild(svg);
  }
  svg.innerHTML = Object.entries(COLORBLIND_MATRICES).map(([name, values]) =>
    `<filter id="fdu-cb-${name}"><feColorMatrix type="matrix" values="${values}"/></filter>`).join('');
  injectCss('filter-colorblind', `html{filter:url(#fdu-cb-${value})!important;}`);
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

function queryColors(): ColorUsage[] {
  const counts = new Map<string, { count: number; property: string; sample: string }>();
  const elements = Array.from(document.querySelectorAll('body *')).slice(0, 1200);
  for (const element of elements) {
    const style = getComputedStyle(element);
    for (const property of ['color', 'backgroundColor', 'borderTopColor']) {
      const value = style.getPropertyValue(property);
      if (!value || value.includes('rgba(0, 0, 0, 0)') || value === 'transparent') continue;
      const entry = counts.get(value) || { count: 0, property, sample: uniqueSelector(element) };
      entry.count++;
      counts.set(value, entry);
    }
  }
  return Array.from(counts.entries())
    .map(([color, info]) => ({ color, ...info }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 80);
}

function queryFonts(): FontUsage[] {
  const counts = new Map<string, FontUsage>();
  Array.from(document.querySelectorAll('body *')).slice(0, 1200).forEach((element) => {
    const style = getComputedStyle(element);
    const family = style.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    if (!family) return;
    const key = `${family}|${style.fontSize}|${style.fontWeight}`;
    const entry = counts.get(key) || { family, size: style.fontSize, weight: style.fontWeight, count: 0, sample: (element.textContent || '').trim().slice(0, 40) };
    entry.count++;
    counts.set(key, entry);
  });
  return Array.from(counts.values()).sort((a, b) => b.count - a.count).slice(0, 60);
}

function queryImages(): ImageInfo[] {
  return Array.from(document.images).map((image, index) => {
    const r = rectOf(image);
    return {
      index,
      src: image.currentSrc || image.src || '',
      alt: image.alt || '',
      width: Math.round(r.width), height: Math.round(r.height),
      naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
      loading: image.loading || 'eager', srcset: image.srcset || '', complete: image.complete,
    };
  });
}

function queryHeadings(): { level: number; text: string; selector: string }[] {
  return Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((heading) => ({
    level: Number(heading.tagName.slice(1)),
    text: (heading.textContent || '').trim().slice(0, 200),
    selector: uniqueSelector(heading),
  }));
}

function queryLinks(): LinkInfo[] {
  return Array.from(document.querySelectorAll('a')).map((anchor) => {
    const href = anchor.getAttribute('href') || '';
    const target = anchor.target || '';
    const rel = anchor.rel || '';
    let issue: string | undefined;
    if (!href) issue = 'Missing href';
    else if (href === '#') issue = 'Placeholder link';
    else if (href.startsWith('javascript:')) issue = 'JavaScript URL';
    else if (target === '_blank' && !/noopener/i.test(rel)) issue = '_blank without noopener';
    return { href, text: (anchor.textContent || '').trim().slice(0, 120), target, rel, issue };
  });
}

function queryAnimations(): AnimationInfo[] {
  try {
    return document.getAnimations().map((animation: any) => {
      const timing = animation.effect?.getComputedTiming?.() || {};
      const target = animation.effect?.target;
      return {
        name: animation.animationName || (animation.effect?.getKeyframes?.()[0]?.composite) || 'animation',
        duration: String(timing.duration ?? '∞'),
        delay: String(timing.delay ?? 0),
        iteration: String(timing.iterations ?? 1),
        state: animation.playState || 'idle',
        target: target ? uniqueSelector(target) : 'document',
      };
    }).slice(0, 200);
  } catch { return []; }
}

function queryBreakpoints(): BreakpointInfo[] {
  const found = new Map<string, BreakpointInfo>();
  const walk = (rules: CSSRuleList) => {
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      if (rule instanceof CSSMediaRule) {
        const condition = rule.conditionText || rule.media.mediaText;
        if (!found.has(condition)) {
          let matches = false;
          try { matches = window.matchMedia(condition).matches; } catch { /* unsupported */ }
          found.set(condition, { condition, source: rule.cssText.slice(0, 140), matches });
        }
        walk(rule.cssRules);
      }
      if (rule instanceof CSSSupportsRule) walk(rule.cssRules);
    }
  };
  try {
    Array.from(document.styleSheets).forEach((sheet) => {
      try { walk(sheet.cssRules); } catch { /* cross-origin stylesheet */ }
    });
  } catch { /* ignore */ }
  return Array.from(found.values()).slice(0, 200);
}

function parseCssColor(value: string): [number, number, number] | null {
  const match = value.match(/(\d+(?:\.\d+)?)/g);
  if (!match || match.length < 3) return null;
  return [Number(match[0]), Number(match[1]), Number(match[2])];
}

function queryA11y(): A11yIssue[] {
  const issues: A11yIssue[] = [];
  const push = (type: 'error' | 'warning', message: string, element: Element) => {
    issues.push({ type, message, selector: uniqueSelector(element) });
  };
  document.querySelectorAll('img').forEach((image) => {
    if (!image.hasAttribute('alt')) push('error', 'Image is missing an alt attribute', image);
    else if (image.getAttribute('alt') === '' && !['presentation', 'none'].includes(image.getAttribute('role') || '')) {
      push('warning', 'Image has an empty alt text', image);
    }
  });
  document.querySelectorAll('button,a,[role="button"]').forEach((element) => {
    const text = (element.textContent || '').trim();
    const label = element.getAttribute('aria-label');
    if (!text && !label) push('error', 'Interactive element has no accessible name', element);
  });
  document.querySelectorAll('input,textarea,select').forEach((element) => {
    const id = element.id;
    const hasLabel = (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) ||
      element.closest('label') || element.hasAttribute('aria-label') || element.hasAttribute('aria-labelledby');
    if (!hasLabel) push('warning', 'Form field has no associated label', element);
  });
  document.querySelectorAll('iframe').forEach((frame) => {
    if (!frame.title) push('warning', 'Iframe has no title', frame);
  });
  const headings = queryHeadings();
  for (let i = 1; i < headings.length; i++) {
    if (headings[i].level > headings[i - 1].level + 1) {
      push('warning', `Heading jump from H${headings[i - 1].level} to H${headings[i].level}`, document.querySelectorAll('h1,h2,h3,h4,h5,h6')[i]);
    }
  }
  let checked = 0;
  document.querySelectorAll('p,span,li,a,button,h1,h2,h3,h4,h5,h6').forEach((element) => {
    if (checked >= 60 || issues.length >= 120) return;
    const text = (element.textContent || '').trim();
    if (!text || text.length < 8) return;
    const style = getComputedStyle(element);
    const fg = parseCssColor(style.color);
    let node: Element | null = element;
    let bg: [number, number, number] | null = null;
    while (node && !bg) {
      const candidate = parseCssColor(getComputedStyle(node).backgroundColor);
      if (candidate && !(candidate[0] === 0 && candidate[1] === 0 && candidate[2] === 0 && getComputedStyle(node).backgroundColor.includes('0, 0, 0, 0'))) bg = candidate;
      node = node.parentElement;
    }
    if (!fg || !bg) return;
    checked++;
    const luminance = (rgb: [number, number, number]) => {
      const channel = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
    };
    const l1 = luminance(fg), l2 = luminance(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    if (ratio < 4.5) push('warning', `Low text contrast (${ratio.toFixed(2)}:1)`, element);
  });
  return issues.slice(0, 120);
}

function queryPerformance(): PerformanceInfo {
  const navigationEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  const paint = performance.getEntriesByType('paint').map((entry) => ({ name: entry.name, startTime: Math.round(entry.startTime) }));
  const fcpEntry = paint.find((entry) => entry.name === 'first-contentful-paint');
  let lcp: number | null = null;
  try {
    const stored = domData('fdu-lcp');
    if (stored?.length) lcp = Math.round(stored[stored.length - 1].startTime);
  } catch { /* ignore */ }
  const navigation: Record<string, number | string> = {};
  if (navigationEntry) {
    navigation['DNS'] = Math.round(navigationEntry.domainLookupEnd - navigationEntry.domainLookupStart);
    navigation['TCP'] = Math.round(navigationEntry.connectEnd - navigationEntry.connectStart);
    navigation['TTFB'] = Math.round(navigationEntry.responseStart - navigationEntry.requestStart);
    navigation['Download'] = Math.round(navigationEntry.responseEnd - navigationEntry.responseStart);
    navigation['DOM ready'] = Math.round(navigationEntry.domContentLoadedEventEnd - navigationEntry.startTime);
    navigation['Load'] = Math.round(navigationEntry.loadEventEnd - navigationEntry.startTime);
  }
  return {
    domNodes: document.getElementsByTagName('*').length,
    resourceCount: resources.length,
    resourceBytes: resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
    navigation,
    paint: paint.reduce((acc, entry) => ({ ...acc, [entry.name]: entry.startTime }), {}),
    fcp: fcpEntry ? Math.round(fcpEntry.startTime) : null,
    lcp,
  };
}

async function queryStorage(): Promise<StorageInfo> {
  const read = (storage: Storage) => {
    const rows: { key: string; value: string }[] = [];
    try {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key) rows.push({ key, value: (storage.getItem(key) || '').slice(0, 2000) });
      }
    } catch { /* access denied */ }
    return rows;
  };
  let cookies: { name: string; value: string }[] = [];
  try {
    cookies = document.cookie.split(';').filter(Boolean).map((part) => {
      const [name, ...rest] = part.trim().split('=');
      return { name, value: rest.join('=').slice(0, 500) };
    });
  } catch { /* ignore */ }
  let indexedDb: string[] = [];
  try {
    if (typeof indexedDB !== 'undefined' && indexedDB.databases) {
      indexedDb = (await indexedDB.databases()).map((db) => db.name || '').filter(Boolean);
    }
  } catch { /* ignore */ }
  return { local: read(localStorage), session: read(sessionStorage), cookies, indexedDb };
}

function query(what: string, payload?: any): any {
  switch (what) {
    case 'selected': return describeElement(resolveTarget(payload));
    case 'rect': return rectOf(resolveTarget(payload));
    case 'styles': return describeElement(resolveTarget(payload)).styles;
    case 'variables': {
      const style = getComputedStyle(document.documentElement);
      return Array.from(style).filter((property) => property.startsWith('--'))
        .map((property) => ({ property, value: style.getPropertyValue(property).trim() }));
    }
    case 'colors': return queryColors();
    case 'fonts': return queryFonts();
    case 'images': return queryImages();
    case 'headings': return queryHeadings();
    case 'links': return queryLinks();
    case 'animations': return queryAnimations();
    case 'breakpoints': return queryBreakpoints();
    case 'a11y': return queryA11y();
    case 'performance': return queryPerformance();
    case 'storage': return queryStorage();
    case 'console': return domData('fdu-data-console') as ConsoleEntry[];
    case 'network': return domData('fdu-data-network') as NetworkEntry[];
    default: throw new Error(`Unknown query: ${what}`);
  }
}

/* ------------------------------------------------------------------ */
/* Message handler                                                     */
/* ------------------------------------------------------------------ */

chrome.runtime.onMessage.addListener((message: PageRequest, _sender, sendResponse) => {
  (async () => {
    try {
      let data: any = true;
      switch (message.type) {
        case 'PING': data = true; break;
        case 'PICK_START': data = await startPick(message.mode, message.index); break;
        case 'PICK_STOP': cancelPick(); data = true; break;
        case 'OVERLAY_SET': setOverlay(message.overlay, message.payload); data = true; break;
        case 'CSS_INJECT': injectCss(message.id, message.css); data = true; break;
        case 'CSS_REMOVE': removeCss(message.id); data = true; break;
        case 'QUERY': {
          if (message.what === 'console' && message.payload?.clear) { commandMainWorld('clear-console'); data = true; }
          else if (message.what === 'network' && message.payload?.clear) { commandMainWorld('clear-network'); data = true; }
          else data = await query(message.what, message.payload);
          break;
        }
        case 'EVAL': {
          const result = new Function(`"use strict";${message.code}`)();
          try { data = JSON.parse(JSON.stringify(result ?? null)); } catch { data = String(result); }
          break;
        }
        case 'SCROLL_TO': {
          const target = document.querySelector(message.selector);
          if (!target) throw new Error('Element not found.');
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          data = true;
          break;
        }
        case 'FILTER_SET': setFilter(message.kind, message.value); data = true; break;
        case 'PRINT': window.print(); data = true; break;
        case 'RESET': {
          cancelPick('Reset.');
          setOverlay('none');
          document.querySelectorAll('style[id^="fdu-style-"]').forEach((el) => el.remove());
          setFilter('dark', null);
          setFilter('colorblind', null);
          data = true;
          break;
        }
        default: throw new Error(`Unknown message: ${(message as any)?.type}`);
      }
      sendResponse({ ok: true, data } as PageResponse);
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) } as PageResponse);
    }
  })();
  return true;
});
