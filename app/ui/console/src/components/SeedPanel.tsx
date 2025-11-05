/**
 * Seed Panel Components - Sprint R7
 * Citation seeds management for entity drawer
 */

import { useState } from 'react';
import { useSeeds, type Seed, type SeedInput } from '../lib/useSeeds';

interface SeedPanelProps {
  entityId: string;
  project: string;
  toast: any;
}

export function SeedPanel({ entityId, toast }: SeedPanelProps) {
  const { seeds, loading, error, addSeed, removeSeed, rebuildEntity } = useSeeds({
    entityId,
  });

  const [addMode, setAddMode] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);

  const [newDocId, setNewDocId] = useState('');
  const [newQuote, setNewQuote] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');

  /**
   * Handle add seed
   */
  const handleAddSeed = async () => {
    if (!newDocId.trim() || !newQuote.trim() || !newStart || !newEnd) {
      toast.error('All fields are required');
      return;
    }

    try {
      const input: SeedInput = {
        entityId,
        docId: newDocId,
        quote: newQuote,
        start: parseInt(newStart, 10),
        end: parseInt(newEnd, 10),
      };

      await addSeed(input);
      toast.success('Seed added successfully');

      // Reset form
      setNewDocId('');
      setNewQuote('');
      setNewStart('');
      setNewEnd('');
      setAddMode(false);
    } catch (error) {
      toast.error(
        `Failed to add seed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  };

  /**
   * Handle remove seed
   */
  const handleRemoveSeed = async (seed: Seed) => {
    if (!confirm(`Remove seed "${seed.quote.slice(0, 50)}..."?`)) {
      return;
    }

    try {
      await removeSeed(seed.id);
      toast.success('Seed removed successfully');
    } catch (error) {
      toast.error(
        `Failed to remove seed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  };

  /**
   * Handle rebuild entity wiki
   */
  const handleRebuild = async () => {
    setRebuilding(true);

    try {
      const success = await rebuildEntity(entityId);
      if (success) {
        toast.success('Entity wiki rebuilt successfully');
      } else {
        toast.error('Failed to rebuild entity wiki');
      }
    } catch (error) {
      toast.error(
        `Failed to rebuild: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      setRebuilding(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
        Loading seeds...
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: '20px',
          background: '#fee2e2',
          color: '#991b1b',
          borderRadius: '6px',
          margin: '20px',
        }}
      >
        Error: {error}
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
        }}
      >
        <h3 style={{ fontSize: '16px', fontWeight: '600' }}>
          Citation Seeds ({seeds.length})
        </h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleRebuild}
            disabled={rebuilding}
            style={{
              padding: '8px 12px',
              background: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '500',
              cursor: rebuilding ? 'not-allowed' : 'pointer',
              opacity: rebuilding ? 0.6 : 1,
            }}
          >
            {rebuilding ? 'Rebuilding...' : 'Rebuild Wiki'}
          </button>
          <button
            onClick={() => setAddMode(!addMode)}
            style={{
              padding: '8px 12px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
            }}
          >
            {addMode ? 'Cancel' : 'Add Seed'}
          </button>
        </div>
      </div>

      {/* Add seed form */}
      {addMode && (
        <div
          style={{
            padding: '16px',
            background: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            marginBottom: '16px',
          }}
        >
          <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>
            Add New Seed
          </h4>

          <div style={{ marginBottom: '12px' }}>
            <label
              style={{ display: 'block', fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}
            >
              Document ID
            </label>
            <input
              type="text"
              value={newDocId}
              onChange={(e) => setNewDocId(e.target.value)}
              placeholder="e.g., doc_001"
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '13px',
                border: '1px solid #e5e7eb',
                borderRadius: '4px',
              }}
            />
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label
              style={{ display: 'block', fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}
            >
              Quote
            </label>
            <textarea
              value={newQuote}
              onChange={(e) => setNewQuote(e.target.value)}
              placeholder="Citation text..."
              style={{
                width: '100%',
                minHeight: '80px',
                padding: '8px',
                fontSize: '13px',
                border: '1px solid #e5e7eb',
                borderRadius: '4px',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label
                style={{ display: 'block', fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}
              >
                Start Position
              </label>
              <input
                type="number"
                value={newStart}
                onChange={(e) => setNewStart(e.target.value)}
                placeholder="0"
                style={{
                  width: '100%',
                  padding: '8px',
                  fontSize: '13px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '4px',
                }}
              />
            </div>
            <div>
              <label
                style={{ display: 'block', fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}
              >
                End Position
              </label>
              <input
                type="number"
                value={newEnd}
                onChange={(e) => setNewEnd(e.target.value)}
                placeholder="100"
                style={{
                  width: '100%',
                  padding: '8px',
                  fontSize: '13px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '4px',
                }}
              />
            </div>
          </div>

          <button
            onClick={handleAddSeed}
            style={{
              width: '100%',
              padding: '10px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
            }}
          >
            Add Seed
          </button>
        </div>
      )}

      {/* Seeds list */}
      {seeds.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '40px 20px',
            color: '#9ca3af',
            fontSize: '14px',
          }}
        >
          No seeds yet. Add citation seeds to improve entity evidence.
        </div>
      ) : (
        <div>
          {seeds.map((seed) => (
            <div
              key={seed.id}
              style={{
                padding: '12px',
                background: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                marginBottom: '12px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '8px',
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: '11px',
                      color: '#6b7280',
                      fontFamily: 'monospace',
                    }}
                  >
                    {seed.docId}
                  </span>
                  <span
                    style={{
                      marginLeft: '8px',
                      fontSize: '11px',
                      color: '#9ca3af',
                    }}
                  >
                    [{seed.span.start}-{seed.span.end}]
                  </span>
                </div>
                <button
                  onClick={() => handleRemoveSeed(seed)}
                  style={{
                    padding: '4px 8px',
                    background: '#fee2e2',
                    color: '#dc2626',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  Remove
                </button>
              </div>

              <div
                style={{
                  fontSize: '13px',
                  color: '#111827',
                  lineHeight: '1.5',
                  fontStyle: 'italic',
                  background: '#f9fafb',
                  padding: '8px',
                  borderLeft: '3px solid #3b82f6',
                  borderRadius: '4px',
                }}
              >
                "{seed.quote}"
              </div>

              <div
                style={{
                  marginTop: '8px',
                  fontSize: '11px',
                  color: '#9ca3af',
                }}
              >
                Added by {seed.addedBy} on{' '}
                {new Date(seed.addedAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
