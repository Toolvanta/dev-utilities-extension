const PREFIX = 'fdu.';

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const result = await chrome.storage.sync.get(PREFIX + key);
    const value = result[PREFIX + key];
    return value === undefined ? fallback : (value as T);
  } catch {
    return fallback;
  }
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await chrome.storage.sync.set({ [PREFIX + key]: value });
}

export async function getLocal<T>(key: string, fallback: T): Promise<T> {
  try {
    const result = await chrome.storage.local.get(PREFIX + key);
    const value = result[PREFIX + key];
    return value === undefined ? fallback : (value as T);
  } catch {
    return fallback;
  }
}

export async function setLocal<T>(key: string, value: T): Promise<void> {
  await chrome.storage.local.set({ [PREFIX + key]: value });
}

export async function addHistory<T>(key: string, value: T, limit = 40): Promise<T[]> {
  const current = await getLocal<T[]>(key, []);
  const next = [value, ...current.filter((item) => JSON.stringify(item) !== JSON.stringify(value))].slice(0, limit);
  await setLocal(key, next);
  return next;
}

export async function clearHistory(key: string): Promise<void> {
  await setLocal(key, []);
}

export async function onStorageChanged(
  key: string,
  callback: (value: any) => void,
  area: 'sync' | 'local' = 'sync',
): Promise<() => void> {
  const listener = (changes: { [key: string]: chrome.storage.StorageChange }, changedArea: string) => {
    if (changedArea !== area) return;
    const change = changes[PREFIX + key];
    if (change) callback(change.newValue);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
