/**
 * Meaning Assembly - Clean intermediate representation layer
 *
 * Converts extraction results (entities + relations) into stable MeaningRecords.
 * This provides a consistent internal contract between extraction and downstream processing.
 *
 * Goals:
 * - Stabilize Stage 3 debugging
 * - Improve testability (assert on meaning, not text spans)
 * - Create consistent internal format
 * - Enable diff-based debugging
 */

import type { Relation, Entity, MeaningRecord } from "./schema";
import * as fs from "fs";
import * as path from "path";

/**
 * Convert a Relation to a MeaningRecord
 *
 * Uses normalized entity IDs (after alias resolution)
 * Uses existing predicate as canonical relation type
 * Extracts qualifiers from relation if present
 */
export function relationToMeaning(
  relation: Relation,
  entities: Entity[],
  docId: string = 'current'
): MeaningRecord {
  // Find subject and object entities to get their canonical IDs
  const subjEntity = entities.find(e => e.id === relation.subj);
  const objEntity = entities.find(e => e.id === relation.obj);

  // Extract source information from first evidence (most specific)
  const evidence = relation.evidence[0];
  const source = {
    docId: evidence?.doc_id || docId,
    sentenceIndex: evidence?.sentence_index || 0,
    spanStart: evidence?.span?.start || 0,
    spanEnd: evidence?.span?.end || 0
  };

  // Extract qualifiers if present
  let qualifiers: MeaningRecord['qualifiers'] | undefined = undefined;
  if (relation.qualifiers && relation.qualifiers.length > 0) {
    qualifiers = {};
    for (const q of relation.qualifiers) {
      if (q.type === 'time' && !qualifiers.time) {
        qualifiers.time = q.value;
      } else if (q.type === 'place' && !qualifiers.place) {
        qualifiers.place = q.value;
      } else if (q.value.toLowerCase().includes('manner') && !qualifiers.manner) {
        // Note: 'manner' is not in Qualifier.type, so we infer it from value
        qualifiers.manner = q.value;
      }
    }
  }

  return {
    subjectId: subjEntity?.id || relation.subj,
    relation: relation.pred,
    objectId: objEntity?.id || relation.obj || null,
    qualifiers,
    source,
    confidence: relation.confidence
  };
}

/**
 * Assemble all relations into MeaningRecords
 *
 * This is the "meaning assembly step" - converts raw extraction results
 * into clean, normalized meaning representation.
 */
export function assembleMeaningRecords(
  relations: Relation[],
  entities: Entity[],
  docId: string = 'current'
): MeaningRecord[] {
  return relations.map(rel => relationToMeaning(rel, entities, docId));
}

/**
 * Debug logging - write MeaningRecords to /debug/meaning/<test-name>.json
 *
 * This enables:
 * - Inspecting where relations are missing
 * - Comparing expected vs actual meaning
 * - Diff-based debugging
 */
export function logMeaningRecords(
  records: MeaningRecord[],
  testName: string
): void {
  try {
    const debugDir = path.join(process.cwd(), 'debug', 'meaning');

    // Ensure directory exists
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }

    const outputPath = path.join(debugDir, `${testName}.json`);

    // Pretty-print for readability
    fs.writeFileSync(
      outputPath,
      JSON.stringify(records, null, 2),
      'utf-8'
    );

    console.log(`[MEANING-DEBUG] Logged ${records.length} meaning records to ${outputPath}`);
  } catch (error) {
    console.warn(`[MEANING-DEBUG] Failed to log meaning records:`, error);
  }
}

/**
 * Helper: Get human-readable summary of MeaningRecord
 * Useful for test output and debugging
 */
export function summarizeMeaning(record: MeaningRecord, entities: Entity[]): string {
  const subjEntity = entities.find(e => e.id === record.subjectId);
  const objEntity = record.objectId ? entities.find(e => e.id === record.objectId) : null;

  const subjName = subjEntity?.canonical || record.subjectId;
  const objName = objEntity?.canonical || record.objectId || '(none)';

  let summary = `${subjName} → ${record.relation} → ${objName}`;

  if (record.qualifiers) {
    const quals: string[] = [];
    if (record.qualifiers.time) quals.push(`time: ${record.qualifiers.time}`);
    if (record.qualifiers.place) quals.push(`place: ${record.qualifiers.place}`);
    if (record.qualifiers.manner) quals.push(`manner: ${record.qualifiers.manner}`);
    if (quals.length > 0) {
      summary += ` [${quals.join(', ')}]`;
    }
  }

  return summary;
}

/**
 * Helper: Convert MeaningRecords to compact JSON for comparison
 * Strips source details to focus on semantic content
 */
export function toCompactMeaning(records: MeaningRecord[]): any[] {
  return records.map(r => ({
    subj: r.subjectId,
    rel: r.relation,
    obj: r.objectId || null,
    ...(r.qualifiers && Object.keys(r.qualifiers).length > 0 ? { quals: r.qualifiers } : {})
  }));
}
