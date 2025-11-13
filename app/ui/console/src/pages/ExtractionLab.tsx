/**
 * Extraction Lab - Phase 0
 * Real-time entity extraction testing UI with wiki generation
 * NOW POWERED BY THE FULL ARES ENGINE
 */

import { useState, useEffect, useCallback } from 'react';
import { CodeMirrorEditor } from '../components/CodeMirrorEditor';
import { EntityResultsPanel } from '../components/EntityResultsPanel';
import { WikiModal } from '../components/WikiModal';

interface ExtractionLabProps {
  project: string;
  toast: any;
}

// Entity format expected by the frontend
interface EntitySpan {
  start: number;
  end: number;
  text: string;
  displayText?: string;
  type: string;
  confidence: number;
  source: 'tag' | 'natural';
}

// Relation format from ARES engine
interface Relation {
  id: string;
  subj: string;
  obj: string;
  pred: string;
  confidence: number;
  subjCanonical: string;
  objCanonical: string;
}

// Debounce helper
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: number;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait) as unknown as number;
  };
}

/**
 * Deduplicate entities - merge shorter names into longer ones
 * Example: "David" merges into "King David"
 */
function deduplicateEntities(entities: EntitySpan[]): EntitySpan[] {
  if (entities.length === 0) return entities;

  // Group by type
  const byType = new Map<string, EntitySpan[]>();
  for (const entity of entities) {
    const group = byType.get(entity.type) || [];
    group.push(entity);
    byType.set(entity.type, group);
  }

  const deduplicated: EntitySpan[] = [];

  // Process each type group
  for (const [type, group] of byType.entries()) {
    // Sort by text length (longest first)
    const sorted = [...group].sort((a, b) => b.text.length - a.text.length);
    const merged = new Set<number>(); // Track indices we've merged

    for (let i = 0; i < sorted.length; i++) {
      if (merged.has(i)) continue;

      const longer = sorted[i];
      const longerLower = longer.text.toLowerCase().trim();
      let kept = true;

      // Check if this entity should be merged into a longer one
      for (let j = 0; j < i; j++) {
        if (merged.has(j)) continue;

        const other = sorted[j];
        const otherLower = other.text.toLowerCase().trim();

        // If longer contains this one, skip this entity
        if (otherLower.includes(longerLower)) {
          merged.add(i);
          kept = false;
          break;
        }
      }

      if (kept) {
        // Check if any shorter entities should be merged into this one
        for (let j = i + 1; j < sorted.length; j++) {
          const shorter = sorted[j];
          const shorterLower = shorter.text.toLowerCase().trim();

          // If this contains the shorter one, mark shorter as merged
          if (longerLower.includes(shorterLower)) {
            merged.add(j);
          }
        }

        deduplicated.push(longer);
      }
    }
  }

  // Sort by position in original text
  return deduplicated.sort((a, b) => a.start - b.start);
}

export function ExtractionLab({ project, toast }: ExtractionLabProps) {
  const [text, setText] = useState('');
  const [entities, setEntities] = useState<EntitySpan[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [processing, setProcessing] = useState(false);
  const [stats, setStats] = useState({ time: 0, confidence: 0, count: 0, relationCount: 0 });
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [showHighlighting, setShowHighlighting] = useState(true);
  const [renderMarkdown, setRenderMarkdown] = useState(false);

  // Real-time extraction using FULL ARES ENGINE (debounced 1000ms for heavier processing)
  const extractEntities = useCallback(
    debounce(async (text: string) => {
      if (!text.trim()) {
        setEntities([]);
        setRelations([]);
        setStats({ time: 0, confidence: 0, count: 0, relationCount: 0 });
        return;
      }

      setProcessing(true);
      const start = performance.now();

      try {
        // Call ARES engine API (use environment variable for production)
        const apiUrl = import.meta.env.VITE_API_URL || 'https://ares-production-72ea.up.railway.app';
        const response = await fetch(`${apiUrl}/extract-entities`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text }),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || 'Extraction failed');
        }

        // Transform ARES engine output to EntitySpan format
        const extractedEntities: EntitySpan[] = data.entities.flatMap((entity: any) => {
          // Create a span for each occurrence of the entity
          return entity.spans.map((span: any) => ({
            start: span.start,
            end: span.end,
            text: entity.text,
            displayText: entity.text,
            type: entity.type,
            confidence: entity.confidence,
            source: 'natural' as const,
          }));
        });

        // Deduplicate: merge overlapping spans
        const deduplicated = deduplicateEntities(extractedEntities);

        const time = performance.now() - start;
        const avgConfidence =
          deduplicated.length > 0
            ? deduplicated.reduce((sum, e) => sum + e.confidence, 0) / deduplicated.length
            : 0;

        setEntities(deduplicated);
        setRelations(data.relations || []);
        setStats({
          time: Math.round(time),
          confidence: Math.round(avgConfidence * 100),
          count: deduplicated.length,
          relationCount: data.relations?.length || 0,
        });

        console.log(`[ARES ENGINE] Extracted ${deduplicated.length} entities, ${data.relations?.length || 0} relations`);
      } catch (error) {
        console.error('Extraction failed:', error);
        toast.error(`Extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setEntities([]);
        setRelations([]);
      } finally {
        setProcessing(false);
      }
    }, 1000), // Increased debounce for heavier ARES processing
    [toast]
  );

  useEffect(() => {
    extractEntities(text);
  }, [text, extractEntities]);

  // Generate and copy test report
  const copyReport = () => {
    const report = {
      timestamp: new Date().toISOString(),
      engineVersion: 'ARES Full Engine (orchestrator.ts)',
      text: text,
      textLength: text.length,
      stats: {
        processingTime: stats.time,
        averageConfidence: stats.confidence,
        entityCount: stats.count,
        relationCount: stats.relationCount,
      },
      entities: entities.map((e) => ({
        text: e.text,
        type: e.type,
        confidence: e.confidence,
        start: e.start,
        end: e.end,
        source: e.source,
        displayText: e.displayText,
        // Include surrounding context (50 chars before/after)
        context: text.substring(Math.max(0, e.start - 50), Math.min(text.length, e.end + 50)),
      })),
      relations: relations.map((r) => ({
        subject: r.subjCanonical,
        predicate: r.pred,
        object: r.objCanonical,
        confidence: r.confidence,
      })),
      // Group entities by type for easy analysis
      entitiesByType: entities.reduce((acc, e) => {
        if (!acc[e.type]) acc[e.type] = [];
        acc[e.type].push(e.text);
        return acc;
      }, {} as Record<string, string[]>),
      // Group relations by predicate
      relationsByPredicate: relations.reduce((acc, r) => {
        if (!acc[r.pred]) acc[r.pred] = [];
        acc[r.pred].push(`${r.subjCanonical} → ${r.objCanonical}`);
        return acc;
      }, {} as Record<string, string[]>),
    };

    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    toast.success('Full ARES report copied! Includes entities AND relations.');
  };

  return (
    <div className="extraction-lab">
      {/* Header */}
      <div className="lab-header">
        <div className="lab-title">
          <span className="lab-icon">🧪</span>
          <h1>ARES Extraction Lab</h1>
          <span className="powered-badge">Powered by Full ARES Engine</span>
        </div>
        <div className="lab-stats">
          {processing ? (
            <span className="stat-badge processing">Processing...</span>
          ) : (
            <>
              <span className="stat-badge">⏱️ {stats.time}ms</span>
              <span className="stat-badge">🎯 {stats.confidence}% confidence</span>
              <span className="stat-badge">📊 {stats.count} entities</span>
              <span className="stat-badge">🔗 {stats.relationCount} relations</span>
              <button
                onClick={copyReport}
                className="report-button"
                disabled={entities.length === 0}
                title="Copy extraction report to clipboard"
              >
                📋 Copy Report
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="lab-content">
        {/* Left: Editor */}
        <div className="editor-panel">
          <div className="panel-header">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <div>
                <h2>Write or paste text...</h2>
                <p className="panel-subtitle">Full ARES engine extracts entities AND relations (updates after typing)</p>
              </div>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px' }}>
                  <input
                    type="checkbox"
                    checked={showHighlighting}
                    onChange={(e) => setShowHighlighting(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  <span>✨ Entity Highlighting</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px' }}>
                  <input
                    type="checkbox"
                    checked={renderMarkdown}
                    onChange={(e) => setRenderMarkdown(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  <span>📝 Render Markdown</span>
                </label>
              </div>
            </div>
          </div>
          <CodeMirrorEditor
            value={text}
            onChange={(newText) => setText(newText)}
            minHeight="calc(100vh - 280px)"
            disableHighlighting={!showHighlighting}
            enableWYSIWYG={renderMarkdown}
          />
        </div>

        {/* Right: Results */}
        <EntityResultsPanel
          entities={entities}
          relations={relations}
          onViewWiki={(entityName) => setSelectedEntity(entityName)}
        />
      </div>

      {/* Wiki Modal */}
      {selectedEntity && (
        <WikiModal
          entityName={selectedEntity}
          project={project}
          onClose={() => setSelectedEntity(null)}
        />
      )}
    </div>
  );
}
