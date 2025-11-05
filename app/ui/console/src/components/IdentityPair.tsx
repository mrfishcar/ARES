/**
 * Identity Pair - Sprint R9
 * Component for reviewing potential duplicate entities
 */

import { useState } from 'react';
import type { IdentityCandidate, EntitySummary } from '../hooks/useIdentityReview';

interface IdentityPairProps {
  candidate: IdentityCandidate;
  onMerge: (entity1Id: string, entity2Id: string, primaryId: string) => Promise<void>;
  onSeparate: (entity1Id: string, entity2Id: string) => Promise<void>;
  onIgnore: (candidateId: string) => void;
}

export function IdentityPair({ candidate, onMerge, onSeparate, onIgnore }: IdentityPairProps) {
  const [expanded, setExpanded] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [primaryChoice, setPrimaryChoice] = useState<string>(candidate.entity1.id);

  const { entity1, entity2, similarityScore, evidenceReasons } = candidate;

  const handleMerge = async () => {
    setProcessing(true);
    try {
      await onMerge(entity1.id, entity2.id, primaryChoice);
      setShowMergeModal(false);
    } catch (error) {
      console.error('Merge failed:', error);
    } finally {
      setProcessing(false);
    }
  };

  const handleSeparate = async () => {
    setProcessing(true);
    try {
      await onSeparate(entity1.id, entity2.id);
    } catch (error) {
      console.error('Separate failed:', error);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div
      style={{
        background: 'white',
        borderRadius: '8px',
        padding: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        marginBottom: '16px',
      }}
    >
      {/* Header with similarity score */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              fontSize: '24px',
              fontWeight: '700',
              color: similarityScore > 0.85 ? '#10b981' : similarityScore > 0.75 ? '#f59e0b' : '#6b7280',
            }}
          >
            {(similarityScore * 100).toFixed(0)}%
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>Similarity Match</div>
            <div style={{ fontSize: '11px', color: '#9ca3af' }}>
              {candidate.sharedRelations} shared relations
            </div>
          </div>
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: '20px',
            color: '#6b7280',
          }}
        >
          {expanded ? '▼' : '▶'}
        </button>
      </div>

      {/* Entity comparison */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '16px', marginBottom: '16px' }}>
        <EntityCard entity={entity1} />
        <div style={{ display: 'flex', alignItems: 'center', color: '#9ca3af', fontSize: '24px' }}>
          ↔
        </div>
        <EntityCard entity={entity2} />
      </div>

      {/* Evidence (expanded) */}
      {expanded && (
        <div
          style={{
            marginTop: '16px',
            padding: '16px',
            background: '#f9fafb',
            borderRadius: '6px',
            marginBottom: '16px',
          }}
        >
          <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
            Evidence
          </div>
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            {evidenceReasons.map((reason, idx) => (
              <li key={idx} style={{ fontSize: '13px', color: '#374151', marginBottom: '4px' }}>
                {reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => setShowMergeModal(true)}
          disabled={processing}
          style={{
            flex: 1,
            padding: '10px',
            background: processing ? '#e5e7eb' : '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: processing ? 'not-allowed' : 'pointer',
          }}
        >
          ✓ Same Entity (Merge)
        </button>
        <button
          onClick={handleSeparate}
          disabled={processing}
          style={{
            flex: 1,
            padding: '10px',
            background: processing ? '#e5e7eb' : '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: processing ? 'not-allowed' : 'pointer',
          }}
        >
          ✗ Different (Separate)
        </button>
        <button
          onClick={() => onIgnore(candidate.id)}
          disabled={processing}
          style={{
            padding: '10px 20px',
            background: processing ? '#e5e7eb' : '#f3f4f6',
            color: '#6b7280',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: processing ? 'not-allowed' : 'pointer',
          }}
        >
          Skip
        </button>
      </div>

      {/* Merge modal */}
      {showMergeModal && (
        <>
          <div
            onClick={() => setShowMergeModal(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              zIndex: 9998,
            }}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'white',
              borderRadius: '12px',
              padding: '24px',
              width: '90%',
              maxWidth: '500px',
              zIndex: 9999,
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}
          >
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>
              Choose Primary Entity
            </h3>
            <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '20px' }}>
              Select which entity should be kept as the primary. The other will be merged into it.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px',
                  border: primaryChoice === entity1.id ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: primaryChoice === entity1.id ? '#eff6ff' : 'white',
                }}
              >
                <input
                  type="radio"
                  name="primary"
                  value={entity1.id}
                  checked={primaryChoice === entity1.id}
                  onChange={() => setPrimaryChoice(entity1.id)}
                  style={{ marginRight: '12px' }}
                />
                <div>
                  <div style={{ fontWeight: '600' }}>{entity1.name}</div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>
                    {entity1.relationCount} relations • {entity1.seeds.length} seeds
                  </div>
                </div>
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px',
                  border: primaryChoice === entity2.id ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: primaryChoice === entity2.id ? '#eff6ff' : 'white',
                }}
              >
                <input
                  type="radio"
                  name="primary"
                  value={entity2.id}
                  checked={primaryChoice === entity2.id}
                  onChange={() => setPrimaryChoice(entity2.id)}
                  style={{ marginRight: '12px' }}
                />
                <div>
                  <div style={{ fontWeight: '600' }}>{entity2.name}</div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>
                    {entity2.relationCount} relations • {entity2.seeds.length} seeds
                  </div>
                </div>
              </label>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setShowMergeModal(false)}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleMerge}
                disabled={processing}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: processing ? '#e5e7eb' : '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: processing ? 'not-allowed' : 'pointer',
                }}
              >
                {processing ? 'Merging...' : 'Confirm Merge'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function EntityCard({ entity }: { entity: EntitySummary }) {
  return (
    <div style={{ padding: '12px', background: '#f9fafb', borderRadius: '6px' }}>
      <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>
        {entity.name}
      </div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
        <span
          style={{
            padding: '2px 8px',
            background: '#eff6ff',
            color: '#1d4ed8',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: '500',
          }}
        >
          {entity.category}
        </span>
        <span style={{ fontSize: '11px', color: '#6b7280' }}>
          {(entity.confidence * 100).toFixed(0)}% confidence
        </span>
      </div>
      <div style={{ fontSize: '12px', color: '#6b7280' }}>
        {entity.relationCount} relations • {entity.seeds.length} seeds
      </div>
    </div>
  );
}
