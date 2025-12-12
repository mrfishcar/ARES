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
  mode?: 'overlay' | 'pinned';
  className?: string;
  onChangeType: (id: string, type: EntityType) => void;
  onReject: (id: string) => void;
  onUpdateNotes: (id: string, notes: string) => void;
  onCopyReport: () => void;
  onLogReport: () => void;
  onPin?: () => void;
  onClose?: () => void;
}

export function EntitySidebar({
  entities,
  mode = 'pinned',
  className,
  onChangeType,
  onReject,
  onUpdateNotes,
  onCopyReport,
  onLogReport,
  onPin,
  onClose,
}: EntitySidebarProps) {
  const sidebarClassName = [
    'entity-sidebar',
    mode === 'overlay' ? 'entity-sidebar--floating' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <aside className={sidebarClassName}>
      <header className="entity-sidebar__header">
        <div className="entity-sidebar__header-row">
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
            {onPin && (
              <button
                type="button"
                className="lab-button ghost entity-sidebar__icon-button"
                onClick={onPin}
                aria-label="Pin sidebar"
                title="Pin sidebar"
              >
                📌
              </button>
            )}
            {onClose && (
              <button
                type="button"
                className="lab-button ghost entity-sidebar__icon-button"
                onClick={onClose}
                aria-label="Close sidebar"
              >
                ✕
              </button>
            )}
          </div>
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
            <div key={entity.id} className="entity-sidebar__row">
              <div className="entity-sidebar__row-grid">
                <div className="entity-sidebar__name">
                  <div className="entity-sidebar__label">{entity.canonicalName || entity.name}</div>
                  <div className="entity-sidebar__meta">Span {entity.spans[0]?.start ?? 0}–{entity.spans[0]?.end ?? 0}</div>
                </div>
                <label className="entity-sidebar__field entity-sidebar__type">
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
                <label className="entity-sidebar__notes">
                  <span className="entity-sidebar__field-label">Notes</span>
                  <textarea
                    value={entity.notes ?? ''}
                    onChange={e => onUpdateNotes(entity.id, e.target.value)}
                    placeholder="Add review notes"
                    rows={2}
                  />
                </label>
                <div className="entity-sidebar__actions-cell">
                  <button
                    type="button"
                    className="lab-button secondary entity-sidebar__reject"
                    onClick={() => onReject(entity.id)}
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
