/**
 * Automation Slider - Sprint R10
 * Control automation modes and hands-on/off settings
 */

import { useState } from 'react';
import { useAutomation } from '../hooks/useAutomation';

interface AutomationSliderProps {
  project: string;
}

const MODE_INFO = [
  {
    mode: 0,
    name: 'Manual',
    icon: '✋',
    description: 'Review every suggestion manually',
    color: '#6b7280',
  },
  {
    mode: 1,
    name: 'Assist',
    icon: '👀',
    description: 'Suggestions only, you confirm',
    color: '#3b82f6',
  },
  {
    mode: 2,
    name: 'Auto (Safe)',
    icon: '🤖',
    description: 'Auto-confirm ≥80% confidence',
    color: '#10b981',
  },
  {
    mode: 3,
    name: 'Flow',
    icon: '✨',
    description: 'Auto-confirm ≥70%, minimal prompts',
    color: '#8b5cf6',
  },
];

export function AutomationSlider({ project }: AutomationSliderProps) {
  const {
    config,
    loading,
    setMode,
    toggleHandsOff,
  } = useAutomation(project);
  const [expanded, setExpanded] = useState(false);

  const currentModeInfo = MODE_INFO[config.mode];

  const handleModeChange = async (newMode: number) => {
    try {
      await setMode(newMode);
    } catch (error) {
      console.error('Failed to set automation mode:', error);
    }
  };

  const handleToggleHandsOff = async () => {
    try {
      await toggleHandsOff();
    } catch (error) {
      console.error('Failed to toggle hands-off mode:', error);
    }
  };

  if (loading && !config) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: expanded ? '80px' : '20px',
        left: '20px',
        background: 'white',
        borderRadius: '12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        padding: expanded ? '16px' : '12px',
        minWidth: expanded ? '300px' : '200px',
        transition: 'all 0.3s ease',
        zIndex: 1000,
        cursor: expanded ? 'default' : 'pointer',
      }}
      onClick={() => !expanded && setExpanded(true)}
    >
      {/* Compact View */}
      {!expanded && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ fontSize: '24px' }}>{currentModeInfo.icon}</div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>
              {currentModeInfo.name}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>
              Automation Mode
            </div>
          </div>
        </div>
      )}

      {/* Expanded View */}
      {expanded && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ fontSize: '16px', fontWeight: '600' }}>Automation Mode</div>
            <button
              onClick={() => setExpanded(false)}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: '20px',
                cursor: 'pointer',
                color: '#6b7280',
              }}
            >
              ×
            </button>
          </div>

          {/* Mode Selector */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              {MODE_INFO.map((modeInfo) => (
                <button
                  key={modeInfo.mode}
                  onClick={() => handleModeChange(modeInfo.mode)}
                  style={{
                    flex: 1,
                    padding: '8px',
                    background:
                      config.mode === modeInfo.mode ? modeInfo.color : '#f3f4f6',
                    color: config.mode === modeInfo.mode ? 'white' : '#6b7280',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '20px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  title={`${modeInfo.name}: ${modeInfo.description}`}
                >
                  {modeInfo.icon}
                </button>
              ))}
            </div>

            <div
              style={{
                padding: '12px',
                background: '#f9fafb',
                borderRadius: '6px',
                border: `2px solid ${currentModeInfo.color}`,
              }}
            >
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  color: currentModeInfo.color,
                  marginBottom: '4px',
                }}
              >
                {currentModeInfo.icon} {currentModeInfo.name}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                {currentModeInfo.description}
              </div>
            </div>
          </div>

          {/* Threshold Display */}
          <div style={{ marginBottom: '16px' }}>
            <div
              style={{
                fontSize: '12px',
                color: '#6b7280',
                marginBottom: '4px',
              }}
            >
              Auto-Confirm Threshold
            </div>
            <div
              style={{
                fontSize: '18px',
                fontWeight: '600',
                color: currentModeInfo.color,
              }}
            >
              {(config.autoConfirmThreshold * 100).toFixed(0)}%
            </div>
          </div>

          {/* Hands-Off Mode Toggle */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px',
              background: config.handsOffMode ? '#fef3c7' : '#f3f4f6',
              borderRadius: '6px',
              border: config.handsOffMode ? '2px solid #f59e0b' : 'none',
            }}
          >
            <div>
              <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '2px' }}>
                ✨ Hands-Off Mode
              </div>
              <div style={{ fontSize: '11px', color: '#6b7280' }}>
                Minimal interruptions
              </div>
            </div>
            <button
              onClick={handleToggleHandsOff}
              style={{
                width: '44px',
                height: '24px',
                background: config.handsOffMode ? '#10b981' : '#d1d5db',
                borderRadius: '12px',
                border: 'none',
                cursor: 'pointer',
                position: 'relative',
                transition: 'background 0.2s ease',
              }}
            >
              <div
                style={{
                  width: '20px',
                  height: '20px',
                  background: 'white',
                  borderRadius: '50%',
                  position: 'absolute',
                  top: '2px',
                  left: config.handsOffMode ? '22px' : '2px',
                  transition: 'left 0.2s ease',
                }}
              />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
