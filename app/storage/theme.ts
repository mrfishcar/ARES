/**
 * Theme Storage - Sprint R8
 * Persistent storage for visual themes
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
}

export interface ThemeBackground {
  type: 'solid' | 'gradient' | 'image';
  value: string;
  blur?: number;
  opacity?: number;
}

export interface ThemeHero {
  title?: string;
  subtitle?: string;
  image?: string;
  gradient?: string;
}

export interface Theme {
  id: string;
  name: string;
  colors: ThemeColors;
  background: ThemeBackground;
  hero?: ThemeHero;
  createdAt: string;
  updatedAt: string;
}

export interface ThemeStore {
  themes: Theme[];
  defaultThemeId?: string;
}

/**
 * Get path to themes data file
 */
function getThemesPath(): string {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, 'themes.json');
}

/**
 * Load all themes from disk
 */
export function loadThemes(): ThemeStore {
  const themesPath = getThemesPath();

  if (!fs.existsSync(themesPath)) {
    // Create default theme
    const defaultTheme: Theme = {
      id: 'default',
      name: 'Default',
      colors: {
        primary: '#3b82f6',
        secondary: '#8b5cf6',
        accent: '#10b981',
        background: '#ffffff',
        surface: '#f9fafb',
        text: '#111827',
        textSecondary: '#6b7280',
        border: '#e5e7eb',
      },
      background: {
        type: 'solid',
        value: '#ffffff',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const store: ThemeStore = {
      themes: [defaultTheme],
      defaultThemeId: 'default',
    };

    fs.writeFileSync(themesPath, JSON.stringify(store, null, 2));
    return store;
  }

  const content = fs.readFileSync(themesPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Save themes to disk
 */
export function saveThemes(store: ThemeStore): void {
  const themesPath = getThemesPath();
  fs.writeFileSync(themesPath, JSON.stringify(store, null, 2));
}

/**
 * Get a specific theme by ID
 */
export function getTheme(id: string): Theme | null {
  const store = loadThemes();
  return store.themes.find(t => t.id === id) || null;
}

/**
 * Save or update a theme
 */
export function saveTheme(
  id: string | undefined,
  name: string,
  colors: any,
  background: any,
  hero?: any
): Theme {
  const store = loadThemes();
  const now = new Date().toISOString();

  if (id) {
    // Update existing theme
    const index = store.themes.findIndex(t => t.id === id);
    if (index === -1) {
      throw new Error(`Theme not found: ${id}`);
    }

    const theme: Theme = {
      ...store.themes[index],
      name,
      colors,
      background,
      hero,
      updatedAt: now,
    };

    store.themes[index] = theme;
    saveThemes(store);
    return theme;
  } else {
    // Create new theme
    const theme: Theme = {
      id: uuidv4(),
      name,
      colors,
      background,
      hero,
      createdAt: now,
      updatedAt: now,
    };

    store.themes.push(theme);
    saveThemes(store);
    return theme;
  }
}

/**
 * Delete a theme
 */
export function deleteTheme(id: string): boolean {
  if (id === 'default') {
    throw new Error('Cannot delete default theme');
  }

  const store = loadThemes();
  const initialLength = store.themes.length;
  store.themes = store.themes.filter(t => t.id !== id);

  if (store.themes.length < initialLength) {
    saveThemes(store);
    return true;
  }

  return false;
}

/**
 * Get all themes
 */
export function listThemes(): Theme[] {
  const store = loadThemes();
  return store.themes;
}

/**
 * Get default theme
 */
export function getDefaultTheme(): Theme {
  const store = loadThemes();
  if (store.defaultThemeId) {
    const theme = store.themes.find(t => t.id === store.defaultThemeId);
    if (theme) return theme;
  }
  // Fallback to first theme
  return store.themes[0];
}
