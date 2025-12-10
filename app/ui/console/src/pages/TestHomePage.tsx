/**
 * Simple test page to verify routing
 */

export function TestHomePage() {
  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: 'var(--bg-primary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '32px',
      fontWeight: 'bold'
    }}>
      Test Home Page - If you see this, routing is working!
    </div>
  );
}
