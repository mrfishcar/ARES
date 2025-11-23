/**
 * Extraction Lab - Phase 0
 * Real-time entity extraction testing UI with wiki generation
 * NOW POWERED BY THE FULL ARES ENGINE
 */

import { useState, useEffect, useCallback } from 'react';
import { CodeMirrorEditor } from '../components/CodeMirrorEditor';
import { EntityResultsPanel } from '../components/EntityResultsPanel';
import { WikiModal } from '../components/WikiModal';
import { isValidEntityType, type EntitySpan, type EntityType } from '../types/entities';
import { initializeTheme, toggleTheme, loadThemePreference } from '../utils/darkMode';
import '../styles/darkMode.css';

interface ExtractionLabProps {
  project: string;
  toast: any;
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
 * Parse manual tags from raw text
 * Supports: #Entity:TYPE, #[Multi Word]:TYPE, Entity:ALIAS_OF_Canonical:TYPE, Entity:REJECT_ENTITY
 * Returns both entities and rejection markers
 */
interface ParsedTags {
  entities: EntitySpan[];
  rejections: Set<string>;  // Words that have been rejected
}

function parseManualTags(rawText: string): ParsedTags {
  const manualEntities: EntitySpan[] = [];
  const rejections = new Set<string>();

  // Match all manual tag formats
  // For REJECT_ENTITY: allow only specific punctuation (.,!?;-) between entity and colon
  const tagRegex = /#\[([^\]]+)\]:(\w+)|#(\w+):(\w+)|(\w+):ALIAS_OF_([^:]+):(\w+)|(\w+)(?:[.,!?;-]*)(?:[.,!?;-]*):REJECT_ENTITY/g;

  let match;
  while ((match = tagRegex.exec(rawText)) !== null) {
    const matchStart = match.index;
    const matchEnd = match.index + match[0].length;

    if (match[1]) {
      // Pattern: #[Multi Word]:TYPE (bracketed form)
      // Keep exactly as typed (including underscores) - user explicitly bracketed it
      const text = match[1];
      const type = match[2].toUpperCase();
      if (isValidEntityType(type as EntityType)) {
        manualEntities.push({
          start: matchStart,
          end: matchEnd,
          text,
          displayText: text,
          type: type as EntityType,
          confidence: 1.0,
          source: 'manual' as const,
        });
      }
    } else if (match[3]) {
      // Pattern: #Entity:TYPE (unbracketed form)
      // Normalize underscores to spaces - they're just a typing convenience
      let text = match[3];
      text = text.replace(/_/g, ' ');  // Normalize underscores to spaces
      const type = match[4].toUpperCase();
      if (isValidEntityType(type as EntityType)) {
        manualEntities.push({
          start: matchStart,
          end: matchEnd,
          text,
          displayText: text,
          type: type as EntityType,
          confidence: 1.0,
          source: 'manual' as const,
        });
      }
    } else if (match[5]) {
      // Pattern: Entity:ALIAS_OF_Canonical:TYPE (alias form)
      // The entity text is the alias form (Entity:ALIAS_OF_...)
      // but we highlight just the entity word part
      // Normalize underscores in the alias entity word since it's unbracketed
      let entityWord = match[5];
      entityWord = entityWord.replace(/_/g, ' ');  // Normalize underscores to spaces
      const type = match[7].toUpperCase();
      if (isValidEntityType(type as EntityType)) {
        manualEntities.push({
          start: matchStart,
          end: matchEnd,
          text: entityWord,
          displayText: entityWord,
          type: type as EntityType,
          confidence: 1.0,
          source: 'manual' as const,
        });
      }
    } else if (match[8]) {
      // Pattern: Entity:REJECT_ENTITY
      // Normalize underscores to spaces
      let rejectedWord = match[8];
      rejectedWord = rejectedWord.replace(/_/g, ' ');

      // Track rejection - use the word as the rejection key (original form)
      rejections.add(match[8].toLowerCase());

      // Also create an entity so the decoration layer can find and replace the entire tag
      manualEntities.push({
        start: matchStart,
        end: matchEnd,
        text: rejectedWord,
        displayText: rejectedWord,
        type: 'REJECT_ENTITY' as EntityType,
        confidence: 1.0,
        source: 'manual' as const,
      });
    }
  }

  return { entities: manualEntities, rejections };
}

/**
 * Find incomplete tag regions in raw text
 * Incomplete tags are: #\w+: or #[...]: without a valid TYPE following
 */
function findIncompleteTagRegions(rawText: string): Array<{ start: number; end: number }> {
  const regions: Array<{ start: number; end: number }> = [];

  // Match incomplete tags: #word: or #[word]: without a valid type after
  // Pattern: # followed by word or bracketed word, then :, but NOT followed by a valid entity type
  const incompleteRegex = /#\[([^\]]+)\]:|#(\w+):/g;

  let match;
  while ((match = incompleteRegex.exec(rawText)) !== null) {
    const tagStart = match.index;
    const tagEnd = match.index + match[0].length;

    // Check what comes after the colon
    const afterColon = rawText.slice(tagEnd);

    // If nothing after colon, or next char is not a word character (incomplete type), mark as incomplete
    if (afterColon.length === 0 || !/^\w+/.test(afterColon)) {
      // This is an incomplete tag - mark the region
      regions.push({ start: tagStart, end: tagEnd });
    }
  }

  return regions;
}

/**
 * Strip text being actively typed as a tag from extraction
 *
 * Rule: Only strip tags that are genuinely INCOMPLETE (no colon or invalid type).
 * Keep complete tags even at EOF or followed by punctuation.
 *
 * Complete tag formats:
 * - #Entity:TYPE
 * - #[Multi Word]:TYPE
 *
 * Examples:
 * - "text #Mount" → strip (no colon, incomplete)
 * - "text #Mount:" → strip (no type)
 * - "text #Mount:PL" → strip (incomplete type)
 * - "text #Mount:PLACE" → KEEP (complete, even at EOF)
 * - "text #Mount:PLACE." → KEEP (complete, punctuation ok)
 * - "text #Mount:PLACE and more" → KEEP (complete tag with more text)
 */
function stripIncompleteTagsForExtraction(rawText: string): string {
  // Find the LAST occurrence of #
  const lastHashIndex = rawText.lastIndexOf('#');

  if (lastHashIndex === -1) {
    // No tags at all
    return rawText;
  }

  // Get everything from the last # onwards
  const lastPart = rawText.slice(lastHashIndex);

  // Check if this last # sequence matches a COMPLETE tag pattern
  // Complete patterns:
  // - #[Multi Word]:TYPE
  // - #Entity:TYPE (unbracketed)
  const completeTagRegex = /^#\[([^\]]+)\]:(\w+)|^#(\w+):(\w+)/;

  if (completeTagRegex.test(lastPart)) {
    // This tag is complete - keep everything
    return rawText;
  }

  // Tag is incomplete (no colon or invalid format) - strip it
  return rawText.slice(0, lastHashIndex);
}

/**
 * Merge manual tags with auto-detected entities
 * Manual tags take precedence over auto-detected (filtering)
 * Rejections filter out auto-detected entities by word
 * Incomplete tags being typed are excluded from highlighting
 *
 * Returns:
 * - Complete manual tags (with valid types) - for highlighting
 * - Auto-detected entities (filtered to exclude overlaps and rejections)
 * - Excludes: incomplete tags, rejected words, overlapping auto-detected
 */
function mergeManualAndAutoEntities(
  autoDetected: EntitySpan[],
  manualTags: EntitySpan[],
  rejections: Set<string>,
  rawText: string
): EntitySpan[] {
  // Find regions with incomplete tags being typed
  const incompleteRegions = findIncompleteTagRegions(rawText);

  // Filter auto-detected: keep those that don't overlap with manual tags, incomplete tags, or aren't rejected
  const nonOverlapping = autoDetected.filter((entity) => {
    // Check if this word has been rejected
    if (rejections.has(entity.text.toLowerCase())) {
      return false;  // Excluded - this word is rejected
    }

    // Check if this position is covered by any manual tag
    for (const manual of manualTags) {
      // If the auto entity position overlaps with a manual tag, skip it
      if (!(entity.end <= manual.start || entity.start >= manual.end)) {
        return false;  // Overlaps with a manual tag, exclude it
      }
    }

    // Check if this position is inside an incomplete tag being typed
    for (const incomplete of incompleteRegions) {
      // If entity is inside an incomplete tag region, skip it
      if (!(entity.end <= incomplete.start || entity.start >= incomplete.end)) {
        return false;  // Overlaps with incomplete tag, exclude it
      }
    }

    return true;  // No overlap, keep it
  });

  // Combine: complete manual tags + filtered auto-detected entities
  // Sort by position in text
  const merged = [...manualTags, ...nonOverlapping];
  return merged.sort((a, b) => a.start - b.start);
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

interface SelectedEntityState {
  name: string;
  type: string;
}

export function ExtractionLab({ project, toast }: ExtractionLabProps) {
  const [text, setText] = useState('');
  const [entities, setEntities] = useState<EntitySpan[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [processing, setProcessing] = useState(false);
  const [stats, setStats] = useState({ time: 0, confidence: 0, count: 0, relationCount: 0 });
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntityState | null>(null);
  const [showHighlighting, setShowHighlighting] = useState(true);
  const [renderMarkdown, setRenderMarkdown] = useState(true);
  const [theme, setTheme] = useState(loadThemePreference());

  // Initialize theme on mount
  useEffect(() => {
    initializeTheme();
  }, []);

  // Handle theme toggle
  const handleThemeToggle = () => {
    const newTheme = toggleTheme();
    setTheme(newTheme);
  };

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
        // Strip incomplete tags before sending to backend
        // This prevents the backend from trying to extract entities from incomplete tag syntax
        // Incomplete tags like "#Cory:" won't be sent, so backend won't try to extract from them
        const textForExtraction = stripIncompleteTagsForExtraction(text);

        // Call ARES engine API (use environment variable for production)
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
        const response = await fetch(`${apiUrl}/extract-entities`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text: textForExtraction }),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || 'Extraction failed');
        }

        // Transform ARES engine output to EntitySpan format with validation
        const extractedEntities: EntitySpan[] = data.entities.flatMap((entity: any) => {
          try {
            // Validate entity type
            if (!isValidEntityType(entity.type)) {
              console.warn(`[ExtractionLab] Skipping entity with invalid type: ${entity.type}, text: ${entity.text}`);
              return [];
            }
            // Create a span for each occurrence of the entity
            return entity.spans.map((span: any) => ({
              start: span.start,
              end: span.end,
              text: entity.text,
              displayText: entity.text,
              type: entity.type as EntityType,
              confidence: entity.confidence,
              source: 'natural' as const,
            }));
          } catch (entityError) {
            console.error('[ExtractionLab] Error processing entity:', { entity, error: entityError });
            return [];
          }
        });

        // Deduplicate: merge overlapping spans
        const deduplicated = deduplicateEntities(extractedEntities);

        // Parse manual tags from the RAW text (not stripped text)
        // This ensures positions match what CodeMirror has
        // mergeManualAndAutoEntities will filter out incomplete tags that are still being typed
        const { entities: manualTags, rejections } = parseManualTags(text);

        // Merge manual tags with auto-detected entities
        // Manual overrides always win over auto-detection
        // Rejections filter out entities by word
        // Note: We pass the raw text for finding incomplete regions
        const mergedEntities = mergeManualAndAutoEntities(deduplicated, manualTags, rejections, text);

        const time = performance.now() - start;
        const avgConfidence =
          mergedEntities.length > 0
            ? mergedEntities.reduce((sum, e) => sum + e.confidence, 0) / mergedEntities.length
            : 0;

        setEntities(mergedEntities);
        setRelations(data.relations || []);
        setStats({
          time: Math.round(time),
          confidence: Math.round(avgConfidence * 100),
          count: mergedEntities.length,
          relationCount: data.relations?.length || 0,
        });

        console.log(`[ARES ENGINE] Extracted ${mergedEntities.length} entities (${deduplicated.length} auto + ${manualTags.length} manual, ${rejections.size} rejected), ${data.relations?.length || 0} relations`);
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

  // Entity handler: Change Type
  // Inserts tag: #Entity:TYPE or #[Multi Word]:TYPE
  // Handles existing tags by replacing them entirely
  const handleChangeType = async (entity: EntitySpan, newType: EntityType) => {
    console.log('[ExtractionLab] Changing entity type:', { entity, newType });

    // Format new tag based on whether entity has spaces
    const newTag = entity.text.includes(' ')
      ? `#[${entity.text}]:${newType}`
      : `#${entity.text}:${newType}`;

    // Check if there's already a tag at this position
    const existingTagMatch = text.slice(entity.start - 1, entity.end + 20).match(
      /^#\[([^\]]+)\]:(\w+)|^#(\w+):(\w+)|^(\w+):ALIAS_OF_([^:]+):(\w+)|^(\w+)(?:[.,!?;-]*):REJECT_ENTITY/
    );

    let newText: string;
    if (existingTagMatch) {
      // Replace the entire existing tag
      const existingTag = existingTagMatch[0];
      const tagEnd = entity.start - 1 + existingTag.length;
      newText = text.slice(0, entity.start - 1) + newTag + text.slice(tagEnd);
    } else {
      // No existing tag, insert at entity position
      newText = text.slice(0, entity.start) + newTag + text.slice(entity.end);
    }

    setText(newText);
    toast.success(`Type changed to ${newType}`);
  };

  // Entity handler: Tag Entity (Alias)
  // Creates alias mapping: Entity:ALIAS_OF_CANONICAL:TYPE
  const handleTagEntity = async (entity: EntitySpan, targetEntity: EntitySpan) => {
    console.log('[ExtractionLab] Tagging entity:', entity);

    // TODO: Show entity search dialog
    // For now, just show info
    toast.info(`Tag entity feature coming soon - select existing entity to create alias`);
  };

  // Entity handler: Create New Entity
  // Inserts tag and creates entity in project
  const handleCreateNew = async (entity: EntitySpan, type: EntityType) => {
    console.log('[ExtractionLab] Creating new entity:', { entity, type });

    // Format tag
    const newTag = entity.text.includes(' ')
      ? `#[${entity.text}]:${type}`
      : `#${entity.text}:${type}`;

    // Check if there's already a tag at this position
    const existingTagMatch = text.slice(entity.start - 1, entity.end + 20).match(
      /^#\[([^\]]+)\]:(\w+)|^#(\w+):(\w+)|^(\w+):ALIAS_OF_([^:]+):(\w+)|^(\w+)(?:[.,!?;-]*):REJECT_ENTITY/
    );

    let newText: string;
    if (existingTagMatch) {
      // Replace the entire existing tag
      const existingTag = existingTagMatch[0];
      const tagEnd = entity.start - 1 + existingTag.length;
      newText = text.slice(0, entity.start - 1) + newTag + text.slice(tagEnd);
    } else {
      // No existing tag, insert at entity position
      newText = text.slice(0, entity.start) + newTag + text.slice(entity.end);
    }

    setText(newText);

    // TODO: Create entity in project DB

    toast.success(`New entity created: ${entity.text}:${type}`);
  };

  // Entity handler: Reject
  // Inserts rejection tag: word:REJECT_ENTITY
  // Handles existing tags by replacing them entirely
  const handleReject = async (entity: EntitySpan) => {
    console.log('[ExtractionLab] Rejecting entity:', entity);

    // Format rejection tag
    const rejectTag = `${entity.text}:REJECT_ENTITY`;

    // Check if there's already a tag at this position
    const existingTagMatch = text.slice(entity.start - 1, entity.end + 20).match(
      /^#\[([^\]]+)\]:(\w+)|^#(\w+):(\w+)|^(\w+):ALIAS_OF_([^:]+):(\w+)|^(\w+)(?:[.,!?;-]*):REJECT_ENTITY/
    );

    let newText: string;
    if (existingTagMatch) {
      // Replace the entire existing tag
      const existingTag = existingTagMatch[0];
      const tagEnd = entity.start - 1 + existingTag.length;
      newText = text.slice(0, entity.start - 1) + rejectTag + text.slice(tagEnd);
    } else {
      // No existing tag, insert at entity position
      newText = text.slice(0, entity.start) + rejectTag + text.slice(entity.end);
    }

    setText(newText);

    // Remove from visible entities
    setEntities((prevEntities) =>
      prevEntities.filter(
        (e) => !(e.start === entity.start && e.end === entity.end && e.text === entity.text)
      )
    );

    toast.info(`"${entity.text}" rejected`);
  };

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
          <button
            onClick={handleThemeToggle}
            className="theme-toggle"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            style={{ marginLeft: '16px' }}
          >
            {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </button>
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
                    checked={!renderMarkdown}
                    onChange={(e) => setRenderMarkdown(!e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  <span>📄 Show Raw Text</span>
                </label>
              </div>
            </div>
          </div>
          {/* Single Editor: CodeMirror with markdown + highlighting */}
          <CodeMirrorEditor
            value={text}
            onChange={(newText) => setText(newText)}
            minHeight="calc(100vh - 280px)"
            disableHighlighting={!showHighlighting}
            enableWYSIWYG={false}
            renderMarkdown={renderMarkdown}
            entities={entities}
            projectId={project}
            onReject={handleReject}
            onChangeType={handleChangeType}
            onTagEntity={handleTagEntity}
            onCreateNew={handleCreateNew}
          />
        </div>

        {/* Right: Results */}
        <EntityResultsPanel
          entities={entities}
          relations={relations}
          onViewWiki={(entityName) => {
            const entity = entities.find(e => e.text === entityName);
            if (entity) {
              setSelectedEntity({ name: entityName, type: entity.type });
            }
          }}
        />
      </div>

      {/* Wiki Modal */}
      {selectedEntity && (
        <WikiModal
          entityName={selectedEntity.name}
          entityType={selectedEntity.type}
          project={project}
          onClose={() => setSelectedEntity(null)}
          extractionContext={{ entities, relations }}
        />
      )}
    </div>
  );
}
