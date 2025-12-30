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
 *
 * CRITICAL iOS FIX: Apply backgrounds with !important to html/body
 * This prevents white Safari void from showing behind keyboard
 * Lessons from ExactWorkingReplica blue test (commit history)
 */
export function applyTheme(mode: ThemeMode): void {
  const effectiveTheme = getEffectiveTheme(mode);
  const htmlElement = document.documentElement;
  const bodyElement = document.body;
  const rootElement = document.getElementById('root');

  if (effectiveTheme === 'dark') {
    // Dark theme - night sky
    htmlElement.setAttribute('data-theme', 'dark');
    bodyElement.classList.add('dark-mode');
    bodyElement.classList.remove('light-mode');

    // Apply bedrock backgrounds with !important (iOS keyboard fix)
    htmlElement.style.setProperty('background', NIGHT_SKY_PALETTE.dark.background, 'important');
    bodyElement.style.setProperty('background', NIGHT_SKY_PALETTE.dark.background, 'important');
    bodyElement.style.setProperty('color', NIGHT_SKY_PALETTE.dark.text, 'important');
    bodyElement.style.setProperty('margin', '0', 'important');
    if (rootElement) {
      rootElement.style.setProperty('background', NIGHT_SKY_PALETTE.dark.background, 'important');
      rootElement.style.setProperty('min-height', '100%', 'important');
    }
  } else {
    // Light theme - warm
    htmlElement.setAttribute('data-theme', 'light');
    bodyElement.classList.add('light-mode');
    bodyElement.classList.remove('dark-mode');

    // Apply bedrock backgrounds with !important (iOS keyboard fix)
    htmlElement.style.setProperty('background', NIGHT_SKY_PALETTE.light.background, 'important');
    bodyElement.style.setProperty('background', NIGHT_SKY_PALETTE.light.background, 'important');
    bodyElement.style.setProperty('color', NIGHT_SKY_PALETTE.light.text, 'important');
    bodyElement.style.setProperty('margin', '0', 'important');
    if (rootElement) {
      rootElement.style.setProperty('background', NIGHT_SKY_PALETTE.light.background, 'important');
      rootElement.style.setProperty('min-height', '100%', 'important');
    }
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
    // Light mode - warm theme
    background: '#FFF9F0',       // Warm light background
    surface: '#FFF4E6',          // Light warm surface
    border: '#E8DED5',           // Soft border
    text: '#4A403A',             // Warm dark text
    textSecondary: '#8B7E77',    // Secondary text
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
