interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  inline?: boolean;
}

export function LoadingSpinner({ size = 'medium', inline = false }: LoadingSpinnerProps) {
  const sizeMap = {
    small: '16px',
    medium: '24px',
    large: '40px'
  };

  const spinnerSize = sizeMap[size];

  if (inline) {
    return (
      <span
        style={{
          display: 'inline-block',
          width: spinnerSize,
          height: spinnerSize,
          border: '2px solid rgba(255, 255, 255, 0.3)',
          borderTopColor: 'white',
          borderRadius: '50%',
          animation: 'spin 0.6s linear infinite',
          marginLeft: '0.5rem',
          verticalAlign: 'middle'
        }}
      />
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
      <div
        style={{
          width: spinnerSize,
          height: spinnerSize,
          border: '3px solid #ecf0f1',
          borderTopColor: '#3498db',
          borderRadius: '50%',
          animation: 'spin 0.6s linear infinite'
        }}
      />
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
