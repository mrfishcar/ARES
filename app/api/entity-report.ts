import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../infra/logger';

interface EntityReport {
  runId?: string;
  documentId?: string | null;
  createdAt?: string;
}

export function writeEntityReport(report: EntityReport | Record<string, any>) {
  const reportsDir = path.join(process.cwd(), 'data', 'entity-reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  const rawDocumentId = typeof report.documentId === 'string' && report.documentId.trim().length > 0
    ? report.documentId
    : 'untitled';
  const safeDocumentId = rawDocumentId.replace(/[^a-zA-Z0-9_-]+/g, '-');

  const timestamp = (report.createdAt ? new Date(report.createdAt) : new Date())
    .toISOString()
    .replace(/[:]/g, '-');

  const filename = `entity-report-${safeDocumentId}-${timestamp}.json`;
  const filepath = path.join(reportsDir, filename);

  fs.writeFileSync(filepath, JSON.stringify(report, null, 2), 'utf-8');

  logger.info({
    msg: 'entity_report_written',
    path: filepath,
    documentId: report.documentId,
    runId: report.runId,
  });

  return { filename, path: filepath };
}
