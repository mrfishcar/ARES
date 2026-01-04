const text = 'He had not spoken face to face with his father, Andrew Beauregard, for thirty-two days.';
const pattern = /\b(?:his|her|their)\s+(?:father|mother|brother|sister|son|daughter|uncle|aunt|cousin|grandfather|grandmother|husband|wife),?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
let match;
while ((match = pattern.exec(text)) !== null) {
  console.log('Match:', match[0]);
  console.log('Captured name:', match[1]);
}
console.log('Done');
