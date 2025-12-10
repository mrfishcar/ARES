/**
 * GraphPage Component - Sprint R6 Phase 2
 * Interactive graph visualization with D3 force-directed layout
 */

import { useState, useEffect } from 'react';
import { GraphCanvas } from '../components/GraphCanvas';
import { useGraphData } from '../lib/useGraphData';
import { Spinner } from '../components/Loading';
import { query } from '../lib/api';
import { loadState, saveState } from '../lib/storage';

export interface GraphPageProps {
  project: string;
  toast: any;
}

interface EntityDetail {
  entity: {
    id: string;
    name: string;
    types: string[];
    aliases: string[];
  };
  inbound: Array<{ predicate: string; subject: string }>;
  outbound: Array<{ predicate: string; object: string }>;
  evidence: Array<{ text: string; confidence?: number }>;
}

interface RelationDetail {
  relation: {
    id: string;
    subject: string;
    predicate: string;
    object: string;
    symmetric?: boolean;
  };
  evidence: Array<{ text: string; confidence?: number }>;
}

const GET_ENTITY_QUERY = `
  query GetEntity($project: String!, $id: ID!) {
    getEntity(project: $project, id: $id) {
      entity {
        id
        name
        types
        aliases
      }
      inbound {
        predicate
        subject
      }
      outbound {
        predicate
        object
      }
      evidence {
        text
        confidence
      }
    }
  }
`;

const GET_RELATION_QUERY = `
  query GetRelation($project: String!, $id: ID!) {
    getRelation(project: $project, id: $id) {
      relation {
        id
        subject
        predicate
        object
        symmetric
      }
      evidence {
        text
        confidence
      }
    }
  }
`;

export function GraphPage({ project, toast }: GraphPageProps) {
  // Mode: 'neighborhood' or 'predicate'
  const [mode, setMode] = useState<'neighborhood' | 'predicate'>(() =>
    loadState('graphMode', 'neighborhood')
  );

  // Neighborhood mode parameters
  const [centerId, setCenterId] = useState<string>(() => loadState('graphCenterId', ''));
  const [depth, setDepth] = useState<number>(() => loadState('graphDepth', 1));
  const [neighborhoodLimit, setNeighborhoodLimit] = useState<number>(() =>
    loadState('graphNeighborhoodLimit', 50)
  );

  // Predicate mode parameters
  const [predicate, setPredicate] = useState<string>(() => loadState('graphPredicate', ''));
  const [predicateLimit, setPredicateLimit] = useState<number>(() =>
    loadState('graphPredicateLimit', 100)
  );

  // Detail drawer
  const [detailType, setDetailType] = useState<'entity' | 'relation' | null>(null);
  const [detailEntity, setDetailEntity] = useState<EntityDetail | null>(null);
  const [detailRelation, setDetailRelation] = useState<RelationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Fetch graph data
  const { data, loading, error, refetch } = useGraphData({
    project,
    mode,
    centerId: mode === 'neighborhood' ? centerId : undefined,
    depth: mode === 'neighborhood' ? depth : undefined,
    limit: mode === 'neighborhood' ? neighborhoodLimit : predicateLimit,
    predicate: mode === 'predicate' ? predicate : undefined,
    enabled: mode === 'neighborhood' ? !!centerId : !!predicate,
  });

  // Persist state
  useEffect(() => {
    saveState('graphMode', mode);
  }, [mode]);

  useEffect(() => {
    saveState('graphCenterId', centerId);
    saveState('graphDepth', depth);
    saveState('graphNeighborhoodLimit', neighborhoodLimit);
  }, [centerId, depth, neighborhoodLimit]);

  useEffect(() => {
    saveState('graphPredicate', predicate);
    saveState('graphPredicateLimit', predicateLimit);
  }, [predicate, predicateLimit]);

  // Load entity detail
  const loadEntityDetail = async (id: string) => {
    try {
      setDetailLoading(true);
      setDetailType('entity');
      const result = await query<{ getEntity: EntityDetail }>(GET_ENTITY_QUERY, { project, id });
      setDetailEntity(result.getEntity);
      setDetailRelation(null);
    } catch (err) {
      toast.error(`Failed to load entity: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDetailLoading(false);
    }
  };

  // Load relation detail
  const loadRelationDetail = async (id: string) => {
    try {
      setDetailLoading(true);
      setDetailType('relation');
      const result = await query<{ getRelation: RelationDetail }>(GET_RELATION_QUERY, {
        project,
        id,
      });
      setDetailRelation(result.getRelation);
      setDetailEntity(null);
    } catch (err) {
      toast.error(`Failed to load relation: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDetailLoading(false);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          setDetailType(null);
          setDetailEntity(null);
          setDetailRelation(null);
          break;
        case 'r':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            refetch();
          }
          break;
        case '+':
        case '=':
          e.preventDefault();
          // Zoom in handled by D3
          break;
        case '-':
          e.preventDefault();
          // Zoom out handled by D3
          break;
        case 'f':
          e.preventDefault();
          document.getElementById('center-id-input')?.focus();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [refetch]);

  const renderToolbar = () => (
    <div
      style={{
        background: 'white',
        padding: '16px',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        marginBottom: '16px',
      }}
    >
      {/* Mode selector */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <button
          onClick={() => setMode('neighborhood')}
          style={{
            padding: '8px 16px',
            background: mode === 'neighborhood' ? '#3b82f6' : '#e5e7eb',
            color: mode === 'neighborhood' ? 'white' : '#1f2937',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
          }}
        >
          Neighborhood
        </button>
        <button
          onClick={() => setMode('predicate')}
          style={{
            padding: '8px 16px',
            background: mode === 'predicate' ? '#3b82f6' : '#e5e7eb',
            color: mode === 'predicate' ? 'white' : '#1f2937',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
          }}
        >
          By Predicate
        </button>
      </div>

      {/* Neighborhood mode controls */}
      {mode === 'neighborhood' && (
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <input
            id="center-id-input"
            type="text"
            placeholder="Center entity ID (press f to focus)"
            value={centerId}
            onChange={e => setCenterId(e.target.value)}
            style={{
              flex: '1 1 300px',
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          />
          <select
            value={depth}
            onChange={e => setDepth(Number(e.target.value))}
            style={{
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          >
            <option value={1}>Depth: 1</option>
            <option value={2}>Depth: 2</option>
          </select>
          <input
            type="number"
            placeholder="Limit"
            value={neighborhoodLimit}
            onChange={e => setNeighborhoodLimit(Number(e.target.value))}
            min={1}
            max={200}
            style={{
              width: '100px',
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          />
        </div>
      )}

      {/* Predicate mode controls */}
      {mode === 'predicate' && (
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Predicate (e.g., MARRIED_TO)"
            value={predicate}
            onChange={e => setPredicate(e.target.value.toUpperCase())}
            style={{
              flex: '1 1 300px',
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          />
          <input
            type="number"
            placeholder="Limit"
            value={predicateLimit}
            onChange={e => setPredicateLimit(Number(e.target.value))}
            min={1}
            max={500}
            style={{
              width: '100px',
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          />
        </div>
      )}

      <div style={{ marginTop: '8px', fontSize: '12px', color: '#6b7280' }}>
        Esc: close detail • f: focus search • +/-: zoom • r: refresh
      </div>
    </div>
  );

  const renderEntityDetail = () => {
    if (!detailEntity) return null;

    return (
      <div
        style={{
          position: 'fixed',
          right: '24px',
          top: '100px',
          width: '400px',
          maxHeight: 'calc(100% - 140px)',
          background: 'var(--bg-secondary)',
          padding: '24px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          overflow: 'auto',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '20px', fontWeight: '600' }}>{detailEntity.entity.name}</h3>
          <button
            onClick={() => {
              setDetailType(null);
              setDetailEntity(null);
            }}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#6b7280',
            }}
          >
            ×
          </button>
        </div>

        {detailLoading ? (
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <Spinner size={24} />
          </div>
        ) : (
          <>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>ID</div>
              <div style={{ fontSize: '13px', fontFamily: 'monospace', background: '#f9fafb', padding: '4px 8px', borderRadius: '4px' }}>
                {detailEntity.entity.id}
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Types</div>
              <div style={{ fontSize: '14px' }}>{detailEntity.entity.types.join(', ')}</div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Aliases</div>
              <div style={{ fontSize: '14px' }}>{detailEntity.entity.aliases.join(', ') || 'None'}</div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                Outbound Relations ({detailEntity.outbound.length})
              </div>
              {detailEntity.outbound.slice(0, 5).map((rel, i) => (
                <div key={i} style={{ fontSize: '13px', marginBottom: '4px' }}>
                  <span style={{ color: '#3b82f6' }}>{rel.predicate}</span> → {rel.object}
                </div>
              ))}
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                Inbound Relations ({detailEntity.inbound.length})
              </div>
              {detailEntity.inbound.slice(0, 5).map((rel, i) => (
                <div key={i} style={{ fontSize: '13px', marginBottom: '4px' }}>
                  {rel.subject} → <span style={{ color: '#3b82f6' }}>{rel.predicate}</span>
                </div>
              ))}
            </div>

            <div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                Evidence ({detailEntity.evidence.length})
              </div>
              {detailEntity.evidence.slice(0, 3).map((ev, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: '13px',
                    padding: '8px',
                    background: '#f9fafb',
                    borderRadius: '4px',
                    marginBottom: '8px',
                  }}
                >
                  {ev.text}
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                setCenterId(detailEntity.entity.id);
                setMode('neighborhood');
                setDetailType(null);
                setDetailEntity(null);
              }}
              style={{
                width: '100%',
                marginTop: '16px',
                padding: '8px 16px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
              }}
            >
              Center Graph on This Entity
            </button>
          </>
        )}
      </div>
    );
  };

  const renderRelationDetail = () => {
    if (!detailRelation) return null;

    return (
      <div
        style={{
          position: 'fixed',
          right: '24px',
          top: '100px',
          width: '400px',
          maxHeight: 'calc(100% - 140px)',
          background: 'var(--bg-secondary)',
          padding: '24px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          overflow: 'auto',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '20px', fontWeight: '600' }}>Relation</h3>
          <button
            onClick={() => {
              setDetailType(null);
              setDetailRelation(null);
            }}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#6b7280',
            }}
          >
            ×
          </button>
        </div>

        {detailLoading ? (
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <Spinner size={24} />
          </div>
        ) : (
          <>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Subject</div>
              <div style={{ fontSize: '14px' }}>{detailRelation.relation.subject}</div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Predicate</div>
              <div
                style={{
                  fontSize: '14px',
                  color: '#3b82f6',
                  fontWeight: '600',
                }}
              >
                {detailRelation.relation.predicate}
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Object</div>
              <div style={{ fontSize: '14px' }}>{detailRelation.relation.object}</div>
            </div>

            {detailRelation.relation.symmetric && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Properties</div>
                <div style={{ fontSize: '14px' }}>Symmetric</div>
              </div>
            )}

            <div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                Evidence ({detailRelation.evidence.length})
              </div>
              {detailRelation.evidence.slice(0, 3).map((ev, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: '13px',
                    padding: '8px',
                    background: '#f9fafb',
                    borderRadius: '4px',
                    marginBottom: '8px',
                  }}
                >
                  {ev.text}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div>
      <h2 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '16px' }}>
        Graph Explorer
      </h2>

      {renderToolbar()}

      {/* Error state */}
      {error && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#dc2626',
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '16px',
          }}
        >
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <Spinner size={32} />
          <div style={{ marginTop: '12px', color: '#6b7280' }}>Loading graph...</div>
        </div>
      )}

      {/* Graph canvas */}
      {!loading && data && (
        <div style={{ position: 'relative' }}>
          <GraphCanvas
            nodes={data.nodes}
            edges={data.edges}
            onNodeClick={node => loadEntityDetail(node.id)}
            onEdgeClick={edge => loadRelationDetail(edge.id)}
            width={1200}
            height={700}
          />

          {/* Stats */}
          <div
            style={{
              marginTop: '12px',
              fontSize: '13px',
              color: '#6b7280',
              textAlign: 'center',
            }}
          >
            {data.nodes.length} nodes • {data.edges.length} edges
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !data && !error && (
        <div
          style={{
            background: 'white',
            padding: '60px',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '16px', color: '#6b7280', marginBottom: '8px' }}>
            {mode === 'neighborhood'
              ? 'Enter a center entity ID to explore its neighborhood'
              : 'Enter a predicate to filter relations'}
          </div>
          <div style={{ fontSize: '14px', color: '#9ca3af' }}>
            {mode === 'neighborhood'
              ? 'Try depth 1 for immediate connections, depth 2 for extended network'
              : 'Examples: MARRIED_TO, LOCATED_IN, WORKS_FOR'}
          </div>
        </div>
      )}

      {/* Detail drawers */}
      {detailType === 'entity' && renderEntityDetail()}
      {detailType === 'relation' && renderRelationDetail()}
    </div>
  );
}
