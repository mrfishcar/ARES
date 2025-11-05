/**
 * Highlight Context Menu - Sprint R10
 * Right-click menu for entity highlight actions
 */

import { useState } from 'react';
import type { Highlight } from '../hooks/useHighlights';

interface HighlightContextMenuProps {
  highlight: Highlight;
  position: { x: number; y: number };
  onConfirm: (highlightId: string, entityType?: string) => Promise<void>;
  onReject: (highlightId: string) => Promise<void>;
  onCorrect: (highlightId: string, newEntityType: string) => Promise<void>;
  onClose: () => void;
}

const ENTITY_TYPES = ['PERSON', 'PLACE', 'ORG', 'EVENT', 'CONCEPT', 'THING'];

export function HighlightContextMenu({
  highlight,
  position,
  onConfirm,
  onReject,
  onCorrect,
  onClose,
}: HighlightContextMenuProps) {
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [processing, setProcessing] = useState(false);

  const handleConfirm = async () => {
    setProcessing(true);
    try {
      await onConfirm(highlight.id);
      onClose();
    } catch (error) {
      console.error('Failed to confirm highlight:', error);
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    setProcessing(true);
    try {
      await onReject(highlight.id);
      onClose();
    } catch (error) {
      console.error('Failed to reject highlight:', error);
    } finally {
      setProcessing(false);
    }
  };

  const handleCorrect = async (newType: string) => {
    setProcessing(true);
    try {
      await onCorrect(highlight.id, newType);
      onClose();
    } catch (error) {
      console.error('Failed to correct highlight:', error);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9998,
        }}
      />

      {/* Context Menu */}
      <div
        style={{
          position: 'fixed',
          top: position.y,
          left: position.x,
          background: 'white',
          borderRadius: '6px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          padding: '4px 0',
          minWidth: '180px',
          zIndex: 9999,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '8px 12px',
            borderBottom: '1px solid #e5e7eb',
            fontSize: '12px',
            color: '#6b7280',
          }}
        >
          <div style={{ fontWeight: '600', marginBottom: '2px' }}>"{highlight.text}"</div>
          <div>
            {highlight.entityType} • {(highlight.confidence * 100).toFixed(0)}% confidence
          </div>
        </div>

        {/* Actions */}
        <div style={{ padding: '4px 0' }}>
          {highlight.status === 'proposed' && (
            <>
              <button
                onClick={handleConfirm}
                disabled={processing}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'transparent',
                  border: 'none',
                  textAlign: 'left',
                  cursor: processing ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  color: '#10b981',
                  fontWeight: '500',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f3f4f6')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                ✓ Confirm as {highlight.entityType}
              </button>

              <button
                onClick={() => setShowTypeMenu(!showTypeMenu)}
                disabled={processing}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'transparent',
                  border: 'none',
                  textAlign: 'left',
                  cursor: processing ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  color: '#3b82f6',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f3f4f6')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span>Correct Type</span>
                <span>{showTypeMenu ? '▲' : '▼'}</span>
              </button>

              {showTypeMenu && (
                <div
                  style={{
                    paddingLeft: '12px',
                    borderLeft: '2px solid #e5e7eb',
                    marginLeft: '12px',
                  }}
                >
                  {ENTITY_TYPES.filter((type) => type !== highlight.entityType).map((type) => (
                    <button
                      key={type}
                      onClick={() => handleCorrect(type)}
                      disabled={processing}
                      style={{
                        width: '100%',
                        padding: '6px 12px',
                        background: 'transparent',
                        border: 'none',
                        textAlign: 'left',
                        cursor: processing ? 'not-allowed' : 'pointer',
                        fontSize: '13px',
                        color: '#374151',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#eff6ff')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              )}

              <button
                onClick={handleReject}
                disabled={processing}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'transparent',
                  border: 'none',
                  textAlign: 'left',
                  cursor: processing ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  color: '#ef4444',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f3f4f6')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                ✗ Reject
              </button>
            </>
          )}

          {highlight.status === 'confirmed' && (
            <div
              style={{
                padding: '8px 12px',
                fontSize: '13px',
                color: '#6b7280',
                fontStyle: 'italic',
              }}
            >
              Already confirmed
            </div>
          )}

          {highlight.status === 'rejected' && (
            <div
              style={{
                padding: '8px 12px',
                fontSize: '13px',
                color: '#6b7280',
                fontStyle: 'italic',
              }}
            >
              Rejected
            </div>
          )}
        </div>
      </div>
    </>
  );
}
