import { extractEntities } from '../app/engine/extract/entities';

const text = `He quickly became friends with Ron and Hermione.`;
extractEntities(text).then(({ entities, spans }) => {
  console.log('Entities:', entities.map(e => `${e.type}:${e.canonical}`));
  console.log('Spans:', spans);
}).catch(console.error);
