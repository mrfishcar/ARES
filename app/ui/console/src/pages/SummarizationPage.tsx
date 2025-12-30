/**
 * Summarization Page
 * Task 1.2.1-1.2.5: Summarization Testing Feature
 *
 * Allows users to input text and see extraction-based summary
 * Displays entities, relations, and basic statistics
 */

import React, { useState, useMemo, useCallback } from 'react';
import Markdown from 'markdown-to-jsx';
import './SummarizationPage.css';

/**
 * Safe Markdown wrapper that ensures content is always a valid string
 */
function SafeMarkdown({ children }: { children: string }) {
  // Ensure we always have a valid string
  const content = typeof children === 'string' && children ? children : '';

  if (!content) {
    return <p className="summarization-page__empty-content">No content to display</p>;
  }

  try {
    return <Markdown>{content}</Markdown>;
  } catch (err) {
    console.error('[SafeMarkdown] Render error:', err);
    return <pre className="summarization-page__error-content">{content}</pre>;
  }
}

// Resolve API URL (same logic as ExtractionLab)
function resolveApiUrl() {
  let apiUrl = import.meta.env.VITE_API_URL;
  if (!apiUrl) {
    const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
    if (hostname.includes('vercel.app')) {
      apiUrl = 'https://ares-production-72ea.up.railway.app';
    } else {
      apiUrl = 'http://localhost:4000';
    }
  }
  return apiUrl;
}

// Types for extraction result (inline to avoid @engine imports)
interface EntityResult {
  id: string;
  text?: string;
  canonical?: string;
  type: string;
  confidence?: number;
  aliases?: string[];
}

interface RelationResult {
  id: string;
  subj: string;
  obj: string;
  pred: string;
  confidence: number;
  subjCanonical?: string;
  objCanonical?: string;
}

interface ExtractionResult {
  success?: boolean;
  entities: EntityResult[];
  relations: RelationResult[];
  stats?: {
    extractionTime?: number;
    entityCount?: number;
    relationCount?: number;
  };
}

interface SummaryResult {
  keyEntities: string;
  keyRelations: string;
  metrics: string;
  fullSummary: string;
}

function getEntityEmoji(type: string): string {
  const emojis: Record<string, string> = {
    PERSON: '👤',
    PLACE: '📍',
    ITEM: '🎭',
    ORG: '🏛️',
    EVENT: '📅',
    CREATURE: '🐉',
    WORK: '📖',
    GROUP: '👥',
    TIME_PERIOD: '⏰',
    CONCEPT: '💡',
    ANIMAL: '🐾',
  };
  return emojis[type] || '📄';
}

/**
 * Generate summary directly from extraction result (no IR dependency)
 */
function generateSummary(extraction: ExtractionResult): SummaryResult {
  const entities = extraction.entities || [];
  const relations = extraction.relations || [];

  // Key Entities Section
  const entityLines: string[] = ['## Key Characters & Entities\n'];
  const sortedEntities = [...entities]
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    .slice(0, 15);

  if (sortedEntities.length === 0) {
    entityLines.push('*No entities extracted*\n');
  } else {
    for (const entity of sortedEntities) {
      const type = String(entity.type || 'UNKNOWN');
      const name = String(entity.canonical || entity.text || 'Unknown');
      const emoji = getEntityEmoji(type);
      const conf = entity.confidence ? ` (${Math.round(entity.confidence * 100)}%)` : '';
      entityLines.push(`- ${emoji} **${name}** — ${type}${conf}`);
    }
  }
  const keyEntities = entityLines.join('\n');

  // Key Relations Section
  const relationLines: string[] = ['## Key Relationships\n'];
  const sortedRelations = [...relations]
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    .slice(0, 15);

  if (sortedRelations.length === 0) {
    relationLines.push('*No relationships extracted*\n');
  } else {
    for (const rel of sortedRelations) {
      const subj = String(rel.subjCanonical || rel.subj || 'Unknown');
      const obj = String(rel.objCanonical || rel.obj || 'Unknown');
      const pred = String(rel.pred || 'related_to').replace(/_/g, ' ');
      relationLines.push(`- **${subj}** → *${pred}* → **${obj}**`);
    }
  }
  const keyRelations = relationLines.join('\n');

  // Metrics Section
  const metricsLines: string[] = ['## Extraction Metrics\n'];
  metricsLines.push(`- **Total Entities:** ${entities.length}`);
  metricsLines.push(`- **Total Relations:** ${relations.length}`);
  if (extraction.stats?.extractionTime) {
    metricsLines.push(`- **Processing Time:** ${extraction.stats.extractionTime}ms`);
  }

  // Entity type breakdown
  const typeCounts: Record<string, number> = {};
  for (const entity of entities) {
    const type = String(entity.type || 'UNKNOWN');
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  }
  if (Object.keys(typeCounts).length > 0) {
    metricsLines.push('\n### Entity Types');
    for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
      metricsLines.push(`- ${type}: ${count}`);
    }
  }
  const metrics = metricsLines.join('\n');

  // Full Summary
  const fullLines: string[] = [];
  fullLines.push('# Text Analysis Summary\n');
  fullLines.push(keyEntities);
  fullLines.push('\n');
  fullLines.push(keyRelations);
  fullLines.push('\n');
  fullLines.push('## Statistics\n');
  fullLines.push(`- **Entities found:** ${entities.length}`);
  fullLines.push(`- **Relations found:** ${relations.length}`);

  return {
    keyEntities,
    keyRelations,
    metrics,
    fullSummary: fullLines.join('\n'),
  };
}

export function SummarizationPage() {
  const [inputText, setInputText] = useState('');
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'summary' | 'entities' | 'relations' | 'metrics'>('summary');

  // Generate summary from extraction result
  const summary = useMemo(() => {
    if (!extractionResult) return null;
    try {
      return generateSummary(extractionResult);
    } catch (err) {
      console.error('[Summarization] Summary generation failed:', err);
      return null;
    }
  }, [extractionResult]);

  // Word counts
  const inputWordCount = useMemo(() => {
    return inputText.split(/\s+/).filter(Boolean).length;
  }, [inputText]);

  const summaryWordCount = useMemo(() => {
    if (!summary) return 0;
    return summary.fullSummary.split(/\s+/).filter(Boolean).length;
  }, [summary]);

  const compressionRatio = useMemo(() => {
    if (inputWordCount === 0 || summaryWordCount === 0) return 0;
    return ((1 - summaryWordCount / inputWordCount) * 100).toFixed(1);
  }, [inputWordCount, summaryWordCount]);

  // Extract text
  const handleExtract = useCallback(async () => {
    if (!inputText.trim()) {
      setError('Please enter some text to analyze');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setExtractionResult(null);

    try {
      const apiUrl = resolveApiUrl();
      console.log('[Summarization] Calling extraction API:', apiUrl);

      const response = await fetch(`${apiUrl}/extract-entities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error || `Extraction failed: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('[Summarization] Extraction result:', result);
      setExtractionResult(result);
    } catch (err) {
      console.error('[Summarization] Extraction error:', err);
      setError(err instanceof Error ? err.message : 'Extraction failed');
    } finally {
      setIsProcessing(false);
    }
  }, [inputText]);

  // Clear results
  const handleClear = useCallback(() => {
    setInputText('');
    setExtractionResult(null);
    setError(null);
  }, []);

  // Sample text for testing
  const handleLoadSample = useCallback(() => {
    setInputText(`The Fellowship of the Ring began their journey from Rivendell. Frodo Baggins, the ring-bearer, was accompanied by his loyal friend Samwise Gamgee. The wizard Gandalf led the company through the treacherous Mines of Moria.

In the darkness beneath the mountains, they encountered the ancient evil known as the Balrog. Gandalf stood against the creature on the Bridge of Khazad-dûm, sacrificing himself so the others could escape.

After emerging from Moria, the Fellowship found refuge in the elven realm of Lothlórien. There, the Lady Galadriel offered counsel and gifts to aid them on their quest. She gave Frodo the Phial of Galadriel, containing the light of Eärendil's star.

The company then traveled down the Great River Anduin by boat. At Amon Hen, Boromir, overcome by the Ring's power, attempted to take it from Frodo. This betrayal led to Frodo's decision to continue alone to Mordor, though Sam insisted on accompanying him.`);
    setError(null);
    setExtractionResult(null);
  }, []);

  return (
    <div className="summarization-page">
      <header className="summarization-page__header">
        <h1>📝 Text Summarization</h1>
        <p>Extract key entities, relationships, and facts from narrative text</p>
      </header>

      <div className="summarization-page__layout">
        {/* Input Panel */}
        <div className="summarization-page__input-panel">
          <div className="summarization-page__panel-header">
            <h2>Source Text</h2>
            <div className="summarization-page__actions">
              <button
                className="summarization-page__btn summarization-page__btn--secondary"
                onClick={handleLoadSample}
                disabled={isProcessing}
              >
                Load Sample
              </button>
              <button
                className="summarization-page__btn summarization-page__btn--secondary"
                onClick={handleClear}
                disabled={isProcessing}
              >
                Clear
              </button>
            </div>
          </div>

          <textarea
            className="summarization-page__textarea"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Paste or type narrative text here..."
            disabled={isProcessing}
          />

          <div className="summarization-page__input-footer">
            <span className="summarization-page__word-count">
              {inputWordCount.toLocaleString()} words
            </span>
            <button
              className="summarization-page__btn summarization-page__btn--primary"
              onClick={handleExtract}
              disabled={isProcessing || !inputText.trim()}
            >
              {isProcessing ? '⏳ Processing...' : '🔍 Analyze & Summarize'}
            </button>
          </div>
        </div>

        {/* Output Panel */}
        <div className="summarization-page__output-panel">
          <div className="summarization-page__panel-header">
            <h2>Summary</h2>
            {summary && (
              <div className="summarization-page__metrics-bar">
                <span title="Summary word count">{summaryWordCount} words</span>
                <span title="Compression ratio">↓ {compressionRatio}%</span>
                <span title="Entities found">👤 {extractionResult?.entities.length || 0}</span>
                <span title="Relations found">🔗 {extractionResult?.relations.length || 0}</span>
              </div>
            )}
          </div>

          {error && (
            <div className="summarization-page__error">
              <span>⚠️</span> {error}
            </div>
          )}

          {!extractionResult && !error && !isProcessing && (
            <div className="summarization-page__empty">
              <div className="summarization-page__empty-icon">📊</div>
              <p>Enter text and click "Analyze & Summarize" to see results</p>
              <p className="summarization-page__hint">
                The system will extract entities, relationships, and facts
              </p>
            </div>
          )}

          {isProcessing && (
            <div className="summarization-page__loading">
              <div className="summarization-page__spinner" />
              <p>Analyzing text...</p>
            </div>
          )}

          {summary && (
            <>
              {/* Tabs */}
              <div className="summarization-page__tabs">
                <button
                  className={`summarization-page__tab ${activeTab === 'summary' ? 'active' : ''}`}
                  onClick={() => setActiveTab('summary')}
                >
                  📄 Summary
                </button>
                <button
                  className={`summarization-page__tab ${activeTab === 'entities' ? 'active' : ''}`}
                  onClick={() => setActiveTab('entities')}
                >
                  👤 Entities
                </button>
                <button
                  className={`summarization-page__tab ${activeTab === 'relations' ? 'active' : ''}`}
                  onClick={() => setActiveTab('relations')}
                >
                  🔗 Relations
                </button>
                <button
                  className={`summarization-page__tab ${activeTab === 'metrics' ? 'active' : ''}`}
                  onClick={() => setActiveTab('metrics')}
                >
                  📊 Metrics
                </button>
              </div>

              {/* Tab Content */}
              <div className="summarization-page__content">
                <SafeMarkdown>
                  {activeTab === 'summary' ? summary.fullSummary
                    : activeTab === 'entities' ? summary.keyEntities
                    : activeTab === 'relations' ? summary.keyRelations
                    : summary.metrics}
                </SafeMarkdown>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default SummarizationPage;
