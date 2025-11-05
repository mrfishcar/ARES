import { extractEntities } from '../app/engine/extract/entities';

const text = `Professor McGonagall taught Transfiguration at Hogwarts. She was also the head of Gryffindor House.

Professor Snape taught Potions. The stern professor later became headmaster.`;
extractEntities(text).then(({ entities }) => {
  console.log(entities.map(e => `${e.type}:${e.canonical}`));
});
