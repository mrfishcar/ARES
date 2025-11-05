/**
 * Theme Resolvers - Sprint R8
 * GraphQL resolvers for theme management
 */

import { listThemes, getTheme, saveTheme, deleteTheme } from '../../storage/theme';
import { incrementCounter } from '../../monitor/metrics';

export const themeResolvers = {
  Query: {
    /**
     * List all themes
     */
    listThemes: () => {
      incrementCounter('api_list_themes_total');
      return listThemes();
    },

    /**
     * Get a specific theme by ID
     */
    getTheme: (_: any, { id }: { id: string }) => {
      incrementCounter('api_get_theme_total');
      return getTheme(id);
    },
  },

  Mutation: {
    /**
     * Save or update a theme
     */
    saveTheme: (
      _: any,
      args: {
        id?: string;
        name: string;
        colors: any;
        background: any;
        hero?: any;
      }
    ) => {
      const theme = saveTheme(args.id, args.name, args.colors, args.background, args.hero);
      incrementCounter(args.id ? 'theme_updated_total' : 'theme_created_total');
      return theme;
    },

    /**
     * Delete a theme
     */
    deleteTheme: (_: any, { id }: { id: string }) => {
      const success = deleteTheme(id);
      if (success) {
        incrementCounter('theme_deleted_total');
      }
      return success;
    },
  },
};
