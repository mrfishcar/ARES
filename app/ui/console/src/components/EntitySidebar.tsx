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
}: EntitySidebarProps) {
  return (
    <aside className="entity-sidebar">
      <div className="entity-sidebar__header">
        <div>
          <p className="entity-sidebar__title">Entities ({entities.length})</p>
          <p className="entity-sidebar__subtitle">Right-hand review panel</p>
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
                  <div className="entity-pill__row">
                    <div className="entity-pill__label">
                      <div className="entity-pill__name">{name}</div>
                      <div className="entity-pill__meta">
                        <span className="entity-pill__chip">{entity.type}</span>
                        {originalTypeChanged && (
                          <span className="entity-pill__chip subtle">was {entity.originalType}</span>
                        )}
                        <span className="entity-pill__chip subtle">{entity.start}–{entity.end}</span>
                      </div>
                    </div>
                    <div className="entity-pill__controls">
                      <select
                        className="entity-pill__select"
                        value={entity.type}
                        onChange={(e) => onChangeType(entity, e.target.value as EntityType)}
                      >
                        {ENTITY_TYPES.map((type) => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="entity-pill__reject"
                        onClick={() => onReject(entity)}
                        aria-label={`Reject ${name}`}
                      >
                        ✕ Reject
                      </button>
                    </div>
                  </div>

                  <label className="entity-pill__notes-label" htmlFor={`notes-${entity.start}-${entity.end}`}>
                    Notes
                  </label>
                  <textarea
                    id={`notes-${entity.start}-${entity.end}`}
                    className="entity-pill__notes"
                    placeholder="Add review notes for this entity"
                    value={entity.notes || ''}
                    onChange={(e) => onNotesChange(entity, e.target.value)}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
