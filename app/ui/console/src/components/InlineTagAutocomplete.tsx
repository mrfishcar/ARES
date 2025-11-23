/**
 * Inline Tag Autocomplete - Sprint W2
 * Autocomplete suggestions for inline tags when user types '#'
 * Example: User types "#dar" → suggests "#Darth Vader:PERSON"
 */

import { useState, useEffect, useRef } from 'react';
import type { EntitySpan, EntityType } from '../types/entities';

export interface InlineTagAutocompleteProps {
  visible: boolean;
  position: { x: number; y: number };
  searchText: string;
  entities: EntitySpan[];
  onSelect: (entity: EntitySpan) => void;
  onClose: () => void;
}

const ENTITY_TYPE_ICONS: Record<EntityType, string> = {
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

export function InlineTagAutocomplete({
  visible,
  position,
  searchText,
  entities,
  onSelect,
  onClose,
}: InlineTagAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<EntitySpan[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter entities based on search text and remove duplicates
  useEffect(() => {
    if (!visible || !searchText.trim()) {
      setSuggestions([]);
      return;
    }

    const searchLower = searchText.toLowerCase();

    // Filter and deduplicate entities by text
    const uniqueEntities = new Map<string, EntitySpan>();
    for (const entity of entities) {
      const key = entity.text.toLowerCase();
      if (entity.text.toLowerCase().includes(searchLower)) {
        // Keep the first occurrence (highest confidence)
        if (!uniqueEntities.has(key)) {
          uniqueEntities.set(key, entity);
        }
      }
    }

    // Sort by: match position (earlier is better), then by text length (shorter first)
    const filtered = Array.from(uniqueEntities.values())
      .sort((a, b) => {
        const posA = a.text.toLowerCase().indexOf(searchLower);
        const posB = b.text.toLowerCase().indexOf(searchLower);

        if (posA !== posB) return posA - posB;
        return a.text.length - b.text.length;
      })
      .slice(0, 8); // Limit to 8 suggestions

    setSuggestions(filtered);
    setSelectedIndex(0);
  }, [visible, searchText, entities]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (suggestions.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % suggestions.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
          break;
        case 'Enter':
          e.preventDefault();
          onSelect(suggestions[selectedIndex]);
          onClose();
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [visible, suggestions, selectedIndex, onSelect, onClose]);

  // Close when clicking outside
  useEffect(() => {
    if (!visible) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [visible, onClose]);

  if (!visible || suggestions.length === 0) return null;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        top: `${position.y}px`,
        left: `${position.x}px`,
        background: 'white',
        border: '1px solid #d1d5db',
        borderRadius: '6px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        zIndex: 1002,
        minWidth: '280px',
        maxHeight: '280px',
        overflowY: 'auto',
        padding: '4px 0',
      }}
    >
      {suggestions.map((entity, index) => (
        <div
          key={`${entity.text}-${entity.type}`}
          onClick={() => {
            onSelect(entity);
            onClose();
          }}
          onMouseEnter={() => setSelectedIndex(index)}
          style={{
            padding: '10px 12px',
            cursor: 'pointer',
            background: index === selectedIndex ? '#eff6ff' : 'transparent',
            borderLeft: index === selectedIndex ? '3px solid #3b82f6' : '3px solid transparent',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            transition: 'all 0.15s ease-in-out',
          }}
        >
          <span style={{ fontSize: '16px' }}>
            {ENTITY_TYPE_ICONS[entity.type as EntityType] || '📌'}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: '13px',
                fontWeight: '500',
                color: '#1f2937',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {entity.text}
            </div>
            <div
              style={{
                fontSize: '11px',
                color: '#6b7280',
                marginTop: '2px',
              }}
            >
              {entity.type}
              {entity.confidence && ` • ${Math.round(entity.confidence * 100)}%`}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
