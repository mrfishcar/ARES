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

import { useState, useCallback, useRef, useEffect } from 'react';
import { X, Pin, PinOff, GripVertical } from 'lucide-react';
import type { EntitySpan, EntityType } from '../types/entities';
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
  // Filter state
  const [showRejected, setShowRejected] = useState(false);

  // Draggable/resizable state for overlay mode
  const [position, setPosition] = useState({ x: window.innerWidth - 620, y: 80 });
  const [size, setSize] = useState({ width: 600, height: window.innerHeight - 160 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Display entities based on filter
  const displayEntities = showRejected
    ? entities
    : entities.filter(e => !e.rejected);

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
    const newWidth = Math.max(400, Math.min(window.innerWidth - position.x, resizeStart.width - deltaX));
    const newHeight = Math.max(300, Math.min(window.innerHeight - position.y, resizeStart.height + deltaY));
    setSize({ width: newWidth, height: newHeight });
  }, [isResizing, resizeStart, position]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
  }, []);

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

  const keptCount = entities.filter(e => !e.rejected).length;
  const rejectedCount = entities.filter(e => e.rejected).length;

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
          <h2>Entities ({displayEntities.length})</h2>
          <p className="review-sidebar-subtitle">
            Review detected entities, adjust types, and capture notes.
          </p>
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
      </div>

      {/* Entity table */}
      <div className="review-sidebar-body">
        {displayEntities.length === 0 ? (
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
            {displayEntities.map((entity, idx) => {
              // Find original index in full entities array
              const originalIndex = entities.indexOf(entity);
              const entityName = entity.canonicalName || entity.displayText || entity.text;
              const isRejected = entity.rejected;

              return (
                <div
                  key={`${entity.text}-${entity.start}-${idx}`}
                  className={`entity-row ${isRejected ? 'entity-row--rejected' : ''}`}
                  onClick={(event) => handleRowClick(entity, event)}
                >
                  {/* Column 1: Entity Name */}
                  <div className="col-name">
                    <div className="entity-name-primary">{entityName}</div>
                  </div>

                  {/* Column 2: Type Dropdown */}
                  <div className="col-type">
                    <select
                      value={entity.type}
                      onChange={(e) => handleTypeChange(originalIndex, e.target.value as EntityType)}
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
                      onClick={() => handleReject(originalIndex)}
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
                      onChange={(e) => handleNotesChange(originalIndex, e.target.value)}
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
