/**
 * LabToolbar - Floating control bar with actions and settings
 * Clean component with minimal state, uses liquid-glass styling
 */

import { createPortal } from 'react-dom';
import { useRef, useState, useEffect } from 'react';
import { Settings, Sun, Moon, Highlighter, FilePlus, Cloud, CloudOff, Bold, Italic, Code2, Heading, Quote, Minus, Type } from 'lucide-react';
import type { FormattingActions } from './CodeMirrorEditorProps';

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
  showEntityIndicators: boolean;
  enableLongTextOptimization: boolean;
  highlightChains: boolean;
  useRichEditor: boolean;

  // Actions
  onThemeToggle: () => void;
  onEntityHighlightToggle: () => void;
  onSettingsToggle: () => void;
  onSettingsClose: () => void;
  onNewDocument: () => void;

  // Settings actions
  onHighlightingToggle: () => void;
  onOpacityChange: (value: number) => void;
  onMarginChange: (margin: number) => void;
  onEntityIndicatorsToggle: () => void;
  onLongTextOptimizationToggle: () => void;
  onHighlightChainsToggle: () => void;
  onRichEditorToggle: () => void;

  // Save status
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  showFormatToolbar: boolean;
  formatToolbarEnabled: boolean;
  formatActions?: FormattingActions | null;
  onToggleFormatToolbar: () => void;
}

export function LabToolbar({
  jobStatus,
  theme,
  entityHighlightMode,
  showSettingsDropdown,
  showHighlighting,
  highlightOpacity,
  showEntityIndicators,
  enableLongTextOptimization,
  highlightChains,
  useRichEditor,
  editorMargin,
  onThemeToggle,
  onEntityHighlightToggle,
  onSettingsToggle,
  onSettingsClose,
  onNewDocument,
  onHighlightingToggle,
  onOpacityChange,
  onMarginChange,
  onEntityIndicatorsToggle,
  onLongTextOptimizationToggle,
  onHighlightChainsToggle,
  onRichEditorToggle,
  saveStatus,
  showFormatToolbar,
  formatToolbarEnabled,
  formatActions,
  onToggleFormatToolbar,
}: LabToolbarProps) {
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const dropdownPanelRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 64, right: 20 });

  // Calculate dropdown position when it opens
  useEffect(() => {
    if (showSettingsDropdown && settingsButtonRef.current) {
      const rect = settingsButtonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8, // 8px gap below button
        right: window.innerWidth - rect.right, // Align right edge with button
      });
    }
  }, [showSettingsDropdown]);

  // Close settings dropdown when clicking outside the panel/button
  useEffect(() => {
    if (!showSettingsDropdown) return;

    const handlePointerDown = (event: PointerEvent) => {
      const panelEl = dropdownPanelRef.current;
      const buttonEl = settingsButtonRef.current;

      if (!panelEl || !buttonEl) return;
      if (panelEl.contains(event.target as Node) || buttonEl.contains(event.target as Node)) return;

      onSettingsClose();
    };

    document.addEventListener('pointerdown', handlePointerDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [onSettingsClose, showSettingsDropdown]);

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

  // Determine save status label
  const saveStatusLabel = saveStatus === 'saving'
    ? 'Saving...'
    : saveStatus === 'saved'
      ? 'Saved'
      : saveStatus === 'error'
        ? 'Save failed'
        : 'Ready';

  const saveStatusClass =
    saveStatus === 'saving'
      ? 'save-status--saving'
      : saveStatus === 'saved'
        ? 'save-status--saved'
        : saveStatus === 'error'
          ? 'save-status--error'
          : 'save-status--idle';

  const showPerfGauntlet = typeof import.meta !== 'undefined' && import.meta.env.DEV;

  const handleRunPerfGauntlet = async () => {
    const { runPerfGauntlet } = await import('../perf/perfGauntlet');
    runPerfGauntlet();
  };

  const formatButtons: Array<{
    key: string;
    label: string;
    icon: React.ReactNode;
    action?: () => void;
  }> = [
    { key: 'bold', label: 'Bold', icon: <Bold size={14} />, action: formatActions?.toggleBold },
    { key: 'italic', label: 'Italic', icon: <Italic size={14} />, action: formatActions?.toggleItalic },
    { key: 'mono', label: 'Monospace', icon: <Code2 size={14} />, action: formatActions?.toggleMonospace },
    { key: 'heading', label: 'Cycle heading', icon: <Heading size={14} />, action: formatActions?.cycleHeading },
    { key: 'quote', label: 'Quote block', icon: <Quote size={14} />, action: formatActions?.toggleQuote },
    { key: 'divider', label: 'Insert divider', icon: <Minus size={14} />, action: formatActions?.insertDivider },
  ];

  return (
    <>
    {/* Wrapper with data-mode for two-toolbar morph animation */}
    <div className="lab-toolbar-stack">
      <div className="toolbar-slot" data-mode={formatToolbarEnabled ? 'formatting' : 'normal'}>
        {/* Normal toolbar - always rendered */}
        <div className="lab-control-bar liquid-glass">
          <div className="lab-control-bar__content">
            {/* Status indicator (save status is floated separately to avoid shifting buttons) */}
            <div className="status-group">
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

          {showPerfGauntlet && (
            <button
              type="button"
              onClick={handleRunPerfGauntlet}
              className="control-btn"
              title="Run Perf Gauntlet (DEV)"
              style={{ width: 'auto', padding: '6px 10px', fontSize: '11px' }}
            >
              Run Perf Gauntlet
            </button>
          )}
        </div>

        {/* Icon controls */}
        <div className="toolbar-actions">
          <button
            onClick={onNewDocument}
            className="control-btn"
            title="New document"
            type="button"
          >
            <FilePlus size={16} strokeWidth={2} />
          </button>

          <button
            onClick={onEntityHighlightToggle}
            className={`control-btn ${entityHighlightMode ? 'control-btn--active' : ''}`}
            title="Toggle Entity Highlight Mode (tap entities to edit)"
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

          <button
            onClick={onToggleFormatToolbar}
            className={`control-btn ${formatToolbarEnabled ? 'control-btn--active' : ''}`}
            title="Toggle formatting mode"
            type="button"
          >
            <Type size={16} strokeWidth={2} />
          </button>

          {/* Settings dropdown */}
          <div className="settings-dropdown-container">
            <button
              ref={settingsButtonRef}
              onClick={onSettingsToggle}
              className="control-btn"
              title="Settings"
              type="button"
              aria-expanded={showSettingsDropdown}
              aria-label="Settings menu"
            >
              <Settings size={16} strokeWidth={2} />
            </button>
          </div>
          </div>
        </div>
        
        {/* Formatting toolbar - always rendered, positioned absolutely */}
        {showFormatToolbar && (
          <div className="lab-control-bar lab-control-bar--formatting liquid-glass">
            <div className="lab-control-bar__content">
              <div className="toolbar-actions">
                {formatButtons.map((btn) => (
                  btn.key === 'divider' ? (
                    <div key={btn.key} className="toolbar-divider" />
                  ) : (
                    <button
                      key={btn.key}
                      onClick={btn.action}
                      className="control-btn control-btn--format"
                      title={btn.label}
                      type="button"
                      disabled={!btn.action}
                    >
                      {btn.icon}
                    </button>
                  )
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>

    {/* Save status pill (floated to avoid toolbar width changes) */}
    <div className={`save-status-pill ${saveStatusClass}`}>
      {saveStatus === 'saving' ? (
        <Cloud size={12} strokeWidth={2} className="saving-icon" />
      ) : saveStatus === 'saved' ? (
        <Cloud size={12} strokeWidth={2} />
      ) : saveStatus === 'error' ? (
        <CloudOff size={12} strokeWidth={2} />
      ) : (
        <Cloud size={12} strokeWidth={2} style={{ opacity: 0.35 }} />
      )}
      <span>{saveStatusLabel}</span>
    </div>

    {/* Portal: Render dropdown outside toolbar to escape transform context */}
    {showSettingsDropdown && typeof document !== 'undefined' && createPortal(
      <>
        {/* Backdrop */}
        <div
          className="settings-dropdown-backdrop"
          onClick={onSettingsClose}
          aria-hidden="true"
        />

        {/* Dropdown panel */}
        <div
          className="settings-dropdown-panel liquid-glass"
          ref={dropdownPanelRef}
          style={{
            top: `${dropdownPosition.top}px`,
            right: `${dropdownPosition.right}px`,
          }}
        >
                {/* Side Margins */}
                <div className="settings-dropdown-section">
                  <div className="settings-dropdown-label">Side Margins</div>
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

                {/* Editor engine */}
                <div className="settings-dropdown-section">
                  <div className="settings-dropdown-label">Editor Engine</div>
                  <div
                    className="settings-dropdown-toggle"
                    onClick={onRichEditorToggle}
                    role="switch"
                    aria-checked={useRichEditor}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onRichEditorToggle();
                      }
                    }}
                  >
                    <span className="settings-dropdown-toggle-label">Use rich text editor (Lexical)</span>
                    <div className={`settings-toggle-switch ${useRichEditor ? 'active' : ''}`}>
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

                {/* Coreference chains */}
                <div className="settings-dropdown-section">
                  <div className="settings-dropdown-label">Coreference</div>
                  <div
                    className="settings-dropdown-toggle"
                    onClick={onHighlightChainsToggle}
                    role="switch"
                    aria-checked={highlightChains}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onHighlightChainsToggle();
                      }
                    }}
                  >
                    <span className="settings-dropdown-toggle-label">
                      Color BookNLP chains
                    </span>
                    <div className={`settings-toggle-switch ${highlightChains ? 'active' : ''}`}>
                      <div className="settings-toggle-knob" />
                    </div>
                  </div>
                </div>

                {/* Entity Indicators */}
                <div className="settings-dropdown-section">
                  <div className="settings-dropdown-label">Entity Indicators</div>
                  <div
                    className="settings-dropdown-toggle"
                    onClick={onEntityIndicatorsToggle}
                    role="switch"
                    aria-checked={showEntityIndicators}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onEntityIndicatorsToggle();
                      }
                    }}
                  >
                    <div className="settings-dropdown-toggle-text">
                      <span className="settings-dropdown-toggle-label">
                        Show glowing entity indicators
                      </span>
                      <span className="settings-dropdown-helper">
                        Display colored dots in the left margin showing entity locations. Auto-simplifies for documents with 100+ entities.
                      </span>
                    </div>
                    <div className={`settings-toggle-switch ${showEntityIndicators ? 'active' : ''}`}>
                      <div className="settings-toggle-knob" />
                    </div>
                  </div>
                </div>

                {/* Performance */}
                <div className="settings-dropdown-section">
                  <div className="settings-dropdown-label">Performance (Advanced)</div>
                  <div
                    className="settings-dropdown-toggle"
                    onClick={onLongTextOptimizationToggle}
                    role="switch"
                    aria-checked={enableLongTextOptimization}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onLongTextOptimizationToggle();
                      }
                    }}
                  >
                    <div className="settings-dropdown-toggle-text">
                      <span className="settings-dropdown-toggle-label">
                        Long-text optimization (chunked rendering)
                      </span>
                      <span className="settings-dropdown-helper">
                        For documents over 50,000 characters, render only visible portions to improve performance. Disabled on iOS. Default: OFF.
                      </span>
                    </div>
                    <div className={`settings-toggle-switch ${enableLongTextOptimization ? 'active' : ''}`}>
                      <div className="settings-toggle-knob" />
                    </div>
                  </div>
                </div>
        </div>
      </>,
      document.body
    )}
    </>
  );
}
