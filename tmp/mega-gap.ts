import * as fs from 'fs';
import * as path from 'path';
import { appendDoc, loadGraph, clearStorage } from '../app/storage/storage';
import type { Entity, Relation } from '../app/engine/schema';

interface GoldEntity { text: string; type: string; }
interface GoldRelation { subj: string; pred: string; obj: string; }
interface MegaCase {
  id: string;
  title: string;
  text: string;
  gold: { entities: GoldEntity[]; relations: GoldRelation[] };
}

const casePath = path.resolve(__dirname, '../tests/mega/cases/mega-001.json');
const megaCase = JSON.parse(fs.readFileSync(casePath, 'utf-8')) as MegaCase;
const storagePath = path.resolve(__dirname, 'mega-debug-storage.json');

(async () => {
  clearStorage(storagePath);
  await appendDoc(megaCase.id, megaCase.text, storagePath);
  const graph = loadGraph(storagePath);
  if (!graph) {
    console.error('Failed to load graph.');
    return;
  }

  const goldEntities = new Set<string>(
    megaCase.gold.entities.map((e) => `${e.type.toUpperCase()}::${e.text.toLowerCase()}`)
  );
  const goldRelations = new Set<string>(
    megaCase.gold.relations.map((r) => `${r.subj.toLowerCase()}::${r.pred}::${r.obj.toLowerCase()}`)
  );

  const extractedEntities = new Set<string>(
    graph.entities.map((e: Entity) => `${e.type.toUpperCase()}::${e.canonical.toLowerCase()}`)
  );
  const extraEntities = Array.from(extractedEntities).filter((e) => !goldEntities.has(e));
  const missingEntities = Array.from(goldEntities).filter((e) => !extractedEntities.has(e));

  const extractedRelations = new Set<string>(
    graph.relations.map((rel: Relation) => {
      const subj = graph.entities.find((e: Entity) => e.id === rel.subj)?.canonical.toLowerCase() ?? '';
      const obj = graph.entities.find((e: Entity) => e.id === rel.obj)?.canonical.toLowerCase() ?? '';
      return `${subj}::${rel.pred}::${obj}`;
    })
  );
  const extraRelations = Array.from(extractedRelations).filter((r) => !goldRelations.has(r));
  const missingRelations = Array.from(goldRelations).filter((r) => !extractedRelations.has(r));

  console.log('Extra Entities:', extraEntities);
  console.log('Missing Entities:', missingEntities);
  console.log('Extra Relations:', extraRelations);
  console.log('Missing Relations:', missingRelations);
})();
