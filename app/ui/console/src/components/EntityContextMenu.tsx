/**
 * Entity Context Menu - Sprint W2
 * Right-click menu for confirming, correcting, or rejecting entity mentions
 */

import { useState } from 'react';
import type { EntityType } from '../../../../editor/entityHighlighter';

export interface EntityContextMenuProps {
  position: { x: number; y: number };
  entity: {
    text: string;
    type: EntityType;
    confidence: number;
  };
  onConfirm: (type: EntityType) => void;
  onReject: () => void;
  onClose: () => void;
  isNewEntity?: boolean;
}

const ENTITY_TYPES: EntityType[] = ['PERSON', 'PLACE', 'ORG', 'EVENT', 'CONCEPT', 'OBJECT'];

const TYPE_LABELS: Record<EntityType, string> = {
  PERSON: 'Person',
  PLACE: 'Place',
  ORG: 'Organization',
  EVENT: 'Event',
  CONCEPT: 'Concept',
  OBJECT: 'Object',
};

const TYPE_ICONS: Record<EntityType, string> = {
  PERSON: '👤',
  PLACE: '📍',
  ORG: '🏢',
  EVENT: '📅',
  CONCEPT: '💡',
  OBJECT: '📦',
};

export function EntityContextMenu({
  position,
  entity,
  onConfirm,
  onReject,
  onClose,
  isNewEntity = false,
}: EntityContextMenuProps) {
  const [showTypeMenu, setShowTypeMenu] = useState(false);

  // Close when clicking outside
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <>
      {/* Backdrop to catch clicks */}
      <div
        onClick={handleBackdropClick}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'transparent',
          zIndex: 999,
        }}
      />

      {/* Context menu */}
      <div
        style={{
          position: 'fixed',
          top: `${position.y}px`,
          left: `${position.x}px`,
          background: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 1000,
          minWidth: '200px',
          padding: '4px 0',
        }}
      >
        {/* Entity info header */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #e5e7eb',
            fontSize: '13px',
          }}
        >
          <div style={{ fontWeight: '600', marginBottom: '4px' }}>{entity.text}</div>
          <div style={{ color: '#6b7280', fontSize: '11px' }}>
            {isNewEntity ? (
              <>✨ Create new entity</>
            ) : (
              <>
                {TYPE_ICONS[entity.type]} {TYPE_LABELS[entity.type]} •{' '}
                {Math.round(entity.confidence * 100)}% confidence
              </>
            )}
          </div>
        </div>

        {/* Change type button */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowTypeMenu(!showTypeMenu)}
            style={{
              width: '100%',
              padding: '10px 16px',
              background: 'none',
              border: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: '14px',
              color: '#3b82f6',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#eff6ff')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            <span>{isNewEntity ? '📝 Select Type' : '✏️ Change Type'}</span>
            <span style={{ fontSize: '12px' }}>{showTypeMenu ? '▼' : '▶'}</span>
          </button>

          {/* Type submenu */}
          {showTypeMenu && (
            <div
              style={{
                position: 'absolute',
                left: '100%',
                top: 0,
                marginLeft: '4px',
                background: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                minWidth: '160px',
                padding: '4px 0',
                zIndex: 1001,
              }}
            >
              {ENTITY_TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => {
                    onConfirm(type);
                    onClose();
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: type === entity.type ? '#f3f4f6' : 'none',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontWeight: type === entity.type ? '500' : '400',
                  }}
                  onMouseEnter={(e) => {
                    if (type !== entity.type) {
                      e.currentTarget.style.background = '#f9fafb';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (type !== entity.type) {
                      e.currentTarget.style.background = 'none';
                    }
                  }}
                >
                  <span>{TYPE_ICONS[type]}</span>
                  <span>{TYPE_LABELS[type]}</span>
                  {type === entity.type && <span style={{ marginLeft: 'auto', fontSize: '12px' }}>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Separator */}
        <div style={{ height: '1px', background: '#e5e7eb', margin: '4px 0' }} />

        {/* Reject button */}
        <button
          onClick={() => {
            onReject();
            onClose();
          }}
          style={{
            width: '100%',
            padding: '10px 16px',
            background: 'none',
            border: 'none',
            textAlign: 'left',
            cursor: 'pointer',
            fontSize: '14px',
            color: '#ef4444',
            fontWeight: '500',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#fef2f2')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
        >
          ✕ Reject
        </button>
      </div>
    </>
  );
}
