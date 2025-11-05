import { parseWithService } from '../app/engine/extract/entities';
parseWithService(`The Weasley family lived at the Burrow.`).then(res => {
  for (const sent of res.sentences) {
    for (const tok of sent.tokens) {
      console.log(`${tok.i}\t${tok.text}\t${tok.dep}\t${tok.head}\t${tok.ent}\t${tok.pos}`);
    }
  }
});
