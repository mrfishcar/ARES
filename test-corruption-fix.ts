/**
 * Test script to verify entity extraction corruption fix
 * Tests the scenarios that previously produced corrupted entities
 */

import { extractEntities } from "./app/engine/extract/entities";

async function testCorruptionFix() {
  console.log("Testing entity extraction corruption fix...\n");

  // Test case 1: "Ron Weasley" (previously corrupted to "Ron WeasleRon")
  const test1 = `Harry Potter and Ron Weasley were best friends. Ron was always there for Harry.`;

  // Test case 2: "Slytherin" (previously corrupted to "SlytheriHe")
  const test2 = `Harry was nearly sorted into Slytherin. He was glad to avoid that house.`;

  // Test case 3: "Hermione Granger" (previously corrupted to "Hermione GrangeThe")
  const test3 = `Hermione Granger was the smartest witch. The other students admired her.`;

  // Test case 4: "Ravenclaw" (previously corrupted to "RavenclaEach")
  const test4 = `Ravenclaw House values wisdom. Each student there is very intelligent.`;

  // Test case 5: "Ginny Weasley" (previously corrupted to "Ginny WeasleLuna")
  const test5 = `Ginny Weasley and Luna Lovegood became close friends.`;

  const tests = [
    { name: "Ron Weasley", text: test1, expected: ["Ron Weasley", "Harry Potter", "Ron", "Harry"] },
    { name: "Slytherin", text: test2, expected: ["Harry", "Slytherin"] },
    { name: "Hermione Granger", text: test3, expected: ["Hermione Granger"] },
    { name: "Ravenclaw", text: test4, expected: ["Ravenclaw"] },
    { name: "Ginny Weasley", text: test5, expected: ["Ginny Weasley", "Luna Lovegood"] }
  ];

  let passCount = 0;
  let failCount = 0;

  for (const test of tests) {
    console.log(`\n📝 Test: ${test.name}`);
    console.log(`Text: "${test.text}"`);

    try {
      const result = await extractEntities(test.text);

      console.log(`✅ Extracted entities:`);
      for (const entity of result.entities) {
        // Check for actual corruption patterns
        const hasCorruption =
          /[a-z][A-Z]/.test(entity.canonical) || // lowercase followed by uppercase (indicates concatenation)
          entity.canonical === 'Ron WeasleRon' ||
          entity.canonical === 'SlytheriHe' ||
          entity.canonical === 'Hermione GrangeThe' ||
          entity.canonical === 'RavenclaEach' ||
          entity.canonical === 'Ginny WeasleLuna' ||
          entity.canonical === 'PotionThe';

        if (hasCorruption) {
          console.log(`  ❌ CORRUPTED: ${entity.canonical} (${entity.type})`);
          failCount++;
        } else {
          console.log(`  ✓ ${entity.canonical} (${entity.type})`);
        }
      }

      // Verify spans are valid
      for (const span of result.spans) {
        const extracted = test.text.slice(span.start, span.end);
        if (span.start < 0 || span.end > test.text.length || span.start >= span.end) {
          console.log(`  ❌ Invalid span: start=${span.start}, end=${span.end}`);
          failCount++;
        } else {
          console.log(`  ✓ Span [${span.start}, ${span.end}]: "${extracted}"`);
        }
      }

      passCount++;
    } catch (error) {
      console.log(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      failCount++;
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`\n✅ Passed: ${passCount}/${tests.length}`);
  console.log(`❌ Failed: ${failCount}\n`);

  if (failCount === 0) {
    console.log("🎉 All tests passed! No corruption detected.");
    process.exit(0);
  } else {
    console.log("⚠️  Some issues detected. Check output above.");
    process.exit(1);
  }
}

testCorruptionFix().catch(console.error);
