/**
 * Loading Components - Sprint R5
 * Spinners and skeleton states
 */

export function Spinner({ size = 24 }: { size?: number }) {
  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        border: '3px solid #e5e7eb',
        borderTopColor: '#3b82f6',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
      }}
    />
  );
}

export function LoadingPage() {
  return (
    <div className="app-loader">
      <Spinner size={48} />
      <p className="app-loader__text">Loading...</p>
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div
      style={{
        background: '#f3f4f6',
        height: '40px',
        borderRadius: '4px',
        marginBottom: '8px',
        animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }}
    />
  );
}

export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
`;
document.head.appendChild(style);
