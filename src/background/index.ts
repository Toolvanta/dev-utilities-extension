/// <reference types="chrome" />

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get('fdu.installed', (result) => {
    if (!result['fdu.installed']) {
      chrome.storage.sync.set({ 'fdu.installed': true, 'fdu.lastTool': 'color-picker', 'fdu.accent': '#38bdf8' });
    }
  });
  try {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  } catch { /* older browsers */ }
});

async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function focusTool(toolId: string) {
  await chrome.storage.sync.set({ 'fdu.lastTool': toolId });
  try { await chrome.runtime.sendMessage({ type: 'FOCUS_TOOL', toolId }); } catch { /* no UI open */ }
}

chrome.commands.onCommand.addListener(async (command) => {
  const tab = await activeTab();
  if (command === 'open-utility' && tab?.id) {
    try { await chrome.sidePanel.open({ tabId: tab.id }); } catch { /* fallback to popup */ }
  }
  if (command === 'pick-color') {
    if (tab?.id) { try { await chrome.sidePanel.open({ tabId: tab.id }); } catch {} }
    await focusTool('color-picker');
  }
  if (command === 'capture-screen') {
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(undefined, { format: 'png' });
      await chrome.downloads.download({
        url: dataUrl,
        filename: `screenshot-${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
        saveAs: false,
      });
    } catch { /* restricted page or no active tab */ }
  }
});

chrome.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
  if (message?.type === 'OPEN_EDITOR') {
    chrome.tabs.create({ url: chrome.runtime.getURL('annotate.html') });
    sendResponse({ ok: true });
    return true;
  }
  if (message?.type === 'FOCUS_TOOL') {
    sendResponse({ ok: true });
    return true;
  }
  return undefined;
});
