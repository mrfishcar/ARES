import type { RefObject } from 'react';
import type { EntitySpan, EntityType } from '../types/entities';

export interface EntitySidebarEntity extends EntitySpan {
  originalType?: EntityType;
  notes?: string;
  spans?: Array<{ start: number; end: number; text: string }>;
}

interface EntitySidebarProps {
  entities: EntitySidebarEntity[];
  onChangeType: (entity: EntitySidebarEntity, newType: EntityType) => void;
  onReject: (entity: EntitySidebarEntity) => void;
  onNotesChange: (entity: EntitySidebarEntity, notes: string) => void;
  onLogReport: () => void;
  onCopyReport: () => void;
  isUpdating?: boolean;
  onPin?: () => void;
  onClose?: () => void;
  closeButtonRef?: RefObject<HTMLButtonElement>;
}

const ENTITY_TYPES: EntityType[] = [
  'PERSON', 'PLACE', 'ORG', 'EVENT', 'CONCEPT', 'OBJECT', 'RACE', 'CREATURE',
  'ARTIFACT', 'TECHNOLOGY', 'MAGIC', 'LANGUAGE', 'CURRENCY', 'MATERIAL', 'DRUG',
  'DEITY', 'ABILITY', 'SKILL', 'POWER', 'TECHNIQUE', 'SPELL', 'DATE', 'TIME',
  'WORK', 'ITEM', 'MISC', 'SPECIES', 'HOUSE', 'TRIBE', 'TITLE'
];

export function EntitySidebar({
  entities,
  onChangeType,
  onReject,
  onNotesChange,
  onLogReport,
  onCopyReport,
  isUpdating,
  onPin,
  onClose,
  closeButtonRef,
}: EntitySidebarProps) {
  return (
    <aside className="entity-sidebar">
      <div className="entity-sidebar__header">
        <div className="entity-sidebar__heading">
          <p className="entity-sidebar__title">Entities ({entities.length})</p>
          <p className="entity-sidebar__subtitle">
            Review detected entities, adjust types, and capture notes.
          </p>
        </div>
        <div className="entity-sidebar__actions">
          <button
            type="button"
            className="lab-button secondary"
            onClick={onLogReport}
            disabled={entities.length === 0 || isUpdating}
          >
            💾 Log Report
          </button>
          <button
            type="button"
            className="lab-button primary"
            onClick={onCopyReport}
            disabled={entities.length === 0 || isUpdating}
          >
            📋 Copy Report
          </button>
          {onPin && (
            <button
              type="button"
              className="lab-button ghost"
              onClick={onPin}
              aria-label="Pin sidebar"
            >
              📌
            </button>
          )}
          {onClose && (
            <button
              type="button"
              className="lab-button ghost"
              onClick={onClose}
              aria-label="Close sidebar"
              ref={closeButtonRef}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="entity-sidebar__list">
        {entities.length === 0 ? (
          <div className="entity-sidebar__empty">
            <p>No entities yet. Run extraction or add manual tags.</p>
          </div>
        ) : (
          entities.map((entity) => {
            const originalTypeChanged = Boolean(
              entity.originalType && entity.originalType !== entity.type
            );
            const name = entity.canonicalName || entity.displayText || entity.text;

            return (
              <div key={entity.id || `${entity.start}:${entity.end}:${entity.text}`}>
                <div className="entity-pill">
                  <div className="entity-pill__top">
                    <div className="entity-pill__info">
                      <div className="entity-pill__name">{name}</div>
                      <div className="entity-pill__meta">
                        <span className="entity-pill__chip subtle">Span {entity.start}–{entity.end}</span>
                        <span className="entity-pill__chip">{entity.type}</span>
                        {originalTypeChanged && (
                          <span className="entity-pill__chip subtle">was {entity.originalType}</span>
                        )}
                      </div>
                    </div>
                    <div className="entity-pill__type">
                      <label className="entity-pill__field-label" htmlFor={`type-${entity.id || entity.start}`}>Type</label>
                      <select
                        id={`type-${entity.id || entity.start}`}
                        className="entity-pill__select"
                        value={entity.type}
                        onChange={(e) => onChangeType(entity, e.target.value as EntityType)}
                      >
                        {ENTITY_TYPES.map((type) => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="entity-pill__notes-row">
                    <div className="entity-pill__notes-header">
                      <label className="entity-pill__notes-label" htmlFor={`notes-${entity.start}-${entity.end}`}>
                        Notes
                      </label>
                      <button
                        type="button"
                        className="entity-pill__reject"
                        onClick={() => onReject(entity)}
                        aria-label={`Reject ${name}`}
                      >
                        ✕ Reject
                      </button>
                    </div>
                    <textarea
                      id={`notes-${entity.start}-${entity.end}`}
                      className="entity-pill__notes"
                      placeholder="Add review notes for this entity"
                      value={entity.notes || ''}
                      onChange={(e) => onNotesChange(entity, e.target.value)}
                    />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
