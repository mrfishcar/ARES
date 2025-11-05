/**
 * Demo: Generate Wiki Page for Entity FROM STORED GRAPH
 * Usage:
 *   npx ts-node tests/demo-generate-from-storage.ts "David"
 *   npx ts-node tests/demo-generate-from-storage.ts "Samuel"
 */

import { loadGraph } from "../app/storage/storage";
import { compose } from "../app/generate/exposition";
import { toMarkdownPage } from "../app/generate/markdown";

async function main() {
  const name = (process.argv[2] || "").trim();
  if (!name) {
    console.error('Usage: npx ts-node tests/demo-generate-from-storage.ts "EntityName"');
    process.exit(1);
  }

  const graph = loadGraph();

  if (!graph) {
    console.error("❌ No stored graph found. Run the ingestion pipeline first.");
    process.exit(1);
  }

  const { entities, relations, conflicts } = graph;

  // Case-insensitive match on canonical or alias (substring match allowed for canonical)
  const q = name.toLowerCase();
  const target = entities.find(e => {
    const canonical = e.canonical?.toLowerCase() ?? "";
    const aliases = Array.isArray((e as any).aliases) ? (e as any).aliases : [];

    return (
      canonical === q ||
      canonical.includes(q) ||
      aliases.some((a: string) => a.toLowerCase() === q)
    );
  });

  if (!target) {
    console.log(`❌ Entity "${name}" not found in stored graph.`);
    const sample = entities
      .filter(e => e.type === "PERSON")
      .slice(0, 20)
      .map(e => e.canonical);
    console.log("Sample PERSON entities:", sample);
    process.exit(0);
  }

  const page = compose(target.id, entities, relations, conflicts ?? []);
  const markdown = toMarkdownPage(page);

  const fs = await import("fs");
  const outPath = `Wiki_${target.canonical.replace(/\s+/g, "_")}.md`;
  fs.writeFileSync(outPath, markdown, "utf8");

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(markdown);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Saved to ${outPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
