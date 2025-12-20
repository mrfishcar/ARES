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

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { X, Pin, PinOff, GripVertical } from 'lucide-react';
import type { EntitySpan, EntityType } from '../types/entities';
import { collapseEntitiesForUI, type AggregatedEntityRow } from './entity-review-utils';
import './EntityReviewSidebar.css';

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
  // Draggable/resizable state for overlay mode
  const baseWidth = Math.min(640, window.innerWidth - 48);
  const baseHeight = Math.max(420, window.innerHeight - 160);
  const [position, setPosition] = useState({ x: Math.max(16, window.innerWidth - baseWidth - 24), y: 72 });
  const [size, setSize] = useState({ width: baseWidth, height: baseHeight });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const sidebarRef = useRef<HTMLDivElement>(null);
  const latestDimsRef = useRef({ innerWidth: window.innerWidth, innerHeight: window.innerHeight });

  // Display all entities (no layout-shifting filters)
  const displayEntities = useMemo(() => entities, [entities]);

  const entityIndexMap = useMemo(() => {
    const map = new Map<EntitySpan, number>();
    entities.forEach((e, i) => map.set(e, i));
    return map;
  }, [entities]);

  const groupedEntities: AggregatedEntityRow[] = useMemo(
    () => collapseEntitiesForUI(displayEntities, entityIndexMap),
    [displayEntities, entityIndexMap]
  );
  const totalRows = groupedEntities.length;

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
    if (!isResizing) return;
    const deltaX = e.clientX - resizeStart.x;
    const deltaY = e.clientY - resizeStart.y;
    const newWidth = Math.max(360, Math.min(window.innerWidth - position.x, resizeStart.width - deltaX));
    const newHeight = Math.max(320, Math.min(window.innerHeight - position.y, resizeStart.height + deltaY));
    setSize({ width: newWidth, height: newHeight });
  }, [isResizing, resizeStart, position]);

  const handleResizeEnd = useCallback(() => {
    const state = resizeStateRef.current;
    if (!state.active) return;
    state.active = false;
    setSize({ width: state.baseWidth, height: state.baseHeight });
  }, []);

  // Keep overlay within viewport on resize
  useEffect(() => {
    const handleResize = () => {
      setSize(prev => {
        const maxWidth = Math.max(320, window.innerWidth - 32);
        const maxHeight = Math.max(320, window.innerHeight - 96);
        return {
          width: Math.min(prev.width, maxWidth),
          height: Math.min(prev.height, maxHeight),
        };
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Keep overlay within viewport on resize
  useEffect(() => {
    const handleResize = () => {
      setSize(prev => {
        const maxWidth = Math.max(320, window.innerWidth - 32);
        const maxHeight = Math.max(320, window.innerHeight - 96);
        return {
          width: Math.min(prev.width, maxWidth),
          height: Math.min(prev.height, maxHeight),
        };
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    setPosition(prev => {
      const maxX = Math.max(16, window.innerWidth - size.width - 16);
      const maxY = Math.max(48, window.innerHeight - size.height - 16);
      return {
        x: Math.min(Math.max(16, prev.x), maxX),
        y: Math.min(Math.max(48, prev.y), maxY),
      };
    });
  }, [size]);

  // Mouse event listeners
  useEffect(() => {
    const handleResize = () => {
      setSize(prev => {
        const maxWidth = Math.max(320, window.innerWidth - 32);
        const maxHeight = Math.max(320, window.innerHeight - 96);
        return {
          width: Math.min(prev.width, maxWidth),
          height: Math.min(prev.height, maxHeight),
        };
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    setPosition(prev => {
      const maxX = Math.max(16, window.innerWidth - size.width - 16);
      const maxY = Math.max(48, window.innerHeight - size.height - 16);
      return {
        x: Math.min(Math.max(16, prev.x), maxX),
        y: Math.min(Math.max(48, prev.y), maxY),
      };
    });
  }, [size]);

  // Mouse event listeners
  useEffect(() => {
    const handleResize = () => {
      setSize(prev => {
        const maxWidth = Math.max(320, window.innerWidth - 32);
        const maxHeight = Math.max(320, window.innerHeight - 96);
        return {
          width: Math.min(prev.width, maxWidth),
          height: Math.min(prev.height, maxHeight),
        };
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    setPosition(prev => {
      const maxX = Math.max(16, window.innerWidth - size.width - 16);
      const maxY = Math.max(48, window.innerHeight - size.height - 16);
      return {
        x: Math.min(Math.max(16, prev.x), maxX),
        y: Math.min(Math.max(48, prev.y), maxY),
      };
    });
  }, [size]);

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
  const [visibleCount, setVisibleCount] = useState(totalRows);
  const [showProgressHint, setShowProgressHint] = useState(false);

  // Progressive rendering for large lists (keeps UI responsive)
  useEffect(() => {
    const total = totalRows;
    if (total === 0) {
      setVisibleCount(0);
      setShowProgressHint(false);
      return;
    }

    const initial = Math.min(total, 120);
    setVisibleCount(initial);
    setShowProgressHint(false);

    let rafId: number;
    let hintTimer: number;

    const step = () => {
      setVisibleCount(prev => {
        if (prev >= total) return prev;
        const next = Math.min(total, prev + 100);
        if (next < total) {
          rafId = requestAnimationFrame(step);
        }
        return next;
      });
    };

    if (initial < total) {
      hintTimer = window.setTimeout(() => setShowProgressHint(true), 200);
      rafId = requestAnimationFrame(step);
    }

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(hintTimer);
    };
  }, [totalRows]);

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
          <div className="review-sidebar-eyebrow">Entity review</div>
          <h2>Entities ({totalRows})</h2>
          <p className="review-sidebar-subtitle">
            Review detected entities, adjust types, and capture notes.
          </p>
          <div className="review-sidebar-stats">
            <span className="stat-badge stat-kept">{keptCount} kept</span>
            <span className="stat-badge stat-rejected">{rejectedCount} rejected</span>
          </div>
          <div className="review-sidebar-progress" aria-live="polite">
            {showProgressHint && visibleCount < totalRows ? `Loading ${totalRows - visibleCount} more…` : ''}
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
            {groupedEntities.slice(0, visibleCount).map((row) => {
              const entity = row.entity;
              const entityName = entity.canonicalName || entity.displayText || entity.text;
              const isRejected = entity.rejected;
              const rowKey = row.rowKey;

              return (
                <div
                  key={rowKey}
                  className={`entity-row ${isRejected ? 'entity-row--rejected' : ''}`}
                  onClick={(event) => handleRowClick(entity, event)}
                >
                  {/* Column 1: Entity Name */}
                  <div className="col-name">
                    <div className="entity-name-primary">{entityName}</div>
                    <div className="entity-meta">
                      {row.duplicateCount > 1 && (
                        <span className="entity-meta-badge entity-meta-duplicate">
                          x{row.duplicateCount}
                        </span>
                      )}
                      {row.typeConflicts.length > 1 && (
                        <span className="entity-meta-badge entity-meta-conflict">
                          Types: {row.typeConflicts.join(', ')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Column 2: Type Dropdown */}
                  <div className="col-type">
                    <select
                      value={row.entity.type}
                      onChange={(e) => {
                        const newType = e.target.value as EntityType;
                        row.indices.forEach(i => handleTypeChange(i, newType));
                      }}
                      className="type-select"
                      disabled={row.entity.rejected}
                    >
                      {ENTITY_TYPES.map(type => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Column 3: Reject Button */}
                  <div className="col-reject">
                    <button
                      onClick={() => row.indices.forEach(i => handleReject(i))}
                      className={`reject-btn ${row.entity.rejected ? 'reject-btn--active' : ''}`}
                      title={row.entity.rejected ? 'Restore entity' : 'Reject entity'}
                    >
                      {row.entity.rejected ? 'Restore' : 'Reject'}
                    </button>
                  </div>

                  {/* Column 4: Notes */}
                  <div className="col-notes">
                    <input
                      type="text"
                      value={row.entity.notes || ''}
                      onChange={(e) => row.indices.forEach(i => handleNotesChange(i, e.target.value))}
                      placeholder="Add notes..."
                      className="notes-input"
                      disabled={row.entity.rejected}
                    />
                  </div>
                </div>
              );
            })}
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
