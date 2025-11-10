import fs from 'node:fs';
import readline from 'node:readline';
import { runEntityPass } from '../../app/engine/extract/entity-pass';
import { projectHints } from '../../app/engine/extract/entity-hint-adapter';

// Fake tokenizer by whitespace + offsets (replace with spaCy tokens if available)
function whitespaceTokens(text: string) {
  const out: any[] = [];
  let idx = 0;
  for (const w of text.split(/\s+/)) {
    const start = text.indexOf(w, idx);
    const end = start + w.length;
    out.push({ i: out.length, text: w, start, end });
    idx = end + 1;
  }
  return out;
}

(async () => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>(res => rl.question(q, res));
  const raw = await ask('Text: ');
  rl.close();

  const { text, entities } = runEntityPass(raw);
  const tokens = whitespaceTokens(text);
  const proj = projectHints(tokens as any, entities);

  console.log('\nNormalized Text:\n', text);
  console.log('\nEntities:', entities);
  console.log('\nToken Map:');
  tokens.forEach(t => console.log(`${t.i}\t${t.text}\t[${t.start},${t.end})\t${proj.tokenTypes[t.i]}`));
})();
