// Inline the matching logic to debug
const text = `Edward Blackwood's brother, Edmund Blackwood, was already seated at the long table.`;

const entities = [
  { id: 'e1', canonical: 'Edward Blackwood', type: 'PERSON' as const, aliases: ['Edward'] },
  { id: 'e2', canonical: 'Edmund Blackwood', type: 'PERSON' as const, aliases: ['Edmund'] },
];

// matchEntity function
function matchEntity(surface: string, entities: any[]): any | null {
  const cleaned = surface
    .replace(/^[\s,.;:"'""''()]+/, '')
    .replace(/[\s,.;:"'""''()]+$/, '')
    .trim();

  if (!cleaned) return null;

  const surfaceLower = cleaned.toLowerCase();

  for (const entity of entities) {
    if (entity.canonical.toLowerCase() === surfaceLower) {
      console.log(`  matchEntity: MATCH canonical "${entity.canonical}" for surface "${cleaned}"`);
      return entity;
    }

    if (entity.aliases.some((alias: string) => alias.toLowerCase() === surfaceLower)) {
      console.log(`  matchEntity: MATCH alias for surface "${cleaned}"`);
      return entity;
    }

    const canonicalLower = entity.canonical.toLowerCase();
    if (canonicalLower.includes(surfaceLower) || surfaceLower.includes(canonicalLower)) {
      const words = surfaceLower.split(/\s+/);
      const canonicalWords = canonicalLower.split(/\s+/);

      if (words.every((w: string) => canonicalWords.includes(w)) ||
          canonicalWords.every((w: string) => words.includes(w))) {
        console.log(`  matchEntity: MATCH partial for surface "${cleaned}"`);
        return entity;
      }
    }
  }
  console.log(`  matchEntity: NO MATCH for surface "${cleaned}"`);
  return null;
}

// Test pattern
const possessivePattern = /\b((?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)|(?:the|this|that)\s+(?:couple|pair|trio|siblings|parents))'s\s+(?:[a-z]+\s+)*(daughter|son|child|parent|father|mother|brother|sister|wife|husband|spouse)\b/gi;

let match: RegExpExecArray | null;
while ((match = possessivePattern.exec(text)) !== null) {
  const possessorSurface = match[1];
  const roleWord = match[2].toLowerCase();

  console.log(`Pattern matched: "${match[0]}"`);
  console.log(`  Possessor surface: "${possessorSurface}"`);
  console.log(`  Role word: "${roleWord}"`);

  const directMatch = matchEntity(possessorSurface, entities);
  console.log(`  Direct match result:`, directMatch ? directMatch.canonical + ' (id: ' + directMatch.id + ')' : 'null');

  if (directMatch && directMatch.type === 'PERSON') {
    // Look for entity after
    const afterMatch = text.substring(match.index + match[0].length, match.index + match[0].length + 100);
    console.log(`  Looking for entity after: "${afterMatch.substring(0, 50)}..."`);

    const entityPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/;
    const entityMatch = afterMatch.match(entityPattern);

    if (entityMatch) {
      console.log(`  Found potential entity: "${entityMatch[1]}"`);
      const targetEntity = matchEntity(entityMatch[1], entities);
      console.log(`  Target entity match:`, targetEntity ? targetEntity.canonical + ' (id: ' + targetEntity.id + ')' : 'null');

      if (targetEntity && targetEntity.type === 'PERSON') {
        console.log(`  SUCCESS! Would create: ${directMatch.canonical} --[sibling_of]--> ${targetEntity.canonical}`);
      }
    }
  }
}
