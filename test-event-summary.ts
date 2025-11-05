/**
 * Test Event Summarization Capabilities
 *
 * Checks if we can:
 * 1. Extract EVENT entities
 * 2. Extract temporal information (dates)
 * 3. Build event timelines
 * 4. Summarize events from relationships
 */

import { extractFromSegments } from './app/engine/extract/orchestrator';
import { getHERTQuery } from './app/api/hert-query';
import { DEFAULT_LLM_CONFIG } from './app/engine/llm-config';

const EVENT_TEXT = `
The Battle of Helm's Deep occurred in March 3019 of the Third Age. Aragorn, Legolas,
and Gimli fought alongside the Rohirrim against Saruman's forces. The battle lasted
through the night until Gandalf arrived with reinforcements at dawn.

Earlier that year, the Fellowship of the Ring had been formed at the Council of Elrond
in Rivendell. Frodo Baggins was chosen to carry the Ring to Mount Doom. The Fellowship
departed from Rivendell in December 3018.

In January 3019, the Fellowship passed through the Mines of Moria. Gandalf fell fighting
the Balrog at the Bridge of Khazad-dûm. The remaining members reached Lothlórien where
they met Galadriel.

The War of the Ring concluded with the destruction of the One Ring on March 25, 3019,
when Frodo cast it into Mount Doom. Aragorn was crowned King of Gondor on May 1, 3019.
`;

async function testEventSummary() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Event Summarization Test                               ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Extract entities and relationships
  console.log('🔍 Extracting events from text...\n');

  const result = await extractFromSegments(
    'lotr-events.txt',
    EVENT_TEXT,
    undefined,
    DEFAULT_LLM_CONFIG,
    undefined,
    { generateHERTs: true, autoSaveHERTs: true }
  );

  console.log(`✅ Extracted ${result.entities.length} entities`);
  console.log(`✅ Extracted ${result.relations.length} relationships\n`);

  // Initialize query API
  const queryAPI = getHERTQuery();
  queryAPI.loadRelations(result.relations, result.entities);

  // === Test 1: EVENT Entities ===
  console.log('═══ Test 1: Extracted Events ===\n');

  const events = queryAPI.findEntitiesByType('EVENT');
  console.log(`Found ${events.length} EVENT entities:\n`);

  events.forEach(event => {
    console.log(`📅 ${event.canonical}`);
    console.log(`   EID: ${event.eid}`);
    console.log(`   Mentions: ${event.mention_count}`);
    console.log('');
  });

  // === Test 2: DATE Entities ===
  console.log('═══ Test 2: Temporal Information (Dates) ===\n');

  const dates = queryAPI.findEntitiesByType('DATE');
  console.log(`Found ${dates.length} DATE entities:\n`);

  dates.slice(0, 10).forEach(date => {
    console.log(`📆 ${date.canonical} (${date.mention_count} mentions)`);
  });

  if (dates.length > 10) {
    console.log(`   ... and ${dates.length - 10} more`);
  }
  console.log('');

  // === Test 3: Event-Related Relationships ===
  console.log('═══ Test 3: Event-Related Relationships ===\n');

  const eventPredicates = ['fought_in', 'attended', 'traveled_to', 'born_in', 'dies_in'];

  for (const pred of eventPredicates) {
    const rels = queryAPI.findRelationshipsByPredicate(pred as any);
    if (rels.length > 0) {
      console.log(`${pred}: ${rels.length} relationships`);
      rels.slice(0, 3).forEach(r => {
        console.log(`   ${r.subj_canonical} → ${r.obj_canonical}`);
      });
      if (rels.length > 3) {
        console.log(`   ... and ${rels.length - 3} more`);
      }
      console.log('');
    }
  }

  // === Test 4: Can We Build Event Timeline? ===
  console.log('═══ Test 4: Event Timeline Construction ===\n');

  // Group events by date
  const eventTimeline: Array<{
    date?: string;
    event: string;
    participants: string[];
  }> = [];

  // Try to construct timeline from relationships
  for (const rel of result.relations) {
    if (['fought_in', 'attended', 'traveled_to'].includes(rel.pred)) {
      const subj = result.entities.find(e => e.id === rel.subj);
      const obj = result.entities.find(e => e.id === rel.obj);

      if (subj && obj) {
        // Check if there's a date qualifier
        const dateQualifier = rel.qualifiers?.find(q => q.type === 'time');

        eventTimeline.push({
          date: dateQualifier?.value,
          event: `${subj.canonical} ${rel.pred.replace(/_/g, ' ')} ${obj.canonical}`,
          participants: [subj.canonical]
        });
      }
    }
  }

  if (eventTimeline.length > 0) {
    console.log('✅ Constructed timeline from relationships:\n');
    eventTimeline.slice(0, 10).forEach((item, i) => {
      console.log(`${i + 1}. ${item.event}`);
      if (item.date) {
        console.log(`   Date: ${item.date}`);
      }
      console.log('');
    });
  } else {
    console.log('⚠️  No timeline could be constructed from current relationships\n');
  }

  // === Test 5: Event Participants ===
  console.log('═══ Test 5: Event Participants ===\n');

  // For each event, find who participated
  for (const event of events.slice(0, 5)) {
    const participants = queryAPI.findRelationships(event.eid, { as: 'object' });

    if (participants.length > 0) {
      console.log(`📅 ${event.canonical}:`);
      console.log(`   Participants: ${participants.map(r => r.subj_canonical).join(', ')}`);
      console.log('');
    }
  }

  // === Summary ===
  console.log('═══ Summary ===\n');

  console.log('📊 Current Event Capabilities:');
  console.log(`   ✅ EVENT entity type defined`);
  console.log(`   ✅ DATE entity extraction: ${dates.length} dates found`);
  console.log(`   ✅ Event entities extracted: ${events.length} events`);
  console.log(`   ✅ Event relationships: ${eventPredicates.map(p =>
    queryAPI.findRelationshipsByPredicate(p as any).length
  ).reduce((a, b) => a + b, 0)} total`);
  console.log(`   ${eventTimeline.length > 0 ? '✅' : '⚠️ '} Timeline construction: ${
    eventTimeline.length > 0 ? 'Working' : 'Needs enhancement'
  }\n`);

  if (events.length > 0 && dates.length > 0) {
    console.log('🎉 Event extraction is working!\n');
    console.log('💡 To improve event summarization:');
    console.log('   1. Enhance temporal qualifier extraction');
    console.log('   2. Add event clustering (group related events)');
    console.log('   3. Build event narrative generator');
    console.log('   4. Add causality detection (event A caused event B)\n');
  } else {
    console.log('⚠️  Event extraction needs enhancement\n');
  }
}

testEventSummary().catch(console.error);
