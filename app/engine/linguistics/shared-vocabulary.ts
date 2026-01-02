/**
 * Shared Vocabulary Constants
 *
 * This module provides canonical definitions for linguistic sets used across
 * the extraction pipeline. Each set has a specific purpose - do not duplicate.
 *
 * @module shared-vocabulary
 */

// ============================================================================
// COMMON VERBS - For detecting "Name + verb" patterns at sentence start
// Used by: mention-classifier.ts
// Purpose: Allow sentence-initial capitalized words when followed by common verbs
// Example: "Harry walked" → "Harry" is valid name because "walked" is a verb
// ============================================================================

export const COMMON_VERBS_FOR_NAME_DETECTION = new Set([
  // Modal/auxiliary verbs
  'could', 'would', 'should', 'will', 'can', 'may', 'might', 'must', 'shall',
  'was', 'is', 'are', 'were', 'has', 'had', 'have', 'did', 'does', 'do',

  // Past tense action verbs (common in narrative)
  'walked', 'smiled', 'spoke', 'said', 'went', 'came', 'looked', 'turned',
  'stood', 'sat', 'ran', 'fell', 'woke', 'slept', 'ate', 'drank', 'thought',
  'felt', 'knew', 'saw', 'heard', 'asked', 'told', 'replied', 'nodded',
  'shook', 'laughed', 'cried', 'screamed', 'whispered', 'shouted',
  'arrived', 'appeared', 'left', 'entered', 'exited',
  'began', 'started', 'finished', 'stopped', 'continued', 'tried',
  'wanted', 'needed', 'loved', 'hated', 'liked', 'married',
  'dwelt', 'lived', 'taught', 'fought', 'brought', 'caught', 'bought',
  'sought', 'wrought', 'ruled', 'worked', 'traveled', 'travelled',
  'founded', 'attended', 'carried', 'followed', 'helped', 'reached',
  'returned', 'saved', 'killed', 'died', 'rose', 'flew', 'swam',
  'drove', 'rode', 'climbed', 'jumped', 'held', 'kept', 'gave', 'took',
  'made', 'created', 'built', 'destroyed', 'played', 'claimed',
  'passed', 'decided', 'discovered', 'learned', 'found', 'met', 'lost',
  'won', 'defeated', 'studied',
  // Additional action verbs for name detection
  'trained', 'protected', 'attacked', 'escaped', 'captured', 'rescued',
  'guided', 'warned', 'admired', 'trusted', 'defended', 'released',
  'joined', 'visited', 'heard', 'knew', 'recognized', 'led', 'succeeded',

  // Additional past tense verbs (cognitive, possessive, emotional)
  'formed', 'believed', 'published', 'possessed', 'owned', 'used', 'wore',
  'received', 'accepted', 'rejected', 'sent', 'wrote', 'read', 'remembered',
  'forgot', 'understood', 'recognized', 'noticed', 'observed', 'watched',
  'feared', 'hoped', 'wished', 'dreamed', 'expected', 'suspected',
  'doubted', 'trusted', 'betrayed',

  // Present tense verbs (for general statements)
  'teaches', 'owns', 'runs', 'leads', 'serves', 'writes', 'reads',
  'lives', 'works', 'rules', 'guards', 'fights', 'travels', 'wanders',
  'visits', 'meets', 'joins', 'becomes', 'became', 'remains', 'studies',

  // Biblical/archaic verb forms (for historical texts)
  'begat', 'begot', 'spake', 'saith', 'hath', 'doth', 'didst',
  'wilt', 'shalt', 'canst', 'wouldst', 'shouldst',
  'goeth', 'cometh', 'sayeth', 'loveth', 'knoweth', 'seeth', 'heareth',
  'giveth', 'taketh', 'maketh', 'calleth', 'walketh', 'speaketh',
  'setteth', 'getteth', 'putteth'
]);

// ============================================================================
// VERBS BLOCKLIST - Words that should never be entity names
// Used by: entity-quality-filter.ts, global-graph.ts
// Purpose: Reject entities whose canonical contains only verbs
// Example: "Break" as entity name → reject
// ============================================================================

export const VERBS_BLOCKLIST_FOR_ENTITY_NAMES = new Set([
  // Common action verbs that get misidentified as entities
  'break', 'breaks', 'run', 'runs', 'walk', 'walks',
  'fight', 'fights', 'attack', 'attacks', 'defend', 'defends',

  // Auxiliary verbs that appear in fragments
  'had', 'has', 'have', 'was', 'were', 'is', 'are', 'did', 'does', 'do',

  // Past tense verbs commonly seen in entity extraction errors
  'met', 'married', 'lived', 'worked', 'went', 'came', 'said', 'told'
]);

// ============================================================================
// Test helper - ensures sets don't accidentally diverge
// ============================================================================

/**
 * Validates that a verb exists in the comprehensive set.
 * Used in tests to prevent divergence.
 */
export function isKnownVerb(verb: string): boolean {
  return COMMON_VERBS_FOR_NAME_DETECTION.has(verb.toLowerCase());
}

/**
 * Validates that a verb is blocklisted for entity names.
 */
export function isBlocklistedVerb(verb: string): boolean {
  return VERBS_BLOCKLIST_FOR_ENTITY_NAMES.has(verb.toLowerCase());
}
