/**
 * Entity Review Sidebar - Table-based entity review interface
 *
 * Features:
 * - Table layout with rounded rows
 * - Four columns: Entity Name, Type dropdown, Reject button, Notes
 * - No text mutation for rejection (uses entity.rejected flag)
 * - JSON reports (Log & Copy)
 * - Pinned/overlay modes
 */

import { useState, useCallback } from 'react';
import type { EntitySpan, EntityType } from '../types/entities';
import './EntityReviewSidebar.css';

interface EntityReviewSidebarProps {
  mode: 'overlay' | 'pinned';
  entities: EntitySpan[];
  onClose: () => void;
  onPin: () => void;
  onEntityUpdate: (index: number, updates: Partial<EntitySpan>) => void;
  onLogReport: () => void;
  onCopyReport: () => void;
}

const ENTITY_TYPES: EntityType[] = [
  'PERSON', 'PLACE', 'ORG', 'EVENT', 'CONCEPT', 'OBJECT',
  'RACE', 'CREATURE', 'ARTIFACT', 'TECHNOLOGY', 'MAGIC',
  'LANGUAGE', 'CURRENCY', 'MATERIAL', 'DRUG', 'DEITY',
  'ABILITY', 'SKILL', 'POWER', 'TECHNIQUE', 'SPELL',
  'DATE', 'TIME', 'WORK', 'ITEM', 'MISC', 'SPECIES',
  'HOUSE', 'TRIBE', 'TITLE'
];

export function EntityReviewSidebar({
  mode,
  entities,
  onClose,
  onPin,
  onEntityUpdate,
  onLogReport,
  onCopyReport,
}: EntityReviewSidebarProps) {
  // Filter out rejected entities or show all based on preference
  const [showRejected, setShowRejected] = useState(false);
  const displayEntities = showRejected
    ? entities
    : entities.filter(e => !e.rejected);

  const handleTypeChange = useCallback((index: number, newType: EntityType) => {
    onEntityUpdate(index, { type: newType });
  }, [onEntityUpdate]);

  const handleReject = useCallback((index: number) => {
    const entity = entities[index];
    onEntityUpdate(index, { rejected: !entity.rejected });
  }, [entities, onEntityUpdate]);

  const handleNotesChange = useCallback((index: number, notes: string) => {
    onEntityUpdate(index, { notes });
  }, [onEntityUpdate]);

  const keptCount = entities.filter(e => !e.rejected).length;
  const rejectedCount = entities.filter(e => e.rejected).length;

  return (
    <div className={`entity-review-sidebar ${mode}`}>
      {/* Header */}
      <div className="review-sidebar-header">
        <div className="review-sidebar-title">
          <h2>Entities ({displayEntities.length})</h2>
          <p className="review-sidebar-subtitle">
            Review detected entities, adjust types, and capture notes.
          </p>
          <div className="review-sidebar-stats">
            <span className="stat-badge stat-kept">{keptCount} kept</span>
            <span className="stat-badge stat-rejected">{rejectedCount} rejected</span>
          </div>
        </div>

        <div className="review-sidebar-actions">
          <button
            onClick={onLogReport}
            className="action-btn"
            title="Save JSON report to disk"
          >
            Log Report
          </button>
          <button
            onClick={onCopyReport}
            className="action-btn"
            title="Copy JSON report to clipboard"
          >
            Copy Report
          </button>
          <button
            onClick={onPin}
            className="action-btn-icon"
            title={mode === 'pinned' ? 'Unpin sidebar' : 'Pin sidebar'}
          >
            📌
          </button>
          <button
            onClick={onClose}
            className="action-btn-icon"
            title="Close sidebar"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Filter toggle */}
      <div className="review-sidebar-filter">
        <label>
          <input
            type="checkbox"
            checked={showRejected}
            onChange={(e) => setShowRejected(e.target.checked)}
          />
          Show rejected entities
        </label>
      </div>

      {/* Entity table */}
      <div className="review-sidebar-body">
        {displayEntities.length === 0 ? (
          <div className="review-sidebar-empty">
            <p>No entities to review</p>
          </div>
        ) : (
          <div className="entity-table">
            {/* Table header */}
            <div className="entity-table-header">
              <div className="col-name">Entity Name</div>
              <div className="col-type">Type</div>
              <div className="col-reject">Reject</div>
              <div className="col-notes">Notes</div>
            </div>

            {/* Table rows */}
            {displayEntities.map((entity, idx) => {
              // Find original index in full entities array
              const originalIndex = entities.indexOf(entity);
              const entityName = entity.canonicalName || entity.displayText || entity.text;
              const isRejected = entity.rejected;

              return (
                <div
                  key={`${entity.text}-${entity.start}-${idx}`}
                  className={`entity-row ${isRejected ? 'entity-row--rejected' : ''}`}
                >
                  {/* Column 1: Entity Name */}
                  <div className="col-name">
                    <div className="entity-name-primary">{entityName}</div>
                    <div className="entity-name-secondary">
                      Span {entity.start}–{entity.end}
                    </div>
                  </div>

                  {/* Column 2: Type Dropdown */}
                  <div className="col-type">
                    <select
                      value={entity.type}
                      onChange={(e) => handleTypeChange(originalIndex, e.target.value as EntityType)}
                      className="type-select"
                      disabled={isRejected}
                    >
                      {ENTITY_TYPES.map(type => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Column 3: Reject Button */}
                  <div className="col-reject">
                    <button
                      onClick={() => handleReject(originalIndex)}
                      className={`reject-btn ${isRejected ? 'reject-btn--active' : ''}`}
                      title={isRejected ? 'Restore entity' : 'Reject entity'}
                    >
                      {isRejected ? 'Restore' : 'Reject'}
                    </button>
                  </div>

                  {/* Column 4: Notes */}
                  <div className="col-notes">
                    <input
                      type="text"
                      value={entity.notes || ''}
                      onChange={(e) => handleNotesChange(originalIndex, e.target.value)}
                      placeholder="Add notes..."
                      className="notes-input"
                      disabled={isRejected}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
