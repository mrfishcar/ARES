import { useState } from 'react';
import { EvidenceModal } from './EvidenceModal';

interface Relation {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  symmetric: boolean;
  evidence: Array<{ text: string }>;
}

interface Props {
  relations: Relation[];
  onApprove: (id: string) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
  selectedIndex?: number;
}

export function PendingRelations({ relations, onApprove, onDismiss, selectedIndex = -1 }: Props) {
  const [selectedEvidence, setSelectedEvidence] = useState<Relation | null>(null);

  if (relations.length === 0) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#7f8c8d' }}>
      No pending relations
    </div>;
  }

  return (
    <>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#34495e', color: 'white' }}>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Subject</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Predicate</th>
            <th style={{ padding: '0.75rem', textAlign: 'left' }}>Object</th>
            <th style={{ padding: '0.75rem', textAlign: 'center' }}>Symmetric</th>
            <th style={{ padding: '0.75rem', textAlign: 'center' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {relations.map((rel, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <tr
                key={rel.id}
                id={`relation-${idx}`}
                style={{
                  background: isSelected ? '#3498db' : (idx % 2 ? '#ecf0f1' : 'white'),
                  color: isSelected ? 'white' : 'inherit',
                  outline: isSelected ? '2px solid #2980b9' : 'none'
                }}
              >
                <td style={{ padding: '0.75rem' }}>{rel.subject}</td>
                <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>{rel.predicate}</td>
                <td style={{ padding: '0.75rem' }}>{rel.object}</td>
                <td style={{ padding: '0.75rem', textAlign: 'center' }}>{rel.symmetric ? '✓' : '-'}</td>
                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                  <button onClick={() => onApprove(rel.id)} style={{ marginRight: '0.5rem' }}>✓ Approve</button>
                  <button onClick={() => onDismiss(rel.id)} style={{ marginRight: '0.5rem' }}>✗ Dismiss</button>
                  <button onClick={() => setSelectedEvidence(rel)}>🔍 Inspect</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {selectedEvidence && (
        <EvidenceModal
          title={`${selectedEvidence.subject} → ${selectedEvidence.predicate} → ${selectedEvidence.object}`}
          evidence={selectedEvidence.evidence.map(e => ({ text: e.text, confidence: 0 }))}
          onClose={() => setSelectedEvidence(null)}
        />
      )}
    </>
  );
}
