/**
 * Entity Review Sidebar - Table-based entity review interface
 *
 * Features:
 * - Table layout with rounded rows
 * - Four columns: Entity Name, Type dropdown, Reject button, Notes
 * - No text mutation for rejection (uses entity.rejected flag)
 * - JSON reports (Log & Copy)
 * - Draggable/resizable overlay mode
 * - Pinned mode integrates into layout
 */

import { useState, useCallback, useRef, useEffect, useMemo, memo } from 'react';
import type React from 'react';
import { X, Pin, PinOff, GripVertical } from 'lucide-react';
import type { EntitySpan, EntityType } from '../types/entities';
import { collapseEntitiesForUI, type AggregatedEntityRow } from './entity-review-utils';
import './EntityReviewSidebar.css';
import { requestIdleChunk } from '../utils/scheduler';

type PhaseKey = 'booknlp' | 'pipeline' | 'manual' | 'editor' | 'unknown';
const DEFAULT_PHASE_FILTERS: Record<PhaseKey, boolean> = {
  booknlp: true,
  pipeline: true,
  manual: true,
  editor: true,
  unknown: true,
};

interface EntityReviewSidebarProps {
  mode: 'overlay' | 'pinned';
  entities: EntitySpan[];
  onClose: () => void;
  onPin: () => void;
  onEntityUpdate: (index: number, updates: Partial<EntitySpan>) => void;
  onLogReport: () => void;
  onCopyReport: () => void;
  onNavigateEntity?: (entity: EntitySpan) => void;
}

const ENTITY_TYPES: EntityType[] = [
  'PERSON', 'PLACE', 'ORG', 'EVENT', 'CONCEPT', 'OBJECT',
  'RACE', 'CREATURE', 'ARTIFACT', 'TECHNOLOGY', 'MAGIC',
  'LANGUAGE', 'CURRENCY', 'MATERIAL', 'DRUG', 'DEITY',
  'ABILITY', 'SKILL', 'POWER', 'TECHNIQUE', 'SPELL',
  'DATE', 'TIME', 'WORK', 'ITEM', 'MISC', 'SPECIES',
  'HOUSE', 'TRIBE', 'TITLE'
];

export function EntityReviewSidebar({
  mode,
  entities,
  onClose,
  onPin,
  onEntityUpdate,
  onLogReport,
  onCopyReport,
  onNavigateEntity,
}: EntityReviewSidebarProps) {
  // Filter state
  const [showRejected, setShowRejected] = useState(false);
  const [phaseFilters, setPhaseFilters] = useState<Record<PhaseKey, boolean>>(DEFAULT_PHASE_FILTERS);

  // Draggable/resizable state for overlay mode
  const [position, setPosition] = useState({ x: window.innerWidth - 620, y: 80 });
  const [size, setSize] = useState({ width: 600, height: window.innerHeight - 160 });
  const dragStateRef = useRef({
    active: false,
    offsetX: 0,
    offsetY: 0,
    nextX: position.x,
    nextY: position.y,
  });
  const resizeStateRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    baseWidth: size.width,
    baseHeight: size.height,
  });
  const rafRef = useRef<number | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const latestDimsRef = useRef({ innerWidth: window.innerWidth, innerHeight: window.innerHeight });

  useEffect(() => {
    const handleResize = () => {
      latestDimsRef.current = { innerWidth: window.innerWidth, innerHeight: window.innerHeight };
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (mode !== 'overlay' && sidebarRef.current) {
      const el = sidebarRef.current;
      el.style.transform = '';
      el.style.width = '';
      el.style.height = '';
    }
  }, [mode]);

  // Display entities based on filter
  const isPhaseEnabled = (entity: EntitySpan) => {
    const phase = (entity.source || 'unknown').toLowerCase();
    if (phase.includes('booknlp')) return phaseFilters.booknlp;
    if (phase.includes('manual')) return phaseFilters.manual;
    if (phase.includes('editor')) return phaseFilters.editor;
    if (phase.includes('pipeline')) return phaseFilters.pipeline;
    return phaseFilters.unknown;
  };

  const displayEntities = (showRejected ? entities : entities.filter(e => !e.rejected)).filter(isPhaseEnabled);

  const entityIndexMap = useMemo(() => {
    const map = new Map<EntitySpan, number>();
    entities.forEach((e, i) => map.set(e, i));
    return map;
  }, [entities]);

  const groupedEntities: AggregatedEntityRow[] = useMemo(
    () => collapseEntitiesForUI(displayEntities, entityIndexMap),
    [displayEntities, entityIndexMap]
  );
  const [visibleRows, setVisibleRows] = useState<AggregatedEntityRow[]>(() =>
    groupedEntities.slice(0, 200)
  );
  const [isChunkLoading, setIsChunkLoading] = useState(false);

  useEffect(() => {
    if (groupedEntities.length <= 200) {
      setVisibleRows(groupedEntities);
      setIsChunkLoading(false);
      return;
    }

    setVisibleRows(groupedEntities.slice(0, 60));
    setIsChunkLoading(true);
    const CHUNK_SIZE = 80;
    const startIndex = 60;

    return requestIdleChunk(() => groupedEntities, {
      initialIndex: startIndex,
      chunkSize: CHUNK_SIZE,
      maxChunkDurationMs: 8,
      onChunk: (rows) => {
        setVisibleRows((prev) => [...prev, ...rows]);
      },
      onComplete: () => setIsChunkLoading(false),
    });
  }, [groupedEntities]);

  if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
    const sample = groupedEntities.slice(0, 25).map(row => ({
      rowKey: row.rowKey,
      id: row.entity.entityId,
      globalId: row.entity.entityId,
      eid: (row.entity as any).eid,
      text: row.entity.text || row.entity.displayText || row.entity.canonicalName,
      type: row.entity.type,
      source: row.sources.join(','),
    }));
    const uniqueGlobalIds = new Set(groupedEntities.map(r => r.entity.entityId || r.rowKey));
    const duplicateCounts: Record<string, number> = {};
    groupedEntities.forEach(r => {
      const key = r.entity.entityId || r.rowKey;
      duplicateCounts[key] = (duplicateCounts[key] || 0) + 1;
    });
    const topDuplicates = Object.entries(duplicateCounts)
      .filter(([, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    console.debug('[EntityReviewSidebar][DEBUG_IDENTITY_UI]', {
      totalRows: groupedEntities.length,
      uniqueGlobalIds: uniqueGlobalIds.size,
      topDuplicates,
      sample,
    });
  }

  // Drag handlers for overlay mode
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (mode !== 'overlay') return;
    dragStateRef.current = {
      active: true,
      offsetX: e.clientX - position.x,
      offsetY: e.clientY - position.y,
      nextX: position.x,
      nextY: position.y,
    };
  }, [mode, position]);

  const handleDragMove = useCallback((e: MouseEvent) => {
    const state = dragStateRef.current;
    if (!state.active) return;
    const { innerWidth, innerHeight } = latestDimsRef.current;
    state.nextX = Math.max(0, Math.min(innerWidth - size.width, e.clientX - state.offsetX));
    state.nextY = Math.max(0, Math.min(innerHeight - size.height, e.clientY - state.offsetY));
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const el = sidebarRef.current;
        if (el) {
          el.style.transform = `translate3d(${state.nextX}px, ${state.nextY}px, 0)`;
        }
      });
    }
  }, [size.width, size.height]);

  const handleDragEnd = useCallback(() => {
    const state = dragStateRef.current;
    if (!state.active) return;
    state.active = false;
    setPosition({ x: state.nextX, y: state.nextY });
  }, []);

  // Resize handlers for overlay mode
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    if (mode !== 'overlay') return;
    e.stopPropagation();
    resizeStateRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      baseWidth: size.width,
      baseHeight: size.height,
    };
  }, [mode, size]);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    const state = resizeStateRef.current;
    if (!state.active) return;
    const { innerWidth, innerHeight } = latestDimsRef.current;
    const deltaX = e.clientX - state.startX;
    const deltaY = e.clientY - state.startY;
    const newWidth = Math.max(400, Math.min(innerWidth - position.x, state.baseWidth - deltaX));
    const newHeight = Math.max(300, Math.min(innerHeight - position.y, state.baseHeight + deltaY));
    state.baseWidth = newWidth;
    state.baseHeight = newHeight;
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const el = sidebarRef.current;
        if (el) {
          el.style.width = `${state.baseWidth}px`;
          el.style.height = `${state.baseHeight}px`;
        }
      });
    }
  }, [position.x, position.y]);

  const handleResizeEnd = useCallback(() => {
    const state = resizeStateRef.current;
    if (!state.active) return;
    state.active = false;
    setSize({ width: state.baseWidth, height: state.baseHeight });
  }, []);

  // Mouse event listeners
  useEffect(() => {
    const move = (e: MouseEvent) => handleDragMove(e);
    const up = () => handleDragEnd();
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    return () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
  }, [handleDragEnd, handleDragMove]);

  useEffect(() => {
    const move = (e: MouseEvent) => handleResizeMove(e);
    const up = () => handleResizeEnd();
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    return () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
  }, [handleResizeMove, handleResizeEnd]);

  // Entity update handlers
  const handleTypeChange = useCallback((index: number, newType: EntityType) => {
    onEntityUpdate(index, { type: newType });
  }, [onEntityUpdate]);

  const handleReject = useCallback((index: number) => {
    const entity = entities[index];
    onEntityUpdate(index, { rejected: !entity.rejected });
  }, [entities, onEntityUpdate]);

  const handleNotesChange = useCallback((index: number, notes: string) => {
    onEntityUpdate(index, { notes });
  }, [onEntityUpdate]);

  const keptCount = groupedEntities.filter(({ entity }) => !entity.rejected).length;
  const rejectedCount = groupedEntities.filter(({ entity }) => entity.rejected).length;

  const handleRowClick = useCallback((entity: EntitySpan, event: React.MouseEvent) => {
    if (!onNavigateEntity) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, select, input, textarea')) return;
    onNavigateEntity(entity);
  }, [onNavigateEntity]);

  // Apply position and size for overlay mode
  const overlayStyle = mode === 'overlay'
    ? {
        position: 'fixed' as const,
        top: 0,
        left: 0,
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
        width: size.width,
        height: size.height,
      }
    : {};

  const renderRows = visibleRows.length ? visibleRows : groupedEntities;

  const handleTypeDropdownChange = useCallback((row: AggregatedEntityRow, newType: EntityType) => {
    row.indices.forEach(i => handleTypeChange(i, newType));
  }, [handleTypeChange]);

  const handleRejectRow = useCallback((row: AggregatedEntityRow) => {
    row.indices.forEach(i => handleReject(i));
  }, [handleReject]);

  const handleNotesRow = useCallback((row: AggregatedEntityRow, value: string) => {
    row.indices.forEach(i => handleNotesChange(i, value));
  }, [handleNotesChange]);

  const EntityRow = useMemo(() => {
    return memo(function EntityRowMemo({
      row,
      onRowClick,
      onTypeChangeRow,
      onRejectRow,
      onNotesChangeRow,
    }: {
      row: AggregatedEntityRow;
      onRowClick: (entity: EntitySpan, event: React.MouseEvent) => void;
      onTypeChangeRow: (row: AggregatedEntityRow, newType: EntityType) => void;
      onRejectRow: (row: AggregatedEntityRow) => void;
      onNotesChangeRow: (row: AggregatedEntityRow, value: string) => void;
    }) {
      const { entity } = row;
      const entityName = entity.canonicalName || entity.displayText || entity.text || 'Untitled';
      const isRejected = entity.rejected;
      const rowKey = row.rowKey;

      return (
        <div
          key={rowKey}
          className={`entity-row ${isRejected ? 'entity-row--rejected' : ''}`}
          onClick={(event) => onRowClick(entity, event)}
        >
          <div className="col-name">
            <div className="entity-name-primary">{entityName}</div>
            {row.duplicateCount > 1 && (
              <span style={{ marginLeft: '6px', fontSize: '12px', color: '#6b7280' }}>
                x{row.duplicateCount}
              </span>
            )}
            {row.typeConflicts.length > 1 && (
              <span style={{ marginLeft: '6px', fontSize: '12px', color: '#b45309' }}>
                Types: {row.typeConflicts.join(', ')}
              </span>
            )}
          </div>

          <div className="col-type">
            <select
              value={entity.type}
              onChange={(e) => onTypeChangeRow(row, e.target.value as EntityType)}
              className="type-select"
              disabled={isRejected}
            >
              {ENTITY_TYPES.map(type => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div className="col-reject">
            <button
              onClick={() => onRejectRow(row)}
              className={`reject-btn ${isRejected ? 'reject-btn--active' : ''}`}
              title={isRejected ? 'Restore entity' : 'Reject entity'}
              type="button"
            >
              {isRejected ? 'Restore' : 'Reject'}
            </button>
          </div>

          <div className="col-notes">
            <input
              type="text"
              value={entity.notes || ''}
              onChange={(e) => onNotesChangeRow(row, e.target.value)}
              placeholder="Add notes..."
              className="notes-input"
              disabled={isRejected}
            />
          </div>
        </div>
      );
    });
  }, []);

  return (
    <div
      ref={sidebarRef}
      className={`entity-review-sidebar ${mode} ${mode === 'overlay' ? 'liquid-glass--strong' : 'liquid-glass--subtle'}`}
      style={overlayStyle}
    >
      {/* Drag handle for overlay mode */}
      {mode === 'overlay' && (
        <div
          className="sidebar-drag-handle"
          onMouseDown={handleDragStart}
          title="Drag to move"
        >
          <GripVertical size={16} />
        </div>
      )}

      {/* Header */}
      <div className="review-sidebar-header">
        <div className="review-sidebar-title">
          <h2>Entities ({groupedEntities.length})</h2>
          <p className="review-sidebar-subtitle">
            Review detected entities, adjust types, and capture notes.
          </p>
          <div style={{ fontWeight: 700, color: '#2563eb', marginTop: '4px' }}>
            Filters: ENABLED (temporary)
          </div>
          <div className="review-sidebar-stats">
            <span className="stat-badge stat-kept">{keptCount} kept</span>
            <span className="stat-badge stat-rejected">{rejectedCount} rejected</span>
          </div>
        </div>

        <div className="review-sidebar-actions">
          <button
            onClick={onLogReport}
            className="action-btn"
            title="Save JSON report to disk"
          >
            Log Report
          </button>
          <button
            onClick={onCopyReport}
            className="action-btn"
            title="Copy JSON report to clipboard"
          >
            Copy Report
          </button>
          <button
            onClick={onPin}
            className="action-btn-icon"
            title={mode === 'pinned' ? 'Unpin sidebar' : 'Pin sidebar'}
          >
            {mode === 'pinned' ? <PinOff size={16} /> : <Pin size={16} />}
          </button>
          <button
            onClick={onClose}
            className="action-btn-icon"
            title="Close sidebar"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Filter toggle */}
      <div className="review-sidebar-filter">
        <label>
          <input
            type="checkbox"
            checked={showRejected}
            onChange={(e) => setShowRejected(e.target.checked)}
          />
          Show rejected entities
        </label>
        <div className="review-sidebar-filters" style={{ marginTop: '8px', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
          <div style={{ fontWeight: 600, marginBottom: '6px' }}>Filters</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {(Object.keys(DEFAULT_PHASE_FILTERS) as PhaseKey[]).map(key => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input
                  type="checkbox"
                  checked={phaseFilters[key]}
                  onChange={(e) => setPhaseFilters(prev => ({ ...prev, [key]: e.target.checked }))}
                />
                {key}
              </label>
            ))}
          </div>
          <div style={{ marginTop: '6px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className="action-btn" onClick={() => setPhaseFilters({ ...DEFAULT_PHASE_FILTERS, booknlp: true, pipeline: false, manual: false, editor: false, unknown: false })}>
              BookNLP Only
            </button>
            <button className="action-btn" onClick={() => setPhaseFilters({ ...DEFAULT_PHASE_FILTERS, booknlp: false, pipeline: true, manual: false, editor: false, unknown: false })}>
              Pipeline Only
            </button>
            <button className="action-btn" onClick={() => setPhaseFilters({ ...DEFAULT_PHASE_FILTERS, booknlp: false, pipeline: false, manual: true, editor: true, unknown: false })}>
              Manual Only
            </button>
            <button className="action-btn" onClick={() => setPhaseFilters(DEFAULT_PHASE_FILTERS)}>
              Everything
            </button>
          </div>
        </div>
      </div>

      {/* Entity table */}
      <div className="review-sidebar-body">
        {groupedEntities.length === 0 ? (
          <div className="review-sidebar-empty">
            <p>No entities to review</p>
          </div>
        ) : (
          <div className="entity-table">
            {/* Table header */}
            <div className="entity-table-header">
              <div className="col-name">Entity Name</div>
              <div className="col-type">Type</div>
              <div className="col-reject">Reject</div>
              <div className="col-notes">Notes</div>
            </div>

            {/* Table rows */}
            {renderRows.map((row) => (
              <EntityRow
                key={row.rowKey}
                row={row}
                onRowClick={handleRowClick}
                onTypeChangeRow={handleTypeDropdownChange}
                onRejectRow={handleRejectRow}
                onNotesChangeRow={handleNotesRow}
              />
            ))}
            {isChunkLoading && (
              <div className="entity-row entity-row--loading">
                <div className="col-name">
                  <div className="entity-name-primary">Loading more…</div>
                </div>
                <div className="col-type" />
                <div className="col-reject" />
                <div className="col-notes" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Resize handle for overlay mode */}
      {mode === 'overlay' && (
        <div
          className="sidebar-resize-handle"
          onMouseDown={handleResizeStart}
          title="Drag to resize"
        />
      )}
    </div>
  );
}
