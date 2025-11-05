/**
 * Empty State Component - Hotfix S1
 * Friendly empty states for lists, errors, and missing data
 */

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  type?: 'empty' | 'error' | 'loading' | 'coming-soon';
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  type = 'empty',
}: EmptyStateProps) {
  const typeConfig = {
    empty: {
      defaultIcon: '📝',
      bgColor: '#f9fafb',
      borderColor: '#e5e7eb',
    },
    error: {
      defaultIcon: '⚠️',
      bgColor: '#fef2f2',
      borderColor: '#fecaca',
    },
    loading: {
      defaultIcon: '⏳',
      bgColor: '#eff6ff',
      borderColor: '#bfdbfe',
    },
    'coming-soon': {
      defaultIcon: '🚧',
      bgColor: '#fef3c7',
      borderColor: '#fde047',
    },
  };

  const config = typeConfig[type];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '64px 32px',
        background: config.bgColor,
        borderRadius: '12px',
        border: `2px dashed ${config.borderColor}`,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>
        {icon || config.defaultIcon}
      </div>
      <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px', color: '#111827' }}>
        {title}
      </h3>
      {description && (
        <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px', maxWidth: '400px' }}>
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          style={{
            padding: '10px 20px',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
