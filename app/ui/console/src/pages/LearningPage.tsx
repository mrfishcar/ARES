/**
 * Learning Dashboard - Phase 4.3
 *
 * Displays learned patterns from user corrections with:
 * - Pattern list with confidence and stats
 * - Enable/disable toggles per pattern
 * - Pattern application log
 * - Manual pattern creation
 */

import { useState, useCallback } from 'react';

// ============================================================================
// TYPES
// ============================================================================

interface LearnedPattern {
  id: string;
  type: 'entity_type' | 'entity_name' | 'relation' | 'confidence';
  pattern: string;
  condition: {
    textPattern?: string;
    contextPattern?: string;
    entityType?: string;
  };
  action: {
    setType?: string;
    setConfidence?: number;
    merge?: boolean;
    reject?: boolean;
  };
  stats: {
    timesApplied: number;
    timesValidated: number;
    timesRejected: number;
    lastApplied?: string;
  };
  active: boolean;
  confidence: number;
  sourceCorrections: string[];
}

interface PatternApplicationLog {
  timestamp: string;
  patternId: string;
  patternName: string;
  entityName: string;
  action: string;
  result: 'applied' | 'validated' | 'rejected';
}

// ============================================================================
// MOCK DATA (replace with API calls when backend is ready)
// ============================================================================

const MOCK_PATTERNS: LearnedPattern[] = [
  {
    id: 'pat_1',
    type: 'entity_type',
    pattern: 'kingdom of *',
    condition: { textPattern: 'kingdom of *', entityType: 'MISC' },
    action: { setType: 'PLACE' },
    stats: { timesApplied: 12, timesValidated: 10, timesRejected: 2 },
    active: true,
    confidence: 0.83,
    sourceCorrections: ['corr_1', 'corr_2'],
  },
  {
    id: 'pat_2',
    type: 'entity_type',
    pattern: '* university',
    condition: { textPattern: '* university', entityType: 'MISC' },
    action: { setType: 'ORG' },
    stats: { timesApplied: 8, timesValidated: 8, timesRejected: 0 },
    active: true,
    confidence: 0.95,
    sourceCorrections: ['corr_3'],
  },
  {
    id: 'pat_3',
    type: 'entity_name',
    pattern: 'John <-> John Smith',
    condition: { textPattern: 'John' },
    action: { merge: true },
    stats: { timesApplied: 3, timesValidated: 2, timesRejected: 1 },
    active: true,
    confidence: 0.67,
    sourceCorrections: ['corr_4'],
  },
  {
    id: 'pat_4',
    type: 'confidence',
    pattern: 'the',
    condition: { textPattern: 'the' },
    action: { reject: true },
    stats: { timesApplied: 50, timesValidated: 48, timesRejected: 2, lastApplied: '2025-12-30T22:00:00Z' },
    active: true,
    confidence: 0.96,
    sourceCorrections: ['corr_5', 'corr_6', 'corr_7'],
  },
];

const MOCK_LOG: PatternApplicationLog[] = [
  {
    timestamp: '2025-12-30T22:10:00Z',
    patternId: 'pat_1',
    patternName: 'kingdom of *',
    entityName: 'Kingdom of Gondor',
    action: 'setType: PLACE',
    result: 'applied',
  },
  {
    timestamp: '2025-12-30T22:09:00Z',
    patternId: 'pat_2',
    patternName: '* university',
    entityName: 'Oxford University',
    action: 'setType: ORG',
    result: 'applied',
  },
  {
    timestamp: '2025-12-30T22:08:00Z',
    patternId: 'pat_4',
    patternName: 'the',
    entityName: 'the',
    action: 'reject',
    result: 'applied',
  },
];

// ============================================================================
// COMPONENTS
// ============================================================================

interface PatternCardProps {
  pattern: LearnedPattern;
  onToggle: (id: string, active: boolean) => void;
}

function PatternCard({ pattern, onToggle }: PatternCardProps) {
  const getTypeColor = (type: string) => {
    switch (type) {
      case 'entity_type':
        return '#4CAF50';
      case 'entity_name':
        return '#2196F3';
      case 'relation':
        return '#FF9800';
      case 'confidence':
        return '#9C27B0';
      default:
        return '#757575';
    }
  };

  const getActionDescription = (action: LearnedPattern['action']) => {
    if (action.setType) return `Set type to ${action.setType}`;
    if (action.setConfidence) return `Set confidence to ${action.setConfidence}`;
    if (action.merge) return 'Merge entities';
    if (action.reject) return 'Reject entity';
    return 'Unknown action';
  };

  const totalApplications = pattern.stats.timesApplied;
  const successRate =
    pattern.stats.timesValidated + pattern.stats.timesRejected > 0
      ? (pattern.stats.timesValidated /
          (pattern.stats.timesValidated + pattern.stats.timesRejected)) *
        100
      : 0;

  return (
    <div
      style={{
        background: 'var(--surface, #1a1a1a)',
        border: '1px solid var(--border, #333)',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '12px',
        opacity: pattern.active ? 1 : 0.6,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '12px',
        }}
      >
        <div>
          <span
            style={{
              display: 'inline-block',
              background: getTypeColor(pattern.type),
              color: 'white',
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '12px',
              marginRight: '8px',
            }}
          >
            {pattern.type}
          </span>
          <code
            style={{
              background: 'var(--code-bg, #2a2a2a)',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '14px',
            }}
          >
            {pattern.pattern}
          </code>
        </div>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={pattern.active}
            onChange={e => onToggle(pattern.id, e.target.checked)}
            style={{ marginRight: '8px' }}
          />
          Active
        </label>
      </div>

      <div
        style={{
          fontSize: '13px',
          color: 'var(--text-secondary, #888)',
          marginBottom: '8px',
        }}
      >
        <strong>Action:</strong> {getActionDescription(pattern.action)}
      </div>

      <div
        style={{
          display: 'flex',
          gap: '24px',
          fontSize: '12px',
          color: 'var(--text-tertiary, #666)',
        }}
      >
        <div>
          <strong>Applied:</strong> {totalApplications}x
        </div>
        <div>
          <strong>Confidence:</strong> {(pattern.confidence * 100).toFixed(0)}%
        </div>
        <div>
          <strong>Success Rate:</strong> {successRate.toFixed(0)}%
        </div>
        <div>
          <strong>Sources:</strong> {pattern.sourceCorrections.length} corrections
        </div>
      </div>
    </div>
  );
}

interface LogEntryProps {
  entry: PatternApplicationLog;
}

function LogEntry({ entry }: LogEntryProps) {
  const getResultColor = (result: string) => {
    switch (result) {
      case 'applied':
        return '#4CAF50';
      case 'validated':
        return '#2196F3';
      case 'rejected':
        return '#F44336';
      default:
        return '#757575';
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  return (
    <div
      style={{
        display: 'flex',
        gap: '16px',
        padding: '8px 0',
        borderBottom: '1px solid var(--border, #333)',
        fontSize: '13px',
      }}
    >
      <span style={{ color: 'var(--text-tertiary, #666)', width: '80px' }}>
        {formatTime(entry.timestamp)}
      </span>
      <span style={{ flex: 1 }}>
        <strong>{entry.patternName}</strong> → {entry.entityName}
      </span>
      <span
        style={{
          color: getResultColor(entry.result),
          fontWeight: 500,
        }}
      >
        {entry.result}
      </span>
    </div>
  );
}

interface CreatePatternModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (pattern: Partial<LearnedPattern>) => void;
}

function CreatePatternModal({ isOpen, onClose, onCreate }: CreatePatternModalProps) {
  const [type, setType] = useState<LearnedPattern['type']>('entity_type');
  const [textPattern, setTextPattern] = useState('');
  const [targetType, setTargetType] = useState('');

  if (!isOpen) return null;

  const handleCreate = () => {
    if (!textPattern.trim()) return;

    onCreate({
      type,
      pattern: textPattern,
      condition: { textPattern },
      action: type === 'entity_type' ? { setType: targetType } : { reject: true },
      active: true,
      confidence: 0.5,
    });

    setTextPattern('');
    setTargetType('');
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface, #1a1a1a)',
          borderRadius: '12px',
          padding: '24px',
          width: '400px',
          maxWidth: '90vw',
        }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0, marginBottom: '16px' }}>Create Pattern</h3>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>
            Pattern Type
          </label>
          <select
            value={type}
            onChange={e => setType(e.target.value as LearnedPattern['type'])}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              background: 'var(--input-bg, #2a2a2a)',
              border: '1px solid var(--border, #333)',
              color: 'inherit',
            }}
          >
            <option value="entity_type">Entity Type</option>
            <option value="entity_name">Entity Name</option>
            <option value="confidence">Confidence/Rejection</option>
          </select>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>
            Text Pattern (use * for wildcard)
          </label>
          <input
            type="text"
            value={textPattern}
            onChange={e => setTextPattern(e.target.value)}
            placeholder="e.g., kingdom of *"
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              background: 'var(--input-bg, #2a2a2a)',
              border: '1px solid var(--border, #333)',
              color: 'inherit',
            }}
          />
        </div>

        {type === 'entity_type' && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>
              Target Type
            </label>
            <select
              value={targetType}
              onChange={e => setTargetType(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '4px',
                background: 'var(--input-bg, #2a2a2a)',
                border: '1px solid var(--border, #333)',
                color: 'inherit',
              }}
            >
              <option value="">Select type...</option>
              <option value="PERSON">PERSON</option>
              <option value="PLACE">PLACE</option>
              <option value="ORG">ORG</option>
              <option value="ITEM">ITEM</option>
              <option value="WORK">WORK</option>
              <option value="EVENT">EVENT</option>
            </select>
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: '4px',
              background: 'transparent',
              border: '1px solid var(--border, #333)',
              color: 'inherit',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!textPattern.trim() || (type === 'entity_type' && !targetType)}
            style={{
              padding: '8px 16px',
              borderRadius: '4px',
              background: 'var(--primary, #4CAF50)',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              opacity:
                !textPattern.trim() || (type === 'entity_type' && !targetType) ? 0.5 : 1,
            }}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface LearningPageProps {
  project?: string;
  toast?: { addToast: (msg: string, type: string) => void };
}

export function LearningPage({ toast }: LearningPageProps) {
  const [patterns, setPatterns] = useState<LearnedPattern[]>(MOCK_PATTERNS);
  const [log] = useState<PatternApplicationLog[]>(MOCK_LOG);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const handleToggle = useCallback(
    (id: string, active: boolean) => {
      setPatterns(prev => prev.map(p => (p.id === id ? { ...p, active } : p)));
      toast?.addToast(`Pattern ${active ? 'enabled' : 'disabled'}`, 'success');
    },
    [toast]
  );

  const handleCreate = useCallback(
    (newPattern: Partial<LearnedPattern>) => {
      const fullPattern: LearnedPattern = {
        id: `pat_${Date.now()}`,
        type: newPattern.type || 'entity_type',
        pattern: newPattern.pattern || '',
        condition: newPattern.condition || {},
        action: newPattern.action || {},
        stats: { timesApplied: 0, timesValidated: 0, timesRejected: 0 },
        active: true,
        confidence: 0.5,
        sourceCorrections: [],
      };

      setPatterns(prev => [fullPattern, ...prev]);
      toast?.addToast('Pattern created', 'success');
    },
    [toast]
  );

  const filteredPatterns = patterns.filter(p => {
    if (filter === 'active' && !p.active) return false;
    if (filter === 'inactive' && p.active) return false;
    if (typeFilter !== 'all' && p.type !== typeFilter) return false;
    return true;
  });

  const stats = {
    total: patterns.length,
    active: patterns.filter(p => p.active).length,
    totalApplications: patterns.reduce((sum, p) => sum + p.stats.timesApplied, 0),
    avgConfidence:
      patterns.length > 0
        ? patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length
        : 0,
  };

  return (
    <div
      style={{
        padding: '24px',
        maxWidth: '1200px',
        margin: '0 auto',
        color: 'var(--text, #fff)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
        }}
      >
        <h1 style={{ margin: 0 }}>Learning Dashboard</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            padding: '10px 20px',
            borderRadius: '6px',
            background: 'var(--primary, #4CAF50)',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          + Create Pattern
        </button>
      </div>

      {/* Stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div
          style={{
            background: 'var(--surface, #1a1a1a)',
            padding: '16px',
            borderRadius: '8px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{stats.total}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary, #888)' }}>
            Total Patterns
          </div>
        </div>
        <div
          style={{
            background: 'var(--surface, #1a1a1a)',
            padding: '16px',
            borderRadius: '8px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#4CAF50' }}>
            {stats.active}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary, #888)' }}>
            Active Patterns
          </div>
        </div>
        <div
          style={{
            background: 'var(--surface, #1a1a1a)',
            padding: '16px',
            borderRadius: '8px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
            {stats.totalApplications}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary, #888)' }}>
            Total Applications
          </div>
        </div>
        <div
          style={{
            background: 'var(--surface, #1a1a1a)',
            padding: '16px',
            borderRadius: '8px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
            {(stats.avgConfidence * 100).toFixed(0)}%
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary, #888)' }}>
            Avg Confidence
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '24px' }}>
        {/* Patterns List */}
        <div>
          <div
            style={{
              display: 'flex',
              gap: '12px',
              marginBottom: '16px',
              flexWrap: 'wrap',
            }}
          >
            <select
              value={filter}
              onChange={e => setFilter(e.target.value as any)}
              style={{
                padding: '8px 12px',
                borderRadius: '4px',
                background: 'var(--input-bg, #2a2a2a)',
                border: '1px solid var(--border, #333)',
                color: 'inherit',
              }}
            >
              <option value="all">All Patterns</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '4px',
                background: 'var(--input-bg, #2a2a2a)',
                border: '1px solid var(--border, #333)',
                color: 'inherit',
              }}
            >
              <option value="all">All Types</option>
              <option value="entity_type">Entity Type</option>
              <option value="entity_name">Entity Name</option>
              <option value="relation">Relation</option>
              <option value="confidence">Confidence</option>
            </select>
          </div>

          {filteredPatterns.length === 0 ? (
            <div
              style={{
                padding: '48px',
                textAlign: 'center',
                color: 'var(--text-secondary, #888)',
              }}
            >
              No patterns match the current filter
            </div>
          ) : (
            filteredPatterns.map(pattern => (
              <PatternCard key={pattern.id} pattern={pattern} onToggle={handleToggle} />
            ))
          )}
        </div>

        {/* Application Log */}
        <div
          style={{
            background: 'var(--surface, #1a1a1a)',
            borderRadius: '8px',
            padding: '16px',
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: '16px' }}>Recent Activity</h3>
          {log.length === 0 ? (
            <div
              style={{
                padding: '24px',
                textAlign: 'center',
                color: 'var(--text-secondary, #888)',
              }}
            >
              No recent activity
            </div>
          ) : (
            log.map((entry, i) => <LogEntry key={i} entry={entry} />)
          )}
        </div>
      </div>

      <CreatePatternModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreate}
      />
    </div>
  );
}
