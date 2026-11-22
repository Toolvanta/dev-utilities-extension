import type { OverlayType, PageRequest, PageResponse, QueryKind, ToolMode } from './types';

export class ExtensionError extends Error {}

export async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.id) throw new ExtensionError('No active tab found.');
  if (/^(chrome|edge|about|moz-extension|chrome-extension):/.test(tab.url || '')) {
    throw new ExtensionError('This page is restricted by the browser. Try a normal website.');
  }
  return tab;
}

export async function sendToTab<T = any>(message: PageRequest): Promise<T> {
  const tab = await getActiveTab();
  const reply = (await chrome.tabs.sendMessage(tab.id!, message)) as PageResponse | undefined;
  if (!reply) throw new ExtensionError('The page did not respond. Try reloading it.');
  if (!reply.ok) throw new ExtensionError(reply.error || 'The page could not complete that action.');
  return reply.data as T;
}

export const page = {
  ping: () => sendToTab<boolean>({ type: 'PING' }),

  pick: <T = any>(mode: ToolMode, index?: number) =>
    sendToTab<T>({ type: 'PICK_START', mode, index }),

  stopPick: () => sendToTab<boolean>({ type: 'PICK_STOP' }),

  overlay: (overlay: OverlayType, payload?: any) =>
    sendToTab<boolean>({ type: 'OVERLAY_SET', overlay, payload }),

  injectCss: (id: string, css: string) =>
    sendToTab<boolean>({ type: 'CSS_INJECT', id, css }),

  removeCss: (id: string) => sendToTab<boolean>({ type: 'CSS_REMOVE', id }),

  query: <T = any>(what: QueryKind, payload?: any) =>
    sendToTab<T>({ type: 'QUERY', what, payload }),

  eval: <T = any>(code: string) => sendToTab<T>({ type: 'EVAL', code }),

  scrollTo: (selector: string) => sendToTab<boolean>({ type: 'SCROLL_TO', selector }),

  setFilter: (kind: 'dark' | 'colorblind', value: string | null) =>
    sendToTab<boolean>({ type: 'FILTER_SET', kind, value }),

  print: () => sendToTab<boolean>({ type: 'PRINT' }),

  reset: () => sendToTab<boolean>({ type: 'RESET' }),
};

export async function sendToBackground<T = any>(message: any): Promise<T> {
  const reply = (await chrome.runtime.sendMessage(message)) as PageResponse | undefined;
  if (!reply) throw new ExtensionError('Background worker did not respond.');
  if (!reply.ok) throw new ExtensionError(reply.error || 'Background action failed.');
  return reply.data as T;
}

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
