/**
 * HERT Integration Demo
 *
 * Demonstrates how to use the HERT system in a real workflow:
 * 1. Extract entities with EID assignment (Phase 1)
 * 2. Generate HERTs for entity references (Phase 2)
 * 3. Query and analyze entity occurrences across documents
 * 4. Export for external use (URLs, citations, linking)
 */

import { extractFromSegments } from './app/engine/extract/orchestrator';
import { getEIDRegistry } from './app/engine/eid-registry';
import { getHERTStore } from './app/storage/hert-store';
import { decodeHERT, encodeHERTReadable } from './app/engine/hert';
import { DEFAULT_LLM_CONFIG } from './app/engine/llm-config';

// Sample Lord of the Rings corpus
const CORPUS = [
  {
    id: 'lotr/fellowship/ch01',
    title: 'The Fellowship of the Ring - Chapter 1',
    text: `
Gandalf the Grey arrived in the Shire. He sought out Frodo Baggins, nephew of
Bilbo Baggins. Gandalf brought grave news about the One Ring that Bilbo had found
in his adventures. The wizard explained that Sauron was searching for the Ring.

Frodo learned that he must leave the Shire and travel to Rivendell. Gandalf would
meet him there, at the house of Elrond. Sam, Frodo's loyal companion, insisted on
joining the quest.
`
  },
  {
    id: 'lotr/fellowship/ch05',
    title: 'The Fellowship of the Ring - Chapter 5',
    text: `
At Rivendell, Elrond convened the Council. Gandalf spoke of the danger facing
Middle-earth. Aragorn revealed his lineage - he was the heir of Isildur, rightful
king of Gondor. Boromir of Gondor also attended the council.

Frodo volunteered to carry the Ring to Mount Doom. The Fellowship was formed:
Gandalf, Aragorn, Boromir, Legolas, Gimli, and the four hobbits. Together they
would attempt to destroy Sauron's power.
`
  },
  {
    id: 'lotr/two-towers/ch03',
    title: 'The Two Towers - Chapter 3',
    text: `
Gandalf returned, now as Gandalf the White. He brought Aragorn, Legolas, and Gimli
to Edoras, capital of Rohan. There they met King Théoden, who was under the influence
of Saruman through his advisor Gríma Wormtongue.

Gandalf freed Théoden from Saruman's spell. The king prepared Rohan for war against
Saruman's army. Aragorn counseled Théoden on strategy. They would make their stand
at Helm's Deep.
`
  },
  {
    id: 'lotr/return-king/ch05',
    title: 'The Return of the King - Chapter 5',
    text: `
Aragorn led the army of Gondor to the Black Gate. Gandalf rode beside him. They
challenged Sauron's forces as a diversion - Frodo and Sam needed time to reach
Mount Doom with the Ring.

At the battle, Aragorn wielded Andúril, sword of kings. The men of Gondor fought
bravely. When the Ring was finally destroyed, Sauron was defeated. Aragorn was
crowned king, and Gandalf witnessed the restoration of peace to Middle-earth.
`
  }
];

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     HERT Integration Demo - LOTR Corpus                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const eidRegistry = getEIDRegistry('./data/demo-eid-registry.json');
  const hertStore = getHERTStore('./data/demo-herts.json');

  // Clear for fresh demo
  hertStore.clear();

  console.log('📚 Processing Lord of the Rings corpus...\n');

  // Phase 1 & 2: Extract entities and generate HERTs
  for (const doc of CORPUS) {
    console.log(`Processing: ${doc.title}`);

    const result = await extractFromSegments(
      doc.id,
      doc.text,
      undefined,
      DEFAULT_LLM_CONFIG,
      undefined,
      {
        generateHERTs: true,
        autoSaveHERTs: true
      }
    );

    console.log(`  ✓ Extracted ${result.entities.length} entities`);
    console.log(`  ✓ Generated ${result.herts?.length || 0} HERTs\n`);
  }

  // Show EID Registry
  console.log('\n═══ EID Registry ═══\n');
  const stats = eidRegistry.getStats();
  console.log(`Total entities: ${stats.total_entities}`);
  console.log('\nTop entities by occurrence:');
  stats.most_common.slice(0, 10).forEach((e, i) => {
    const eid = eidRegistry.get(e.canonical);
    console.log(`  ${i + 1}. [EID ${eid}] ${e.canonical} - ${e.count} occurrences`);
  });

  // Show HERT Store
  console.log('\n═══ HERT Store ═══\n');
  const storeStats = hertStore.getStats();
  console.log(`Total references: ${storeStats.total_refs}`);
  console.log(`Documents indexed: ${storeStats.total_documents}`);
  console.log(`Entities tracked: ${storeStats.total_entities}`);

  // Example 1: Track Gandalf across all documents
  console.log('\n═══ Example 1: Track "Gandalf" Across Documents ═══\n');

  const gandalfEID = eidRegistry.get('Gandalf the Grey') || eidRegistry.get('Gandalf the White') || eidRegistry.get('Gandalf');
  if (gandalfEID) {
    const gandalfHERTs = hertStore.getDecodedByEntity(gandalfEID);
    console.log(`Entity: Gandalf (EID ${gandalfEID})`);
    console.log(`Total mentions: ${gandalfHERTs.length}\n`);

    // Group by document
    const byDoc = new Map<string, typeof gandalfHERTs>();
    for (const hert of gandalfHERTs) {
      const didStr = hert.did.toString();
      if (!byDoc.has(didStr)) {
        byDoc.set(didStr, []);
      }
      byDoc.get(didStr)!.push(hert);
    }

    console.log(`Appears in ${byDoc.size} documents:`);
    let docNum = 1;
    for (const [didStr, herts] of byDoc.entries()) {
      // Find document by DID (in real app, you'd have a DID→doc mapping)
      const doc = CORPUS.find((_, idx) => idx < docNum);
      console.log(`\n  Document ${docNum}: ${doc?.title || 'Unknown'}`);
      console.log(`  Mentions: ${herts.length}`);

      // Show first 3 mentions with readable format
      herts.slice(0, 3).forEach((hert, i) => {
        const readable = encodeHERTReadable(hert);
        console.log(`    ${i + 1}. ${readable}`);
      });

      docNum++;
    }
  }

  // Example 2: Find all entities in a specific chapter
  console.log('\n═══ Example 2: All Entities in Chapter 5 (Council of Elrond) ═══\n');

  const ch5Doc = CORPUS[1];
  const ch5Result = await extractFromSegments(
    ch5Doc.id,
    ch5Doc.text,
    undefined,
    DEFAULT_LLM_CONFIG
  );

  console.log(`Chapter: ${ch5Doc.title}`);
  console.log(`Entities found: ${ch5Result.entities.length}\n`);

  // Show entities with their EIDs and occurrence counts
  const entityCounts = new Map<number, { canonical: string; count: number }>();
  for (const entity of ch5Result.entities) {
    if (entity.eid) {
      const herts = hertStore.getByEntity(entity.eid);
      entityCounts.set(entity.eid, {
        canonical: entity.canonical,
        count: herts.length
      });
    }
  }

  const sorted = Array.from(entityCounts.entries()).sort((a, b) => b[1].count - a[1].count);
  console.log('Entities (sorted by total corpus mentions):');
  sorted.forEach(([eid, data], i) => {
    console.log(`  ${i + 1}. [EID ${eid}] ${data.canonical} - ${data.count} total mentions`);
  });

  // Example 3: Generate URLs/citations using HERTs
  console.log('\n═══ Example 3: Generate Citations Using HERTs ═══\n');

  if (gandalfEID) {
    const firstMention = hertStore.getByEntity(gandalfEID)[0];
    if (firstMention) {
      const decoded = decodeHERT(firstMention);

      console.log('First mention of Gandalf:');
      console.log(`  Compact HERT: ${firstMention}`);
      console.log(`  Readable: ${encodeHERTReadable(decoded)}`);
      console.log(`  URL format: https://lotr.example.com/ref/${firstMention}`);
      console.log(`  Citation: [Gandalf, ${firstMention.substring(7, 20)}...]`);
    }
  }

  // Example 4: Cross-reference entities
  console.log('\n═══ Example 4: Entity Co-occurrence Analysis ═══\n');

  const aragornEID = eidRegistry.get('Aragorn');
  const gandalfEID2 = gandalfEID;

  if (aragornEID && gandalfEID2) {
    const aragornHERTs = hertStore.getDecodedByEntity(aragornEID);
    const gandalfHERTs2 = hertStore.getDecodedByEntity(gandalfEID2);

    // Find documents where both appear
    const aragornDocs = new Set(aragornHERTs.map(h => h.did.toString()));
    const gandalfDocs = new Set(gandalfHERTs2.map(h => h.did.toString()));

    const sharedDocs = Array.from(aragornDocs).filter(d => gandalfDocs.has(d));

    console.log(`Aragorn: ${aragornHERTs.length} mentions in ${aragornDocs.size} documents`);
    console.log(`Gandalf: ${gandalfHERTs2.length} mentions in ${gandalfDocs.size} documents`);
    console.log(`Both appear together in: ${sharedDocs.length} documents`);
  }

  // Save results
  console.log('\n═══ Saving Results ═══\n');

  eidRegistry.save();
  hertStore.save();

  console.log('✓ EID Registry saved to ./data/demo-eid-registry.json');
  console.log('✓ HERT Store saved to ./data/demo-herts.json');

  console.log('\n═══ Summary ═══\n');
  console.log('The HERT system provides:');
  console.log('  ✓ Stable entity IDs across documents (EID)');
  console.log('  ✓ Compact entity references (7.4x compression)');
  console.log('  ✓ Fast cross-document entity tracking');
  console.log('  ✓ URL-safe reference strings for linking');
  console.log('  ✓ Precise location tracking (paragraph + token offset)');
  console.log('  ✓ Persistent storage for long-term projects');
  console.log('\nNext steps:');
  console.log('  • Integrate contextual resolver for better entity linking');
  console.log('  • Add alias resolution (HERT Phase 3)');
  console.log('  • Build UI for browsing entity references');
  console.log('  • Export to external knowledge graphs\n');
}

// Run demo
main().catch(console.error);
