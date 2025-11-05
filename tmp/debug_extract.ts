import { extractFromSegments } from '../app/engine/extract/orchestrator';

const text = `Harry Potter was the son of James and Lily Potter. He lived with the Dursleys in Privet Drive.

Harry's best friend was Ron Weasley. Ron came from a large wizarding family. His father Arthur worked at the Ministry of Magic.`;

extractFromSegments('3.1', text).then(({ entities }) => {
  console.log(entities.map(e => `${e.type}: ${e.canonical}`));
}).catch(err => {
  console.error(err);
});
