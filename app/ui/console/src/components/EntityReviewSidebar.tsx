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
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  }, [mode, position]);

  const handleDragMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    const newX = Math.max(0, Math.min(window.innerWidth - size.width, e.clientX - dragStart.x));
    const newY = Math.max(0, Math.min(window.innerHeight - size.height, e.clientY - dragStart.y));
    setPosition({ x: newX, y: newY });
  }, [isDragging, dragStart, size]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Resize handlers for overlay mode
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    if (mode !== 'overlay') return;
    e.stopPropagation();
    setIsResizing(true);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height
    });
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
    setIsResizing(false);
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
    if (isDragging) {
      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', handleDragEnd);
      return () => {
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [isDragging, handleDragMove, handleDragEnd]);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      return () => {
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [isResizing, handleResizeMove, handleResizeEnd]);

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
  const overlayStyle = mode === 'overlay' ? {
    position: 'fixed' as const,
    top: position.y,
    left: position.x,
    width: size.width,
    height: size.height,
  } : {};

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
                      value={entity.type}
                      onChange={(e) => {
                        const newType = e.target.value as EntityType;
                        row.indices.forEach(i => handleTypeChange(i, newType));
                      }}
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

                  {/* Column 3: Reject Button */}
                  <div className="col-reject">
                    <button
                      onClick={() => row.indices.forEach(i => handleReject(i))}
                      className={`reject-btn ${isRejected ? 'reject-btn--active' : ''}`}
                      title={isRejected ? 'Restore entity' : 'Reject entity'}
                    >
                      {isRejected ? 'Restore' : 'Reject'}
                    </button>
                  </div>

                  {/* Column 4: Notes */}
                  <div className="col-notes">
                    <input
                      type="text"
                      value={entity.notes || ''}
                      onChange={(e) => row.indices.forEach(i => handleNotesChange(i, e.target.value))}
                      placeholder="Add notes..."
                      className="notes-input"
                      disabled={isRejected}
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
