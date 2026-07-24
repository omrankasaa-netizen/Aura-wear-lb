const memoryStorage = new Map();

function getLocalStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export const safeStorage = {
  getItem(key) {
    const storage = getLocalStorage();
    if (storage) {
      try {
        return storage.getItem(key);
      } catch {
        return memoryStorage.get(key) ?? null;
      }
    }
    return memoryStorage.get(key) ?? null;
  },
  setItem(key, value) {
    const next = String(value);
    memoryStorage.set(key, next);
    const storage = getLocalStorage();
    if (!storage) return;
    try {
      storage.setItem(key, next);
    } catch {
      /* keep the in-memory fallback */
    }
  },
  removeItem(key) {
    memoryStorage.delete(key);
    const storage = getLocalStorage();
    if (!storage) return;
    try {
      storage.removeItem(key);
    } catch {
      /* keep the in-memory fallback */
    }
  },
};
