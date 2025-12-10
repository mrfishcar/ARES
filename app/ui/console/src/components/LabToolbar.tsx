/**
 * LabToolbar - Floating control bar with actions and settings
 * Clean component with minimal state, uses liquid-glass styling
 */

import { createPortal } from 'react-dom';
import { useRef, useState, useEffect, useCallback } from 'react';
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
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 64, right: 20 });
  const [dropdownWidth, setDropdownWidth] = useState(320);
  const [isDropdownMounted, setIsDropdownMounted] = useState(false);
  const [dropdownState, setDropdownState] = useState<'opening' | 'open' | 'closing'>('closing');
  const dropdownPanelRef = useRef<HTMLDivElement>(null);
  const overlayRoot = typeof document !== 'undefined' ? document.getElementById('overlay-root') ?? document.body : null;

  const updateDropdownPosition = useCallback(() => {
    if (typeof window !== 'undefined' && settingsButtonRef.current && dropdownPanelRef.current) {
      const rect = settingsButtonRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const viewportPadding = viewportWidth < 600 ? 12 : 16;
      const panelMaxWidth = viewportWidth >= 768 ? 360 : 320;
      const availableWidth = Math.min(panelMaxWidth, viewportWidth - viewportPadding * 2);

      // Horizontal positioning - center under button and clamp to viewport
      const centeredLeft = rect.left + rect.width / 2 - availableWidth / 2;
      const clampedLeft = Math.max(viewportPadding, Math.min(centeredLeft, viewportWidth - viewportPadding - availableWidth));

      // Vertical positioning - check if dropdown fits below button
      const topOffset = viewportWidth <= 1024 ? 12 : 8;
      const dropdownHeight = dropdownPanelRef.current.offsetHeight || 400; // Estimate if not mounted yet
      const spaceBelow = viewportHeight - rect.bottom - topOffset;
      const spaceAbove = rect.top - topOffset;

      let finalTop: number;

      // If dropdown doesn't fit below, try to position it above
      if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
        // Position above button
        finalTop = rect.top - dropdownHeight - topOffset;
        // Clamp to not go above viewport
        finalTop = Math.max(viewportPadding, finalTop);
      } else {
        // Position below button (default)
        finalTop = rect.bottom + topOffset;
        // Clamp to not go below viewport
        const maxTop = viewportHeight - dropdownHeight - viewportPadding;
        finalTop = Math.min(finalTop, maxTop);
      }

      setDropdownPosition({
        top: finalTop,
        right: viewportWidth - clampedLeft - availableWidth,
      });
      setDropdownWidth(availableWidth);
    }
  }, []);

  // Calculate dropdown position when it opens
  useEffect(() => {
    if (showSettingsDropdown) {
      updateDropdownPosition();
      setIsDropdownMounted(true);
      setDropdownState('opening');

      requestAnimationFrame(() => setDropdownState('open'));
    } else if (isDropdownMounted) {
      setDropdownState('closing');
      const timeout = setTimeout(() => setIsDropdownMounted(false), 180);
      return () => clearTimeout(timeout);
    }
  }, [showSettingsDropdown, isDropdownMounted, updateDropdownPosition]);

  // Reposition on resize/scroll
  useEffect(() => {
    if (!isDropdownMounted) return;

    const handleWindowChange = () => updateDropdownPosition();
    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true);

    return () => {
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('scroll', handleWindowChange, true);
    };
  }, [isDropdownMounted, updateDropdownPosition]);

  // Focus trapping + escape handling
  useEffect(() => {
    if (!isDropdownMounted) return;

    const panel = dropdownPanelRef.current;
    const focusableElements = panel?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );

    focusableElements?.[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onSettingsClose();
      }

      if (event.key === 'Tab' && focusableElements && focusableElements.length > 0) {
        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];

        if (event.shiftKey) {
          if (document.activeElement === first) {
            event.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isDropdownMounted, onSettingsClose]);

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
    <>
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

    {/* Portal: Render dropdown outside toolbar to escape transform context */}
    {isDropdownMounted && overlayRoot && createPortal(
      <>
        {/* Backdrop */}
        <div
          className="settings-dropdown-backdrop"
          onClick={onSettingsClose}
          aria-hidden="true"
        />

        {/* Dropdown panel */}
        <div
          ref={dropdownPanelRef}
          className="settings-dropdown-panel liquid-glass"
          style={{
            top: `${dropdownPosition.top}px`,
            right: `${dropdownPosition.right}px`,
            width: dropdownWidth,
          }}
          role="dialog"
          aria-modal="true"
          data-state={dropdownState}
        >
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
      </>,
      overlayRoot
    )}
    </>
  );
}
