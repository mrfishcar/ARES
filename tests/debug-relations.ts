import { extractEntities } from '../app/engine/extract/entities';
import { extractRelations } from '../app/engine/extract/relations';

async function debug() {
  // Test 1: LotR married_to
  const lotr = `Aragorn, son of Arathorn, married Arwen in 3019. Gandalf the Grey traveled to Minas Tirith.`;
  const lotrResult = await extractEntities(lotr);
  const lotrRels = await extractRelations(lotr, lotrResult, 'test');

  console.log('\n=== LotR Relations ===');
  console.log('Entities:', lotrResult.entities.map(e => ({ id: e.id.slice(0, 8), type: e.type, name: e.canonical })));
  console.log('Relations:', lotrRels.map(r => ({
    pred: r.pred,
    subj: lotrResult.entities.find(e => e.id === r.subj)?.canonical,
    obj: lotrResult.entities.find(e => e.id === r.obj)?.canonical
  })));

  // Test 2: HP teaches_at
  const hp = `Harry Potter studies at Hogwarts. Professor McGonagall teaches at Hogwarts.`;
  const hpResult = await extractEntities(hp);
  const hpRels = await extractRelations(hp, hpResult, 'test');

  console.log('\n=== Harry Potter Relations ===');
  console.log('Entities:', hpResult.entities.map(e => ({ id: e.id.slice(0, 8), type: e.type, name: e.canonical })));
  console.log('Relations:', hpRels.map(r => ({
    pred: r.pred,
    subj: hpResult.entities.find(e => e.id === r.subj)?.canonical,
    obj: hpResult.entities.find(e => e.id === r.obj)?.canonical
  })));

  // Test 3: Bible begat
  const bible = `Abram begat Isaac. Isaac begat Jacob. Jacob dwelt in Hebron.`;
  const bibleResult = await extractEntities(bible);
  const bibleRels = await extractRelations(bible, bibleResult, 'test');

  console.log('\n=== Bible Relations ===');
  console.log('Entities:', bibleResult.entities.map(e => ({ id: e.id.slice(0, 8), type: e.type, name: e.canonical })));
  console.log('Relations:', bibleRels.map(r => ({
    pred: r.pred,
    subj: bibleResult.entities.find(e => e.id === r.subj)?.canonical,
    obj: bibleResult.entities.find(e => e.id === r.obj)?.canonical
  })));
}

debug();
