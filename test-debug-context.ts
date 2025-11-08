/**
 * Debug context and classification for failing test cases
 */

import { parseWithService } from './app/engine/extract/entities';
import { analyzeEntityContext, classifyWithContext } from './app/engine/extract/context-classifier';

async function debugContext() {
  console.log('=== DEBUGGING CONTEXT CLASSIFICATION ===\n');

  const tests = [
    "The heroes descended into the Shadowcliffs.",
    "They sought refuge in Stormhaven.",
    "The army marched through the Eastern Reaches.",
    "Few survive crossing the Scorched Wastes.",
    "The Dragonhighe Highlands are treacherous."
  ];

  for (const text of tests) {
    console.log(`\n--- "${text}" ---`);

    const parsed = await parseWithService(text);
    const sent = parsed.sentences[0];

    // Find the capitalized entity (simple heuristic)
    const capitalTokens = sent.tokens.filter(t =>
      /^[A-Z]/.test(t.text) && !['The', 'They', 'Few'].includes(t.text)
    );

    if (capitalTokens.length === 0) continue;

    const entityTokens = capitalTokens;
    const entityText = entityTokens.map(t => t.text).join(' ');

    console.log(`Entity: "${entityText}"`);
    console.log(`Tokens:`, entityTokens.map(t => `${t.text}(dep=${t.dep},pos=${t.pos},head=${t.head})`).join(' '));

    const context = analyzeEntityContext(entityTokens, sent.tokens, sent);

    console.log(`Context hints:`);
    console.log(`  - dependencyRole: ${context.dependencyRole}`);
    console.log(`  - governingVerb: ${context.governingVerb}`);
    console.log(`  - governingVerbLemma: ${context.governingVerbLemma}`);
    console.log(`  - preposition: ${context.preposition}`);
    console.log(`  - isSubjectOf: ${context.isSubjectOf}`);
    console.log(`  - isObjectOf: ${context.isObjectOf}`);
    console.log(`  - isPrepObjectOf: ${context.isPrepObjectOf}`);
    console.log(`  - nearbyVerbs: [${context.nearbyVerbs.join(', ')}]`);

    const classification = classifyWithContext(entityText, context);
    console.log(`Classification: ${classification}`);
  }
}

debugContext().catch(console.error);
