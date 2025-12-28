/**
 * Extraction Lab - Phase 1 Refactor
 * Real-time entity extraction testing UI with wiki generation
 * NOW POWERED BY THE FULL ARES ENGINE
 *
 * Clean architecture with extracted components and hooks
 */

import { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Menu } from 'lucide-react';
import { LabToolbar } from '../components/LabToolbar';
import { DocumentsSidebar } from '../components/DocumentsSidebar';
import { EditorPane } from '../components/EditorPane';
import { EntityModal } from '../components/EntityModal';
import { WikiModal } from '../components/WikiModal';
import { FloatingActionButton } from '../components/FloatingActionButton';
import { EntityReviewSidebar } from '../components/EntityReviewSidebar';
import type { FormattingActions, NavigateToRange } from '../components/CodeMirrorEditorProps';
import { isValidEntityType, mapExtractionResponseToSpans, type EntitySpan, type EntityType } from '../types/entities';
import { initializeTheme, toggleTheme, loadThemePreference, getEffectiveTheme } from '../utils/darkMode';
import { useLabLayoutState } from '../hooks/useLabLayoutState';
import { useExtractionSettings } from '../hooks/useExtractionSettings';
import { useAutoLongExtraction } from '../hooks/useAutoLongExtraction';
import { useKeyboardViewportOffset } from '../hooks/useKeyboardViewportOffset';
import type { SerializedEditorState } from 'lexical';
import { RichEditorPane } from '../editor2/RichEditorPane';
import type { BlockIndexEntry, PosMapEntry, RichDocSnapshot } from '../editor2/types';
import { snapshotRichDoc } from '../editor2/flattenRichDoc';
import { computeDocVersion } from '../editor2/hash';
import '../styles/darkMode.css';
import '../styles/extraction-lab.css';
import type { CSSProperties } from 'react';

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

type JobStatus = 'queued' | 'running' | 'done' | 'failed';

type SpanKey = string;

interface ExtractionStats {
  time: number;
  confidence: number;
  count: number;
  relationCount: number;
}

function makeSpanKey(e: EntitySpan): SpanKey {
  return `${e.start}:${e.end}:${e.text}`;
}

interface EntityOverrides {
  rejectedSpans: Set<SpanKey>;
  typeOverrides: Record<SpanKey, EntityType>;
}

interface ExtractionResponse {
  success: boolean;
  entities: Array<{
    id: string;
    text?: string;
    canonical?: string;
    type: string;
    confidence?: number;
    spans?: Array<{ start: number; end: number; text?: string; source?: string; mentionId?: string; mentionType?: string }>;
    aliases?: string[];
    source?: string;
  }>;
  spans?: Array<{
    entityId: string;
    start: number;
    end: number;
    text?: string;
    source?: string;
    mentionId?: string;
    mentionType?: string;
  }>;
  relations: Array<{
    id: string;
    subj: string;
    obj: string;
    pred: string;
    confidence: number;
    subjCanonical: string;
    objCanonical: string;
  }>;
  stats?: {
    extractionTime?: number;
    entityCount?: number;
    relationCount?: number;
    booknlpCharacters?: number;
  };
  fictionEntities?: any[];
  booknlp?: {
    characters: any[];
    mentions: any[];
    quotes: any[];
    coref_chains: any[];
    coref_links?: any[];
    metadata?: any;
  };
}

interface StoredDocument {
  id: string;
  title: string;
  text: string;
  richDoc?: SerializedEditorState | null;
  posMap?: PosMapEntry[];
  docVersion?: string;
  blockIndex?: BlockIndexEntry[];
  extractionJson?: any;
  extraction?: any;
  createdAt: string;
  updatedAt: string;
}

const JOB_POLL_INTERVAL_MS = 1500;
const SYNC_EXTRACTION_CHAR_LIMIT = 20000;
const LONG_TEXT_AUTO_THRESHOLD = 20000;
const LONG_TEXT_IDLE_DEBOUNCE_MS = 1200;

function estimateJobDurationMs(textLength: number): number {
  const baseMs = 8000;
  const extraMs = Math.floor(textLength / 5000) * 1000;
  const estimated = baseMs + extraMs;
  return Math.min(90000, Math.max(10000, estimated));
}

function colorFromId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue}, 65%, 70%)`;
}

interface JobProgressBarProps {
  jobStatus: JobStatus | null;
  jobProgress: number;
  jobEtaSeconds: number | null;
}

const JobProgressBar = ({ jobStatus, jobProgress, jobEtaSeconds }: JobProgressBarProps) => {
  if (!jobStatus || (jobStatus !== 'queued' && jobStatus !== 'running')) {
    return null;
  }

  const pct = Math.max(0, Math.min(100, jobProgress || 0));
  const etaText =
    jobEtaSeconds == null
      ? 'Estimating…'
      : jobEtaSeconds <= 0
        ? 'Finishing up…'
        : `≈ ${jobEtaSeconds}s remaining`;

  return (
    <div className="job-progress-wrapper" aria-label="Extraction progress">
      <div className="job-progress-bar">
        <div
          className="job-progress-bar-fill"
          style={{ transform: `translateX(${pct - 100}%)` }}
        />
      </div>
      <div className="job-progress-status">
        <span>{jobStatus === 'queued' ? 'Queued…' : 'Processing…'}</span>
        <span>{etaText}</span>
      </div>
    </div>
  );
};

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
      // Entity text is between [ and ]
      const text = match[1];
      const type = match[2].toUpperCase();
      if (isValidEntityType(type as EntityType)) {
        // Find the position of the entity text (after the #[)
        const entityStart = matchStart + match[0].indexOf('[') + 1;
        const entityEnd = entityStart + text.length;
        manualEntities.push({
          start: entityStart,
          end: entityEnd,
          text,
          displayText: text,
          type: type as EntityType,
          confidence: 1.0,
          source: 'manual' as const,
        });
        console.log(`[ManualTag] Bracketed: "${match[0]}" → entity="${text}" at ${entityStart}-${entityEnd}, actual text in range: "${rawText.substring(entityStart, entityEnd)}"`);
      }
    } else if (match[3]) {
      // Pattern: #Entity:TYPE (unbracketed form)
      // Entity text is after the # and before the :
      let text = match[3];
      text = text.replace(/_/g, ' ');  // Normalize underscores to spaces
      const type = match[4].toUpperCase();
      if (isValidEntityType(type as EntityType)) {
        // Find the position of the entity text (after the #)
        const entityStart = matchStart + 1;  // +1 to skip the #
        const entityEnd = entityStart + match[3].length;  // Use original match length
        manualEntities.push({
          start: entityStart,
          end: entityEnd,
          text,
          displayText: text,
          type: type as EntityType,
          confidence: 1.0,
          source: 'manual' as const,
        });
        console.log(`[ManualTag] Simple: "${match[0]}" → entity="${text}" at ${entityStart}-${entityEnd}, actual text in range: "${rawText.substring(entityStart, entityEnd)}"`);
      }
    } else if (match[5]) {
      // Pattern: Entity:ALIAS_OF_Canonical:TYPE (alias form)
      // Entity text is at the start before the first :
      let entityWord = match[5];
      entityWord = entityWord.replace(/_/g, ' ');  // Normalize underscores to spaces
      const type = match[7].toUpperCase();
      if (isValidEntityType(type as EntityType)) {
        // Entity text starts at matchStart and goes for the length of match[5]
        const entityStart = matchStart;
        const entityEnd = entityStart + match[5].length;
        manualEntities.push({
          start: entityStart,
          end: entityEnd,
          text: entityWord,
          displayText: entityWord,
          type: type as EntityType,
          confidence: 1.0,
          source: 'manual' as const,
        });
      }
    } else if (match[8]) {
      // Pattern: Entity:REJECT_ENTITY
      // Entity text is at the start before the :
      let rejectedWord = match[8];
      rejectedWord = rejectedWord.replace(/_/g, ' ');

      // Track rejection - use the word as the rejection key (original form)
      rejections.add(match[8].toLowerCase());

      // Also create an entity so the decoration layer can find and replace the entire tag
      // Entity position is just the word part, not the entire tag
      const entityStart = matchStart;
      const entityEnd = entityStart + match[8].length;
      manualEntities.push({
        start: entityStart,
        end: entityEnd,
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
  // Find the LAST occurrence of # that's NOT a markdown header
  // Markdown headers: # or ## or ### etc at start of line
  // Entity tags: #Entity:TYPE or #[Multi Word]:TYPE (mid-text)

  let lastHashIndex = -1;

  // Search backwards for # that's not a markdown header
  for (let i = rawText.length - 1; i >= 0; i--) {
    if (rawText[i] === '#') {
      // Look backwards through ALL consecutive # characters
      // This handles ##, ###, etc. where the second # sees the first # as previous char
      let j = i - 1;
      while (j >= 0 && rawText[j] === '#') {
        j--;
      }

      // Now j points to the character before the first # in the sequence
      // Check if the FIRST # in the sequence is at line start
      const isLineStart = j < 0 || rawText[j] === '\n' || rawText[j] === '\r';

      if (!isLineStart) {
        // This # sequence is mid-text, could be an entity tag
        lastHashIndex = i;
        break;
      }

      // Otherwise it's a markdown header, skip past this entire sequence
      i = j + 1;
    }
  }

  if (lastHashIndex === -1) {
    // No entity tags found (only markdown headers or no # at all)
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

  const overlaps = (a: EntitySpan, b: EntitySpan) =>
    !(a.end <= b.start || b.end <= a.start);

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
        if (otherLower.includes(longerLower) && overlaps(longer, other)) {
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
          if (longerLower.includes(shorterLower) && overlaps(longer, shorter)) {
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

function applyEntityOverrides(
  baseEntities: EntitySpan[],
  overrides: EntityOverrides,
  highlightMode: boolean
): EntitySpan[] {
  // Always apply overrides from sidebar, context menu, etc.
  // (highlightMode parameter kept for backwards compatibility but no longer used)
  if (!baseEntities.length) return baseEntities;

  const { rejectedSpans, typeOverrides } = overrides;

  return baseEntities
    .filter((e) => !rejectedSpans.has(makeSpanKey(e)))
    .map((e) => {
      const key = makeSpanKey(e);
      const overrideType = typeOverrides[key];
      if (!overrideType) return e;
      return {
        ...e,
        type: overrideType,
      };
    });
}

interface SelectedEntityState {
  name: string;
  type: string;
}

// Floating action menu for text selection in Entity Highlight Mode
interface EntitySelectionMenuProps {
  selectedText: string;
  entitiesCount: number;
  position?: { x: number; y: number; flip?: boolean };
  onTagAsEntity: () => void;
  onMergeEntities: () => void;
  onCancel: () => void;
}

function EntitySelectionMenu({
  selectedText,
  entitiesCount,
  position,
  onTagAsEntity,
  onMergeEntities,
  onCancel,
}: EntitySelectionMenuProps) {
  // Calculate menu position using fixed positioning (viewport coordinates)
  // Use portal to escape any transform contexts that would break backdrop-filter
  const menuStyle: React.CSSProperties = position
    ? {
        position: 'fixed',
        left: `${position.x}px`,
        // If flip is true, position above; otherwise below
        // Use transform to position menu edge at the Y coordinate
        ...(position.flip
          ? {
              bottom: `${window.innerHeight - position.y}px`,
              transform: 'translate(-50%, 0)', // Center horizontally, no Y offset
            }
          : {
              top: `${position.y}px`,
              transform: 'translate(-50%, 0)', // Center horizontally, no Y offset
            }),
      }
    : {
        position: 'fixed',
        bottom: '100px',
        left: '50%',
        transform: 'translate(-50%, 0)',
      };

  const menuContent = (
    <div
      className="entity-selection-menu"
      onClick={(e) => e.stopPropagation()} // Prevent clicks from bubbling
      onMouseDown={(e) => e.stopPropagation()} // Prevent mousedown from bubbling
      style={{
        ...menuStyle,
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)', // Safari support
        border: '1px solid var(--glass-border)',
        borderRadius: '12px',
        padding: '16px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
        zIndex: 10000,
        minWidth: '300px',
        maxWidth: '400px',
        isolation: 'isolate', // Create isolated stacking context for backdrop-filter
        willChange: 'transform', // GPU acceleration
      }}
    >
      <div style={{ marginBottom: '12px', fontSize: '14px', color: 'var(--text-secondary)' }}>
        Selected: <strong style={{ color: 'var(--text-primary)' }}>"{selectedText.substring(0, 50)}{selectedText.length > 50 ? '...' : ''}"</strong>
        {entitiesCount > 0 && (
          <div style={{ marginTop: '4px', fontSize: '12px' }}>
            {entitiesCount} {entitiesCount === 1 ? 'entity' : 'entities'} in range
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {/* Tag as Entity button - always show */}
        <button
          onClick={onTagAsEntity}
          className="action-button primary"
          style={{
            flex: '1 1 auto',
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            background: 'var(--accent-color)',
            color: 'white',
            fontWeight: '500',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          Tag as Entity
        </button>

        {/* Merge Entities button - only show if 2+ entities selected */}
        {entitiesCount >= 2 && (
          <button
            onClick={onMergeEntities}
            className="action-button merge"
            style={{
              flex: '1 1 auto',
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: '#8b5cf6',
              color: 'white',
              fontWeight: '500',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Merge {entitiesCount} Entities
          </button>
        )}

        <button
          onClick={onCancel}
          className="action-button cancel"
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: '1px solid var(--glass-border)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            fontWeight: '500',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );

  // Use portal to render at document.body, escaping any transform contexts
  return createPortal(menuContent, document.body);
}

export function ExtractionLab({ project, toast }: ExtractionLabProps) {
  // Layout state (via custom hook)
  const layout = useLabLayoutState();

  // Settings state (via custom hook)
  const settings = useExtractionSettings();

  // Sync a keyboard offset CSS variable so viewport-fixed chrome can rise above the iOS keyboard
  // without resizing the editor surface itself.
  useKeyboardViewportOffset();

  // Single scroll owner for the editor surface.
  // Layout chain (no resizing allowed): #root (React mount) → .extraction-lab (page root) → .lab-content (layout parent)
  // → .editor-panel (scroll container) → editor content. Keyboard padding is applied only on .editor-panel.
  const editorScrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollContainerEl, setScrollContainerEl] = useState<HTMLElement | null>(null);
  const chromeTopRowRef = useRef<HTMLDivElement | null>(null);
  const [chromeHeight, setChromeHeight] = useState(72);
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  // Extraction state
  const [text, setText] = useState('');
  const [richDoc, setRichDoc] = useState<SerializedEditorState | null>(null);
  const [posMap, setPosMap] = useState<PosMapEntry[]>([]);
  const [docVersion, setDocVersion] = useState<string>('');
  const [blockIndex, setBlockIndex] = useState<BlockIndexEntry[]>([]);
  const [entities, setEntities] = useState<EntitySpan[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [processing, setProcessing] = useState(false);
  const [stats, setStats] = useState<ExtractionStats>({ time: 0, confidence: 0, count: 0, relationCount: 0 });
  const [booknlpResult, setBooknlpResult] = useState<ExtractionResponse['booknlp'] | null>(null);
  const [highlightChains, setHighlightChains] = useState(false);

  // Job state
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [jobResult, setJobResult] = useState<ExtractionResponse | null>(null);
  const [jobStartedAt, setJobStartedAt] = useState<number | null>(null);
  const [jobExpectedDurationMs, setJobExpectedDurationMs] = useState<number | null>(null);
  const [jobProgress, setJobProgress] = useState<number>(0);
  const [jobEtaSeconds, setJobEtaSeconds] = useState<number | null>(null);
  const jobRevisionRef = useRef<number | null>(null);
  const jobTextRef = useRef<string | null>(null);
  const lastAppliedRevisionRef = useRef<number | null>(null);
  const lastAppliedSignatureRef = useRef<string | null>(null);
  const [backgroundProcessing, setBackgroundProcessing] = useState(false);

  // Document state
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const [loadingDocument, setLoadingDocument] = useState(false);
  const [documentList, setDocumentList] = useState<StoredDocument[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);

  // Entity modal state
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntityState | null>(null);

  // Entity override state (for highlight mode)
  const [entityOverrides, setEntityOverrides] = useState<EntityOverrides>({
    rejectedSpans: new Set(),
    typeOverrides: {},
  });

  // Text selection state (for entity highlight mode)
  const [textSelection, setTextSelection] = useState<{
    start: number;
    end: number;
    text: string;
    entitiesInRange: EntitySpan[];
    position?: { x: number; y: number; flip?: boolean }; // Position for menu
  } | null>(null);
  const [navigateRequest, setNavigateRequest] = useState<NavigateToRange | null>(null);
  const [editorFocused, setEditorFocused] = useState(false);
  const [hasActiveSelection, setHasActiveSelection] = useState(false);
  const [formatActions, setFormatActions] = useState<FormattingActions | null>(null);
  const [showFormatToolbar, setShowFormatToolbar] = useState(false);
  const formatHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [formatToolbarEnabled, setFormatToolbarEnabled] = useState(false);

  // Theme state
  const [theme, setTheme] = useState(loadThemePreference());
  const [renderMarkdown, setRenderMarkdown] = useState(true);
  const [liveExtractionEnabled, setLiveExtractionEnabled] = useState(true);
  const navigateRequestIdRef = useRef(0);
  const colorForSpan = useCallback(
    (span: EntitySpan) => {
      if (!highlightChains) return undefined;
      const key = span.entityId || span.canonicalName || span.text;
      return key ? colorFromId(key) : undefined;
    },
    [highlightChains]
  );

  // Measure the viewport-anchored chrome so the editor scroll container can pad underneath it without resizing.
  useLayoutEffect(() => {
    const chromeEl = chromeTopRowRef.current;
    if (!chromeEl) return;

    const measure = () => {
      const rect = chromeEl.getBoundingClientRect();
      if (rect.height > 0) {
        setChromeHeight(Math.ceil(rect.height));
      }
    };

    measure();

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(chromeEl);
    window.addEventListener('resize', measure);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // Measure toolbar height so the editor can pad underneath without any height or width changes.
  useLayoutEffect(() => {
    const toolbarEl = toolbarRef.current;
    const scrollEl = editorScrollRef.current;
    if (!toolbarEl || !scrollEl) return;

    const measureToolbar = () => {
      const rect = toolbarEl.getBoundingClientRect();
      if (rect.height > 0) {
        scrollEl.style.setProperty('--floating-toolbar-height', `${Math.ceil(rect.height)}px`);
      }
    };

    measureToolbar();

    const resizeObserver = new ResizeObserver(measureToolbar);
    resizeObserver.observe(toolbarEl);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Ghost formatting toolbar visibility (focus or selection with debounce hide)
  useEffect(() => {
    const shouldShow = editorFocused || hasActiveSelection;
    if (shouldShow) {
      if (formatHideTimeoutRef.current) {
        clearTimeout(formatHideTimeoutRef.current);
        formatHideTimeoutRef.current = null;
      }
      setShowFormatToolbar(true);
    } else {
      if (formatHideTimeoutRef.current) {
        clearTimeout(formatHideTimeoutRef.current);
      }
      formatHideTimeoutRef.current = setTimeout(() => {
        setShowFormatToolbar(false);
      }, 180);
    }
    return () => {
      if (formatHideTimeoutRef.current) {
        clearTimeout(formatHideTimeoutRef.current);
        formatHideTimeoutRef.current = null;
      }
    };
  }, [editorFocused, hasActiveSelection]);

  const resetEntityOverrides = useCallback(() => {
    setEntityOverrides({
      rejectedSpans: new Set(),
      typeOverrides: {},
    });
  }, []);

  useEffect(() => {
    setScrollContainerEl(editorScrollRef.current);
  }, []);

  // Initialize theme on mount
  useEffect(() => {
    initializeTheme();
  }, []);

  // iOS: Prevent body scroll when modals are open
  useEffect(() => {
    const hasModal = layout.showEntityModal || !!selectedEntity;
    if (hasModal) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [layout.showEntityModal, selectedEntity]);

  // Handle theme toggle
  const handleThemeToggle = () => {
    const newTheme = toggleTheme();
    setTheme(newTheme);
  };

  const handleNavigateToEntity = useCallback((entity: EntitySpan) => {
    navigateRequestIdRef.current += 1;
    setNavigateRequest({
      from: entity.start,
      to: entity.end,
      requestId: navigateRequestIdRef.current,
    });
  }, []);

  const handleQuoteNavigate = useCallback((quote: any) => {
    const start = typeof quote?.start === 'number' ? quote.start : 0;
    const end = typeof quote?.end === 'number' ? quote.end : start + (quote?.text?.length || 0);
    navigateRequestIdRef.current += 1;
    setNavigateRequest({
      from: start,
      to: end,
      requestId: navigateRequestIdRef.current,
    });
  }, []);

  const handleRichChange = useCallback((snapshot: RichDocSnapshot) => {
    setRichDoc(snapshot.docJSON);
    setText(snapshot.plainText);
    setPosMap(snapshot.posMap);
    setBlockIndex(snapshot.blocks);
    setDocVersion(snapshot.docVersion);
  }, []);

  const handleLegacyTextChange = useCallback((value: string) => {
    setRichDoc(null);
    setText(value);
    setPosMap([]);
    setBlockIndex([]);
    setDocVersion(computeDocVersion(value));
  }, []);

  const requiresBackground = text.length > SYNC_EXTRACTION_CHAR_LIMIT;
  const hasActiveJob = jobStatus === 'queued' || jobStatus === 'running';
  const isUpdating = processing && !requiresBackground && !hasActiveJob;
  const displayEntities = applyEntityOverrides(entities, entityOverrides, settings.entityHighlightMode);
  const speakerLookup = useMemo(() => {
    const map = new Map<string, string>();
    if (booknlpResult?.characters) {
      booknlpResult.characters.forEach((c: any) => {
        if (c?.id) {
          map.set(c.id, c.canonical || c.canonical_name || c.text || c.name || c.id);
        }
      });
    }
    entities.forEach((e) => {
      if (e.entityId && e.canonicalName && !map.has(e.entityId)) {
        map.set(e.entityId, e.canonicalName);
      }
    });
    return map;
  }, [booknlpResult, entities]);
  const entityHighlightingEnabled = settings.showHighlighting;
  const editorDisableHighlighting = !entityHighlightingEnabled;
  const effectiveTheme = getEffectiveTheme(theme);
  const hasResults = displayEntities.length > 0 || relations.length > 0 || stats.count > 0 || stats.relationCount > 0;
  const jobStatusLabel =
    jobStatus === 'running'
      ? 'Job running'
      : jobStatus === 'queued'
        ? 'Queued'
        : jobStatus === 'failed'
          ? 'Failed'
          : jobStatus === 'done'
            ? 'Done'
            : 'Idle';

  const applyExtractionResults = useCallback(
    (data: ExtractionResponse, rawText: string, elapsedMs?: number) => {
      const mappedSpans = mapExtractionResponseToSpans(data, rawText);
      const deduplicated = deduplicateEntities(mappedSpans);
      const { entities: manualTags, rejections } = parseManualTags(rawText);
      const mergedEntities = mergeManualAndAutoEntities(deduplicated, manualTags, rejections, rawText);

      const time = elapsedMs ?? data.stats?.extractionTime ?? 0;
      const avgConfidence =
        mergedEntities.length > 0
          ? mergedEntities.reduce((sum, e) => sum + e.confidence, 0) / mergedEntities.length
          : 0;

      setEntities(mergedEntities);
      setRelations(data.relations || []);
      setBooknlpResult(data.booknlp || null);
      setStats({
        time: Math.round(time),
        confidence: Math.round(avgConfidence * 100),
        count: mergedEntities.length,
        relationCount: data.relations?.length || 0,
      });

      resetEntityOverrides();
    },
    [resetEntityOverrides]
  );

  // Real-time extraction using FULL ARES ENGINE (debounced 1000ms for heavier processing)
  const extractEntities = useCallback(
    debounce(async (text: string) => {
      if (!text.trim()) {
        setEntities([]);
        setRelations([]);
        setStats({ time: 0, confidence: 0, count: 0, relationCount: 0 });
        setBooknlpResult(null);
        return;
      }

      setProcessing(true);
      const start = performance.now();
      const version = docVersion || computeDocVersion(text, blockIndex);

      try {
        // Strip incomplete tags before sending to backend
        // This prevents the backend from trying to extract entities from incomplete tag syntax
        // Incomplete tags like "#Cory:" won't be sent, so backend won't try to extract from them
        const textForExtraction = stripIncompleteTagsForExtraction(text);

        const apiUrl = resolveApiUrl();
        const response = await fetch(`${apiUrl}/extract-entities`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text: textForExtraction, docVersion: version, blocks: blockIndex }),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || 'Extraction failed');
        }

        const elapsed = performance.now() - start;
        applyExtractionResults(data, text, elapsed);

        console.log(`[ARES ENGINE] Extracted ${data.entities.length} entities, ${data.relations?.length || 0} relations`);
      } catch (error) {
        console.error('Extraction failed:', error);
        toast.error(`Extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setEntities([]);
        setRelations([]);
        setBooknlpResult(null);
      } finally {
        setProcessing(false);
      }
    }, 1000), // Increased debounce for heavier ARES processing
    [toast, applyExtractionResults, docVersion, blockIndex]
  );

  const runExtractionNow = useCallback(() => {
    if (!text.trim()) {
      toast.error('Please paste text before running extraction.');
      return;
    }

    extractEntities(text);
  }, [text, extractEntities, toast]);

  useEffect(() => {
    if (requiresBackground) {
      setProcessing(false);
      return;
    }

    if (hasActiveJob || !liveExtractionEnabled || settings.entityHighlightMode) {
      // Don't auto-extract when in Entity Highlight Mode (prevents overwriting manual entities)
      return;
    }

    extractEntities(text);
  }, [text, extractEntities, requiresBackground, hasActiveJob, liveExtractionEnabled, jobStatus, settings.entityHighlightMode]);

  const startBackgroundJob = useCallback(
    async (options: { silent?: boolean; revision: number; textSnapshot: string }) => {
      const { silent = true, revision, textSnapshot } = options;
      const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';
      const version = docVersion || computeDocVersion(textSnapshot, blockIndex);

      if (!textSnapshot.trim()) {
        if (!silent) {
          toast.error('Please paste text before starting extraction.');
        }
        return;
      }

      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }

      setBackgroundProcessing(true);
      setJobError(null);
      setJobResult(null);
      jobRevisionRef.current = revision;
      jobTextRef.current = textSnapshot;

      try {
        const apiUrl = resolveApiUrl();
        const payload = { text: stripIncompleteTagsForExtraction(textSnapshot), docVersion: version, blocks: blockIndex };
        const response = await fetch(`${apiUrl}/jobs/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || 'Failed to start job');
        }

        setJobId(data.jobId);
        setJobStatus('queued');
        const expectedDuration = estimateJobDurationMs(textSnapshot.length);
        setJobStartedAt(Date.now());
        setJobExpectedDurationMs(expectedDuration);
        setJobProgress(0);
        setJobEtaSeconds(null);
        setEntities([]);
        setRelations([]);
        setStats({ time: 0, confidence: 0, count: 0, relationCount: 0 });
        if (isDev) {
          console.debug('[ExtractionLab][auto-long] scheduled', { revision });
        }
        if (!silent) {
          toast.success('Background extraction started.');
        }
      } catch (error) {
        if (!silent) {
          toast.error(`Failed to start job: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } else if (isDev) {
          console.warn('[ExtractionLab] Background job failed to start', error);
        }
        setJobId(null);
        setJobStatus(null);
        setJobStartedAt(null);
        setJobExpectedDurationMs(null);
        setJobProgress(0);
        setJobEtaSeconds(null);
        jobRevisionRef.current = null;
      } finally {
        setBackgroundProcessing(false);
      }
    },
    [toast, docVersion, blockIndex]
  );

  const { revisionRef } = useAutoLongExtraction({
    text,
    threshold: LONG_TEXT_AUTO_THRESHOLD,
    debounceMs: LONG_TEXT_IDLE_DEBOUNCE_MS,
    documentVisible: typeof document === 'undefined' ? true : document.visibilityState === 'visible',
    hasActiveJob,
    startJob: (revision, textSnapshot) => startBackgroundJob({ revision, textSnapshot, silent: true }),
  });

  // localStorage backup helpers (for when Railway backend loses documents)
  const getLocalStorageDocuments = useCallback((): StoredDocument[] => {
    try {
      const stored = localStorage.getItem('ares_documents');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('[localStorage] Failed to load documents', error);
    }
    return [];
  }, []);

  const saveToLocalStorage = useCallback((doc: StoredDocument) => {
    try {
      const docs = getLocalStorageDocuments();
      const idx = docs.findIndex(d => d.id === doc.id);
      if (idx >= 0) {
        docs[idx] = doc;
      } else {
        docs.push(doc);
      }
      localStorage.setItem('ares_documents', JSON.stringify(docs));
    } catch (error) {
      console.error('[localStorage] Failed to save document', error);
    }
  }, [getLocalStorageDocuments]);

  const fetchDocumentById = useCallback(async (id: string): Promise<StoredDocument> => {
    try {
      const apiUrl = resolveApiUrl();
      const res = await fetch(`${apiUrl}/documents/${id}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch document ${id}`);
      }
      const json = await res.json();
      if (!json?.ok || !json.document) {
        throw new Error('Invalid document response');
      }
      if (typeof window !== 'undefined') {
        (window as any).__ARES_DOC_ERROR_SHOWN__ = false;
      }
      return json.document;
    } catch (error) {
      // Fallback to localStorage if backend fails
      console.log(`[ExtractionLab] Backend fetch failed for ${id}, checking localStorage`);
      const localDocs = getLocalStorageDocuments();
      const localDoc = localDocs.find(d => d.id === id);
      if (localDoc) {
        console.log(`[ExtractionLab] Found document ${id} in localStorage`);
        return localDoc;
      }
      throw error;
    }
  }, [getLocalStorageDocuments]);

  const applyDocumentToState = useCallback(
    (document: StoredDocument) => {
      setLastSavedId(document.id);
      if (document.richDoc) {
        const snap = snapshotRichDoc(document.richDoc);
        setRichDoc(document.richDoc);
        setText(snap.plainText);
        setPosMap(document.posMap || snap.posMap);
        setBlockIndex(snap.blocks);
        setDocVersion(document.docVersion || snap.docVersion);
      } else {
        setRichDoc(null);
        setText(document.text || '');
        setPosMap([]);
        setBlockIndex([]);
        setDocVersion(computeDocVersion(document.text || ''));
      }

      const extraction = document.extractionJson ?? document.extraction;
      if (extraction) {
        if (Array.isArray(extraction.entities)) {
          setEntities(extraction.entities);
        }
        if (Array.isArray(extraction.relations)) {
          setRelations(extraction.relations);
        }
        const extractionStats = extraction.stats;
        setStats({
          time:
            typeof extractionStats?.time === 'number'
              ? extractionStats.time
              : typeof extractionStats?.extractionTime === 'number'
                ? extractionStats.extractionTime
                : 0,
          confidence:
            typeof extractionStats?.confidence === 'number'
              ? extractionStats.confidence
              : typeof extractionStats?.averageConfidence === 'number'
                ? extractionStats.averageConfidence
                : 0,
          count: extraction.entities?.length ?? 0,
          relationCount: extraction.relations?.length ?? 0,
        });

        // Restore entity overrides if they exist (deserialize Array back to Set)
        if (extraction.entityOverrides) {
          const overrides = extraction.entityOverrides;
          setEntityOverrides({
            rejectedSpans: new Set(overrides.rejectedSpans || []),
            typeOverrides: overrides.typeOverrides || {},
          });
        } else {
          // No overrides in document, reset to empty
          resetEntityOverrides();
        }
      } else {
        // No extraction data, reset everything
        resetEntityOverrides();
      }
    },
    [setEntities, setRelations, setStats, setText, resetEntityOverrides]
  );

  const refreshDocumentList = useCallback(async () => {
    setLoadingDocuments(true);
    const apiUrl = resolveApiUrl();
    try {
      const listRes = await fetch(`${apiUrl}/documents`);
      if (!listRes.ok) {
        throw new Error('Failed to list documents');
      }
      const listJson = await listRes.json();
      const documents = Array.isArray(listJson?.documents) ? listJson.documents : [];

      const hydratedDocs: StoredDocument[] = [];
      for (const doc of documents) {
        if (!doc?.id) continue;
        try {
          const fullDoc = await fetchDocumentById(doc.id);
          hydratedDocs.push(fullDoc);
        } catch (error) {
          console.error('[ExtractionLab] Failed to hydrate document', error);
        }
      }

      // If backend is empty, fall back to localStorage
      if (hydratedDocs.length === 0) {
        const localDocs = getLocalStorageDocuments();
        if (localDocs.length > 0) {
          console.log('[ExtractionLab] Backend empty, using localStorage backup');
          hydratedDocs.push(...localDocs);
        }
      }

      const sorted = hydratedDocs.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      setDocumentList(sorted);
      if (typeof window !== 'undefined') {
        (window as any).__ARES_DOC_ERROR_SHOWN__ = false;
      }
    } catch (error) {
      console.error('[ExtractionLab] Failed to refresh document list', error);
      // Fall back to localStorage if backend fails
      const localDocs = getLocalStorageDocuments();
      if (localDocs.length > 0) {
        console.log('[ExtractionLab] Backend failed, using localStorage backup');
        setDocumentList(localDocs.sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        ));
      } else if (
        typeof window !== 'undefined' &&
        !(window as any).__ARES_DOC_ERROR_SHOWN__
      ) {
        toast.error('Failed to load saved documents');
        (window as any).__ARES_DOC_ERROR_SHOWN__ = true;
      }
    } finally {
      setLoadingDocuments(false);
    }
  }, [fetchDocumentById, toast, getLocalStorageDocuments]);

  useEffect(() => {
    if (layout.showDocumentSidebar) {
      refreshDocumentList();
    }
  }, [refreshDocumentList, layout.showDocumentSidebar]);

  const deriveDocumentName = useCallback((doc: StoredDocument) => {
    const firstNonEmptyLine = doc.text
      ?.split(/\r?\n/)
      .find((line: string) => line.trim().length > 0);
    return (firstNonEmptyLine?.trim() || doc.title || 'Untitled Document').slice(0, 120);
  }, []);

  const handleLoadDocumentById = useCallback(
    async (id: string) => {
      setLoadingDocument(true);
      try {
        const document = await fetchDocumentById(id);
        applyDocumentToState(document);
        if (typeof window !== 'undefined') {
          (window as any).__ARES_DOC_ERROR_SHOWN__ = false;
        }
        layout.closeDocumentSidebar();
      } catch (error) {
        console.error('[ExtractionLab] Failed to load document', error);
        if (
          typeof window !== 'undefined' &&
          !(window as any).__ARES_DOC_ERROR_SHOWN__
        ) {
          toast.error('Failed to load saved documents');
          (window as any).__ARES_DOC_ERROR_SHOWN__ = true;
        }
      } finally {
        setLoadingDocument(false);
      }
    },
    [applyDocumentToState, fetchDocumentById, toast]
  );

  // Auto-save timeout ref
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Core save function that handles both create and update
  const saveDocumentInternal = useCallback(async (showToast: boolean = true): Promise<string | null> => {
    if (!text.trim()) {
      if (showToast) {
        toast.error('Please paste text before saving.');
      }
      return null;
    }

    setSaveStatus('saving');

    try {
      // Serialize entityOverrides for storage (convert Set to Array for JSON)
      const serializedOverrides = {
        rejectedSpans: Array.from(entityOverrides.rejectedSpans),
        typeOverrides: entityOverrides.typeOverrides,
      };

      const version = docVersion || computeDocVersion(text, blockIndex);
      const payload = {
        title: text.trim().split('\n')[0]?.slice(0, 80) || 'Untitled Document',
        text,
        richDoc,
        posMap,
        blockIndex,
        docVersion: version,
        extraction: {
          entities,
          relations,
          stats,
          entityOverrides: serializedOverrides,
        },
      };

      const apiUrl = resolveApiUrl();

      // If we have an existing document, update it; otherwise create new
      const isUpdate = !!lastSavedId;
      const url = isUpdate ? `${apiUrl}/documents/${lastSavedId}` : `${apiUrl}/documents`;
      const method = isUpdate ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Save failed with status ${response.status}`);
      }

      const json = await response.json();

      if (!json?.ok || !json.document?.id) {
        throw new Error('Invalid save response');
      }

      setSaveStatus('saved');
      setLastSavedId(json.document.id);

      // Also save to localStorage as backup (in case Railway restarts)
      saveToLocalStorage(json.document);

      if (layout.showDocumentSidebar) {
        refreshDocumentList();
      }

      return json.document.id;
    } catch (error) {
      console.error('[ExtractionLab] Failed to save document', error);
      setSaveStatus('error');

      // Even if backend fails, save to localStorage
      const now = new Date().toISOString();
      const serializedOverrides = {
        rejectedSpans: Array.from(entityOverrides.rejectedSpans),
        typeOverrides: entityOverrides.typeOverrides,
      };
      const localDoc: StoredDocument = {
        id: lastSavedId || `local_${Date.now()}`,
        title: text.trim().split('\n')[0]?.slice(0, 80) || 'Untitled Document',
        text,
        richDoc,
        posMap,
        blockIndex,
        docVersion: docVersion || computeDocVersion(text, blockIndex),
        extractionJson: {
          entities,
          relations,
          stats,
          entityOverrides: serializedOverrides,
        },
        createdAt: now,
        updatedAt: now,
      };
      saveToLocalStorage(localDoc);
      setLastSavedId(localDoc.id);

      if (showToast) {
        toast.error('Failed to save document to server, but saved locally');
      }
      return localDoc.id;
    }
  }, [entities, relations, stats, text, toast, layout.showDocumentSidebar, refreshDocumentList, lastSavedId, saveToLocalStorage, entityOverrides, richDoc, posMap, blockIndex, docVersion]);

  // Manual save (shows toast on error)
  const handleSaveDocument = useCallback(async () => {
    await saveDocumentInternal(true);
  }, [saveDocumentInternal]);

  // Auto-save function (silent, no toast)
  const autoSave = useCallback(async () => {
    if (!text.trim()) return;
    await saveDocumentInternal(false);
  }, [saveDocumentInternal, text]);

  // Auto-save effect - triggers 2 seconds after text changes
  useEffect(() => {
    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Only auto-save if there's content
    if (!text.trim()) {
      setSaveStatus('idle');
      return;
    }

    // Set status to indicate unsaved changes
    setSaveStatus('idle');

    // Schedule auto-save after 2 seconds of inactivity
    autoSaveTimeoutRef.current = setTimeout(() => {
      autoSave();
    }, 2000);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [text, autoSave]);

  const loadLastDocument = useCallback(async () => {
    setLoadingDocument(true);
    try {
      let targetId: string | null = lastSavedId;

      if (!targetId) {
        const apiUrl = resolveApiUrl();
        const listRes = await fetch(`${apiUrl}/documents`);
        if (!listRes.ok) {
          throw new Error('Failed to list documents');
        }
        const listJson = await listRes.json();
        const firstDoc = listJson?.documents?.[0];
        if (!firstDoc?.id) {
          toast.error('No saved documents found');
          setLoadingDocument(false);
          return;
        }
        targetId = firstDoc.id;
      }

      // After this point, targetId should be a valid string.
      // This guard satisfies TypeScript narrowing (string | null → string).
      if (!targetId) {
        return;
      }

      const document = await fetchDocumentById(targetId);
      applyDocumentToState(document);
    } catch (error) {
      console.error('[ExtractionLab] Failed to load document', error);
      toast.error('Failed to load document');
    } finally {
      setLoadingDocument(false);
    }
  }, [applyDocumentToState, fetchDocumentById, lastSavedId, toast]);

  // Keyboard shortcut: cmd+s / ctrl+s to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for cmd+s (Mac) or ctrl+s (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSaveDocument();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSaveDocument]);

  useEffect(() => {
    if (!jobId || !jobStatus || (jobStatus !== 'queued' && jobStatus !== 'running')) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const apiUrl = resolveApiUrl();
        const statusRes = await fetch(`${apiUrl}/jobs/status?jobId=${jobId}`);
        const statusData = await statusRes.json();

        if (!statusRes.ok) {
          throw new Error(statusData?.error || 'Failed to read job status');
        }

        setJobStatus(statusData.status);

        if (statusData.status === 'queued' || statusData.status === 'running') {
          if (jobStartedAt && jobExpectedDurationMs) {
            const elapsed = Date.now() - jobStartedAt;
            const rawProgress = elapsed / jobExpectedDurationMs;
            const pct = Math.min(98, Math.max(5, Math.floor(rawProgress * 100)));
            setJobProgress(pct);
            const remainingMs = Math.max(0, jobExpectedDurationMs - elapsed);
            setJobEtaSeconds(Math.round(remainingMs / 1000));
          }
        }

        if (statusData.status === 'failed') {
          setJobError(statusData.errorMessage || 'Job failed');
          setJobProgress(0);
          setJobEtaSeconds(null);
          setJobStartedAt(null);
          setJobExpectedDurationMs(null);
          setBackgroundProcessing(false);
          jobRevisionRef.current = null;
          jobTextRef.current = null;
          clearInterval(interval);
          return;
        }

        if (statusData.status === 'done') {
          setJobProgress(100);
          setJobEtaSeconds(0);
          const resultRes = await fetch(`${apiUrl}/jobs/result?jobId=${jobId}`);
          const resultJson = await resultRes.json();

          if (!resultRes.ok) {
            throw new Error(resultJson?.error || 'Failed to load job result');
          }

          const jobRevision = jobRevisionRef.current;
          const currentRevision = revisionRef.current;
          const targetText = jobTextRef.current ?? text;
          const signature = JSON.stringify({
            entities: resultJson.entities,
            relations: resultJson.relations,
            stats: resultJson.stats,
          });
          const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

          if (jobRevision !== null && jobRevision === currentRevision) {
            const isNewResult =
              lastAppliedRevisionRef.current !== jobRevision ||
              lastAppliedSignatureRef.current !== signature;

              if (isNewResult) {
                setJobResult(resultJson as ExtractionResponse);
                applyExtractionResults(resultJson as ExtractionResponse, targetText, resultJson?.stats?.extractionTime);
                lastAppliedRevisionRef.current = jobRevision;
                lastAppliedSignatureRef.current = signature;
              } else if (isDev) {
                console.debug('[ExtractionLab][auto-long] skipping duplicate result', { jobRevision });
              }
            } else if (isDev) {
              console.debug('[ExtractionLab][auto-long] stale result ignored', { jobRevision, currentRevision });
            }
          setBackgroundProcessing(false);
          jobRevisionRef.current = null;
          jobTextRef.current = null;
          setTimeout(() => {
            setJobProgress(0);
            setJobEtaSeconds(null);
            setJobStartedAt(null);
            setJobExpectedDurationMs(null);
          }, 3000);
          clearInterval(interval);
        }
      } catch (error) {
        console.error('[ExtractionLab] job poll failed', error);
      }
    }, JOB_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [jobId, jobStatus, applyExtractionResults, text, jobStartedAt, jobExpectedDurationMs]);

  // Entity handler: Change Type
  // Inserts tag: #Entity:TYPE or #[Multi Word]:TYPE
  // Handles existing tags by replacing them entirely
  const handleChangeType = async (entity: EntitySpan, newType: EntityType) => {
    console.log('[ExtractionLab] Changing entity type:', { entity, newType });

    if (settings.entityHighlightMode) {
      const key = makeSpanKey(entity);
      setEntityOverrides((prev) => ({
        ...prev,
        typeOverrides: {
          ...prev.typeOverrides,
          [key]: newType,
        },
      }));

      toast.success(`Type changed to ${newType} (overlay)`);
      return;
    }

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

    if (settings.entityHighlightMode) {
      const newEntity: EntitySpan = {
        ...entity,
        type,
        source: 'manual',
        confidence: entity.confidence ?? 1.0,
        displayText: entity.displayText ?? entity.text,
      };

      setEntities((prev) => deduplicateEntities([...prev, newEntity]));
      setEntityOverrides((prev) => ({
        ...prev,
        typeOverrides: {
          ...prev.typeOverrides,
          [makeSpanKey(newEntity)]: type,
        },
      }));

      toast.success(`New entity created (overlay): ${newEntity.text}:${type}`);
      return;
    }

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

    if (settings.entityHighlightMode) {
      const key = makeSpanKey(entity);
      setEntityOverrides((prev) => {
        const nextRejected = new Set(prev.rejectedSpans);
        nextRejected.add(key);
        return {
          ...prev,
          rejectedSpans: nextRejected,
        };
      });

      // Also remove from immediate visible entities so the user sees it disappear right away
      setEntities((prev) => prev.filter((e) => makeSpanKey(e) !== key));

      toast.info(`"${entity.text}" rejected (overlay)`);
      return;
    }

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

  // Entity handler: Text Selected in Entity Highlight Mode
  const handleTextSelected = async (
    start: number,
    end: number,
    selectedText: string,
    entitiesInRange: EntitySpan[]
  ) => {
    console.log('[ExtractionLab] Text selected:', { start, end, selectedText, entitiesInRange });

    // Get selection position from DOM
    const selection = window.getSelection();
    let position: { x: number; y: number; flip?: boolean } | undefined;

    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      // Position menu below selection (viewport coordinates for fixed positioning)
      // Check if there's enough space below, otherwise position above
      const menuHeight = 80; // Approximate menu height
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      position = {
        x: rect.left + rect.width / 2,
        y: spaceBelow >= menuHeight ? rect.bottom + 8 : rect.top - 8, // 8px offset
        flip: spaceBelow < menuHeight, // Signal to flip menu above selection
      };
    }

    // Store selection state to show floating action menu
    setTextSelection({
      start,
      end,
      text: selectedText,
      entitiesInRange,
      position,
    });
  };

  // Clear text selection (when user clicks away)
  const clearTextSelection = () => {
    setTextSelection(null);
  };

  // Auto-detect entity type based on text content
  const autoDetectEntityType = async (text: string): Promise<EntityType> => {
    // Simple heuristic-based detection (fast, no API call)
    const trimmed = text.trim();

    // All caps or ends with Inc/Corp/LLC → ORG
    if (/^[A-Z\s&.]+$/.test(trimmed) || /\b(Inc|Corp|LLC|Ltd|Company|Organization)\b/i.test(trimmed)) {
      return 'ORG';
    }

    // Contains location indicators → PLACE
    if (/\b(City|Street|Avenue|Road|Boulevard|State|Country|County|Province)\b/i.test(trimmed)) {
      return 'PLACE';
    }

    // Starts with "The" followed by capitalized word → likely ORG or WORK
    if (/^The\s+[A-Z]/.test(trimmed)) {
      return 'ORG';
    }

    // Multiple capitalized words (proper nouns) → likely PERSON
    const words = trimmed.split(/\s+/);
    const capitalizedWords = words.filter(w => /^[A-Z][a-z]+/.test(w));
    if (capitalizedWords.length >= 2 && capitalizedWords.length === words.length) {
      return 'PERSON';
    }

    // Single capitalized word → PERSON (most common)
    if (/^[A-Z][a-z]+$/.test(trimmed)) {
      return 'PERSON';
    }

    // Default fallback
    return 'PERSON';
  };

  // Create entity from selected text (with auto-detected type)
  const createEntityFromSelection = async (manualType?: EntityType) => {
    if (!textSelection) return;

    // Auto-detect type if not manually specified
    const type = manualType || await autoDetectEntityType(textSelection.text);

    const newEntity: EntitySpan = {
      text: textSelection.text,
      type,
      start: textSelection.start,
      end: textSelection.end,
      source: 'manual',
      confidence: 1.0,
      displayText: textSelection.text,
    };

    setEntities((prev) => deduplicateEntities([...prev, newEntity]));
    setEntityOverrides((prev) => ({
      ...prev,
      typeOverrides: {
        ...prev.typeOverrides,
        [makeSpanKey(newEntity)]: type,
      },
    }));

    toast.success(`Entity created: "${textSelection.text}" as ${type}`);
    clearTextSelection();
  };

  // Merge entities in selected range
  const mergeEntitiesFromSelection = () => {
    if (!textSelection || textSelection.entitiesInRange.length < 2) {
      toast.error('Select at least 2 entities to merge');
      return;
    }

    const entitiesToMerge = textSelection.entitiesInRange;

    // Use the first entity's type as the merged type
    const mergedType = entitiesToMerge[0].type;

    // Create merged entity spanning the full selection
    const mergedEntity: EntitySpan = {
      text: textSelection.text,
      type: mergedType,
      start: textSelection.start,
      end: textSelection.end,
      source: 'manual',
      confidence: 1.0,
      displayText: textSelection.text,
    };

    // Remove old entities and add merged one
    setEntities((prev) => {
      const filtered = prev.filter(
        (e) => !entitiesToMerge.some(
          (toMerge) =>
            toMerge.start === e.start &&
            toMerge.end === e.end &&
            toMerge.text === e.text
        )
      );
      return deduplicateEntities([...filtered, mergedEntity]);
    });

    setEntityOverrides((prev) => ({
      ...prev,
      typeOverrides: {
        ...prev.typeOverrides,
        [makeSpanKey(mergedEntity)]: mergedType,
      },
    }));

    toast.success(`Merged ${entitiesToMerge.length} entities into "${textSelection.text}"`);
    clearTextSelection();
  };

  // Entity handler: Resize Entity (Entity Highlight Mode)
  const handleResizeEntity = async (entity: EntitySpan, newStart: number, newEnd: number) => {
    console.log('[ExtractionLab] Resizing entity:', { entity, newStart, newEnd });

    const newText = text.slice(newStart, newEnd);

    // Remove old entity and add resized one
    setEntities((prev) => {
      const filtered = prev.filter(e =>
        !(e.start === entity.start && e.end === entity.end && e.text === entity.text)
      );

      const resizedEntity: EntitySpan = {
        ...entity,
        start: newStart,
        end: newEnd,
        text: newText,
        displayText: newText,
      };

      return deduplicateEntities([...filtered, resizedEntity]);
    });

    // Update overrides
    const oldKey = makeSpanKey(entity);
    const newEntity = { ...entity, start: newStart, end: newEnd, text: newText };
    const newKey = makeSpanKey(newEntity);

    setEntityOverrides((prev) => {
      const { [oldKey]: _removed, ...restTypes } = prev.typeOverrides;
      return {
        ...prev,
        typeOverrides: {
          ...restTypes,
          [newKey]: entity.type,
        },
      };
    });

    toast.success(`Entity resized: "${newText}"`);
  };

  // Generate and copy test report
  const copyReport = () => {
    if (!text.trim() || (entities.length === 0 && relations.length === 0)) {
      toast.error('Nothing to report yet – run an extraction first.');
      return;
    }

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

  // Entity Review Sidebar handlers
  const handleEntityUpdate = useCallback((index: number, updates: Partial<EntitySpan>) => {
    const entity = entities[index];
    const key = makeSpanKey(entity);

    // Update entity in state
    setEntities((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...updates };
      return updated;
    });

    // Update entityOverrides for visual highlighting
    if (updates.type !== undefined) {
      // Type change - update typeOverrides
      setEntityOverrides((prev) => ({
        ...prev,
        typeOverrides: {
          ...prev.typeOverrides,
          [key]: updates.type as EntityType,
        },
      }));
    }

    if (updates.rejected !== undefined) {
      // Rejection change - update rejectedSpans
      setEntityOverrides((prev) => {
        const nextRejected = new Set(prev.rejectedSpans);
        if (updates.rejected) {
          nextRejected.add(key);
        } else {
          nextRejected.delete(key);
        }
        return {
          ...prev,
          rejectedSpans: nextRejected,
        };
      });
    }
  }, [entities]);

  const handleLogReport = useCallback(async () => {
    if (entities.length === 0) {
      toast.error('No entities to report');
      return;
    }

    // Generate JSON report for entity review
    const report = {
      timestamp: new Date().toISOString(),
      document: {
        title: lastSavedId || 'Untitled',
        textLength: text.length,
      },
      entities: entities.map((e) => ({
        text: e.text,
        type: e.type,
        confidence: e.confidence,
        start: e.start,
        end: e.end,
        source: e.source,
        displayText: e.displayText,
        canonicalName: e.canonicalName,
        notes: e.notes,
        rejected: e.rejected,
        context: text.substring(Math.max(0, e.start - 50), Math.min(text.length, e.end + 50)),
      })),
      stats: {
        total: entities.length,
        kept: entities.filter(e => !e.rejected).length,
        rejected: entities.filter(e => e.rejected).length,
      },
    };

    try {
      // Save to repository via API
      const apiUrl = resolveApiUrl();
      const response = await fetch(`${apiUrl}/api/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      });

      if (!response.ok) {
        throw new Error(`Failed to save report: ${response.status}`);
      }

      const result = await response.json();
      if (result.ok) {
        toast.success(`Report saved to ${result.path}`);
      } else {
        throw new Error(result.error || 'Failed to save report');
      }
    } catch (error) {
      console.error('Error saving report to server:', error);

      // Fallback to browser download if server unavailable
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (errorMsg.includes('Failed to fetch') || errorMsg.includes('Network') || errorMsg.includes('ECONNREFUSED')) {
        toast.error('API server not running - downloading instead');

        // Trigger browser download as fallback
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `entity-review-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        toast.success('Report downloaded to your browser');
      } else {
        toast.error(`Failed to save: ${errorMsg}`);
      }
    }
  }, [entities, text, lastSavedId, toast]);

  const handleCopyReport = useCallback(() => {
    if (entities.length === 0) {
      toast.error('No entities to report');
      return;
    }

    // Generate JSON report for entity review
    const report = {
      timestamp: new Date().toISOString(),
      document: {
        title: lastSavedId || 'Untitled',
        textLength: text.length,
      },
      entities: entities.map((e) => ({
        text: e.text,
        type: e.type,
        confidence: e.confidence,
        start: e.start,
        end: e.end,
        source: e.source,
        displayText: e.displayText,
        canonicalName: e.canonicalName,
        notes: e.notes,
        rejected: e.rejected,
        context: text.substring(Math.max(0, e.start - 50), Math.min(text.length, e.end + 50)),
      })),
      stats: {
        total: entities.length,
        kept: entities.filter(e => !e.rejected).length,
        rejected: entities.filter(e => e.rejected).length,
      },
    };

    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    toast.success('Entity review report copied to clipboard');
  }, [entities, text, lastSavedId, toast]);

  const handleViewWiki = useCallback(
    (entityName: string) => {
      const entity = displayEntities.find((e) => e.text === entityName);
      if (entity) {
        setSelectedEntity({ name: entityName, type: entity.type });
      }
    },
    [displayEntities]
  );

  // Create a new blank document
  const handleNewDocument = useCallback(() => {
    // Clear current document state
    setText('');
    setRichDoc(null);
    setPosMap([]);
    setBlockIndex([]);
    setDocVersion('');
    setEntities([]);
    setRelations([]);
    setStats({ time: 0, confidence: 0, count: 0, relationCount: 0 });
    setBooknlpResult(null);
    setLastSavedId(null);
    setSaveStatus('idle');
    resetEntityOverrides();

    // Clear any active job
    setJobId(null);
    setJobStatus(null);
    setJobError(null);
    setJobResult(null);
    setJobProgress(0);
    setJobEtaSeconds(null);
  }, [resetEntityOverrides]);

  const [chromePortalTarget, setChromePortalTarget] = useState<HTMLElement | null>(
    () => (typeof document !== 'undefined' ? document.body : null)
  );
  useEffect(() => {
    if (typeof document === 'undefined') return;

    let target = document.getElementById('chrome-layer-root') as HTMLElement | null;

    if (!target) {
      target = document.createElement('div');
      target.id = 'chrome-layer-root';
      target.className = 'chrome-layer-root';
    }

    // Ensure the chrome layer is a direct child of <body> so it never inherits scroll/transform contexts.
    if (target.parentElement !== document.body) {
      document.body.appendChild(target);
    }

    setChromePortalTarget(target);
  }, []);
  const editorPanelStyle = useMemo(
    () => ({ '--chromeHeight': `${chromeHeight}px` } as CSSProperties),
    [chromeHeight]
  );

  const chromeLayer = (
    <div className="lab-chrome-layer">
      {/* Viewport-fixed chrome layer: keep top controls out of the scrollable document. */}
      <div className="lab-chrome-top-row" ref={chromeTopRowRef}>
        <button
          onClick={layout.toggleDocumentSidebar}
          className="hamburger-btn"
          title="Documents"
          type="button"
        >
          <Menu size={20} strokeWidth={2} />
        </button>
      </div>

      {/* Toolbar pinned to the visual viewport so it rides above the keyboard instead of scrolling away. */}
      <div className="lab-toolbar-fixed" ref={toolbarRef}>
        <LabToolbar
          jobStatus={jobStatus}
          theme={effectiveTheme}
          entityHighlightMode={settings.entityHighlightMode}
          showSettingsDropdown={layout.showSettingsDropdown}
          showHighlighting={settings.showHighlighting}
          highlightOpacity={settings.highlightOpacity}
          editorMargin={settings.editorMargin}
          showEntityIndicators={settings.showEntityIndicators}
          enableLongTextOptimization={settings.enableLongTextOptimization}
          highlightChains={highlightChains}
          useRichEditor={settings.useRichEditor}
          onThemeToggle={handleThemeToggle}
          onEntityHighlightToggle={settings.toggleEntityHighlightMode}
          onSettingsToggle={layout.toggleSettingsDropdown}
          onSettingsClose={layout.closeSettingsDropdown}
          onHighlightingToggle={settings.toggleHighlighting}
          onOpacityChange={settings.setHighlightOpacity}
          onMarginChange={settings.setEditorMargin}
          onEntityIndicatorsToggle={settings.toggleEntityIndicators}
          onLongTextOptimizationToggle={settings.toggleLongTextOptimization}
          onHighlightChainsToggle={() => setHighlightChains(prev => !prev)}
          onRichEditorToggle={settings.toggleRichEditor}
          onNewDocument={handleNewDocument}
          saveStatus={saveStatus}
          showFormatToolbar={showFormatToolbar}
          formatToolbarEnabled={formatToolbarEnabled}
          formatActions={formatActions}
          onToggleFormatToolbar={() => setFormatToolbarEnabled(prev => !prev)}
        />
      </div>

      <FloatingActionButton
        icon="📊"
        label="View entities and stats"
        onClick={layout.openEntityPanel}
        visible={text.trim().length > 0 && layout.entityPanelMode === 'closed'}
        position="bottom-right"
        containerClassName="lab-entity-fab"
        containerStyle={{
          right: 'var(--lab-fab-right, calc(env(safe-area-inset-right) + 16px))',
          bottom:
            'calc(var(--lab-fab-bottom, calc(env(safe-area-inset-bottom) + 16px)) + var(--keyboard-offset, 0px))',
          zIndex: 1100,
        }}
      />
    </div>
  );

  console.debug('[ExtractionLab] Editor props', {
    entitiesCount: displayEntities?.length ?? 0,
    editorDisableHighlighting,
    entityHighlightMode: settings.entityHighlightMode,
  });

  return (
    <>
      {chromePortalTarget ? createPortal(chromeLayer, chromePortalTarget) : chromeLayer}
      <div
        className={`extraction-lab${layout.showDocumentSidebar ? ' sidebar-open' : ''}${layout.entityPanelMode === 'pinned' ? ' entity-sidebar-pinned' : ''}`}
      >
        {/* Documents sidebar */}
        <DocumentsSidebar
          isOpen={layout.showDocumentSidebar}
          documents={documentList}
          loadingDocuments={loadingDocuments}
          loadingDocument={loadingDocument}
          onLoadDocument={handleLoadDocumentById}
          onClose={layout.closeDocumentSidebar}
          deriveDocumentName={deriveDocumentName}
        />

        {/* Entity Review Sidebar - Pinned mode (same level as documents sidebar) */}
        {layout.entityPanelMode === 'pinned' && (
          <EntityReviewSidebar
            mode="pinned"
            entities={entities}
            onClose={layout.closeEntityPanel}
            onPin={layout.pinEntityPanel}
            onEntityUpdate={handleEntityUpdate}
            onLogReport={handleLogReport}
            onCopyReport={handleCopyReport}
            onNavigateEntity={handleNavigateToEntity}
          />
        )}

        {/* Main Content */}
        <div className="lab-content">
          {/* Editor panel - single scroll owner so chrome stays static */}
          <div className="editor-panel" ref={editorScrollRef} style={editorPanelStyle}>
            {/* Editor */}
            {settings.useRichEditor ? (
              <RichEditorPane
                richDoc={richDoc}
                plainText={text}
                entities={displayEntities}
                onChange={handleRichChange}
                onEntityFocus={handleNavigateToEntity}
                showEntityIndicators={settings.showEntityIndicators}
                navigateToRange={navigateRequest}
                showFormatToolbar={false}
                onFormatActionsReady={setFormatActions}
              />
            ) : (
              <EditorPane
                text={text}
                entities={displayEntities}
                onTextChange={handleLegacyTextChange}
                disableHighlighting={editorDisableHighlighting}
                highlightOpacity={settings.highlightOpacity}
                renderMarkdown={renderMarkdown}
                entityHighlightMode={settings.entityHighlightMode}
                showEntityIndicators={settings.showEntityIndicators}
                onChangeType={handleChangeType}
                onCreateNew={handleCreateNew}
                onReject={handleReject}
                onTagEntity={handleTagEntity}
                onTextSelected={handleTextSelected}
                onResizeEntity={handleResizeEntity}
                enableLongTextOptimization={settings.enableLongTextOptimization}
                navigateToRange={navigateRequest ?? undefined}
                colorForSpan={colorForSpan}
                onEditorFocusChange={setEditorFocused}
                onSelectionChange={setHasActiveSelection}
                onFormatActionsReady={setFormatActions}
                scrollContainer={scrollContainerEl}
              />
            )}

            {booknlpResult && (
              <div
                className="booknlp-panel"
                style={{
                  marginTop: '16px',
                  padding: '16px',
                  border: '1px solid var(--border-color, #e5e7eb)',
                  borderRadius: '12px',
                  background: 'var(--bg-secondary, #fff)',
                  width: '100%',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px' }}>
                      BookNLP Quotes {booknlpResult.quotes ? `(${booknlpResult.quotes.length})` : ''}
                    </h3>
                    <div style={{ color: '#6b7280', fontSize: '12px' }}>
                      Speakers are resolved to BookNLP characters; enable “Color BookNLP chains” in settings to see clusters.
                    </div>
                  </div>
                  {booknlpResult.metadata && (
                    <div style={{ color: '#6b7280', fontSize: '12px' }}>
                      {booknlpResult.characters?.length ?? 0} characters · {booknlpResult.metadata.processing_time_seconds}s
                    </div>
                  )}
                </div>

                {booknlpResult.quotes && booknlpResult.quotes.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px', marginTop: '12px' }}>
                    {booknlpResult.quotes.map((quote: any, idx: number) => {
                      const speakerName = quote.speaker_id
                        ? speakerLookup.get(quote.speaker_id) || quote.speaker_name || 'Unknown speaker'
                        : quote.speaker_name || 'Unknown speaker';
                      const confidence = Math.round(((quote.confidence ?? 0.5) || 0.5) * 100);

                      return (
                        <div
                          key={quote.id || idx}
                          style={{
                            padding: '12px',
                            borderRadius: '10px',
                            border: '1px solid var(--border-subtle, #e5e7eb)',
                            background: 'var(--bg-tertiary, #f9fafb)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                          }}
                        >
                          <div style={{ fontStyle: 'italic', color: '#111827' }}>“{quote.text}”</div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span style={{ fontWeight: 600, color: '#111827' }}>{speakerName}</span>
                              <span style={{ color: '#6b7280', fontSize: '12px' }}>Confidence {confidence}%</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleQuoteNavigate(quote)}
                              style={{
                                border: '1px solid #d1d5db',
                                background: '#fff',
                                borderRadius: '8px',
                                padding: '6px 10px',
                                cursor: 'pointer',
                              }}
                            >
                              Jump
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ color: '#6b7280', marginTop: '8px' }}>
                    No quotes detected for this passage yet.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Entity Review Sidebar - Full-screen overlay mode */}
        {layout.entityPanelMode === 'overlay' && (
          <EntityReviewSidebar
            mode="overlay"
            entities={entities}
            onClose={layout.closeEntityPanel}
            onPin={layout.pinEntityPanel}
            onEntityUpdate={handleEntityUpdate}
            onLogReport={handleLogReport}
            onCopyReport={handleCopyReport}
            onNavigateEntity={handleNavigateToEntity}
          />
        )}

        {/* Entity Modal */}
        {layout.showEntityModal && (
          <EntityModal
            entities={displayEntities}
            relations={relations}
            onClose={layout.closeEntityModal}
            onViewWiki={handleViewWiki}
          />
        )}

        {/* Wiki Modal */}
        {selectedEntity && (
          <WikiModal
            entityName={selectedEntity.name}
            entityType={selectedEntity.type}
            project={project}
            onClose={() => setSelectedEntity(null)}
            extractionContext={{ entities: displayEntities, relations }}
          />
        )}

        {/* Entity Selection Menu - shown when text is selected in highlight mode */}
        {textSelection && settings.entityHighlightMode && (
          <EntitySelectionMenu
            selectedText={textSelection.text}
            entitiesCount={textSelection.entitiesInRange.length}
            position={textSelection.position}
            onTagAsEntity={() => createEntityFromSelection()} // Auto-detects entity type
            onMergeEntities={mergeEntitiesFromSelection}
            onCancel={clearTextSelection}
          />
        )}
      </div>
    </>
  );
}
