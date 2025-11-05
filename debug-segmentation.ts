import { segmentDocument } from './app/engine/segmenter';

async function debug() {
  const text = `Harry Potter was the son of James and Lily Potter. He lived with the Dursleys in Privet Drive.

Harry's best friend was Ron Weasley. Ron came from a large wizarding family. His father Arthur worked at the Ministry of Magic.`;

  console.log(`Text:\n"${text}"\n`);
  console.log(`Length: ${text.length}\n`);

  const segs = segmentDocument('test', text);

  console.log(`Segments (${segs.length}):\n`);
  for (const seg of segs) {
    console.log(`[Para ${seg.paraIndex}, Sent ${seg.sentIndex}] [${seg.start}-${seg.end}]:`);
    console.log(`  "${seg.text}"`);
    console.log();
  }
}

debug().catch(console.error);
