const fs = require('fs');
const path = require('path');
const { appendDoc, loadGraph, clearStorage } = require('../app/storage/storage');

const casePath = path.resolve(__dirname, '../tests/mega/cases/mega-001.json');
const megaCase = JSON.parse(fs.readFileSync(casePath, 'utf-8'));
const storagePath = path.resolve(__dirname, 'mega-debug-storage.json');

(async () => {
  clearStorage(storagePath);
  await appendDoc(megaCase.id, megaCase.text, storagePath);
  const graph = loadGraph(storagePath);

  const goldEntities = new Set(
    megaCase.gold.entities.map((e) => `${e.type.toUpperCase()}::${e.text.toLowerCase()}`)
  );
  const goldRelations = new Set(
    megaCase.gold.relations.map((r) => `${r.subj.toLowerCase()}::${r.pred}::${r.obj.toLowerCase()}`)
  );

  const extractedEntities = new Set(
    graph.entities.map((e) => `${e.type.toUpperCase()}::${e.canonical.toLowerCase()}`)
  );
  const extraEntities = Array.from(extractedEntities).filter((e) => !goldEntities.has(e));
  const missingEntities = Array.from(goldEntities).filter((e) => !extractedEntities.has(e));

  const extractedRelations = new Set(
    graph.relations.map((rel) => {
      const subj = graph.entities.find((e) => e.id === rel.subj)?.canonical.toLowerCase() ?? '';
      const obj = graph.entities.find((e) => e.id === rel.obj)?.canonical.toLowerCase() ?? '';
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
