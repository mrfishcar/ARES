/**
 * Exposition Generation - Deterministic Wiki Page Composition
 * Selects and organizes claims into structured wiki pages
 */

import type { Entity, Relation, EntityType, Predicate } from '../engine/schema';
import type { Conflict } from '../engine/conflicts';
import { renderRelation, extractSortableTime } from './templates';
import { pageGenLatencyMs } from '../infra/metrics';
import { buildTimeline, renderBiography, type TimelineEvent } from './timeline';

/**
 * Predicate importance weights for salience ranking
 * Higher = more important for overview and ordering
 * Ordered by priority for overview generation:
 * married_to, parent_of/child_of, rules/leads, fought_in, authored,
 * lives_in (if dated), traveled_to (if dated),
 * friends_with/ally_of/enemy_of,
 * lives_in/traveled_to (undated), mentions
 */
const PREDICATE_WEIGHT: Record<Predicate, number> = {
  married_to: 1.0,
  parent_of: 0.98,
  child_of: 0.98,
  rules: 0.95,
  leads: 0.93,
  fought_in: 0.90,
  authored: 0.85,
  lives_in: 0.75,  // Higher if dated, see scoreClaim
  traveled_to: 0.70,  // Higher if dated, see scoreClaim
  friends_with: 0.65,
  ally_of: 0.63,
  enemy_of: 0.61,
  owns: 0.55,
  uses: 0.55,
  wields: 0.55,
  part_of: 0.5,
  member_of: 0.5,
  born_in: 0.47,
  dies_in: 0.46,
  alias_of: 0.45,
  studies_at: 0.4,
  teaches_at: 0.4,
  sibling_of: 0.38,
  mentions: 0.2,
  attended: 0.4,
  advised_by: 0.42,
  invested_in: 0.5,
  acquired: 0.6,
  spoke_to: 0.3,
  met: 0.25,
  mentored: 0.75,
  mentored_by: 0.75,
  guards: 0.7,
  seeks: 0.8,
  possesses: 0.65,
  defeated: 0.85,
  killed: 0.9,
  imprisoned_in: 0.8,
  freed_from: 0.82,
  summoned: 0.6,
  located_at: 0.5,
  located_beneath: 0.5,
  hidden_in: 0.7,
};

/**
 * Symmetric predicates (A-B means B-A)
 */
export const SYMMETRIC_PREDS = new Set<Predicate>([
  'married_to',
  'friends_with',
  'ally_of',
  'enemy_of',
  'sibling_of',
]);

/**
 * Predicates that should be grouped into lists rather than individual sentences
 */
const GROUP_AS_LIST = new Set<Predicate>([
  'married_to',
  'friends_with',
  'ally_of',
  'enemy_of',
  'parent_of',
  'child_of',
  'sibling_of',
  'owns',
  'uses',
  'part_of',
  'member_of',
]);

/**
 * Infobox structure
 */
export interface Infobox {
  name: string;
  species?: string;
  race?: string;
  titles?: string[];
  roles?: string[];
  occupations?: string[];
  affiliations?: string[];
  residence?: string[];
  relatives?: string[];
  abilities?: string[];
  items?: string[];
  aliases?: string[];
  firstAppearance?: string;
  lastAppearance?: string;
}

/**
 * Wiki page structure
 */
export interface WikiPage {
  infobox: Infobox;
  overview: string;
  biography?: string;  // Timeline-based paragraph
  timeline?: TimelineEvent[];  // For suppression logic
  sections: {
    biography: string[];  // Legacy section (kept for compatibility)
    relationships: string[];
    abilities: string[];
    items: string[];
    affiliations: string[];
    disputed: string[];
  };
}

/**
 * Claim with metadata for ranking
 */
interface RankedClaim {
  relation: Relation;
  subjectEntity: Entity;
  objectEntity: Entity;
  salience: number;
}

/**
 * Join array with commas and "and" before the last item
 */
function joinLast(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * Get entity names for a specific predicate where entityId is the subject
 */
function namesOf(entityId: string, predicate: Predicate, claims: RankedClaim[]): string[] {
  return Array.from(new Set(
    claims
      .filter(c => c.relation.subj === entityId && c.relation.pred === predicate)
      .map(c => c.objectEntity.canonical)
  ));
}

/**
 * Calculate centrality score for an entity (number of relations involving it)
 */
function calculateCentrality(entityId: string, relations: Relation[]): number {
  return relations.filter(r => r.subj === entityId || r.obj === entityId).length;
}

/**
 * Calculate variety bonus (prefer diverse predicates)
 */
function calculateVariety(predicate: string, seenPredicates: Set<string>): number {
  return seenPredicates.has(predicate) ? 0.5 : 1.0;
}

/**
 * Extract year from qualifiers
 */
function extractYear(qualifiers?: { type: string; value: string }[]): number | null {
  if (!qualifiers) return null;
  const timeQual = qualifiers.find(q => q.type === 'time');
  if (!timeQual) return null;
  const match = timeQual.value.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Score a claim for overview generation
 * Returns numeric salience based on:
 * - Base predicate weight
 * - Date bonus (prefer dated over undated)
 * - Date recency (earlier dates preferred for chronological narrative)
 */
export function scoreClaim(claim: RankedClaim): number {
  const pred = claim.relation.pred;
  const baseWeight = PREDICATE_WEIGHT[pred] || 0.5;

  // Date bonus
  const year = extractYear(claim.relation.qualifiers);
  let dateBonus = 1.0;

  if (year !== null) {
    // Has a date: +0.2 bonus
    dateBonus = 1.2;

    // For lives_in and traveled_to, boost dated versions significantly
    if (pred === 'lives_in' || pred === 'traveled_to') {
      dateBonus = 1.5;
    }
  }

  return baseWeight * dateBonus;
}

/**
 * Build overview paragraph from top salient claims
 * Returns 2-3 crisp sentences about the most important facts
 */
export function buildOverview(
  subjectId: string,
  entities: Entity[],
  relations: Relation[],
  limit: number = 3
): string {
  const entity = entities.find(e => e.id === subjectId);
  if (!entity) return '';

  // Get all relations where subject is the main entity
  const subjectRelations = relations.filter(r => r.subj === subjectId);

  if (subjectRelations.length === 0) {
    return `${entity.canonical} is ${entity.type === 'PERSON' ? 'a person' : 'an entity'} in the knowledge graph.`;
  }

  // Build ranked claims
  const claims: RankedClaim[] = [];
  for (const rel of subjectRelations) {
    const objEntity = entities.find(e => e.id === rel.obj);
    if (!objEntity) continue;

    const claim: RankedClaim = {
      relation: rel,
      subjectEntity: entity,
      objectEntity: objEntity,
      salience: 0  // Will be set by scoreClaim
    };

    claim.salience = scoreClaim(claim);
    claims.push(claim);
  }

  // Sort by comprehensive criteria
  claims.sort((a, b) => {
    // (a) Salience DESC
    if (a.salience !== b.salience) return b.salience - a.salience;

    // (b) Has YEAR DESC
    const aYear = extractYear(a.relation.qualifiers);
    const bYear = extractYear(b.relation.qualifiers);
    const aHasYear = aYear !== null ? 1 : 0;
    const bHasYear = bYear !== null ? 1 : 0;
    if (aHasYear !== bHasYear) return bHasYear - aHasYear;

    // (c) Earliest YEAR ASC (if both have years)
    if (aYear !== null && bYear !== null && aYear !== bYear) {
      return aYear - bYear;
    }

    // (d) Object canonical ASC
    const objCompare = a.objectEntity.canonical.localeCompare(b.objectEntity.canonical);
    if (objCompare !== 0) return objCompare;

    // (e) Predicate ASC
    return a.relation.pred.localeCompare(b.relation.pred);
  });

  // Deduplicate by (predicate, object_id, year) key
  const seen = new Set<string>();
  const deduplicated: RankedClaim[] = [];

  for (const claim of claims) {
    const year = extractYear(claim.relation.qualifiers);
    const key = year !== null
      ? `${claim.relation.pred}::${claim.relation.obj}::${year}`
      : `${claim.relation.pred}::${claim.relation.obj}`;

    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(claim);
    }
  }

  // Take top N claims
  const topClaims = deduplicated.slice(0, limit);

  // Generate sentences
  const sentences: string[] = [];
  for (const claim of topClaims) {
    const sentence = renderRelation(
      claim.relation.pred,
      claim.subjectEntity.canonical,
      claim.objectEntity.canonical,
      claim.relation.qualifiers,
      claim.relation.confidence
    );
    sentences.push(sentence);
  }

  return sentences.join(' ');
}

/**
 * Calculate time bonus (prefer recent events or those with dates)
 */
function calculateTimeBonus(relation: Relation): number {
  if (!relation.qualifiers || relation.qualifiers.length === 0) {
    return 1.0;
  }

  const hasTime = relation.qualifiers.some(q => q.type === 'time');
  return hasTime ? 1.2 : 1.0;
}

/**
 * Select top K salient claims for an entity
 * Ranking: salience = centrality × confidence × variety × timeBonus
 */
export function selectClaims(
  entityId: string,
  relations: Relation[],
  entities: Entity[],
  k: number = 50
): RankedClaim[] {
  const claims: RankedClaim[] = [];
  const seenPredicates = new Set<string>();

  // Get all relations involving this entity
  const relevantRelations = relations.filter(r => r.subj === entityId || r.obj === entityId);

  for (const relation of relevantRelations) {
    const subjectEntity = entities.find(e => e.id === relation.subj);
    const objectEntity = entities.find(e => e.id === relation.obj);

    if (!subjectEntity || !objectEntity) continue;

    // Calculate salience components
    const centralityScore = calculateCentrality(entityId, relations) / relations.length;
    const confidenceScore = relation.confidence;
    const varietyScore = calculateVariety(relation.pred, seenPredicates);
    const timeBonus = calculateTimeBonus(relation);
    const predicateWeight = PREDICATE_WEIGHT[relation.pred] || 0.5;

    const salience = predicateWeight * centralityScore * confidenceScore * varietyScore * timeBonus;

    claims.push({
      relation,
      subjectEntity,
      objectEntity,
      salience,
    });

    seenPredicates.add(relation.pred);
  }

  // Sort by salience descending and take top K
  claims.sort((a, b) => b.salience - a.salience);
  return claims.slice(0, k);
}

/**
 * Build enriched infobox from entity and relations with deterministic ordering
 * Field order: Name → Also Known As → Born → Died → Parents → Spouse(s) → Children →
 *              Titles/Rules → Affiliations/Organizations → Residence(s)
 */
function buildInfobox(
  entity: Entity,
  claims: RankedClaim[],
  timeline?: TimelineEvent[]
): Infobox {
  const entityId = entity.id;

  // Helper to deduplicate by object_id and sort alphabetically
  const dedupeAndSort = (predicate: Predicate): string[] => {
    const items = claims
      .filter(c => c.relation.subj === entityId && c.relation.pred === predicate)
      .map(c => ({
        name: c.objectEntity.canonical,
        objectId: c.relation.obj,
        year: extractYear(c.relation.qualifiers)
      }));

    // Dedupe by object_id (keep first occurrence)
    const seen = new Set<string>();
    const deduped = items.filter(item => {
      if (seen.has(item.objectId)) return false;
      seen.add(item.objectId);
      return true;
    });

    // Sort alphabetically, then by earliest year if present
    deduped.sort((a, b) => {
      const nameCompare = a.name.localeCompare(b.name);
      if (nameCompare !== 0) return nameCompare;

      // If same name, sort by year
      if (a.year !== null && b.year !== null) {
        return a.year - b.year;
      }
      return 0;
    });

    return deduped.map(item => item.name);
  };

  // Extract data with deduplication
  const spouses = dedupeAndSort('married_to');
  const parents = dedupeAndSort('child_of');
  const children = dedupeAndSort('parent_of');
  const siblings = dedupeAndSort('sibling_of');
  const affiliations = dedupeAndSort('member_of');
  const residence = dedupeAndSort('lives_in');
  const items = [
    ...dedupeAndSort('wields'),
    ...dedupeAndSort('owns'),
    ...dedupeAndSort('uses'),
  ].sort();  // Sort all items alphabetically

  // Birth/Death info
  const born = claims.find(c => c.relation.subj === entityId && c.relation.pred === 'born_in');
  const died = claims.find(c => c.relation.subj === entityId && c.relation.pred === 'dies_in');

  // Rulership - extract titles and reign info
  const rulings = claims.filter(c => c.relation.subj === entityId && c.relation.pred === 'rules');
  const reignPlaces = dedupeAndSort('rules');
  const titles: string[] = [];
  if (reignPlaces.length > 0) {
    if (reignPlaces.length === 1) {
      titles.push(`King of ${reignPlaces[0]}`);
    } else {
      titles.push(`King of ${joinLast(reignPlaces)}`);
    }
  }

  // Build relatives array in specific order
  const relatives: string[] = [];
  if (parents.length > 0) relatives.push(`**Parents:** ${joinLast(parents)}`);
  if (spouses.length > 0) relatives.push(`**Spouse(s):** ${joinLast(spouses)}`);
  if (children.length > 0) relatives.push(`**Children:** ${joinLast(children)}`);
  if (siblings.length > 0) relatives.push(`**Siblings:** ${joinLast(siblings)}`);

  // Build infobox with deterministic field order
  const infobox: Infobox = {
    name: entity.canonical
  };

  // Also Known As
  if (entity.aliases.length > 0) {
    infobox.aliases = [...entity.aliases].sort();  // Sort alphabetically
  }

  // Born/Died
  if (born) {
    infobox.firstAppearance = born.objectEntity.canonical;
  }
  if (died) {
    infobox.lastAppearance = died.objectEntity.canonical;
  }

  // Family (in specific order)
  if (relatives.length > 0) {
    infobox.relatives = relatives;
  }

  // Titles/Rules
  if (titles.length > 0) {
    infobox.titles = titles;
  }

  // Affiliations/Organizations
  if (affiliations.length > 0) {
    infobox.affiliations = affiliations;
  }

  // Residence(s)
  if (residence.length > 0) {
    infobox.residence = residence;
  }

  // Items (weapons, possessions)
  if (items.length > 0) {
    infobox.items = items;
  }

  // Add occupations if inferred
  if (dedupeAndSort('teaches_at').length > 0) {
    infobox.occupations = ['Teacher'];
  }

  return infobox;
}

/**
 * Generate overview sentence prioritizing rulership, then feats, then relationships
 */
function generateOverview(entity: Entity, claims: RankedClaim[]): string {
  const name = entity.canonical;
  const entityId = entity.id;

  if (claims.length === 0) {
    return `${name} is ${entity.type === 'PERSON' ? 'a person' : 'an entity'} in the knowledge graph.`;
  }

  // Filter for subject-focused claims only
  const subjectClaims = claims.filter(c => c.relation.subj === entityId);

  // Try rulership first
  const rulings = subjectClaims.filter(c => c.relation.pred === 'rules');
  if (rulings.length > 0) {
    const places = Array.from(new Set(rulings.map(c => c.objectEntity.canonical)));
    if (places.length === 1) {
      return `${name} is the king of ${places[0]}.`;
    } else {
      return `${name} is the king of ${joinLast(places)}.`;
    }
  }

  // Then leadership
  const leads = subjectClaims.find(c => c.relation.pred === 'leads');
  if (leads) {
    return `${name} leads ${leads.objectEntity.canonical}.`;
  }

  // Then authorship/creation
  const authored = subjectClaims.find(c => c.relation.pred === 'authored');
  if (authored) {
    return `${name} authored ${authored.objectEntity.canonical}.`;
  }

  // Then battles/conflicts
  const fought = subjectClaims.find(c => c.relation.pred === 'fought_in');
  if (fought) {
    return `${name} fought in ${fought.objectEntity.canonical}.`;
  }

  // Then enemies/rivals
  const enemy = subjectClaims.find(c => c.relation.pred === 'enemy_of');
  if (enemy) {
    return `${name} is known for rivalry with ${enemy.objectEntity.canonical}.`;
  }

  // Then friendships
  const friend = subjectClaims.find(c => c.relation.pred === 'friends_with');
  if (friend) {
    return `${name} is friends with ${friend.objectEntity.canonical}.`;
  }

  // Then marriages
  const spouse = subjectClaims.find(c => c.relation.pred === 'married_to');
  if (spouse) {
    return `${name} is married to ${spouse.objectEntity.canonical}.`;
  }

  // Fallback to highest salience claim
  const topClaim = claims[0];
  return renderRelation(
    topClaim.relation.pred,
    topClaim.subjectEntity.canonical,
    topClaim.objectEntity.canonical,
    topClaim.relation.qualifiers,
    topClaim.relation.confidence
  );
}

/**
 * Group claims by section
 */
function groupClaimsBySections(claims: RankedClaim[]): {
  biography: RankedClaim[];
  relationships: RankedClaim[];
  abilities: RankedClaim[];
  items: RankedClaim[];
  affiliations: RankedClaim[];
} {
  const sections = {
    biography: [] as RankedClaim[],
    relationships: [] as RankedClaim[],
    abilities: [] as RankedClaim[],
    items: [] as RankedClaim[],
    affiliations: [] as RankedClaim[],
  };

  for (const claim of claims) {
    const pred = claim.relation.pred;

    // Biography: travel, birth, death, major events
    if (['traveled_to', 'born_in', 'dies_in', 'fought_in'].includes(pred)) {
      sections.biography.push(claim);
    }

    // Relationships: family and social
    else if (['married_to', 'parent_of', 'child_of', 'sibling_of', 'friends_with', 'ally_of', 'enemy_of'].includes(pred)) {
      sections.relationships.push(claim);
    }

    // Abilities - keep empty for now since we don't have ability predicates
    // Could be populated with special attributes in the future

    // Items
    else if (['wields', 'owns', 'uses'].includes(pred)) {
      sections.items.push(claim);
    }

    // Affiliations
    else if (['member_of', 'lives_in', 'studies_at', 'teaches_at', 'leads', 'rules', 'part_of'].includes(pred)) {
      sections.affiliations.push(claim);
    }

    // Default: add to biography
    else {
      sections.biography.push(claim);
    }
  }

  return sections;
}

/**
 * Filter out inverse relations to avoid redundancy
 * Keep only relations where the main entity is the subject
 */
function filterInverseRelations(claims: RankedClaim[], entityId: string): RankedClaim[] {
  const seen = new Set<string>();
  const filtered: RankedClaim[] = [];

  for (const claim of claims) {
    const rel = claim.relation;
    const isSubject = rel.subj === entityId;

    // Create a canonical key for this relation (sorted entity IDs + predicate family)
    const [id1, id2] = [rel.subj, rel.obj].sort();

    // Group inverse predicates together
    let predicateFamily: string = rel.pred;
    if (rel.pred === 'parent_of' || rel.pred === 'child_of') {
      predicateFamily = 'parent_child';
    } else if (rel.pred === 'married_to' || rel.pred === 'friends_with' ||
               rel.pred === 'sibling_of' || rel.pred === 'ally_of' || rel.pred === 'enemy_of') {
      // Symmetric relations
      predicateFamily = rel.pred;
    }

    const key = `${id1}::${id2}::${predicateFamily}`;

    // If we've seen this relation already, skip it
    if (seen.has(key)) {
      continue;
    }

    // Always prefer relations where the main entity is the subject
    // This makes the narrative focus on the main character
    if (isSubject) {
      filtered.push(claim);
      seen.add(key);
    } else {
      // Check if we might see the inverse later
      // For now, add it, but it will be skipped if the inverse appears
      filtered.push(claim);
      seen.add(key);
    }
  }

  return filtered;
}

/**
 * Render relationship section with grouped bullets
 * Suppress relations already in biography timeline or overview
 */
function renderRelationships(
  claims: RankedClaim[],
  entityId: string,
  timeline?: TimelineEvent[],
  overviewClaims?: RankedClaim[]
): string[] {
  const bullets: string[] = [];

  // Build suppression set from timeline
  const suppressedKeys = new Set<string>();
  if (timeline) {
    for (const event of timeline) {
      // Extract year from event
      const year = event.t !== Infinity ? event.t : undefined;

      // Suppress specific predicate+object combinations
      const key = year !== undefined
        ? `${event.predicate}::${event.objectId}::${year}`
        : `${event.predicate}::${event.objectId}`;
      suppressedKeys.add(key);
    }
  }

  // Also suppress facts from Overview
  if (overviewClaims) {
    for (const claim of overviewClaims) {
      const year = extractYear(claim.relation.qualifiers);
      const key = year !== null
        ? `${claim.relation.pred}::${claim.relation.obj}::${year}`
        : `${claim.relation.pred}::${claim.relation.obj}`;
      suppressedKeys.add(key);
    }
  }

  // Filter claims to avoid duplication
  const filteredClaims = claims.filter(c => {
    if (c.relation.subj !== entityId) return true;

    const year = c.relation.qualifiers?.find(q => q.type === 'time')?.value;
    const yearNum = year ? parseInt(year.match(/(\d+)/)?.[1] || '', 10) : undefined;

    const key = yearNum !== undefined && !isNaN(yearNum)
      ? `${c.relation.pred}::${c.relation.obj}::${yearNum}`
      : `${c.relation.pred}::${c.relation.obj}`;

    return !suppressedKeys.has(key);
  });

  // Group by predicate
  const spouses = Array.from(new Set(
    filteredClaims
      .filter(c => c.relation.subj === entityId && c.relation.pred === 'married_to')
      .map(c => c.objectEntity.canonical)
  ));
  const parents = Array.from(new Set(
    filteredClaims
      .filter(c => c.relation.subj === entityId && c.relation.pred === 'child_of')
      .map(c => c.objectEntity.canonical)
  ));
  const children = Array.from(new Set(
    filteredClaims
      .filter(c => c.relation.subj === entityId && c.relation.pred === 'parent_of')
      .map(c => c.objectEntity.canonical)
  ));
  const siblings = Array.from(new Set(
    filteredClaims
      .filter(c => c.relation.subj === entityId && c.relation.pred === 'sibling_of')
      .map(c => c.objectEntity.canonical)
  ));
  const friends = Array.from(new Set(
    filteredClaims
      .filter(c => c.relation.subj === entityId && c.relation.pred === 'friends_with')
      .map(c => c.objectEntity.canonical)
  ));
  const allies = Array.from(new Set(
    filteredClaims
      .filter(c => c.relation.subj === entityId && c.relation.pred === 'ally_of')
      .map(c => c.objectEntity.canonical)
  ));
  const enemies = Array.from(new Set(
    filteredClaims
      .filter(c => c.relation.subj === entityId && c.relation.pred === 'enemy_of')
      .map(c => c.objectEntity.canonical)
  ));

  if (spouses.length > 0) bullets.push(`**Spouse(s):** ${joinLast(spouses)}`);
  if (parents.length > 0) bullets.push(`**Parents:** ${joinLast(parents)}`);
  if (children.length > 0) bullets.push(`**Children:** ${joinLast(children)}`);
  if (siblings.length > 0) bullets.push(`**Siblings:** ${joinLast(siblings)}`);
  if (friends.length > 0) bullets.push(`**Friends:** ${joinLast(friends)}`);
  if (allies.length > 0) bullets.push(`**Allies:** ${joinLast(allies)}`);
  if (enemies.length > 0) bullets.push(`**Rivals/Enemies:** ${joinLast(enemies)}`);

  return bullets;
}

/**
 * Render affiliations section with grouped lists
 */
function renderAffiliations(claims: RankedClaim[], entityId: string): string[] {
  const bullets: string[] = [];

  // Rulership
  const rulings = claims.filter(c => c.relation.subj === entityId && c.relation.pred === 'rules');
  if (rulings.length > 0) {
    const places = Array.from(new Set(rulings.map(c => c.objectEntity.canonical)));
    bullets.push(`Ruled ${joinLast(places)}.`);
  }

  // Leadership
  const leads = namesOf(entityId, 'leads', claims);
  if (leads.length > 0) {
    bullets.push(`Led ${joinLast(leads)}.`);
  }

  // Memberships
  const orgs = namesOf(entityId, 'member_of', claims);
  if (orgs.length > 0) {
    bullets.push(`Member of ${joinLast(orgs)}.`);
  }

  // Residence
  const residences = namesOf(entityId, 'lives_in', claims);
  if (residences.length > 0) {
    bullets.push(`Lived in ${joinLast(residences)}.`);
  }

  // Education/Work
  const schools = namesOf(entityId, 'studies_at', claims);
  if (schools.length > 0) {
    bullets.push(`Studied at ${joinLast(schools)}.`);
  }

  const teaches = namesOf(entityId, 'teaches_at', claims);
  if (teaches.length > 0) {
    bullets.push(`Taught at ${joinLast(teaches)}.`);
  }

  return bullets;
}

/**
 * Render claims as sentences (for biography, items, etc.)
 */
function renderClaims(claims: RankedClaim[], entityId: string, sortByTime: boolean = false): string[] {
  // Filter out inverse relations first
  let claimsToRender = filterInverseRelations(claims, entityId);

  if (sortByTime) {
    // Sort chronologically for timeline
    claimsToRender.sort((a, b) => {
      const timeA = extractSortableTime(a.relation.qualifiers);
      const timeB = extractSortableTime(b.relation.qualifiers);
      return timeA - timeB;
    });
  }

  return claimsToRender.map(claim => {
    const rel = claim.relation;
    return renderRelation(
      rel.pred,
      claim.subjectEntity.canonical,
      claim.objectEntity.canonical,
      rel.qualifiers,
      rel.confidence
    );
  });
}

/**
 * Compose wiki page for an entity
 */
export function compose(
  entityId: string,
  entities: Entity[],
  relations: Relation[],
  conflicts: Conflict[]
): WikiPage {
  const end = pageGenLatencyMs.startTimer();
  try {
    const entity = entities.find(e => e.id === entityId);

    if (!entity) {
      throw new Error(`Entity ${entityId} not found`);
    }

    // Select salient claims
    const claims = selectClaims(entityId, relations, entities, 50);

    // Build timeline for biography
    const timeline = buildTimeline(entityId, entities, relations);
    const biography = renderBiography(timeline);

    // Build infobox (pass timeline for suppression awareness)
    const infobox = buildInfobox(entity, claims, timeline);

    // Generate new salience-ranked overview (2-3 sentences)
    const overview = buildOverview(entityId, entities, relations, 3);

    // Extract the claims used in overview for suppression
    const overviewRelations = relations.filter(r => r.subj === entityId);
    const overviewClaims: RankedClaim[] = [];
    for (const rel of overviewRelations.slice(0, 3)) {  // Top 3 used in overview
      const objEntity = entities.find(e => e.id === rel.obj);
      if (objEntity) {
        overviewClaims.push({
          relation: rel,
          subjectEntity: entity,
          objectEntity: objEntity,
          salience: scoreClaim({
            relation: rel,
            subjectEntity: entity,
            objectEntity: objEntity,
            salience: 0
          })
        });
      }
    }

    // Group claims by section
    const grouped = groupClaimsBySections(claims);

    // Render sections with specialized renderers
    const sections = {
      biography: renderClaims(grouped.biography, entityId, true), // Legacy timeline sorted
      relationships: renderRelationships(claims, entityId, timeline, overviewClaims), // Suppress timeline + overview
      abilities: renderClaims(grouped.abilities, entityId, false),
      items: renderClaims(grouped.items, entityId, false),
      affiliations: renderAffiliations(claims, entityId), // Grouped bullets
      disputed: [] as string[],
    };

    // Add disputed claims from conflicts
    for (const conflict of conflicts) {
      // Check if any relations in the conflict involve this entity
      const involvesEntity = conflict.relations.some(
        r => r.subj === entity.id || r.obj === entity.id
      );

      if (involvesEntity) {
        sections.disputed.push(conflict.description);
      }
    }

    return {
      infobox,
      overview,
      biography,
      timeline,
      sections,
    };
  } finally {
    end();
  }
}
