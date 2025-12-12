import type { EntitySpan, EntityType } from '../types/entities';

export interface ReportableEntity extends EntitySpan {
  originalType?: EntityType;
  finalType?: EntityType;
  notes?: string;
  rejected?: boolean;
  spans?: Array<{ start: number; end: number; text: string }>;
}

export interface EntityReport {
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
    spans: Array<{
      start: number;
      end: number;
      text: string;
    }>;
    notes: string | null;
    issues?: string[];
  }>;
  extractionMetadata?: {
    engineVersion?: string;
    config?: any;
  };
}

export function buildEntityReport(params: {
  runId: string;
  documentId: string | null;
  entities: ReportableEntity[];
  userContext?: Record<string, unknown>;
  extractionMetadata?: EntityReport['extractionMetadata'];
}): EntityReport {
  const createdAt = new Date().toISOString();

  const normalizedEntities = params.entities.map((entity) => {
    const baseName = entity.canonicalName || entity.displayText || entity.text;
    const spans = entity.spans && entity.spans.length > 0
      ? entity.spans
      : [{ start: entity.start, end: entity.end, text: entity.text }];

    const originalType = entity.originalType || entity.type;
    const finalType = entity.finalType || entity.type;

    return {
      id: entity.id || `${entity.start}:${entity.end}:${baseName}`,
      originalType,
      finalType,
      rejected: Boolean(entity.rejected),
      name: baseName,
      spans,
      notes: entity.notes?.trim() ? entity.notes.trim() : null,
      issues: originalType !== finalType ? [`Type changed from ${originalType} → ${finalType}`] : undefined,
    };
  });

  const totalEntities = normalizedEntities.length;
  const rejectedEntities = normalizedEntities.filter((e) => e.rejected).length;
  const changedTypeCount = normalizedEntities.filter((e) => e.originalType !== e.finalType).length;
  const notesCount = normalizedEntities.filter((e) => Boolean(e.notes)).length;
  const keptEntities = totalEntities - rejectedEntities;

  return {
    runId: params.runId,
    documentId: params.documentId,
    createdAt,
    userContext: params.userContext,
    summary: {
      totalEntities,
      keptEntities,
      rejectedEntities,
      changedTypeCount,
      notesCount,
    },
    entities: normalizedEntities,
    extractionMetadata: params.extractionMetadata,
  };
}

export async function saveEntityReportToDisk(
  report: EntityReport,
  apiBase?: string
): Promise<{ ok: boolean; path?: string; filename?: string; error?: string }> {
  const apiUrl = apiBase || import.meta.env.VITE_API_URL || 'http://localhost:4000';

  const response = await fetch(`${apiUrl}/entity-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ report }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to log report: ${response.status} ${errorText}`);
  }

  return response.json();
}

export function formatReportForClipboard(report: EntityReport): string {
  return JSON.stringify(report, null, 2);
}
