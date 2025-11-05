import { extractEntities } from '../app/engine/extract/entities';

const text = `In 1991, Harry Potter started at Hogwarts School. He quickly became friends with Ron and Hermione.

During his first year, Harry faced Voldemort in the chamber. The young wizard survived the encounter.`;

extractEntities(text).then(({ entities }) => {
  for (const ent of entities) {
    console.log(ent.type, ent.canonical);
  }
});
