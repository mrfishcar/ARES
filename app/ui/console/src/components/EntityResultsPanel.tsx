/**
 * Entity Results Panel
 * Shows extracted entities grouped by type with neon planet universe icon
 * NOW DISPLAYS RELATIONS FROM FULL ARES ENGINE
 * SUPPORTS DRAG-AND-DROP ALIAS MERGING
 */

import { useState } from 'react';
import { NeonPlanet } from './NeonPlanet';
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

interface EntityResultsPanelProps {
  entities: EntitySpan[];
  relations?: Relation[];
  onViewWiki: (entityName: string) => void;
  isUpdating?: boolean;
  stats: {
    time: number;
    confidence: number;
    count: number;
    relationCount: number;
  };
  onCopyReport: () => void;
}

interface EntityGroup {
  type: string;
  label: string;
  entities: EntitySpan[];
  color: string;
  emoji: string;
}

const ENTITY_TYPE_CONFIG = {
  PERSON: { label: 'People', emoji: '👤', color: '#C28B6B' },
  PLACE: { label: 'Places', emoji: '🗺️', color: '#8BA888' },
  ORG: { label: 'Organizations', emoji: '🏢', color: '#9B8BBF' },
  EVENT: { label: 'Events', emoji: '📅', color: '#E8A87C' },
  CONCEPT: { label: 'Concepts', emoji: '💡', color: '#7BA8BF' },
  OBJECT: { label: 'Objects', emoji: '🎁', color: '#D89BAA' },
};

export function EntityResultsPanel({
  entities,
  relations = [],
  onViewWiki,
  isUpdating,
  stats,
  onCopyReport,
}: EntityResultsPanelProps) {
  const [draggedEntity, setDraggedEntity] = useState<EntitySpan | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const hasReport = stats.count > 0 || stats.relationCount > 0;

  // Group entities by type
  const groups: EntityGroup[] = Object.entries(
    entities.reduce((acc, entity) => {
      const type = entity.type;
      if (!acc[type]) acc[type] = [];
      acc[type].push(entity);
      return acc;
    }, {} as Record<string, EntitySpan[]>)
  ).map(([type, ents]) => ({
    type,
    label: ENTITY_TYPE_CONFIG[type as keyof typeof ENTITY_TYPE_CONFIG]?.label || type,
    emoji: ENTITY_TYPE_CONFIG[type as keyof typeof ENTITY_TYPE_CONFIG]?.emoji || '🔹',
    color: ENTITY_TYPE_CONFIG[type as keyof typeof ENTITY_TYPE_CONFIG]?.color || '#888',
    entities: ents,
  }));

  // Handle drag start
  const handleDragStart = (e: React.DragEvent, entity: EntitySpan) => {
    setDraggedEntity(entity);
    e.dataTransfer.effectAllowed = 'link';
    e.dataTransfer.setData('text/plain', entity.text);
  };

  // Handle drag over
  const handleDragOver = (e: React.DragEvent, targetEntity: EntitySpan) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'link';
    setDropTarget(targetEntity.text);
  };

  // Handle drag leave
  const handleDragLeave = () => {
    setDropTarget(null);
  };

  // Handle drop - merge entities as aliases
  const handleDrop = async (e: React.DragEvent, targetEntity: EntitySpan) => {
    e.preventDefault();
    setDropTarget(null);

    if (!draggedEntity || draggedEntity.text === targetEntity.text) {
      setDraggedEntity(null);
      return;
    }

    console.log(`Merging "${draggedEntity.text}" → "${targetEntity.text}"`);

    try {
      // Call API to register alias
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
      const response = await fetch(`${apiUrl}/register-alias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alias: draggedEntity.text,
          canonical: targetEntity.text,
          type: targetEntity.type,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Alias registered:', result);
        alert(`✓ Merged "${draggedEntity.text}" into "${targetEntity.text}"`);
      } else {
        throw new Error(`API error: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to register alias:', error);
      alert(`Failed to merge entities: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    setDraggedEntity(null);
  };

  // Group relations by predicate
  const relationGroups = relations.reduce((acc, rel) => {
    if (!acc[rel.pred]) acc[rel.pred] = [];
    acc[rel.pred].push(rel);
    return acc;
  }, {} as Record<string, Relation[]>);

    return (
      <div className="results-panel results-card">
        {/* Neon Planet Universe Icon */}
        <div className="universe-section">
          <NeonPlanet />
          <h2 className="universe-title">Your Universe</h2>
          <p className="universe-subtitle">
            {entities.length === 0
              ? 'Start writing to discover entities...'
              : `${entities.length} ${entities.length === 1 ? 'entity' : 'entities'} • ${relations.length} ${relations.length === 1 ? 'relation' : 'relations'}`}
          </p>
          <div className="sidebar-snapshot">
            <div className="snapshot-badges">
              <span className="snapshot-badge">⏱️ {stats.time}ms</span>
              <span className="snapshot-badge">🎯 {stats.confidence}%</span>
              <span className="snapshot-badge">📊 {stats.count}</span>
              <span className="snapshot-badge">🔗 {stats.relationCount}</span>
            </div>
            <button
              type="button"
              className="lab-button secondary"
              onClick={onCopyReport}
              disabled={!hasReport}
              title="Copy extraction report"
            >
              📋 Copy report
            </button>
          </div>
        </div>

      {/* Entity Groups */}
      {groups.length === 0 ? (
        <div className="empty-state">
          <p>No entities detected yet.</p>
          <p className="hint">Try typing: "King David married Bathsheba"</p>
        </div>
      ) : (
        <>
          <div className="entity-groups">
            {groups.map((group) => (
              <div key={group.type} className="entity-group">
                <h3 className="group-header">
                  <span className="group-emoji">{group.emoji}</span>
                  <span>{group.label}</span>
                  <span className="group-count">({group.entities.length})</span>
                </h3>
                <div className="entity-cards">
                  {group.entities.map((entity, idx) => (
                    <div
                      key={idx}
                      className={`entity-card entity-${group.type} ${dropTarget === entity.text ? 'drop-target' : ''} ${draggedEntity?.text === entity.text ? 'dragging' : ''}`}
                      style={{ borderLeftColor: group.color }}
                      draggable
                      onDragStart={(e) => handleDragStart(e, entity)}
                      onDragOver={(e) => handleDragOver(e, entity)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, entity)}
                      onClick={() => onViewWiki(entity.text)}
                    >
                      <div className="drag-handle" title="Drag to merge with another entity">⋮⋮</div>
                      <div className="entity-name">{entity.text}</div>
                      <div className="entity-meta">
                        <span className="entity-type">{entity.type}</span>
                        <span className="entity-confidence">
                          {Math.round(entity.confidence * 100)}%
                        </span>
                      </div>
                      <button className="view-wiki-btn">View Wiki →</button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Relations Section */}
          {relations.length > 0 && (
            <div className="relations-section">
              <h3 className="section-header">
                <span className="section-emoji">🔗</span>
                <span>Relations</span>
                <span className="section-count">({relations.length})</span>
              </h3>
              <div className="relation-groups">
                {Object.entries(relationGroups).map(([predicate, rels]) => (
                  <div key={predicate} className="relation-group">
                    <h4 className="predicate-header">{predicate.replace(/_/g, ' ')}</h4>
                    <div className="relation-list">
                      {rels.map((rel, idx) => (
                        <div key={idx} className="relation-item">
                          <span className="relation-subj" onClick={() => onViewWiki(rel.subjCanonical)}>
                            {rel.subjCanonical}
                          </span>
                          <span className="relation-arrow">→</span>
                          <span className="relation-obj" onClick={() => onViewWiki(rel.objCanonical)}>
                            {rel.objCanonical}
                          </span>
                          <span className="relation-confidence">
                            {Math.round(rel.confidence * 100)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {isUpdating && (
        <div
          className="entity-results-overlay"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            fontSize: 13,
            color: 'var(--text-secondary)',
            backdropFilter: 'blur(2px)',
          }}
        >
          <span>Updating…</span>
        </div>
      )}
    </div>
  );
}
