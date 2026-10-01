// Some browsers refuse to hand out localStorage at all (private modes, blocked site data, sandboxed frames): even reading
// `window.localStorage` throws. Everything here is "nice to have" (autosave, backups, remembered tabs), so if the real one
// is unusable, swap in a memory one for this visit instead of letting the app fail to start.
function usable(): boolean {
  try {
    const k = "__hs_probe__";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

if (typeof window !== "undefined" && !usable()) {
  for (const name of ["localStorage", "sessionStorage"] as const) {
    try {
      Object.defineProperty(window, name, { value: memoryStorage(), configurable: true });
    } catch {
      /* nothing more can be done */
    }
  }
}

export {};
