/**
 * Dependency Path Extraction for Relation Detection
 *
 * This module extracts dependency paths between entity pairs and matches them
 * against known patterns. This is more robust than surface word patterns because
 * it's invariant to inserted clauses, modifiers, and word order variations.
 *
 * Example:
 *   "She, upon finding him deliriously handsome, made him a husband"
 *   Path: she --[nsubj]--> made <--[dobj]-- him <--[attr]-- husband
 *   Signature: "nsubj:made:dobj:husband"
 *   Match: MARRIAGE pattern
 */

import type { Token } from './types';
import type { Predicate } from '../../schema';

/**
 * A step in a dependency path
 */
interface PathStep {
  token: Token;
  relation: string; // dependency relation label
  direction: 'up' | 'down'; // up = to head, down = from head
}

/**
 * A complete dependency path between two tokens
 */
interface DependencyPath {
  steps: PathStep[];
  signature: string; // Compressed representation for matching
}

/**
 * A pattern that matches dependency paths to relations
 */
interface PathPattern {
  signature: string | RegExp;
  predicate: Predicate;
  subjectFirst: boolean; // true if subject comes before object in path
}

/**
 * Find shortest path between two tokens in dependency tree using BFS
 */
export function findShortestPath(
  start: Token,
  end: Token,
  tokens: Token[]
): DependencyPath | null {

  if (start.i === end.i) return null;

  // BFS to find shortest path
  interface QueueItem {
    token: Token;
    path: PathStep[];
  }

  const queue: QueueItem[] = [{ token: start, path: [] }];
  const visited = new Set<number>([start.i]);

  while (queue.length > 0) {
    const { token, path } = queue.shift()!;

    // Check all neighbors (head and dependents)
    const neighbors: Array<{ token: Token; relation: string; direction: 'up' | 'down' }> = [];

    // Add head (going up)
    if (token.head !== token.i) {
      const headToken = tokens[token.head];
      if (headToken) {
        neighbors.push({
          token: headToken,
          relation: token.dep,
          direction: 'up'
        });
      }
    }

    // Add dependents (going down)
    for (const dep of tokens) {
      if (dep.head === token.i && dep.i !== token.i) {
        neighbors.push({
          token: dep,
          relation: dep.dep,
          direction: 'down'
        });
      }
    }

    for (const neighbor of neighbors) {
      if (visited.has(neighbor.token.i)) continue;

      const newPath = [
        ...path,
        {
          token: neighbor.token,
          relation: neighbor.relation,
          direction: neighbor.direction
        }
      ];

      // Found target!
      if (neighbor.token.i === end.i) {
        return createDependencyPath(start, newPath);
      }

      visited.add(neighbor.token.i);
      queue.push({ token: neighbor.token, path: newPath });
    }
  }

  return null; // No path found
}

/**
 * Create dependency path with signature
 */
function createDependencyPath(start: Token, steps: PathStep[]): DependencyPath {
  // Build signature: capture key information for pattern matching
  const parts: string[] = [start.lemma.toLowerCase()];

  for (const step of steps) {
    const direction = step.direction === 'up' ? '↑' : '↓';
    parts.push(`${direction}${step.relation}`);
    parts.push(step.token.lemma.toLowerCase());
  }

  return {
    steps,
    signature: parts.join(':')
  };
}

/**
 * Patterns for each relation type
 * Format: lemma:↑dep:lemma:↓dep:lemma...
 * ↑ = going up to head
 * ↓ = going down to dependent
 */
const PATH_PATTERNS: PathPattern[] = [
  // === MARRIAGE ===

  // "X married Y"
  { signature: /^(\w+):↑nsubj:marry:↓(dobj|obj):(\w+)$/, predicate: 'married_to', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:wed:↓(dobj|obj):(\w+)$/, predicate: 'married_to', subjectFirst: true },

  // "Y was married by X" (passive)
  { signature: /^(\w+):↑nsubjpass:marry:↓agent:by:↓pobj:(\w+)$/, predicate: 'married_to', subjectFirst: false },

  // "X made Y a husband/wife" - husband/wife is attr of Y
  { signature: /^(\w+):↑nsubj:make:↓(dobj|obj):(\w+)$/, predicate: 'married_to', subjectFirst: true }, // Simple path
  { signature: /^(\w+):↑nsubj:make:↓(dobj|obj):(\w+):↓attr:(husband|wife)$/, predicate: 'married_to', subjectFirst: true }, // Extended path

  // "Y became X's husband/wife"
  { signature: /^(\w+):↑nsubj:become:↓attr:(husband|wife):↓poss:(\w+)$/, predicate: 'married_to', subjectFirst: false },

  // "X took Y as husband/wife"
  { signature: /^(\w+):↑nsubj:take:↓(dobj|obj):(\w+):↓prep:as:↓pobj:(husband|wife)$/, predicate: 'married_to', subjectFirst: true },

  // === FOUNDING / LEADS ===

  // "X founded/created/established Y"
  { signature: /^(\w+):↑nsubj:(found|create|establish|start|launch|build|form):↓(dobj|obj):(\w+)$/, predicate: 'leads', subjectFirst: true },

  // "Y was founded by X" (passive)
  { signature: /^(\w+):↑nsubjpass:(found|create|establish|start|launch):↓agent:by:↓pobj:(\w+)$/, predicate: 'leads', subjectFirst: false },

  // "Y, which was founded by X" (relative clause with passive)
  { signature: /^(\w+):↓relcl:(found|create|establish|start|launch):↓agent:by:↓pobj:(\w+)$/, predicate: 'leads', subjectFirst: false },

  // "Y, which was founded by X" (with compound name)
  { signature: /^(\w+):↑compound:(\w+):↓relcl:(found|create|establish|start|launch):↓agent:by:↓pobj:(\w+)$/, predicate: 'leads', subjectFirst: false },

  // "Y, X's brainchild"
  { signature: /^(\w+):↓poss:(\w+):↑nsubj:brainchild$/, predicate: 'leads', subjectFirst: false },

  // "co-founder of Y"
  { signature: /^(\w+):↑appos:(co-founder|founder):↓prep:of:↓pobj:(\w+)$/, predicate: 'leads', subjectFirst: true },

  // === ACQUISITION ===

  // "X acquired/purchased Y"
  { signature: /^(\w+):↑nsubj:(acquire|purchase|buy):↓(dobj|obj):(\w+)$/, predicate: 'acquired', subjectFirst: true },

  // "Y was acquired by X" (passive)
  { signature: /^(\w+):↑nsubjpass:(acquire|purchase|buy):↓agent:by:↓pobj:(\w+)$/, predicate: 'acquired', subjectFirst: false },

  // "acquisition of Y by X"
  { signature: /^(\w+):↑pobj:(acquisition|purchase):↓agent:by:↓pobj:(\w+)$/, predicate: 'acquired', subjectFirst: false },

  // === INVESTMENT ===

  // "X invested in Y"
  { signature: /^(\w+):↑nsubj:invest:↓prep:in:↓pobj:(\w+)$/, predicate: 'invested_in', subjectFirst: true },

  // "X led Y's round/funding"
  { signature: /^(\w+):↑nsubj:lead:↓(dobj|obj):(round|funding|investment):↓poss:(\w+)$/, predicate: 'invested_in', subjectFirst: true },

  // "X participated in Y round"
  { signature: /^(\w+):↑nsubj:participate:↓prep:in:↓pobj:(\w+)$/, predicate: 'invested_in', subjectFirst: true },

  // "investment from X went to Y"
  { signature: /^(\w+):↑pobj:from:↑prep:investment:↑nsubj:go:↓prep:to:↓pobj:(\w+)$/, predicate: 'invested_in', subjectFirst: true }, // X invested_in Y

  // "X championed the deal" (for Y) - need context
  { signature: /^(\w+):↑nsubj:champion:↓(dobj|obj):deal$/, predicate: 'invested_in', subjectFirst: true },

  // "funding led by X"
  { signature: /^(funding|round|investment):↓(nsubjpass|dep):lead:↓agent:by:↓pobj:(\w+)$/, predicate: 'invested_in', subjectFirst: false },

  // === ADVISOR / MENTOR ===

  // "X advised/mentored Y"
  { signature: /^(\w+):↑nsubj:(advise|mentor|guide|counsel):↓(dobj|obj):(\w+)$/, predicate: 'advised_by', subjectFirst: false }, // reversed: Y advised_by X

  // "X mentored researchers like Y" (Y is an example)
  { signature: /^(\w+):↑nsubj:(advise|mentor|guide|counsel):↓(dobj|obj):(\w+):↓prep:like:↓pobj:(\w+)$/, predicate: 'advised_by', subjectFirst: false },

  // "X, advisor to Y"
  { signature: /^(\w+):↑appos:(advisor|adviser|mentor|counselor):↓prep:to:↓pobj:(\w+)$/, predicate: 'advised_by', subjectFirst: false },

  // "Y's advisor/mentor"
  { signature: /^(advisor|adviser|mentor):↓poss:(\w+)$/, predicate: 'advised_by', subjectFirst: false },

  // "Y under the supervision of X"
  { signature: /^(\w+):↓prep:under:↓pobj:(supervision|guidance):↓prep:of:↓pobj:(\w+)$/, predicate: 'advised_by', subjectFirst: true }, // Y advised_by X

  // "Y completed PhD under X" (direct)
  { signature: /^(\w+):↑nsubj:(complete|finish):↓prep:under:↓pobj:(\w+)$/, predicate: 'advised_by', subjectFirst: true },

  // "Y completed PhD at X under Z" (nested preps: "at MIT under Foster")
  { signature: /^(\w+):↑nsubj:(complete|finish):↓prep:at:↓pobj:(\w+):↓prep:under:↓pobj:(\w+)$/, predicate: 'advised_by', subjectFirst: true },

  // "X was one of Y's mentors"
  { signature: /^(\w+):↑nsubj:be:↓attr:mentor:↓poss:(\w+)$/, predicate: 'advised_by', subjectFirst: false }, // reversed: Y advised_by X

  // "X serve as advisor" (with prep to)
  { signature: /^(\w+):↑nsubj:serve:↓prep:as:↓pobj:advisor$/, predicate: 'advised_by', subjectFirst: false },

  // === EMPLOYMENT ===

  // "X works/worked at Y"
  { signature: /^(\w+):↑nsubj:(work|join|employ):↓prep:(at|for):↓pobj:(\w+)$/, predicate: 'member_of', subjectFirst: true },

  // "X was hired by Y"
  { signature: /^(\w+):↑nsubjpass:(hire|recruit|employ):↓agent:by:↓pobj:(\w+)$/, predicate: 'member_of', subjectFirst: true },

  // "Y hired X"
  { signature: /^(\w+):↑(dobj|obj):(hire|recruit):↑nsubj:(\w+)$/, predicate: 'member_of', subjectFirst: false },

  // === OWNERSHIP ===

  // "X owns Y"
  { signature: /^(\w+):↑nsubj:(own|control|possess):↓(dobj|obj):(\w+)$/, predicate: 'owns', subjectFirst: true },

  // "Y is owned by X"
  { signature: /^(\w+):↑nsubjpass:(own|control):↓agent:by:↓pobj:(\w+)$/, predicate: 'owns', subjectFirst: false },

  // "Y, owned by X" (relative clause)
  { signature: /^(\w+):↓relcl:(own|control):↓agent:by:↓pobj:(\w+)$/, predicate: 'owns', subjectFirst: false },

  // "X's company/organization Y"
  { signature: /^(\w+):↓poss:(company|organization|firm|business|startup):↑compound:(\w+)$/, predicate: 'owns', subjectFirst: true },

  // === SOCIAL RELATIONSHIPS ===

  // "X became friends with Y"
  { signature: /^(\w+):↑nsubj:become:↓attr:friend:↓prep:with:↓pobj:(\w+)$/, predicate: 'friends_with', subjectFirst: true },

  // "X and Y became friends" (coordination - simplified)
  { signature: /^(\w+):↑conj:(\w+):↑nsubj:become:↓attr:friend$/, predicate: 'friends_with', subjectFirst: true },

  // "X befriended Y"
  { signature: /^(\w+):↑nsubj:befriend:↓(dobj|obj):(\w+)$/, predicate: 'friends_with', subjectFirst: true },

  // "X was friends with Y"
  { signature: /^(\w+):↑nsubj:be:↓attr:friend:↓prep:with:↓pobj:(\w+)$/, predicate: 'friends_with', subjectFirst: true },

  // "X and Y were close friends" (coordination)
  { signature: /^(\w+):↑conj:(\w+):↑nsubj:be:↓attr:friend$/, predicate: 'friends_with', subjectFirst: true },

  // "X rivaled Y" or "X was rival to Y"
  { signature: /^(\w+):↑nsubj:rival:↓(dobj|obj):(\w+)$/, predicate: 'enemy_of', subjectFirst: true },

  // "X became rival to Y"
  { signature: /^(\w+):↑nsubj:become:↓attr:rival:↓prep:to:↓pobj:(\w+)$/, predicate: 'enemy_of', subjectFirst: true },

  // "X, rival of Y"
  { signature: /^(\w+):↑appos:rival:↓prep:(of|to):↓pobj:(\w+)$/, predicate: 'enemy_of', subjectFirst: true },

  // === PROFESSIONAL RELATIONSHIPS ===

  // "X manages Y"
  { signature: /^(\w+):↑nsubj:(manage|oversee|supervise|lead):↓(dobj|obj):(\w+)$/, predicate: 'leads', subjectFirst: true },

  // "Y is managed by X"
  { signature: /^(\w+):↑nsubjpass:(manage|oversee|supervise):↓agent:by:↓pobj:(\w+)$/, predicate: 'leads', subjectFirst: false },

  // "X, manager of Y"
  { signature: /^(\w+):↑appos:(manager|supervisor|director):↓prep:of:↓pobj:(\w+)$/, predicate: 'leads', subjectFirst: true },

  // "Y's manager/supervisor"
  { signature: /^(manager|supervisor|director|boss):↓poss:(\w+)$/, predicate: 'leads', subjectFirst: false }, // reversed: X leads Y

  // "X reports to Y"
  { signature: /^(\w+):↑nsubj:report:↓prep:to:↓pobj:(\w+)$/, predicate: 'member_of', subjectFirst: true }, // Using member_of as approximation

  // "X worked with Y" (colleagues)
  { signature: /^(\w+):↑nsubj:work:↓prep:with:↓pobj:(\w+)$/, predicate: 'ally_of', subjectFirst: true }, // Using ally_of for professional collaboration

  // "X collaborated with Y"
  { signature: /^(\w+):↑nsubj:(collaborate|partner):↓prep:with:↓pobj:(\w+)$/, predicate: 'ally_of', subjectFirst: true },

  // "X and Y collaborated" (coordination)
  { signature: /^(\w+):↑conj:(\w+):↑nsubj:(collaborate|partner|work)$/, predicate: 'ally_of', subjectFirst: true },

  // === ACADEMIC (EXTENDED) ===

  // "X graduated from Y"
  { signature: /^(\w+):↑nsubj:graduate:↓prep:from:↓pobj:(\w+)$/, predicate: 'attended', subjectFirst: true },

  // "X received degree from Y"
  { signature: /^(\w+):↑nsubj:receive:↓(dobj|obj):(degree|diploma|phd|masters|mba):↓prep:from:↓pobj:(\w+)$/, predicate: 'attended', subjectFirst: true },

  // "X researched at Y"
  { signature: /^(\w+):↑nsubj:research:↓prep:at:↓pobj:(\w+)$/, predicate: 'member_of', subjectFirst: true },

  // === GEOGRAPHIC / LOCATION ===

  // "X lives in Y"
  { signature: /^(\w+):↑nsubj:(live|reside):↓prep:in:↓pobj:(\w+)$/, predicate: 'lives_in', subjectFirst: true },

  // "X fought in Y" (battles, wars)
  { signature: /^(\w+):↑nsubj:(fight|fought):↓prep:in:↓pobj:(\w+)$/, predicate: 'fought_in', subjectFirst: true },

  // "X moved to Y"
  { signature: /^(\w+):↑nsubj:(move|relocate|migrate):↓prep:to:↓pobj:(\w+)$/, predicate: 'lives_in', subjectFirst: true },

  // "X was born in Y"
  { signature: /^(\w+):↑nsubjpass:bear:↓prep:in:↓pobj:(\w+)$/, predicate: 'born_in', subjectFirst: true },

  // "X born in Y" (reduced relative clause)
  { signature: /^(\w+):↓relcl:bear:↓prep:in:↓pobj:(\w+)$/, predicate: 'born_in', subjectFirst: true },

  // "X traveled to Y"
  { signature: /^(\w+):↑nsubj:(travel|journey|go):↓prep:to:↓pobj:(\w+)$/, predicate: 'traveled_to', subjectFirst: true },

  // "X visited Y"
  { signature: /^(\w+):↑nsubj:visit:↓(dobj|obj):(\w+)$/, predicate: 'traveled_to', subjectFirst: true },

  // "X based in Y" (org/company location)
  { signature: /^(\w+):↓relcl:base:↓prep:in:↓pobj:(\w+)$/, predicate: 'lives_in', subjectFirst: true }, // Using lives_in for now

  // "X from Y" (origin)
  { signature: /^(\w+):↓prep:from:↓pobj:(\w+)$/, predicate: 'born_in', subjectFirst: true }, // Simple "from" = origin

  // "X at Y" (location/presence)
  { signature: /^(\w+):↓prep:at:↓pobj:(\w+)$/, predicate: 'lives_in', subjectFirst: true }, // Temporary presence

  // "X in Y" (location)
  { signature: /^(\w+):↓prep:in:↓pobj:(\w+)$/, predicate: 'lives_in', subjectFirst: true }, // General location

  // === APPOSITIVE CONSTRUCTIONS ===
  // "X, CEO/founder/director of Y" - appositive phrases indicating leadership

  // "X, CEO of Y"
  { signature: /^(\w+):↓appos:(ceo|cto|cfo|president|director|vp|chairman|chief):↓prep:of:↓pobj:(\w+)$/, predicate: 'leads', subjectFirst: true },

  // "X, founder of Y"
  { signature: /^(\w+):↓appos:(founder|co-founder|cofounder):↓prep:of:↓pobj:(\w+)$/, predicate: 'leads', subjectFirst: true },

  // "X, professor at Y"
  { signature: /^(\w+):↓appos:(professor|lecturer|instructor):↓prep:(at|with):↓pobj:(\w+)$/, predicate: 'teaches_at', subjectFirst: true },

  // "X, employee at/of Y"
  { signature: /^(\w+):↓appos:(employee|engineer|scientist|analyst|developer):↓prep:(at|of|with):↓pobj:(\w+)$/, predicate: 'member_of', subjectFirst: true },

  // "X, researcher at Y"
  { signature: /^(\w+):↓appos:researcher:↓prep:at:↓pobj:(\w+)$/, predicate: 'member_of', subjectFirst: true },

  // "X, student at Y"
  { signature: /^(\w+):↓appos:(student|scholar|fellow):↓prep:at:↓pobj:(\w+)$/, predicate: 'studies_at', subjectFirst: true },

  // "X, graduate of Y"
  { signature: /^(\w+):↓appos:(graduate|alumnus|alumni):↓prep:of:↓pobj:(\w+)$/, predicate: 'attended', subjectFirst: true },

  // "X, partner at Y" (different from "partner of")
  { signature: /^(\w+):↑appos:partner:↓prep:at:↓pobj:(\w+)$/, predicate: 'member_of', subjectFirst: true },

  // === JOB TITLE CONSTRUCTIONS ===
  // "X was a [job title] at Y" - copula + role + location

  // "X was a manager/engineer/etc at Y"
  { signature: /^(\w+):↑nsubj:be:↓attr:(manager|engineer|scientist|analyst|developer|programmer|designer|architect|consultant):↓prep:at:↓pobj:(\w+)$/, predicate: 'member_of', subjectFirst: true },

  // "X was a professor/lecturer at Y"
  { signature: /^(\w+):↑nsubj:be:↓attr:(professor|lecturer|instructor|teacher):↓prep:at:↓pobj:(\w+)$/, predicate: 'teaches_at', subjectFirst: true },

  // "X was a student at Y"
  { signature: /^(\w+):↑nsubj:be:↓attr:student:↓prep:at:↓pobj:(\w+)$/, predicate: 'studies_at', subjectFirst: true },

  // === PAST EMPLOYMENT / EDUCATION ===
  // "X had worked/studied at Y" - past perfect tense

  // "X had worked at Y"
  { signature: /^(\w+):↑nsubj:work:↓prep:at:↓pobj:(\w+)$/, predicate: 'member_of', subjectFirst: true },

  // "X had graduated from Y" - already have "graduated from" but this handles past perfect
  // (same signature as existing pattern)

  // "X left position at Y"
  { signature: /^(\w+):↑nsubj:(leave|quit|resign):↓(dobj|obj):position:↓prep:at:↓pobj:(\w+)$/, predicate: 'member_of', subjectFirst: true },

  // === PARTICIPIAL PHRASES ===
  // "graduates like X", "bringing in graduates like X"

  // "graduates like X" - exemplification pattern for attended
  { signature: /^graduate:↓prep:like:↓pobj:(\w+)$/, predicate: 'attended', subjectFirst: false }, // Need context for university

  // === NOMINAL PHRASES (NO VERB) ===
  // "founder of X", "employee at X", etc - standalone noun phrases

  // "founder of X" (as subject/object)
  { signature: /^(founder|co-founder|cofounder):↓prep:of:↓pobj:(\w+)$/, predicate: 'leads', subjectFirst: false }, // founder leads company

  // "employee/engineer at X"
  { signature: /^(employee|engineer|manager|director|analyst):↓prep:(at|with):↓pobj:(\w+)$/, predicate: 'member_of', subjectFirst: false },

  // "professor/lecturer at X"
  { signature: /^(professor|lecturer|instructor):↓prep:at:↓pobj:(\w+)$/, predicate: 'teaches_at', subjectFirst: false },

  // "student at X"
  { signature: /^student:↓prep:at:↓pobj:(\w+)$/, predicate: 'studies_at', subjectFirst: false },

  // "graduate of X"
  { signature: /^graduate:↓prep:(of|from):↓pobj:(\w+)$/, predicate: 'attended', subjectFirst: false },

  // === EDUCATION - VERB FORMS ===

  // "X graduated from Y"
  { signature: /^(\w+):↑nsubj:graduate:↓prep:(from|of):↓pobj:(\w+)$/, predicate: 'attended', subjectFirst: true },

  // "X, who graduated from Y" (relative clause)
  { signature: /^(\w+):↓relcl:graduate:↓prep:(from|of):↓pobj:(\w+)$/, predicate: 'attended', subjectFirst: true },

  // "X studied at Y"
  { signature: /^(\w+):↑nsubj:study:↓prep:at:↓pobj:(\w+)$/, predicate: 'studies_at', subjectFirst: true },

  // "X studied [object] at Y" - e.g., "studied magic at Hogwarts"
  { signature: /^(\w+):↑nsubj:study:↓(dobj|obj):\w+:↓prep:(at|in):↓pobj:(\w+)$/, predicate: 'studies_at', subjectFirst: true },

  // "X studied there/here" - location pronoun as direct modifier
  { signature: /^(\w+):↑nsubj:study:↓(advmod|npadvmod):(there|here)$/, predicate: 'studies_at', subjectFirst: true },

  // "X studied there/here" - when spaCy incorrectly parses "there" as dobj (handles both "study" and "studied" lemmas)
  { signature: /^(\w+):↑nsubj:(study|studied):↓(dobj|obj):(there|here)$/, predicate: 'studies_at', subjectFirst: true },

  // "X studied [object] there/here" - e.g., "studied magic there"
  { signature: /^(\w+):↑nsubj:study:↓(dobj|obj):\w+:↓(advmod|npadvmod):(there|here)$/, predicate: 'studies_at', subjectFirst: true },

  // "there/here" to study verb (reverse direction)
  { signature: /^(there|here):↑(advmod|npadvmod):study:↑nsubj:(\w+)$/, predicate: 'studies_at', subjectFirst: false },

  // === EMPLOYMENT - PAST TENSE ===

  // "X worked at Y"
  { signature: /^(\w+):↑nsubj:work:↓prep:(at|for):↓pobj:(\w+)$/, predicate: 'member_of', subjectFirst: true },

  // "X, who worked at Y" (relative clause)
  { signature: /^(\w+):↓relcl:work:↓prep:(at|for):↓pobj:(\w+)$/, predicate: 'member_of', subjectFirst: true },

  // "X, a [role] who worked at Y" (appositive + relative clause)
  { signature: /^(\w+):↓appos:\w+:↓relcl:work:↓prep:(at|for):↓pobj:(\w+)$/, predicate: 'member_of', subjectFirst: true },

  // "X left position at Y" - the prep "at" attaches to "left", not "position"
  { signature: /^(\w+):↑nsubj:leave:↓prep:(at|from):↓pobj:(\w+)$/, predicate: 'member_of', subjectFirst: true },

  // "X joined Y" / "X joined Y as [role]"
  { signature: /^(\w+):↑nsubj:join:↓dobj:(\w+)$/, predicate: 'member_of', subjectFirst: true },

  // === BUSINESS OPERATIONS ===

  // "X acquired Y"
  { signature: /^(\w+):↑nsubj:acquire:↓dobj:(\w+)$/, predicate: 'acquired', subjectFirst: true },

  // "X founded Y" / "X started Y" / "X established Y"
  { signature: /^(\w+):↑nsubj:(found|start|establish):↓dobj:(\w+)$/, predicate: 'leads', subjectFirst: true },

  // "X, who founded Y" (relative clause)
  { signature: /^(\w+):↓relcl:(found|start|establish):↓dobj:(\w+)$/, predicate: 'leads', subjectFirst: true },

  // === ACADEMIC / MENTORSHIP ===

  // "X studied under Y"
  { signature: /^(\w+):↑nsubj:study:↓prep:under:↓pobj:(\w+)$/, predicate: 'advised_by', subjectFirst: true },

  // "X, who studied under Y" (relative clause)
  { signature: /^(\w+):↓relcl:study:↓prep:under:↓pobj:(\w+)$/, predicate: 'advised_by', subjectFirst: true },

  // === FANTASY/NARRATIVE PATTERNS ===

  // === FAMILY RELATIONSHIPS ===

  // "X is the parent/mother/father of Y"
  { signature: /^(\w+):↑nsubj:be:↓attr:(parent|mother|father|son|daughter):↓prep:of:↓pobj:(\w+)$/, predicate: 'parent_of', subjectFirst: true },

  // "X, parent of Y" (appositive)
  { signature: /^(\w+):↑appos:(parent|mother|father):↓prep:of:↓pobj:(\w+)$/, predicate: 'parent_of', subjectFirst: true },

  // "X's son/daughter/child"
  { signature: /^(son|daughter|child):↓poss:(\w+)$/, predicate: 'parent_of', subjectFirst: false },

  // "X's mother/father/parent"
  { signature: /^(mother|father|parent):↓poss:(\w+)$/, predicate: 'child_of', subjectFirst: false },

  // "Y, son/daughter of X"
  { signature: /^(\w+):↑appos:(son|daughter|child):↓prep:of:↓pobj:(\w+)$/, predicate: 'child_of', subjectFirst: true },

  // "Y, child of X"
  { signature: /^(\w+):↑appos:child:↓prep:of:↓pobj:(\w+)$/, predicate: 'child_of', subjectFirst: true },

  // "X and Y are siblings"
  { signature: /^(\w+):↑conj:(\w+):↑nsubj:be:↓attr:sibling$/, predicate: 'sibling_of', subjectFirst: true },

  // "X's brother/sister"
  { signature: /^(brother|sister|sibling):↓poss:(\w+)$/, predicate: 'sibling_of', subjectFirst: false },

  // === MENTORSHIP / TRAINING (Narrative) ===

  // "X mentored Y"
  { signature: /^(\w+):↑nsubj:(mentor|train|teach):↓(dobj|obj):(\w+)$/, predicate: 'mentored', subjectFirst: true },

  // "X, who mentored Y"
  { signature: /^(\w+):↓relcl:(mentor|train|teach):↓(dobj|obj):(\w+)$/, predicate: 'mentored', subjectFirst: true },

  // "Y trained under X"
  { signature: /^(\w+):↑nsubj:(train|study):↓prep:under:↓pobj:(\w+)$/, predicate: 'mentored_by', subjectFirst: true },

  // "X had mentored Y" (past perfect)
  { signature: /^(\w+):↑nsubj:mentor:↓(dobj|obj):(\w+)$/, predicate: 'mentored', subjectFirst: true },

  // === GOVERNANCE / LEADERSHIP (Kingdoms, Realms) ===

  // "X ruled/governed Y"
  { signature: /^(\w+):↑nsubj:(rule|govern|reign):↓(dobj|obj):(\w+)$/, predicate: 'rules', subjectFirst: true },

  // "X ruled over Y"
  { signature: /^(\w+):↑nsubj:(rule|reign):↓prep:over:↓pobj:(\w+)$/, predicate: 'rules', subjectFirst: true },

  // "X, ruler of Y"
  { signature: /^(\w+):↑appos:(ruler|king|queen|lord|emperor|monarch):↓prep:of:↓pobj:(\w+)$/, predicate: 'rules', subjectFirst: true },

  // "King/Queen X of Y"
  { signature: /^(king|queen|lord|emperor):↑compound:(\w+):↓prep:of:↓pobj:(\w+)$/, predicate: 'rules', subjectFirst: false },

  // "X guards Y"
  { signature: /^(\w+):↑nsubj:guard:↓(dobj|obj):(\w+)$/, predicate: 'guards', subjectFirst: true },

  // === POSSESSION / SEEKING (Artifacts, Objects) ===

  // "X seeks Y"
  { signature: /^(\w+):↑nsubj:(seek|search|hunt):↓(dobj|obj):(\w+)$/, predicate: 'seeks', subjectFirst: true },

  // "X seeks/searches for Y"
  { signature: /^(\w+):↑nsubj:(seek|search|hunt):↓prep:for:↓pobj:(\w+)$/, predicate: 'seeks', subjectFirst: true },

  // "X possesses/has/holds Y"
  { signature: /^(\w+):↑nsubj:(possess|hold|wield|carry):↓(dobj|obj):(\w+)$/, predicate: 'possesses', subjectFirst: true },

  // "X obtained/acquired Y" (for artifacts)
  { signature: /^(\w+):↑nsubj:(obtain|acquire|take|seize|steal):↓(dobj|obj):(\w+)$/, predicate: 'possesses', subjectFirst: true },

  // === ADVERSARIAL RELATIONSHIPS ===

  // "X fought/battled Y"
  { signature: /^(\w+):↑nsubj:(fight|battle|combat):↓(dobj|obj):(\w+)$/, predicate: 'enemy_of', subjectFirst: true },

  // "X attacked Y"
  { signature: /^(\w+):↑nsubj:(attack|assault|strike):↓(dobj|obj):(\w+)$/, predicate: 'enemy_of', subjectFirst: true },

  // "X defeated/destroyed Y"
  { signature: /^(\w+):↑nsubj:(defeat|destroy|vanquish|conquer):↓(dobj|obj):(\w+)$/, predicate: 'defeated', subjectFirst: true },

  // "Y was defeated by X"
  { signature: /^(\w+):↑nsubjpass:(defeat|destroy|vanquish):↓agent:by:↓pobj:(\w+)$/, predicate: 'defeated', subjectFirst: false },

  // "X killed Y"
  { signature: /^(\w+):↑nsubj:(kill|slay|murder|assassinate):↓(dobj|obj):(\w+)$/, predicate: 'killed', subjectFirst: true },

  // "Y was killed by X"
  { signature: /^(\w+):↑nsubjpass:(kill|slay|murder):↓agent:by:↓pobj:(\w+)$/, predicate: 'killed', subjectFirst: false },

  // "X is the enemy of Y"
  { signature: /^(\w+):↑nsubj:be:↓attr:enemy:↓prep:of:↓pobj:(\w+)$/, predicate: 'enemy_of', subjectFirst: true },

  // "X, enemy of Y"
  { signature: /^(\w+):↑appos:enemy:↓prep:of:↓pobj:(\w+)$/, predicate: 'enemy_of', subjectFirst: true },

  // === ALLIANCE / FRIENDSHIP (Narrative) ===

  // "X allied with Y"
  { signature: /^(\w+):↑nsubj:ally:↓prep:with:↓pobj:(\w+)$/, predicate: 'ally_of', subjectFirst: true },

  // "X is an ally of Y"
  { signature: /^(\w+):↑nsubj:be:↓attr:ally:↓prep:of:↓pobj:(\w+)$/, predicate: 'ally_of', subjectFirst: true },

  // "X accompanied Y"
  { signature: /^(\w+):↑nsubj:(accompany|join|follow):↓(dobj|obj):(\w+)$/, predicate: 'ally_of', subjectFirst: true },

  // === IMPRISONMENT / CONFINEMENT ===

  // "X imprisoned/confined in Y"
  { signature: /^(\w+):↑nsubjpass:(imprison|confine|trap|lock):↓prep:in:↓pobj:(\w+)$/, predicate: 'imprisoned_in', subjectFirst: true },

  // "X broke free from Y"
  { signature: /^(\w+):↑nsubj:break:↓acomp:free:↓prep:from:↓pobj:(\w+)$/, predicate: 'freed_from', subjectFirst: true },

  // "X escaped from Y"
  { signature: /^(\w+):↑nsubj:escape:↓prep:from:↓pobj:(\w+)$/, predicate: 'freed_from', subjectFirst: true },

  // === COUNCIL / GROUP MEMBERSHIP ===

  // "X joined/joined_the Y" (council, group)
  { signature: /^(\w+):↑nsubj:join:↓(dobj|obj):(\w+)$/, predicate: 'member_of', subjectFirst: true },

  // "X, member of Y"
  { signature: /^(\w+):↑appos:member:↓prep:of:↓pobj:(\w+)$/, predicate: 'member_of', subjectFirst: true },

  // "X sent for Y" / "Council sent for Y"
  { signature: /^(\w+):↑nsubj:send:↓prep:for:↓pobj:(\w+)$/, predicate: 'summoned', subjectFirst: true },

  // "X requires Y" / "Council requires Y"
  { signature: /^(\w+):↑nsubj:require:↓(dobj|obj):(\w+)$/, predicate: 'summoned', subjectFirst: true },

  // === LOCATION (Narrative Specific) ===

  // "X located at/in Y"
  { signature: /^(\w+):↓prep:(at|in|on):↓pobj:(\w+)$/, predicate: 'located_at', subjectFirst: true },

  // "X stood on/at Y"
  { signature: /^(\w+):↑nsubj:stand:↓prep:(on|at):↓pobj:(\w+)$/, predicate: 'located_at', subjectFirst: true },

  // "Y beneath/under X" (Sanctuary beneath city)
  { signature: /^(\w+):↓prep:(beneath|under|below):↓pobj:(\w+)$/, predicate: 'located_beneath', subjectFirst: true },

  // "X hidden in Y"
  { signature: /^(\w+):↑nsubjpass:hide:↓prep:in:↓pobj:(\w+)$/, predicate: 'hidden_in', subjectFirst: true },

  // "X gathering in Y" (armies gathering)
  { signature: /^(\w+):↑nsubj:gather:↓prep:in:↓pobj:(\w+)$/, predicate: 'located_at', subjectFirst: true },

  // === LEADERSHIP (Military/Groups) ===

  // "X led Y" (armies, forces)
  { signature: /^(\w+):↑nsubj:lead:↓(dobj|obj):(\w+)$/, predicate: 'leads', subjectFirst: true },

  // "X, leader of Y"
  { signature: /^(\w+):↑appos:leader:↓prep:of:↓pobj:(\w+)$/, predicate: 'leads', subjectFirst: true },

  // "Y's leader/general/commander"
  { signature: /^(leader|general|commander|captain):↓poss:(\w+)$/, predicate: 'leads', subjectFirst: false },

  // "Y led by X"
  { signature: /^(\w+):↑nsubjpass:lead:↓agent:by:↓pobj:(\w+)$/, predicate: 'leads', subjectFirst: false },

  // === CREATION / AUTHORSHIP ===

  // "X painted/wrote/composed/authored Y"
  { signature: /^(\w+):↑nsubj:(paint|write|compose|author|create|invent|design|build|sculpt|craft):↓(dobj|obj):(\w+)$/, predicate: 'created_by', subjectFirst: false },

  // "Y was painted/written by X" (passive)
  { signature: /^(\w+):↑nsubjpass:(paint|write|compose|author|create|invent|design|build|sculpt|craft):↓agent:by:↓pobj:(\w+)$/, predicate: 'created_by', subjectFirst: true },

  // === LOCATION (Enhanced) ===

  // "X is located/situated in Y"
  { signature: /^(\w+):↑nsubjpass:(locate|situate):↓prep:in:↓pobj:(\w+)$/, predicate: 'located_in', subjectFirst: true },

  // "X stands in Y"
  { signature: /^(\w+):↑nsubj:stand:↓prep:in:↓pobj:(\w+)$/, predicate: 'located_in', subjectFirst: true },

  // "X is based in Y"
  { signature: /^(\w+):↑nsubjpass:base:↓prep:in:↓pobj:(\w+)$/, predicate: 'located_in', subjectFirst: true },

  // === COMMUNICATION ===

  // "X wrote/told/spoke to Y"
  { signature: /^(\w+):↑nsubj:(write|tell|speak|say|communicate):↓prep:to:↓pobj:(\w+)$/, predicate: 'wrote_to', subjectFirst: true },

  // "X wrote/told Y" (direct object)
  { signature: /^(\w+):↑nsubj:(tell|inform|notify):↓(dobj|obj):(\w+)$/, predicate: 'wrote_to', subjectFirst: true },

  // "X asked/replied to Y"
  { signature: /^(\w+):↑nsubj:(ask|reply|respond):↓prep:to:↓pobj:(\w+)$/, predicate: 'wrote_to', subjectFirst: true },

  // "X reported Y to Z"
  { signature: /^(\w+):↑nsubj:(report|convey):↓(dobj|obj):(\w+):↓prep:to:↓pobj:(\w+)$/, predicate: 'wrote_to', subjectFirst: true },

  // === EVENT PARTICIPATION ===

  // "X attended/participated in Y"
  { signature: /^(\w+):↑nsubj:(attend|participate):↓prep:in:↓pobj:(\w+)$/, predicate: 'attended', subjectFirst: true },

  // "X attended/performed at Y"
  { signature: /^(\w+):↑nsubj:(attend|perform):↓prep:at:↓pobj:(\w+)$/, predicate: 'attended', subjectFirst: true },

  // "X hosted/organized Y"
  { signature: /^(\w+):↑nsubj:(host|organize|arrange|convene):↓(dobj|obj):(\w+)$/, predicate: 'hosted', subjectFirst: true },

  // "X witnessed Y"
  { signature: /^(\w+):↑nsubj:witness:↓(dobj|obj):(\w+)$/, predicate: 'attended', subjectFirst: true },

  // === POWER / GOVERNANCE ===

  // "X ruled/governed/controlled Y"
  { signature: /^(\w+):↑nsubj:(rule|govern|control|command|dominate|reign):↓(dobj|obj):(\w+)$/, predicate: 'ruled_by', subjectFirst: false },

  // "Y was ruled by X" (passive)
  { signature: /^(\w+):↑nsubjpass:(rule|govern|control|command):↓agent:by:↓pobj:(\w+)$/, predicate: 'ruled_by', subjectFirst: true },

  // === EMOTIONAL / SOCIAL ===

  // "X loved/admired/respected Y"
  { signature: /^(\w+):↑nsubj:(love|admire|respect|fear|hate|envy):↓(dobj|obj):(\w+)$/, predicate: 'loved', subjectFirst: true },

  // === IDENTITY / EQUIVALENCE ===

  // "X is Y" (copula for identity)
  { signature: /^(\w+):↑nsubj:be:↓attr:(\w+)$/, predicate: 'is', subjectFirst: true },

  // "X equals Y"
  { signature: /^(\w+):↑nsubj:equal:↓(dobj|obj):(\w+)$/, predicate: 'is', subjectFirst: true },

  // "X also known as Y"
  { signature: /^(\w+):↑nsubjpass:know:↓prep:as:↓pobj:(\w+)$/, predicate: 'is', subjectFirst: true },

  // "X was formerly Y"
  { signature: /^(\w+):↑nsubj:be:↓advmod:formerly:↓attr:(\w+)$/, predicate: 'is', subjectFirst: true },

  // "X was previously Y"
  { signature: /^(\w+):↑nsubj:be:↓advmod:previously:↓attr:(\w+)$/, predicate: 'is', subjectFirst: true },

  // === COMPARISON ===

  // "X is larger/greater than Y"
  { signature: /^(\w+):↑nsubj:be:↓acomp:(large|great|long|cold|hot|high|big):↓prep:than:↓pobj:(\w+)$/, predicate: 'greater_than', subjectFirst: true },

  // "X has greater population than Y"
  { signature: /^(\w+):↑nsubj:have:↓(dobj|obj):(population|size|area):↓amod:great:↓prep:than:↓pobj:(\w+)$/, predicate: 'greater_than', subjectFirst: true },

  // === TEMPORAL ===

  // "X followed/preceded Y"
  { signature: /^(\w+):↑nsubj:(follow|precede):↓(dobj|obj):(\w+)$/, predicate: 'after', subjectFirst: true },

  // "X began before Y"
  { signature: /^(\w+):↑nsubj:begin:↓prep:before:↓pobj:(\w+)$/, predicate: 'before', subjectFirst: false },

  // "X happened after Y"
  { signature: /^(\w+):↑nsubj:happen:↓prep:after:↓pobj:(\w+)$/, predicate: 'after', subjectFirst: true },

  // "X lived during Y"
  { signature: /^(\w+):↑nsubj:live:↓prep:during:↓pobj:(\w+)$/, predicate: 'during', subjectFirst: true },

  // "X arrived before Y"
  { signature: /^(\w+):↑nsubj:arrive:↓prep:before:↓pobj:(\w+)$/, predicate: 'before', subjectFirst: false },

  // "X existed before Y"
  { signature: /^(\w+):↑nsubj:exist:↓prep:before:↓pobj:(\w+)$/, predicate: 'before', subjectFirst: false },

  // "X ended after Y"
  { signature: /^(\w+):↑nsubj:end:↓prep:after:↓pobj:(\w+)$/, predicate: 'after', subjectFirst: true },

  // === PART-WHOLE ===

  // "X is part of Y"
  { signature: /^(\w+):↑nsubj:be:↓attr:part:↓prep:of:↓pobj:(\w+)$/, predicate: 'part_of', subjectFirst: true },

  // "Y consists of X"
  { signature: /^(\w+):↑nsubj:consist:↓prep:of:↓pobj:(\w+)$/, predicate: 'part_of', subjectFirst: false },

  // "Y includes X"
  { signature: /^(\w+):↑nsubj:include:↓(dobj|obj):(\w+)$/, predicate: 'part_of', subjectFirst: false },

  // === GENERATED PATTERNS ===
  // Auto-generated from scripts/integrate-patterns.ts

  { signature: /^(\w+):↑nsubj:married:↓(?:dobj|obj):(\w+)$/, predicate: 'parent_of', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:wed:↓(?:dobj|obj):(\w+)$/, predicate: 'child_of', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:begat:↓(?:dobj|obj):(\w+)$/, predicate: 'sibling_of', subjectFirst: true },
  { signature: /^(\w+):↑appos:father:↓prep:of:↓pobj:(\w+)$/, predicate: 'married_to', subjectFirst: true },
  { signature: /^(\w+):↑appos:father:↓prep:to:↓pobj:(\w+)$/, predicate: 'cousin_of', subjectFirst: true },
  { signature: /^(\w+):↑appos:mother:↓prep:of:↓pobj:(\w+)$/, predicate: 'ancestor_of', subjectFirst: true },
  { signature: /^(\w+):↑appos:mother:↓prep:to:↓pobj:(\w+)$/, predicate: 'descendant_of', subjectFirst: true },
  { signature: /^(\w+):↑appos:parent:↓prep:of:↓pobj:(\w+)$/, predicate: 'parent_of', subjectFirst: true },
  { signature: /^(\w+):↑appos:parent:↓prep:to:↓pobj:(\w+)$/, predicate: 'child_of', subjectFirst: true },
  { signature: /^(\w+):↑nsubjpass:married:↓agent:by:↓pobj:(\w+)$/, predicate: 'sibling_of', subjectFirst: false },
  { signature: /^father:↓poss:(\w+)$/, predicate: 'cousin_of', subjectFirst: true },
  { signature: /^mother:↓poss:(\w+)$/, predicate: 'ancestor_of', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:father:↓prep:of:↓pobj:(\w+)$/, predicate: 'descendant_of', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:father:↓prep:to:↓pobj:(\w+)$/, predicate: 'parent_of', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:mother:↓prep:of:↓pobj:(\w+)$/, predicate: 'child_of', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:mother:↓prep:to:↓pobj:(\w+)$/, predicate: 'sibling_of', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:owns:↓(?:dobj|obj):(\w+)$/, predicate: 'owns', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:owned:↓(?:dobj|obj):(\w+)$/, predicate: 'owned_by', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:possesses:↓(?:dobj|obj):(\w+)$/, predicate: 'belongs_to', subjectFirst: true },
  { signature: /^(\w+):↑appos:owner:↓prep:of:↓pobj:(\w+)$/, predicate: 'property_of', subjectFirst: true },
  { signature: /^(\w+):↑appos:owner:↓prep:by:↓pobj:(\w+)$/, predicate: 'possessed_by', subjectFirst: true },
  { signature: /^(\w+):↑appos:property:↓prep:of:↓pobj:(\w+)$/, predicate: 'owns', subjectFirst: true },
  { signature: /^(\w+):↑appos:property:↓prep:by:↓pobj:(\w+)$/, predicate: 'owned_by', subjectFirst: true },
  { signature: /^(\w+):↑appos:possession:↓prep:of:↓pobj:(\w+)$/, predicate: 'belongs_to', subjectFirst: true },
  { signature: /^(\w+):↑appos:possession:↓prep:by:↓pobj:(\w+)$/, predicate: 'property_of', subjectFirst: true },
  { signature: /^(\w+):↑nsubjpass:owns:↓agent:by:↓pobj:(\w+)$/, predicate: 'possessed_by', subjectFirst: false },
  { signature: /^(\w+):↑nsubjpass:owned:↓agent:by:↓pobj:(\w+)$/, predicate: 'owns', subjectFirst: false },
  { signature: /^owner:↓poss:(\w+)$/, predicate: 'owned_by', subjectFirst: true },
  { signature: /^property:↓poss:(\w+)$/, predicate: 'belongs_to', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:owner:↓prep:of:↓pobj:(\w+)$/, predicate: 'property_of', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:owner:↓prep:by:↓pobj:(\w+)$/, predicate: 'possessed_by', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:property:↓prep:of:↓pobj:(\w+)$/, predicate: 'owns', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:property:↓prep:by:↓pobj:(\w+)$/, predicate: 'owned_by', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:works:↓(?:dobj|obj):(\w+)$/, predicate: 'works_for', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:employed:↓(?:dobj|obj):(\w+)$/, predicate: 'employed_by', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:serves:↓(?:dobj|obj):(\w+)$/, predicate: 'member_of', subjectFirst: true },
  { signature: /^(\w+):↑appos:employee:↓prep:for:↓pobj:(\w+)$/, predicate: 'affiliated_with', subjectFirst: true },
  { signature: /^(\w+):↑appos:employee:↓prep:by:↓pobj:(\w+)$/, predicate: 'partner_at', subjectFirst: true },
  { signature: /^(\w+):↑appos:employer:↓prep:for:↓pobj:(\w+)$/, predicate: 'serves', subjectFirst: true },
  { signature: /^(\w+):↑appos:employer:↓prep:by:↓pobj:(\w+)$/, predicate: 'works_for', subjectFirst: true },
  { signature: /^(\w+):↑appos:member:↓prep:for:↓pobj:(\w+)$/, predicate: 'employed_by', subjectFirst: true },
  { signature: /^(\w+):↑nsubjpass:works:↓agent:by:↓pobj:(\w+)$/, predicate: 'affiliated_with', subjectFirst: false },
  { signature: /^(\w+):↑nsubjpass:employed:↓agent:by:↓pobj:(\w+)$/, predicate: 'partner_at', subjectFirst: false },
  { signature: /^employee:↓poss:(\w+)$/, predicate: 'serves', subjectFirst: true },
  { signature: /^employer:↓poss:(\w+)$/, predicate: 'works_for', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:employee:↓prep:for:↓pobj:(\w+)$/, predicate: 'employed_by', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:employee:↓prep:by:↓pobj:(\w+)$/, predicate: 'member_of', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:employer:↓prep:for:↓pobj:(\w+)$/, predicate: 'affiliated_with', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:employer:↓prep:by:↓pobj:(\w+)$/, predicate: 'partner_at', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:created:↓(?:dobj|obj):(\w+)$/, predicate: 'created_by', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:authored:↓(?:dobj|obj):(\w+)$/, predicate: 'authored', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:wrote:↓(?:dobj|obj):(\w+)$/, predicate: 'authored', subjectFirst: true },
  { signature: /^(\w+):↑appos:author:↓prep:by:↓pobj:(\w+)$/, predicate: 'invented_by', subjectFirst: true },
  { signature: /^(\w+):↑appos:author:↓prep:of:↓pobj:(\w+)$/, predicate: 'painted_by', subjectFirst: true },
  { signature: /^(\w+):↑appos:creator:↓prep:by:↓pobj:(\w+)$/, predicate: 'built_by', subjectFirst: true },
  { signature: /^(\w+):↑appos:creator:↓prep:of:↓pobj:(\w+)$/, predicate: 'composed_by', subjectFirst: true },
  { signature: /^(\w+):↑appos:inventor:↓prep:by:↓pobj:(\w+)$/, predicate: 'designed_by', subjectFirst: true },
  { signature: /^(\w+):↑appos:inventor:↓prep:of:↓pobj:(\w+)$/, predicate: 'created_by', subjectFirst: true },
  { signature: /^(\w+):↑nsubjpass:created:↓agent:by:↓pobj:(\w+)$/, predicate: 'authored', subjectFirst: false },
  { signature: /^(\w+):↑nsubjpass:authored:↓agent:by:↓pobj:(\w+)$/, predicate: 'written_by', subjectFirst: false },
  { signature: /^author:↓poss:(\w+)$/, predicate: 'invented_by', subjectFirst: true },
  { signature: /^creator:↓poss:(\w+)$/, predicate: 'painted_by', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:author:↓prep:by:↓pobj:(\w+)$/, predicate: 'built_by', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:author:↓prep:of:↓pobj:(\w+)$/, predicate: 'composed_by', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:creator:↓prep:by:↓pobj:(\w+)$/, predicate: 'designed_by', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:creator:↓prep:of:↓pobj:(\w+)$/, predicate: 'created_by', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:located:↓(?:dobj|obj):(\w+)$/, predicate: 'located_in', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:situated:↓(?:dobj|obj):(\w+)$/, predicate: 'located_at', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:positioned:↓(?:dobj|obj):(\w+)$/, predicate: 'near', subjectFirst: true },
  { signature: /^(\w+):↑appos:location:↓prep:in:↓pobj:(\w+)$/, predicate: 'within', subjectFirst: true },
  { signature: /^(\w+):↑appos:location:↓prep:at:↓pobj:(\w+)$/, predicate: 'across_from', subjectFirst: true },
  { signature: /^(\w+):↑appos:place:↓prep:in:↓pobj:(\w+)$/, predicate: 'adjacent_to', subjectFirst: true },
  { signature: /^(\w+):↑appos:place:↓prep:at:↓pobj:(\w+)$/, predicate: 'based_in', subjectFirst: true },
  { signature: /^(\w+):↑appos:position:↓prep:in:↓pobj:(\w+)$/, predicate: 'north_of', subjectFirst: true },
  { signature: /^(\w+):↑appos:position:↓prep:at:↓pobj:(\w+)$/, predicate: 'south_of', subjectFirst: true },
  { signature: /^(\w+):↑nsubjpass:located:↓agent:by:↓pobj:(\w+)$/, predicate: 'located_in', subjectFirst: false },
  { signature: /^(\w+):↑nsubjpass:situated:↓agent:by:↓pobj:(\w+)$/, predicate: 'located_at', subjectFirst: false },
  { signature: /^location:↓poss:(\w+)$/, predicate: 'near', subjectFirst: true },
  { signature: /^place:↓poss:(\w+)$/, predicate: 'within', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:location:↓prep:in:↓pobj:(\w+)$/, predicate: 'across_from', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:location:↓prep:at:↓pobj:(\w+)$/, predicate: 'adjacent_to', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:place:↓prep:in:↓pobj:(\w+)$/, predicate: 'based_in', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:place:↓prep:at:↓pobj:(\w+)$/, predicate: 'north_of', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:preceded:↓(?:dobj|obj):(\w+)$/, predicate: 'before', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:followed:↓(?:dobj|obj):(\w+)$/, predicate: 'after', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:occurred:↓(?:dobj|obj):(\w+)$/, predicate: 'during', subjectFirst: true },
  { signature: /^(\w+):↑appos:time:↓prep:before:↓pobj:(\w+)$/, predicate: 'since', subjectFirst: true },
  { signature: /^(\w+):↑appos:time:↓prep:after:↓pobj:(\w+)$/, predicate: 'until', subjectFirst: true },
  { signature: /^(\w+):↑appos:date:↓prep:before:↓pobj:(\w+)$/, predicate: 'on', subjectFirst: true },
  { signature: /^(\w+):↑appos:date:↓prep:after:↓pobj:(\w+)$/, predicate: 'between', subjectFirst: true },
  { signature: /^(\w+):↑appos:period:↓prep:before:↓pobj:(\w+)$/, predicate: 'before', subjectFirst: true },
  { signature: /^(\w+):↑appos:period:↓prep:after:↓pobj:(\w+)$/, predicate: 'after', subjectFirst: true },
  { signature: /^(\w+):↑nsubjpass:preceded:↓agent:by:↓pobj:(\w+)$/, predicate: 'during', subjectFirst: false },
  { signature: /^(\w+):↑nsubjpass:followed:↓agent:by:↓pobj:(\w+)$/, predicate: 'since', subjectFirst: false },
  { signature: /^time:↓poss:(\w+)$/, predicate: 'until', subjectFirst: true },
  { signature: /^date:↓poss:(\w+)$/, predicate: 'on', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:time:↓prep:before:↓pobj:(\w+)$/, predicate: 'between', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:time:↓prep:after:↓pobj:(\w+)$/, predicate: 'before', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:date:↓prep:before:↓pobj:(\w+)$/, predicate: 'after', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:date:↓prep:after:↓pobj:(\w+)$/, predicate: 'during', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:caused:↓(?:dobj|obj):(\w+)$/, predicate: 'caused_by', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:led:↓(?:dobj|obj):(\w+)$/, predicate: 'led_to', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:influenced:↓(?:dobj|obj):(\w+)$/, predicate: 'influenced_by', subjectFirst: true },
  { signature: /^(\w+):↑appos:cause:↓prep:by:↓pobj:(\w+)$/, predicate: 'resulted_from', subjectFirst: true },
  { signature: /^(\w+):↑appos:cause:↓prep:to:↓pobj:(\w+)$/, predicate: 'due_to', subjectFirst: true },
  { signature: /^(\w+):↑appos:result:↓prep:by:↓pobj:(\w+)$/, predicate: 'triggered_by', subjectFirst: true },
  { signature: /^(\w+):↑appos:result:↓prep:to:↓pobj:(\w+)$/, predicate: 'caused_by', subjectFirst: true },
  { signature: /^(\w+):↑appos:consequence:↓prep:by:↓pobj:(\w+)$/, predicate: 'led_to', subjectFirst: true },
  { signature: /^(\w+):↑appos:consequence:↓prep:to:↓pobj:(\w+)$/, predicate: 'influenced_by', subjectFirst: true },
  { signature: /^(\w+):↑nsubjpass:caused:↓agent:by:↓pobj:(\w+)$/, predicate: 'resulted_from', subjectFirst: false },
  { signature: /^(\w+):↑nsubjpass:led:↓agent:by:↓pobj:(\w+)$/, predicate: 'due_to', subjectFirst: false },
  { signature: /^cause:↓poss:(\w+)$/, predicate: 'triggered_by', subjectFirst: true },
  { signature: /^result:↓poss:(\w+)$/, predicate: 'caused_by', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:cause:↓prep:by:↓pobj:(\w+)$/, predicate: 'led_to', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:cause:↓prep:to:↓pobj:(\w+)$/, predicate: 'influenced_by', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:result:↓prep:by:↓pobj:(\w+)$/, predicate: 'resulted_from', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:result:↓prep:to:↓pobj:(\w+)$/, predicate: 'due_to', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:comprises:↓(?:dobj|obj):(\w+)$/, predicate: 'part_of', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:consists:↓(?:dobj|obj):(\w+)$/, predicate: 'consists_of', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:includes:↓(?:dobj|obj):(\w+)$/, predicate: 'includes', subjectFirst: true },
  { signature: /^(\w+):↑appos:part:↓prep:of:↓pobj:(\w+)$/, predicate: 'contains', subjectFirst: true },
  { signature: /^(\w+):↑appos:part:↓prep:in:↓pobj:(\w+)$/, predicate: 'made_of', subjectFirst: true },
  { signature: /^(\w+):↑appos:component:↓prep:of:↓pobj:(\w+)$/, predicate: 'comprises', subjectFirst: true },
  { signature: /^(\w+):↑appos:component:↓prep:in:↓pobj:(\w+)$/, predicate: 'part_of', subjectFirst: true },
  { signature: /^(\w+):↑appos:piece:↓prep:of:↓pobj:(\w+)$/, predicate: 'consists_of', subjectFirst: true },
  { signature: /^(\w+):↑appos:piece:↓prep:in:↓pobj:(\w+)$/, predicate: 'includes', subjectFirst: true },
  { signature: /^(\w+):↑nsubjpass:comprises:↓agent:by:↓pobj:(\w+)$/, predicate: 'contains', subjectFirst: false },
  { signature: /^(\w+):↑nsubjpass:consists:↓agent:by:↓pobj:(\w+)$/, predicate: 'made_of', subjectFirst: false },
  { signature: /^part:↓poss:(\w+)$/, predicate: 'comprises', subjectFirst: true },
  { signature: /^component:↓poss:(\w+)$/, predicate: 'part_of', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:part:↓prep:of:↓pobj:(\w+)$/, predicate: 'consists_of', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:part:↓prep:in:↓pobj:(\w+)$/, predicate: 'includes', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:component:↓prep:of:↓pobj:(\w+)$/, predicate: 'contains', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:component:↓prep:in:↓pobj:(\w+)$/, predicate: 'made_of', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:is:↓(?:dobj|obj):(\w+)$/, predicate: 'is', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:equals:↓(?:dobj|obj):(\w+)$/, predicate: 'equals', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:represents:↓(?:dobj|obj):(\w+)$/, predicate: 'same_as', subjectFirst: true },
  { signature: /^(\w+):↑appos:alias:↓prep:as:↓pobj:(\w+)$/, predicate: 'alias_of', subjectFirst: true },
  { signature: /^(\w+):↑appos:alias:↓prep:to:↓pobj:(\w+)$/, predicate: 'also_known_as', subjectFirst: true },
  { signature: /^(\w+):↑appos:name:↓prep:as:↓pobj:(\w+)$/, predicate: 'represents', subjectFirst: true },
  { signature: /^(\w+):↑appos:name:↓prep:to:↓pobj:(\w+)$/, predicate: 'is', subjectFirst: true },
  { signature: /^(\w+):↑appos:title:↓prep:as:↓pobj:(\w+)$/, predicate: 'equals', subjectFirst: true },
  { signature: /^(\w+):↑appos:title:↓prep:to:↓pobj:(\w+)$/, predicate: 'same_as', subjectFirst: true },
  { signature: /^(\w+):↑nsubjpass:is:↓agent:by:↓pobj:(\w+)$/, predicate: 'alias_of', subjectFirst: false },
  { signature: /^(\w+):↑nsubjpass:equals:↓agent:by:↓pobj:(\w+)$/, predicate: 'also_known_as', subjectFirst: false },
  { signature: /^alias:↓poss:(\w+)$/, predicate: 'represents', subjectFirst: true },
  { signature: /^name:↓poss:(\w+)$/, predicate: 'is', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:alias:↓prep:as:↓pobj:(\w+)$/, predicate: 'equals', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:alias:↓prep:to:↓pobj:(\w+)$/, predicate: 'same_as', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:name:↓prep:as:↓pobj:(\w+)$/, predicate: 'alias_of', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:name:↓prep:to:↓pobj:(\w+)$/, predicate: 'also_known_as', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:attended:↓(?:dobj|obj):(\w+)$/, predicate: 'attended', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:participated:↓(?:dobj|obj):(\w+)$/, predicate: 'participated_in', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:hosted:↓(?:dobj|obj):(\w+)$/, predicate: 'hosted', subjectFirst: true },
  { signature: /^(\w+):↑appos:participant:↓prep:at:↓pobj:(\w+)$/, predicate: 'performed_at', subjectFirst: true },
  { signature: /^(\w+):↑appos:participant:↓prep:in:↓pobj:(\w+)$/, predicate: 'witnessed', subjectFirst: true },
  { signature: /^(\w+):↑appos:attendee:↓prep:at:↓pobj:(\w+)$/, predicate: 'organized', subjectFirst: true },
  { signature: /^(\w+):↑appos:attendee:↓prep:in:↓pobj:(\w+)$/, predicate: 'attended', subjectFirst: true },
  { signature: /^(\w+):↑appos:host:↓prep:at:↓pobj:(\w+)$/, predicate: 'participated_in', subjectFirst: true },
  { signature: /^(\w+):↑appos:host:↓prep:in:↓pobj:(\w+)$/, predicate: 'hosted', subjectFirst: true },
  { signature: /^(\w+):↑nsubjpass:attended:↓agent:by:↓pobj:(\w+)$/, predicate: 'performed_at', subjectFirst: false },
  { signature: /^(\w+):↑nsubjpass:participated:↓agent:by:↓pobj:(\w+)$/, predicate: 'witnessed', subjectFirst: false },
  { signature: /^participant:↓poss:(\w+)$/, predicate: 'organized', subjectFirst: true },
  { signature: /^attendee:↓poss:(\w+)$/, predicate: 'attended', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:participant:↓prep:at:↓pobj:(\w+)$/, predicate: 'participated_in', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:participant:↓prep:in:↓pobj:(\w+)$/, predicate: 'hosted', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:attendee:↓prep:at:↓pobj:(\w+)$/, predicate: 'performed_at', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:attendee:↓prep:in:↓pobj:(\w+)$/, predicate: 'witnessed', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:told:↓(?:dobj|obj):(\w+)$/, predicate: 'told', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:said:↓(?:dobj|obj):(\w+)$/, predicate: 'said_to', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:wrote:↓(?:dobj|obj):(\w+)$/, predicate: 'wrote_to', subjectFirst: true },
  { signature: /^(\w+):↑appos:message:↓prep:to:↓pobj:(\w+)$/, predicate: 'asked', subjectFirst: true },
  { signature: /^(\w+):↑appos:message:↓prep:with:↓pobj:(\w+)$/, predicate: 'informed', subjectFirst: true },
  { signature: /^(\w+):↑appos:letter:↓prep:to:↓pobj:(\w+)$/, predicate: 'replied', subjectFirst: true },
  { signature: /^(\w+):↑appos:letter:↓prep:with:↓pobj:(\w+)$/, predicate: 'reported', subjectFirst: true },
  { signature: /^(\w+):↑appos:speech:↓prep:to:↓pobj:(\w+)$/, predicate: 'spoke_to', subjectFirst: true },
  { signature: /^(\w+):↑appos:speech:↓prep:with:↓pobj:(\w+)$/, predicate: 'told', subjectFirst: true },
  { signature: /^(\w+):↑nsubjpass:told:↓agent:by:↓pobj:(\w+)$/, predicate: 'said_to', subjectFirst: false },
  { signature: /^(\w+):↑nsubjpass:said:↓agent:by:↓pobj:(\w+)$/, predicate: 'wrote_to', subjectFirst: false },
  { signature: /^message:↓poss:(\w+)$/, predicate: 'asked', subjectFirst: true },
  { signature: /^letter:↓poss:(\w+)$/, predicate: 'informed', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:message:↓prep:to:↓pobj:(\w+)$/, predicate: 'replied', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:message:↓prep:with:↓pobj:(\w+)$/, predicate: 'reported', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:letter:↓prep:to:↓pobj:(\w+)$/, predicate: 'spoke_to', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:letter:↓prep:with:↓pobj:(\w+)$/, predicate: 'told', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:controlled:↓(?:dobj|obj):(\w+)$/, predicate: 'controlled_by', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:ruled:↓(?:dobj|obj):(\w+)$/, predicate: 'ruled_by', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:commanded:↓(?:dobj|obj):(\w+)$/, predicate: 'commanded_by', subjectFirst: true },
  { signature: /^(\w+):↑appos:ruler:↓prep:by:↓pobj:(\w+)$/, predicate: 'managed_by', subjectFirst: true },
  { signature: /^(\w+):↑appos:ruler:↓prep:over:↓pobj:(\w+)$/, predicate: 'governed_by', subjectFirst: true },
  { signature: /^(\w+):↑appos:king:↓prep:by:↓pobj:(\w+)$/, predicate: 'led_by', subjectFirst: true },
  { signature: /^(\w+):↑appos:king:↓prep:over:↓pobj:(\w+)$/, predicate: 'controlled_by', subjectFirst: true },
  { signature: /^(\w+):↑appos:queen:↓prep:by:↓pobj:(\w+)$/, predicate: 'ruled_by', subjectFirst: true },
  { signature: /^(\w+):↑appos:queen:↓prep:over:↓pobj:(\w+)$/, predicate: 'commanded_by', subjectFirst: true },
  { signature: /^(\w+):↑nsubjpass:controlled:↓agent:by:↓pobj:(\w+)$/, predicate: 'managed_by', subjectFirst: false },
  { signature: /^(\w+):↑nsubjpass:ruled:↓agent:by:↓pobj:(\w+)$/, predicate: 'governed_by', subjectFirst: false },
  { signature: /^ruler:↓poss:(\w+)$/, predicate: 'led_by', subjectFirst: true },
  { signature: /^king:↓poss:(\w+)$/, predicate: 'controlled_by', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:ruler:↓prep:by:↓pobj:(\w+)$/, predicate: 'ruled_by', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:ruler:↓prep:over:↓pobj:(\w+)$/, predicate: 'commanded_by', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:king:↓prep:by:↓pobj:(\w+)$/, predicate: 'managed_by', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:king:↓prep:over:↓pobj:(\w+)$/, predicate: 'governed_by', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:exceeds:↓(?:dobj|obj):(\w+)$/, predicate: 'greater_than', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:surpasses:↓(?:dobj|obj):(\w+)$/, predicate: 'less_than', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:equals:↓(?:dobj|obj):(\w+)$/, predicate: 'equal_to', subjectFirst: true },
  { signature: /^(\w+):↑appos:greater:↓prep:than:↓pobj:(\w+)$/, predicate: 'higher_than', subjectFirst: true },
  { signature: /^(\w+):↑appos:greater:↓prep:to:↓pobj:(\w+)$/, predicate: 'similar_to', subjectFirst: true },
  { signature: /^(\w+):↑appos:less:↓prep:than:↓pobj:(\w+)$/, predicate: 'different_from', subjectFirst: true },
  { signature: /^(\w+):↑appos:less:↓prep:to:↓pobj:(\w+)$/, predicate: 'greater_than', subjectFirst: true },
  { signature: /^(\w+):↑appos:equal:↓prep:than:↓pobj:(\w+)$/, predicate: 'less_than', subjectFirst: true },
  { signature: /^(\w+):↑appos:equal:↓prep:to:↓pobj:(\w+)$/, predicate: 'equal_to', subjectFirst: true },
  { signature: /^(\w+):↑nsubjpass:exceeds:↓agent:by:↓pobj:(\w+)$/, predicate: 'higher_than', subjectFirst: false },
  { signature: /^(\w+):↑nsubjpass:surpasses:↓agent:by:↓pobj:(\w+)$/, predicate: 'similar_to', subjectFirst: false },
  { signature: /^greater:↓poss:(\w+)$/, predicate: 'different_from', subjectFirst: true },
  { signature: /^less:↓poss:(\w+)$/, predicate: 'greater_than', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:greater:↓prep:than:↓pobj:(\w+)$/, predicate: 'less_than', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:greater:↓prep:to:↓pobj:(\w+)$/, predicate: 'equal_to', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:less:↓prep:than:↓pobj:(\w+)$/, predicate: 'higher_than', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:less:↓prep:to:↓pobj:(\w+)$/, predicate: 'similar_to', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:loved:↓(?:dobj|obj):(\w+)$/, predicate: 'loved', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:hated:↓(?:dobj|obj):(\w+)$/, predicate: 'hated', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:respected:↓(?:dobj|obj):(\w+)$/, predicate: 'respected', subjectFirst: true },
  { signature: /^(\w+):↑appos:lover:↓prep:by:↓pobj:(\w+)$/, predicate: 'disliked', subjectFirst: true },
  { signature: /^(\w+):↑appos:lover:↓prep:of:↓pobj:(\w+)$/, predicate: 'admired', subjectFirst: true },
  { signature: /^(\w+):↑appos:friend:↓prep:by:↓pobj:(\w+)$/, predicate: 'envied', subjectFirst: true },
  { signature: /^(\w+):↑appos:friend:↓prep:of:↓pobj:(\w+)$/, predicate: 'feared', subjectFirst: true },
  { signature: /^(\w+):↑appos:enemy:↓prep:by:↓pobj:(\w+)$/, predicate: 'loved', subjectFirst: true },
  { signature: /^(\w+):↑appos:enemy:↓prep:of:↓pobj:(\w+)$/, predicate: 'hated', subjectFirst: true },
  { signature: /^(\w+):↑nsubjpass:loved:↓agent:by:↓pobj:(\w+)$/, predicate: 'respected', subjectFirst: false },
  { signature: /^(\w+):↑nsubjpass:hated:↓agent:by:↓pobj:(\w+)$/, predicate: 'disliked', subjectFirst: false },
  { signature: /^lover:↓poss:(\w+)$/, predicate: 'admired', subjectFirst: true },
  { signature: /^friend:↓poss:(\w+)$/, predicate: 'envied', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:lover:↓prep:by:↓pobj:(\w+)$/, predicate: 'feared', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:lover:↓prep:of:↓pobj:(\w+)$/, predicate: 'loved', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:friend:↓prep:by:↓pobj:(\w+)$/, predicate: 'hated', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:friend:↓prep:of:↓pobj:(\w+)$/, predicate: 'respected', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:denied:↓(?:dobj|obj):(\w+)$/, predicate: 'not_related_to', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:disputed:↓(?:dobj|obj):(\w+)$/, predicate: 'alleged', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:alleged:↓(?:dobj|obj):(\w+)$/, predicate: 'rumored', subjectFirst: true },
  { signature: /^(\w+):↑appos:allegation:↓prep:to:↓pobj:(\w+)$/, predicate: 'denied', subjectFirst: true },
  { signature: /^(\w+):↑appos:allegation:↓prep:about:↓pobj:(\w+)$/, predicate: 'disputed', subjectFirst: true },
  { signature: /^(\w+):↑appos:rumor:↓prep:to:↓pobj:(\w+)$/, predicate: 'uncertain_link', subjectFirst: true },
  { signature: /^(\w+):↑appos:rumor:↓prep:about:↓pobj:(\w+)$/, predicate: 'not_related_to', subjectFirst: true },
  { signature: /^(\w+):↑appos:denial:↓prep:to:↓pobj:(\w+)$/, predicate: 'alleged', subjectFirst: true },
  { signature: /^(\w+):↑appos:denial:↓prep:about:↓pobj:(\w+)$/, predicate: 'rumored', subjectFirst: true },
  { signature: /^(\w+):↑nsubjpass:denied:↓agent:by:↓pobj:(\w+)$/, predicate: 'denied', subjectFirst: false },
  { signature: /^(\w+):↑nsubjpass:disputed:↓agent:by:↓pobj:(\w+)$/, predicate: 'disputed', subjectFirst: false },
  { signature: /^allegation:↓poss:(\w+)$/, predicate: 'uncertain_link', subjectFirst: true },
  { signature: /^rumor:↓poss:(\w+)$/, predicate: 'not_related_to', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:allegation:↓prep:to:↓pobj:(\w+)$/, predicate: 'alleged', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:allegation:↓prep:about:↓pobj:(\w+)$/, predicate: 'rumored', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:rumor:↓prep:to:↓pobj:(\w+)$/, predicate: 'denied', subjectFirst: true },
  { signature: /^(\w+):↑nsubj:be:↓attr:rumor:↓prep:about:↓pobj:(\w+)$/, predicate: 'disputed', subjectFirst: true },
  { signature: /^(\\w+):↑nsubj:painted:↓(?:dobj|obj):(\\w+)$/, predicate: 'painted', subjectFirst: true },
  { signature: /^(\\w+):↑nsubj:composed:↓(?:dobj|obj):(\\w+)$/, predicate: 'composed', subjectFirst: true },
  { signature: /^(\\w+):↑nsubj:designed:↓(?:dobj|obj):(\\w+)$/, predicate: 'designed', subjectFirst: true },
  { signature: /^(\\w+):↑nsubj:sculpted:↓(?:dobj|obj):(\\w+)$/, predicate: 'sculpted', subjectFirst: true },

];

/**
 * Check if path has semantic markers for specific relations
 * E.g., "made X a husband" - "husband" indicates marriage even if not in direct path
 */
function hasSemanticMarker(
  path: DependencyPath,
  markers: string[]
): boolean {
  const pathText = path.signature.toLowerCase();
  return markers.some(m => pathText.includes(m));
}

const DEBUG_PATTERNS = process.env.DEBUG_PATTERNS === '1';

/**
 * Match a dependency path against known patterns
 */
export function matchDependencyPath(
  path: DependencyPath
): { predicate: Predicate; confidence: number; subjectFirst: boolean } | null {

  if (DEBUG_PATTERNS) {
    console.log(`[PATTERN-MATCH] Testing path signature: ${path.signature}`);
  }

  for (const pattern of PATH_PATTERNS) {
    let match: RegExpMatchArray | null = null;

    if (typeof pattern.signature === 'string') {
      if (path.signature === pattern.signature) {
        match = [path.signature];
      }
    } else {
      match = path.signature.match(pattern.signature);
    }

    if (match) {
      if (DEBUG_PATTERNS) {
        console.log(`[PATTERN-MATCH] ✓ MATCHED: ${pattern.predicate} (pattern: ${pattern.signature})`);
      }
      return {
        predicate: pattern.predicate,
        confidence: 0.9, // High confidence for pattern match
        subjectFirst: pattern.subjectFirst
      };
    }
  }

  if (DEBUG_PATTERNS) {
    console.log(`[PATTERN-MATCH] ✗ No pattern matched`);
  }

  // Semantic fallbacks: if path structure matches but needs context
  // "X made Y" + semantic marker "husband/wife" nearby → marriage
  if (path.signature.match(/:\bmake\b.*:/) &&
      hasSemanticMarker(path, ['husband', 'wife', 'bride', 'groom'])) {
    return { predicate: 'married_to', confidence: 0.85, subjectFirst: true };
  }

  // "X took Y" + semantic marker "husband/wife/bride" → marriage
  if (path.signature.match(/:\btake\b.*:/) &&
      hasSemanticMarker(path, ['husband', 'wife', 'bride', 'groom'])) {
    return { predicate: 'married_to', confidence: 0.85, subjectFirst: true };
  }

  return null;
}

/**
 * Extract relation between two entity tokens using dependency path
 *
 * Returns:
 * - predicate: the relation type
 * - confidence: how confident we are in this extraction
 * - subjectFirst: true if entity1 is the subject, false if entity2 is the subject
 */
export function extractRelationFromPath(
  entity1Token: Token,
  entity2Token: Token,
  tokens: Token[]
): { predicate: Predicate; subjectFirst: boolean; confidence: number } | null {

  // Find path in both directions
  const path12 = findShortestPath(entity1Token, entity2Token, tokens);
  const path21 = findShortestPath(entity2Token, entity1Token, tokens);

  // Try matching both directions
  if (path12) {
    const match = matchDependencyPath(path12);
    if (match) {
      // Path goes entity1 → entity2
      // If pattern says subjectFirst, then entity1 is subject
      // Otherwise entity2 is subject (passive voice)
      return {
        predicate: match.predicate,
        confidence: match.confidence,
        subjectFirst: match.subjectFirst
      };
    }
  }

  if (path21) {
    const match = matchDependencyPath(path21);
    if (match) {
      // Path goes entity2 → entity1
      // Need to reverse the subjectFirst interpretation
      return {
        predicate: match.predicate,
        confidence: match.confidence,
        subjectFirst: !match.subjectFirst // Reverse because path is reversed
      };
    }
  }

  return null;
}

/**
 * Debug: Get human-readable path description
 */
export function describePath(path: DependencyPath): string {
  const parts: string[] = [];

  for (let i = 0; i < path.steps.length; i++) {
    const step = path.steps[i];
    const arrow = step.direction === 'up' ? ' → ' : ' ← ';
    const label = `[${step.relation}]`;

    if (i === 0) {
      parts.push(step.token.text);
    }
    parts.push(`${arrow}${label}${arrow}${step.token.text}`);
  }

  return parts.join('');
}
