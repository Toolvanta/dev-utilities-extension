export type ToolCategory = 'core' | 'design' | 'qa' | 'export' | 'productivity' | 'extras';

export type ToolMode = 'font' | 'css' | 'selector' | 'measure' | 'image' | 'element' | 'color';

export type OverlayType = 'none' | 'boxmodel' | 'grid' | 'ruler' | 'headings' | 'a11y';

export type QueryKind =
  | 'selected'
  | 'styles'
  | 'variables'
  | 'images'
  | 'headings'
  | 'links'
  | 'animations'
  | 'breakpoints'
  | 'a11y'
  | 'performance'
  | 'storage'
  | 'fonts'
  | 'colors'
  | 'rect'
  | 'console'
  | 'network';

export type PageRequest =
  | { type: 'PING' }
  | { type: 'PICK_START'; mode: ToolMode; index?: number }
  | { type: 'PICK_STOP' }
  | { type: 'OVERLAY_SET'; overlay: OverlayType; payload?: any }
  | { type: 'CSS_INJECT'; id: string; css: string }
  | { type: 'CSS_REMOVE'; id: string }
  | { type: 'QUERY'; what: QueryKind; payload?: any }
  | { type: 'EVAL'; code: string }
  | { type: 'SCROLL_TO'; selector: string }
  | { type: 'FILTER_SET'; kind: 'dark' | 'colorblind'; value: string | null }
  | { type: 'PRINT' }
  | { type: 'RESET' };

export interface PageResponse {
  ok: boolean;
  data?: any;
  error?: string;
}

export interface RectInfo {
  x: number; y: number; top: number; left: number;
  width: number; height: number; right: number; bottom: number;
}

export interface PickedElement {
  tag: string;
  id: string;
  classes: string[];
  selector: string;
  xpath: string;
  text: string;
  html: string;
  outerHtml: string;
  rect: RectInfo;
  font: { family: string; size: string; weight: string; lineHeight: string; letterSpacing: string; style: string };
  color: { foreground: string; background: string };
  styles: { property: string; value: string }[];
}

export interface ImageInfo {
  index: number; src: string; alt: string; width: number; height: number;
  naturalWidth: number; naturalHeight: number; loading: string; srcset: string; complete: boolean;
}

export interface HeadingInfo { level: number; text: string; selector: string }
export interface LinkInfo { href: string; text: string; target: string; rel: string; issue?: string }
export interface AnimationInfo { name: string; duration: string; delay: string; iteration: string; state: string; target: string }
export interface BreakpointInfo { condition: string; source: string; matches: boolean }
export interface A11yIssue { type: 'error' | 'warning'; message: string; selector: string }
export interface StorageInfo {
  local: { key: string; value: string }[];
  session: { key: string; value: string }[];
  cookies: { name: string; value: string }[];
  indexedDb: string[];
}
export interface PerformanceInfo {
  domNodes: number;
  resourceCount: number;
  resourceBytes: number;
  navigation: Record<string, number | string>;
  paint: Record<string, number>;
  fcp: number | null;
  lcp: number | null;
}
export interface ConsoleEntry { level: string; text: string; time: string }
export interface NetworkEntry { method: string; url: string; status: number; duration: number; size: number; time: string; type: string }
export interface ColorUsage { color: string; count: number; property: string; sample: string }
export interface FontUsage { family: string; size: string; weight: string; count: number; sample: string }
