/**
 * LabToolbar - Floating control bar with actions and settings
 * Clean component with minimal state, uses liquid-glass styling
 */

import { Settings, Sun, Moon, Zap, Highlighter } from 'lucide-react';

interface LabToolbarProps {
  // Status
  jobStatus: 'queued' | 'running' | 'done' | 'failed' | null;
  jobProgress?: number;
  jobEtaSeconds?: number | null;

  // State
  theme: 'dark' | 'light';
  entityHighlightMode: boolean;
  showSettingsDropdown: boolean;

  // Settings state
  showHighlighting: boolean;
  highlightOpacity: number;
  editorMargin: number;

  // Actions
  onExtractStart: () => void;
  onThemeToggle: () => void;
  onEntityHighlightToggle: () => void;
  onSettingsToggle: () => void;
  onSettingsClose: () => void;

  // Settings actions
  onHighlightingToggle: () => void;
  onOpacityChange: (value: number) => void;
  onMarginChange: (margin: number) => void;

  // State checks
  canExtract: boolean;
  isExtracting: boolean;
}

export function LabToolbar({
  jobStatus,
  theme,
  entityHighlightMode,
  showSettingsDropdown,
  showHighlighting,
  highlightOpacity,
  editorMargin,
  onExtractStart,
  onThemeToggle,
  onEntityHighlightToggle,
  onSettingsToggle,
  onSettingsClose,
  onHighlightingToggle,
  onOpacityChange,
  onMarginChange,
  canExtract,
  isExtracting,
}: LabToolbarProps) {
  // Derive status label
  const statusLabel = jobStatus === 'running'
    ? 'Job running'
    : jobStatus === 'queued'
      ? 'Queued'
      : jobStatus === 'failed'
        ? 'Failed'
        : jobStatus === 'done'
          ? 'Done'
          : 'Idle';

  return (
    <div className="lab-control-bar liquid-glass">
      {/* Status indicator */}
      <div
        className={`status-indicator ${
          jobStatus === 'running'
            ? 'status-indicator--running'
            : jobStatus === 'failed'
              ? 'status-indicator--failed'
              : ''
        }`}
      >
        {statusLabel}
      </div>

      {/* Icon controls */}
      <div className="toolbar-actions">
        <button
          onClick={onExtractStart}
          disabled={!canExtract || isExtracting}
          className="control-btn"
          title="Start background extraction"
          type="button"
        >
          <Zap size={16} strokeWidth={2} />
        </button>

        <button
          onClick={onEntityHighlightToggle}
          className={`control-btn ${entityHighlightMode ? 'control-btn--active' : ''}`}
          title="Toggle Entity Highlight Mode"
          type="button"
        >
          <Highlighter size={16} strokeWidth={2} />
        </button>

        <button
          onClick={onThemeToggle}
          className="control-btn"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          type="button"
        >
          {theme === 'dark' ? <Sun size={16} strokeWidth={2} /> : <Moon size={16} strokeWidth={2} />}
        </button>

        {/* Settings dropdown */}
        <div className="settings-dropdown-container">
          <button
            onClick={onSettingsToggle}
            className="control-btn"
            title="Settings"
            type="button"
            aria-expanded={showSettingsDropdown}
            aria-label="Settings menu"
          >
            <Settings size={16} strokeWidth={2} />
          </button>

          {showSettingsDropdown && (
            <>
              {/* Backdrop */}
              <div
                className="settings-dropdown-backdrop"
                onClick={onSettingsClose}
                aria-hidden="true"
              />

              {/* Dropdown panel */}
              <div className="settings-dropdown-panel liquid-glass">
                {/* Page Margins */}
                <div className="settings-dropdown-section">
                  <div className="settings-dropdown-label">Page Margins</div>
                  <div className="settings-dropdown-buttons">
                    <button
                      onClick={() => onMarginChange(48)}
                      className={`settings-margin-btn ${editorMargin === 48 ? 'active' : ''}`}
                      type="button"
                    >
                      Narrow (0.5″)
                    </button>
                    <button
                      onClick={() => onMarginChange(96)}
                      className={`settings-margin-btn ${editorMargin === 96 ? 'active' : ''}`}
                      type="button"
                    >
                      Default (1″)
                    </button>
                    <button
                      onClick={() => onMarginChange(120)}
                      className={`settings-margin-btn ${editorMargin === 120 ? 'active' : ''}`}
                      type="button"
                    >
                      Wide (1.25″)
                    </button>
                  </div>
                </div>

                {/* Entity Highlighting */}
                <div className="settings-dropdown-section">
                  <div className="settings-dropdown-label">Entity Highlighting</div>
                  <div
                    className="settings-dropdown-toggle"
                    onClick={onHighlightingToggle}
                    role="switch"
                    aria-checked={showHighlighting}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onHighlightingToggle();
                      }
                    }}
                  >
                    <span className="settings-dropdown-toggle-label">Highlight Entities</span>
                    <div className={`settings-toggle-switch ${showHighlighting ? 'active' : ''}`}>
                      <div className="settings-toggle-knob" />
                    </div>
                  </div>
                </div>

                {/* Transparency */}
                <div className="settings-dropdown-section">
                  <div className="settings-dropdown-label">Highlight Transparency</div>
                  <div className="settings-dropdown-slider">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={highlightOpacity * 100}
                      onChange={(e) => onOpacityChange(Number(e.target.value) / 100)}
                      className="settings-slider-input"
                      disabled={!showHighlighting}
                      aria-label="Highlight transparency"
                    />
                    <span className="settings-slider-value">{Math.round(highlightOpacity * 100)}%</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
