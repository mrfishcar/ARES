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

/**
 * Match a dependency path against known patterns
 */
export function matchDependencyPath(
  path: DependencyPath
): { predicate: Predicate; confidence: number; subjectFirst: boolean } | null {

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
      return {
        predicate: pattern.predicate,
        confidence: 0.9, // High confidence for pattern match
        subjectFirst: pattern.subjectFirst
      };
    }
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
