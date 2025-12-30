/**
 * Theme Context - Sprint R9
 * Global theme state and CSS variable application
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { Theme, ThemeColors, ThemeBackground } from '../hooks/useTheme';

interface ThemeContextValue {
  activeTheme: Theme | null;
  setActiveTheme: (theme: Theme | null) => void;
  applyTheme: (theme: Theme) => void;
  resetTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
}

const DEFAULT_THEME: Theme = {
  id: 'default',
  name: 'Default',
  colors: {
    primary: '#3b82f6',
    secondary: '#8b5cf6',
    accent: '#10b981',
    background: '#0a0e27',    // Dark background (matches editor)
    surface: '#141829',       // Dark surface (matches editor)
    text: '#e5e7eb',          // Light text for dark bg
    textSecondary: '#9ca3af', // Secondary light text
    border: '#2a2f4a',        // Dark border
  },
  background: {
    type: 'solid',
    value: '#0a0e27',  // Dark background (matches editor)
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

/**
 * Apply theme colors to CSS variables
 */
function applyColorsToCSS(colors: ThemeColors): void {
  const root = document.documentElement;
  root.style.setProperty('--color-primary', colors.primary);
  root.style.setProperty('--color-secondary', colors.secondary);
  root.style.setProperty('--color-accent', colors.accent);
  root.style.setProperty('--color-background', colors.background);
  root.style.setProperty('--color-surface', colors.surface);
  root.style.setProperty('--color-text', colors.text);
  root.style.setProperty('--color-text-secondary', colors.textSecondary);
  root.style.setProperty('--color-border', colors.border);

  // Entity type colors for highlighting (Sprint W2)
  root.style.setProperty('--entity-person-color', '#3b82f6'); // blue
  root.style.setProperty('--entity-place-color', '#10b981'); // green
  root.style.setProperty('--entity-org-color', '#8b5cf6'); // purple
  root.style.setProperty('--entity-event-color', '#f59e0b'); // amber
  root.style.setProperty('--entity-concept-color', '#6366f1'); // indigo
  root.style.setProperty('--entity-object-color', '#ec4899'); // pink
}

/**
 * Apply background to body
 */
function applyBackgroundToBody(background: ThemeBackground): void {
  const body = document.body;

  if (background.type === 'solid') {
    body.style.background = background.value;
    body.style.backdropFilter = 'none';
  } else if (background.type === 'gradient') {
    body.style.background = background.value;
    body.style.backdropFilter = 'none';
  } else if (background.type === 'image') {
    body.style.backgroundImage = `url(${background.value})`;
    body.style.backgroundSize = 'cover';
    body.style.backgroundPosition = 'center';
    body.style.backgroundAttachment = 'fixed';

    if (background.blur) {
      body.style.backdropFilter = `blur(${background.blur}px)`;
    }
  }

  if (background.opacity !== undefined) {
    body.style.opacity = String(background.opacity);
  }
}

export function ThemeProvider({ children, defaultTheme }: ThemeProviderProps) {
  const [activeTheme, setActiveTheme] = useState<Theme | null>(null);

  // Load theme from localStorage on mount
  useEffect(() => {
    const savedThemeId = localStorage.getItem('ares_active_theme');
    if (savedThemeId && savedThemeId !== 'default') {
      // In a real app, we'd load this from the API
      // For now, apply default theme
      applyTheme(defaultTheme || DEFAULT_THEME);
    } else {
      applyTheme(defaultTheme || DEFAULT_THEME);
    }
  }, [defaultTheme]);

  const applyTheme = (theme: Theme) => {
    setActiveTheme(theme);
    applyColorsToCSS(theme.colors);
    applyBackgroundToBody(theme.background);

    // Save to localStorage
    localStorage.setItem('ares_active_theme', theme.id);
  };

  const resetTheme = () => {
    applyTheme(DEFAULT_THEME);
  };

  return (
    <ThemeContext.Provider
      value={{
        activeTheme,
        setActiveTheme,
        applyTheme,
        resetTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeContext() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext must be used within ThemeProvider');
  }
  return context;
}
