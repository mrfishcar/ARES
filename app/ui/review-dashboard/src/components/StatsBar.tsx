interface StatsBarProps {
  entities: number;
  relations: number;
  polling?: boolean;
}

export function StatsBar({ entities, relations, polling }: StatsBarProps) {
  return (
    <div style={{
      display: 'flex',
      gap: '2rem',
      padding: '1rem 2rem',
      background: '#ecf0f1',
      borderBottom: '1px solid #bdc3c7',
      alignItems: 'center'
    }}>
      <div>
        <strong>Pending Entities:</strong> {entities}
      </div>
      <div>
        <strong>Pending Relations:</strong> {relations}
      </div>
      {polling && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto', color: '#7f8c8d', fontSize: '0.875rem' }}>
          <div style={{
            width: '12px',
            height: '12px',
            border: '2px solid #bdc3c7',
            borderTopColor: '#3498db',
            borderRadius: '50%',
            animation: 'spin 0.6s linear infinite'
          }} />
          Checking for updates...
          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
