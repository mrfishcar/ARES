/**
 * Entity Results Panel
 * Shows extracted entities grouped by type with neon planet universe icon
 */

import { type EntitySpan } from '../../../../editor/entityHighlighter';
import { NeonPlanet } from './NeonPlanet';

interface EntityResultsPanelProps {
  entities: EntitySpan[];
  onViewWiki: (entityName: string) => void;
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

export function EntityResultsPanel({ entities, onViewWiki }: EntityResultsPanelProps) {
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

  return (
    <div className="results-panel">
      {/* Neon Planet Universe Icon */}
      <div className="universe-section">
        <NeonPlanet />
        <h2 className="universe-title">Your Universe</h2>
        <p className="universe-subtitle">
          {entities.length === 0
            ? 'Start writing to discover entities...'
            : `${entities.length} ${entities.length === 1 ? 'entity' : 'entities'} discovered`}
        </p>
      </div>

      {/* Entity Groups */}
      {groups.length === 0 ? (
        <div className="empty-state">
          <p>No entities detected yet.</p>
          <p className="hint">Try typing: "King David married Bathsheba"</p>
        </div>
      ) : (
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
                    className={`entity-card entity-${group.type}`}
                    style={{ borderLeftColor: group.color }}
                    onClick={() => onViewWiki(entity.text)}
                  >
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
      )}
    </div>
  );
}
