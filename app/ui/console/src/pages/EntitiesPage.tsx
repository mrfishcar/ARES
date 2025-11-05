/**
 * Entities Page - simplified console view with optional inspector + visual toggle
 */

import { useState, useEffect, useMemo } from 'react';
import { query } from '../lib/api';
import { LoadingPage, SkeletonList, Spinner } from '../components/Loading';
import { loadState, saveState } from '../lib/storage';
import { SeedPanel } from '../components/SeedPanel';
import { EntityDigest } from '../components/EntityDigest';
import { MiniGarden } from '../components/MiniGarden';

interface Entity {
  id: string;
  name: string;
  types: string[];
  aliases: string[];
}

interface RelationLite {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  symmetric?: boolean;
  confidenceAvg?: number;
}

interface EvidenceSnippet {
  text: string;
  docId?: string;
  confidence?: number;
}

interface EntityDetail {
  entity: Entity;
  inbound: RelationLite[];
  outbound: RelationLite[];
  evidence: EvidenceSnippet[];
}

interface EntitiesPageProps {
  project: string;
  toast: any;
}

const LIST_ENTITIES_QUERY = `
  query ListEntities($project: String!, $filter: EntityFilter, $limit: Int, $after: Cursor) {
    listEntities(project: $project, filter: $filter, limit: $limit, after: $after) {
      nodes {
        id
        name
        types
        aliases
      }
      pageInfo {
        endCursor
        hasNextPage
      }
      totalApprox
    }
  }
`;

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
        id
        subject
        predicate
        object
        symmetric
        confidenceAvg
      }
      outbound {
        id
        subject
        predicate
        object
        symmetric
        confidenceAvg
      }
      evidence {
        text
        docId
        confidence
      }
    }
  }
`;

export function EntitiesPage({ project, toast }: EntitiesPageProps) {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [detailEntity, setDetailEntity] = useState<EntityDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showInspector, setShowInspector] = useState(false);
  const [showVisual, setShowVisual] = useState(false);
  const [inspectorHintShown, setInspectorHintShown] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'seeds' | 'digest'>('details');

  const [typeFilter, setTypeFilter] = useState<string>(() => loadState('entityFilters.type', ''));
  const [nameFilter, setNameFilter] = useState<string>(() => loadState('entityFilters.nameContains', ''));

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        const filter: Record<string, string> = {};
        if (typeFilter) filter.type = typeFilter;
        if (nameFilter) filter.nameContains = nameFilter;

        const result = await query<any>(LIST_ENTITIES_QUERY, {
          project,
          filter: Object.keys(filter).length > 0 ? filter : undefined,
          limit: 30,
        });

        setEntities(result.listEntities.nodes);
        setCursor(result.listEntities.pageInfo.endCursor);
        setHasMore(result.listEntities.pageInfo.hasNextPage);
        setTotal(result.listEntities.totalApprox);
        setSelectedIndex(0);
        setDetailEntity(null);
      } catch (error) {
        toast.error(`Failed to load entities: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [project, typeFilter, nameFilter, toast]);

  useEffect(() => {
    saveState('entityFilters.type', typeFilter);
    saveState('entityFilters.nameContains', nameFilter);
  }, [typeFilter, nameFilter]);

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;

    try {
      setLoadingMore(true);
      const filter: Record<string, string> = {};
      if (typeFilter) filter.type = typeFilter;
      if (nameFilter) filter.nameContains = nameFilter;

      const result = await query<any>(LIST_ENTITIES_QUERY, {
        project,
        filter: Object.keys(filter).length > 0 ? filter : undefined,
        limit: 30,
        after: cursor || undefined,
      });

      setEntities(prev => [...prev, ...result.listEntities.nodes]);
      setCursor(result.listEntities.pageInfo.endCursor);
      setHasMore(result.listEntities.pageInfo.hasNextPage);
      setTotal(result.listEntities.totalApprox);
    } catch (error) {
      toast.error(`Failed to load entities: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoadingMore(false);
    }
  };

  const loadDetail = async (id: string) => {
    try {
      setDetailLoading(true);
      const result = await query<any>(GET_ENTITY_QUERY, { project, id });
      setDetailEntity(result.getEntity);

      if (!showInspector && !inspectorHintShown) {
        toast.info('Inspector is hidden. Toggle "Show Inspector" to view details.');
        setInspectorHintShown(true);
      }
    } catch (error) {
      toast.error(`Failed to load entity detail: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setDetailLoading(false);
    }
  };

  const detailVisible = showInspector && detailEntity;
  const gardenEntities = useMemo(
    () =>
      entities.slice(0, 60).map((entity, index) => ({
        id: entity.id,
        name: entity.name,
        type: entity.types?.[0] || 'CONCEPT',
        mentions: Math.max(1, (entity.aliases?.length || 0) + 1 + (index % 3)),
      })),
    [entities]
  );

  if (loading) {
    return <LoadingPage />;
  }

  return (
    <div style={{ display: 'flex', gap: '24px' }}>
      <div style={{ flex: detailVisible ? '0 0 55%' : '1' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '16px' }}>
          Entities {total > 0 && <span style={{ color: '#6b7280', fontSize: '18px' }}>({total})</span>}
        </h2>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', color: '#6b7280' }}>
            Use filters or keyboard arrows to explore entities. Press Enter to load details.
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setShowVisual(prev => !prev)}
              style={{
                padding: '8px 14px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                background: showVisual ? '#10b981' : '#ffffff',
                color: showVisual ? '#ffffff' : '#374151',
                cursor: 'pointer',
              }}
            >
              {showVisual ? 'Hide Visual' : 'Show Visual'}
            </button>
            <button
              onClick={() => setShowInspector(prev => !prev)}
              disabled={!detailEntity}
              style={{
                padding: '8px 14px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                background: detailVisible ? '#1d4ed8' : '#ffffff',
                color: detailVisible ? '#ffffff' : '#374151',
                cursor: detailEntity ? 'pointer' : 'not-allowed',
                opacity: detailEntity ? 1 : 0.5,
              }}
            >
              {detailVisible ? 'Hide Inspector' : 'Show Inspector'}
            </button>
          </div>
        </div>

        <div
          style={{
            background: 'white',
            padding: '16px',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', gap: '12px' }}>
            <input
              type="text"
              placeholder="Type filter (exact)"
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              style={{
                flex: 1,
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
              }}
            />
            <input
              id="name-filter"
              type="text"
              placeholder="Name filter (contains)"
              value={nameFilter}
              onChange={e => setNameFilter(e.target.value)}
              style={{
                flex: 1,
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
              }}
            />
          </div>
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#6b7280' }}>
            ↑/↓: navigate • Enter: details • Esc: close • /: filter
          </div>
        </div>

        {showVisual && gardenEntities.length > 0 && (
          <div
            style={{
              marginBottom: '16px',
              padding: '20px',
              background: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#111827' }}>Entity Visual</h3>
                <p style={{ fontSize: '12px', color: '#6b7280' }}>Top entities by alias coverage</p>
              </div>
            </div>
            <MiniGarden
              entities={gardenEntities}
              width={Math.min(520, window.innerWidth * 0.48)}
              height={320}
              onEntityClick={(entity) => {
                const index = entities.findIndex(e => e.id === entity.id);
                if (index !== -1) {
                  setSelectedIndex(index);
                  loadDetail(entity.id);
                }
              }}
            />
          </div>
        )}

        <div
          style={{
            background: 'white',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          {entities.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>No entities found</div>
          ) : (
            <>
              {entities.map((entity, index) => (
                <div
                  key={entity.id}
                  onClick={() => {
                    setSelectedIndex(index);
                    loadDetail(entity.id);
                  }}
                  style={{
                    padding: '16px',
                    borderBottom: index < entities.length - 1 ? '1px solid #e5e7eb' : 'none',
                    cursor: 'pointer',
                    background: index === selectedIndex ? '#f3f4f6' : 'white',
                  }}
                >
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827', marginBottom: '4px' }}>
                    {entity.name}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>
                    {entity.types.join(', ')} • {entity.aliases.length} aliases
                  </div>
                </div>
              ))}

              {hasMore && (
                <div style={{ padding: '16px', textAlign: 'center' }}>
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    style={{
                      padding: '8px 16px',
                      background: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: '500',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      margin: '0 auto',
                    }}
                  >
                    {loadingMore ? <Spinner size={16} /> : null}
                    Load More
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {detailVisible && detailEntity && (
        <div
          style={{
            flex: '0 0 45%',
            background: 'white',
            padding: '24px',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            maxHeight: 'calc(100vh - 140px)',
            overflow: 'auto',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '20px', fontWeight: '600' }}>{detailEntity.entity.name}</h3>
            <button
              onClick={() => {
                setDetailEntity(null);
                setShowInspector(false);
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

          <div
            style={{
              display: 'flex',
              gap: '8px',
              borderBottom: '1px solid #e5e7eb',
              marginBottom: '16px',
            }}
          >
            <button
              onClick={() => setActiveTab('details')}
              style={{
                padding: '8px 16px',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'details' ? '2px solid #3b82f6' : '2px solid transparent',
                color: activeTab === 'details' ? '#3b82f6' : '#6b7280',
                fontWeight: activeTab === 'details' ? '600' : '400',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              Details
            </button>
            <button
              onClick={() => setActiveTab('seeds')}
              style={{
                padding: '8px 16px',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'seeds' ? '2px solid #3b82f6' : '2px solid transparent',
                color: activeTab === 'seeds' ? '#3b82f6' : '#6b7280',
                fontWeight: activeTab === 'seeds' ? '600' : '400',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              Seeds
            </button>
            <button
              onClick={() => setActiveTab('digest')}
              style={{
                padding: '8px 16px',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'digest' ? '2px solid #3b82f6' : '2px solid transparent',
                color: activeTab === 'digest' ? '#3b82f6' : '#6b7280',
                fontWeight: activeTab === 'digest' ? '600' : '400',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              Digest
            </button>
          </div>

          {detailLoading ? (
            <SkeletonList count={3} />
          ) : activeTab === 'details' ? (
            <>
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
                {detailEntity.outbound.length === 0 ? (
                  <div style={{ fontSize: '13px', color: '#9ca3af' }}>No outbound relations</div>
                ) : (
                  detailEntity.outbound.slice(0, 5).map(rel => (
                    <div key={rel.id} style={{ fontSize: '13px', marginBottom: '4px' }}>
                      <span style={{ color: '#3b82f6' }}>{rel.predicate}</span> → {rel.object}
                      {typeof rel.confidenceAvg === 'number' && (
                        <span style={{ color: '#9ca3af', marginLeft: '6px' }}>
                          ({Math.round(rel.confidenceAvg * 100)}%)
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                  Inbound Relations ({detailEntity.inbound.length})
                </div>
                {detailEntity.inbound.length === 0 ? (
                  <div style={{ fontSize: '13px', color: '#9ca3af' }}>No inbound relations</div>
                ) : (
                  detailEntity.inbound.slice(0, 5).map(rel => (
                    <div key={rel.id} style={{ fontSize: '13px', marginBottom: '4px' }}>
                      {rel.subject} → <span style={{ color: '#3b82f6' }}>{rel.predicate}</span>
                      {typeof rel.confidenceAvg === 'number' && (
                        <span style={{ color: '#9ca3af', marginLeft: '6px' }}>
                          ({Math.round(rel.confidenceAvg * 100)}%)
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                  Evidence ({detailEntity.evidence.length})
                </div>
                {detailEntity.evidence.length === 0 ? (
                  <div style={{ fontSize: '13px', color: '#9ca3af' }}>No evidence snippets yet</div>
                ) : (
                  detailEntity.evidence.slice(0, 3).map((ev, i) => (
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
                      <div>{ev.text}</div>
                      {ev.docId && (
                        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>Doc: {ev.docId}</div>
                      )}
                      {typeof ev.confidence === 'number' && (
                        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                          Confidence: {Math.round(ev.confidence * 100)}%
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </>
          ) : activeTab === 'seeds' ? (
            <SeedPanel entityId={detailEntity.entity.id} project={project} toast={toast} />
          ) : (
            <EntityDigest
              project={project}
              entityId={detailEntity.entity.id}
              entityName={detailEntity.entity.name}
            />
          )}
        </div>
      )}
    </div>
  );
}
