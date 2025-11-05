import { parseWithService } from '../app/engine/extract/entities';

parseWithService(`He became friends with Ron and Hermione.`).then(res => {
  for (const sent of res.sentences) {
    for (const tok of sent.tokens) {
      console.log(`${tok.i}\t${tok.text}\t${tok.dep}\t${tok.head}\t${tok.ent}`);
    }
  }
});
