import { useSyncExternalStore } from 'react';

/** A tiny global store (no extra dependency). */
export function createStore<T extends object>(initial: T, persistKey?: string, persistFields?: Array<keyof T>) {
  let state = initial;
  if (persistKey) {
    try {
      const saved = JSON.parse(localStorage.getItem(persistKey) ?? 'null');
      if (saved && typeof saved === 'object') state = { ...state, ...saved };
    } catch {
      // storage not available
    }
  }
  const listeners = new Set<() => void>();
  const get = () => state;
  const set = (patch: Partial<T> | ((s: T) => Partial<T>)) => {
    const next = typeof patch === 'function' ? patch(state) : patch;
    state = { ...state, ...next };
    if (persistKey) {
      try {
        const toSave = persistFields ? Object.fromEntries(persistFields.map((f) => [f, state[f]])) : state;
        localStorage.setItem(persistKey, JSON.stringify(toSave));
      } catch {
        // ignore
      }
    }
    for (const l of listeners) l();
  };
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  function useStore<R>(selector: (s: T) => R): R {
    return useSyncExternalStore(subscribe, () => selector(state), () => selector(state));
  }
  return { get, set, subscribe, useStore };
}

export interface UiState {
  /** 'today', 'target' or a scenario id */
  scenario: string;
  /** Model date for the time slider (null = today) */
  at: string | null;
  inspectId: string | null;
  commandOpen: boolean;
  addOpen: boolean;
  addType: string | null;
  importOpen: boolean;
  importFiles: File[];
  connectAgentOpen: boolean;
  sidebarCollapsed: boolean;
  notation: 'cards' | 'archimate';
}

export const ui = createStore<UiState>(
  {
    scenario: 'today',
    at: null,
    inspectId: null,
    commandOpen: false,
    addOpen: false,
    addType: null,
    importOpen: false,
    importFiles: [],
    connectAgentOpen: false,
    sidebarCollapsed: false,
    notation: 'cards',
  },
  'atrium.ui',
  ['scenario', 'sidebarCollapsed', 'notation'],
);

export const useUi = ui.useStore;

export function inspect(id: string | null) {
  ui.set({ inspectId: id });
}

export function openImport(files: File[] = []) {
  ui.set({ importOpen: true, importFiles: files });
}

export function openAdd(type: string | null = null) {
  ui.set({ addOpen: true, addType: type });
}
