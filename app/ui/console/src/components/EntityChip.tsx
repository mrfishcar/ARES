/**
 * Entity Chip Component - Sprint R7
 * Visual chip for entity tags in markdown
 */

interface EntityChipProps {
  name: string;
  type: 'existing' | 'new';
  entityType?: string;
}

export function EntityChip({ name, type, entityType }: EntityChipProps) {
  const isNew = type === 'new';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '13px',
        fontWeight: '500',
        background: isNew ? '#fef3c7' : '#dbeafe',
        color: isNew ? '#92400e' : '#1e40af',
        border: isNew ? '1px solid #fbbf24' : '1px solid #3b82f6',
        marginLeft: '2px',
        marginRight: '2px',
      }}
    >
      {name}
      {entityType && (
        <span
          style={{
            marginLeft: '4px',
            fontSize: '11px',
            opacity: 0.7,
          }}
        >
          ({entityType})
        </span>
      )}
      {isNew && (
        <span
          style={{
            marginLeft: '4px',
            fontSize: '11px',
            opacity: 0.6,
          }}
        >
          ✨
        </span>
      )}
    </span>
  );
}
