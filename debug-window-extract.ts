import { extractEntities } from './app/engine/extract/entities';

async function debug() {
  const fullText = `Harry Potter was the son of James and Lily Potter. He lived with the Dursleys in Privet Drive.

Harry's best friend was Ron Weasley. Ron came from a large wizarding family. His father Arthur worked at the Ministry of Magic.`;

  console.log(`Full text length: ${fullText.length}\n`);

  // Simulate segment extraction with context window
  // Second sentence: "He lived with the Dursleys in Privet Drive."
  const segStart = 60;
  const segEnd = 104;
  const segText = fullText.slice(segStart, segEnd);

  const contextBefore = fullText.slice(Math.max(0, segStart - 200), segStart);
  const contextAfter = fullText.slice(segEnd, Math.min(fullText.length, segEnd + 200));
  const window = contextBefore + segText + contextAfter;
  const segOffsetInWindow = contextBefore.length;

  console.log(`Segment [${segStart}-${segEnd}]: "${segText}"`);
  console.log(`\nWindow: "${window}"`);
  console.log(`Segment offset in window: ${segOffsetInWindow}\n`);

  const { entities, spans } = await extractEntities(window);

  console.log('Entities extracted from window:');
  for (const e of entities) {
    console.log(`  ${e.canonical} (${e.type}) [id: ${e.id}]`);

    const entitySpans = spans.filter(s => s.entity_id === e.id);
    for (const s of entitySpans) {
      const spanText = window.slice(s.start, s.end);
      console.log(`    [${s.start}-${s.end}] "${spanText}"`);

      // Check if span is in segment
      const inSegment = s.start >= segOffsetInWindow && s.end <= segOffsetInWindow + segText.length;
      console.log(`      In segment: ${inSegment}`);

      if (inSegment) {
        // Remap to absolute position
        const absStart = segStart + (s.start - segOffsetInWindow);
        const absEnd = segStart + (s.end - segOffsetInWindow);
        const absText = fullText.slice(absStart, absEnd);
        console.log(`      Absolute [${absStart}-${absEnd}]: "${absText}"`);
      }
    }
  }
}

debug().catch(console.error);
