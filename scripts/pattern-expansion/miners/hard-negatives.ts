import fs from 'node:fs';
import readline from 'node:readline';

export async function mineFromFP(fpPath: string, outPath: string) {
  const rl = readline.createInterface({ input: fs.createReadStream(fpPath) });
  const out = fs.createWriteStream(outPath, { flags: 'a' });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line);
    const text = rec.text || rec.sentence || '';
    const family = (rec.family || rec.relation_family || 'unknown').toLowerCase();
    if (!text) continue;
    const variants = [
      `"${text}"`,
      `If it were true that ${text}`,
      `${text} — definition: (not an assertion)`
    ];
    for (const v of variants) {
      out.write(JSON.stringify({ text: v, gold_relations: [], family, is_hard_negative: true }) + "\n");
    }
  }
  rl.close(); out.close();
}
