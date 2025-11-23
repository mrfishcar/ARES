# Entity Learning System - Full Implementation Plan

**Status**: Architecture defined, UI menu complete, handlers pending
**Priority**: Critical system enhancement
**Scope**: 4-option context menu + rejection learning + entity tagging

---

## Phase 1: Completed ✅

- [x] Data models defined (DocumentEntityMetadata, RejectionTracking, BlacklistEntry, ProjectSettings)
- [x] EntityContextMenu refactored with 4 options:
  - ⚙️ Change Type
  - 🔗 Tag Entity
  - ✨ Create New Entity
  - ✕ Reject

---

## Phase 2: Handler Implementation (IN PROGRESS)

### 2.1 Handler: Change Type
**Location**: `CodeMirrorEditor.tsx` → `handleChangeType()`

```typescript
async function handleChangeType(type: EntityType) {
  if (!contextMenu || !viewRef.current) return;

  const entity = contextMenu.entity as EntitySpan;

  // 1. Format tag with spaces if needed
  const tag = entity.text.includes(' ')
    ? `#[${entity.text}]:${type}`
    : `#${entity.text}:${type}`;

  // 2. Replace entity text with tag in raw text
  view.dispatch({
    changes: {
      from: entity.start,
      to: entity.end,
      insert: tag,
    }
  });

  // 3. Update document metadata
  setTypeOverrides(prev => ({
    ...prev,
    [entity.text]: type
  }));

  // 4. Track for backend (will be sent on next extraction)

  // 5. Close menu and re-extract
  setContextMenu(null);
  view.focus();
  triggerRe-extraction();
}
```

**Result**: Raw text changes from "Mount Doom" → "#Mount Doom:ORG"

---

### 2.2 Handler: Tag Entity
**Location**: `CodeMirrorEditor.tsx` → `handleTagEntity()`

Opens entity search dialog:
```
┌─────────────────────────┐
│ Search existing entities│
│ ┌─────────────────────┐ │
│ │ "Cory Gilford"      │ │  ← Found in project DB
│ │ "Cory" (alias)      │ │
│ └─────────────────────┘ │
│ [Select]                │
└─────────────────────────┘
```

```typescript
async function handleTagEntity() {
  if (!contextMenu) return;

  const entity = contextMenu.entity as EntitySpan;

  // 1. Show entity search dialog
  const selectedExisting = await showEntitySearchDialog(projectId, entity.text);

  if (!selectedExisting) return;

  // 2. Update document metadata (NO TEXT CHANGE)
  setAliasReferences(prev => ({
    ...prev,
    [entity.text]: `${selectedExisting.canonicalName}:${selectedExisting.type}`
  }));

  // 3. Send to backend for alias creation
  await createAliasMapping({
    projectId,
    shortForm: entity.text,
    canonical: selectedExisting.canonicalName,
    type: selectedExisting.type
  });

  setContextMenu(null);
  triggerRe-extraction();
}
```

**Result**: Raw text stays "Cory", but metadata maps: `{ "Cory": "CORY_GILFORD:PERSON" }`

---

### 2.3 Handler: Create New Entity
**Location**: `CodeMirrorEditor.tsx` → `handleCreateNew(type)`

```typescript
async function handleCreateNew(type: EntityType) {
  if (!contextMenu || !viewRef.current) return;

  const entity = contextMenu.entity as EntitySpan;

  // 1. Format tag
  const tag = entity.text.includes(' ')
    ? `#[${entity.text}]:${type}`
    : `#${entity.text}:${type}`;

  // 2. Insert tag in raw text
  view.dispatch({
    changes: {
      from: entity.start,
      to: entity.end,
      insert: tag,
    }
  });

  // 3. Remove from blacklist if present
  await removeFromBlacklist({
    projectId,
    word: entity.text
  });

  // 4. Send to backend to create entity
  const newEntity = await createProjectEntity({
    projectId,
    text: entity.text,
    type: type,
    source: 'manual'
  });

  // 5. Update document metadata
  setTypeOverrides(prev => ({
    ...prev,
    [entity.text]: type
  }));

  setContextMenu(null);
  view.focus();
  triggerRe-extraction();
}
```

**Result**: Raw text changes + new entity created in project database

---

### 2.4 Handler: Reject
**Location**: `CodeMirrorEditor.tsx` → `handleReject()`

```typescript
async function handleReject() {
  if (!contextMenu || !viewRef.current) return;

  const entity = contextMenu.entity as EntitySpan;

  // 1. Add to document-level rejections
  setRejectedMentions(prev => [
    ...prev,
    entity.text
  ]);

  // 2. Send rejection to backend
  const rejection = await trackEntityRejection({
    projectId,
    documentId,
    word: entity.text
  });

  // 3. If threshold hit (2+ rejections), show feedback
  if (rejection.rejectionCount >= 2) {
    toast.info(`"${entity.text}" added to project blacklist`);
  }

  // 4. Close menu
  setContextMenu(null);
  view.focus();

  // 5. Re-extract (word will be filtered out)
  triggerRe-extraction();
}
```

**Result**: Word excluded from this document + tracked globally for project

---

## Phase 3: Backend Integration (PENDING)

### 3.1 Update `/extract-entities` Endpoint

**Current**:
```typescript
POST /extract-entities
{ text: string }
```

**New**:
```typescript
POST /extract-entities
{
  text: string;
  projectId: string;
  documentId: string;
  manualTags?: EntitySpan[];
  typeOverrides?: Record<string, EntityType>;
  aliasReferences?: Record<string, string>;
  rejectedMentions?: string[];
}
```

**Implementation** in `app/storage/storage.ts` (orchestrator call):
```typescript
async function extractEntities(request: ExtractEntityRequest) {
  const { text, projectId, manualTags, typeOverrides, aliasReferences, rejectedMentions } = request;

  // 1. Get project blacklist
  const project = await getProject(projectId);
  const activeBlacklist = project.entityBlacklist
    .filter(w => w.status === 'active')
    .map(w => w.word.toLowerCase());

  // 2. Parse manual tags
  const { entities: parsedTags } = parseInlineTags(text);

  // 3. Auto-detect entities
  let detected = await spaCyNER(text);
  detected = await patternLibrary.match(text);

  // 4. APPLY REJECTIONS (this document)
  detected = detected.filter(e =>
    !rejectedMentions?.includes(e.text)
  );

  // 5. APPLY BLACKLIST (project-wide)
  detected = detected.filter(e =>
    !activeBlacklist.includes(e.text.toLowerCase())
  );

  // 6. Apply type overrides
  for (const [text, overrideType] of Object.entries(typeOverrides || {})) {
    const entity = detected.find(e => e.text === text);
    if (entity) entity.type = overrideType;
  }

  // 7. Resolve aliases
  for (const [shortForm, canonical] of Object.entries(aliasReferences || {})) {
    // Create mapping in DB
  }

  // 8. Merge manual + detected
  const merged = [...parsedTags, ...detected];

  // 9. Save to project KB
  await updateProjectEntities(projectId, merged);

  return merged;
}
```

---

### 3.2 Rejection Tracking System

**Function**: `handleEntityRejection()` in `app/storage/storage.ts`

```typescript
async function handleEntityRejection(
  projectId: string,
  documentId: string,
  word: string
) {
  const project = await getProject(projectId);

  // 1. Find or create tracking entry
  let tracking = project.rejectionTracking.find(
    t => t.word.toLowerCase() === word.toLowerCase()
  );

  if (!tracking) {
    tracking = {
      word,
      rejectionCount: 1,
      rejectedInDocuments: [documentId],
      lastRejected: new Date()
    };
    project.rejectionTracking.push(tracking);
  } else {
    tracking.rejectionCount++;
    if (!tracking.rejectedInDocuments.includes(documentId)) {
      tracking.rejectedInDocuments.push(documentId);
    }
    tracking.lastRejected = new Date();
  }

  // 2. Check threshold (2 rejections)
  if (tracking.rejectionCount >= 2) {
    // Check if already blacklisted
    const existing = project.entityBlacklist.find(
      b => b.word.toLowerCase() === word.toLowerCase()
    );

    if (!existing) {
      project.entityBlacklist.push({
        word: tracking.word,
        reason: 'auto-rejected-threshold',
        rejectionCount: tracking.rejectionCount,
        addedDate: new Date(),
        status: 'active'
      });
    }
  }

  // 3. Save updated project
  await updateProject(projectId, project);

  return {
    rejectionCount: tracking.rejectionCount,
    autoBlacklisted: tracking.rejectionCount >= 2
  };
}
```

---

### 3.3 Entity Creation with Blacklist Removal

**Function**: `createProjectEntity()` in `app/storage/storage.ts`

```typescript
async function createProjectEntity(
  projectId: string,
  text: string,
  type: EntityType,
  source: 'manual' | 'auto-detected'
) {
  const project = await getProject(projectId);

  // 1. Create entity in DB
  const newEntity = {
    id: generateId(),
    projectId,
    canonicalName: text,
    type,
    aliases: [],
    typeHistory: [{
      type,
      source,
      confidence: 1.0,
      timestamp: new Date()
    }]
  };

  project.entities.push(newEntity);

  // 2. Remove from blacklist if present
  const blacklistEntry = project.entityBlacklist.find(
    b => b.word.toLowerCase() === text.toLowerCase()
  );
  if (blacklistEntry) {
    blacklistEntry.status = 'removed';  // Keep history
  }

  // 3. Clear rejection tracking for this word
  project.rejectionTracking = project.rejectionTracking.filter(
    t => t.word.toLowerCase() !== text.toLowerCase()
  );

  // 4. Save
  await updateProject(projectId, project);

  return newEntity;
}
```

---

## Phase 4: Frontend Integration (PENDING)

### 4.1 Update ExtractionLab to send metadata

```typescript
async function extractAndDisplay(text: string) {
  // 1. Get current document metadata
  const request: ExtractEntityRequest = {
    text,
    projectId,
    documentId,
    manualTags: documentMetadata.manualTags,
    typeOverrides: documentMetadata.typeOverrides,
    aliasReferences: documentMetadata.aliasReferences,
    rejectedMentions: documentMetadata.rejectedMentions
  };

  // 2. Call enhanced endpoint
  const response = await fetch(`${apiUrl}/extract-entities`, {
    method: 'POST',
    body: JSON.stringify(request)
  });

  // 3. Display results
  const entities = await response.json();
  setEntities(entities);
}
```

---

### 4.2 Text Selection + Manual Creation

Right-click on highlighted text → "Create Entity" (future enhancement)

---

## Testing Strategy

- [ ] Unit tests for each handler
- [ ] Backend rejection tracking
- [ ] Blacklist filtering
- [ ] Entity creation removes from blacklist
- [ ] Alias mapping works correctly
- [ ] Type overrides persist
- [ ] No text corruption on multi-word entities

---

## Success Criteria

✅ User can change entity type via dropdown → tag inserted in raw text
✅ User can tag entity to existing → metadata updated, no text change
✅ User can create new entity → tag inserted + entity created in DB
✅ User can reject entity → tracked globally, auto-blacklist after 2 rejections
✅ Rejected words filtered from extraction
✅ Creating new entity removes from blacklist
✅ Document changes saved with entity metadata
✅ All 4 operations persist and inform future extractions

---

## Next Steps

1. **Implement handlers** in CodeMirrorEditor (Change Type, Tag Entity, Create New, Reject)
2. **Update endpoint** to accept new parameters
3. **Implement rejection tracking** in backend
4. **Test handlers** with real data
5. **Add blacklist management UI** (query, remove, view)
6. **Add text selection** entity creation

