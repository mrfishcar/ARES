import { jaroWinkler } from './app/engine/merge';

// Test cases: should NOT merge
const noMerge = [
  ['Aragorn', 'Arathorn'],  // Father and son
  ['Frodo', 'Drogo'],       // Uncle and nephew
  ['Harry', 'Harr'],        // Typo
  ['Gandalf', 'Gandolf'],   // Typo
];

// Test cases: SHOULD merge
const shouldMerge = [
  ['Gandalf', 'Gandalf'],
  ['Aragorn', 'aragorn'],
  ['Harry Potter', 'Harry'],
  ['Frodo Baggins', 'Frodo'],
];

console.log('Should NOT merge:');
for (const [a, b] of noMerge) {
  const score = jaroWinkler(a.toLowerCase(), b.toLowerCase());
  console.log(`  ${a} vs ${b}: ${score.toFixed(3)}`);
}

console.log('\nSHOULD merge:');
for (const [a, b] of shouldMerge) {
  const score = jaroWinkler(a.toLowerCase(), b.toLowerCase());
  console.log(`  ${a} vs ${b}: ${score.toFixed(3)}`);
}

console.log('\nCurrent threshold: 0.85');
console.log('Suggested threshold: 0.95 (exact match or very close)');
