/**
 * EntityOverlay - Full-screen overlay or pinned sidebar for entities/stats
 *
 * Modes:
 * - overlay: Full-screen with dimmed background
 * - pinned: Docked sidebar on the right
 */

import { useEffect, useRef } from 'react';
import { EntitySidebar, type EntitySidebarEntity } from './EntitySidebar';
import type { EntitySpan, EntityType } from '../types/entities';

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
  isUpdating?: boolean;
  sidebarEntities: EntitySidebarEntity[];
  onChangeType: (entity: EntitySpan, newType: EntityType) => void;
  onReject: (entity: EntitySpan) => void;
  onNotesChange: (entity: EntitySidebarEntity, notes: string) => void;
  onLogReport: () => void;
  onCopyReport: () => void;
}

export function EntityOverlay({
  mode,
  entities,
  relations,
  stats,
  onClose,
  onPin,
  onViewWiki,
  isUpdating,
  sidebarEntities,
  onChangeType,
  onReject,
  onNotesChange,
  onLogReport,
  onCopyReport,
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
    const originalOverscroll = document.body.style.overscrollBehavior;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalHtmlOverscroll = document.documentElement.style.overscrollBehavior;

    document.body.classList.add('overlay-open');
    document.documentElement.classList.add('overlay-open');
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'contain';
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.overscrollBehavior = 'contain';

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.overscrollBehavior = originalOverscroll;
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.documentElement.style.overscrollBehavior = originalHtmlOverscroll;
      document.body.classList.remove('overlay-open');
      document.documentElement.classList.remove('overlay-open');
    };
  }, [mode]);

  if (mode === 'pinned') {
    // Pinned sidebar mode - no backdrop
    return (
      <div
        className="overlay-panel liquid-glass--subtle pinned"
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
          <EntitySidebar
            entities={sidebarEntities}
            onChangeType={onChangeType}
            onReject={onReject}
            onNotesChange={onNotesChange}
            onLogReport={onLogReport}
            onCopyReport={onCopyReport}
            isUpdating={isUpdating}
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
        className="overlay-panel liquid-glass--strong"
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
          <EntitySidebar
            entities={sidebarEntities}
            onChangeType={onChangeType}
            onReject={onReject}
            onNotesChange={onNotesChange}
            onLogReport={onLogReport}
            onCopyReport={onCopyReport}
            isUpdating={isUpdating}
          />
        </div>
      </div>
    </>
  );
}
