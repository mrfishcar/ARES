/**
 * Test: Multiple Wizards Ambiguity Resolution
 *
 * Tests that the system correctly distinguishes between multiple entities
 * with the same descriptor when resolving references.
 *
 * Scenarios:
 * 1. Same paragraph: "Saruman entered. The wizard spoke." → Saruman (recency)
 * 2. Different paragraphs: Gandalf in P1, "the wizard" in P2 → Gandalf (proximity)
 * 3. Ambiguous: Both wizards in same paragraph → Don't resolve
 * 4. Cross-document: Gandalf in Doc1, "the wizard" in Doc2 → Use profile with caution
 */

import { resolveDescriptor, type ResolutionContext } from './app/engine/contextual-resolver';
import type { Entity } from './app/engine/schema';
import type { Sentence } from './app/engine/segment';
import { createProfile, buildProfiles, type EntityProfile } from './app/engine/entity-profiler';

// Helper to create test entities
function createTestEntity(id: string, name: string): Entity {
  return {
    id,
    type: 'PERSON',
    canonical: name,
    aliases: [],
    created_at: new Date().toISOString(),
    centrality: 1
  };
}

// Helper to create test sentences
function createSentences(text: string): Sentence[] {
  const sentences: Sentence[] = [];
  const lines = text.split('\n').filter(l => l.trim());

  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    sentences.push({
      text: line.trim(),
      start: offset,
      end: offset + line.length
    });
    offset += line.length + 1; // +1 for newline
  }

  return sentences;
}

console.log('='.repeat(80));
console.log('MULTIPLE WIZARDS AMBIGUITY TEST');
console.log('='.repeat(80));
console.log();

// Scenario 1: Recent mention in same paragraph (should resolve to most recent)
console.log('Scenario 1: Recent Mention (Same Paragraph)');
console.log('-'.repeat(80));

const text1 = `
Gandalf the wizard arrived first.
Saruman the wizard entered the room.
The wizard spoke loudly.
`.trim();

const entities1 = [
  createTestEntity('gandalf', 'Gandalf'),
  createTestEntity('saruman', 'Saruman')
];

const spans1 = [
  { entity_id: 'gandalf', start: 0, end: 7 },    // "Gandalf"
  { entity_id: 'saruman', start: 44, end: 51 }   // "Saruman"
];

const sentences1 = createSentences(text1);

const context1: ResolutionContext = {
  mention_text: 'the wizard',
  mention_start: 80,
  mention_end: 90,
  sentence_index: 2,
  paragraph_index: 0
};

const result1 = resolveDescriptor(
  context1,
  'wizard',
  entities1,
  spans1,
  sentences1,
  text1
);

console.log(`Text: "${text1}"`);
console.log(`\nMention: "the wizard" at position 80`);
console.log(`Expected: Saruman (most recent)`);
console.log(`Result: ${result1 ? entities1.find(e => e.id === result1.entity_id)?.canonical : 'null'}`);
console.log(`Confidence: ${result1?.confidence.toFixed(2) || 'N/A'}`);
console.log(`Method: ${result1?.method || 'N/A'}`);
console.log();

// Scenario 2: Different paragraphs (should use document frequency)
console.log('Scenario 2: Cross-Paragraph (Document Frequency)');
console.log('-'.repeat(80));

const text2 = `
Gandalf the wizard traveled to Rivendell. Gandalf met with Elrond. Gandalf discussed the ring.

The wizard returned to the Shire after many days.
`.trim();

const entities2 = [
  createTestEntity('gandalf', 'Gandalf'),
  createTestEntity('elrond', 'Elrond')
];

const spans2 = [
  { entity_id: 'gandalf', start: 0, end: 7 },
  { entity_id: 'gandalf', start: 42, end: 49 },
  { entity_id: 'gandalf', start: 66, end: 73 },
  { entity_id: 'elrond', start: 59, end: 65 }
];

const sentences2 = createSentences(text2);

const context2: ResolutionContext = {
  mention_text: 'the wizard',
  mention_start: 95,
  mention_end: 105,
  sentence_index: 1,
  paragraph_index: 1
};

const result2 = resolveDescriptor(
  context2,
  'wizard',
  entities2,
  spans2,
  sentences2,
  text2
);

console.log(`Paragraph 1: Gandalf mentioned 3 times`);
console.log(`Paragraph 2: "The wizard" (no direct name)`);
console.log(`\nExpected: Gandalf (dominant in document)`);
console.log(`Result: ${result2 ? entities2.find(e => e.id === result2.entity_id)?.canonical : 'null'}`);
console.log(`Confidence: ${result2?.confidence.toFixed(2) || 'N/A'}`);
console.log(`Method: ${result2?.method || 'N/A'}`);
console.log();

// Scenario 3: Ambiguous (multiple wizards equally recent)
console.log('Scenario 3: Ambiguous (Multiple Wizards Equally Close)');
console.log('-'.repeat(80));

const text3 = `
Gandalf and Saruman both entered. The wizard spoke.
`.trim();

const entities3 = [
  createTestEntity('gandalf', 'Gandalf'),
  createTestEntity('saruman', 'Saruman')
];

const spans3 = [
  { entity_id: 'gandalf', start: 0, end: 7 },
  { entity_id: 'saruman', start: 12, end: 19 }
];

const sentences3 = createSentences(text3);

const context3: ResolutionContext = {
  mention_text: 'the wizard',
  mention_start: 36,
  mention_end: 46,
  sentence_index: 0,
  paragraph_index: 0
};

const result3 = resolveDescriptor(
  context3,
  'wizard',
  entities3,
  spans3,
  sentences3,
  text3
);

console.log(`Text: "Gandalf and Saruman both entered. The wizard spoke."`);
console.log(`\nBoth wizards mentioned in same sentence!`);
console.log(`Expected: null (ambiguous - cannot determine which)`);
console.log(`Result: ${result3 ? entities3.find(e => e.id === result3.entity_id)?.canonical : 'null (correctly ambiguous)'}`);
console.log();

// Scenario 4: Profile-based (cross-document with confidence)
console.log('Scenario 4: Profile-Based Resolution (Cross-Document)');
console.log('-'.repeat(80));

const text4 = `
The wizard arrived at the meeting.
`.trim();

const entities4 = [
  createTestEntity('gandalf', 'Gandalf'),
  createTestEntity('saruman', 'Saruman')
];

const spans4: Array<{ entity_id: string; start: number; end: number }> = [];

const sentences4 = createSentences(text4);

// Create profiles (Gandalf mentioned 10 times, Saruman 2 times)
const profiles4 = new Map<string, EntityProfile>();

const gandalfProfile = createProfile(entities4[0], 'doc1');
gandalfProfile.descriptors.add('wizard');
gandalfProfile.roles.add('wizard');
gandalfProfile.mention_count = 10;
gandalfProfile.confidence_score = 0.80;
profiles4.set('gandalf', gandalfProfile);

const sarumanProfile = createProfile(entities4[1], 'doc1');
sarumanProfile.descriptors.add('wizard');
sarumanProfile.roles.add('wizard');
sarumanProfile.mention_count = 2;
sarumanProfile.confidence_score = 0.60;
profiles4.set('saruman', sarumanProfile);

const context4: ResolutionContext = {
  mention_text: 'the wizard',
  mention_start: 0,
  mention_end: 10,
  sentence_index: 0,
  paragraph_index: 0
};

const result4 = resolveDescriptor(
  context4,
  'wizard',
  entities4,
  spans4,
  sentences4,
  text4,
  profiles4
);

console.log(`Document with no prior wizard mentions`);
console.log(`Gandalf profile: 10 mentions, 0.80 confidence`);
console.log(`Saruman profile: 2 mentions, 0.60 confidence`);
console.log(`\nExpected: Gandalf (dominant profile) OR null (too ambiguous)`);
console.log(`Result: ${result4 ? entities4.find(e => e.id === result4.entity_id)?.canonical : 'null (safely ambiguous)'}`);
console.log(`Confidence: ${result4?.confidence.toFixed(2) || 'N/A'}`);
console.log(`Method: ${result4?.method || 'N/A'}`);
console.log();

console.log('='.repeat(80));
console.log('TEST COMPLETE');
console.log('='.repeat(80));
console.log();
console.log('KEY INSIGHTS:');
console.log('1. Recency matters: Most recent mention in paragraph gets priority');
console.log('2. Ambiguity detection: System refuses to guess when unclear');
console.log('3. Context layers: Paragraph > Document > Profile');
console.log('4. Confidence scoring: Lower confidence when less certain');
