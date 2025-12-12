import type { EntityType } from '../types/entities';
import type { ReviewedEntity } from '../lib/entityReport';

const ENTITY_TYPE_OPTIONS: EntityType[] = [
  'PERSON', 'PLACE', 'ORG', 'EVENT', 'CONCEPT', 'OBJECT',
  'RACE', 'CREATURE', 'ARTIFACT', 'TECHNOLOGY', 'MAGIC', 'LANGUAGE',
  'CURRENCY', 'MATERIAL', 'DRUG', 'DEITY', 'ABILITY', 'SKILL', 'POWER',
  'TECHNIQUE', 'SPELL', 'DATE', 'TIME', 'WORK', 'ITEM', 'MISC', 'SPECIES',
  'HOUSE', 'TRIBE', 'TITLE'
];

interface EntitySidebarProps {
  entities: ReviewedEntity[];
  onChangeType: (id: string, type: EntityType) => void;
  onReject: (id: string) => void;
  onUpdateNotes: (id: string, notes: string) => void;
  onCopyReport: () => void;
  onLogReport: () => void;
  onClose?: () => void;
}

export function EntitySidebar({
  entities,
  onChangeType,
  onReject,
  onUpdateNotes,
  onCopyReport,
  onLogReport,
  onClose,
}: EntitySidebarProps) {
  return (
    <aside className="entity-sidebar">
      <header className="entity-sidebar__header">
        <div className="entity-sidebar__title">
          <h3>Entities ({entities.length})</h3>
          <p className="entity-sidebar__subtitle">
            Review detected entities, adjust types, and capture notes.
          </p>
        </div>
        <div className="entity-sidebar__actions">
          <button type="button" className="lab-button secondary" onClick={onLogReport}>
            🪵 Log Report
          </button>
          <button type="button" className="lab-button primary" onClick={onCopyReport}>
            📋 Copy Report
          </button>
          {onClose && (
            <button
              type="button"
              className="lab-button secondary entity-sidebar__close"
              onClick={onClose}
              aria-label="Close sidebar"
            >
              ✕
            </button>
          )}
        </div>
      </header>

      <div className="entity-sidebar__list">
        {entities.length === 0 ? (
          <div className="entity-sidebar__empty">
            <p>No entities to review yet.</p>
            <p className="entity-sidebar__hint">Run extraction or add manual tags to begin.</p>
          </div>
        ) : (
          entities.map(entity => (
            <div key={entity.id} className="entity-sidebar__pill">
              <div className="entity-sidebar__row">
                <div className="entity-sidebar__name">
                  <div className="entity-sidebar__label">{entity.canonicalName || entity.name}</div>
                  <div className="entity-sidebar__meta">Span {entity.spans[0]?.start ?? 0}–{entity.spans[0]?.end ?? 0}</div>
                </div>
                <div className="entity-sidebar__controls">
                  <label className="entity-sidebar__field">
                    <span className="entity-sidebar__field-label">Type</span>
                    <select
                      value={entity.currentType}
                      onChange={e => onChangeType(entity.id, e.target.value as EntityType)}
                      className="entity-sidebar__select"
                    >
                      {ENTITY_TYPE_OPTIONS.map(option => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="lab-button secondary"
                    onClick={() => onReject(entity.id)}
                  >
                    Reject
                  </button>
                </div>
              </div>
              <label className="entity-sidebar__notes">
                <span className="entity-sidebar__field-label">Notes</span>
                <textarea
                  value={entity.notes ?? ''}
                  onChange={e => onUpdateNotes(entity.id, e.target.value)}
                  placeholder="Add review notes"
                  rows={2}
                />
              </label>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
