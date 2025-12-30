# TASK 001: Lab Wiki Integration

**Priority:** IMMEDIATE
**Estimated Time:** 1-2 weeks
**Dependencies:** None
**Status:** PENDING

---

## Objective

Update the Extraction Lab (`/lab`) to display wiki-style entity pages when users click on extracted entities. This demonstrates the IR system's rendering capabilities.

## Success Criteria

- [ ] Clicking an entity in extraction results opens wiki panel
- [ ] Wiki panel shows full entity page (title, facts, relationships, timeline)
- [ ] Entity type badges display correctly (👤, 📍, 🎭, etc.)
- [ ] Cross-links between entities are clickable
- [ ] Timeline view is accessible via tab
- [ ] All existing tests still pass

## Implementation Steps

### Step 1: Create IR Adapter Hook

**File:** `app/ui/console/src/hooks/useIRAdapter.ts`

```typescript
import { useMemo } from 'react';
import { adaptLegacyExtraction } from '../../../engine/ir/adapter';
import type { ProjectIR } from '../../../engine/ir/types';

interface ExtractionResult {
  entities: any[];
  relations: any[];
  spans: any[];
  docId?: string;
}

export function useIRAdapter(
  extraction: ExtractionResult | null,
  docId: string = 'default'
): ProjectIR | null {
  return useMemo(() => {
    if (!extraction) return null;

    try {
      return adaptLegacyExtraction({
        entities: extraction.entities,
        relations: extraction.relations,
        docId,
        fullText: '', // Will be populated
      });
    } catch (error) {
      console.error('IR adaptation failed:', error);
      return null;
    }
  }, [extraction, docId]);
}
```

**Tests:** Add `useIRAdapter.test.ts` with mocked extraction data.

**Commit:** `feat(ui): Add useIRAdapter hook for extraction-to-IR conversion`

---

### Step 2: Create Wiki Panel Component

**File:** `app/ui/console/src/components/WikiPanel.tsx`

```typescript
import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { renderEntityPage, renderItemPage, renderPlacePage } from '../../../engine/ir';
import type { ProjectIR, EntityId } from '../../../engine/ir/types';

interface WikiPanelProps {
  ir: ProjectIR;
  selectedEntityId: EntityId | null;
  onEntityClick: (entityId: EntityId) => void;
  onClose: () => void;
}

export function WikiPanel({ ir, selectedEntityId, onEntityClick, onClose }: WikiPanelProps) {
  const [activeTab, setActiveTab] = useState<'wiki' | 'timeline'>('wiki');

  const entity = useMemo(() => {
    if (!selectedEntityId) return null;
    return ir.entities.find(e => e.id === selectedEntityId);
  }, [ir, selectedEntityId]);

  const wikiContent = useMemo(() => {
    if (!entity) return '';

    // Choose renderer based on entity type
    switch (entity.type) {
      case 'ITEM':
        return renderItemPage(ir, entity.id);
      case 'PLACE':
        return renderPlacePage(ir, entity.id);
      default:
        return renderEntityPage(ir, entity.id);
    }
  }, [ir, entity]);

  if (!entity) {
    return (
      <div className="wiki-panel wiki-panel--empty">
        <p>Select an entity to view its wiki page</p>
      </div>
    );
  }

  // Handle cross-link clicks
  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const href = e.currentTarget.getAttribute('href');
    if (href?.startsWith('entity_')) {
      e.preventDefault();
      onEntityClick(href);
    }
  };

  return (
    <div className="wiki-panel">
      <div className="wiki-panel__header">
        <div className="wiki-panel__tabs">
          <button
            className={activeTab === 'wiki' ? 'active' : ''}
            onClick={() => setActiveTab('wiki')}
          >
            Wiki
          </button>
          <button
            className={activeTab === 'timeline' ? 'active' : ''}
            onClick={() => setActiveTab('timeline')}
          >
            Timeline
          </button>
        </div>
        <button className="wiki-panel__close" onClick={onClose}>×</button>
      </div>

      <div className="wiki-panel__content">
        <ReactMarkdown
          components={{
            a: ({ href, children }) => (
              <a href={href} onClick={handleLinkClick}>
                {children}
              </a>
            ),
          }}
        >
          {wikiContent}
        </ReactMarkdown>
      </div>
    </div>
  );
}
```

**Styles:** Add CSS for `.wiki-panel` with sidebar layout, tabs, scrolling.

**Commit:** `feat(ui): Add WikiPanel component for entity wiki display`

---

### Step 3: Integrate into ExtractionLab

**File:** `app/ui/console/src/pages/ExtractionLab.tsx`

Modify the existing ExtractionLab to:

1. Import and use `useIRAdapter` hook
2. Add state for selected entity
3. Render WikiPanel as collapsible sidebar
4. Wire entity clicks to panel selection

```typescript
// Add to ExtractionLab.tsx

const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
const [showWikiPanel, setShowWikiPanel] = useState(false);

// Convert extraction to IR
const ir = useIRAdapter(extractionResult, 'lab-doc');

// Handle entity click in results
const handleEntityClick = (entityId: string) => {
  setSelectedEntityId(entityId);
  setShowWikiPanel(true);
};

// In render:
{showWikiPanel && ir && (
  <WikiPanel
    ir={ir}
    selectedEntityId={selectedEntityId}
    onEntityClick={setSelectedEntityId}
    onClose={() => setShowWikiPanel(false)}
  />
)}
```

**Commit:** `feat(ui): Integrate WikiPanel into ExtractionLab`

---

### Step 4: Add Entity Type Filter

**File:** `app/ui/console/src/components/WikiPanel.tsx`

Add dropdown to filter entities by type:

```typescript
const [typeFilter, setTypeFilter] = useState<string | null>(null);

const filteredEntities = useMemo(() => {
  if (!typeFilter) return ir.entities;
  return ir.entities.filter(e => e.type === typeFilter);
}, [ir.entities, typeFilter]);

// Add filter dropdown in header
<select value={typeFilter || ''} onChange={e => setTypeFilter(e.target.value || null)}>
  <option value="">All Types</option>
  <option value="PERSON">👤 Person</option>
  <option value="PLACE">📍 Place</option>
  <option value="ITEM">🎭 Item</option>
  <option value="ORG">🏛️ Organization</option>
</select>
```

**Commit:** `feat(ui): Add entity type filter to WikiPanel`

---

### Step 5: Add Timeline View Tab

Use `renderTimeline` for timeline tab:

```typescript
import { renderTimeline, queryTimeline } from '../../../engine/ir';

// In timeline tab:
const timelineContent = useMemo(() => {
  if (!entity) return '';

  const result = queryTimeline(ir.events, {
    entityId: entity.id,
  });

  if (result.events.length === 0) {
    return 'No events found for this entity.';
  }

  return renderTimeline(ir, {
    filter: { entityId: entity.id },
  });
}, [ir, entity]);
```

**Commit:** `feat(ui): Add timeline view tab to WikiPanel`

---

## Testing Checklist

- [ ] Unit tests for useIRAdapter hook
- [ ] Component tests for WikiPanel
- [ ] Integration test: extraction → IR → wiki render
- [ ] All 507 IR tests still passing
- [ ] All existing UI tests still passing
- [ ] Manual testing in browser

## Files to Create/Modify

| File | Action |
|------|--------|
| `hooks/useIRAdapter.ts` | CREATE |
| `hooks/useIRAdapter.test.ts` | CREATE |
| `components/WikiPanel.tsx` | CREATE |
| `components/WikiPanel.css` | CREATE |
| `pages/ExtractionLab.tsx` | MODIFY |

## Notes for Sonnet

1. Read existing ExtractionLab code first
2. Check what extraction result structure looks like
3. Use existing react-markdown if installed, or add it
4. Follow existing code style in console/src
5. Test manually at http://localhost:5173/lab

---

**END OF TASK**
