/**
 * Extraction Lab - Phase 1 Refactor
 * Real-time entity extraction testing UI with wiki generation
 * NOW POWERED BY THE FULL ARES ENGINE
 *
 * Clean architecture with extracted components and hooks
 */

import { useState, useEffect, useCallback } from 'react';
import { Menu } from 'lucide-react';
import { LabToolbar } from '../components/LabToolbar';
import { DocumentsSidebar } from '../components/DocumentsSidebar';
import { EditorPane } from '../components/EditorPane';
import { EntityModal } from '../components/EntityModal';
import { WikiModal } from '../components/WikiModal';
import { FloatingActionButton } from '../components/FloatingActionButton';
import { EntityOverlay } from '../components/EntityOverlay';
import { isValidEntityType, type EntitySpan, type EntityType } from '../types/entities';
import { initializeTheme, toggleTheme, loadThemePreference, getEffectiveTheme } from '../utils/darkMode';
import { useLabLayoutState } from '../hooks/useLabLayoutState';
import { useExtractionSettings } from '../hooks/useExtractionSettings';
import '../styles/darkMode.css';
import '../styles/extraction-lab.css';

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
    text: string;
    type: string;
    confidence: number;
    spans: Array<{ start: number; end: number }>;
    aliases?: string[];
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
  };
  fictionEntities?: any[];
}

interface StoredDocument {
  id: string;
  title: string;
  text: string;
  extractionJson?: any;
  extraction?: any;
  createdAt: string;
  updatedAt: string;
}

const JOB_POLL_INTERVAL_MS = 1500;
const SYNC_EXTRACTION_CHAR_LIMIT = 20000;

function estimateJobDurationMs(textLength: number): number {
  const baseMs = 8000;
  const extraMs = Math.floor(textLength / 5000) * 1000;
  const estimated = baseMs + extraMs;
  return Math.min(90000, Math.max(10000, estimated));
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

function applyEntityOverrides(
  baseEntities: EntitySpan[],
  overrides: EntityOverrides,
  highlightMode: boolean
): EntitySpan[] {
  if (!highlightMode) {
    // When not in highlight mode, just return the original entities
    return baseEntities;
  }

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

export function ExtractionLab({ project, toast }: ExtractionLabProps) {
  // Layout state (via custom hook)
  const layout = useLabLayoutState();

  // Settings state (via custom hook)
  const settings = useExtractionSettings();

  // Extraction state
  const [text, setText] = useState('');
  const [entities, setEntities] = useState<EntitySpan[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [processing, setProcessing] = useState(false);
  const [stats, setStats] = useState<ExtractionStats>({ time: 0, confidence: 0, count: 0, relationCount: 0 });

  // Job state
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [jobResult, setJobResult] = useState<ExtractionResponse | null>(null);
  const [jobStartedAt, setJobStartedAt] = useState<number | null>(null);
  const [jobExpectedDurationMs, setJobExpectedDurationMs] = useState<number | null>(null);
  const [jobProgress, setJobProgress] = useState<number>(0);
  const [jobEtaSeconds, setJobEtaSeconds] = useState<number | null>(null);
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

  // Theme state
  const [theme, setTheme] = useState(loadThemePreference());
  const [renderMarkdown, setRenderMarkdown] = useState(true);
  const [liveExtractionEnabled, setLiveExtractionEnabled] = useState(true);

  const resetEntityOverrides = useCallback(() => {
    setEntityOverrides({
      rejectedSpans: new Set(),
      typeOverrides: {},
    });
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

  const requiresBackground = text.length > SYNC_EXTRACTION_CHAR_LIMIT;
  const hasActiveJob = jobStatus === 'queued' || jobStatus === 'running';
  const isUpdating = processing && !requiresBackground && !hasActiveJob;
  const displayEntities = applyEntityOverrides(entities, entityOverrides, settings.entityHighlightMode);
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
      const extractedEntities: EntitySpan[] = data.entities.flatMap((entity: any) => {
        try {
          if (!isValidEntityType(entity.type)) {
            console.warn(`[ExtractionLab] Skipping entity with invalid type: ${entity.type}, text: ${entity.text}`);
            return [];
          }

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

      const deduplicated = deduplicateEntities(extractedEntities);
      const { entities: manualTags, rejections } = parseManualTags(rawText);
      const mergedEntities = mergeManualAndAutoEntities(deduplicated, manualTags, rejections, rawText);

      const time = elapsedMs ?? data.stats?.extractionTime ?? 0;
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
        return;
      }

      setProcessing(true);
      const start = performance.now();

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
          body: JSON.stringify({ text: textForExtraction }),
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
      } finally {
        setProcessing(false);
      }
    }, 1000), // Increased debounce for heavier ARES processing
    [toast, applyExtractionResults]
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
      if (!hasActiveJob && jobStatus !== 'done' && jobStatus !== 'failed') {
        setEntities([]);
        setRelations([]);
        setStats({ time: 0, confidence: 0, count: 0, relationCount: 0 });
      }
      return;
    }

    if (hasActiveJob || !liveExtractionEnabled) {
      return;
    }

    extractEntities(text);
  }, [text, extractEntities, requiresBackground, hasActiveJob, liveExtractionEnabled, jobStatus]);

  const startBackgroundJob = async () => {
    if (!text.trim()) {
      toast.error('Please paste text before starting extraction.');
      return;
    }

    setBackgroundProcessing(true);
    setJobError(null);
    setJobResult(null);

    try {
      const apiUrl = resolveApiUrl();
      const payload = { text: stripIncompleteTagsForExtraction(text) };
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
      const expectedDuration = estimateJobDurationMs(text.length);
      setJobStartedAt(Date.now());
      setJobExpectedDurationMs(expectedDuration);
      setJobProgress(0);
      setJobEtaSeconds(null);
      setEntities([]);
      setRelations([]);
      setStats({ time: 0, confidence: 0, count: 0, relationCount: 0 });
      toast.success('Background extraction started.');
    } catch (error) {
      toast.error(`Failed to start job: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setJobId(null);
      setJobStatus(null);
      setJobStartedAt(null);
      setJobExpectedDurationMs(null);
      setJobProgress(0);
      setJobEtaSeconds(null);
    } finally {
      setBackgroundProcessing(false);
    }
  };

  const fetchDocumentById = useCallback(async (id: string): Promise<StoredDocument> => {
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
  }, []);

  const applyDocumentToState = useCallback(
    (document: StoredDocument) => {
      setLastSavedId(document.id);
      setText(document.text || '');

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
      }
    },
    [setEntities, setRelations, setStats, setText]
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

      const sorted = hydratedDocs.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      setDocumentList(sorted);
      if (typeof window !== 'undefined') {
        (window as any).__ARES_DOC_ERROR_SHOWN__ = false;
      }
    } catch (error) {
      console.error('[ExtractionLab] Failed to refresh document list', error);
      if (
        typeof window !== 'undefined' &&
        !(window as any).__ARES_DOC_ERROR_SHOWN__
      ) {
        toast.error('Failed to load saved documents');
        (window as any).__ARES_DOC_ERROR_SHOWN__ = true;
      }
    } finally {
      setLoadingDocuments(false);
    }
  }, [fetchDocumentById, toast]);

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

  const handleSaveDocument = useCallback(async () => {
    if (!text.trim()) {
      toast.error('Please paste text before saving.');
      return;
    }

    setSaveStatus('saving');

    try {
      const payload = {
        title: text.trim().slice(0, 80) || 'Untitled Document',
        text,
        extraction: { entities, relations, stats },
      };

      const apiUrl = resolveApiUrl();
      const response = await fetch(`${apiUrl}/documents`, {
        method: 'POST',
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

      if (layout.showDocumentSidebar) {
        refreshDocumentList();
      }
    } catch (error) {
      console.error('[ExtractionLab] Failed to save document', error);
      setSaveStatus('error');
      toast.error('Failed to save document');
    }
  }, [entities, relations, stats, text, toast, layout.showDocumentSidebar, refreshDocumentList]);

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

          setJobResult(resultJson as ExtractionResponse);
          applyExtractionResults(resultJson as ExtractionResponse, text, resultJson?.stats?.extractionTime);
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

  const handleViewWiki = useCallback(
    (entityName: string) => {
      const entity = displayEntities.find((e) => e.text === entityName);
      if (entity) {
        setSelectedEntity({ name: entityName, type: entity.type });
      }
    },
    [displayEntities]
  );

  console.debug('[ExtractionLab] Editor props', {
    entitiesCount: displayEntities?.length ?? 0,
    editorDisableHighlighting,
    entityHighlightMode: settings.entityHighlightMode,
  });

  return (
    <div className={`extraction-lab${layout.showDocumentSidebar ? ' sidebar-open' : ''}`}>
      {/* Hamburger button */}
      <button
        onClick={layout.toggleDocumentSidebar}
        className="hamburger-btn"
        style={{ left: layout.showDocumentSidebar ? '300px' : '20px' }}
        title="Documents"
        type="button"
      >
        <Menu size={20} strokeWidth={2} />
      </button>

      {/* Toolbar - NEW COMPONENT */}
      <LabToolbar
        jobStatus={jobStatus}
        theme={effectiveTheme}
        entityHighlightMode={settings.entityHighlightMode}
        showSettingsDropdown={layout.showSettingsDropdown}
        showHighlighting={settings.showHighlighting}
        highlightOpacity={settings.highlightOpacity}
        editorMargin={settings.editorMargin}
        onExtractStart={startBackgroundJob}
        onThemeToggle={handleThemeToggle}
        onEntityHighlightToggle={settings.toggleEntityHighlightMode}
        onSettingsToggle={layout.toggleSettingsDropdown}
        onSettingsClose={layout.closeSettingsDropdown}
        onHighlightingToggle={settings.toggleHighlighting}
        onOpacityChange={settings.setHighlightOpacity}
        onMarginChange={settings.setEditorMargin}
        canExtract={text.trim().length > 0 && !hasActiveJob}
        isExtracting={backgroundProcessing || hasActiveJob}
      />

      {/* Documents sidebar */}
      <DocumentsSidebar
        isOpen={layout.showDocumentSidebar}
        documents={documentList}
        loadingDocuments={loadingDocuments}
        loadingDocument={loadingDocument}
        onLoadDocument={handleLoadDocumentById}
        deriveDocumentName={deriveDocumentName}
      />

      {/* Main Content */}
      <div className="lab-content">
        {/* Editor */}
        <EditorPane
          text={text}
          entities={displayEntities}
          onTextChange={setText}
          disableHighlighting={editorDisableHighlighting}
          highlightOpacity={settings.highlightOpacity}
          renderMarkdown={renderMarkdown}
          entityHighlightMode={settings.entityHighlightMode}
          onChangeType={handleChangeType}
          onCreateNew={handleCreateNew}
          onReject={handleReject}
          onTagEntity={handleTagEntity}
        />

        {/* Pinned sidebar mode */}
        {layout.entityPanelMode === 'pinned' && (
          <EntityOverlay
            mode="pinned"
            entities={displayEntities}
            relations={relations}
            stats={stats}
            onClose={layout.closeEntityPanel}
            onPin={layout.pinEntityPanel}
            onViewWiki={handleViewWiki}
            onCopyReport={copyReport}
            isUpdating={isUpdating}
          />
        )}
      </div>

      {/* Floating Action Button - Only show when text exists and panel is not pinned */}
      <FloatingActionButton
        icon="📊"
        label="View entities and stats"
        onClick={layout.openEntityPanel}
        visible={text.trim().length > 0 && layout.entityPanelMode === 'closed'}
        position="bottom-right"
      />

      {/* Entity Overlay - Full-screen mode */}
      {layout.entityPanelMode === 'overlay' && (
        <EntityOverlay
          mode="overlay"
          entities={displayEntities}
          relations={relations}
          stats={stats}
          onClose={layout.closeEntityPanel}
          onPin={layout.pinEntityPanel}
          onViewWiki={handleViewWiki}
          onCopyReport={copyReport}
          isUpdating={isUpdating}
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
    </div>
  );
}
