/**
 * useAutomation Hook - Sprint R10
 * Manages automation modes and hands-on/off settings
 */

import { useState, useEffect, useCallback } from 'react';
import { query, mutate } from '../lib/api';

export interface AutomationConfig {
  mode: number; // 0 = Manual, 1 = Assist, 2 = Auto (Safe), 3 = Flow (Creative)
  autoConfirmThreshold: number;
  handsOffMode: boolean;
}

const AUTOMATION_MODE_NAMES = ['Manual', 'Assist', 'Auto (Safe)', 'Flow'];
const DEFAULT_THRESHOLDS = [1.0, 0.95, 0.8, 0.7]; // Thresholds for each mode

const QUERY_GET_AUTOMATION_CONFIG = `
  query GetAutomationConfig($project: String!) {
    getAutomationConfig(project: $project) {
      mode
      autoConfirmThreshold
      handsOffMode
    }
  }
`;

const MUTATION_SET_AUTOMATION_CONFIG = `
  mutation SetAutomationConfig(
    $project: String!
    $mode: Int!
    $autoConfirmThreshold: Float
    $handsOffMode: Boolean
  ) {
    setAutomationConfig(
      project: $project
      mode: $mode
      autoConfirmThreshold: $autoConfirmThreshold
      handsOffMode: $handsOffMode
    ) {
      mode
      autoConfirmThreshold
      handsOffMode
    }
  }
`;

export function useAutomation(project: string) {
  const [config, setConfig] = useState<AutomationConfig>({
    mode: 1, // Default to Assist mode
    autoConfirmThreshold: 0.95,
    handsOffMode: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await query<{ getAutomationConfig: AutomationConfig }>(
        QUERY_GET_AUTOMATION_CONFIG,
        { project }
      );
      setConfig(result.getAutomationConfig);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load automation config');
      // Fall back to localStorage if API fails
      const saved = localStorage.getItem(`ares_automation_${project}`);
      if (saved) {
        setConfig(JSON.parse(saved));
      }
    } finally {
      setLoading(false);
    }
  }, [project]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const setMode = useCallback(
    async (mode: number): Promise<void> => {
      const threshold = DEFAULT_THRESHOLDS[mode] || 0.95;

      try {
        const result = await mutate<{ setAutomationConfig: AutomationConfig }>(
          MUTATION_SET_AUTOMATION_CONFIG,
          {
            project,
            mode,
            autoConfirmThreshold: threshold,
            handsOffMode: config.handsOffMode,
          }
        );

        setConfig(result.setAutomationConfig);

        // Also save to localStorage for offline support
        localStorage.setItem(
          `ares_automation_${project}`,
          JSON.stringify(result.setAutomationConfig)
        );
      } catch (err) {
        throw new Error(
          `Failed to set automation mode: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      }
    },
    [project, config.handsOffMode]
  );

  const setThreshold = useCallback(
    async (threshold: number): Promise<void> => {
      try {
        const result = await mutate<{ setAutomationConfig: AutomationConfig }>(
          MUTATION_SET_AUTOMATION_CONFIG,
          {
            project,
            mode: config.mode,
            autoConfirmThreshold: threshold,
            handsOffMode: config.handsOffMode,
          }
        );

        setConfig(result.setAutomationConfig);
        localStorage.setItem(
          `ares_automation_${project}`,
          JSON.stringify(result.setAutomationConfig)
        );
      } catch (err) {
        throw new Error(
          `Failed to set threshold: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      }
    },
    [project, config.mode, config.handsOffMode]
  );

  const toggleHandsOff = useCallback(async (): Promise<void> => {
    const newHandsOffMode = !config.handsOffMode;

    try {
      const result = await mutate<{ setAutomationConfig: AutomationConfig }>(
        MUTATION_SET_AUTOMATION_CONFIG,
        {
          project,
          mode: config.mode,
          autoConfirmThreshold: config.autoConfirmThreshold,
          handsOffMode: newHandsOffMode,
        }
      );

      setConfig(result.setAutomationConfig);
      localStorage.setItem(
        `ares_automation_${project}`,
        JSON.stringify(result.setAutomationConfig)
      );
    } catch (err) {
      throw new Error(
        `Failed to toggle hands-off mode: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  }, [project, config]);

  const getModeName = useCallback((): string => {
    return AUTOMATION_MODE_NAMES[config.mode] || 'Unknown';
  }, [config.mode]);

  const shouldAutoConfirm = useCallback(
    (confidence: number): boolean => {
      if (config.mode === 0) return false; // Manual mode never auto-confirms
      return confidence >= config.autoConfirmThreshold;
    },
    [config]
  );

  return {
    config,
    loading,
    error,
    loadConfig,
    setMode,
    setThreshold,
    toggleHandsOff,
    getModeName,
    shouldAutoConfirm,
  };
}
