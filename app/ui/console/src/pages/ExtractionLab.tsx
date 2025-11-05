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
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
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

        const time = performance.now() - start;
        const avgConfidence =
          extractedEntities.length > 0
            ? extractedEntities.reduce((sum, e) => sum + e.confidence, 0) / extractedEntities.length
            : 0;

        setEntities(extractedEntities);
        setStats({
          time: Math.round(time),
          confidence: Math.round(avgConfidence * 100),
          count: extractedEntities.length,
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
            <p className="panel-subtitle">Entities will be highlighted as you type</p>
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
