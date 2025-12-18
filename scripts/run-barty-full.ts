import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';

import { extractFromSegments } from '../app/engine/extract/orchestrator';
import { segmentDocument } from '../app/engine/segmenter';
import type { EntityType, Relation } from '../app/engine/schema';

/* ---------------------------
   Summary Types
---------------------------- */

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

/* ---------------------------
   Helpers
---------------------------- */

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
  // 1. Primary: Mention count
  if (b.mentionCount !== a.mentionCount) {
    return b.mentionCount - a.mentionCount;
  }

  // 2. Secondary: type priority
  const typeOrder: Partial<Record<EntityType, number>> = {
    PERSON: 0,
    ORG: 1,
    PLACE: 2,
    EVENT: 3,
    RACE: 4,
    ARTIFACT: 5,
    MAGIC: 6,
    SPELL: 7,
    MATERIAL: 8,
    DEITY: 9,
    DATE: 10
  };

  const aOrder = typeOrder[a.type] ?? 99;
  const bOrder = typeOrder[b.type] ?? 99;

  if (aOrder !== bOrder) {
    return aOrder - bOrder;
  }

  // 3. Final: alphabetical by name
  return a.canonicalName.localeCompare(b.canonicalName);
}

/* ---------------------------
   Main Runner
---------------------------- */

async function run() {
  const start = performance.now();

  // Load Barty text
  const manuscriptPath = path.join(process.cwd(), 'barty.txt');
  const text = fs.readFileSync(manuscriptPath, 'utf-8');
  const totalWords = countWords(text);

  console.log(`[run-barty-full] Loaded manuscript: ${totalWords} words`);

  // Segment into chunks
  const segments = segmentDocument('barty-full-run', text);
  console.log(`[run-barty-full] Segmented into ${segments.length} chunks`);

  // Extract entities/relations
  const results = await extractFromSegments('barty-full-run', text);

  const { entities, relations } = results;

  /* ---------------------------
     Build Output Summary
  ---------------------------- */

  const entitySummaries: EntitySummary[] = entities.map(e => ({
    id: e.id,
    canonicalName: e.canonical,
    type: e.type,
    mentionCount: 1, // Each entity represents at least 1 mention
    aliases: [...(e.aliases ?? [])]
  }));

  const sortedEntities = entitySummaries
    .sort(sortEntitiesForDisplay);

  const relationsOut: RelationSummary[] = relations.map(r => ({
    id: r.id,
    pred: r.pred,
    subj: r.subj,
    obj: r.obj
  }));

  const summary = {
    totalWords,
    chunkCount: segments.length,
    entityCount: entities.length,
    relationCount: relations.length,
    entityStats: results.stats?.entities,
    entitiesByType: countBy(entitySummaries.map(e => e.type)),
    topEntities: sortedEntities.slice(0, 30),
    relations: relationsOut
  };

  /* ---------------------------
     Write Output
  ---------------------------- */

  const outPath = path.join(process.cwd(), 'out', 'barty-full-summary.json');

  if (!fs.existsSync(path.dirname(outPath))) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
  }

  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), 'utf-8');

  const elapsed = performance.now() - start;
  console.log(
    `[run-barty-full] Finished full extraction in ${(elapsed / 1000).toFixed(
      2
    )} seconds`
  );
  console.log(`[run-barty-full] Output written to ${outPath}`);

  // Force Node to exit cleanly
  process.exit(0);
}

run().catch(err => {
  console.error('[run-barty-full] FAILED:', err);
  process.exit(1);
});
