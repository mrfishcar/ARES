/**
 * Extraction Lab - Phase 0
 * Real-time entity extraction testing UI with wiki generation
 * NOW POWERED BY THE FULL ARES ENGINE
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Menu, Zap, Highlighter, Sun, Moon, Settings } from 'lucide-react';
import { VirtualizedExtractionEditor } from '../components/VirtualizedExtractionEditor';
import { EntityResultsPanel } from '../components/EntityResultsPanel';
import { EntityIndicators } from '../components/EntityIndicators';
import { EntityModal } from '../components/EntityModal';
import { WikiModal } from '../components/WikiModal';
import { FloatingActionButton } from '../components/FloatingActionButton';
import { EntityOverlay } from '../components/EntityOverlay';
import { isValidEntityType, type EntitySpan, type EntityType } from '../types/entities';
import { initializeTheme, toggleTheme, loadThemePreference } from '../utils/darkMode';
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
    <div
      className="job-progress-wrapper"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        minWidth: 220,
      }}
      aria-label="Extraction progress"
    >
      <div
        className="job-progress-bar"
        style={{
          position: 'relative',
          height: 6,
          borderRadius: 999,
          background: 'var(--bg-tertiary)',
          overflow: 'hidden',
        }}
      >
        <div
          className="job-progress-bar-fill"
          style={{
            position: 'absolute',
            inset: 0,
            transform: `translateX(${pct - 100}%)`,
            transition: 'transform 0.3s ease-out',
            background: '#22c55e',
          }}
        />
      </div>
      <div
        style={{
          fontSize: 12,
          color: 'var(--text-secondary)',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
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
  const [text, setText] = useState('');
  const [entities, setEntities] = useState<EntitySpan[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [processing, setProcessing] = useState(false);
  const [stats, setStats] = useState<ExtractionStats>({ time: 0, confidence: 0, count: 0, relationCount: 0 });
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntityState | null>(null);
  const [showHighlighting, setShowHighlighting] = useState(true);
  const [highlightOpacity, setHighlightOpacity] = useState(1.0);
  const [showAdvancedControls, setShowAdvancedControls] = useState(false);
  const [showEntityModal, setShowEntityModal] = useState(false);
  const [renderMarkdown, setRenderMarkdown] = useState(true);
  const [liveExtractionEnabled, setLiveExtractionEnabled] = useState(true);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [jobResult, setJobResult] = useState<ExtractionResponse | null>(null);
  const [jobStartedAt, setJobStartedAt] = useState<number | null>(null);
  const [jobExpectedDurationMs, setJobExpectedDurationMs] = useState<number | null>(null);
  const [jobProgress, setJobProgress] = useState<number>(0);
  const [jobEtaSeconds, setJobEtaSeconds] = useState<number | null>(null);
  const [backgroundProcessing, setBackgroundProcessing] = useState(false);
  const [theme, setTheme] = useState(loadThemePreference());
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const [loadingDocument, setLoadingDocument] = useState(false);
  const [documentList, setDocumentList] = useState<StoredDocument[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [showDocumentSidebar, setShowDocumentSidebar] = useState(false);
  const [entityHighlightMode, setEntityHighlightMode] = useState(false);
  const [entityOverrides, setEntityOverrides] = useState<EntityOverrides>({
    rejectedSpans: new Set(),
    typeOverrides: {},
  });
  const [entityPanelMode, setEntityPanelMode] = useState<'closed' | 'overlay' | 'pinned'>('closed');
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const [editorMargin, setEditorMargin] = useState<number>(() => {
    const saved = localStorage.getItem('ares.editorMargin');
    return saved ? Number(saved) : 96;
  });
  const lastScrollY = useRef(0);

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

  // Handle theme toggle
  const handleThemeToggle = () => {
    const newTheme = toggleTheme();
    setTheme(newTheme);
  };

  // Update editor margin CSS variable and persist to localStorage
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--editor-margin-desktop',
      `${editorMargin}px`
    );
    localStorage.setItem('ares.editorMargin', String(editorMargin));
  }, [editorMargin]);

  // Auto-hide header on scroll
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const scrollDelta = currentScrollY - lastScrollY.current;

      // Show header when scrolling up or at the top
      // Hide header when scrolling down and past a threshold
      if (currentScrollY < 10) {
        setIsHeaderVisible(true);
      } else if (scrollDelta > 0 && currentScrollY > 100) {
        // Scrolling down - hide header
        setIsHeaderVisible(false);
      } else if (scrollDelta < 0) {
        // Scrolling up - show header
        setIsHeaderVisible(true);
      }

      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const requiresBackground = text.length > SYNC_EXTRACTION_CHAR_LIMIT;
  const hasActiveJob = jobStatus === 'queued' || jobStatus === 'running';
  const isUpdating = processing && !requiresBackground && !hasActiveJob;
  const displayEntities = applyEntityOverrides(entities, entityOverrides, entityHighlightMode);
  const entityHighlightingEnabled = showHighlighting;
  const editorDisableHighlighting = !entityHighlightingEnabled;
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
    if (showDocumentSidebar) {
      refreshDocumentList();
    }
  }, [refreshDocumentList, showDocumentSidebar]);

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
        setShowDocumentSidebar(false);
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

      if (showDocumentSidebar) {
        refreshDocumentList();
      }
    } catch (error) {
      console.error('[ExtractionLab] Failed to save document', error);
      setSaveStatus('error');
      toast.error('Failed to save document');
    }
  }, [entities, relations, stats, text, toast, showDocumentSidebar, refreshDocumentList]);

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

    if (entityHighlightMode) {
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

    if (entityHighlightMode) {
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

    if (entityHighlightMode) {
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

  // Entity panel handlers
  const handleOpenEntityPanel = useCallback(() => {
    setEntityPanelMode('overlay');
  }, []);

  const handleCloseEntityPanel = useCallback(() => {
    setEntityPanelMode('closed');
  }, []);

  const handlePinEntityPanel = useCallback(() => {
    setEntityPanelMode('pinned');
  }, []);

  console.debug('[ExtractionLab] Editor props', {
    entitiesCount: displayEntities?.length ?? 0,
    editorDisableHighlighting,
    entityHighlightMode,
  });

  return (
    <div className={`extraction-lab${showDocumentSidebar ? ' sidebar-open' : ''}`}>
      {/* Hamburger button - moves with sidebar */}
      <button
        onClick={() => setShowDocumentSidebar(!showDocumentSidebar)}
        className="hamburger-btn"
        style={{ left: showDocumentSidebar ? '300px' : '20px', transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}
        title="Documents"
        type="button"
      >
        <Menu size={20} strokeWidth={2} />
      </button>

      {/* iOS-style Floating Control Bar - centered, auto-width */}
      <div
        className={`lab-control-bar ${isHeaderVisible ? 'visible' : 'hidden'}`}
      >
        {/* Status indicator */}
        <div
          className="status-indicator"
          style={{
            fontSize: 11,
            color: jobStatus === 'running' ? '#10B981' : jobStatus === 'failed' ? '#EF4444' : 'var(--text-tertiary)',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          {jobStatusLabel}
        </div>

        {/* Icon controls */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            onClick={startBackgroundJob}
            disabled={backgroundProcessing || hasActiveJob || !text.trim()}
            className="control-btn"
            title="Start background extraction"
            type="button"
          >
            <Zap size={16} strokeWidth={2} />
          </button>
          <button
            onClick={() => setEntityHighlightMode((v) => !v)}
            className="control-btn"
            title="Toggle Entity Highlight Mode"
            type="button"
            style={{ opacity: entityHighlightMode ? 1 : 0.5 }}
          >
            <Highlighter size={16} strokeWidth={2} />
          </button>
          <button
            onClick={handleThemeToggle}
            className="control-btn"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            type="button"
          >
            {theme === 'dark' ? <Sun size={16} strokeWidth={2} /> : <Moon size={16} strokeWidth={2} />}
          </button>
          {/* Settings dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowSettingsDropdown(!showSettingsDropdown)}
              className="control-btn"
              title="Settings"
              type="button"
            >
              <Settings size={16} strokeWidth={2} />
            </button>
            {showSettingsDropdown && (
              <>
                <div
                  onClick={() => setShowSettingsDropdown(false)}
                  style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 999,
                  }}
                />
                <div className="settings-dropdown">
                  <div className="settings-section">
                    <div className="settings-label">Page Margins</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <button
                        onClick={() => setEditorMargin(48)}
                        style={{
                          padding: '8px 12px',
                          background: editorMargin === 48 ? 'var(--accent-color)' : 'rgba(255, 255, 255, 0.05)',
                          color: editorMargin === 48 ? 'white' : 'var(--text-primary)',
                          border: '1px solid ' + (editorMargin === 48 ? 'var(--accent-color)' : 'rgba(255, 255, 255, 0.08)'),
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: '500',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        Narrow (0.5″)
                      </button>
                      <button
                        onClick={() => setEditorMargin(96)}
                        style={{
                          padding: '8px 12px',
                          background: editorMargin === 96 ? 'var(--accent-color)' : 'rgba(255, 255, 255, 0.05)',
                          color: editorMargin === 96 ? 'white' : 'var(--text-primary)',
                          border: '1px solid ' + (editorMargin === 96 ? 'var(--accent-color)' : 'rgba(255, 255, 255, 0.08)'),
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: '500',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        Default (1″)
                      </button>
                      <button
                        onClick={() => setEditorMargin(120)}
                        style={{
                          padding: '8px 12px',
                          background: editorMargin === 120 ? 'var(--accent-color)' : 'rgba(255, 255, 255, 0.05)',
                          color: editorMargin === 120 ? 'white' : 'var(--text-primary)',
                          border: '1px solid ' + (editorMargin === 120 ? 'var(--accent-color)' : 'rgba(255, 255, 255, 0.08)'),
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: '500',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        Wide (1.25″)
                      </button>
                    </div>
                  </div>
                  <div className="settings-section">
                    <div className="settings-label">Entity Highlighting</div>
                    <div
                      className="settings-toggle"
                      onClick={() => setShowHighlighting(!showHighlighting)}
                    >
                      <span className="settings-toggle-label">Highlight Entities</span>
                      <div className={`toggle-switch ${showHighlighting ? 'active' : ''}`}>
                        <div className="toggle-switch-knob" />
                      </div>
                    </div>
                  </div>
                  <div className="settings-section">
                    <div className="settings-label">Highlight Transparency</div>
                    <div className="settings-slider">
                      <div className="slider-container">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={highlightOpacity * 100}
                          onChange={(e) => setHighlightOpacity(Number(e.target.value) / 100)}
                          className="slider-input"
                          disabled={!showHighlighting}
                        />
                        <span className="slider-value">{Math.round(highlightOpacity * 100)}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Documents sidebar with ARES branding */}
      <div
        className="documents-sidebar"
        style={{
          transform: showDocumentSidebar ? 'translateX(0)' : 'translateX(-100%)',
        }}
      >
        {/* ARES branding at top */}
        <div style={{
          padding: '20px 16px',
          borderBottom: '1px solid var(--border-soft)',
          marginBottom: '16px',
        }}>
          <div style={{
            fontSize: '13px',
            fontWeight: 700,
            color: 'var(--text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '1.5px',
          }}>
            ARES
          </div>
        </div>

        <div style={{ padding: '0 16px' }}>
          <div style={{
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            marginBottom: '12px',
          }}>
            Documents
          </div>

          {loadingDocuments ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: '13px', padding: '20px 0' }}>Loading…</div>
          ) : documentList.length === 0 ? (
            <div style={{ color: 'var(--text-tertiary)', fontSize: '13px', padding: '20px 0' }}>No documents yet</div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {documentList.map((doc) => (
                <li key={doc.id}>
                  <button
                    onClick={() => handleLoadDocumentById(doc.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      border: '1px solid var(--border-soft)',
                      background: 'var(--bg-secondary)',
                      borderRadius: '12px',
                      padding: '12px',
                      cursor: loadingDocument ? 'not-allowed' : 'pointer',
                      opacity: loadingDocument ? 0.5 : 1,
                      transition: 'all 0.2s ease',
                    }}
                    disabled={loadingDocument}
                  >
                    <div style={{ fontWeight: 500, fontSize: '14px', marginBottom: '4px', color: 'var(--text-primary)' }}>
                      {deriveDocumentName(doc)}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                      {new Date(doc.updatedAt).toLocaleDateString()}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="lab-content">
        {/* Center: Editor with side margins */}
        <div className="editor-wrapper">
          <div className="editor-panel">
            {/* Clean iOS-style editor - no clutter */}
            <div className="editor-with-indicators-wrapper">
              {/* Entity indicators on left side */}
              <EntityIndicators
                entities={displayEntities}
                text={text}
                editorHeight={Math.max(400, window.innerHeight - 380)}
              />
              {/* Editor area */}
              <div className="editor-with-indicators">
                <VirtualizedExtractionEditor
                  text={text}
                  onTextChange={setText}
                  entities={displayEntities}
                  disableHighlighting={editorDisableHighlighting}
                  highlightOpacity={highlightOpacity}
                  renderMarkdown={renderMarkdown}
                  entityHighlightMode={entityHighlightMode}
                  onChangeType={handleChangeType}
                  onCreateNew={handleCreateNew}
                  onReject={handleReject}
                  onTagEntity={handleTagEntity}
                />
              </div>
            </div>

          </div>
        </div>

        {/* Pinned sidebar mode */}
        {entityPanelMode === 'pinned' && (
          <EntityOverlay
            mode="pinned"
            entities={displayEntities}
            relations={relations}
            stats={stats}
            onClose={handleCloseEntityPanel}
            onPin={handlePinEntityPanel}
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
        onClick={handleOpenEntityPanel}
        visible={text.trim().length > 0 && entityPanelMode === 'closed'}
        position="bottom-right"
      />

      {/* Entity Overlay - Full-screen mode */}
      {entityPanelMode === 'overlay' && (
        <EntityOverlay
          mode="overlay"
          entities={displayEntities}
          relations={relations}
          stats={stats}
          onClose={handleCloseEntityPanel}
          onPin={handlePinEntityPanel}
          onViewWiki={handleViewWiki}
          onCopyReport={copyReport}
          isUpdating={isUpdating}
        />
      )}

      {/* Entity Modal */}
      {showEntityModal && (
        <EntityModal
          entities={displayEntities}
          relations={relations}
          onClose={() => setShowEntityModal(false)}
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
