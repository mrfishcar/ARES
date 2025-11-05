/**
 * Session Storage Utilities - Sprint R5
 * Persist UI state (project, filters, cursors) in sessionStorage
 */

const STORAGE_PREFIX = 'ares_console_';

export interface PersistedState {
  project: string;
  entityFilters?: {
    type?: string;
    nameContains?: string;
  };
  relationFilters?: {
    predicate?: string;
    nameContains?: string;
  };
  entityCursor?: string;
  relationCursor?: string;
}

/**
 * Save state to sessionStorage
 */
export function saveState(key: string, value: any): void {
  try {
    sessionStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
  } catch (error) {
    console.error('Failed to save state:', error);
  }
}

/**
 * Load state from sessionStorage
 */
export function loadState<T>(key: string, defaultValue: T): T {
  try {
    const item = sessionStorage.getItem(`${STORAGE_PREFIX}${key}`);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.error('Failed to load state:', error);
    return defaultValue;
  }
}

/**
 * Clear all persisted state
 */
export function clearState(): void {
  try {
    const keys = Object.keys(sessionStorage);
    keys.forEach(key => {
      if (key.startsWith(STORAGE_PREFIX)) {
        sessionStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.error('Failed to clear state:', error);
  }
}
