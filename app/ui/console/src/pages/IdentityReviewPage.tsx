/**
 * Identity Review Page - Sprint R9
 * Interface for reviewing and resolving potential duplicate entities
 */

import { useState } from 'react';
import { IdentityPair } from '../components/IdentityPair';
import { useIdentityReview } from '../hooks/useIdentityReview';

interface IdentityReviewPageProps {
  project: string;
  toast: any;
}

export function IdentityReviewPage({ project, toast }: IdentityReviewPageProps) {
  const [minSimilarity, setMinSimilarity] = useState(0.7);
  const { candidates, loading, error, mergeEntities, separateEntities, ignorePair } =
    useIdentityReview(project, minSimilarity);

  const handleMerge = async (entity1Id: string, entity2Id: string, primaryId: string) => {
    try {
      await mergeEntities(entity1Id, entity2Id, primaryId);
      toast.success('Entities merged successfully!');
    } catch (err) {
      toast.error(`Failed to merge: ${err instanceof Error ? err.message : 'Unknown error'}`);
      throw err;
    }
  };

  const handleSeparate = async (entity1Id: string, entity2Id: string) => {
    try {
      await separateEntities(entity1Id, entity2Id);
      toast.success('Entities marked as separate');
    } catch (err) {
      toast.error(`Failed to separate: ${err instanceof Error ? err.message : 'Unknown error'}`);
      throw err;
    }
  };

  const handleIgnore = (candidateId: string) => {
    ignorePair(candidateId);
    toast.info('Pair skipped');
  };

  if (loading) {
    return (
      <div style={{ padding: '48px', textAlign: 'center' }}>
        <div style={{ fontSize: '16px', color: '#6b7280' }}>Loading candidates...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '48px', textAlign: 'center' }}>
        <div style={{ fontSize: '16px', color: '#ef4444' }}>Error: {error}</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>
          🤝 Identity Review
        </h1>
        <p style={{ fontSize: '16px', color: '#6b7280', lineHeight: '1.6' }}>
          Help ARES decide: Are these entities the same or different? Your reviews improve accuracy
          and earn XP.
        </p>
      </div>

      {/* Stats and filters */}
      <div
        style={{
          background: 'white',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#3b82f6' }}>
            {candidates.length}
          </div>
          <div style={{ fontSize: '14px', color: '#6b7280' }}>Candidates to Review</div>
        </div>

        <div>
          <label
            style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: '500',
              marginBottom: '4px',
              color: '#374151',
            }}
          >
            Min Similarity: {(minSimilarity * 100).toFixed(0)}%
          </label>
          <input
            type="range"
            min="0.5"
            max="0.95"
            step="0.05"
            value={minSimilarity}
            onChange={e => setMinSimilarity(parseFloat(e.target.value))}
            style={{ width: '200px' }}
          />
        </div>
      </div>

      {/* Candidate list */}
      {candidates.length > 0 ? (
        <div>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '12px' }}>
            Review each pair and choose an action:
          </div>
          {candidates.map(candidate => (
            <IdentityPair
              key={candidate.id}
              candidate={candidate}
              onMerge={handleMerge}
              onSeparate={handleSeparate}
              onIgnore={handleIgnore}
            />
          ))}
        </div>
      ) : (
        <div
          style={{
            background: 'white',
            borderRadius: '8px',
            padding: '64px',
            textAlign: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎉</div>
          <div style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>
            All Clear!
          </div>
          <div style={{ fontSize: '14px', color: '#6b7280' }}>
            No duplicate candidates found. Try lowering the similarity threshold to see more pairs.
          </div>
        </div>
      )}

      {/* Help section */}
      <div
        style={{
          marginTop: '32px',
          padding: '20px',
          background: '#fef3c7',
          borderRadius: '8px',
          border: '1px solid #fde047',
        }}
      >
        <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#92400e' }}>
          💡 How Identity Review Works
        </div>
        <ul style={{ margin: 0, paddingLeft: '20px', color: '#92400e', fontSize: '13px' }}>
          <li style={{ marginBottom: '4px' }}>
            <strong>Same Entity (Merge)</strong>: Combines both entities into one, keeping the
            primary name and merging all relations
          </li>
          <li style={{ marginBottom: '4px' }}>
            <strong>Different (Separate)</strong>: Marks them as distinct entities that should never
            be suggested again
          </li>
          <li>
            <strong>Skip</strong>: Removes from current list but may appear again in future reviews
          </li>
        </ul>
      </div>
    </div>
  );
}
