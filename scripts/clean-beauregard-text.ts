/**
 * Clean Beauregard text file for consistent extraction
 * Fixes encoding issues and normalizes line endings consistently
 */

import * as fs from 'fs';
import * as path from 'path';

const inputPath = path.join(__dirname, '..', 'Barty Beauregard and the Fabulous Fraud PLAIN TEXT.txt');
const outputPath = path.join(__dirname, '..', 'Barty Beauregard CLEANED.txt');

// Read with latin1 to preserve all characters
const rawText = fs.readFileSync(inputPath, 'latin1');

console.log('Original file size:', rawText.length, 'bytes');
console.log('CR count:', (rawText.match(/\r/g) || []).length);
console.log('LF count:', (rawText.match(/\n/g) || []).length);
console.log('CRLF count:', (rawText.match(/\r\n/g) || []).length);

// Clean the text:
// 1. First normalize all line endings to \n (this is critical for span accuracy)
// 2. Replace smart quotes and special characters
// 3. Remove control characters

let cleanText = rawText;

// Normalize line endings: \r\n -> \n, then \r -> \n
cleanText = cleanText.replace(/\r\n/g, '\n');
cleanText = cleanText.replace(/\r/g, '\n');

// Replace Mac smart quotes (various encodings)
cleanText = cleanText.replace(/[\u2018\u2019\u201A\u201B\u0091\u0092]/g, "'");
cleanText = cleanText.replace(/[\u201C\u201D\u201E\u201F\u0093\u0094]/g, '"');

// Replace em/en dashes
cleanText = cleanText.replace(/[\u2013\u2014\u0096\u0097]/g, '-');

// Replace other special characters (Ó, Ê, Õ are Mac encoding artifacts)
// In Mac Roman encoding: Ó = 0xD3, Ê = 0xCA, Õ = 0xD5
// These appear in the text as quote/apostrophe markers
// M-R = " (open quote), M-S = " (close quote), M-Q = ' (apostrophe), M-U = ' (apostrophe)
// Let's replace common patterns
cleanText = cleanText.replace(/Ò/g, '"');  // M-R -> open quote
cleanText = cleanText.replace(/Ó/g, '"');  // M-S -> close quote
cleanText = cleanText.replace(/Õ/g, "'");  // M-Q -> apostrophe
cleanText = cleanText.replace(/Ê/g, ' ');  // M-J -> space (line break marker)
cleanText = cleanText.replace(/É/g, '-');  // M-I -> dash

// Remove remaining control characters (except newline)
cleanText = cleanText.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F]/g, '');

// Collapse multiple newlines into max 2
cleanText = cleanText.replace(/\n{3,}/g, '\n\n');

console.log('\nCleaned file size:', cleanText.length, 'bytes');
console.log('CR count:', (cleanText.match(/\r/g) || []).length);
console.log('LF count:', (cleanText.match(/\n/g) || []).length);

// Write cleaned file
fs.writeFileSync(outputPath, cleanText, 'utf8');
console.log('\nWrote cleaned file to:', outputPath);

// Show sample
console.log('\n=== First 500 chars of cleaned text ===');
console.log(cleanText.slice(0, 500));
