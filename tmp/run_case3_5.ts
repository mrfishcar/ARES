import { appendDoc, loadGraph, clearStorage } from '../app/storage/storage';

const text = `The Weasley family lived at the Burrow. Molly Weasley was Arthur's wife. Their children included Ron, Ginny, Fred, and George.\n\nBill Weasley, the eldest son, worked for Gringotts Bank.`;

async function main() {
  await clearStorage('/tmp/graph_case35.json');
  await appendDoc('3.5', text, '/tmp/graph_case35.json');
  const graph = loadGraph('/tmp/graph_case35.json');
  if (!graph) {
    console.error('no graph');
    return;
  }
  console.log('entities:', graph.entities.map(e => `${e.type}::${e.canonical}`));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
