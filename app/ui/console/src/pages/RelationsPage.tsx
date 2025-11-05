/**
 * Relations Page - Sprint R5
 * Browse relations with filters, pagination, and detail drawer
 */

import { useState, useEffect } from 'react';
import { query } from '../lib/api';
import { LoadingPage, SkeletonList, Spinner } from '../components/Loading';
import { loadState, saveState } from '../lib/storage';

interface Relation {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  symmetric: boolean;
  confidenceAvg: number;
}

interface RelationDetail {
  relation: Relation;
  evidence: Array<{ snippet: string; docId: string; confidence: number }>;
}

interface RelationsPageProps {
  project: string;
  toast: any;
}

const LIST_RELATIONS_QUERY = `
  query ListRelations($project: String!, $filter: RelationFilter, $limit: Int, $after: Cursor) {
    listRelations(project: $project, filter: $filter, limit: $limit, after: $after) {
      nodes {
        id
        subject
        predicate
        object
        symmetric
        confidenceAvg
      }
      pageInfo {
        endCursor
        hasNextPage
      }
      totalApprox
    }
  }
`;

const GET_RELATION_QUERY = `
  query GetRelation($project: String!, $id: String!) {
    getRelation(project: $project, id: $id) {
      relation {
        id
        subject
        predicate
        object
        symmetric
        confidenceAvg
      }
      evidence {
        snippet
        docId
        confidence
      }
    }
  }
`;

export function RelationsPage({ project, toast }: RelationsPageProps) {
  const [relations, setRelations] = useState<Relation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [detailRelation, setDetailRelation] = useState<RelationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Filters
  const [predicateFilter, setPredicateFilter] = useState<string>(() => loadState('relationFilters.predicate', ''));
  const [nameFilter, setNameFilter] = useState<string>(() => loadState('relationFilters.nameContains', ''));

  // Load relations
  const loadRelations = async (afterCursor?: string | null) => {
    try {
      const isLoadMore = !!afterCursor;
      if (isLoadMore) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      const filter: any = {};
      if (predicateFilter) filter.predicate = predicateFilter;
      if (nameFilter) filter.nameContains = nameFilter;

      const result = await query<any>(LIST_RELATIONS_QUERY, {
        project,
        filter: Object.keys(filter).length > 0 ? filter : undefined,
        limit: 20,
        after: afterCursor || undefined,
      });

      if (isLoadMore) {
        setRelations(prev => [...prev, ...result.listRelations.nodes]);
      } else {
        setRelations(result.listRelations.nodes);
        setSelectedIndex(0);
      }

      setCursor(result.listRelations.pageInfo.endCursor);
      setHasMore(result.listRelations.pageInfo.hasNextPage);
      setTotal(result.listRelations.totalApprox);
    } catch (error) {
      toast.error(`Failed to load relations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Load relation detail
  const loadDetail = async (id: string) => {
    try {
      setDetailLoading(true);
      const result = await query<any>(GET_RELATION_QUERY, { project, id });
      setDetailRelation(result.getRelation);
    } catch (error) {
      toast.error(`Failed to load relation detail: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setDetailLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    loadRelations();
  }, [project, predicateFilter, nameFilter]);

  // Persist filters
  useEffect(() => {
    saveState('relationFilters.predicate', predicateFilter);
    saveState('relationFilters.nameContains', nameFilter);
  }, [predicateFilter, nameFilter]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => Math.max(0, prev - 1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => Math.min(relations.length - 1, prev + 1));
          break;
        case 'Enter':
          e.preventDefault();
          if (relations[selectedIndex]) {
            loadDetail(relations[selectedIndex].id);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setDetailRelation(null);
          break;
        case '/':
          e.preventDefault();
          document.getElementById('name-filter')?.focus();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [relations, selectedIndex]);

  if (loading) {
    return <LoadingPage />;
  }

  return (
    <div style={{ display: 'flex', gap: '24px' }}>
      {/* Main list */}
      <div style={{ flex: detailRelation ? '0 0 50%' : '1' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '16px' }}>
          Relations {total > 0 && <span style={{ color: '#6b7280', fontSize: '18px' }}>({total})</span>}
        </h2>

        {/* Filters */}
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
              placeholder="Predicate filter (exact)"
              value={predicateFilter}
              onChange={e => setPredicateFilter(e.target.value)}
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
              placeholder="Name filter (contains) - Press / to focus"
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

        {/* Relations list */}
        <div
          style={{
            background: 'white',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          {relations.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>No relations found</div>
          ) : (
            <>
              {relations.map((relation, index) => (
                <div
                  key={relation.id}
                  onClick={() => loadDetail(relation.id)}
                  style={{
                    padding: '16px',
                    borderBottom: index < relations.length - 1 ? '1px solid #e5e7eb' : 'none',
                    cursor: 'pointer',
                    background: index === selectedIndex ? '#f3f4f6' : 'white',
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div style={{ fontSize: '14px', color: '#111827', marginBottom: '4px' }}>
                    <strong>{relation.subject}</strong>
                    <span style={{ color: '#3b82f6', margin: '0 8px' }}>→ {relation.predicate} →</span>
                    <strong>{relation.object}</strong>
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>
                    Confidence: {(relation.confidenceAvg * 100).toFixed(1)}%
                    {relation.symmetric && ' • Symmetric'}
                  </div>
                </div>
              ))}

              {hasMore && (
                <div style={{ padding: '16px', textAlign: 'center' }}>
                  <button
                    onClick={() => loadRelations(cursor)}
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

      {/* Detail drawer */}
      {detailRelation && (
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
            <h3 style={{ fontSize: '18px', fontWeight: '600' }}>Relation Detail</h3>
            <button
              onClick={() => setDetailRelation(null)}
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
            <SkeletonList count={3} />
          ) : (
            <>
              <div style={{ marginBottom: '16px', padding: '12px', background: '#f9fafb', borderRadius: '6px' }}>
                <div style={{ fontSize: '14px', marginBottom: '8px' }}>
                  <strong>{detailRelation.relation.subject}</strong>
                </div>
                <div style={{ fontSize: '14px', color: '#3b82f6', marginBottom: '8px' }}>
                  → {detailRelation.relation.predicate} →
                </div>
                <div style={{ fontSize: '14px' }}>
                  <strong>{detailRelation.relation.object}</strong>
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Confidence</div>
                <div style={{ fontSize: '14px' }}>{(detailRelation.relation.confidenceAvg * 100).toFixed(1)}%</div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Symmetric</div>
                <div style={{ fontSize: '14px' }}>{detailRelation.relation.symmetric ? 'Yes' : 'No'}</div>
              </div>

              <div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                  Evidence ({detailRelation.evidence.length})
                </div>
                {detailRelation.evidence.map((ev, i) => (
                  <div
                    key={i}
                    style={{
                      fontSize: '13px',
                      padding: '12px',
                      background: '#f9fafb',
                      borderRadius: '4px',
                      marginBottom: '8px',
                    }}
                  >
                    <div style={{ marginBottom: '4px' }}>{ev.snippet}</div>
                    <div style={{ fontSize: '11px', color: '#6b7280' }}>
                      Doc: {ev.docId} • Confidence: {(ev.confidence * 100).toFixed(1)}%
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
