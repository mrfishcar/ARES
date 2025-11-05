import { parseWithService } from '../app/engine/extract/entities';

parseWithService(`Bill Weasley, the eldest son, worked for Gringotts Bank.`).then(res => {
  for (const sent of res.sentences) {
    for (const tok of sent.tokens) {
      console.log(`${tok.i}\t${tok.text}\t${tok.dep}\t${tok.head}\t${tok.ent}\t${tok.pos}`);
    }
  }
});
