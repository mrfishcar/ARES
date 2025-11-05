import { parseWithService } from '../app/engine/extract/entities';

const text = `In 1991, Harry Potter started at Hogwarts School. He quickly became friends with Ron and Hermione.

During his first year, Harry faced Voldemort in the chamber. The young wizard survived the encounter.`;

parseWithService(text).then(res => {
  for (const sent of res.sentences) {
    console.log('Sentence', sent.sentence_index);
    for (const tok of sent.tokens) {
      console.log(`${tok.i}\t${tok.text}\t${tok.lemma}\t${tok.dep}\t${tok.head}\t${tok.ent}`);
    }
  }
});
