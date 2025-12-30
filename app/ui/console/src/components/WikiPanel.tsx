/**
 * Wiki Panel Component
 * Task 1.1.2: Create Wiki Panel Component
 *
 * Displays wiki-style entity pages
 * NOTE: @engine imports removed due to bundling issues with Node.js crypto
 */

import React, { useMemo, useState } from 'react';
import Markdown from 'markdown-to-jsx';
import type { ProjectIR } from '../hooks/useIRAdapter';
import { getEntityTypeColor } from '../types/entities';
import './WikiPanel.css';

type EntityId = string;

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

/**
 * Simple entity page renderer (stub for @engine/ir/entity-renderer)
 */
function renderSimpleEntityPage(ir: ProjectIR, entityId: string): string {
  const entity = ir.entities.find(e => e.id === entityId);
  if (!entity) return '**Entity not found**';

  const lines: string[] = [];

  // Basic info
  lines.push(`# ${entity.canonical}`);
  lines.push('');
  lines.push(`**Type:** ${entity.type}`);

  if (entity.aliases && entity.aliases.length > 0) {
    lines.push(`**Also known as:** ${entity.aliases.join(', ')}`);
  }
  lines.push('');

  // Relations where this entity is the subject
  const subjectRelations = ir.assertions.filter(a => a.subject === entityId);
  if (subjectRelations.length > 0) {
    lines.push('## Relationships');
    lines.push('');
    for (const rel of subjectRelations) {
      const obj = ir.entities.find(e => e.id === rel.object);
      const objName = obj?.canonical || rel.object;
      const pred = String(rel.predicate || 'related_to').replace(/_/g, ' ');
      lines.push(`- *${pred}* → **${objName}**`);
    }
    lines.push('');
  }

  // Relations where this entity is the object
  const objectRelations = ir.assertions.filter(a => a.object === entityId);
  if (objectRelations.length > 0) {
    lines.push('## Related By');
    lines.push('');
    for (const rel of objectRelations) {
      const subj = ir.entities.find(e => e.id === rel.subject);
      const subjName = subj?.canonical || rel.subject;
      const pred = String(rel.predicate || 'related_to').replace(/_/g, ' ');
      lines.push(`- **${subjName}** *${pred}*`);
    }
    lines.push('');
  }

  if (subjectRelations.length === 0 && objectRelations.length === 0) {
    lines.push('*No relationships found for this entity.*');
  }

  return lines.join('\n');
}

export function WikiPanel({ ir, selectedEntityId, onEntityClick, onClose }: WikiPanelProps) {
  const [activeTab, setActiveTab] = useState<'wiki' | 'info'>('wiki');
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
    return renderSimpleEntityPage(ir, selectedEntity.id);
  }, [ir, selectedEntity]);

  // Info tab content
  const infoContent = useMemo(() => {
    if (!selectedEntity) return '';
    const lines: string[] = [];
    lines.push('## Entity Info');
    lines.push('');
    lines.push(`- **ID:** \`${selectedEntity.id}\``);
    lines.push(`- **Type:** ${selectedEntity.type}`);
    lines.push(`- **Canonical Name:** ${selectedEntity.canonical}`);
    if (selectedEntity.aliases?.length) {
      lines.push(`- **Aliases:** ${selectedEntity.aliases.join(', ')}`);
    }
    return lines.join('\n');
  }, [selectedEntity]);

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
          <option value="">Select entity...</option>
          {filteredEntities.map((entity: any) => (
            <option key={entity.id} value={entity.id}>
              {ENTITY_TYPE_EMOJI[entity.type] || '📄'} {entity.canonical}
            </option>
          ))}
        </select>

        {/* Type filter */}
        <select
          className="wiki-panel__type-filter"
          value={typeFilter || ''}
          onChange={(e) => setTypeFilter(e.target.value || null)}
        >
          <option value="">All types</option>
          {availableTypes.map(type => (
            <option key={type} value={type}>
              {ENTITY_TYPE_EMOJI[type] || '📄'} {type}
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
          className={`wiki-panel__tab ${activeTab === 'info' ? 'wiki-panel__tab--active' : ''}`}
          onClick={() => setActiveTab('info')}
        >
          ℹ️ Info
        </button>
      </div>

      {/* Content */}
      <div className="wiki-panel__content">
        <Markdown
          options={{
            overrides: {
              a: {
                component: ({ children, href, ...props }) => (
                  <a
                    href={href}
                    onClick={(e) => {
                      if (href?.startsWith('entity_')) {
                        e.preventDefault();
                        onEntityClick(href);
                      }
                    }}
                    {...props}
                  >
                    {children}
                  </a>
                ),
              },
            },
          }}
        >
          {activeTab === 'wiki' ? wikiContent : infoContent}
        </Markdown>
      </div>
    </div>
  );
}
