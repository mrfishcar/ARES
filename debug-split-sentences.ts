import { splitSentences } from './app/engine/segmenter';

const paraText = `Harry Potter was the son of James and Lily Potter. He lived with the Dursleys in Privet Drive.`;
const paraStart = 0;

console.log(`Paragraph text: "${paraText}"`);
console.log(`Length: ${paraText.length}\n`);

const sentences = splitSentences(paraText, paraStart);

console.log(`Sentences found: ${sentences.length}\n`);

for (let i = 0; i < sentences.length; i++) {
  console.log(`[${i}] [${sentences[i].start}-${sentences[i].end}]: "${sentences[i].text}"`);
}
