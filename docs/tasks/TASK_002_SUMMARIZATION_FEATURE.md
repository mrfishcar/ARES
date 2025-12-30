# TASK 002: Summarization Testing Feature

**Priority:** IMMEDIATE
**Estimated Time:** 1-2 weeks
**Dependencies:** None (can run parallel to Task 001)
**Status:** PENDING

---

## Objective

Create a new page in the ARES console for testing summarization capability. Users can input text and see summarization output. This demonstrates the ARES backend's ability to process and condense narrative text.

## Success Criteria

- [ ] New `/summarize` route accessible from navigation
- [ ] Text input area for pasting source text
- [ ] Summary output display area
- [ ] Summary metrics (word count, compression ratio)
- [ ] Key entities extracted from summary
- [ ] All existing tests still pass

## Discovery Phase

First, find and understand existing summarization code:

```bash
# Search for summarization-related code
grep -r "summar" app/engine/ --include="*.ts"
grep -r "abstract" app/engine/ --include="*.ts"
grep -r "condense" app/engine/ --include="*.ts"
```

Document what you find before proceeding.

## Implementation Steps

### Step 1: Create SummarizationPage Skeleton

**File:** `app/ui/console/src/pages/SummarizationPage.tsx`

```typescript
import React, { useState } from 'react';
import './SummarizationPage.css';

export function SummarizationPage() {
  const [inputText, setInputText] = useState('');
  const [summary, setSummary] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSummarize = async () => {
    if (!inputText.trim()) {
      setError('Please enter some text to summarize');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // TODO: Wire to actual summarizer
      const result = await summarizeText(inputText);
      setSummary(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Summarization failed');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="summarization-page">
      <h1>Summarization Testing</h1>

      <div className="summarization-page__layout">
        {/* Input Panel */}
        <div className="summarization-page__input">
          <h2>Source Text</h2>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Paste or type text to summarize..."
            rows={20}
          />
          <div className="summarization-page__input-stats">
            Words: {inputText.split(/\s+/).filter(Boolean).length}
          </div>
        </div>

        {/* Controls */}
        <div className="summarization-page__controls">
          <button
            onClick={handleSummarize}
            disabled={isProcessing || !inputText.trim()}
          >
            {isProcessing ? 'Processing...' : 'Summarize'}
          </button>
        </div>

        {/* Output Panel */}
        <div className="summarization-page__output">
          <h2>Summary</h2>
          {error && <div className="error">{error}</div>}
          {summary && (
            <>
              <div className="summary-text">{summary}</div>
              <SummaryMetrics input={inputText} summary={summary} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Metrics component
function SummaryMetrics({ input, summary }: { input: string; summary: string }) {
  const inputWords = input.split(/\s+/).filter(Boolean).length;
  const summaryWords = summary.split(/\s+/).filter(Boolean).length;
  const compression = ((1 - summaryWords / inputWords) * 100).toFixed(1);

  return (
    <div className="summary-metrics">
      <div className="metric">
        <span className="metric-label">Input Words:</span>
        <span className="metric-value">{inputWords}</span>
      </div>
      <div className="metric">
        <span className="metric-label">Summary Words:</span>
        <span className="metric-value">{summaryWords}</span>
      </div>
      <div className="metric">
        <span className="metric-label">Compression:</span>
        <span className="metric-value">{compression}%</span>
      </div>
    </div>
  );
}
```

**Commit:** `feat(ui): Add SummarizationPage skeleton`

---

### Step 2: Create Summarization Service

**File:** `app/ui/console/src/services/summarization.ts`

Locate and integrate existing summarization:

```typescript
// This will depend on what you find in the codebase
// Option A: Direct function import
import { summarize } from '../../../engine/summarization';

// Option B: API call
async function summarizeViaAPI(text: string): Promise<string> {
  const response = await fetch('/api/summarize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const data = await response.json();
  return data.summary;
}

// Option C: IR-based summary (entities + key events)
import { adaptLegacyExtraction } from '../../../engine/ir/adapter';
import { buildEvents } from '../../../engine/ir/event-builder';

async function summarizeViaIR(text: string): Promise<string> {
  // Extract entities and events
  // Build summary from key events
}

export async function summarizeText(
  text: string,
  options?: { maxLength?: number }
): Promise<string> {
  // Use discovered implementation
}
```

**Commit:** `feat(ui): Add summarization service integration`

---

### Step 3: Add Entity Highlighting

Show key entities extracted from the summary:

```typescript
import { useIRAdapter } from '../hooks/useIRAdapter';

// In SummarizationPage:
const ir = useIRAdapter({ entities: [], relations: [], spans: [] });

// Extract entities from summary text
const summaryEntities = useMemo(() => {
  if (!summary || !ir) return [];
  return ir.entities.filter(e =>
    summary.toLowerCase().includes(e.canonical.toLowerCase())
  );
}, [summary, ir]);

// Display entity chips
<div className="summary-entities">
  <h3>Key Entities</h3>
  {summaryEntities.map(entity => (
    <EntityChip key={entity.id} entity={entity} />
  ))}
</div>
```

**Commit:** `feat(ui): Add entity highlighting to summary`

---

### Step 4: Add Comparison Mode

Compare different summary lengths:

```typescript
const [summaryLength, setSummaryLength] = useState<'short' | 'medium' | 'long'>('medium');

// Generate multiple summaries
const [summaries, setSummaries] = useState<{
  short: string | null;
  medium: string | null;
  long: string | null;
}>({ short: null, medium: null, long: null });

const handleSummarizeAll = async () => {
  setIsProcessing(true);
  try {
    const [short, medium, long] = await Promise.all([
      summarizeText(inputText, { maxLength: 50 }),
      summarizeText(inputText, { maxLength: 150 }),
      summarizeText(inputText, { maxLength: 300 }),
    ]);
    setSummaries({ short, medium, long });
  } finally {
    setIsProcessing(false);
  }
};

// Comparison view
<div className="summary-comparison">
  <div className="summary-column">
    <h3>Short ({summaries.short?.split(/\s+/).length || 0} words)</h3>
    <p>{summaries.short}</p>
  </div>
  <div className="summary-column">
    <h3>Medium ({summaries.medium?.split(/\s+/).length || 0} words)</h3>
    <p>{summaries.medium}</p>
  </div>
  <div className="summary-column">
    <h3>Long ({summaries.long?.split(/\s+/).length || 0} words)</h3>
    <p>{summaries.long}</p>
  </div>
</div>
```

**Commit:** `feat(ui): Add summary comparison mode`

---

### Step 5: Add Route and Navigation

**File:** `app/ui/console/src/App.tsx`

```typescript
import { SummarizationPage } from './pages/SummarizationPage';

// Add route
<Route path="/summarize" element={<SummarizationPage />} />

// Add navigation link
<NavLink to="/summarize">Summarize</NavLink>
```

**Commit:** `feat(ui): Add summarization route and navigation`

---

## CSS Styles

**File:** `app/ui/console/src/pages/SummarizationPage.css`

```css
.summarization-page {
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

.summarization-page__layout {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 2rem;
  align-items: start;
}

.summarization-page__input textarea,
.summarization-page__output .summary-text {
  width: 100%;
  min-height: 400px;
  padding: 1rem;
  font-family: inherit;
  font-size: 1rem;
  border: 1px solid #ccc;
  border-radius: 8px;
}

.summarization-page__controls {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-top: 2rem;
}

.summarization-page__controls button {
  padding: 0.75rem 2rem;
  font-size: 1rem;
  background: #0066cc;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.summarization-page__controls button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.summary-metrics {
  display: flex;
  gap: 2rem;
  margin-top: 1rem;
  padding: 1rem;
  background: #f5f5f5;
  border-radius: 4px;
}

.metric {
  display: flex;
  flex-direction: column;
}

.metric-label {
  font-size: 0.875rem;
  color: #666;
}

.metric-value {
  font-size: 1.25rem;
  font-weight: bold;
}

.summary-comparison {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}

.summary-column {
  padding: 1rem;
  background: #f9f9f9;
  border-radius: 8px;
}
```

---

## Testing Checklist

- [ ] Route /summarize loads correctly
- [ ] Text input works
- [ ] Summarization runs without errors
- [ ] Metrics display correctly
- [ ] Comparison mode works
- [ ] Navigation works
- [ ] All existing tests pass

## Files to Create/Modify

| File | Action |
|------|--------|
| `pages/SummarizationPage.tsx` | CREATE |
| `pages/SummarizationPage.css` | CREATE |
| `services/summarization.ts` | CREATE |
| `App.tsx` | MODIFY (add route) |

## Notes for Sonnet

1. **First**: Search for existing summarization code in the engine
2. Document what you find before implementing
3. If no summarizer exists, create a simple IR-based one:
   - Extract entities and events
   - Return key events as bullet points
4. Use existing UI patterns from other pages
5. Test manually at http://localhost:5173/summarize

## Fallback: IR-Based Summary

If no dedicated summarizer exists, create one:

```typescript
export function generateIRSummary(ir: ProjectIR): string {
  const lines: string[] = [];

  // Key entities
  const topEntities = ir.entities
    .sort((a, b) => b.evidence.length - a.evidence.length)
    .slice(0, 5);

  lines.push('**Key Characters:**');
  for (const entity of topEntities) {
    lines.push(`- ${entity.canonical} (${entity.type})`);
  }

  // Key events
  lines.push('\n**Key Events:**');
  const events = ir.events
    .sort((a, b) => compareDiscourseTime(a.time, b.time))
    .slice(0, 10);

  for (const event of events) {
    const participants = event.participants
      .map(p => getEntityName(ir, p.entity))
      .join(', ');
    lines.push(`- ${event.type}: ${participants}`);
  }

  return lines.join('\n');
}
```

---

**END OF TASK**
