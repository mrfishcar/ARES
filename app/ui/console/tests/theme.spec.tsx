/**
 * Theme System Tests - Sprint R9
 * Tests for theming functionality, persistence, and CSS variable application
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useThemes, useTheme } from '../src/hooks/useTheme';
import { ThemeProvider, useThemeContext } from '../src/context/ThemeContext';
import type { Theme } from '../src/hooks/useTheme';

// Mock the API module
vi.mock('../src/lib/api', () => ({
  query: vi.fn(),
  mutate: vi.fn(),
}));

import { query, mutate } from '../src/lib/api';

describe('Theme System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('useThemes hook', () => {
    it('should load themes from API', async () => {
      const mockThemes: Theme[] = [
        {
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
          background: { type: 'solid', value: '#ffffff' },
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      vi.mocked(query).mockResolvedValue({ listThemes: mockThemes });

      const { result } = renderHook(() => useThemes());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.themes).toEqual(mockThemes);
      expect(result.current.error).toBeNull();
    });

    it('should handle loading error', async () => {
      vi.mocked(query).mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useThemes());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Network error');
      expect(result.current.themes).toEqual([]);
    });

    it('should save new theme via mutation', async () => {
      const newTheme: Theme = {
        id: 'custom',
        name: 'Custom Theme',
        colors: {
          primary: '#ff0000',
          secondary: '#00ff00',
          accent: '#0000ff',
          background: '#000000',
          surface: '#111111',
          text: '#ffffff',
          textSecondary: '#cccccc',
          border: '#333333',
        },
        background: { type: 'gradient', value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      vi.mocked(query).mockResolvedValue({ listThemes: [] });
      vi.mocked(mutate).mockResolvedValue({ saveTheme: newTheme });

      const { result } = renderHook(() => useThemes());

      await act(async () => {
        await result.current.saveTheme(
          newTheme.name,
          newTheme.colors,
          newTheme.background
        );
      });

      expect(mutate).toHaveBeenCalledWith(
        expect.stringContaining('saveTheme'),
        expect.objectContaining({ name: 'Custom Theme' })
      );
    });

    it('should delete theme via mutation', async () => {
      vi.mocked(query).mockResolvedValue({ listThemes: [] });
      vi.mocked(mutate).mockResolvedValue({ deleteTheme: true });

      const { result } = renderHook(() => useThemes());

      await act(async () => {
        await result.current.deleteTheme('custom-theme-id');
      });

      expect(mutate).toHaveBeenCalledWith(
        expect.stringContaining('deleteTheme'),
        { themeId: 'custom-theme-id' }
      );
    });
  });

  describe('useTheme hook (single theme)', () => {
    it('should load single theme by ID', async () => {
      const mockTheme: Theme = {
        id: 'test-theme',
        name: 'Test Theme',
        colors: {
          primary: '#ff0000',
          secondary: '#00ff00',
          accent: '#0000ff',
          background: '#ffffff',
          surface: '#f9fafb',
          text: '#111827',
          textSecondary: '#6b7280',
          border: '#e5e7eb',
        },
        background: { type: 'solid', value: '#ffffff' },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      vi.mocked(query).mockResolvedValue({ getTheme: mockTheme });

      const { result } = renderHook(() => useTheme('test-theme'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.theme).toEqual(mockTheme);
      expect(result.current.error).toBeNull();
    });
  });

  describe('ThemeContext and CSS variables', () => {
    it('should apply theme colors to CSS variables', async () => {
      const mockTheme: Theme = {
        id: 'test',
        name: 'Test',
        colors: {
          primary: '#ff0000',
          secondary: '#00ff00',
          accent: '#0000ff',
          background: '#ffffff',
          surface: '#f9fafb',
          text: '#111827',
          textSecondary: '#6b7280',
          border: '#e5e7eb',
        },
        background: { type: 'solid', value: '#ffffff' },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const { result } = renderHook(() => useThemeContext(), {
        wrapper: ThemeProvider,
      });

      act(() => {
        result.current.applyTheme(mockTheme);
      });

      const root = document.documentElement;
      expect(root.style.getPropertyValue('--color-primary')).toBe('#ff0000');
      expect(root.style.getPropertyValue('--color-secondary')).toBe('#00ff00');
      expect(root.style.getPropertyValue('--color-accent')).toBe('#0000ff');
    });

    it('should persist theme ID to localStorage', async () => {
      const mockTheme: Theme = {
        id: 'persistent-theme',
        name: 'Persistent',
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
        background: { type: 'solid', value: '#ffffff' },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const { result } = renderHook(() => useThemeContext(), {
        wrapper: ThemeProvider,
      });

      act(() => {
        result.current.applyTheme(mockTheme);
      });

      expect(localStorage.getItem('ares_active_theme')).toBe('persistent-theme');
    });

    it('should reset to default theme', async () => {
      const { result } = renderHook(() => useThemeContext(), {
        wrapper: ThemeProvider,
      });

      act(() => {
        result.current.resetTheme();
      });

      expect(result.current.activeTheme?.id).toBe('default');
    });

    it('should apply gradient background', async () => {
      const gradientTheme: Theme = {
        id: 'gradient',
        name: 'Gradient Theme',
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
          type: 'gradient',
          value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const { result } = renderHook(() => useThemeContext(), {
        wrapper: ThemeProvider,
      });

      act(() => {
        result.current.applyTheme(gradientTheme);
      });

      expect(document.body.style.background).toContain('linear-gradient');
    });

    it('should apply image background with blur', async () => {
      const imageTheme: Theme = {
        id: 'image',
        name: 'Image Theme',
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
          type: 'image',
          value: 'https://example.com/bg.jpg',
          blur: 5,
        },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const { result } = renderHook(() => useThemeContext(), {
        wrapper: ThemeProvider,
      });

      act(() => {
        result.current.applyTheme(imageTheme);
      });

      expect(document.body.style.backgroundImage).toContain('url(https://example.com/bg.jpg)');
      expect(document.body.style.backdropFilter).toBe('blur(5px)');
    });
  });
});
