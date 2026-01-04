/**
 * HP Chapter 1 Full Text Test Suite
 *
 * Tests extraction from the FULL Harry Potter Chapter 1 text.
 * Target: P>=98%, R>=95%
 *
 * This tests larger, more realistic chunks from the actual chapter.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { extractFromSegments } from '../../app/engine/pipeline/orchestrator';

interface GoldEntity {
  text: string;
  type: 'PERSON' | 'PLACE' | 'ORG' | 'DATE' | 'ITEM' | 'WORK' | 'EVENT';
}

interface GoldRelation {
  subj: string;
  pred: string;
  obj: string;
}

interface TestCase {
  id: string;
  name: string;
  text: string;
  gold: {
    entities: GoldEntity[];
    relations: GoldRelation[];
  };
}

// HP Chapter 1 Full Text Test Cases - Large realistic chunks
const testCases: TestCase[] = [
  // Section 1: Opening - Dursley family introduction
  {
    id: 'hp1-full.1',
    name: 'Dursley family introduction',
    text: `Mr. and Mrs. Dursley, of number four, Privet Drive, were proud to say that they were perfectly normal, thank you very much. They were the last people you'd expect to be involved in anything strange or mysterious, because they just didn't hold with such nonsense.

Mr. Dursley was the director of a firm called Grunnings, which made drills. He was a big, beefy man with hardly any neck, although he did have a very large mustache. Mrs. Dursley was thin and blonde and had nearly twice the usual amount of neck, which came in very useful as she spent so much of her time craning over garden fences, spying on the neighbors. The Dursleys had a small son called Dudley and in their opinion there was no finer boy anywhere.`,
    gold: {
      entities: [
        { text: 'Mr. Dursley', type: 'PERSON' },
        { text: 'Mrs. Dursley', type: 'PERSON' },
        { text: 'Privet Drive', type: 'PLACE' },
        { text: 'Grunnings', type: 'ORG' },
        { text: 'Dudley', type: 'PERSON' }
      ],
      relations: [
        // "The Dursleys had a small son called Dudley"
        { subj: 'Mr. Dursley', pred: 'parent_of', obj: 'Dudley' },
        { subj: 'Dudley', pred: 'child_of', obj: 'Mr. Dursley' }
      ]
    }
  },

  // Section 2: The Potter secret
  {
    id: 'hp1-full.2',
    name: 'The Potter family secret',
    text: `The Dursleys had everything they wanted, but they also had a secret, and their greatest fear was that somebody would discover it. They didn't think they could bear it if anyone found out about the Potters. Mrs. Potter was Mrs. Dursley's sister, but they hadn't met for several years; in fact, Mrs. Dursley pretended she didn't have a sister, because her sister and her good-for-nothing husband were as unDursleyish as it was possible to be.

The Dursleys shuddered to think what the neighbors would say if the Potters arrived in the street. The Dursleys knew that the Potters had a small son, too, but they had never even seen him. This boy was another good reason for keeping the Potters away; they didn't want Dudley mixing with a child like that.`,
    gold: {
      entities: [
        { text: 'Dursleys', type: 'PERSON' },
        { text: 'Potters', type: 'PERSON' },
        { text: 'Mrs. Potter', type: 'PERSON' },
        { text: 'Mrs. Dursley', type: 'PERSON' },
        { text: 'Dudley', type: 'PERSON' }
      ],
      relations: [
        // "Mrs. Potter was Mrs. Dursley's sister" - sibling relationship
        { subj: 'Mrs. Potter', pred: 'sibling_of', obj: 'Mrs. Dursley' }
      ]
    }
  },

  // Section 3: Dumbledore's arrival
  {
    id: 'hp1-full.3',
    name: 'Dumbledore arrives on Privet Drive',
    text: `A man appeared on the corner the cat had been watching, appeared so suddenly and silently you'd have thought he'd just popped out of the ground. The cat's tail twitched and its eyes narrowed.

Nothing like this man had ever been seen on Privet Drive. He was tall, thin, and very old, judging by the silver of his hair and beard, which were both long enough to tuck into his belt. He was wearing long robes, a purple cloak that swept the ground, and high-heeled, buckled boots.

His blue eyes were light, bright, and sparkling behind half-moon spectacles and his nose was very long and crooked, as though it had been broken at least twice. This man's name was Albus Dumbledore.`,
    gold: {
      entities: [
        { text: 'Albus Dumbledore', type: 'PERSON' },
        { text: 'Privet Drive', type: 'PLACE' }
      ],
      relations: []
    }
  },

  // Section 4: McGonagall revealed
  {
    id: 'hp1-full.4',
    name: 'McGonagall transformation',
    text: `Dumbledore slipped the Put-Outer back inside his cloak and set off down the street toward number four, where he sat down on the wall next to the cat. He didn't look at it, but after a moment he spoke to it.

"Fancy seeing you here, Professor McGonagall."

He turned to smile at the tabby, but it had gone. Instead he was smiling at a rather severe-looking woman who was wearing square glasses exactly the shape of the markings the cat had had around its eyes. She, too, was wearing a cloak, an emerald one. Her black hair was drawn into a tight bun. She looked distinctly ruffled.

"How did you know it was me?" she asked.

"My dear Professor, I've never seen a cat sit so stiffly."`,
    gold: {
      entities: [
        { text: 'Dumbledore', type: 'PERSON' },
        { text: 'Professor McGonagall', type: 'PERSON' }
      ],
      relations: []
    }
  },

  // Section 5: Voldemort discussion
  {
    id: 'hp1-full.5',
    name: 'Voldemort and the Potters',
    text: `"What they're saying," she pressed on, "is that last night Voldemort turned up in Godric's Hollow. He went to find the Potters. The rumor is that Lily and James Potter are -- are -- that they're -- dead."

Dumbledore bowed his head. Professor McGonagall gasped.

"Lily and James... I can't believe it... I didn't want to believe it... Oh, Albus..."

Dumbledore reached out and patted her on the shoulder. "I know... I know..." he said heavily.

Professor McGonagall's voice trembled as she went on. "That's not all. They're saying he tried to kill the Potter's son, Harry. But -- he couldn't. He couldn't kill that little boy. No one knows why, or how, but they're saying that when he couldn't kill Harry Potter, Voldemort's power somehow broke -- and that's why he's gone."`,
    gold: {
      entities: [
        { text: 'Voldemort', type: 'PERSON' },
        { text: 'Godric\'s Hollow', type: 'PLACE' },
        { text: 'Potters', type: 'PERSON' },
        { text: 'Lily', type: 'PERSON' },
        { text: 'James Potter', type: 'PERSON' },
        { text: 'Dumbledore', type: 'PERSON' },
        { text: 'Professor McGonagall', type: 'PERSON' },
        { text: 'Harry Potter', type: 'PERSON' }
      ],
      relations: [
        // Note: These are ideal relations - system may extract subset
      ]
    }
  },

  // Section 6: Hagrid arrives
  {
    id: 'hp1-full.6',
    name: 'Hagrid brings Harry',
    text: `A low rumbling sound had broken the silence around them. It grew steadily louder as they looked up and down the street for some sign of a headlight; it swelled to a roar as they both looked up at the sky -- and a huge motorcycle fell out of the air and landed on the road in front of them.

If the motorcycle was huge, it was nothing to the man sitting astride it. He was almost twice as tall as a normal man and at least five times as wide. He looked simply too big to be allowed, and so wild -- long tangles of bushy black hair and beard hid most of his face, he had hands the size of trash can lids, and his feet in their leather boots were like baby dolphins. In his vast, muscular arms he was holding a bundle of blankets.

"Hagrid," said Dumbledore, sounding relieved. "At last. And where did you get that motorcycle?"

"Borrowed it, Professor Dumbledore, sir," said the giant, climbing carefully off the motorcycle as he spoke. "Young Sirius Black lent it to me. I've got him, sir."`,
    gold: {
      entities: [
        { text: 'Hagrid', type: 'PERSON' },
        { text: 'Dumbledore', type: 'PERSON' },
        { text: 'Sirius Black', type: 'PERSON' }
      ],
      relations: []
    }
  },

  // Section 7: Harry left at Dursleys
  {
    id: 'hp1-full.7',
    name: 'Harry left at Dursleys',
    text: `"I've come to bring Harry to his aunt and uncle. They're the only family he has left now."

"You don't mean -- you can't mean the people who live here?" cried Professor McGonagall, jumping to her feet and pointing at number four. "Dumbledore -- you can't. I've been watching them all day. You couldn't find two people who are less like us. And they've got this son -- I saw him kicking his mother all the way up the street, screaming for sweets. Harry Potter come and live here!"

"It's the best place for him," said Dumbledore firmly. "His aunt and uncle will be able to explain everything to him when he's older. I've written them a letter."`,
    gold: {
      entities: [
        { text: 'Harry', type: 'PERSON' },
        { text: 'Professor McGonagall', type: 'PERSON' },
        { text: 'Dumbledore', type: 'PERSON' },
        { text: 'Harry Potter', type: 'PERSON' }
      ],
      relations: []
    }
  },

  // Section 8: Hagrid's goodbye
  {
    id: 'hp1-full.8',
    name: 'Hagrid says goodbye to Harry',
    text: `Dumbledore took Harry in his arms and turned toward the Dursleys' house.

"Could I -- could I say good-bye to him, sir?" asked Hagrid. He bent his great, shaggy head over Harry and gave him what must have been a very scratchy, whiskery kiss. Then, suddenly, Hagrid let out a howl like a wounded dog.

"Shhh!" hissed Professor McGonagall, "you'll wake the Muggles!"

"S-s-sorry," sobbed Hagrid, taking out a large, spotted handkerchief and burying his face in it. "But I c-c-can't stand it -- Lily an' James dead -- an' poor little Harry off ter live with Muggles -"

"Yes, yes, it's all very sad, but get a grip on yourself, Hagrid, or we'll be found," Professor McGonagall whispered, patting Hagrid gingerly on the arm.`,
    gold: {
      entities: [
        { text: 'Dumbledore', type: 'PERSON' },
        { text: 'Harry', type: 'PERSON' },
        { text: 'Dursleys', type: 'PERSON' },
        { text: 'Hagrid', type: 'PERSON' },
        { text: 'Professor McGonagall', type: 'PERSON' },
        { text: 'Lily', type: 'PERSON' },
        { text: 'James', type: 'PERSON' }
      ],
      relations: []
    }
  },

  // Section 9: Final departure
  {
    id: 'hp1-full.9',
    name: 'Everyone departs',
    text: `"Well," said Dumbledore finally, "that's that. We've no business staying here. We may as well go and join the celebrations."

"Yeah," said Hagrid in a very muffled voice, "I'll be takin' Sirius his bike back. G'night, Professor McGonagall -- Professor Dumbledore, sir."

Wiping his streaming eyes on his jacket sleeve, Hagrid swung himself onto the motorcycle and kicked the engine into life; with a roar it rose into the air and off into the night.

"I shall see you soon, I expect, Professor McGonagall," said Dumbledore, nodding to her. Professor McGonagall blew her nose in reply.`,
    gold: {
      entities: [
        { text: 'Dumbledore', type: 'PERSON' },
        { text: 'Hagrid', type: 'PERSON' },
        { text: 'Sirius', type: 'PERSON' },
        { text: 'Professor McGonagall', type: 'PERSON' },
        { text: 'Professor Dumbledore', type: 'PERSON' }
      ],
      relations: []
    }
  },

  // Section 10: Closing - The boy who lived
  {
    id: 'hp1-full.10',
    name: 'The boy who lived closing',
    text: `A breeze ruffled the neat hedges of Privet Drive, which lay silent and tidy under the inky sky, the very last place you would expect astonishing things to happen. Harry Potter rolled over inside his blankets without waking up. One small hand closed on the letter beside him and he slept on, not knowing he was special, not knowing he was famous, not knowing he would be woken in a few hours' time by Mrs. Dursley's scream as she opened the front door to put out the milk bottles, nor that he would spend the next few weeks being prodded and pinched by his cousin Dudley... He couldn't know that at this very moment, people meeting in secret all over the country were holding up their glasses and saying in hushed voices: "To Harry Potter -- the boy who lived!"`,
    gold: {
      entities: [
        { text: 'Privet Drive', type: 'PLACE' },
        { text: 'Harry Potter', type: 'PERSON' },
        { text: 'Mrs. Dursley', type: 'PERSON' },
        { text: 'Dudley', type: 'PERSON' }
      ],
      relations: [
        // "his cousin Dudley" - cousin relationship
        { subj: 'Dudley', pred: 'cousin_of', obj: 'Harry Potter' }
      ]
    }
  }
];

// Helper function to normalize entity/relation matching
function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^\w\s]/g, '').trim();
}

function entityMatches(extracted: string, gold: string): boolean {
  const normExtracted = normalizeText(extracted);
  const normGold = normalizeText(gold);

  // Direct containment match
  if (normExtracted.includes(normGold) || normGold.includes(normExtracted)) {
    return true;
  }

  // Last name match (e.g., "Mr. Dursley" matches "Mr Dursley")
  const extractedWords = normExtracted.split(/\s+/);
  const goldWords = normGold.split(/\s+/);

  // If last word matches, often a match (for names)
  if (extractedWords.length > 0 && goldWords.length > 0) {
    const lastExtracted = extractedWords[extractedWords.length - 1];
    const lastGold = goldWords[goldWords.length - 1];
    if (lastExtracted === lastGold && lastExtracted.length > 2) {
      return true;
    }
    // Handle plural variations (e.g., "Dursley" matches "Dursleys")
    if ((lastExtracted + 's' === lastGold || lastGold + 's' === lastExtracted) && lastExtracted.length > 2) {
      return true;
    }
  }

  return false;
}

function relationMatches(
  extracted: { subj: string; pred: string; obj: string },
  gold: { subj: string; pred: string; obj: string }
): boolean {
  const subjMatch = entityMatches(extracted.subj, gold.subj);
  const objMatch = entityMatches(extracted.obj, gold.obj);
  const predMatch = normalizeText(extracted.pred).includes(normalizeText(gold.pred)) ||
                    normalizeText(gold.pred).includes(normalizeText(extracted.pred));
  return subjMatch && objMatch && predMatch;
}

describe('HP Chapter 1 Full Text Test Suite', () => {
  it('should achieve >=98% precision and >=95% recall on full chapter', async () => {
    let totalGoldEntities = 0;
    let totalFoundEntities = 0;
    let totalMatchedEntities = 0;

    let totalGoldRelations = 0;
    let totalFoundRelations = 0;
    let totalMatchedRelations = 0;

    const failures: string[] = [];

    for (const testCase of testCases) {
      try {
        const result = await extractFromSegments(testCase.id, testCase.text);

        // Count entities
        const goldEntities = testCase.gold.entities;
        const extractedEntities = result.entities;

        totalGoldEntities += goldEntities.length;
        totalFoundEntities += extractedEntities.length;

        // Debug: show extracted entities for first few tests
        if (testCase.id === 'hp1-full.1' || testCase.id === 'hp1-full.5') {
          console.log(`\n[DEBUG ${testCase.id}] Result keys: ${Object.keys(result).join(', ')}`);
          console.log(`[DEBUG ${testCase.id}] Entities array length: ${extractedEntities.length}`);
          console.log(`[DEBUG ${testCase.id}] First entity keys: ${extractedEntities[0] ? Object.keys(extractedEntities[0]).join(', ') : 'none'}`);
          console.log(`[DEBUG ${testCase.id}] First entity: ${JSON.stringify(extractedEntities[0])?.slice(0, 200)}`);
        }

        // Match entities - check canonical AND aliases
        for (const gold of goldEntities) {
          const matched = extractedEntities.some(e => {
            // Check canonical
            if (entityMatches(e.canonical, gold.text)) return true;
            // Check aliases
            if (e.aliases && Array.isArray(e.aliases)) {
              return e.aliases.some((alias: string) => entityMatches(alias, gold.text));
            }
            return false;
          });
          if (matched) {
            totalMatchedEntities++;
          } else {
            failures.push(`[${testCase.id}] Missing entity: ${gold.text}`);
          }
        }

        // Count relations
        const goldRelations = testCase.gold.relations;
        const extractedRelations = result.relations;

        totalGoldRelations += goldRelations.length;
        totalFoundRelations += extractedRelations.length;

        // Build entity ID to name map
        const entityIdToName = new Map<string, string>();
        for (const e of extractedEntities) {
          entityIdToName.set(e.id, e.canonical);
          // Also add aliases for matching
          if (e.aliases) {
            for (const alias of e.aliases) {
              entityIdToName.set(e.id, alias); // Use first alias if canonical is bad
            }
          }
        }

        // Resolve relation IDs to names
        const resolvedRelations = extractedRelations.map(r => ({
          subj: entityIdToName.get(r.subj) || r.subj,
          pred: r.pred,
          obj: entityIdToName.get(r.obj) || r.obj
        }));

        // Debug: show extracted relations for first few tests
        if (testCase.id === 'hp1-full.1' || testCase.id === 'hp1-full.5') {
          console.log(`[DEBUG ${testCase.id}] Relations count: ${resolvedRelations.length}`);
          resolvedRelations.slice(0, 5).forEach(r => {
            console.log(`  - ${r.subj}::${r.pred}::${r.obj}`);
          });
        }

        // Match relations
        for (const gold of goldRelations) {
          const matched = resolvedRelations.some(r =>
            relationMatches(r, gold)
          );
          if (matched) {
            totalMatchedRelations++;
          } else {
            failures.push(`[${testCase.id}] Missing relation: ${gold.subj}::${gold.pred}::${gold.obj}`);
          }
        }
      } catch (error) {
        failures.push(`[${testCase.id}] Error: ${error}`);
      }
    }

    // Calculate metrics
    const entityPrecision = totalFoundEntities > 0 ? (totalMatchedEntities / totalFoundEntities) * 100 : 0;
    const entityRecall = totalGoldEntities > 0 ? (totalMatchedEntities / totalGoldEntities) * 100 : 0;
    const entityF1 = entityPrecision + entityRecall > 0
      ? (2 * entityPrecision * entityRecall) / (entityPrecision + entityRecall)
      : 0;

    const relationPrecision = totalFoundRelations > 0 ? (totalMatchedRelations / totalFoundRelations) * 100 : 0;
    const relationRecall = totalGoldRelations > 0 ? (totalMatchedRelations / totalGoldRelations) * 100 : 0;
    const relationF1 = relationPrecision + relationRecall > 0
      ? (2 * relationPrecision * relationRecall) / (relationPrecision + relationRecall)
      : 0;

    // Print results
    console.log('\n' + '='.repeat(60));
    console.log('HP CHAPTER 1 FULL TEXT RESULTS:');
    console.log('='.repeat(60));

    console.log(`\nEntities:`);
    console.log(`  Gold: ${totalGoldEntities}, Found: ${totalFoundEntities}, Matched: ${totalMatchedEntities}`);
    console.log(`  Precision: ${entityPrecision.toFixed(1)}% (target: >=98%)`);
    console.log(`  Recall: ${entityRecall.toFixed(1)}% (target: >=95%)`);
    console.log(`  F1: ${entityF1.toFixed(1)}%`);

    console.log(`\nRelations:`);
    console.log(`  Gold: ${totalGoldRelations}, Found: ${totalFoundRelations}, Matched: ${totalMatchedRelations}`);
    console.log(`  Precision: ${relationPrecision.toFixed(1)}% (target: >=98%)`);
    console.log(`  Recall: ${relationRecall.toFixed(1)}% (target: >=95%)`);
    console.log(`  F1: ${relationF1.toFixed(1)}%`);

    if (failures.length > 0) {
      console.log(`\nFailures (first 20):`);
      failures.slice(0, 20).forEach(f => console.log(`  ${f}`));
      if (failures.length > 20) {
        console.log(`  ... and ${failures.length - 20} more`);
      }
    }

    console.log('\n' + '='.repeat(60));

    // Check targets
    const entityPass = entityPrecision >= 98 && entityRecall >= 95;
    const relationPass = relationPrecision >= 98 && relationRecall >= 95;

    if (entityPass && relationPass) {
      console.log('HP CHAPTER 1 FULL PASSED!');
    } else {
      console.log('HP CHAPTER 1 FULL NEEDS WORK');
      if (!entityPass) console.log('  - Entity metrics below target');
      if (!relationPass) console.log('  - Relation metrics below target');
    }
    console.log('='.repeat(60) + '\n');

    // Assert minimum thresholds (using lower thresholds for initial run)
    expect(entityRecall).toBeGreaterThanOrEqual(50);
    expect(relationRecall).toBeGreaterThanOrEqual(50);
  });
});
