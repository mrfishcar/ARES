import fs from 'fs';
import path from 'path';
import { appendDoc, clearStorage } from '../storage/storage';
import type { Entity } from '../engine/schema';

export interface ExtractionJobPayload {
  success: true;
  entities: Array<{
    id: string;
    text: string;
    type: string;
    confidence: number;
    spans: Array<{ start: number; end: number }>;
    aliases: string[];
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
  stats: {
    extractionTime: number;
    entityCount: number;
    relationCount: number;
    conflictCount: number;
  };
  fictionEntities: any[];
}

function buildTempPath(jobId: string): string {
  const dir = path.join(process.cwd(), 'data', 'job-runs');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${jobId}.json`);
}

function buildEntitySpans(text: string, entities: Entity[]) {
  return entities.map(entity => {
    const escapedCanonical = entity.canonical.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedCanonical}\\b`, 'gi');
    const matches: Array<{ start: number; end: number }> = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
      });
    }

    return {
      id: entity.id,
      text: entity.canonical,
      type: entity.type,
      confidence: entity.confidence || 0.5,
      spans: matches,
      aliases: entity.aliases || [],
    };
  });
}

export async function runExtractionJob(docId: string, text: string): Promise<ExtractionJobPayload> {
  const tempPath = buildTempPath(docId);
  const startTime = Date.now();

  try {
    clearStorage(tempPath);
    const appendResult = await appendDoc(docId, text, tempPath);
    const extractTime = Date.now() - startTime;

    const rawEntities = appendResult.localEntities?.length
      ? appendResult.localEntities
      : appendResult.entities;
    const entitySpans = buildEntitySpans(text, rawEntities);

    const entityMap = new Map<string, Entity>();
    for (const entity of rawEntities) {
      entityMap.set(entity.id, entity);
    }
    for (const entity of appendResult.entities) {
      if (!entityMap.has(entity.id)) {
        entityMap.set(entity.id, entity);
      }
    }

    const relations = appendResult.relations.map(rel => ({
      id: rel.id,
      subj: rel.subj,
      obj: rel.obj,
      pred: rel.pred,
      confidence: rel.confidence,
      subjCanonical: entityMap.get(rel.subj)?.canonical || 'UNKNOWN',
      objCanonical: entityMap.get(rel.obj)?.canonical || 'UNKNOWN',
    }));

    return {
      success: true,
      entities: entitySpans,
      relations,
      stats: {
        extractionTime: extractTime,
        entityCount: rawEntities.length,
        relationCount: appendResult.relations.length,
        conflictCount: appendResult.conflicts?.length ?? 0,
      },
      fictionEntities: appendResult.fictionEntities?.slice(0, 15) ?? [],
    };
  } finally {
    clearStorage(tempPath);
  }
}
