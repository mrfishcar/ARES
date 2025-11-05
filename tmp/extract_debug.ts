import { parseWithService, normalizeName } from '../app/engine/extract/entities';
import type { EntityType } from '../app/engine/schema';
import { resolveCoref } from '../app/engine/coref';
import { splitIntoSentences } from '../app/engine/segment';
import { segmentDocument } from '../app/engine/segmenter';

const text = `He quickly became friends with Ron and Hermione.`;

(async () => {
  const parsed = await parseWithService(text);
  const ner = parsed.sentences.flatMap(sent => ({ sent, spans: sent }));
})();
