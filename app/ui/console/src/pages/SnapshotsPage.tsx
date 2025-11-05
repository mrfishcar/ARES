/**
 * Snapshots Page - Sprint R5
 * Create and restore graph snapshots
 */

import { useState, useEffect } from 'react';
import { query, mutate } from '../lib/api';
import { LoadingPage, Spinner } from '../components/Loading';

interface Snapshot {
  id: string;
  timestamp: number;
}

interface SnapshotsPageProps {
  project: string;
  toast: any;
}

const LIST_SNAPSHOTS_QUERY = `
  query ListSnapshots($project: String!) {
    listSnapshots(project: $project) {
      id
      timestamp
    }
  }
`;

const CREATE_SNAPSHOT_MUTATION = `
  mutation CreateSnapshot($project: String!) {
    createSnapshot(project: $project) {
      id
      timestamp
    }
  }
`;

const RESTORE_SNAPSHOT_MUTATION = `
  mutation RestoreSnapshot($project: String!, $id: String!) {
    restoreSnapshot(project: $project, id: $id)
  }
`;

export function SnapshotsPage({ project, toast }: SnapshotsPageProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  // Load snapshots
  const loadSnapshots = async () => {
    try {
      setLoading(true);
      const result = await query<any>(LIST_SNAPSHOTS_QUERY, { project });
      setSnapshots(result.listSnapshots || []);
    } catch (error) {
      toast.error(`Failed to load snapshots: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // Create snapshot
  const createSnapshot = async () => {
    try {
      setCreating(true);
      const result = await mutate<any>(CREATE_SNAPSHOT_MUTATION, { project });
      toast.success(`Snapshot created: ${result.createSnapshot.id}`);
      await loadSnapshots();
    } catch (error) {
      toast.error(`Failed to create snapshot: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setCreating(false);
    }
  };

  // Restore snapshot
  const restoreSnapshot = async (id: string) => {
    if (!confirm(`Restore snapshot ${id}? This will overwrite current graph data.`)) {
      return;
    }

    try {
      setRestoring(id);
      await mutate<any>(RESTORE_SNAPSHOT_MUTATION, { project, id });
      toast.success(`Snapshot ${id} restored successfully`);
    } catch (error) {
      toast.error(`Failed to restore snapshot: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setRestoring(null);
    }
  };

  // Initial load
  useEffect(() => {
    loadSnapshots();
  }, [project]);

  if (loading) {
    return <LoadingPage />;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '600' }}>Snapshots</h2>
        <button
          onClick={createSnapshot}
          disabled={creating}
          style={{
            padding: '10px 20px',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {creating ? <Spinner size={16} /> : null}
          Create Snapshot
        </button>
      </div>

      <div
        style={{
          background: 'white',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}
      >
        {snapshots.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
            No snapshots yet. Create one to backup your graph data.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>
                  ID
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>
                  Timestamp
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#6b7280' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((snapshot, index) => (
                <tr key={snapshot.id} style={{ borderBottom: index < snapshots.length - 1 ? '1px solid #e5e7eb' : 'none' }}>
                  <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                    <code style={{ fontSize: '13px', background: '#f3f4f6', padding: '2px 6px', borderRadius: '3px' }}>
                      {snapshot.id}
                    </code>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#6b7280' }}>
                    {new Date(snapshot.timestamp).toLocaleString()}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <button
                      onClick={() => restoreSnapshot(snapshot.id)}
                      disabled={restoring === snapshot.id}
                      style={{
                        padding: '6px 12px',
                        background: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '13px',
                        fontWeight: '500',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      {restoring === snapshot.id ? <Spinner size={14} /> : null}
                      Restore
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div
        style={{
          marginTop: '24px',
          padding: '16px',
          background: '#fef3c7',
          borderRadius: '6px',
          fontSize: '14px',
          color: '#92400e',
        }}
      >
        <strong>Warning:</strong> Restoring a snapshot will overwrite your current graph data. This action cannot be undone.
      </div>
    </div>
  );
}
