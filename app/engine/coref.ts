/**
 * Coreference Resolution v1 - Rule-Based
 *
 * Strategy:
 * 1. Pronoun stacks per paragraph (he/she/they/it → last compatible entity)
 * 2. Title back-links ("the king" → nearest PERSON with king title/role)
 * 3. Nominal NP back-links ("the wizard" → rolling descriptor index)
 * 4. Quote attribution ("...", said X → attach utterance to X)
 * 5. Coordination fan-out ("X and Y verb" → both X and Y are subjects)
 *
 * Deterministic, no ML, works with sentence segmentation.
 */

import type { Sentence } from './segment';
import type { Entity, EntityType } from './schema';
import { findByDescriptor, type EntityProfile } from './entity-profiler';
import { isEntityPronounCompatible } from './linguistics/context-signals';

/**
 * Mention represents a text span that might refer to an entity
 */
export interface Mention {
  text: string;
  start: number;
  end: number;
  sentence_index: number;
  type: 'pronoun' | 'title' | 'nominal' | 'name' | 'quote';
}

/**
 * CorefLink connects a mention to an entity
 */
export interface CorefLink {
  mention: Mention;
  entity_id: string;
  confidence: number;
  method: 'pronoun_stack' | 'title_match' | 'nominal_match' | 'quote_attr' | 'coordination';
}

/**
 * CorefLinks holds all coreference resolution results
 */
export interface CorefLinks {
  links: CorefLink[];
  quotes: Array<{
    text: string;
    start: number;
    end: number;
    speaker_entity_id: string;
    sentence_index: number;
  }>;
}

/**
 * Gender/number for entity matching
 */
type Gender = 'male' | 'female' | 'neutral' | 'unknown';
type Number = 'singular' | 'plural' | 'unknown';

/**
 * Pronoun definitions with gender/number
 */
const PRONOUNS = new Map<string, { gender: Gender; number: Number }>([
  // Male singular
  ['he', { gender: 'male', number: 'singular' }],
  ['him', { gender: 'male', number: 'singular' }],
  ['his', { gender: 'male', number: 'singular' }],
  // Female singular
  ['she', { gender: 'female', number: 'singular' }],
  ['her', { gender: 'female', number: 'singular' }],
  ['hers', { gender: 'female', number: 'singular' }],
  // Neutral singular
  ['it', { gender: 'neutral', number: 'singular' }],
  ['its', { gender: 'neutral', number: 'singular' }],
  // Plural
  ['they', { gender: 'neutral', number: 'plural' }],
  ['them', { gender: 'neutral', number: 'plural' }],
  ['their', { gender: 'neutral', number: 'plural' }],
  ['theirs', { gender: 'neutral', number: 'plural' }],
]);

/**
 * Location pronouns that refer to places
 */
const LOCATION_PRONOUNS = new Set(['there', 'here']);

/**
 * Title keywords that suggest roles
 */
const TITLES = new Map<string, string[]>([
  ['king', ['king', 'monarch', 'ruler']],
  ['queen', ['queen', 'monarch', 'ruler']],
  ['prince', ['prince', 'heir']],
  ['princess', ['princess', 'heir']],
  ['lord', ['lord', 'noble']],
  ['lady', ['lady', 'noble']],
  ['wizard', ['wizard', 'mage', 'sorcerer', 'archmage']],
  ['captain', ['captain', 'commander', 'leader']],
  ['professor', ['professor', 'teacher', 'instructor']],
  ['doctor', ['doctor', 'physician', 'healer']],
  ['scientist', ['scientist', 'researcher']],
  ['foster', ['foster', 'adopted']],
  ['child', ['child', 'son', 'daughter', 'kid']],
  ['parent', ['parent', 'father', 'mother', 'dad', 'mom']],
]);

/**
 * Common nominal descriptors
 */
const NOMINALS = new Set([
  'wizard', 'mage', 'sorcerer', 'witch',
  'king', 'queen', 'prince', 'princess', 'lord', 'lady',
  'man', 'woman', 'boy', 'girl', 'person',
  'scientist', 'professor', 'teacher', 'doctor',
  'captain', 'commander', 'leader',
  'child', 'son', 'daughter',
  'parent', 'father', 'mother',
  'couple', 'pair', 'duo', 'family', 'trio', 'group',  // Collective references
]);

/**
 * Quote attribution patterns
 */
const SAID_VERBS = new Set([
  'said', 'says', 'say',
  'asked', 'asks', 'ask',
  'replied', 'replies', 'reply',
  'answered', 'answers', 'answer',
  'whispered', 'whispers', 'whisper',
  'shouted', 'shouts', 'shout',
  'exclaimed', 'exclaims', 'exclaim',
  'muttered', 'mutters', 'mutter',
  'announced', 'announces', 'announce',
  'declared', 'declares', 'declare',
]);

/**
 * Detect paragraph breaks (double newline in original text)
 */
function getParagraphIndex(sentences: Sentence[], sentenceIndex: number, text: string): number {
  let paragraphIndex = 0;

  for (let i = 0; i < sentenceIndex && i < sentences.length; i++) {
    const currSent = sentences[i];
    const nextSent = sentences[i + 1];

    if (nextSent) {
      // Check if there's a double newline between sentences
      const between = text.slice(currSent.end, nextSent.start);
      if (/\n\s*\n/.test(between)) {
        paragraphIndex++;
      }
    }
  }

  return paragraphIndex;
}

/**
 * Infer gender from entity name and context
 */
function inferGender(entity: Entity): Gender {
  const name = entity.canonical.toLowerCase();

  // Male indicators
  const maleNames = ['harry', 'ron', 'aragorn', 'frodo', 'gandalf', 'sam', 'mark', 'john', 'james', 'michael'];
  const malePatterns = /\b(mr\.|mister|sir|king|prince|lord|father|dad|son|brother|he|him|his)\b/i;

  // Female indicators
  const femaleNames = ['hermione', 'ginny', 'arwen', 'galadriel', 'eowyn', 'anne', 'mary', 'sarah', 'elizabeth'];
  const femalePatterns = /\b(mrs\.|miss|ms\.|lady|queen|princess|mother|mom|daughter|sister|she|her)\b/i;

  if (maleNames.some(n => name.includes(n)) || malePatterns.test(name)) {
    return 'male';
  }

  if (femaleNames.some(n => name.includes(n)) || femalePatterns.test(name)) {
    return 'female';
  }

  return 'unknown';
}

/**
 * Check if entity matches pronoun gender/number constraints
 */
function matchesGenderNumber(entity: Entity, gender: Gender, number: Number): boolean {
  const entityGender = inferGender(entity);

  // 🛡️ PR-1: Use centralized pronoun compatibility check
  // Map gender to pronoun for compatibility check
  const pronounMap: Record<string, string> = {
    'male-singular': 'he',
    'female-singular': 'she',
    'neutral-singular': 'it',
    'neutral-plural': 'they',
  };
  const pronounKey = `${gender}-${number}`;
  const pronoun = pronounMap[pronounKey];

  if (pronoun && !isEntityPronounCompatible(pronoun, entity.canonical)) {
    return false; // Pronoun not compatible with entity (e.g., "he" → school)
  }

  // Number check: only PERSON entities can be singular, ORGs are often plural
  if (number === 'singular' && entity.type === 'ORG') {
    return false;
  }

  // Gender check
  if (gender === 'neutral' && number === 'singular') {
    // "it" typically refers to non-persons (places, organizations, things)
    return entity.type !== 'PERSON';
  }

  if (gender === 'male' || gender === 'female') {
    // Must be PERSON and match gender
    if (entity.type !== 'PERSON') return false;
    if (entityGender === 'unknown') return true; // Allow if gender unknown
    return entityGender === gender;
  }

  if (gender === 'neutral' && number === 'plural') {
    // "they" can refer to persons or groups
    return true;
  }

  return true;
}

/**
 * Extract mentions from sentences
 */
function extractMentions(sentences: Sentence[], text: string): Mention[] {
  const mentions: Mention[] = [];

  for (let si = 0; si < sentences.length; si++) {
    const sentence = sentences[si];
    const sentText = sentence.text;

    // Extract pronouns (person and location)
    const words = sentText.split(/\b/);
    let offset = sentence.start;

    for (const word of words) {
      const lower = word.toLowerCase();

      if (PRONOUNS.has(lower) || LOCATION_PRONOUNS.has(lower)) {
        const start = text.indexOf(word, offset);
        if (start >= sentence.start && start < sentence.end) {
          mentions.push({
            text: word,
            start,
            end: start + word.length,
            sentence_index: si,
            type: 'pronoun',
          });
          offset = start + word.length;
        }
      }
    }

    // Extract nominals ("the wizard", "the king", etc.)
    const nominalPattern = /\bthe\s+([a-z]+(?:\s+[a-z]+)?)\b/gi;
    let match: RegExpExecArray | null;

    while ((match = nominalPattern.exec(sentText))) {
      const descriptor = match[1].toLowerCase();
      const hasNominal = Array.from(NOMINALS).some(n => descriptor.includes(n));

      if (hasNominal) {
        const start = sentence.start + match.index;
        const end = start + match[0].length;

        mentions.push({
          text: match[0],
          start,
          end,
          sentence_index: si,
          type: 'nominal',
        });
      }
    }

    // Extract title patterns ("the king", "the wizard", etc.)
    const titlePattern = /\bthe\s+(king|queen|prince|princess|lord|lady|wizard|archmage|captain|professor|doctor|foster\s+(?:child|son|daughter))\b/gi;

    while ((match = titlePattern.exec(sentText))) {
      const start = sentence.start + match.index;
      const end = start + match[0].length;

      mentions.push({
        text: match[0],
        start,
        end,
        sentence_index: si,
        type: 'title',
      });
    }

    // Extract quotes for attribution (both straight and curly quotes)
    const quotePattern = /[""]([^""]{1,200})[""]|"([^"]{1,200})"/g;

    while ((match = quotePattern.exec(sentText))) {
      const start = sentence.start + match.index;
      const end = start + match[0].length;

      mentions.push({
        text: match[0],
        start,
        end,
        sentence_index: si,
        type: 'quote',
      });
    }
  }

  return mentions;
}

/**
 * Calculate entity salience based on mention frequency
 */
function calculateEntitySalience(
  entitySpans: Array<{ entity_id: string; start: number; end: number }>,
  windowStart: number,
  windowEnd: number
): Map<string, number> {
  const salienceMap = new Map<string, number>();

  // Count mentions within the window
  for (const span of entitySpans) {
    if (span.start >= windowStart && span.start < windowEnd) {
      const count = salienceMap.get(span.entity_id) || 0;
      salienceMap.set(span.entity_id, count + 1);
    }
  }

  // Normalize to 0-1 scale
  const maxCount = Math.max(...Array.from(salienceMap.values()), 1);
  for (const [entityId, count] of salienceMap) {
    salienceMap.set(entityId, count / maxCount);
  }

  return salienceMap;
}

/**
 * Calculate recency score based on distance from pronoun
 * Returns score in range [0.3, 1.0]
 */
function calculateRecencyScore(distance: number): number {
  // Distance in characters from entity to pronoun
  // Closer = higher score
  // Use exponential decay: score = 0.3 + 0.7 * exp(-distance / 500)
  const decay = Math.exp(-distance / 500);
  return 0.3 + 0.7 * decay;
}

/**
 * Resolve pronouns using stacks per paragraph with cross-sentence fallback
 */
function resolvePronounStacks(
  mentions: Mention[],
  entities: Entity[],
  entitySpans: Array<{ entity_id: string; start: number; end: number }>,
  sentences: Sentence[],
  text: string
): CorefLink[] {
  const links: CorefLink[] = [];

  // Resolve each pronoun mention
  for (const mention of mentions) {
    if (mention.type !== 'pronoun') continue;

    const pronoun = mention.text.toLowerCase();

    // Check if it's a location pronoun
    if (LOCATION_PRONOUNS.has(pronoun)) {
      // Resolve to most recent PLACE or ORG entity
      const candidateSpans = entitySpans.filter(span => {
        const entity = entities.find(e => e.id === span.entity_id);
        return entity && (entity.type === 'PLACE' || entity.type === 'ORG') && span.start < mention.start;
      });

      // Sort by position (most recent = last in text before pronoun)
      candidateSpans.sort((a, b) => a.start - b.start);

      if (candidateSpans.length > 0) {
        const lastSpan = candidateSpans[candidateSpans.length - 1];
        const entity = entities.find(e => e.id === lastSpan.entity_id);

        if (entity) {
          links.push({
            mention,
            entity_id: entity.id,
            confidence: 0.75,
            method: 'pronoun_stack',
          });
        }
      }
      continue;
    }

    const pronounInfo = PRONOUNS.get(pronoun);
    if (!pronounInfo) continue;

    const parIndex = getParagraphIndex(sentences, mention.sentence_index, text);
    const currentSentence = sentences[mention.sentence_index];
    let foundLocal = false;

    // If the pronoun appears at the very start of a sentence, bias toward the
    // subject of the previous sentence in the same paragraph. This helps cases
    // like "His father Arthur..." where the most recent male subject (Ron) is
    // in the prior sentence, not earlier mentions with higher salience (Harry).
    const positionInSentence = mention.start - currentSentence.start;
    if (positionInSentence <= 5 && mention.sentence_index > 0) {
      const prevSentenceIndex = mention.sentence_index - 1;
      const prevSentence = sentences[prevSentenceIndex];

      if (getParagraphIndex(sentences, prevSentenceIndex, text) === parIndex) {
        const prevSpans = entitySpans
          .filter(span => span.start >= prevSentence.start && span.start < prevSentence.end)
          .sort((a, b) => a.start - b.start);

        for (let i = prevSpans.length - 1; i >= 0; i--) {
          const span = prevSpans[i];
          const entity = entities.find(e => e.id === span.entity_id);

          if (entity && matchesGenderNumber(entity, pronounInfo.gender, pronounInfo.number)) {
            links.push({
              mention,
              entity_id: entity.id,
              confidence: 0.75,
              method: 'pronoun_stack',
            });
            foundLocal = true;
            break;
          }
        }
      }
    }

    if (foundLocal) continue;
    // STEP 1: Try within-paragraph resolution (high confidence)
    const localCandidateSpans = entitySpans.filter(span => {
      const sentIndex = sentences.findIndex(s => span.start >= s.start && span.start < s.end);
      if (sentIndex === -1) return false;

      const spanParIndex = getParagraphIndex(sentences, sentIndex, text);
      return spanParIndex === parIndex && span.start < mention.start;
    });

    // Sort by position (most recent = last in text before pronoun)
    localCandidateSpans.sort((a, b) => a.start - b.start);

    // Possessive pronouns often refer to the most recent PERSON mention before
    // the sentence starts (e.g., "His father Arthur..." → Ron). Give a direct
    // recency-based pass before broader subject/other heuristics.
    const possessivePronouns = new Set(['his', 'her', 'their']);
    if (!foundLocal && possessivePronouns.has(pronoun)) {
      for (let i = localCandidateSpans.length - 1; i >= 0; i--) {
        const span = localCandidateSpans[i];
        const entity = entities.find(e => e.id === span.entity_id);

        if (entity && entity.type === 'PERSON' && matchesGenderNumber(entity, pronounInfo.gender, pronounInfo.number)) {
          links.push({
            mention,
            entity_id: entity.id,
            confidence: 0.72,
            method: 'pronoun_stack',
          });
          foundLocal = true;
          break;
        }
      }
    }

    if (foundLocal) {
      continue;
    }

    // Find last compatible entity, preferring sentence subjects
    // Heuristic: Entities near the start of their sentence (first 30% of sentence length)
    // are more likely to be subjects, so prioritize them over entities in appositives

    // Separate candidates into "likely subjects" and "others"
    const subjectCandidates: typeof localCandidateSpans = [];
    const otherCandidates: typeof localCandidateSpans = [];

    for (const span of localCandidateSpans) {
      const sentIndex = sentences.findIndex(s => span.start >= s.start && span.start < s.end);
      if (sentIndex !== -1) {
        const sent = sentences[sentIndex];
        const relativePos = (span.start - sent.start) / (sent.end - sent.start);

        // If entity appears in first 30% of sentence, likely a subject
        if (relativePos < 0.3) {
          subjectCandidates.push(span);
        } else {
          otherCandidates.push(span);
        }
      }
    }

    // Try subject candidates first (reverse order = most recent)
    for (let i = subjectCandidates.length - 1; i >= 0; i--) {
      const span = subjectCandidates[i];
      const entity = entities.find(e => e.id === span.entity_id);

      if (entity && matchesGenderNumber(entity, pronounInfo.gender, pronounInfo.number)) {
        links.push({
          mention,
          entity_id: entity.id,
          confidence: 0.7,
          method: 'pronoun_stack',
        });
        foundLocal = true;
        break;
      }
    }

    // If no subject match, fall back to other candidates
    if (!foundLocal) {
      for (let i = otherCandidates.length - 1; i >= 0; i--) {
        const span = otherCandidates[i];
        const entity = entities.find(e => e.id === span.entity_id);

        if (entity && matchesGenderNumber(entity, pronounInfo.gender, pronounInfo.number)) {
          links.push({
            mention,
            entity_id: entity.id,
            confidence: 0.65, // Slightly lower confidence for non-subject entities
            method: 'pronoun_stack',
          });
          foundLocal = true;
          break;
        }
      }
    }

    // STEP 2: If no local match, try cross-sentence/cross-paragraph resolution
    if (!foundLocal) {
      // Look back up to 2000 characters (about 2-3 paragraphs)
      const searchStart = Math.max(0, mention.start - 2000);
      const searchEnd = mention.start;

      // Calculate entity salience in this window
      const salienceMap = calculateEntitySalience(entitySpans, searchStart, searchEnd);

      // Collect all compatible entities before the pronoun in the window
      const crossSentenceCandidates = entitySpans.filter(span => {
        return span.start >= searchStart && span.start < searchEnd;
      });

      // Score each candidate by recency + salience + gender/number match
      const scoredCandidates: Array<{ span: typeof crossSentenceCandidates[0]; score: number; entity: Entity }> = [];

      for (const span of crossSentenceCandidates) {
        const entity = entities.find(e => e.id === span.entity_id);
        if (!entity) continue;

        // Must match gender/number
        if (!matchesGenderNumber(entity, pronounInfo.gender, pronounInfo.number)) continue;

        // Calculate composite score
        const distance = mention.start - span.end;
        const recencyScore = calculateRecencyScore(distance);
        const salienceScore = salienceMap.get(entity.id) || 0.1;

        // Combined score: 60% recency, 40% salience
        const compositeScore = 0.6 * recencyScore + 0.4 * salienceScore;

        scoredCandidates.push({ span, score: compositeScore, entity });
      }

      // Sort by score descending
      scoredCandidates.sort((a, b) => b.score - a.score);

      // Take the best candidate if score is reasonable (> 0.3)
      if (scoredCandidates.length > 0 && scoredCandidates[0].score > 0.3) {
        const best = scoredCandidates[0];

        // Confidence is based on composite score but capped lower than local resolution
        const confidence = Math.min(0.65, 0.3 + best.score * 0.5);

        links.push({
          mention,
          entity_id: best.entity.id,
          confidence,
          method: 'pronoun_stack',
        });
      }
    }
  }

  return links;
}

/**
 * Resolve title back-links ("the king" → entity with king role)
 */
function resolveTitleBackLinks(
  mentions: Mention[],
  entities: Entity[],
  entitySpans: Array<{ entity_id: string; start: number; end: number }>,
  sentences: Sentence[],
  text: string
): CorefLink[] {
  const links: CorefLink[] = [];

  for (const mention of mentions) {
    if (mention.type !== 'title') continue;

    const titleText = mention.text.toLowerCase();

    // Extract the key title word
    let titleKey: string | null = null;
    for (const [key] of TITLES) {
      if (titleText.includes(key)) {
        titleKey = key;
        break;
      }
    }

    if (!titleKey) continue;

    // Find nearest PERSON entity before this mention with matching title
    const candidateSpans = entitySpans.filter(
      span => span.end <= mention.start && entities.find(e => e.id === span.entity_id && e.type === 'PERSON')
    );

    // Sort by distance (closest first)
    candidateSpans.sort((a, b) => (mention.start - b.end) - (mention.start - a.end));

    for (const span of candidateSpans) {
      const entity = entities.find(e => e.id === span.entity_id)!;
      const entityName = entity.canonical.toLowerCase();

      // Check if entity name or aliases contain title keywords
      const titleSynonyms = TITLES.get(titleKey) || [];
      const hasTitle = titleSynonyms.some(syn => entityName.includes(syn));

      // Also check the text around the entity mention for title context
      const contextStart = Math.max(0, span.start - 20);
      const contextEnd = Math.min(text.length, span.end + 20);
      const context = text.slice(contextStart, contextEnd).toLowerCase();
      const contextHasTitle = titleSynonyms.some(syn => context.includes(syn));

      if (hasTitle || contextHasTitle) {
        links.push({
          mention,
          entity_id: entity.id,
          confidence: 0.85,
          method: 'title_match',
        });
        break;
      }
    }
  }

  return links;
}

/**
 * Resolve nominal NP back-links using rolling descriptor index + entity profiles
 */
function resolveNominalBackLinks(
  mentions: Mention[],
  entities: Entity[],
  entitySpans: Array<{ entity_id: string; start: number; end: number }>,
  sentences: Sentence[],
  text: string,
  profiles?: Map<string, EntityProfile>
): CorefLink[] {
  const links: CorefLink[] = [];

  // Build descriptor index per paragraph
  const paragraphDescriptors = new Map<number, Map<string, string>>();

  for (const span of entitySpans) {
    const entity = entities.find(e => e.id === span.entity_id);
    if (!entity || entity.type !== 'PERSON') continue;

    const sentIndex = sentences.findIndex(s => span.start >= s.start && span.start < s.end);
    if (sentIndex === -1) continue;

    const parIndex = getParagraphIndex(sentences, sentIndex, text);

    if (!paragraphDescriptors.has(parIndex)) {
      paragraphDescriptors.set(parIndex, new Map());
    }

    const descriptors = paragraphDescriptors.get(parIndex)!;
    const entityName = entity.canonical.toLowerCase();

    // Infer descriptors from entity name
    if (entityName.includes('wizard') || entityName.includes('mage')) {
      descriptors.set('wizard', entity.id);
    }
    if (entityName.includes('king')) {
      descriptors.set('king', entity.id);
    }
    if (entityName.includes('professor')) {
      descriptors.set('professor', entity.id);
    }
    if (entityName.includes('scientist')) {
      descriptors.set('scientist', entity.id);
    }

    // Generic descriptors based on gender
    const gender = inferGender(entity);
    if (gender === 'male') {
      descriptors.set('man', entity.id);
    } else if (gender === 'female') {
      descriptors.set('woman', entity.id);
    }
  }

  // Resolve nominal mentions
  for (const mention of mentions) {
    if (mention.type !== 'nominal') continue;

    const nominalText = mention.text.toLowerCase().replace(/^the\s+/, '');
    const parIndex = getParagraphIndex(sentences, mention.sentence_index, text);
    const descriptors = paragraphDescriptors.get(parIndex);

    // Special handling for collective references (couple, pair, duo, family, trio)
    const collectiveTerms = ['couple', 'pair', 'duo', 'family', 'trio'];
    const isCollective = collectiveTerms.some(term => nominalText.includes(term));

    if (isCollective) {
      // For collective references, find recent PERSON entities in the paragraph
      // Don't rely on gender-based descriptors, just look at entity spans directly
      const candidateSpans = entitySpans.filter(span => {
        const entity = entities.find(e => e.id === span.entity_id);
        if (!entity || entity.type !== 'PERSON') return false;

        // Must be in same paragraph and before this mention
        const sentIndex = sentences.findIndex(s => span.start >= s.start && span.start < s.end);
        if (sentIndex === -1) return false;

        const spanParIndex = getParagraphIndex(sentences, sentIndex, text);
        return spanParIndex === parIndex && span.start < mention.start;
      });

      // Sort by position (most recent = last in text before mention)
      candidateSpans.sort((a, b) => a.start - b.start);

      // Take the last 2-3 PERSON entities (depending on term)
      const count = nominalText.includes('trio') ? 3 : 2;
      const targetSpans = candidateSpans.slice(-count);

      // Create coref links to these entities
      for (const span of targetSpans) {
        links.push({
          mention,
          entity_id: span.entity_id,
          confidence: 0.75,
          method: 'nominal_match',
        });
      }
    } else {
      // ADAPTIVE LEARNING: Try profile-based resolution first
      let resolved = false;

      if (profiles && profiles.size > 0) {
        // Use findByDescriptor from entity-profiler (imported at top)

        // Extract descriptor words from nominal text
        const words = nominalText.split(/\s+/);

        for (const word of words) {
          if (word.length < 3) continue; // Skip short words

          // Find entities matching this descriptor in profiles
          const matches = findByDescriptor(word, profiles, 'PERSON');

          if (matches.length > 0) {
            // Use the best match (highest confidence)
            const best = matches[0];

            // Verify the entity is in the current paragraph or document
            const entityInDoc = entities.some(e => e.id === best.entity_id);

            if (entityInDoc) {
              links.push({
                mention,
                entity_id: best.entity_id,
                confidence: Math.min(0.95, best.confidence * 0.8), // Scale down confidence slightly
                method: 'nominal_match',
              });
              resolved = true;
              break;
            }
          }
        }
      }

      // Fallback: Use local paragraph descriptors if profile resolution failed
      if (!resolved && descriptors) {
        for (const [desc, entityId] of descriptors) {
          if (nominalText.includes(desc)) {
            links.push({
              mention,
              entity_id: entityId,
              confidence: 0.75,
              method: 'nominal_match',
            });
            break;
          }
        }
      }
    }
  }

  return links;
}

/**
 * Resolve quote attribution ("...", said X or X said, "...")
 */
function resolveQuoteAttribution(
  mentions: Mention[],
  entities: Entity[],
  entitySpans: Array<{ entity_id: string; start: number; end: number }>,
  sentences: Sentence[],
  text: string
): { links: CorefLink[]; quotes: Array<{ text: string; start: number; end: number; speaker_entity_id: string; sentence_index: number }> } {
  const links: CorefLink[] = [];
  const quotes: Array<{ text: string; start: number; end: number; speaker_entity_id: string; sentence_index: number }> = [];

  for (const mention of mentions) {
    if (mention.type !== 'quote') continue;

    const sentence = sentences[mention.sentence_index];
    const sentText = sentence.text;

    // Pattern 1: "...", said X or "...", X said
    // Look for said-verbs after the quote
    const afterText = sentText.slice(mention.end - sentence.start);
    const saidVerbPattern = new RegExp(`\\s*(said|asked|replied|answered|whispered|shouted|exclaimed|muttered)`, 'i');

    if (saidVerbPattern.test(afterText)) {
      // Find PERSON entities near the quote (within 30 chars after)
      const searchStart = mention.end;
      const searchEnd = Math.min(text.length, mention.end + 30);

      const nearbySpans = entitySpans.filter(span => {
        const entity = entities.find(e => e.id === span.entity_id);
        return entity && entity.type === 'PERSON' &&
               span.start >= searchStart && span.start < searchEnd;
      });

      if (nearbySpans.length > 0) {
        // Use the first PERSON entity found
        quotes.push({
          text: mention.text,
          start: mention.start,
          end: mention.end,
          speaker_entity_id: nearbySpans[0].entity_id,
          sentence_index: mention.sentence_index,
        });
        continue;
      }
    }

    // Pattern 2: X said, "..." or X said: "..."
    // Look for said-verbs before the quote
    const beforeText = sentText.slice(0, mention.start - sentence.start);

    if (saidVerbPattern.test(beforeText)) {
      // Find PERSON entities near the quote (within 30 chars before)
      const searchStart = Math.max(0, mention.start - 30);
      const searchEnd = mention.start;

      const nearbySpans = entitySpans.filter(span => {
        const entity = entities.find(e => e.id === span.entity_id);
        return entity && entity.type === 'PERSON' &&
               span.end > searchStart && span.end <= searchEnd;
      });

      if (nearbySpans.length > 0) {
        // Use the last PERSON entity found (closest to quote)
        quotes.push({
          text: mention.text,
          start: mention.start,
          end: mention.end,
          speaker_entity_id: nearbySpans[nearbySpans.length - 1].entity_id,
          sentence_index: mention.sentence_index,
        });
      }
    }
  }

  return { links, quotes };
}

/**
 * Resolve coordination fan-out ("X and Y verb" → both are subjects)
 */
function resolveCoordination(
  entities: Entity[],
  entitySpans: Array<{ entity_id: string; start: number; end: number }>,
  sentences: Sentence[],
  text: string
): CorefLink[] {
  const links: CorefLink[] = [];

  for (let si = 0; si < sentences.length; si++) {
    const sentence = sentences[si];
    const sentText = sentence.text;

    // Pattern: "X and Y verb"
    // Find coordination patterns with "and" between entities
    const andPattern = /\band\b/gi;
    let match: RegExpExecArray | null;

    while ((match = andPattern.exec(sentText))) {
      const andPos = sentence.start + match.index;

      // Look for entities before and after "and"
      const beforeSpans = entitySpans.filter(
        span => span.end <= andPos && span.start >= sentence.start && entities.find(e => e.id === span.entity_id && e.type === 'PERSON')
      );

      const afterSpans = entitySpans.filter(
        span => span.start >= andPos + 3 && span.end <= sentence.end && entities.find(e => e.id === span.entity_id && e.type === 'PERSON')
      );

      // If we have entities on both sides, check if followed by a verb
      if (beforeSpans.length > 0 && afterSpans.length > 0) {
        const lastBefore = beforeSpans[beforeSpans.length - 1];
        const firstAfter = afterSpans[0];

        // Check if followed by a verb (simplified check for common verbs)
        const afterCoord = sentText.slice(firstAfter.end - sentence.start).trim();
        const verbPattern = /^\s*(took|went|traveled|married|said|asked|lived|dwelt|fought|rode|came|left)/i;

        if (verbPattern.test(afterCoord)) {
          // Both entities are coordinated subjects - create links for tracking
          // (These links can be used by relation extraction to fan out relations)
          const beforeEntity = entities.find(e => e.id === lastBefore.entity_id);
          const afterEntity = entities.find(e => e.id === firstAfter.entity_id);

          if (beforeEntity && afterEntity) {
            // Create mentions for coordinated subjects
            const coordinatedMention: Mention = {
              text: text.slice(lastBefore.start, firstAfter.end),
              start: lastBefore.start,
              end: firstAfter.end,
              sentence_index: si,
              type: 'name',
            };

            links.push({
              mention: coordinatedMention,
              entity_id: beforeEntity.id,
              confidence: 0.9,
              method: 'coordination',
            });

            links.push({
              mention: coordinatedMention,
              entity_id: afterEntity.id,
              confidence: 0.9,
              method: 'coordination',
            });
          }
        }
      }
    }
  }

  return links;
}

/**
 * Main coreference resolution function
 */
export function resolveCoref(
  sentences: Sentence[],
  entities: Entity[],
  entitySpans: Array<{ entity_id: string; start: number; end: number }>,
  text: string,
  profiles?: Map<string, EntityProfile>
): CorefLinks {
  // Extract all mentions from sentences
  const mentions = extractMentions(sentences, text);

  // Resolve using different strategies
  const pronounLinks = resolvePronounStacks(mentions, entities, entitySpans, sentences, text);
  const titleLinks = resolveTitleBackLinks(mentions, entities, entitySpans, sentences, text);
  const nominalLinks = resolveNominalBackLinks(mentions, entities, entitySpans, sentences, text, profiles);
  const { links: quoteLinks, quotes } = resolveQuoteAttribution(mentions, entities, entitySpans, sentences, text);
  const coordinationLinks = resolveCoordination(entities, entitySpans, sentences, text);

  // DEBUG: Log resolution results
  if (titleLinks.length > 0) {
    console.log(`[COREF] Found ${titleLinks.length} title back-links`);
    for (const link of titleLinks) {
      const entity = entities.find(e => e.id === link.entity_id);
      console.log(`[COREF]   "${link.mention.text}" -> ${entity?.canonical} (${link.method})`);
    }
  }
  if (nominalLinks.length > 0) {
    console.log(`[COREF] Found ${nominalLinks.length} nominal back-links`);
  }

  // Merge all links
  const allLinks = [
    ...pronounLinks,
    ...titleLinks,
    ...nominalLinks,
    ...quoteLinks,
    ...coordinationLinks,
  ];

  // Deduplicate links (prefer higher confidence)
  const linkMap = new Map<string, CorefLink>();

  for (const link of allLinks) {
    const key = `${link.mention.start}:${link.mention.end}:${link.entity_id}`;
    const existing = linkMap.get(key);

    if (!existing || link.confidence > existing.confidence) {
      linkMap.set(key, link);
    }
  }

  return {
    links: Array.from(linkMap.values()),
    quotes,
  };
}
