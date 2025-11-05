/**
 * Probe: run entity extractor over a raw text file and print top PERSON entities
 * Usage: npx ts-node scripts/probe-file.ts data/1_samuel.txt
 */

import fs from "fs";
import path from "path";
import { extractEntities } from "../app/engine/extract/entities";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: npx ts-node scripts/probe-file.ts <path/to/text.txt>");
    process.exit(1);
  }

  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) {
    console.error(`❌ File not found: ${resolved}`);
    process.exit(1);
  }

  const text = fs.readFileSync(resolved, "utf8");

  const { entities } = await extractEntities(text);
  const persons = entities
    .filter(e => e.type === "PERSON")
    .map(e => e.canonical);

  const freq = new Map<string, number>();
  for (const name of persons) {
    freq.set(name, (freq.get(name) || 0) + 1);
  }

  const top = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);

  console.log(`Found ${persons.length} PERSON mentions; top 30 by frequency:\n`);
  for (const [name, count] of top) {
    console.log(`${count.toString().padStart(4, " ")}  ${name}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
