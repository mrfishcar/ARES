import type { EntityType } from '../types/entities';

export interface ReviewedSpan {
  start: number;
  end: number;
  text: string;
}

export interface ReviewedEntity {
  id: string;
  name: string;
  canonicalName?: string;
  originalType: EntityType;
  currentType: EntityType;
  rejected: boolean;
  notes?: string;
  spans: ReviewedSpan[];
  issues?: string[];
}

export interface EntityDebugReport {
  runId: string;
  documentId: string | null;
  createdAt: string;
  userContext?: Record<string, unknown>;
  summary: {
    totalEntities: number;
    keptEntities: number;
    rejectedEntities: number;
    changedTypeCount: number;
    notesCount: number;
  };
  entities: Array<{
    id: string;
    originalType: string;
    finalType: string;
    rejected: boolean;
    name: string;
    spans: ReviewedSpan[];
    notes: string | null;
    issues?: string[];
  }>;
  extractionMetadata?: {
    engineVersion?: string;
    config?: any;
  };
}

function generateRunId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `run-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeSpans(spans: ReviewedSpan[], text: string): ReviewedSpan[] {
  if (!Array.isArray(spans) || spans.length === 0) return [];
  return spans.map(span => ({
    ...span,
    text: span.text ?? text.slice(span.start, span.end),
  }));
}

export function buildEntityReport({
  entities,
  documentId,
  userContext,
  text,
}: {
  entities: ReviewedEntity[];
  documentId: string | null;
  userContext?: Record<string, unknown>;
  text: string;
}): EntityDebugReport {
  const createdAt = new Date().toISOString();
  const normalized = entities.map(entity => ({
    ...entity,
    spans: normalizeSpans(entity.spans, text),
  }));

  const totalEntities = normalized.length;
  const rejectedEntities = normalized.filter(e => e.rejected).length;
  const keptEntities = totalEntities - rejectedEntities;
  const changedTypeCount = normalized.filter(
    e => !e.rejected && e.originalType !== e.currentType
  ).length;
  const notesCount = normalized.filter(e => (e.notes ?? '').trim().length > 0).length;

  return {
    runId: generateRunId(),
    documentId,
    createdAt,
    userContext,
    summary: {
      totalEntities,
      keptEntities,
      rejectedEntities,
      changedTypeCount,
      notesCount,
    },
    entities: normalized.map(entity => ({
      id: entity.id,
      originalType: entity.originalType,
      finalType: entity.currentType,
      rejected: entity.rejected,
      name: entity.canonicalName || entity.name,
      spans: entity.spans,
      notes: (entity.notes ?? '').trim() || null,
      issues: entity.issues,
    })),
    extractionMetadata: {
      engineVersion: 'ARES console',
    },
  };
}

export function formatEntityReport(report: EntityDebugReport): string {
  return JSON.stringify(report, null, 2);
}
