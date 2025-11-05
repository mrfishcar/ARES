import { useState } from 'react';
import { EvidenceModal } from './EvidenceModal';

interface Entity {
  id: string;
  name: string;
  aliases: string[];
  types: string[];
  evidence: Array<{ text: string; confidence: number }>;
}

interface Props {
  entities: Entity[];
  onApprove: (id: string) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
  selectedIndex?: number;
}

export function PendingEntities({ entities, onApprove, onDismiss, selectedIndex = -1 }: Props) {
  const [selectedEvidence, setSelectedEvidence] = useState<Entity | null>(null);

  if (entities.length === 0) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#7f8c8d' }}>
      No pending entities
    </div>;
  }

  return (
    <>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#34495e', color: 'white' }}>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Name</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Aliases</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Types</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Avg Confidence</th>
            <th style={{ padding: '0.75rem', textAlign: 'center' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {entities.map((entity, idx) => {
            const avgConf = entity.evidence.reduce((sum, e) => sum + e.confidence, 0) / entity.evidence.length;
            const isSelected = idx === selectedIndex;
            return (
              <tr
                key={entity.id}
                id={`entity-${idx}`}
                style={{
                  background: isSelected ? '#3498db' : (idx % 2 ? '#ecf0f1' : 'white'),
                  color: isSelected ? 'white' : 'inherit',
                  outline: isSelected ? '2px solid #2980b9' : 'none'
                }}
              >
                <td style={{ padding: '0.75rem' }}>{entity.name}</td>
                <td style={{ padding: '0.75rem' }}>{entity.aliases.join(', ') || '-'}</td>
                <td style={{ padding: '0.75rem' }}>{entity.types.join(', ')}</td>
                <td style={{ padding: '0.75rem' }}>{(avgConf * 100).toFixed(1)}%</td>
                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                  <button onClick={() => onApprove(entity.id)} style={{ marginRight: '0.5rem' }}>✓ Approve</button>
                  <button onClick={() => onDismiss(entity.id)} style={{ marginRight: '0.5rem' }}>✗ Dismiss</button>
                  <button onClick={() => setSelectedEvidence(entity)}>🔍 Inspect</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {selectedEvidence && (
        <EvidenceModal
          title={selectedEvidence.name}
          evidence={selectedEvidence.evidence}
          onClose={() => setSelectedEvidence(null)}
        />
      )}
    </>
  );
}
