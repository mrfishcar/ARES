/**
 * useTheme Hook - Sprint R9
 * Manages theme data fetching and mutations
 */

import { useState, useEffect, useCallback } from 'react';
import { query, mutate } from '../lib/api';

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

const QUERY_LIST_THEMES = `
  query {
    listThemes {
      id
      name
      colors
      background
      hero
      createdAt
      updatedAt
    }
  }
`;

const QUERY_GET_THEME = `
  query GetTheme($id: ID!) {
    getTheme(id: $id) {
      id
      name
      colors
      background
      hero
      createdAt
      updatedAt
    }
  }
`;

const MUTATION_SAVE_THEME = `
  mutation SaveTheme($id: ID, $name: String!, $colors: JSON!, $background: JSON!, $hero: JSON) {
    saveTheme(id: $id, name: $name, colors: $colors, background: $background, hero: $hero) {
      id
      name
      colors
      background
      hero
      createdAt
      updatedAt
    }
  }
`;

const MUTATION_DELETE_THEME = `
  mutation DeleteTheme($id: ID!) {
    deleteTheme(id: $id)
  }
`;

export function useThemes() {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadThemes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await query<{ listThemes: Theme[] }>(QUERY_LIST_THEMES, {});
      setThemes(result.listThemes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load themes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadThemes();
  }, [loadThemes]);

  const saveTheme = useCallback(
    async (
      name: string,
      colors: ThemeColors,
      background: ThemeBackground,
      hero?: ThemeHero,
      id?: string
    ): Promise<Theme> => {
      const result = await mutate<{ saveTheme: Theme }>(MUTATION_SAVE_THEME, {
        id,
        name,
        colors,
        background,
        hero,
      });

      await loadThemes();
      return result.saveTheme;
    },
    [loadThemes]
  );

  const deleteTheme = useCallback(
    async (id: string): Promise<boolean> => {
      const result = await mutate<{ deleteTheme: boolean }>(MUTATION_DELETE_THEME, { id });
      if (result.deleteTheme) {
        await loadThemes();
      }
      return result.deleteTheme;
    },
    [loadThemes]
  );

  return {
    themes,
    loading,
    error,
    loadThemes,
    saveTheme,
    deleteTheme,
  };
}

export function useTheme(id?: string) {
  const [theme, setTheme] = useState<Theme | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setTheme(null);
      return;
    }

    const loadTheme = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await query<{ getTheme: Theme }>(QUERY_GET_THEME, { id });
        setTheme(result.getTheme);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load theme');
      } finally {
        setLoading(false);
      }
    };

    loadTheme();
  }, [id]);

  return { theme, loading, error };
}
