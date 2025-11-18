/**
 * Test pronoun fix with Frederick/Saul story
 * Verify pronouns are NOT in entity.aliases
 */

import { extractEntitiesAndRelations } from './dist/app/engine/extract/orchestrator.js';

const FREDERICK_SAUL_STORY = `Frederick rapped on the door twice. The white columns before him seemed to reach up to the Heavens, this world's or any other's. He had come from a humble apartment in a nearby city. Justice moved him. God knew the mailman who lived beyond this door had killed his wife. The caged wall lamps hanging from the porch's rafters looked on, uncaring.

A shadow appeared behind the frosted panes. Heavy locks clicked and grinded and the door finally swung inward.

"Hello, Frederick," Charles Garrison greeted. "How was your journey?"

Frederick spoke: "Steamy. Familiar. Like I've been here before."

"Are you in the mood for some songs?" Charles asked. "I've got a new record that just arrived, and I bet it'll make you glad you drove all this way."

"Sure." Frederick paused. "I have some questions, Charles. There were things I was hoping we could discuss. You're a powerful man, a man of certain connections. I'm hoping that—"

"Frederick." Charles gently interrupted. "Let's sit, have a drink, and listen to the record first, all right? I think you'll be able to find the answers you seek very soon."

"Of course," Frederick said. "That sounds great."

They moved into the dim of the manor. Charles indicated a room to the left, its doorway covered by a black screen. "Please, step inside," Charles said. Frederick passed through, and the door shut behind him.

Frederick adjusted his eyes to the darkness. Perched upon a chandelier above, a demon named Saul looked down and spoke: "Hello, friend."`;

async function testPronounFix() {
  console.log('🧪 Testing Pronoun Fix');
  console.log('='.repeat(60));

  const result = await extractEntitiesAndRelations(FREDERICK_SAUL_STORY);

  console.log(`\n📊 Results:`);
  console.log(`  Entities: ${result.entities.length}`);
  console.log(`  Relations: ${result.relations.length}`);

  console.log(`\n👤 Entities Extracted:`);
  result.entities.forEach(entity => {
    console.log(`\n  ${entity.type}::${entity.canonical}`);
    console.log(`    Confidence: ${(entity.confidence * 100).toFixed(1)}%`);
    console.log(`    Aliases: [${entity.aliases.join(', ')}]`);

    // CHECK: Pronouns should NOT be in aliases
    const pronouns = ['he', 'she', 'it', 'they', 'him', 'her', 'his', 'hers', 'them', 'their'];
    const hasPronouns = entity.aliases.some(alias =>
      pronouns.includes(alias.toLowerCase())
    );

    if (hasPronouns) {
      console.log(`    ❌ ERROR: Pronouns found in aliases!`);
    } else {
      console.log(`    ✅ No pronouns in aliases`);
    }
  });

  console.log(`\n🔍 Verification:`);

  const frederick = result.entities.find(e =>
    e.canonical.toLowerCase().includes('frederick')
  );
  const saul = result.entities.find(e =>
    e.canonical.toLowerCase().includes('saul')
  );

  if (!frederick) {
    console.log('  ❌ Frederick NOT found');
  } else {
    console.log(`  ✅ Frederick found: "${frederick.canonical}"`);
  }

  if (!saul) {
    console.log('  ❌ Saul NOT found');
  } else {
    console.log(`  ✅ Saul found: "${saul.canonical}"`);
  }

  // Check they're separate entities
  if (frederick && saul && frederick.id !== saul.id) {
    console.log('  ✅ Frederick and Saul are SEPARATE entities (no pronoun-based merge)');
  } else if (frederick && saul) {
    console.log('  ❌ Frederick and Saul were MERGED (bug still exists)');
  }

  console.log('\n' + '='.repeat(60));
}

testPronounFix().catch(console.error);
