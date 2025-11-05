/**
 * EntityDigest Component - Sprint W1
 * Displays entity digest with sections and citations
 */

import { useState, useEffect } from 'react';
import { useEntityDigest, CitationRef, DigestSection } from '../hooks/useEntityDigest';
import { EmptyState } from './EmptyState';

export interface EntityDigestProps {
  project: string;
  entityId: string;
  entityName?: string;
}

export function EntityDigest({ project, entityId, entityName }: EntityDigestProps) {
  const { digest, loading, error, loadDigest, regenerate } = useEntityDigest(project, entityId);
  const [regenerating, setRegenerating] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  useEffect(() => {
    loadDigest();
  }, [loadDigest]);

  const handleRegenerate = async (options?: Record<string, any>) => {
    try {
      setRegenerating(true);
      await regenerate(options);
      setShowOptions(false);
    } catch (err) {
      console.error('[EntityDigest] Regenerate failed:', err);
    } finally {
      setRegenerating(false);
    }
  };

  if (loading && !digest) {
    return (
      <EmptyState
        type="loading"
        icon="📝"
        title="Loading digest..."
        description="Compiling notes and seeds for this entity"
      />
    );
  }

  if (error && !digest) {
    return (
      <EmptyState
        type="error"
        icon="⚠️"
        title="Failed to load digest"
        description={error}
        action={{
          label: 'Retry',
          onClick: loadDigest,
        }}
      />
    );
  }

  if (!digest) {
    return (
      <EmptyState
        icon="📝"
        title="No digest available"
        description="This entity doesn't have a digest yet. Try adding some notes or seeds first."
      />
    );
  }

  return (
    <div style={{ padding: '0' }}>
      {/* Header with stats and regenerate button */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
        paddingBottom: '16px',
        borderBottom: '1px solid #e5e7eb',
      }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '600', margin: '0 0 8px 0' }}>
            {digest.entityName || entityName || 'Entity Digest'}
          </h2>
          <div style={{ fontSize: '14px', color: '#6b7280', display: 'flex', gap: '16px' }}>
            <span>{digest.stats.seedCount} seeds</span>
            <span>{digest.stats.noteCount} notes</span>
            <span>{digest.stats.relationCount} relations</span>
            {digest.stats.temporalEventCount > 0 && (
              <span>{digest.stats.temporalEventCount} events</span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={() => setShowOptions(!showOptions)}
            disabled={regenerating}
            style={{
              padding: '8px 16px',
              background: 'white',
              color: '#6b7280',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: regenerating ? 'not-allowed' : 'pointer',
              opacity: regenerating ? 0.5 : 1,
            }}
          >
            {showOptions ? 'Hide Options' : 'Options'}
          </button>
          <button
            onClick={() => handleRegenerate()}
            disabled={regenerating}
            style={{
              padding: '8px 16px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: regenerating ? 'not-allowed' : 'pointer',
              opacity: regenerating ? 0.5 : 1,
            }}
          >
            {regenerating ? '🔄 Regenerating...' : '🔄 Regenerate'}
          </button>
        </div>
      </div>

      {/* Options panel */}
      {showOptions && (
        <div style={{
          background: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '24px',
        }}>
          <h3 style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 12px 0' }}>
            Regenerate Options
          </h3>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => handleRegenerate({ brevity: 'concise' })}
              disabled={regenerating}
              style={{
                padding: '8px 16px',
                background: 'white',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                cursor: regenerating ? 'not-allowed' : 'pointer',
              }}
            >
              Concise
            </button>
            <button
              onClick={() => handleRegenerate({ brevity: 'detailed' })}
              disabled={regenerating}
              style={{
                padding: '8px 16px',
                background: 'white',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                cursor: regenerating ? 'not-allowed' : 'pointer',
              }}
            >
              Detailed
            </button>
            <button
              onClick={() => handleRegenerate({ tone: 'formal' })}
              disabled={regenerating}
              style={{
                padding: '8px 16px',
                background: 'white',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                cursor: regenerating ? 'not-allowed' : 'pointer',
              }}
            >
              Formal
            </button>
            <button
              onClick={() => handleRegenerate({ tone: 'casual' })}
              disabled={regenerating}
              style={{
                padding: '8px 16px',
                background: 'white',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                cursor: regenerating ? 'not-allowed' : 'pointer',
              }}
            >
              Casual
            </button>
          </div>
        </div>
      )}

      {/* Generated timestamp */}
      <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '24px' }}>
        Generated {new Date(digest.generatedAt).toLocaleString()}
      </div>

      {/* Digest sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        {digest.sections.map((section, idx) => (
          <DigestSectionComponent key={idx} section={section} />
        ))}
      </div>

      {/* Empty state when no sections */}
      {digest.sections.length === 0 && (
        <EmptyState
          icon="📝"
          title="No sections yet"
          description="Add some notes or seeds to generate digest content"
        />
      )}
    </div>
  );
}

interface DigestSectionComponentProps {
  section: DigestSection;
}

function DigestSectionComponent({ section }: DigestSectionComponentProps) {
  return (
    <div>
      <h3 style={{
        fontSize: '18px',
        fontWeight: '600',
        marginBottom: '12px',
        color: '#111827',
      }}>
        {section.title}
      </h3>

      {/* Section content */}
      <div style={{
        fontSize: '15px',
        lineHeight: '1.7',
        color: '#374151',
        marginBottom: '12px',
      }}>
        {section.markdown.split('\n').map((paragraph, idx) => (
          paragraph.trim() && (
            <p key={idx} style={{ margin: '0 0 12px 0' }}>
              {paragraph}
            </p>
          )
        ))}
      </div>

      {/* Citations */}
      {section.citations.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
            Citations ({section.citations.length}):
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {section.citations.map((citation, idx) => (
              <CitationChip key={idx} citation={citation} index={idx + 1} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface CitationChipProps {
  citation: CitationRef;
  index: number;
}

function CitationChip({ citation, index }: CitationChipProps) {
  const [showQuote, setShowQuote] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <button
        onMouseEnter={() => setShowQuote(true)}
        onMouseLeave={() => setShowQuote(false)}
        style={{
          padding: '4px 10px',
          background: '#eff6ff',
          color: '#3b82f6',
          border: '1px solid #bfdbfe',
          borderRadius: '12px',
          fontSize: '12px',
          fontWeight: '500',
          cursor: 'pointer',
        }}
        title={`Source: ${citation.docId}`}
      >
        [{index}]
      </button>

      {/* Tooltip with quote */}
      {showQuote && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: '0',
          marginBottom: '8px',
          padding: '12px',
          background: '#1f2937',
          color: 'white',
          borderRadius: '8px',
          fontSize: '13px',
          lineHeight: '1.5',
          maxWidth: '400px',
          zIndex: 1000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>
          <div style={{ fontWeight: '600', marginBottom: '6px', fontSize: '11px', color: '#9ca3af' }}>
            {citation.docId}
          </div>
          <div style={{ fontStyle: 'italic' }}>
            "{citation.quote}"
          </div>
        </div>
      )}
    </div>
  );
}
