/**
 * EntityOverlay - Full-screen overlay or pinned sidebar for entities/stats
 *
 * Modes:
 * - overlay: Full-screen with dimmed background
 * - pinned: Docked sidebar on the right
 */

import { useEffect, useRef } from 'react';
import { EntityResultsPanel } from './EntityResultsPanel';
import type { EntitySpan } from '../types/entities';

interface Relation {
  id: string;
  subj: string;
  obj: string;
  pred: string;
  confidence: number;
  subjCanonical: string;
  objCanonical: string;
}

interface EntityOverlayProps {
  mode: 'overlay' | 'pinned';
  entities: EntitySpan[];
  relations: Relation[];
  stats: {
    time: number;
    confidence: number;
    count: number;
    relationCount: number;
  };
  onClose: () => void;
  onPin: () => void;
  onViewWiki: (entityName: string) => void;
  onCopyReport: () => void;
  isUpdating?: boolean;
}

export function EntityOverlay({
  mode,
  entities,
  relations,
  stats,
  onClose,
  onPin,
  onViewWiki,
  onCopyReport,
  isUpdating,
}: EntityOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Focus trap: focus close button when opened in overlay mode
  useEffect(() => {
    if (mode === 'overlay' && closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, [mode]);

  // Handle escape key to close
  useEffect(() => {
    if (mode !== 'overlay') return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [mode, onClose]);

  // Prevent body scroll when overlay is open
  useEffect(() => {
    if (mode !== 'overlay') return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [mode]);

  if (mode === 'pinned') {
    // Pinned sidebar mode - no backdrop
    return (
      <div
        className="overlay-panel pinned"
        style={{
          flex: '0 0 400px',
          maxWidth: '460px',
          minWidth: '320px',
        }}
      >
        <div className="overlay-header">
          <h2 className="overlay-title">Entities & Relations</h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={onClose}
              className="overlay-close"
              title="Unpin and close"
              aria-label="Unpin and close"
            >
              📌
            </button>
            <button
              ref={closeButtonRef}
              onClick={onClose}
              className="overlay-close"
              title="Close sidebar"
              aria-label="Close sidebar"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="overlay-body" style={{ padding: 0 }}>
          <EntityResultsPanel
            entities={entities}
            relations={relations}
            onViewWiki={onViewWiki}
            isUpdating={isUpdating}
            stats={stats}
            onCopyReport={onCopyReport}
          />
        </div>
      </div>
    );
  }

  // Overlay mode - full-screen with backdrop
  return (
    <>
      {/* Backdrop */}
      <div
        className="overlay-backdrop"
        onClick={onClose}
        aria-label="Close overlay"
      />

      {/* Overlay panel */}
      <div
        ref={overlayRef}
        className="overlay-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="entity-overlay-title"
      >
        <div className="overlay-header">
          <h2 id="entity-overlay-title" className="overlay-title">
            Entities & Relations
          </h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={onPin}
              className="overlay-close"
              title="Pin as sidebar"
              aria-label="Pin as sidebar"
              style={{ fontSize: '18px' }}
            >
              📌
            </button>
            <button
              ref={closeButtonRef}
              onClick={onClose}
              className="overlay-close"
              title="Close overlay"
              aria-label="Close overlay"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="overlay-body" style={{ padding: 0 }}>
          <EntityResultsPanel
            entities={entities}
            relations={relations}
            onViewWiki={onViewWiki}
            isUpdating={isUpdating}
            stats={stats}
            onCopyReport={onCopyReport}
          />
        </div>
      </div>
    </>
  );
}
