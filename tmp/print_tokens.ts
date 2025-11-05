import { parseWithService } from '../app/engine/extract/entities';

const text = `Their children included Ron, Ginny, Fred, and George.`;

parseWithService(text).then(res => {
  for (const sent of res.sentences) {
    console.log('Sentence', sent.sentence_index);
    for (const tok of sent.tokens) {
      console.log(`${tok.i}\t${tok.text}\t${tok.dep}\t${tok.head}\t${tok.ent}`);
    }
  }
}).catch(err => console.error(err));
