import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';

import { extractFromSegments } from '../app/engine/extract/orchestrator';
import { segmentDocument } from '../app/engine/segmenter';
import type { EntityType, Relation } from '../app/engine/schema';

interface EntitySummary {
  id: string;
  canonicalName: string;
  type: EntityType;
  mentionCount: number;
  aliases: string[];
}

interface RelationSummary {
  id: string;
  pred: Relation['pred'];
  subj: string;
  obj: string;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countBy<T extends string>(items: T[]): Record<T, number> {
  return items.reduce((acc, item) => {
    acc[item] = (acc[item] || 0) + 1;
    return acc;
  }, {} as Record<T, number>);
}

function sortEntitiesForDisplay(a: EntitySummary, b: EntitySummary): number {
  if (b.mentionCount !== a.mentionCount) return b.mentionCount - a.mentionCount;

  const typeOrder: Record<EntityType, number> = {
    PERSON: 0,
    ORG: 1,
    GPE: 2,
    PLACE: 2,
    EVENT: 3,
    WORK_OF_ART: 4,
    PRODUCT: 5,
    LAW: 6,
    LANGUAGE: 7,
    DATE: 8,
    TIME: 9,
    PERCENT: 10,
    MONEY: 11,
    QUANTITY: 12,
    ORDINAL: 13,
    CARDINAL: 14,
    FAC: 15,
    NORP: 16,
    LOC: 17,
    UNKNOWN: 99
  } as Record<EntityType, number>;

  const typeRankDiff = (typeOrder[a.type] ?? 98) - (typeOrder[b.type] ?? 98);
  if (typeRankDiff !== 0) return typeRankDiff;

  return a.canonicalName.localeCompare(b.canonicalName);
}

async function main() {
  const manuscriptPath = path.resolve(
    __dirname,
    '..',
    "Barty Beauregard and the Fabulous Fraud PLAIN TEXT.txt"
  );

  const fullText = fs.readFileSync(manuscriptPath, 'utf8');
  const totalWords = countWords(fullText);
  const chunks = segmentDocument('barty-full-v1', fullText);
  const chunkCount = chunks.length;

  const start = performance.now();
  const result = await extractFromSegments('barty-full-v1', fullText);
  const processingTimeMs = Math.round(performance.now() - start);
  console.log(`[run-barty-full] Extraction finished in ${processingTimeMs} ms`);

  const profiles = result.profiles || new Map();
  const entitySummaries: EntitySummary[] = result.entities.map(e => {
    const profile = profiles.get(e.id);
    return {
      id: e.id,
      canonicalName: e.canonical,
      type: e.type,
      mentionCount: profile?.mention_count ?? 0,
      aliases: e.aliases || []
    };
  });

  const entitiesWithMentions = entitySummaries.filter(e => e.mentionCount > 0);
  const zeroMentionEntities = entitySummaries.filter(e => e.mentionCount === 0);

  const entityCountsByType = countBy(entitiesWithMentions.map(e => e.type));
  const relationCountsByType = countBy(result.relations.map(r => r.pred));

  const topEntitiesByMentions = [...entitiesWithMentions]
    .sort(sortEntitiesForDisplay)
    .slice(0, 20);

  const entityById = new Map(result.entities.map(e => [e.id, e.canonical]));
  const relationSummaries: RelationSummary[] = result.relations.map(rel => ({
    id: rel.id,
    pred: rel.pred,
    subj: entityById.get(rel.subj) || rel.subj,
    obj: entityById.get(rel.obj) || rel.obj
  }));

  const topRelations = Object.entries(relationCountsByType)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 10)
    .map(([pred, count]) => ({ pred, count }));

  const summary = {
    meta: {
      docId: 'barty-full-v1',
      manuscriptPath,
      totalWords,
      chunkCount,
      processingTimeMs
    },
    aggregates: {
      entityCountsByType,
      relationCountsByType,
      topEntitiesByMentions,
      topRelations
    },
    entities: entitiesWithMentions,
    zeroMentionEntities,
    relations: relationSummaries
  };

  console.log(`Total words: ${totalWords}`);
  console.log(`Chunks: ${chunkCount}`);
  console.log('Entities by type:');
  for (const [type, count] of Object.entries(entityCountsByType)) {
    console.log(`  ${type}: ${count}`);
  }

  console.log('\nTop 20 entities by mentions:');
  topEntitiesByMentions.forEach((e, idx) => {
    console.log(`  ${idx + 1}. ${e.canonicalName} (${e.type}) – ${e.mentionCount}`);
  });

  console.log('\nRelations by type:');
  for (const [pred, count] of Object.entries(relationCountsByType)) {
    console.log(`  ${pred}: ${count}`);
  }

  const outPath = path.resolve(__dirname, '..', 'out', 'barty-full-summary.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(`\nWrote summary JSON to ${outPath}`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
