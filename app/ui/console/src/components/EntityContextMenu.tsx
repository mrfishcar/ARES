/**
 * Entity Context Menu - Sprint W2
 * Right-click menu for confirming, correcting, or rejecting entity mentions
 */

import { useState } from 'react';
import type { EntityType } from '../types/entities';

export interface EntityContextMenuProps {
  position: { x: number; y: number };
  entity: {
    text: string;
    type: EntityType;
    confidence: number;
  };
  onChangeType?: (type: EntityType) => void;
  onTagEntity?: () => void;
  onCreateNew?: (type: EntityType) => void;
  onReject?: () => void;
  onClose: () => void;
  isNewEntity?: boolean;
}

const ENTITY_TYPES: EntityType[] = [
  // Core types (6)
  'PERSON', 'PLACE', 'ORG', 'EVENT', 'CONCEPT', 'OBJECT',
  // Fiction types (10)
  'RACE', 'CREATURE', 'ARTIFACT', 'TECHNOLOGY', 'MAGIC',
  'LANGUAGE', 'CURRENCY', 'MATERIAL', 'DRUG', 'DEITY',
  // Ability types (5)
  'ABILITY', 'SKILL', 'POWER', 'TECHNIQUE', 'SPELL',
  // Schema types (6)
  'DATE', 'TIME', 'WORK', 'ITEM', 'MISC', 'SPECIES',
  'HOUSE', 'TRIBE', 'TITLE'
];

const TYPE_LABELS: Record<EntityType, string> = {
  // Core types
  PERSON: 'Person',
  PLACE: 'Place',
  ORG: 'Organization',
  EVENT: 'Event',
  CONCEPT: 'Concept',
  OBJECT: 'Object',
  // Fiction types
  RACE: 'Race',
  CREATURE: 'Creature',
  ARTIFACT: 'Artifact',
  TECHNOLOGY: 'Technology',
  MAGIC: 'Magic',
  LANGUAGE: 'Language',
  CURRENCY: 'Currency',
  MATERIAL: 'Material',
  DRUG: 'Drug',
  DEITY: 'Deity',
  // Ability types
  ABILITY: 'Ability',
  SKILL: 'Skill',
  POWER: 'Power',
  TECHNIQUE: 'Technique',
  SPELL: 'Spell',
  // Schema types
  DATE: 'Date',
  TIME: 'Time',
  WORK: 'Work',
  ITEM: 'Item',
  MISC: 'Misc',
  SPECIES: 'Species',
  HOUSE: 'House',
  TRIBE: 'Tribe',
  TITLE: 'Title',
};

const TYPE_ICONS: Record<EntityType, string> = {
  // Core types
  PERSON: '👤',
  PLACE: '📍',
  ORG: '🏢',
  EVENT: '📅',
  CONCEPT: '💡',
  OBJECT: '📦',
  // Fiction types
  RACE: '🏰',
  CREATURE: '🐉',
  ARTIFACT: '⚔️',
  TECHNOLOGY: '⚙️',
  MAGIC: '✨',
  LANGUAGE: '🗣️',
  CURRENCY: '💰',
  MATERIAL: '🪨',
  DRUG: '💊',
  DEITY: '⛩️',
  // Ability types
  ABILITY: '🦸',
  SKILL: '🎯',
  POWER: '⚡',
  TECHNIQUE: '🥋',
  SPELL: '🔮',
  // Schema types
  DATE: '📆',
  TIME: '⏰',
  WORK: '📚',
  ITEM: '📦',
  MISC: '❓',
  SPECIES: '🦁',
  HOUSE: '🏠',
  TRIBE: '👥',
  TITLE: '👑',
};

export function EntityContextMenu({
  position,
  entity,
  onChangeType,
  onTagEntity,
  onCreateNew,
  onReject,
  onClose,
  isNewEntity = false,
}: EntityContextMenuProps) {
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [mode, setMode] = useState<'main' | 'select-type'>('main');

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

        {mode === 'main' ? (
          <>
            {/* Option 1: Change Type */}
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
                <span>⚙️ Change Type</span>
                <span style={{ fontSize: '12px' }}>{showTypeMenu ? '▼' : '▶'}</span>
              </button>

              {showTypeMenu && (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: '100%',
                    marginTop: '4px',
                    background: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    minWidth: '200px',
                    maxHeight: '300px',
                    overflowY: 'auto',
                    padding: '4px 0',
                    zIndex: 1001,
                  }}
                >
                  {ENTITY_TYPES.map((type) => (
                    <button
                      key={type}
                      onClick={() => {
                        onChangeType?.(type);
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

            {/* Option 2: Tag Entity (link to existing) */}
            <button
              onClick={() => {
                onTagEntity?.();
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
                color: '#059669',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f0fdf4')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            >
              🔗 Tag Entity
            </button>

            {/* Separator */}
            <div style={{ height: '1px', background: '#e5e7eb', margin: '4px 0' }} />

            {/* Option 3: Create New Entity */}
            <button
              onClick={() => setMode('select-type')}
              style={{
                width: '100%',
                padding: '10px 16px',
                background: 'none',
                border: 'none',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: '14px',
                color: '#7c3aed',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#faf5ff')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            >
              ✨ Create New Entity
            </button>

            {/* Separator */}
            <div style={{ height: '1px', background: '#e5e7eb', margin: '4px 0' }} />

            {/* Option 4: Reject */}
            <button
              onClick={() => {
                onReject?.();
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
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#fef2f2')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            >
              ✕ Reject
            </button>
          </>
        ) : (
          <>
            {/* Type selection for "Create New Entity" */}
            <button
              onClick={() => setMode('main')}
              style={{
                width: '100%',
                padding: '10px 16px',
                background: 'none',
                border: 'none',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: '14px',
                color: '#6b7280',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f9fafb')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            >
              ← Back
            </button>

            <div style={{ height: '1px', background: '#e5e7eb', margin: '4px 0' }} />

            <div style={{ padding: '8px 0', maxHeight: '300px', overflowY: 'auto' }}>
              {ENTITY_TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => {
                    onCreateNew?.(type);
                    onClose();
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'none',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f9fafb')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                >
                  <span>{TYPE_ICONS[type]}</span>
                  <span>{TYPE_LABELS[type]}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
