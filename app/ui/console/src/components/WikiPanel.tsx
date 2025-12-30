/**
 * Wiki Panel Component
 * Task 1.1.2: Create Wiki Panel Component
 *
 * Displays wiki-style entity pages from IR renderers
 * Features: entity selector, type badges, cross-links, timeline tab
 */

import React, { useMemo, useState } from 'react';
import Markdown from 'markdown-to-jsx';
import { renderEntityPage, renderItemPage, renderPlacePage } from '@engine/ir/entity-renderer';
import { renderTimeline } from '@engine/ir/timeline-renderer';
import { queryTimeline } from '@engine/ir/timeline-builder';
import type { ProjectIR, EntityId } from '@engine/ir/types';
import { getEntityTypeColor } from '../types/entities';
import './WikiPanel.css';

interface WikiPanelProps {
  ir: ProjectIR;
  selectedEntityId: EntityId | null;
  onEntityClick: (entityId: EntityId) => void;
  onClose: () => void;
}

const ENTITY_TYPE_EMOJI: Record<string, string> = {
  PERSON: '👤',
  PLACE: '📍',
  ITEM: '🎭',
  ORG: '🏛️',
  EVENT: '📅',
  CREATURE: '🐉',
  WORK: '📖',
  GROUP: '👥',
  TIME_PERIOD: '⏰',
  CONCEPT: '💡',
};

export function WikiPanel({ ir, selectedEntityId, onEntityClick, onClose }: WikiPanelProps) {
  const [activeTab, setActiveTab] = useState<'wiki' | 'timeline'>('wiki');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  // Find selected entity
  const selectedEntity = useMemo(() => {
    if (!selectedEntityId) return null;
    return ir.entities.find((e: any) => e.id === selectedEntityId);
  }, [ir.entities, selectedEntityId]);

  // Filter entities by type
  const filteredEntities = useMemo(() => {
    if (!typeFilter) return ir.entities;
    return ir.entities.filter((e: any) => e.type === typeFilter);
  }, [ir.entities, typeFilter]);

  // Get unique entity types
  const availableTypes = useMemo(() => {
    const types = new Set(ir.entities.map((e: any) => e.type));
    return Array.from(types).sort();
  }, [ir.entities]);

  // Render wiki content
  const wikiContent = useMemo(() => {
    if (!selectedEntity) return '';

    // Choose renderer based on entity type
    switch (selectedEntity.type) {
      case 'ITEM':
        return renderItemPage(ir, selectedEntity.id);
      case 'PLACE':
        return renderPlacePage(ir, selectedEntity.id);
      default:
        return renderEntityPage(ir, selectedEntity.id);
    }
  }, [ir, selectedEntity]);

  // Render timeline content
  const timelineContent = useMemo(() => {
    if (!selectedEntity) return '';

    const result = queryTimeline(ir.events, {
      entityId: selectedEntity.id,
    });

    if (result.events.length === 0) {
      return '**No events found for this entity.**\n\nThis entity has not been mentioned in any story events yet.';
    }

    return renderTimeline(ir, {
      filter: { entityId: selectedEntity.id },
    });
  }, [ir, selectedEntity]);

  // Handle link clicks
  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const href = e.currentTarget.getAttribute('href');
    // Entity links start with entity_ or are internal anchors
    if (href?.startsWith('entity_')) {
      e.preventDefault();
      onEntityClick(href);
    } else if (href?.startsWith('#')) {
      // Allow internal anchor navigation
      return;
    }
  };

  if (!selectedEntity) {
    return (
      <div className="wiki-panel wiki-panel--empty">
        <div className="wiki-panel__header">
          <h2>Entity Wiki</h2>
          <button className="wiki-panel__close" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        <div className="wiki-panel__empty-state">
          <div className="wiki-panel__empty-icon">📖</div>
          <p>Select an entity to view its wiki page</p>
          <p className="wiki-panel__empty-hint">
            Click on any entity in the extraction results or select from the dropdown above
          </p>
        </div>
      </div>
    );
  }

  const emoji = ENTITY_TYPE_EMOJI[selectedEntity.type] || '📄';
  const typeColor = getEntityTypeColor(selectedEntity.type as any);

  return (
    <div className="wiki-panel">
      {/* Header */}
      <div className="wiki-panel__header">
        <div className="wiki-panel__title">
          <span className="wiki-panel__emoji">{emoji}</span>
          <div>
            <h2>{selectedEntity.canonical}</h2>
            <span
              className="wiki-panel__type-badge"
              style={{ backgroundColor: typeColor }}
            >
              {selectedEntity.type}
            </span>
          </div>
        </div>
        <button className="wiki-panel__close" onClick={onClose} title="Close">
          ✕
        </button>
      </div>

      {/* Entity Selector */}
      <div className="wiki-panel__selector">
        <select
          className="wiki-panel__entity-select"
          value={selectedEntityId || ''}
          onChange={(e) => onEntityClick(e.target.value)}
        >
          <option value="" disabled>
            Choose entity ({filteredEntities.length})
          </option>
          {filteredEntities.map((entity: any) => (
            <option key={entity.id} value={entity.id}>
              {ENTITY_TYPE_EMOJI[entity.type] || '📄'} {entity.canonical} ({entity.type})
            </option>
          ))}
        </select>

        {/* Type Filter */}
        <select
          className="wiki-panel__type-filter"
          value={typeFilter || ''}
          onChange={(e) => setTypeFilter(e.target.value || null)}
        >
          <option value="">All Types</option>
          {availableTypes.map((type: string) => (
            <option key={type} value={type}>
              {ENTITY_TYPE_EMOJI[type as keyof typeof ENTITY_TYPE_EMOJI] || '📄'} {type}
            </option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div className="wiki-panel__tabs">
        <button
          className={`wiki-panel__tab ${activeTab === 'wiki' ? 'wiki-panel__tab--active' : ''}`}
          onClick={() => setActiveTab('wiki')}
        >
          📖 Wiki
        </button>
        <button
          className={`wiki-panel__tab ${activeTab === 'timeline' ? 'wiki-panel__tab--active' : ''}`}
          onClick={() => setActiveTab('timeline')}
        >
          ⏰ Timeline
        </button>
      </div>

      {/* Content */}
      <div className="wiki-panel__content">
        <Markdown
          options={{
            overrides: {
              h1: {
                props: {
                  style: {
                    fontSize: '24px',
                    fontWeight: '600',
                    marginTop: '24px',
                    marginBottom: '12px',
                    borderBottom: '2px solid #e5e7eb',
                    paddingBottom: '8px',
                  },
                },
              },
              h2: {
                props: {
                  style: {
                    fontSize: '20px',
                    fontWeight: '600',
                    marginTop: '20px',
                    marginBottom: '10px',
                    color: '#374151',
                  },
                },
              },
              h3: {
                props: {
                  style: {
                    fontSize: '18px',
                    fontWeight: '600',
                    marginTop: '16px',
                    marginBottom: '8px',
                    color: '#4b5563',
                  },
                },
              },
              p: { props: { style: { marginBottom: '12px', lineHeight: '1.6' } } },
              code: {
                props: {
                  style: {
                    background: '#f3f4f6',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontFamily: 'monospace',
                    fontSize: '13px',
                  },
                },
              },
              pre: {
                props: {
                  style: {
                    background: '#f3f4f6',
                    padding: '12px',
                    borderRadius: '6px',
                    overflow: 'auto',
                    marginBottom: '12px',
                  },
                },
              },
              ul: { props: { style: { marginBottom: '12px', paddingLeft: '24px' } } },
              ol: { props: { style: { marginBottom: '12px', paddingLeft: '24px' } } },
              li: { props: { style: { marginBottom: '4px' } } },
              blockquote: {
                props: {
                  style: {
                    borderLeft: '4px solid #d1d5db',
                    paddingLeft: '16px',
                    marginLeft: '0',
                    marginBottom: '12px',
                    color: '#6b7280',
                    fontStyle: 'italic',
                  },
                },
              },
              a: {
                component: ({ href, children }: any) => (
                  <a
                    href={href}
                    onClick={handleLinkClick}
                    style={{
                      color: '#3b82f6',
                      textDecoration: 'underline',
                      cursor: 'pointer',
                    }}
                  >
                    {children}
                  </a>
                ),
              },
            },
          }}
        >
          {activeTab === 'wiki' ? wikiContent : timelineContent}
        </Markdown>
      </div>

      {/* Footer Stats */}
      <div className="wiki-panel__footer">
        <div className="wiki-panel__stats">
          <span>
            {ir.entities.length} entities
          </span>
          <span>•</span>
          <span>
            {ir.events.length} events
          </span>
          <span>•</span>
          <span>
            {ir.assertions.length} facts
          </span>
        </div>
      </div>
    </div>
  );
}
