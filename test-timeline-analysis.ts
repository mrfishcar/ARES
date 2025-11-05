/**
 * Test Timeline Analysis
 *
 * Demonstrates timeline extraction, clustering, and visualization
 */

import { extractFromSegments } from './app/engine/extract/orchestrator';
import { getHERTQuery } from './app/api/hert-query';
import { TimelineAnalyzer } from './app/analysis/timeline-analyzer';
import { renderTimelineSetToMarkdown, renderTimelineASCII } from './app/analysis/timeline-renderer';
import { DEFAULT_LLM_CONFIG } from './app/engine/llm-config';
import * as fs from 'fs';

const LOTR_TIMELINE_TEXT = `
In the year 3018 of the Third Age, Frodo Baggins inherited the One Ring from Bilbo Baggins in the Shire.
That same year, Gandalf the Grey discovered the truth about the Ring and warned Frodo of its danger.

In September 3018, Frodo left the Shire with Sam, Merry, and Pippin. They traveled east toward Bree,
pursued by the Nazgûl. At the Prancing Pony inn in Bree, they met Aragorn son of Arathorn.

In October 3018, Frodo was stabbed by a Morgul-blade at Weathertop. Aragorn led the hobbits to Rivendell,
where Elrond healed Frodo's wound.

In late December 3018, the Council of Elrond was held at Rivendell. It was decided that the Ring must
be destroyed in Mount Doom. The Fellowship of the Ring was formed, consisting of Frodo, Sam, Merry,
Pippin, Gandalf, Aragorn, Legolas, Gimli, and Boromir.

The Fellowship departed from Rivendell in late December. In January 3019, they passed through the
Mines of Moria. There, Gandalf fought the Balrog at the Bridge of Khazad-dûm and fell into the abyss.

The remaining Fellowship reached Lothlórien, where they rested with Galadriel and Celeborn. In February
3019, they left Lothlórien and traveled down the Anduin River.

At the Falls of Rauros in late February 3019, the Fellowship was broken. Boromir was slain by orcs.
Frodo and Sam departed alone for Mordor. Merry and Pippin were captured by orcs but escaped into
Fangorn Forest, where they met Treebeard.

Meanwhile, Aragorn, Legolas, and Gimli pursued the orcs into Rohan. In early March 3019, they met
Éomer and his riders. They later found Gandalf, who had returned as Gandalf the White after defeating
the Balrog.

In March 3019, the Battle of Helm's Deep was fought in Rohan. Théoden King and his Rohirrim, aided
by Aragorn and Gandalf, defended against Saruman's forces.

In mid-March 3019, Pippin looked into the palantír and saw Sauron. Gandalf took Pippin to Minas Tirith
in Gondor, where they warned Denethor of the coming war.

The Battle of the Pelennor Fields took place on March 15, 3019, before the gates of Minas Tirith.
The Rohirrim, led by Théoden, charged into battle. Éowyn and Merry slew the Witch-king of Angmar.
Théoden was killed in the battle. Aragorn arrived with the Army of the Dead and turned the tide.

After the battle, Aragorn led the armies of the West to the Black Gate of Mordor as a diversion.
The Battle of the Morannon began on March 25, 3019.

Meanwhile, Frodo and Sam, guided by Gollum, approached Mount Doom. On March 25, 3019, Frodo reached
the Cracks of Doom. There, he failed to destroy the Ring, but Gollum bit off Frodo's finger and fell
into the fire with the Ring. The Ring was destroyed, and Sauron was defeated.

On May 1, 3019, Aragorn was crowned King Elessar of the Reunited Kingdom of Gondor and Arnor.

In September 3019, the hobbits returned to the Shire and found it under the control of Saruman.
In the Battle of Bywater, they freed the Shire from Saruman's rule.

In September 3021, Frodo departed Middle-earth from the Grey Havens, sailing to the Undying Lands
with Gandalf, Bilbo, Elrond, and Galadriel.`;

// Alternate timeline text - what if Boromir took the Ring?
const ALTERNATE_TIMELINE_TEXT = `
At the Falls of Rauros, Boromir did not resist the Ring's temptation. He took the Ring from Frodo
by force and claimed it for Gondor.

Corrupted by the Ring's power, Boromir returned to Minas Tirith in March 3019. There, he overthrew
his father Denethor and declared himself the new Steward of Gondor.

The Ring's influence grew stronger. By April 3019, Boromir had become a dark lord, rivaling Sauron's power.
He raised a new army and marched on Mordor, seeking to challenge Sauron for dominion over Middle-earth.

The War of the Two Dark Lords began in May 3019, devastating the lands between Gondor and Mordor.`;

async function testTimelineAnalysis() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Timeline Analysis Test                                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Step 1: Extract primary timeline
  console.log('📝 Step 1: Extracting primary timeline events...\n');

  const primaryResult = await extractFromSegments(
    'lotr-timeline.txt',
    LOTR_TIMELINE_TEXT,
    undefined,
    DEFAULT_LLM_CONFIG,
    undefined,
    { generateHERTs: true, autoSaveHERTs: false }
  );

  console.log(`✅ Extracted ${primaryResult.entities.length} entities`);
  console.log(`✅ Extracted ${primaryResult.relations.length} relationships\n`);

  // Step 2: Extract alternate timeline
  console.log('📝 Step 2: Extracting alternate timeline events...\n');

  const alternateResult = await extractFromSegments(
    'lotr-alternate.txt',
    ALTERNATE_TIMELINE_TEXT,
    primaryResult.profiles,
    DEFAULT_LLM_CONFIG,
    undefined,
    { generateHERTs: true, autoSaveHERTs: false }
  );

  console.log(`✅ Extracted ${alternateResult.entities.length} entities`);
  console.log(`✅ Extracted ${alternateResult.relations.length} relationships\n`);

  // Step 3: Load into Query API
  console.log('📚 Step 3: Loading data into Query API...\n');

  const queryAPI = getHERTQuery();

  // Combine entities and relations
  const allEntities = [...primaryResult.entities, ...alternateResult.entities];
  const allRelations = [...primaryResult.relations, ...alternateResult.relations];

  queryAPI.loadRelations(allRelations, allEntities);

  // Step 4: Analyze timelines
  console.log('🔍 Step 4: Analyzing timelines...\n');

  const analyzer = new TimelineAnalyzer(queryAPI);

  const analysisResult = analyzer.analyze({
    minTemporalConfidence: 0.5,
    minEventsPerTimeline: 2,
    clusteringStrategy: 'hybrid',
    inferTemporalRelations: true,
    detectBranches: true,
    autoMergeDisconnected: false
  });

  console.log('✅ Timeline analysis complete!\n');

  // Step 5: Display results
  console.log('═══ Timeline Analysis Results ═══\n');

  console.log(`📊 Statistics:`);
  console.log(`   Total Events: ${analysisResult.stats.totalEvents}`);
  console.log(`   Total Timelines: ${analysisResult.stats.totalTimelines}`);
  console.log(`   Avg Events/Timeline: ${analysisResult.stats.averageEventsPerTimeline.toFixed(1)}`);

  if (analysisResult.stats.mostActiveParticipant.name !== 'none') {
    console.log(`   Most Active: ${analysisResult.stats.mostActiveParticipant.name} (${analysisResult.stats.mostActiveParticipant.eventCount} events)`);
  }

  console.log('');

  // Display timeline types
  const { timelineSet } = analysisResult;

  console.log('📅 Timeline Breakdown:');
  console.log(`   Primary Timeline: ${timelineSet.primary.events.length} events`);
  console.log(`   Branch Timelines: ${timelineSet.branches.length}`);
  console.log(`   Alternate Timelines: ${timelineSet.alternates.length}`);
  console.log(`   Disconnected Timelines: ${timelineSet.disconnected.length}`);
  console.log('');

  // Show primary timeline
  if (timelineSet.primary.events.length > 0) {
    console.log('═══ Primary Timeline ═══\n');
    console.log(renderTimelineASCII(timelineSet.primary));
    console.log('');

    console.log('Top 10 Events:');
    timelineSet.primary.events.slice(0, 10).forEach((event, i) => {
      const temporal = event.temporal.precision !== 'unknown'
        ? event.temporal.raw
        : 'Unknown';
      const name = event.eventName || event.description.substring(0, 50);
      console.log(`   ${i + 1}. [${temporal}] ${name}`);

      if (event.participants.length > 0) {
        const participants = event.participants.slice(0, 3).map(p => p.name).join(', ');
        console.log(`      Participants: ${participants}`);
      }
    });
    console.log('');
  }

  // Show disconnected timelines
  if (timelineSet.disconnected.length > 0) {
    console.log('═══ Disconnected Timelines ═══\n');
    timelineSet.disconnected.forEach((timeline, i) => {
      console.log(`${i + 1}. ${timeline.name} (${timeline.events.length} events)`);
      console.log(`   Type: ${timeline.type}`);
      console.log(`   Coherence: ${(timeline.coherence * 100).toFixed(0)}%`);

      if (timeline.primaryParticipants.length > 0) {
        console.log(`   Participants: ${timeline.primaryParticipants.map(p => p.name).join(', ')}`);
      }

      console.log('');
    });
  }

  // Show branches
  if (timelineSet.branches.length > 0) {
    console.log('═══ Branch Timelines ═══\n');
    timelineSet.branches.forEach((timeline, i) => {
      console.log(`${i + 1}. ${timeline.name} (${timeline.events.length} events)`);
      if (timeline.divergence) {
        console.log(`   Diverges at: ${timeline.divergence.divergencePoint.raw}`);
      }
      console.log('');
    });
  }

  // Step 6: Save markdown report
  console.log('💾 Step 5: Generating markdown report...\n');

  const markdown = renderTimelineSetToMarkdown(analysisResult);
  fs.writeFileSync('./timeline-analysis-report.md', markdown);

  console.log('✅ Report saved to: timeline-analysis-report.md\n');

  // Step 7: Summary
  console.log('═══ Summary ═══\n');

  console.log('✅ Timeline Analysis Complete!\n');

  console.log('What we found:');
  console.log(`   • ${analysisResult.stats.totalEvents} events extracted`);
  console.log(`   • ${analysisResult.stats.totalTimelines} separate timelines identified`);
  console.log(`   • ${timelineSet.branches.length} branch timeline(s) detected`);
  console.log(`   • ${timelineSet.disconnected.length} disconnected timeline(s) found`);
  console.log('');

  console.log('Key Features Demonstrated:');
  console.log('   ✓ Temporal event extraction from narrative text');
  console.log('   ✓ Event clustering into coherent timelines');
  console.log('   ✓ Timeline classification (primary, branch, disconnected)');
  console.log('   ✓ Participant and location tracking');
  console.log('   ✓ Temporal relation inference');
  console.log('   ✓ Multi-format visualization (ASCII, Markdown)');
  console.log('');

  console.log('Next Steps:');
  console.log('   1. Review timeline-analysis-report.md for full details');
  console.log('   2. Test with your own narrative documents');
  console.log('   3. Use timeline analysis in wiki generation');
  console.log('   4. Build interactive timeline viewer');
  console.log('');
}

testTimelineAnalysis().catch(console.error);
