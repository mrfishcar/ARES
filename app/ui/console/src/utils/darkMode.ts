/**
 * Dark Mode Theme Management
 *
 * Night Sky Color Palette:
 * - Background: Deep midnight blue
 * - Text: Soft luminous colors
 * - Accents: Aurora, lunar, starlight inspired
 */

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'ares-theme-mode';

/**
 * Get the system's preferred color scheme
 */
export function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Get the effective theme mode (resolving 'system' to actual preference)
 */
export function getEffectiveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    return getSystemTheme();
  }
  return mode;
}

/**
 * Save theme preference to localStorage
 */
export function saveThemePreference(mode: ThemeMode): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, mode);
  }
}

/**
 * Load theme preference from localStorage
 */
export function loadThemePreference(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'system';
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark' || saved === 'system') {
    return saved;
  }
  return 'system';
}

/**
 * Apply theme to document
 */
export function applyTheme(mode: ThemeMode): void {
  const effectiveTheme = getEffectiveTheme(mode);
  const htmlElement = document.documentElement;

  if (effectiveTheme === 'dark') {
    htmlElement.setAttribute('data-theme', 'dark');
    document.body.classList.add('dark-mode');
    document.body.classList.remove('light-mode');
  } else {
    htmlElement.setAttribute('data-theme', 'light');
    document.body.classList.add('light-mode');
    document.body.classList.remove('dark-mode');
  }
}

/**
 * Initialize theme on app load
 */
export function initializeTheme(): ThemeMode {
  const preference = loadThemePreference();
  applyTheme(preference);

  // Listen for system theme changes
  if (typeof window !== 'undefined') {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      const current = loadThemePreference();
      if (current === 'system') {
        applyTheme('system');
      }
    };

    try {
      mediaQuery.addEventListener('change', handleChange);
    } catch {
      // Fallback for older browsers
      mediaQuery.addListener(handleChange);
    }
  }

  return preference;
}

/**
 * Toggle between light and dark theme
 */
export function toggleTheme(): ThemeMode {
  const current = loadThemePreference();
  const effective = getEffectiveTheme(current);
  const newMode: ThemeMode = effective === 'dark' ? 'light' : 'dark';

  saveThemePreference(newMode);
  applyTheme(newMode);

  return newMode;
}

/**
 * Set theme to specific mode
 */
export function setTheme(mode: ThemeMode): void {
  saveThemePreference(mode);
  applyTheme(mode);
}

/**
 * Night Sky Color Palette
 */
export const NIGHT_SKY_PALETTE = {
  light: {
    // Light mode - clean and bright
    background: '#ffffff',
    surface: '#f8f7f6',
    border: '#e8e6e3',
    text: '#4a403a',
    textSecondary: '#8b7e77',
    textTertiary: '#c2b8af',
    heading: '#2d2420',
    accent: '#5a4d46',

    // Markdown colors (light)
    headingColor: '#2d2420',
    linkColor: '#3b82f6',
    quoteColor: '#9ca3af',
    codeBackground: '#fef4e6',
    codeColor: '#c28b6b',
  },
  dark: {
    // Dark mode - night sky theme
    background: '#0a0e27',       // Deep midnight blue
    surface: '#141829',          // Slightly lighter midnight
    border: '#2a2f4a',           // Twilight blue
    text: '#e8e6e1',             // Soft starlight
    textSecondary: '#a8b5cc',    // Twilight gray-blue
    textTertiary: '#6d7a99',     // Deep twilight
    heading: '#f0ede8',          // Bright starlight
    accent: '#64d5ff',           // Lunar glow cyan

    // Markdown colors (dark)
    headingColor: '#7dd3fc',     // Sky blue
    linkColor: '#bb86fc',        // Aurora violet
    quoteColor: '#a8b5cc',       // Twilight blue
    codeBackground: '#1a1f3a',   // Code night
    codeColor: '#ffd89b',        // Golden starlight
  },
};

/**
 * Entity highlight colors for dark mode
 */
export const DARK_MODE_ENTITY_COLORS = {
  PERSON: '#8dd3ff',      // Cool sky blue
  PLACE: '#7dd3fc',       // Cyan
  ORG: '#c4b5fd',         // Soft purple
  EVENT: '#fdbf74',       // Warm golden
  CONCEPT: '#a78bfa',     // Lavender
  OBJECT: '#f472b6',      // Soft pink
  RACE: '#d8b4fe',        // Light purple
  CREATURE: '#fb923c',    // Warm orange
  ARTIFACT: '#facc15',    // Golden yellow
  TECHNOLOGY: '#06b6d4',  // Cyan accent
  MAGIC: '#e879f9',       // Bright magenta
  LANGUAGE: '#14b8a6',    // Teal
  CURRENCY: '#bfdbfe',    // Light blue
  MATERIAL: '#cbd5e1',    // Cool gray
  DRUG: '#f87171',        // Soft red
  DEITY: '#fbbf24',       // Golden
  ABILITY: '#d8b4fe',     // Light purple
  SKILL: '#7dd3fc',       // Sky blue
  POWER: '#f472b6',       // Pink
  TECHNIQUE: '#fde047',   // Yellow
  SPELL: '#86efac',       // Soft green
  DATE: '#d8b4fe',        // Purple
  TIME: '#7dd3fc',        // Cyan
  WORK: '#f0abfc',        // Bright purple
  ITEM: '#fdba74',        // Warm orange
  MISC: '#9ca3af',        // Gray
  SPECIES: '#6ee7b7',     // Emerald
  HOUSE: '#f97316',       // Vivid orange
  TRIBE: '#ea580c',       // Deep orange
  TITLE: '#8dd3ff',       // Sky blue
};
