/**
 * Extraction Lab - Phase 0
 * Real-time entity extraction testing UI with wiki generation
 */

import { useState, useEffect, useCallback } from 'react';
import { CodeMirrorEditor } from '../components/CodeMirrorEditor';
import { EntityResultsPanel } from '../components/EntityResultsPanel';
import { WikiModal } from '../components/WikiModal';
import { highlightEntities, type EntitySpan } from '../../../../editor/entityHighlighter';

interface ExtractionLabProps {
  project: string;
  toast: any;
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
  const [processing, setProcessing] = useState(false);
  const [stats, setStats] = useState({ time: 0, confidence: 0, count: 0 });
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);

  // Real-time extraction (debounced 500ms)
  const extractEntities = useCallback(
    debounce(async (text: string) => {
      if (!text.trim()) {
        setEntities([]);
        setStats({ time: 0, confidence: 0, count: 0 });
        return;
      }

      setProcessing(true);
      const start = performance.now();

      try {
        // Call entity highlighter
        const extractedEntities = await highlightEntities(text, {
          maxHighlights: 100,
          minConfidence: 0.6,
          enableNaturalDetection: true,
        });

        // Deduplicate: merge "David" into "King David", etc.
        const deduplicated = deduplicateEntities(extractedEntities);

        const time = performance.now() - start;
        const avgConfidence =
          deduplicated.length > 0
            ? deduplicated.reduce((sum, e) => sum + e.confidence, 0) / deduplicated.length
            : 0;

        setEntities(deduplicated);
        setStats({
          time: Math.round(time),
          confidence: Math.round(avgConfidence * 100),
          count: deduplicated.length,
        });
      } catch (error) {
        console.error('Extraction failed:', error);
        toast.error(`Extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setEntities([]);
      } finally {
        setProcessing(false);
      }
    }, 500),
    [toast]
  );

  useEffect(() => {
    extractEntities(text);
  }, [text, extractEntities]);

  // Generate and copy test report
  const copyReport = () => {
    const report = {
      timestamp: new Date().toISOString(),
      text: text,
      textLength: text.length,
      stats: {
        processingTime: stats.time,
        averageConfidence: stats.confidence,
        entityCount: stats.count,
      },
      entities: entities.map((e) => ({
        text: e.text,
        type: e.type,
        confidence: e.confidence,
        start: e.start,
        end: e.end,
        source: e.source,
        displayText: e.displayText,
        canonicalName: (e as any).canonicalName,
        // Include surrounding context (50 chars before/after)
        context: text.substring(Math.max(0, e.start - 50), Math.min(text.length, e.end + 50)),
      })),
      // Group by type for easy analysis
      byType: entities.reduce((acc, e) => {
        if (!acc[e.type]) acc[e.type] = [];
        acc[e.type].push(e.text);
        return acc;
      }, {} as Record<string, string[]>),
    };

    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    toast.success('Report copied to clipboard! Paste it for analysis.');
  };

  return (
    <div className="extraction-lab">
      {/* Header */}
      <div className="lab-header">
        <div className="lab-title">
          <span className="lab-icon">🧪</span>
          <h1>ARES Extraction Lab</h1>
        </div>
        <div className="lab-stats">
          {processing ? (
            <span className="stat-badge processing">Processing...</span>
          ) : (
            <>
              <span className="stat-badge">⏱️ {stats.time}ms</span>
              <span className="stat-badge">🎯 {stats.confidence}% confidence</span>
              <span className="stat-badge">📊 {stats.count} entities</span>
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
            <h2>Write or paste text...</h2>
            <p className="panel-subtitle">Entities will be highlighted as you type (updates every 1s)</p>
          </div>
          <CodeMirrorEditor
            value={text}
            onChange={(newText) => setText(newText)}
            minHeight="calc(100vh - 280px)"
          />
        </div>

        {/* Right: Results */}
        <EntityResultsPanel
          entities={entities}
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
