/**
 * Test script to verify entity highlighter is working
 */

import { highlightEntities } from './app/editor/entityHighlighter';

async function testHighlighter() {
  console.log('Testing entity highlighter...\n');

  // Test 1: Properly capitalized (should work)
  const testText1 = `Harry Potter went to Hogwarts. Ron Weasley was his best friend.`;

  // Test 2: Lowercase (should now work with case-insensitive detection)
  const testText2 = `harry potter went to hogwarts. ron weasley was his best friend.`;

  // Test 3: Mixed case (should work with both patterns)
  const testText3 = `Harry Potter and hermione granger went to Hogwarts. ron weasley was there too.`;

  const testText = testText3; // Use mixed case test

  console.log('Input text:', testText);
  console.log('');

  try {
    const spans = await highlightEntities(testText, {
      maxHighlights: 1000,
      minConfidence: 0.6,
      enableNaturalDetection: true,
    });

    console.log(`Found ${spans.length} entities:`);
    for (const span of spans) {
      console.log(`  - "${span.text}" (${span.type}, confidence: ${span.confidence.toFixed(2)}, source: ${span.source})`);
      console.log(`    [${span.start}, ${span.end}]`);
    }

    if (spans.length === 0) {
      console.log('\n❌ ERROR: No entities detected! The highlighter is not working.');
      process.exit(1);
    } else {
      console.log('\n✅ Highlighter is working!');
      process.exit(0);
    }
  } catch (error) {
    console.error('\n❌ ERROR:', error);
    console.error('Stack:', error instanceof Error ? error.stack : 'No stack trace');
    process.exit(1);
  }
}

testHighlighter();
