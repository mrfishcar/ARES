interface Evidence {
  text: string;
  confidence: number;
}

interface Props {
  title: string;
  evidence: Evidence[];
  onClose: () => void;
}

export function EvidenceModal({ title, evidence, onClose }: Props) {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }} onClick={onClose}>
      <div style={{
        background: 'white',
        padding: '2rem',
        borderRadius: '8px',
        maxWidth: '600px',
        maxHeight: '80vh',
        overflow: 'auto'
      }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>{title}</h2>
        <div>
          {evidence.map((ev, idx) => (
            <div key={idx} style={{
              padding: '1rem',
              background: '#ecf0f1',
              marginBottom: '0.5rem',
              borderRadius: '4px'
            }}>
              <p style={{ margin: 0 }}>{ev.text}</p>
              {ev.confidence > 0 && (
                <small style={{ color: '#7f8c8d' }}>Confidence: {(ev.confidence * 100).toFixed(1)}%</small>
              )}
            </div>
          ))}
        </div>
        <button onClick={onClose} style={{ marginTop: '1rem' }}>Close</button>
      </div>
    </div>
  );
}
