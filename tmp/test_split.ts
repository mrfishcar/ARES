import { parseWithService, normalizeName } from '../app/engine/extract/entities';
import type { EntityType } from '../app/engine/schema';

function nerSpansLocal(sent: any): Array<{ text: string; type: EntityType; start: number; end: number }> {
  const spans: { text: string; type: EntityType; start: number; end: number }[] = [];
  let i = 0;
  while (i < sent.tokens.length) {
    const tok = sent.tokens[i];
    const mapped = tok.ent;
    if (!mapped) {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < sent.tokens.length && sent.tokens[j].ent === tok.ent) {
      j++;
    }
    const chunk = sent.tokens.slice(i, j);
    spans.push({
      text: normalizeName(chunk.map((t: any) => t.text).join(' ')),
      type: mapped === 'PERSON' ? 'PERSON' : mapped === 'ORG' ? 'ORG' : 'HOUSE',
      start: chunk[0].start,
      end: chunk[chunk.length - 1].end
    });
    i = j;
  }
  return spans;
}

(async () => {
  const parsed = await parseWithService(`He quickly became friends with Ron and Hermione.`);
  const sent = parsed.sentences[0];
  const spans = nerSpansLocal(sent);
  console.log('ner spans before split', spans);
})();
