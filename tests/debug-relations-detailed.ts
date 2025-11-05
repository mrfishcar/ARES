import { extractEntities } from '../app/engine/extract/entities';
import { extractRelations } from '../app/engine/extract/relations';

async function debug() {
  // Test HP teaches
  const hp = `Professor McGonagall teaches at Hogwarts.`;
  const hpResult = await extractEntities(hp);

  console.log('\n=== HP Debug ===');
  console.log('Text:', hp);
  console.log('Entities:', hpResult.entities.map(e => ({
    id: e.id.slice(0, 8),
    type: e.type,
    name: e.canonical
  })));
  console.log('Spans:', hpResult.spans.map(s => ({
    entity_id: s.entity_id.slice(0, 8),
    start: s.start,
    end: s.end,
    text: hp.slice(s.start, s.end)
  })));

  const hpRels = await extractRelations(hp, hpResult, 'test');
  console.log('Relations:', hpRels.map(r => ({
    pred: r.pred,
    subj: hpResult.entities.find(e => e.id === r.subj)?.canonical,
    obj: hpResult.entities.find(e => e.id === r.obj)?.canonical,
    subjId: r.subj.slice(0, 8),
    objId: r.obj.slice(0, 8)
  })));

  // Test Bible begat
  const bible = `Abram begat Isaac. Isaac begat Jacob. Jacob dwelt in Hebron.`;
  const bibleResult = await extractEntities(bible);

  console.log('\n=== Bible Debug ===');
  console.log('Text:', bible);
  console.log('Entities:', bibleResult.entities.map(e => ({
    id: e.id.slice(0, 8),
    type: e.type,
    name: e.canonical
  })));
  console.log('Spans:', bibleResult.spans.map(s => ({
    entity_id: s.entity_id.slice(0, 8),
    start: s.start,
    end: s.end,
    text: bible.slice(s.start, s.end)
  })));

  const bibleRels = await extractRelations(bible, bibleResult, 'test');
  console.log('Relations:', bibleRels.map(r => ({
    pred: r.pred,
    subj: bibleResult.entities.find(e => e.id === r.subj)?.canonical,
    obj: bibleResult.entities.find(e => e.id === r.obj)?.canonical,
    evidence_span: r.evidence[0].span.text,
    evidence_start: r.evidence[0].span.start,
    evidence_end: r.evidence[0].span.end
  })));
}

debug();
