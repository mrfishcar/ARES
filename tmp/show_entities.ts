import { extractEntities } from '../app/engine/extract/entities';

const text = `He quickly became friends with Ron and Hermione.`;
extractEntities(text).then(({ entities }) => {
  console.log(JSON.stringify(entities, null, 2));
});
