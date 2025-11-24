/**
 * Entity Modal - Overlay showing extracted entities and relations as badges
 */

import React from 'react';
import type { EntitySpan, EntityType } from '../types/entities';
import { getEntityTypeColor } from '../types/entities';

interface EntityModalProps {
  entities: EntitySpan[];
  relations: Array<{
    id: string;
    subj: string;
    obj: string;
    pred: string;
    confidence: number;
    subjCanonical: string;
    objCanonical: string;
  }>;
  onClose: () => void;
  onViewWiki: (entityName: string) => void;
}

export function EntityModal({ entities, relations, onClose, onViewWiki }: EntityModalProps) {
  // Deduplicate entities by canonical name
  const uniqueEntities = Array.from(
    new Map(entities.map(e => [e.text.toLowerCase(), e])).values()
  ).sort((a, b) => b.confidence - a.confidence);

  return (
    <>
      {/* Backdrop */}
      <div
        className="entity-modal-backdrop"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="entity-modal">
        <div className="entity-modal-header">
          <h2>📊 Entities & Relations</h2>
          <button
            onClick={onClose}
            className="entity-modal-close"
            title="Close"
          >
            ✕
          </button>
        </div>

        <div className="entity-modal-content">
          {/* Entities Section */}
          <div className="entity-section">
            <h3>Entities ({uniqueEntities.length})</h3>
            <div className="entity-badges">
              {uniqueEntities.length === 0 ? (
                <p className="empty-state">No entities detected</p>
              ) : (
                uniqueEntities.map((entity) => (
                  <button
                    key={entity.text}
                    className="entity-badge"
                    onClick={() => onViewWiki(entity.text)}
                    title={`${entity.type} - ${Math.round(entity.confidence * 100)}% confidence`}
                  >
                    <span
                      className="entity-badge-color"
                      style={{ backgroundColor: getEntityTypeColor(entity.type) }}
                    />
                    <span className="entity-badge-text">
                      {entity.text}
                      <span className="entity-badge-type">{entity.type}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Relations Section */}
          {relations.length > 0 && (
            <div className="entity-section">
              <h3>Relations ({relations.length})</h3>
              <div className="relation-badges">
                {relations.map((relation) => (
                  <div
                    key={relation.id}
                    className="relation-badge"
                    title={`${Math.round(relation.confidence * 100)}% confidence`}
                  >
                    <span className="relation-subject">{relation.subjCanonical}</span>
                    <span className="relation-predicate">→ {relation.pred}</span>
                    <span className="relation-object">{relation.objCanonical}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
