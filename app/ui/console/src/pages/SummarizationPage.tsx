/**
 * Summarization Page
 * Task 1.2.1-1.2.5: Summarization Testing Feature
 *
 * Allows users to input text and see extraction-based summary
 * Uses IR system to generate structured summaries
 */

import React, { useState, useMemo, useCallback } from 'react';
import Markdown from 'markdown-to-jsx';
import { useIRAdapter, ExtractionResult } from '../hooks/useIRAdapter';
import type { ProjectIR } from '@engine/ir/types';
import './SummarizationPage.css';

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

interface SummaryResult {
  keyEntities: string;
  keyEvents: string;
  metrics: string;
  fullSummary: string;
}

/**
 * Generate IR-based summary from ProjectIR
 */
function generateIRBasedSummary(ir: ProjectIR): SummaryResult {
  const lines: string[] = [];

  // Key Entities Section
  const entityLines: string[] = ['## Key Characters & Entities\n'];
  const topEntities = [...ir.entities]
    .sort((a, b) => (b.evidence?.length || 0) - (a.evidence?.length || 0))
    .slice(0, 10);

  if (topEntities.length === 0) {
    entityLines.push('*No entities extracted*\n');
  } else {
    for (const entity of topEntities) {
      const emoji = getEntityEmoji(entity.type);
      const mentions = entity.evidence?.length || 0;
      entityLines.push(`- ${emoji} **${entity.canonical}** (${entity.type}) — ${mentions} mention${mentions !== 1 ? 's' : ''}`);
    }
  }
  const keyEntities = entityLines.join('\n');

  // Key Events Section
  const eventLines: string[] = ['## Key Events\n'];
  const sortedEvents = [...ir.events]
    .sort((a, b) => {
      const aTime = a.time.type === 'DISCOURSE' ? (a.time.paragraph || 0) : 0;
      const bTime = b.time.type === 'DISCOURSE' ? (b.time.paragraph || 0) : 0;
      return aTime - bTime;
    })
    .slice(0, 10);

  if (sortedEvents.length === 0) {
    eventLines.push('*No events extracted*\n');
  } else {
    for (const event of sortedEvents) {
      const participants = event.participants
        .map(p => {
          const entity = ir.entities.find(e => e.id === p.entity);
          return entity?.canonical || p.entity;
        })
        .join(', ');
      eventLines.push(`- **${event.type}**: ${participants || 'Unknown participants'}`);
    }
  }
  const keyEvents = eventLines.join('\n');

  // Metrics Section - inline calculation
  const metricsLines: string[] = ['## Extraction Metrics\n'];
  metricsLines.push(`- **Total Entities:** ${ir.entities.length}`);
  metricsLines.push(`- **Total Events:** ${ir.events.length}`);
  metricsLines.push(`- **Total Assertions:** ${ir.assertions.length}`);

  // Entity type breakdown
  const typeCounts: Record<string, number> = {};
  for (const entity of ir.entities) {
    typeCounts[entity.type] = (typeCounts[entity.type] || 0) + 1;
  }
  metricsLines.push('\n### Entity Types');
  for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    metricsLines.push(`- ${type}: ${count}`);
  }
  const metricsReport = metricsLines.join('\n');

  // Full Summary
  lines.push('# Text Summary\n');
  lines.push(keyEntities);
  lines.push('\n');
  lines.push(keyEvents);
  lines.push('\n');
  lines.push('## Statistics\n');
  lines.push(`- **Entities found:** ${ir.entities.length}`);
  lines.push(`- **Events detected:** ${ir.events.length}`);
  lines.push(`- **Facts extracted:** ${ir.assertions.length}`);

  return {
    keyEntities,
    keyEvents,
    metrics: metricsReport,
    fullSummary: lines.join('\n'),
  };
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

export function SummarizationPage() {
  const [inputText, setInputText] = useState('');
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'summary' | 'entities' | 'events' | 'metrics'>('summary');

  // Convert extraction to IR
  const ir = useIRAdapter(extractionResult, 'summarization-doc');

  // Generate summary from IR
  const summary = useMemo(() => {
    if (!ir) return null;
    return generateIRBasedSummary(ir);
  }, [ir]);

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
        <p>Extract key entities, events, and facts from narrative text</p>
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
                <span title="Entities found">👤 {ir?.entities.length || 0}</span>
                <span title="Events found">📅 {ir?.events.length || 0}</span>
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
                The system will extract entities, events, and relationships
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
                  className={`summarization-page__tab ${activeTab === 'events' ? 'active' : ''}`}
                  onClick={() => setActiveTab('events')}
                >
                  📅 Events
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
                <Markdown>
                  {activeTab === 'summary' && summary.fullSummary}
                  {activeTab === 'entities' && summary.keyEntities}
                  {activeTab === 'events' && summary.keyEvents}
                  {activeTab === 'metrics' && summary.metrics}
                </Markdown>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default SummarizationPage;
