/**
 * Relation Extraction - Phase 2
 *
 * Strategy:
 * 1. Dependency-based patterns (primary)
 * 2. Regex fallback patterns (secondary)
 * 3. Span-to-entity binding (using Phase 1 character offsets)
 * 4. Type guards to prevent nonsense relations
 * 5. Automatic inverse generation (parent_of ↔ child_of)
 * 6. Evidence attachment (provenance)
 */

import { v4 as uuid } from "uuid";
import * as fs from "fs";
import type { Entity, Relation, Predicate, Qualifier, EntityType } from "../schema";
import { INVERSE, passesGuard } from "../schema";
import { parseWithService, normalizeName as normalizeEntityName } from "./entities";
import type { Token, ParsedSentence } from "./parse-types";
import { findShortestPath, matchDependencyPath, extractRelationFromPath } from "./relations/dependency-paths";
import { detectClauses } from "./clause-detector";
import { detectVoice } from "./voice-detector";

type Span = { entity_id: string; start: number; end: number };
const TRACE_REL = process.env.L3_REL_TRACE === "1";
const COORD_TRACE = process.env.L3_COORD_DEBUG === "1";
const L3_DEBUG = process.env.L3_DEBUG === "1";
function traceRelation(stage: "candidate" | "final", rel: {
  pred: Predicate;
  subj: Entity | null;
  obj: Entity | null;
  subjSpan: [number, number];
  objSpan: [number, number];
  source: "DEP" | "REGEX";
  snippet: string;
}) {
  if (!TRACE_REL) return;
  try {
    fs.appendFileSync(
      "tmp/relation-trace.log",
      JSON.stringify({
        stage,
        pred: rel.pred,
        subj: rel.subj ? { id: rel.subj.id, type: rel.subj.type, canonical: rel.subj.canonical } : null,
        obj: rel.obj ? { id: rel.obj.id, type: rel.obj.type, canonical: rel.obj.canonical } : null,
        subjSpan: rel.subjSpan,
        objSpan: rel.objSpan,
        source: rel.source,
        snippet: rel.snippet
      }) + "\n",
      "utf-8"
    );
  } catch {
    // ignore logging failures
  }
}

function normalizeAliasSurface(s: string): string {
  if (!s) return s;
  let x = s.trim();
  // Only remove common articles/determiners, not all leading words
  x = x.replace(/^(the|a|an)\s+/i, "");
  x = x.replace(/'s$/i, "");
  x = x.replace(/\bHouse$/i, "").trim();
  x = x.replace(/\s+/g, " ").trim();
  return x;
}

const DESCRIPTOR_KEYWORDS = new Set([
  "family",
  "quest",
  "trio",
  "three friends",
  "friends",
  "group",
  "team",
  "crew",
  "clan",
  "journey",
  "mission",
  "adventure",
  "voyage",
  "travel",
  "couple",
  "children",
  "child"
]);

function isDescriptorEntity(entity?: Entity | null): boolean {
  if (!entity) return false;
  const canonical = entity.canonical.toLowerCase();
  for (const keyword of DESCRIPTOR_KEYWORDS) {
    if (canonical.includes(keyword)) {
      return true;
    }
  }
  return false;
}

function cleanRelationSurface(surface: string): string {
  if (!surface) return surface;
  let cleaned = surface.trim();
  cleaned = cleaned.replace(/\s+/g, " ");
  if (cleaned.includes(",")) {
    cleaned = cleaned.split(",")[0];
  }
  cleaned = cleaned.replace(/^[^A-Za-z0-9]+/, "").replace(/[^A-Za-z0-9]+$/, "");
  cleaned = cleaned.replace(/^(of|in|at|against|to|from|with|by|for|where|when|which|who)\s+/i, "");
  return normalizeAliasSurface(cleaned);
}

function sameNorm(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return normalizeAliasSurface(a).toLowerCase() === normalizeAliasSurface(b).toLowerCase();
}

function pickBestEntityId(
  surface: string,
  candidateIds: string[],
  entities: Entity[]
): string | null {
  if (!candidateIds?.length) return null;

  const normSurface = normalizeAliasSurface(surface);
  const lowerSurface = normSurface.toLowerCase();

  const seen = new Set<string>();
  const candidates = candidateIds
    .map(id => entities.find(e => e.id === id))
    .filter((e): e is Entity => {
      if (!e) return false;
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });

  if (!candidates.length) return null;

  const exact: Entity[] = [];
  const fuzzy: Entity[] = [];
  for (const entity of candidates) {
    const canonicalNorm = normalizeAliasSurface(entity.canonical);
    const canonicalLower = canonicalNorm.toLowerCase();
    const aliasMatch = (entity.aliases || []).some(alias => sameNorm(alias, normSurface));
    const canonicalExact = sameNorm(entity.canonical, normSurface);

    if (canonicalExact || aliasMatch) {
      exact.push(entity);
      continue;
    }

    if (
      lowerSurface &&
      (canonicalLower.includes(lowerSurface) || lowerSurface.includes(canonicalLower))
    ) {
      fuzzy.push(entity);
      continue;
    }
  }

  const pool = exact.length ? exact : (fuzzy.length ? fuzzy : candidates);

  const scoreEntity = (entity: Entity) => {
    const canonicalNorm = normalizeAliasSurface(entity.canonical);
    const canonicalLower = canonicalNorm.toLowerCase();
    const aliasExact = (entity.aliases || []).some(alias => sameNorm(alias, normSurface));
    const canonicalExact = sameNorm(entity.canonical, normSurface);

    let rank = 4;
    if (canonicalExact) {
      rank = 0;
    } else if (aliasExact) {
      rank = 1;
    } else if (canonicalLower === lowerSurface) {
      rank = 2;
    } else if (
      lowerSurface &&
      (canonicalLower.includes(lowerSurface) || lowerSurface.includes(canonicalLower))
    ) {
      rank = 3;
    }

    const aliasCount = entity.aliases?.length ?? 0;
    return { rank, length: canonicalNorm.length, aliasCount };
  };

  const scored = pool.map(entity => ({ entity, priority: scoreEntity(entity) }));
  scored.sort((a, b) => {
    if (a.priority.rank !== b.priority.rank) {
      return a.priority.rank - b.priority.rank;
    }
    if (a.priority.length !== b.priority.length) {
      return a.priority.length - b.priority.length;
    }
    if (a.priority.aliasCount !== b.priority.aliasCount) {
      return b.priority.aliasCount - a.priority.aliasCount;
    }
    return a.entity.canonical.localeCompare(b.entity.canonical);
  });

  return scored[0]?.entity.id ?? null;
}

function getEntityCandidatesByOffset(spans: Span[], start: number, end: number): string[] {
  if (!spans.length) return [];
  const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
    aStart < bEnd && bStart < aEnd;

  const set = new Set<string>();
  for (const span of spans) {
    if (overlaps(span.start, span.end, start, end)) {
      set.add(span.entity_id);
    }
  }
  return Array.from(set);
}

type EntityRef = { entity: Entity; span: Span | null };

function parseList(raw: string): string[] {
  if (!raw) return [];

  const normalized = raw
    .replace(/\u2013|\u2014/g, "-")
    .replace(/[;•]/g, ",")
    .replace(/\band\b/gi, ",")
    .replace(/\s+/g, " ")
    .trim();

  const items = normalized
    .split(",")
    .map(part => part
      .replace(/^[\s:–—-]+/, "")
      .replace(/[\s:–—-]+$/, "")
      .replace(/[.\u2013\u2014-]+$/g, "")
      .trim()
    )
    .filter(Boolean);

  return items;
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function selectEntitySpan(
  entityId: string,
  spans: Span[],
  preferRange?: { start: number; end: number }
): Span | null {
  const entitySpans = spans.filter(sp => sp.entity_id === entityId);
  if (!entitySpans.length) return null;
  if (!preferRange) return entitySpans[0];

  const overlapping = entitySpans.find(sp =>
    rangesOverlap(sp.start, sp.end, preferRange.start, preferRange.end)
  );
  if (overlapping) return overlapping;

  const targetCenter = (preferRange.start + preferRange.end) / 2;
  return entitySpans
    .slice()
    .sort((a, b) => {
      const distA = Math.abs(((a.start + a.end) / 2) - targetCenter);
      const distB = Math.abs(((b.start + b.end) / 2) - targetCenter);
      return distA - distB;
    })[0];
}

function mapSurfaceToEntity(
  surface: string,
  entities: Entity[],
  spans: Span[],
  preferRange?: { start: number; end: number }
): EntityRef | null {
  const normSurface = normalizeAliasSurface(surface);
  if (!normSurface) return null;

  const candidateSet = new Set<string>();

  if (preferRange) {
    for (const id of getEntityCandidatesByOffset(spans, preferRange.start, preferRange.end)) {
      candidateSet.add(id);
    }
  }

  const normLower = normSurface.toLowerCase();

  for (const entity of entities) {
    const canonicalNorm = normalizeAliasSurface(entity.canonical);
    const canonicalLower = canonicalNorm.toLowerCase();

    if (
      canonicalLower === normLower ||
      canonicalLower.includes(normLower) ||
      normLower.includes(canonicalLower) ||
      sameNorm(entity.canonical, surface)
    ) {
      candidateSet.add(entity.id);
      continue;
    }

    for (const alias of entity.aliases ?? []) {
      const aliasNorm = normalizeAliasSurface(alias);
      const aliasLower = aliasNorm.toLowerCase();
      if (
        aliasLower === normLower ||
        aliasLower.includes(normLower) ||
        normLower.includes(aliasLower) ||
        sameNorm(alias, surface)
      ) {
        candidateSet.add(entity.id);
        break;
      }
    }
  }

  const candidateIds = Array.from(candidateSet);
  if (!candidateIds.length) return null;

  const bestId =
    pickBestEntityId(surface, candidateIds, entities) ??
    (candidateIds.length === 1 ? candidateIds[0] : null);

  if (!bestId) return null;

  const entity = entities.find(e => e.id === bestId);
  if (!entity) return null;

  const span = selectEntitySpan(entity.id, spans, preferRange);
  return { entity, span: span ?? null };
}

/**
 * Choose semantic head for "X the Y" constructions
 * If head is NOUN/ADJ/PROPN with a proper noun child, prefer the proper noun
 * Note: spaCy sometimes mis-tags proper nouns (e.g., "Gandalf" as DET)
 */
function chooseSemanticHead(tok: Token, tokens: Token[]): Token {
  // Look for capitalized children with relevant dependencies
  const properNounChild = tokens.find(t =>
    t.head === tok.i &&
    ['nmod', 'compound', 'appos', 'flat', 'amod'].includes(t.dep) &&
    (t.pos === 'PROPN' || /^[A-Z]/.test(t.text)) // PROPN or capitalized
  );

  if (properNounChild) return properNounChild;
  return tok;
}

function resolveAppositiveSubject(tok: Token, tokens: Token[]): Token {
  let current = tok;
  let guard = 0;

  while (guard++ < 4) {
    const parent = tokens.find(t => t.i === current.head);
    if (!parent || parent.i === current.i) break;

    // If the subject token itself is an appositive, climb to its head (e.g., "Arathorn" appos of "Aragorn")
    if (current.dep === 'appos' && isNameToken(parent)) {
      current = parent;
      continue;
    }

    // Handle "X, son of Y" where the parser may return the inner pobj (Y) instead of the appositive head (X/son)
    if (current.dep === 'pobj' && parent.dep === 'prep') {
      const grand = tokens.find(t => t.i === parent.head);
      if (grand && grand.dep === 'appos') {
        if (isNameToken(grand)) {
          current = grand;
          continue;
        }

        // spaCy sometimes makes the appositive head a common noun ("son") and the
        // actual name the head of that appositive. Walk one level higher to the
        // proper-noun head so subjects like "Aragorn, son of Arathorn" resolve to
        // Aragorn instead of Arathorn.
        const greatGrand = tokens.find(t => t.i === grand.head);
        if (greatGrand && isNameToken(greatGrand)) {
          current = greatGrand;
          continue;
        }
      }
    }

    break;
  }

  return current;
}

/**
 * Expand token to full NP span including all modifiers
 * Handles cases like "Gandalf the Grey", "Professor McGonagall", "Minas Tirith"
 */
function expandNP(tok: Token, tokens: Token[]): { start: number; end: number } {
  const include = new Set(['compound', 'appos', 'flat', 'det', 'amod', 'nmod', 'nummod']);
  const stack = [tok];
  const members: Token[] = [tok];
  const seen = new Set([tok.i]);

  while (stack.length) {
    const t = stack.pop()!;

    // Check children
    for (const c of tokens.filter(x => x.head === t.i)) {
      if (!seen.has(c.i) && include.has(c.dep)) {
        seen.add(c.i);
        members.push(c);
        stack.push(c);
      }
    }

    // Check head
    if (t.head !== t.i) {
      const h = tokens.find(x => x.i === t.head);
      if (h && !seen.has(h.i) && include.has(t.dep)) {
        seen.add(h.i);
        members.push(h);
        stack.push(h);
      }
    }
  }

  const start = Math.min(...members.map(m => m.start));
  const end = Math.max(...members.map(m => m.end));
  return { start, end };
}

function trimAppositiveSpan(base: Token, span: { start: number; end: number }, tokens: Token[]) {
  const apposChildren = tokens.filter(t => t.head === base.i && t.dep === 'appos');
  if (!apposChildren.length) return span;

  // When a subject has an appositive ("Aragorn, son of Arathorn"), prefer the head token span
  // to avoid stretching confidence windows across the appositive phrase.
  return { start: base.start, end: base.end };
}

function collectConjTokens(base: Token, tokens: Token[]): Token[] {
  const result: Token[] = [];
  const queue: Token[] = [base];
  const seen = new Set<number>();

  while (queue.length) {
    const current = queue.pop()!;
    if (seen.has(current.i)) continue;
    seen.add(current.i);
    result.push(current);

    for (const child of tokens) {
      if (child.head === current.i && child.dep === 'conj') {
        queue.push(child);
      }
    }
  }

  return result.sort((a, b) => a.start - b.start);
}

function findPrepObject(root: Token, tokens: Token[], preps: string[]): Token | undefined {
  const queue: Token[] = [root];
  const seen = new Set<number>();

  while (queue.length) {
    const current = queue.shift()!;
    if (seen.has(current.i)) continue;
    seen.add(current.i);

    for (const child of tokens) {
      if (child.head !== current.i) continue;
      if (child.dep === 'prep' && preps.includes(child.text.toLowerCase())) {
        const pobj = tokens.find(t => t.dep === 'pobj' && t.head === child.i);
        if (pobj) {
          return pobj;
        }
      }

      // Traverse through compounds/appositives to find nested prepositions
      if (['prep', 'pobj', 'dobj', 'obl', 'appos'].includes(child.dep) || child.pos === 'NOUN') {
        queue.push(child);
      }
    }
  }

  return undefined;
}

function buildOrgSpan(token: Token, tokens: Token[]): { start: number; end: number } {
  const compounds = tokens
    .filter(t => t.head === token.i && t.dep === 'compound')
    .sort((a, b) => a.start - b.start);

  if (compounds.length) {
    const first = compounds[0];
    const last = compounds[compounds.length - 1];
    return { start: first.start, end: last.end };
  }

  return expandNP(token, tokens);
}

function resolveSubjectToken(verb: Token, tokens: Token[]): Token | undefined {
  const direct = tokens.find(t => t.dep === 'nsubj' && t.head === verb.i);
  if (direct) {
    // If the subject has an appositive child (e.g., "son" with an appositive name),
    // keep the parent head as the subject rather than the appositive child to avoid
    // drifting to the descriptive noun instead of the actual entity anchor.
    const chosen = chooseSemanticHead(direct, tokens);
    const semanticHead = chosen.dep === 'appos' && chosen.head === direct.i ? direct : chosen;
    const semantic = resolveAppositiveSubject(semanticHead, tokens);
    const siblings = tokens
      .filter(t => t.head === verb.i && isNameToken(t))
      .sort((a, b) => a.start - b.start);

    if (siblings.length) {
      const first = siblings[0];
      if (first.start < semantic.start) {
        return first;
      }
    }

    return semantic;
}

  const siblings = tokens
    .filter(t => t.head === verb.i && isNameToken(t))
    .sort((a, b) => a.start - b.start);

  if (siblings.length) {
    return siblings[0];
  }
  return undefined;
}

function isNameToken(tok: Token): boolean {
  return tok.pos === 'PROPN' || /^[A-Z]/.test(tok.text);
}

/**
 * Find entity ID by character offset (overlap-based matching)
 * Prefers spans that start closest to the query start position
 */
/**
 * Compute confidence score for a relation (Phase 3)
 * Formula: base × type_guard_bonus × distance_penalty
 */
function computeConfidence(
  subjTok: Token,
  objTok: Token,
  extractor: 'DEP' | 'REGEX',
  passedTypeGuard: boolean
): number {
  // Base confidence
  // Slightly higher base for REGEX to account for filtering at 0.70 threshold
  const base = extractor === 'DEP' ? 0.9 : 0.71;

  // Type guard bonus
  const typeBonus = passedTypeGuard ? 1.05 : 1.0;

  // Distance penalty (exponential decay - gentler for Phase 3)
  const charDist = Math.abs(objTok.start - subjTok.start);
  const distPenalty = Math.exp(-charDist / 150);

  return Math.min(1.0, base * typeBonus * distPenalty);
}

/**
 * Extract qualifiers (time/place) from char-window around trigger (Phase 3 - Fixed)
 * Uses character offsets instead of token indices for better coverage
 */
function extractQualifiers(
  tokens: Token[],
  triggerIdx: number,
  entities: Entity[],
  spans: Span[],
  text: string
): Qualifier[] {
  const qualifiers: Qualifier[] = [];

  // Get trigger token char positions
  const triggerTok = tokens[triggerIdx];
  if (!triggerTok) return qualifiers;

  // Char-window: ±80 chars around trigger
  const winStart = Math.max(0, triggerTok.start - 80);
  const winEnd = Math.min(text.length, triggerTok.end + 80);

  // Scan all entities for those in window
  for (const entity of entities) {
    if (entity.type !== 'DATE' && entity.type !== 'PLACE') continue;

    // Find entity span that overlaps with window
    const entitySpan = spans.find(s =>
      s.entity_id === entity.id &&
      s.start < winEnd &&
      s.end > winStart
    );

    if (!entitySpan) continue;

    // Add qualifier based on type
    if (entity.type === 'DATE') {
      qualifiers.push({
        type: 'time',
        value: entity.canonical,
        entity_id: entity.id,
        span: [entitySpan.start, entitySpan.end]
      });
    } else if (entity.type === 'PLACE') {
      // Only add PLACE if it's not too close to trigger (likely the object)
      const distFromTrigger = Math.abs(entitySpan.start - triggerTok.start);
      if (distFromTrigger > 15) {
        qualifiers.push({
          type: 'place',
          value: entity.canonical,
          entity_id: entity.id,
          span: [entitySpan.start, entitySpan.end]
        });
      }
    }
  }

  return qualifiers;
}

/**
 * Bind text spans to entities and create relation (Phase 3 enhanced)
 */
function tryCreateRelation(
  text: string,
  entities: Entity[],
  spans: Span[],
  pred: Predicate,
  subjStart: number,
  subjEnd: number,
  objStart: number,
  objEnd: number,
  source: 'DEP' | 'REGEX',
  tokens?: Token[],
  triggerIdx?: number
): Relation[] {
  const subjSurface = text.slice(subjStart, subjEnd);
  const objSurface = text.slice(objStart, objEnd);
  const subjSurfaceRaw = (subjSurface || '').trim();
  const objSurfaceRaw = (objSurface || '').trim();
  const originalSubjRange = { start: subjStart, end: subjEnd };
  const originalObjRange = { start: objStart, end: objEnd };

  let subjRef = mapSurfaceToEntity(subjSurface, entities, spans, { start: subjStart, end: subjEnd });
  let objRef = mapSurfaceToEntity(objSurface, entities, spans, { start: objStart, end: objEnd });
  const originalSubjRef = subjRef;
  let subjSpanOverride: Span | null = null;
  let objSpanOverride: Span | null = null;

  if (tokens && triggerIdx !== undefined && subjRef) {
    const triggerToken = tokens.find(tok => tok.i === triggerIdx);
    const voiceInfo = detectVoice(triggerToken, tokens);
    if (voiceInfo.isPassive && voiceInfo.agentHead) {
      const agentRange = expandNP(voiceInfo.agentHead, tokens);
      const agentSurface = text.slice(agentRange.start, agentRange.end);
      const agentRef = mapSurfaceToEntity(agentSurface, entities, spans, agentRange);
      if (agentRef) {
        subjRef = agentRef;
        subjStart = agentRange.start;
        subjEnd = agentRange.end;
        subjSpanOverride =
          agentRef.span ??
          selectEntitySpan(agentRef.entity.id, spans, agentRange) ??
          { entity_id: agentRef.entity.id, start: agentRange.start, end: agentRange.end };

        if (!objRef && originalSubjRef) {
          objRef = originalSubjRef;
          objStart = originalSubjRange.start;
          objEnd = originalSubjRange.end;
          objSpanOverride =
            originalSubjRef.span ??
            selectEntitySpan(originalSubjRef.entity.id, spans, originalSubjRange) ??
            { entity_id: originalSubjRef.entity.id, start: originalSubjRange.start, end: originalSubjRange.end };
        }
      }
    }
  }

  if (!subjRef || !objRef) return [];

  const subjEnt = subjRef.entity;
  const objEnt = objRef.entity;

  if (subjEnt.id === objEnt.id) return [];

  // Filter out relations involving descriptor entities (family, couple, children, etc.)
  if (isDescriptorEntity(subjEnt) || isDescriptorEntity(objEnt)) {
    if (L3_DEBUG) {
      console.log(`[DESCRIPTOR-FILTER] Blocked relation: ${subjEnt.canonical} --[${pred}]--> ${objEnt.canonical}`);
    }
    return [];
  }

  const defaultSubjSpan =
    subjSpanOverride ??
    subjRef.span ??
    selectEntitySpan(subjEnt.id, spans, { start: subjStart, end: subjEnd }) ??
    { entity_id: subjEnt.id, start: subjStart, end: subjEnd };
  const defaultObjSpan =
    objSpanOverride ??
    objRef.span ??
    selectEntitySpan(objEnt.id, spans, { start: objStart, end: objEnd }) ??
    { entity_id: objEnt.id, start: objStart, end: objEnd };

  const mentionOrFallback = (ref: EntityRef, fallback: string) => {
    if (ref.span) {
      const mention = text.slice(ref.span.start, ref.span.end).trim();
      const cleanedMention = cleanRelationSurface(mention);
      if (cleanedMention) {
        // IMPORTANT: Prefer entity's canonical if it's a multi-word name
        // that contains the span-derived text as a substring.
        // This ensures "Harry Potter" is used instead of just "Harry" or "Potter"
        const canonical = ref.entity.canonical;
        const canonicalWords = canonical.split(/\s+/);
        const mentionWords = cleanedMention.split(/\s+/);
        if (canonicalWords.length > mentionWords.length) {
          // Canonical has more words - check if mention is a partial match
          const mentionLower = cleanedMention.toLowerCase();
          const canonicalLower = canonical.toLowerCase();
          if (canonicalLower.includes(mentionLower)) {
            return cleanRelationSurface(canonical);
          }
        }
        return cleanedMention;
      }
    }
    return cleanRelationSurface(fallback);
  };

  const expandCoordinationRefs = (ref: EntityRef, baseSpan: Span): EntityRef[] => {
    if (!tokens) return [ref];
    const spanTokens = tokens.filter(t => t.start >= baseSpan.start && t.end <= baseSpan.end);
    if (spanTokens.length <= 1) return [ref];
    const isCoordDelimiter = (tok: Token) => {
      const lower = tok.text.toLowerCase();
      return (
        tok.pos === 'CCONJ' ||
        tok.dep === 'cc' ||
        tok.text === ',' ||
        tok.text === ';' ||
        lower === 'and' ||
        lower === 'or' ||
        lower === '&'
      );
    };
    const hasCoordination = spanTokens.some(isCoordDelimiter);
    if (!hasCoordination) return [ref];

    const segments: Token[][] = [];
    let current: Token[] = [];
    const isCoordToken = (tok: Token) => isCoordDelimiter(tok);

    for (const tok of spanTokens) {
      if (isCoordToken(tok)) {
        if (current.length) {
          segments.push(current);
          current = [];
        }
        continue;
      }
      current.push(tok);
    }
    if (current.length) segments.push(current);

    const refs: EntityRef[] = [];
    for (const segment of segments) {
      if (!segment.length) continue;
      const segRange = { start: segment[0].start, end: segment[segment.length - 1].end };
      const mapped = mapSurfaceToEntity(
        text.slice(segRange.start, segRange.end),
        entities,
        spans,
        segRange
      );
      if (mapped && !refs.some(r => r.entity.id === mapped.entity.id)) {
        refs.push(mapped);
      }
    }

    return refs.length ? refs : [ref];
  };

  const extendSpanForCoordination = (baseSpan: Span): Span => {
    if (!tokens?.length) return baseSpan;
    const overlaps = (tok: Token) =>
      !(tok.end <= baseSpan.start || tok.start >= baseSpan.end);
    const baseTokens = tokens.filter(overlaps);
    if (!baseTokens.length) return baseSpan;
    if (COORD_TRACE) {
      console.log(`[COORD-EXTEND] Base tokens for span ${baseSpan.start}-${baseSpan.end}:`, baseTokens.map(t => `${t.text}/${t.dep}/head=${t.head}`));
    }

    const coordDeps = new Set(['compound', 'conj', 'cc', 'appos', 'flat']);
    const members: Token[] = [...baseTokens];
    const queue: Token[] = [...baseTokens];
    const seen = new Set(queue.map(t => t.i));

    while (queue.length) {
      const current = queue.pop()!;

      for (const child of tokens) {
        if (child.head === current.i && coordDeps.has(child.dep) && !seen.has(child.i)) {
          seen.add(child.i);
          members.push(child);
          queue.push(child);
        }
      }

      if (current.head !== current.i) {
        const parent = tokens.find(t => t.i === current.head);
        if (parent && coordDeps.has(current.dep) && !seen.has(parent.i)) {
          seen.add(parent.i);
          members.push(parent);
          queue.push(parent);
        }
      }
    }

    const newStart = Math.min(baseSpan.start, ...members.map(m => m.start));
    const newEnd = Math.max(baseSpan.end, ...members.map(m => m.end));
    if (newStart === baseSpan.start && newEnd === baseSpan.end) {
      return baseSpan;
    }
    if (COORD_TRACE) {
      console.log(`[COORD-EXTEND] Span ${baseSpan.start}-${baseSpan.end} extended to ${newStart}-${newEnd}`);
    }
    return { ...baseSpan, start: newStart, end: newEnd };
  };

  const subjCoordinationSpan: Span = extendSpanForCoordination({
    entity_id: subjEnt.id,
    start: Math.min(subjStart, defaultSubjSpan.start),
    end: Math.max(subjEnd, defaultSubjSpan.end)
  });
  const objCoordinationSpan: Span = extendSpanForCoordination({
    entity_id: objEnt.id,
    start: Math.min(objStart, defaultObjSpan.start),
    end: Math.max(objEnd, defaultObjSpan.end)
  });

  const subjVariants = expandCoordinationRefs(subjRef, subjCoordinationSpan);
  const objVariants = expandCoordinationRefs(objRef, objCoordinationSpan);

  if (COORD_TRACE) {
    const formatVariant = (ref: EntityRef, label: 'SUBJ' | 'OBJ') => {
      const span = ref.span ?? null;
      const pos = span ? `${span.start}-${span.end}` : 'n/a';
      console.log(`[COORD-EXPAND] ${label} → ${ref.entity.canonical} (span=${pos})`);
    };
    console.log(`[COORD-EXPAND] Subject variants for ${pred}: ${subjVariants.length}`);
    subjVariants.forEach(ref => formatVariant(ref, 'SUBJ'));
    console.log(`[COORD-EXPAND] Object variants for ${pred}: ${objVariants.length}`);
    objVariants.forEach(ref => formatVariant(ref, 'OBJ'));
  }

  if (TRACE_REL) {
    const snippet = text.slice(Math.max(0, subjStart - 30), Math.min(text.length, objEnd + 30));
    traceRelation("candidate", {
      pred,
      subj: subjEnt,
      obj: objEnt,
      subjSpan: [subjStart, subjEnd],
      objSpan: [objStart, objEnd],
      source,
      snippet
    });
  }

  // Type guard check
  if (!passesGuard(pred, subjEnt, objEnt)) {
    return [];
  }

  const relations: Relation[] = [];

  // Evidence snippet (±40 chars context)
  const evidenceStart = Math.max(0, subjStart - 40);
  const evidenceEnd = Math.min(text.length, objEnd + 40);
  const evidenceText = text.slice(evidenceStart, evidenceEnd);

  // Phase 3: Compute confidence and extract qualifiers
  let confidence = source === 'DEP' ? 0.9 : 0.7;
  let qualifiers: Qualifier[] = [];

  if (tokens && triggerIdx !== undefined) {
    // Find subject and object tokens for confidence computation
    const subjTok = tokens.find(t => t.start >= subjStart && t.start < subjEnd);
    const objTok = tokens.find(t => t.start >= objStart && t.start < objEnd);

    if (subjTok && objTok) {
      confidence = computeConfidence(subjTok, objTok, source, true);
    }

    // Extract qualifiers
    qualifiers = extractQualifiers(tokens, triggerIdx, entities, spans, text);
  }

  // Primary relation
  for (const subjVariant of subjVariants) {
    for (const objVariant of objVariants) {
      if (subjVariant.entity.id === objVariant.entity.id) continue;

      const subjRange = subjVariant.span ?? defaultSubjSpan;
      const objRange = objVariant.span ?? defaultObjSpan;

      if (COORD_TRACE) {
        console.log(`[COORD-REL] Emitting ${pred} :: ${subjVariant.entity.canonical} -> ${objVariant.entity.canonical}`);
      }

      const subjSurfaceText = mentionOrFallback(
        subjVariant,
        text.slice(subjRange.start, subjRange.end) || subjSurfaceRaw || subjVariant.entity.canonical
      );
      const objSurfaceText = mentionOrFallback(
        objVariant,
        text.slice(objRange.start, objRange.end) || objSurfaceRaw || objVariant.entity.canonical
      );

      const primaryRelation: Relation = {
        id: uuid(),
        subj: subjVariant.entity.id,
        pred: pred,
        obj: objVariant.entity.id,
        subj_surface: subjSurfaceText,
        obj_surface: objSurfaceText,
        evidence: [{
          doc_id: 'default',
          span: { start: subjRange.start, end: objRange.end, text: evidenceText },
          sentence_index: 0,
          source: source === 'DEP' ? 'RULE' : 'RAW'
        }],
        confidence,
        extractor: source.toLowerCase() as 'dep' | 'regex',
        qualifiers: qualifiers.length > 0 ? qualifiers : undefined
      };

      relations.push(primaryRelation);

      const inversePred = INVERSE[pred];
      if (inversePred && passesGuard(inversePred, objVariant.entity, subjVariant.entity)) {
        const inverseRelation: Relation = {
          id: uuid(),
          subj: objVariant.entity.id,
          pred: inversePred,
          obj: subjVariant.entity.id,
          subj_surface: objSurfaceText,
          obj_surface: subjSurfaceText,
          evidence: [{
            doc_id: 'default',
            span: { start: subjRange.start, end: objRange.end, text: evidenceText },
            sentence_index: 0,
            source: source === 'DEP' ? 'RULE' : 'RAW'
          }],
          confidence,
          extractor: source.toLowerCase() as 'dep' | 'regex',
          qualifiers: qualifiers.length > 0 ? qualifiers : undefined
        };

        relations.push(inverseRelation);
      }
    }
  }

  if (TRACE_REL) {
    for (const rel of relations) {
      const snippet = text.slice(Math.max(0, subjStart - 30), Math.min(text.length, objEnd + 30));
      traceRelation("final", {
        pred: rel.pred,
        subj: rel.subj ? entities.find(e => e.id === rel.subj) ?? null : null,
        obj: rel.obj ? entities.find(e => e.id === rel.obj) ?? null : null,
        subjSpan: [subjStart, subjEnd],
        objSpan: [objStart, objEnd],
        source,
        snippet
      });
    }
  }

  return relations;
}

/**
 * Extract relations using dependency patterns
 */
function extractDepRelations(
  text: string,
  entities: Entity[],
  spans: Span[],
  sentences: ParsedSentence[]
): Relation[] {
  const relations: Relation[] = [];
  const textLower = text.toLowerCase();
  const spanLookup = new Map<string, Span>();
  for (const span of spans) {
    if (!spanLookup.has(span.entity_id)) {
      spanLookup.set(span.entity_id, span);
    }
  }
  const entityById = new Map<string, Entity>();
  for (const entity of entities) {
    entityById.set(entity.id, entity);
  }

  const schoolKeywords = ['school', 'academy', 'institute', 'university', 'college', 'hogwarts', 'beauxbatons', 'durmstrang'];

  let lastNamedSubject: Token | null = null;
  let lastNamedOrg: Token | null = null;
  let lastSchoolOrg: Token | null = null;
  const recentPersons: Token[] = [];
  const handledChildrenSentences = new Set<number>();
  const handledMemberSentences = new Set<number>();
  const handledColonPositions = new Set<number>();
  const emittedEnumerationKeys = new Set<string>();

  const pushRecentPerson = (tok?: Token | null) => {
    if (!tok) return;
    if (!isNameToken(tok)) return;
    if (tok.pos !== 'PROPN') return;
    if (tok.ent && tok.ent !== 'PERSON' && tok.ent !== 'NORP') return;
    if (recentPersons.length === 0 || recentPersons[0].start !== tok.start) {
      recentPersons.unshift(tok);
      if (recentPersons.length > 6) {
        recentPersons.pop();
      }
    }
  };

  const pushRecentOrg = (tok?: Token | null) => {
    if (!tok) return;
    if (tok.pos !== 'PROPN') return;
    if (tok.ent && tok.ent !== 'ORG' && tok.ent !== 'FAC') return;
    lastNamedOrg = tok;
    const lower = tok.text.toLowerCase();
    if (schoolKeywords.some(keyword => lower.includes(keyword))) {
      lastSchoolOrg = tok;
    }
  };

  const resolvePossessors = (possessor: Token): Token[] => {
    if (possessor.pos !== 'PRON') {
      return [possessor];
    }
    const lower = possessor.text.toLowerCase();
    if (lower === 'their' && recentPersons.length >= 2) {
      return recentPersons.slice(0, 2);
    }
    if ((lower === 'his' || lower === 'her') && lastNamedSubject) {
      return [lastNamedSubject];
    }
    if (recentPersons.length) {
      return [recentPersons[0]];
    }
    return lastNamedSubject ? [lastNamedSubject] : [];
  };

  const updateLastNamedSubject = (candidate?: Token) => {
    if (!candidate) return;
    if (candidate.pos === 'PRON') return;
    if (isNameToken(candidate)) {
      lastNamedSubject = candidate;
      pushRecentPerson(candidate);
    }
  };

  const ACADEMIC_TITLE_TOKENS = new Set([
    'professor', 'teacher', 'instructor', 'head', 'headmaster', 'headmistress',
    'dean', 'chair', 'director', 'warden', 'master'
  ]);

  const resolveAcademicSubject = (tok?: Token | null, tokensRef?: Token[]): Token | null => {
    if (!tok) return null;
    const lower = tok.text.toLowerCase();
    if (tok.pos === 'PRON' && lastNamedSubject) {
      return lastNamedSubject;
    }
    if (ACADEMIC_TITLE_TOKENS.has(lower) && tokensRef) {
      const properChild = tokensRef.find(child =>
        child.head === tok.i &&
        child.pos === 'PROPN'
      );
      if (properChild) {
        return properChild;
      }
    }
    return tok;
  };

  const relationKeys = new Set<string>();

  const relationKey = (rel: Relation) => {
    const subjEntity = getEntityById(rel.subj);
    const objEntity = getEntityById(rel.obj);
    const subjKey = subjEntity
      ? `${subjEntity.type}:${normalizeEntityName(subjEntity.canonical).toLowerCase()}`
      : rel.subj;
    const objKey = objEntity
      ? `${objEntity.type}:${normalizeEntityName(objEntity.canonical).toLowerCase()}`
      : rel.obj;
    return `${subjKey}::${rel.pred}::${objKey}`;
  };

  const getEntityById = (id: string): Entity | undefined => entities.find(e => e.id === id);

  const entityFromSpan = (start: number, end: number): Entity | undefined => {
    const surface = text.slice(start, end);
    const mapped = mapSurfaceToEntity(surface, entities, spans, { start, end });
    return mapped?.entity;
  };

  const ensureSpanForEntity = (entity: Entity, fallback: { start: number; end: number }): Span => {
    const existing = spanLookup.get(entity.id);
    if (existing) return existing;
    return { entity_id: entity.id, start: fallback.start, end: fallback.end };
  };

  const findNearestEntityBefore = (
    offset: number,
    allowedTypes: EntityType[],
    maxDistance = 240
  ): EntityRef | null => {
    let best: { entity: Entity; span: Span } | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    const typeWeight = (type: EntityType): number => {
      switch (type) {
        case 'ORG':
          return 0;
        case 'HOUSE':
        case 'TRIBE':
          return 10;
        case 'PLACE':
          return 30;
        case 'PERSON':
          return 45;
        default:
          return 60;
      }
    };

    for (const span of spans) {
      if (span.end > offset) continue;
      const entity = getEntityById(span.entity_id);
      if (!entity) continue;
      if (!allowedTypes.includes(entity.type)) continue;
      const distance = offset - span.end;
      if (distance > maxDistance) continue;

      const score = distance + typeWeight(entity.type);
      if (score < bestScore) {
        bestScore = score;
        best = { entity, span };
      } else if (score === bestScore && best) {
        if (distance < offset - best.span.end) {
          best = { entity, span };
        }
      }
    }

    if (!best) return null;
    return {
      entity: best.entity,
      span: selectEntitySpan(best.entity.id, spans, { start: offset - 1, end: offset })
    };
  };

  const propagateLivesIn = (rel: Relation, triggerTok: Token) => {
    const subjEntity = getEntityById(rel.subj);
    const objEntity = getEntityById(rel.obj);
    if (!subjEntity || !objEntity) return;
    if (isDescriptorEntity(subjEntity)) return;
    if (!/family/i.test(subjEntity.canonical)) return;

    const surnameMatch = subjEntity.canonical.match(/\b([A-Z][a-z]+)\b(?=\s+family)/);
    const surname = surnameMatch ? surnameMatch[1].toLowerCase() : null;
    const placeSpan = spanLookup.get(rel.obj);
    if (!placeSpan) return;

    const candidateEntities: Entity[] = [];
    for (const entity of entities) {
      if (entity.type !== 'PERSON' || entity.id === subjEntity.id) continue;
      const normalized = normalizeEntityName(entity.canonical).toLowerCase();
      if (surname && normalized.includes(surname)) {
        candidateEntities.push(entity);
      }
    }

    if (!candidateEntities.length && recentPersons.length) {
      for (const token of recentPersons) {
        if (token.start >= placeSpan.start && token.start <= placeSpan.end) continue;
        const surface = text.slice(token.start, token.end);
        const mapped = mapSurfaceToEntity(surface, entities, spans, { start: token.start, end: token.end });
        const entity = mapped?.entity;
        if (!entity || entity.type !== 'PERSON' || entity.id === subjEntity.id) continue;
        if (!candidateEntities.includes(entity)) {
          candidateEntities.push(entity);
        }
      }
    }

    for (const candidate of candidateEntities) {
      const personSpan = spanLookup.get(candidate.id);
      if (!personSpan) continue;
      if (!passesGuard('lives_in', candidate, objEntity)) continue;
      const evidenceStart = Math.max(0, Math.min(personSpan.start, placeSpan.start) - 40);
      const evidenceEnd = Math.min(text.length, Math.max(personSpan.end, placeSpan.end) + 40);
      const evidenceText = text.slice(evidenceStart, evidenceEnd);
      const baseRel: Relation = {
        id: uuid(),
        subj: candidate.id,
        pred: 'lives_in',
        obj: rel.obj,
        evidence: [{
          doc_id: 'default',
          span: { start: Math.min(personSpan.start, placeSpan.start), end: Math.max(personSpan.end, placeSpan.end), text: evidenceText },
          sentence_index: 0,
          source: 'RULE'
        }],
        confidence: rel.confidence,
        extractor: rel.extractor,
        qualifiers: rel.qualifiers
      };
      const baseKey = relationKey(baseRel);
      if (!relationKeys.has(baseKey)) {
        relationKeys.add(baseKey);
        relations.push(baseRel);
      }

      const inversePred = INVERSE['lives_in'];
      if (inversePred) {
        const inverseRel: Relation = {
          id: uuid(),
          subj: rel.obj,
          pred: inversePred,
          obj: candidate.id,
          evidence: baseRel.evidence,
          confidence: rel.confidence,
          extractor: rel.extractor,
          qualifiers: rel.qualifiers
        };
        const invKey = relationKey(inverseRel);
        if (!relationKeys.has(invKey)) {
          relationKeys.add(invKey);
          relations.push(inverseRel);
        }
      }
    }
  };

  const addProducedRelations = (produced: Relation[], triggerTok: Token) => {
    for (const rel of produced) {
      const key = relationKey(rel);
      if (!relationKeys.has(key)) {
        relationKeys.add(key);
        relations.push(rel);
        if (rel.pred === 'lives_in') {
          propagateLivesIn(rel, triggerTok);
        }
      }
    }
  };

  const emitCandidate = (
    pred: Predicate,
    subjRef: EntityRef | null,
    objRef: EntityRef | null,
    triggerTok: Token
  ) => {
    if (!subjRef || !objRef) return;
    const subjSpan = subjRef.span ?? selectEntitySpan(subjRef.entity.id, spans);
    const objSpan = objRef.span ?? selectEntitySpan(objRef.entity.id, spans);
    if (!subjSpan || !objSpan) return;

    if (L3_DEBUG && pred === 'friends_with') {
      console.log(`[FRIENDS] ${subjRef.entity.canonical} <-> ${objRef.entity.canonical} (trigger="${triggerTok.text}")`);
    }

    const subjKey = `${subjRef.entity.type}:${normalizeEntityName(subjRef.entity.canonical).toLowerCase()}`;
    const objKey = `${objRef.entity.type}:${normalizeEntityName(objRef.entity.canonical).toLowerCase()}`;
    const enumerationKey = `${pred}::${subjKey}::${objKey}`;
    if (emittedEnumerationKeys.has(enumerationKey)) return;

    const produced = tryCreateRelation(
      text,
      entities,
      spans,
      pred,
      subjSpan.start,
      subjSpan.end,
      objSpan.start,
      objSpan.end,
      'REGEX'
    );
    if (!produced.length) return;

    for (const rel of produced) {
      if (rel.subj === subjRef.entity.id && rel.obj === objRef.entity.id) {
        // already aligned
      } else if (rel.subj === objRef.entity.id && rel.obj === subjRef.entity.id) {
        // inverse already aligned
      } else {
        if (rel.pred === pred) {
          rel.subj = subjRef.entity.id;
          rel.obj = objRef.entity.id;
        } else if (INVERSE[pred] === rel.pred) {
          rel.subj = objRef.entity.id;
          rel.obj = subjRef.entity.id;
        }
      }
      const evidence = rel.evidence?.[0];
      if (evidence) {
        const spanStart = Math.min(subjSpan.start, objSpan.start);
        const spanEnd = Math.max(subjSpan.end, objSpan.end);
        evidence.span.start = spanStart;
        evidence.span.end = spanEnd;
        evidence.span.text = text.slice(spanStart, spanEnd);
      }
    }

    addProducedRelations(produced, triggerTok);
    emittedEnumerationKeys.add(enumerationKey);
  };

  const locateSurface = (surface: string, searchFrom: number) => {
    const raw = surface.trim();
    if (!raw) return null;
    const rawLower = raw.toLowerCase();
    let idx = textLower.indexOf(rawLower, searchFrom);
    if (idx !== -1) {
      return { start: idx, end: idx + raw.length };
    }

    const normalized = normalizeEntityName(raw);
    const normalizedLower = normalized.toLowerCase();
    if (!normalizedLower) return null;
    idx = textLower.indexOf(normalizedLower, searchFrom);
    if (idx === -1) return null;
    return { start: idx, end: idx + normalized.length };
  };

  for (let sentenceIdx = 0; sentenceIdx < sentences.length; sentenceIdx++) {
    const sent = sentences[sentenceIdx];
    const tokens = sent.tokens;
    const sentenceText = text.slice(sent.start, sent.end);
    const sentenceLower = sentenceText.toLowerCase();

    // === DEPENDENCY PATH EXTRACTION (NEW) ===
    // Try to extract relations using dependency paths between entity pairs
    // This handles complex grammatical constructions better than simple patterns

    // Build map of entity spans to their rightmost token (head token)
    // This ensures we use ONE token per entity, not all tokens within the entity
    // For multi-word entities, store ALL tokens, not just the head
    // E.g., "National University of Singapore" - paths may go through "University"
    const entitySpanTokens = new Map<string, Token[]>();
    for (const span of spans) {
      const entity = getEntityById(span.entity_id);
      if (!entity) continue;

      // Allow ALL entity types! Type guards will filter invalid combinations
      // This enables PERSON→PLACE, PERSON→DATE, ORG→PLACE, etc.

      // Store ALL tokens in this span
      const spanTokens = tokens.filter(t => t.start >= span.start && t.start < span.end);
      if (spanTokens.length > 0) {
        entitySpanTokens.set(span.entity_id, spanTokens);
      }
    }

    const DEBUG_DEP = process.env.DEBUG_DEP === '1';
    if (DEBUG_DEP && entitySpanTokens.size > 0) {
      console.log(`[DEP] Sentence has ${entitySpanTokens.size} entity tokens`);
    }

    // Try dependency path extraction for each entity pair
    // Check paths between ALL token combinations to catch multi-word entities
    const entityIds = Array.from(entitySpanTokens.keys());
    for (let ei = 0; ei < entityIds.length; ei++) {
      for (let ej = ei + 1; ej < entityIds.length; ej++) {
        const entityId1 = entityIds[ei];
        const entityId2 = entityIds[ej];
        const tokens1 = entitySpanTokens.get(entityId1)!;
        const tokens2 = entitySpanTokens.get(entityId2)!;

        const entity1 = getEntityById(entityId1);
        const entity2 = getEntityById(entityId2);
        if (!entity1 || !entity2) continue;

        const span1 = spanLookup.get(entityId1);
        const span2 = spanLookup.get(entityId2);
        if (!span1 || !span2) continue;

        // Try paths between all token pairs - stop at first match
        let pathResult: { predicate: Predicate; subjectFirst: boolean; confidence: number } | null = null;
        let token1: Token | null = null;
        let token2: Token | null = null;

        for (const t1 of tokens1) {
          for (const t2 of tokens2) {
            const result = extractRelationFromPath(t1, t2, tokens);
            if (result) {
              pathResult = result;
              token1 = t1;
              token2 = t2;
              break;
            }
          }
          if (pathResult) break;
        }

        if (!pathResult || !token1 || !token2) continue;

        if (DEBUG_DEP) {
          console.log(`[DEP] Found path: ${entity1.canonical} → ${entity2.canonical}`);
          console.log(`[DEP]   Predicate: ${pathResult.predicate}, subjectFirst: ${pathResult.subjectFirst}`);
        }

        // Determine subject and object based on subjectFirst
        const subjectEntity = pathResult.subjectFirst ? entity1 : entity2;
        const objectEntity = pathResult.subjectFirst ? entity2 : entity1;
        if (!passesGuard(pathResult.predicate, subjectEntity, objectEntity)) {
          if (DEBUG_DEP) {
            console.log(`[DEP]   Type guard FAILED: ${subjectEntity.type} ${pathResult.predicate} ${objectEntity.type}`);
          }
          continue;
        }

        // Create relation using existing infrastructure
        const subjSpan = pathResult.subjectFirst ? span1 : span2;
        const objSpan = pathResult.subjectFirst ? span2 : span1;

        const produced = tryCreateRelation(
          text,
          entities,
          spans,
          pathResult.predicate,
          subjSpan.start,
          subjSpan.end,
          objSpan.start,
          objSpan.end,
          'DEP',
          tokens,
          token1.i  // Use first token as trigger
        );

        if (produced.length > 0) {
          // Update confidence from dependency path match
          for (const rel of produced) {
            rel.confidence = pathResult.confidence;
          }
          if (DEBUG_DEP) {
            console.log(`[DEP]   Created ${produced.length} relation(s)`);
          }
          addProducedRelations(produced, token1);

          // === COORDINATION EXPANSION ===
          // Check if either subject or object has coordinated siblings (conj relation)
          // E.g., "Robert and Sarah founded Zenith" → create relations for both Robert and Sarah

          const subjectToken = pathResult.subjectFirst ? token1 : token2;
          const objectToken = pathResult.subjectFirst ? token2 : token1;
          const subjEntity = pathResult.subjectFirst ? entity1 : entity2;
          const objEntity = pathResult.subjectFirst ? entity2 : entity1;

          // Find coordinated entities for the subject
          const coordSubjects: Token[] = [];
          if (DEBUG_DEP) {
            console.log(`[DEP-COORD-SEARCH] Looking for conj tokens with head=${subjectToken.i} (${subjectToken.text})`);
            console.log(`[DEP-COORD-SEARCH] All tokens in sentence:`, tokens.map(t => `"${t.text}"(i=${t.i},dep=${t.dep},head=${t.head})`).join(' | '));
          }
          for (const tok of tokens) {
            if (DEBUG_DEP && tok.dep === 'conj') {
              console.log(`[DEP-COORD-SEARCH]   Found conj token: "${tok.text}" (i=${tok.i}, head=${tok.head})`);
            }
            if (tok.dep === 'conj' && tok.head === subjectToken.i) {
              coordSubjects.push(tok);
              if (DEBUG_DEP) {
                console.log(`[DEP-COORD-SEARCH]   ✓ MATCH! Added to coordSubjects`);
              }
            }
          }

          // Find coordinated entities for the object
          const coordObjects: Token[] = [];
          for (const tok of tokens) {
            if (tok.dep === 'conj' && tok.head === objectToken.i) {
              coordObjects.push(tok);
            }
          }

          if (DEBUG_DEP && (coordSubjects.length > 0 || coordObjects.length > 0)) {
            console.log(`[DEP]   Found coordinations: ${coordSubjects.length} subjects, ${coordObjects.length} objects`);
          }

          // Create relations for coordinated subjects
          for (const coordToken of coordSubjects) {
            // Find entity span for this coordinated token
            let coordEntityId: string | null = null;
            for (const [entityId, entTokens] of entitySpanTokens.entries()) {
              if (entTokens.some(t => t.i === coordToken.i)) {
                coordEntityId = entityId;
                break;
              }
            }

            if (DEBUG_DEP) {
              console.log(`[DEP-COORD] Coordinated subject token: "${coordToken.text}" (i=${coordToken.i})`);
              console.log(`[DEP-COORD] Found coordEntityId: ${coordEntityId}`);
              if (coordEntityId) {
                const coordEntity = getEntityById(coordEntityId);
                console.log(`[DEP-COORD] Coord entity: ${coordEntity?.canonical}`);
              }
            }

            if (coordEntityId) {
              const coordEntity = getEntityById(coordEntityId);
              const coordSpan = spanLookup.get(coordEntityId);
              if (coordEntity && coordSpan && passesGuard(pathResult.predicate, coordEntity, objEntity)) {
                const coordProduced = tryCreateRelation(
                  text,
                  entities,
                  spans,
                  pathResult.predicate,
                  coordSpan.start,
                  coordSpan.end,
                  objSpan.start,
                  objSpan.end,
                  'DEP',
                  tokens,
                  coordToken.i
                );
                for (const rel of coordProduced) {
                  // Keep same confidence as primary relation - coordinated entities deserve full confidence
                  rel.confidence = pathResult.confidence;
                }
                if (coordProduced.length > 0) {
                  if (DEBUG_DEP) {
                    console.log(`[DEP]   Created ${coordProduced.length} relation(s) for coordinated subject: ${coordEntity.canonical}`);
                  }
                  addProducedRelations(coordProduced, coordToken);
                }
              }
            }
          }

          // Create relations for coordinated objects
          for (const coordToken of coordObjects) {
            // Find entity span for this coordinated token
            let coordEntityId: string | null = null;
            for (const [entityId, entTokens] of entitySpanTokens.entries()) {
              if (entTokens.some(t => t.i === coordToken.i)) {
                coordEntityId = entityId;
                break;
              }
            }

            if (coordEntityId) {
              const coordEntity = getEntityById(coordEntityId);
              const coordSpan = spanLookup.get(coordEntityId);
              if (coordEntity && coordSpan && passesGuard(pathResult.predicate, subjEntity, coordEntity)) {
                const coordProduced = tryCreateRelation(
                  text,
                  entities,
                  spans,
                  pathResult.predicate,
                  subjSpan.start,
                  subjSpan.end,
                  coordSpan.start,
                  coordSpan.end,
                  'DEP',
                  tokens,
                  coordToken.i
                );
                for (const rel of coordProduced) {
                  // Keep same confidence as primary relation - coordinated entities deserve full confidence
                  rel.confidence = pathResult.confidence;
                }
                if (coordProduced.length > 0) {
                  if (DEBUG_DEP) {
                    console.log(`[DEP]   Created ${coordProduced.length} relation(s) for coordinated object: ${coordEntity.canonical}`);
                  }
                  addProducedRelations(coordProduced, coordToken);
                }
              }
            }
          }

        } else if (DEBUG_DEP) {
          console.log(`[DEP]   tryCreateRelation returned 0 relations`);
        }
      }
    }

    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      const lemma = tok.lemma.toLowerCase();
      const textLower = tok.text.toLowerCase();

      if (tok.pos === 'PROPN') {
        let entityType = tok.ent;
        if (!entityType) {
          const candidateIds = getEntityCandidatesByOffset(spans, tok.start, tok.end);
          for (const candidateId of candidateIds) {
            const entity = getEntityById(candidateId);
            if (entity) {
              entityType = entity.type;
              break;
            }
          }
        }

        if (entityType === 'PERSON' || entityType === 'NORP') {
          pushRecentPerson(tok);
        } else if (entityType === 'ORG' || entityType === 'FAC') {
          pushRecentOrg(tok);
        }
      }

      // Pattern 1: parent_of via "begat"
      if (lemma === 'beget' || textLower === 'begat') {
        let subj = tokens.find(t => t.dep === 'nsubj' && t.head === tok.i);
        let obj = tokens.find(t => (t.dep === 'dobj' || t.dep === 'obj' || t.dep === 'appos') && t.head === tok.i);

        if (!subj) {
          const leftTokens = tokens.slice(0, i).reverse();
          subj = leftTokens.find(isNameToken) ?? subj;
        }

        if (!obj) {
          const headTok = tokens.find(t => t.i === tok.head);
          if (headTok && isNameToken(headTok)) {
            obj = headTok;
          }
        }

      if (subj && obj) {
        if (subj.pos === 'PRON' && lastNamedSubject) {
          subj = lastNamedSubject;
        }
        updateLastNamedSubject(subj);
          const produced = tryCreateRelation(
            text, entities, spans, 'parent_of',
            subj.start, subj.end, obj.start, obj.end, 'DEP',
            tokens, tok.i
          );
          addProducedRelations(produced, tok);
        }
      }

      const spouseNouns = new Set(['wife', 'husband', 'spouse', 'partner']);
      if (spouseNouns.has(lemma) || spouseNouns.has(textLower)) {
        const copula = tokens.find(t =>
          t.i === tok.head &&
          ['be', 'was', 'were', 'is'].includes(t.lemma.toLowerCase())
        );
        const subjects = copula
          ? tokens.filter(t => t.dep === 'nsubj' && t.head === copula.i)
          : [];
        let possTokens = tokens.filter(t => t.dep === 'poss' && t.head === tok.i);
        if (!possTokens.length && lastNamedSubject) {
          possTokens = [lastNamedSubject];
        }
        const parentTokens = possTokens.flatMap(resolvePossessors);

        const subjectRefs: EntityRef[] = [];
        for (const subjTok of subjects.flatMap(s => collectConjTokens(s, tokens))) {
          const resolved = subjTok.pos === 'PRON' && lastNamedSubject ? lastNamedSubject : subjTok;
          const subjSpan = expandNP(resolved, tokens);
          const mapped = mapSurfaceToEntity(
            text.slice(subjSpan.start, subjSpan.end),
            entities,
            spans,
            subjSpan
          );
          if (mapped) {
            updateLastNamedSubject(resolved);
            subjectRefs.push(mapped);
          }
        }

        const partnerRefs: EntityRef[] = [];
        for (const poss of parentTokens) {
          const possSpan = expandNP(poss, tokens);
          const mapped = mapSurfaceToEntity(
            text.slice(possSpan.start, possSpan.end),
            entities,
            spans,
            possSpan
          );
          if (mapped) {
            partnerRefs.push(mapped);
          }
        }

        if (subjectRefs.length && partnerRefs.length) {
          for (const subjRef of subjectRefs) {
            for (const partnerRef of partnerRefs) {
              if (subjRef.entity.id === partnerRef.entity.id) continue;
              const forward = tryCreateRelation(
                text, entities, spans, 'married_to',
                subjRef.span!.start, subjRef.span!.end,
                partnerRef.span!.start, partnerRef.span!.end,
                'DEP',
                tokens, tok.i
              );
              addProducedRelations(forward, tok);
              const inverse = tryCreateRelation(
                text, entities, spans, 'married_to',
                partnerRef.span!.start, partnerRef.span!.end,
                subjRef.span!.start, subjRef.span!.end,
                'DEP',
                tokens, tok.i
              );
              addProducedRelations(inverse, tok);
            }
          }
        }
      }

      // Pattern 2: child_of via "son/daughter/child/offspring/descendant/heir of"
      if (lemma === 'son' || lemma === 'daughter' || lemma === 'child' || lemma === 'offspring' || lemma === 'descendant' || lemma === 'heir') {
        const ofPrep = tokens.find(t => t.dep === 'prep' && t.head === tok.i && t.text.toLowerCase() === 'of');
        if (ofPrep) {
          const parentTok = tokens.find(t => t.dep === 'pobj' && t.head === ofPrep.i);
          const parentCandidates = parentTok ? collectConjTokens(parentTok, tokens) : [];

          let childToken: Token | undefined;

          // Case 1: "X is the son of Y" - copula construction
          const copula = tokens.find(t => t.i === tok.head && ['be', 'was', 'were', 'is'].includes(t.lemma.toLowerCase()));
          if (copula) {
            const subj = tokens.find(t => t.dep === 'nsubj' && t.head === copula.i);
            if (subj) {
              childToken = chooseSemanticHead(subj, tokens);
            }
          } else {
            // Case 2: "X, son of Y" - appositive or nominal modifier construction
            const headToken = tokens.find(t => t.i === tok.head);
            if (headToken) {
              if (headToken.pos === 'PROPN' || /^[A-Z]/.test(headToken.text)) {
                childToken = headToken;
              } else {
                // spaCy sometimes attaches the proper noun as an appositive to the appositive head
                childToken = tokens.find(t =>
                  t.dep === 'appos' &&
                  t.head === headToken.i &&
                  (t.pos === 'PROPN' || /^[A-Z]/.test(t.text))
                );
              }

              if (!childToken) {
                // Direct appositive child attached to "son"/"daughter"
                childToken = tokens.find(t =>
                  t.dep === 'appos' &&
                  t.head === tok.i &&
                  (t.pos === 'PROPN' || /^[A-Z]/.test(t.text))
                );
              }
            }

            if (!childToken) {
              // Fallback: look left for nearest proper noun within a small window
              for (let j = tok.i - 1; j >= 0 && tok.i - j <= 3; j--) {
                const candidate = tokens[j];
                if (candidate.pos === 'PROPN' || /^[A-Z]/.test(candidate.text)) {
                  childToken = candidate;
                  break;
                }
              }
            }
          }

          if (parentCandidates.length && childToken) {
            if (childToken.pos === 'PRON' && lastNamedSubject) {
              childToken = lastNamedSubject;
            }
            updateLastNamedSubject(childToken);
            const childSpan = expandNP(childToken, tokens);


            for (const parentCandidate of parentCandidates) {
              const parentSpan = expandNP(parentCandidate, tokens);
              if (childSpan.start === parentSpan.start && childSpan.end === parentSpan.end) continue;

              const produced = tryCreateRelation(
                text, entities, spans, 'child_of',
                childSpan.start, childSpan.end, parentSpan.start, parentSpan.end, 'DEP',
                tokens, tok.i
              );
              addProducedRelations(produced, tok);
            }
          }
        }
      }

      const parentRoleNouns = new Set(['father', 'mother', 'dad', 'mom', 'parent', 'parents']);
      if (parentRoleNouns.has(lemma)) {
        const possessor = tokens.find(t => t.dep === 'poss' && t.head === tok.i);

        // Allow "X's father" or pronoun possessor
        let childSpan = possessor ? expandNP(possessor, tokens) : null;
        if (possessor && possessor.pos !== 'PRON') {
          updateLastNamedSubject(possessor);
        }

        const apposParents = tokens.filter(t => t.head === tok.i && (t.dep === 'appos' || (t.dep === 'compound' && isNameToken(t))));
        const parentCandidates = apposParents.length ? apposParents.flatMap(p => collectConjTokens(p, tokens)) : [];

        if (!childSpan) {
          const tokIndex = tokens.findIndex(t => t.i === tok.i);
          // fallback: look for preceding proper noun within 3 tokens
          for (let offset = 1; offset <= 3; offset++) {
            const idx = tokIndex - offset;
            if (idx < 0) break;
            const candidate = tokens[idx];
            if (isNameToken(candidate)) {
              const span = expandNP(candidate, tokens);
              if (span.start < tok.start) {
                if (!parentCandidates.length) {
                  // if no explicit parent, skip to avoid noise
                  break;
                }
                childSpan = span;
                break;
              }
            }
          }
        }

        if (childSpan && parentCandidates.length) {
          for (const parentCandidate of parentCandidates) {
            const parentSpan = expandNP(parentCandidate, tokens);
            if (parentSpan.start === childSpan.start && parentSpan.end === childSpan.end) continue;
            if (parentCandidate.pos !== 'PRON') {
              updateLastNamedSubject(parentCandidate);
            }
            const produced = tryCreateRelation(
              text, entities, spans, 'child_of',
              childSpan.start, childSpan.end, parentSpan.start, parentSpan.end, 'DEP',
              tokens, tok.i
            );
            addProducedRelations(produced, tok);
          }
        }
      }

      // Pattern 3: married_to
      if (lemma === 'marry' || textLower === 'married') {
        let subj: Token | undefined;
        let obj: Token | undefined;

        // Case 1: "married" as verb
        if (tok.pos === 'VERB' || tok.dep === 'ROOT') {
          // Look for subject (nsubj, nsubjpass for passive voice, or npadvmod)
          subj = tokens.find(t => (t.dep === 'nsubj' || t.dep === 'nsubjpass' || t.dep === 'npadvmod') && t.head === tok.i);

          // If subject is a relational noun (son, daughter, etc.), look for the proper noun attached to it
          // E.g., "Aragorn, son of Arathorn, married Arwen" -> son is nsubj, Aragorn is compound of son
          if (subj) {
            const RELATIONAL_NOUNS = new Set(['son', 'daughter', 'brother', 'sister', 'father', 'mother', 'wife', 'husband', 'child', 'heir', 'king', 'queen', 'prince', 'princess', 'lord', 'lady']);
            if (RELATIONAL_NOUNS.has(subj.text.toLowerCase())) {
              // Look for compound or appositive that points to this relational noun
              const propernoun = tokens.find(t => (t.dep === 'compound' || t.dep === 'appos') && t.head === subj!.i && t.pos === 'PROPN');
              if (propernoun) {
                subj = propernoun;
              }
            }
          }

          // Fallback: Check if subject points to an auxiliary verb that points to this verb
          // This handles "Meanwhile, Sarah and Marcus got married" where Sarah's head is "got" not "married"
          if (!subj) {
            const auxVerb = tokens.find(t => (t.dep === 'auxpass' || t.dep === 'aux') && t.head === tok.i);
            if (auxVerb) {
              subj = tokens.find(t => (t.dep === 'nsubj' || t.dep === 'nsubjpass' || t.dep === 'npadvmod') && t.head === auxVerb.i);
            }
          }

          obj = tokens.find(t => (t.dep === 'dobj' || t.dep === 'obj') && t.head === tok.i);

          // If object is a generic relationship word (girlfriend, wife, etc.), look for appositive
          // E.g., "married his girlfriend Emma Rodriguez" → girlfriend has appos=Emma Rodriguez
          if (obj) {
            const genericRelWords = ['girlfriend', 'boyfriend', 'wife', 'husband', 'partner', 'spouse'];
            if (genericRelWords.includes(obj.text.toLowerCase())) {
              const appos = tokens.find(t => t.dep === 'appos' && t.head === obj!.i);
              if (appos) {
                obj = appos; // Use the actual person name instead of the generic word
              }
            }
          }

          // Check for "married to X" pattern
          if (!obj) {
            const toPrep = tokens.find(t => t.dep === 'prep' && t.head === tok.i && t.text.toLowerCase() === 'to');
            if (toPrep) {
              obj = tokens.find(t => t.dep === 'pobj' && t.head === toPrep.i);
            }
          }

          // Special case: Intransitive "X and Y got married" (coordinate subjects)
          if (subj && !obj) {
            // Look for coordinated subject (conj dependency)
            const conjSubj = tokens.find(t => t.dep === 'conj' && t.head === subj!.i);
            if (conjSubj) {
              // Create symmetric married_to relation between the two subjects
              const produced = tryCreateRelation(
                text, entities, spans, 'married_to',
                subj!.start, subj!.end, conjSubj.start, conjSubj.end, 'DEP',
                tokens, tok.i
              );
              addProducedRelations(produced, tok);
            }
          }
        }
        // Case 2: "married" as adjective modifier (amod)
        else if (tok.dep === 'amod') {
          // "Aragorn, ..., married Arwen" -> married modifies Arwen (head)
          obj = tokens.find(t => t.i === tok.head);
          // Subject is the root or appositive head
          subj = tokens.find(t => t.dep === 'ROOT' || (t.dep === 'appos' && obj && t.i < obj.i));
        }

      if (subj && obj) {
        if (subj.pos === 'PRON' && lastNamedSubject) {
          subj = lastNamedSubject;
        }
        updateLastNamedSubject(subj);
        const produced = tryCreateRelation(
          text, entities, spans, 'married_to',
          subj.start, subj.end, obj.start, obj.end, 'DEP',
          tokens, tok.i
        );
        addProducedRelations(produced, tok);
      }
    }

      const childrenLemma = lemma === 'child' || textLower === 'children';
      if (childrenLemma) {
        const headVerb = tokens.find(t => t.i === tok.head);
        const verbLemma = headVerb?.lemma.toLowerCase();
        if (headVerb && ['include', 'includes', 'included', 'be', 'were', 'was', 'are', 'list', 'lists', 'listed'].includes(verbLemma || '')) {
          let parentTokens = tokens
            .filter(t => t.dep === 'poss' && t.head === tok.i)
            .flatMap(resolvePossessors);
          if (!parentTokens.length && lastNamedSubject) {
            parentTokens = [lastNamedSubject];
          }
          const parentRefs: EntityRef[] = [];
          for (const parentTok of parentTokens.flatMap(p => collectConjTokens(p, tokens))) {
            const parentSpan = expandNP(parentTok, tokens);
            const mapped = mapSurfaceToEntity(
              text.slice(parentSpan.start, parentSpan.end),
              entities,
              spans,
              parentSpan
            );
            if (mapped) {
              parentRefs.push(mapped);
            }
          }

          const childTokens: Token[] = [];
          if (['include', 'includes', 'included', 'list', 'lists', 'listed'].includes(verbLemma || '')) {
            const objects = tokens.filter(t => (t.dep === 'dobj' || t.dep === 'obj') && t.head === headVerb.i);
            for (const objTok of objects.length ? objects : [tokens.find(t => t.dep === 'pobj' && t.head === headVerb.i)].filter(Boolean) as Token[]) {
              childTokens.push(...collectConjTokens(objTok, tokens));
            }
          } else if (['be', 'was', 'were', 'are'].includes(verbLemma || '')) {
            const attrs = tokens.filter(t => (t.dep === 'attr' || t.dep === 'acomp') && t.head === headVerb.i);
            for (const attrTok of attrs) {
              childTokens.push(...collectConjTokens(attrTok, tokens));
            }
          }

          const childRefs: EntityRef[] = [];
          for (const childTok of childTokens) {
            if (!isNameToken(childTok) && childTok.pos !== 'PROPN') continue;
            const childSpan = expandNP(childTok, tokens);
            const mapped = mapSurfaceToEntity(
              text.slice(childSpan.start, childSpan.end),
              entities,
              spans,
              childSpan
            );
            if (mapped) {
              childRefs.push(mapped);
            }
          }

          if (parentRefs.length && childRefs.length) {
            for (const parent of parentRefs) {
              for (const child of childRefs) {
                if (parent.entity.id === child.entity.id) continue;
                const childRel = tryCreateRelation(
                  text, entities, spans, 'child_of',
                  child.span!.start, child.span!.end,
                  parent.span!.start, parent.span!.end,
                  'DEP',
                  tokens, tok.i
                );
                addProducedRelations(childRel, headVerb);
                const parentRel = tryCreateRelation(
                  text, entities, spans, 'parent_of',
                  parent.span!.start, parent.span!.end,
                  child.span!.start, child.span!.end,
                  'DEP',
                  tokens, tok.i
                );
                addProducedRelations(parentRel, headVerb);
              }
            }
          }
        }
      }

      // Pattern 4: Employment relations (works at, employed by, joined)
      const workVerbs = ['work', 'works', 'worked', 'working', 'employ', 'employed', 'join', 'joined', 'joins', 'joining', 'hire', 'hired', 'recruit', 'recruited'];
      if (workVerbs.includes(lemma) || workVerbs.includes(textLower)) {
        let subjTok = resolveSubjectToken(tok, tokens);

        // Fallback: If work is xcomp (clausal complement), get subject from parent verb
        // E.g., "She moved to SF to work at Google" - "She" is subject of "moved", not "work"
        if (!subjTok && tok.dep === 'xcomp') {
          const parentVerb = tokens.find(t => t.i === tok.head);
          if (parentVerb) {
            subjTok = resolveSubjectToken(parentVerb, tokens);
          }
        }

        // Check for "at" or "for" preposition (works at X, works for X)
        const atPrep = tokens.find(t => t.dep === 'prep' && t.head === tok.i && (t.text.toLowerCase() === 'at' || t.text.toLowerCase() === 'for'));

        if (subjTok && atPrep) {
          const orgTok = tokens.find(t => t.dep === 'pobj' && t.head === atPrep.i);
          if (orgTok) {
            const subjSpan = expandNP(subjTok, tokens);
            const orgSpan = expandNP(orgTok, tokens);

            const produced = tryCreateRelation(
              text, entities, spans, 'member_of',
              subjSpan.start, subjSpan.end, orgSpan.start, orgSpan.end, 'DEP',
              tokens, tok.i
            );
            addProducedRelations(produced, tok);
          }
        }

        // Handle "hired X", "recruited X" - object becomes employee
        if (lemma === 'hire' || lemma === 'recruit' || textLower === 'hired' || textLower === 'recruited') {
          const objTok = tokens.find(t => (t.dep === 'dobj' || t.dep === 'obj') && t.head === tok.i);
          if (objTok && subjTok) {
            // Subject is the company, object is the person
            const personSpan = expandNP(objTok, tokens);
            const orgSpan = expandNP(subjTok, tokens);

            const produced = tryCreateRelation(
              text, entities, spans, 'member_of',
              personSpan.start, personSpan.end, orgSpan.start, orgSpan.end, 'DEP',
              tokens, tok.i
            );
            addProducedRelations(produced, tok);
          }
        }
      }

      // Pattern 5: Founded/leads relations (founded X, created X, established X)
      const foundVerbs = [
        'found', 'founded', 'founding',
        'create', 'created', 'creating',
        'establish', 'established', 'establishing',
        'start', 'started', 'starting',
        'launch', 'launched', 'launching',
        'co-found', 'co-founded', 'co-founding',
        'form', 'formed', 'forming',
        'build', 'built', 'building'
      ];
      if (foundVerbs.includes(lemma) || foundVerbs.includes(textLower) || textLower === 'co-founder') {
        // Active voice: "X founded Y"
        const subjTok = resolveSubjectToken(tok, tokens);
        let objTok = tokens.find(t => (t.dep === 'dobj' || t.dep === 'obj') && t.head === tok.i);
        const copula = tokens.find(t =>
          t.i === tok.head &&
          ['be', 'was', 'were', 'is', 'become', 'became'].includes(t.lemma.toLowerCase())
        );

        // Handle "co-founder of X" pattern
        if (textLower === 'co-founder' || textLower.startsWith('co-found')) {
          const ofPrep = tokens.find(t =>
            t.dep === 'prep' &&
            (t.head === tok.i || t.head === copula?.i) &&
            t.text.toLowerCase() === 'of'
          );
          if (ofPrep) {
            const orgTok = tokens.find(t => t.dep === 'pobj' && t.head === ofPrep.i);
            if (orgTok) {
              objTok = orgTok;
            }
          }
        }

        if (subjTok && objTok) {
          const subjSpan = expandNP(subjTok, tokens);
          const objSpan = expandNP(objTok, tokens);

          const produced = tryCreateRelation(
            text, entities, spans, 'leads',
            subjSpan.start, subjSpan.end, objSpan.start, objSpan.end, 'DEP',
            tokens, tok.i
          );
          addProducedRelations(produced, tok);
        }

        // Passive voice: "X was founded by Y" or "X founded by Y"
        // Look for "by" preposition attached to this verb
        const byPrep = tokens.find(t =>
          t.dep === 'agent' && t.head === tok.i && t.text.toLowerCase() === 'by'
        );
        if (byPrep) {
          const founderTok = tokens.find(t => t.dep === 'pobj' && t.head === byPrep.i);
          if (founderTok) {
            // In passive voice, the subject is the organization
            const orgTok = resolveSubjectToken(tok, tokens);
            if (orgTok) {
              const founderSpan = expandNP(founderTok, tokens);
              const orgSpan = expandNP(orgTok, tokens);

              const produced = tryCreateRelation(
                text, entities, spans, 'leads',
                founderSpan.start, founderSpan.end, orgSpan.start, orgSpan.end, 'DEP',
                tokens, tok.i
              );
              addProducedRelations(produced, tok);
            }
          }
        }
      }

      // Pattern 6: traveled_to (motion verbs + "to")
      const motionVerbs = ['travel', 'go', 'journey', 'come', 'ride', 'sail', 'fly', 'walk'];
      const motionPastTense = ['went', 'traveled', 'journeyed', 'came', 'rode', 'sailed', 'flew', 'walked'];

      if (motionVerbs.includes(lemma) || motionPastTense.includes(textLower)) {
        const subjTok = resolveSubjectToken(tok, tokens);
        const toPrep = tokens.find(t => t.dep === 'prep' && t.head === tok.i && t.text.toLowerCase() === 'to');

        if (subjTok && toPrep) {
          // DEBUG
          // console.log('travel pattern', subjTok.text, lemma, '->', tokens.find(t => t.dep === 'pobj' && t.head === toPrep.i)?.text);
          const destTok = tokens.find(t => t.dep === 'pobj' && t.head === toPrep.i);
          if (destTok) {
            // Expand to full NP spans
            const destSpan = expandNP(destTok, tokens);
            const destSurface = text.slice(destSpan.start, destSpan.end);
            const destRef = mapSurfaceToEntity(destSurface, entities, spans, destSpan);
            if (isDescriptorEntity(destRef?.entity)) {
              continue;
            }
            const subjCandidates = collectConjTokens(subjTok, tokens);
            for (const subjectCandidate of subjCandidates) {
              const subjSpan = trimAppositiveSpan(subjectCandidate, expandNP(subjectCandidate, tokens), tokens);
              const candidateSurface = text.slice(subjSpan.start, subjSpan.end);
              const subjRef = mapSurfaceToEntity(candidateSurface, entities, spans, subjSpan);
              if (isDescriptorEntity(subjRef?.entity)) continue;
              const produced = tryCreateRelation(
                text, entities, spans, 'traveled_to',
                subjSpan.start, subjSpan.end, destSpan.start, destSpan.end, 'DEP',
                tokens, tok.i
              );
              addProducedRelations(produced, tok);
            }
          }
        }
      }

      // Pattern 5: studies_at
      const studyVerbs = ['study', 'studies', 'studied', 'studying'];
      if (studyVerbs.includes(lemma) || studyVerbs.includes(textLower)) {
        const subjTok = resolveSubjectToken(tok, tokens);
        const atPrep = tokens.find(t => t.dep === 'prep' && t.head === tok.i && t.text.toLowerCase() === 'at');

        if (subjTok && atPrep) {
          const placeTok = tokens.find(t => t.dep === 'pobj' && t.head === atPrep.i);
          if (placeTok) {
            const placeSpan = expandNP(placeTok, tokens);
            const subjCandidates = collectConjTokens(subjTok, tokens);
            for (const subjectCandidate of subjCandidates) {
              const subjSpan = expandNP(subjectCandidate, tokens);
              const produced = tryCreateRelation(
                text, entities, spans, 'studies_at',
                subjSpan.start, subjSpan.end, placeSpan.start, placeSpan.end, 'DEP',
                tokens, tok.i
              );
              addProducedRelations(produced, tok);
            }
          }
        }
      }

      const attendVerbs = ['attend', 'attended', 'attends', 'attending'];
      if (attendVerbs.includes(lemma) || attendVerbs.includes(textLower)) {
        const subjTok = resolveSubjectToken(tok, tokens);
        const atPrep = tokens.find(t =>
          t.dep === 'prep' &&
          t.head === tok.i &&
          (t.text.toLowerCase() === 'at' || t.text.toLowerCase() === 'in')
        );

        if (subjTok && atPrep) {
          const placeTok = tokens.find(t => t.dep === 'pobj' && t.head === atPrep.i);
          if (placeTok) {
            const placeSpan = expandNP(placeTok, tokens);
            const subjCandidates = collectConjTokens(subjTok, tokens);
            for (const subjectCandidate of subjCandidates) {
              const subjSpan = expandNP(subjectCandidate, tokens);
              const produced = tryCreateRelation(
                text, entities, spans, 'attended',
                subjSpan.start, subjSpan.end, placeSpan.start, placeSpan.end, 'DEP',
                tokens, tok.i
              );
              addProducedRelations(produced, tok);
            }
          }
        }
      }

      // Pattern: graduated_from (education completion)
      const graduateVerbs = ['graduate', 'graduated', 'graduates', 'graduating'];
      if (graduateVerbs.includes(lemma) || graduateVerbs.includes(textLower)) {
        const subjTok = resolveSubjectToken(tok, tokens);
        const fromPrep = tokens.find(t =>
          t.dep === 'prep' &&
          t.head === tok.i &&
          t.text.toLowerCase() === 'from'
        );

        if (subjTok && fromPrep) {
          const schoolTok = tokens.find(t => t.dep === 'pobj' && t.head === fromPrep.i);
          if (schoolTok) {
            const schoolSpan = expandNP(schoolTok, tokens);
            const subjCandidates = collectConjTokens(subjTok, tokens);
            for (const subjectCandidate of subjCandidates) {
              const subjSpan = expandNP(subjectCandidate, tokens);
              const produced = tryCreateRelation(
                text, entities, spans, 'attended',
                subjSpan.start, subjSpan.end, schoolSpan.start, schoolSpan.end, 'DEP',
                tokens, tok.i
              );
              addProducedRelations(produced, tok);
            }
          }
        }
      }

      // Pattern 6: teaches_at
      const teachVerbs = ['teach', 'teaches', 'taught', 'teaching'];
      if (teachVerbs.includes(lemma) || teachVerbs.includes(textLower)) {
        const subjTok = resolveSubjectToken(tok, tokens);
        const atPrep = tokens.find(t => t.dep === 'prep' && t.head === tok.i && t.text.toLowerCase() === 'at');

        if (subjTok && atPrep) {
          const placeTok = tokens.find(t => t.dep === 'pobj' && t.head === atPrep.i);
          if (placeTok) {
            const placeSpan = expandNP(placeTok, tokens);
            const subjCandidates = collectConjTokens(subjTok, tokens);
            for (const subjectCandidate of subjCandidates) {
              const resolvedSubject = resolveAcademicSubject(subjectCandidate, tokens);
              if (!resolvedSubject) continue;
              if (resolvedSubject.pos !== 'PRON') {
                updateLastNamedSubject(resolvedSubject);
              }
              const subjSpan = expandNP(resolvedSubject, tokens);
              const produced = tryCreateRelation(
                text, entities, spans, 'teaches_at',
                subjSpan.start, subjSpan.end, placeSpan.start, placeSpan.end, 'DEP',
                tokens, tok.i
              );
              addProducedRelations(produced, tok);
            }
          }
        }
      }

      // Pattern 7: advised_by / mentored_by relations
      const advisorVerbs = ['advise', 'advised', 'advising', 'mentor', 'mentored', 'mentoring', 'guide', 'guided', 'guiding'];
      const advisorNouns = ['advisor', 'adviser', 'mentor', 'counselor', 'guide'];

      if (advisorVerbs.includes(lemma) || advisorVerbs.includes(textLower)) {
        // "X advised Y" -> Y advised_by X
        const subjTok = resolveSubjectToken(tok, tokens);
        const objTok = tokens.find(t => (t.dep === 'dobj' || t.dep === 'obj') && t.head === tok.i);

        if (subjTok && objTok) {
          const subjSpan = expandNP(subjTok, tokens);
          const objSpan = expandNP(objTok, tokens);

          const produced = tryCreateRelation(
            text, entities, spans, 'advised_by',
            objSpan.start, objSpan.end, subjSpan.start, subjSpan.end, 'DEP',
            tokens, tok.i
          );
          addProducedRelations(produced, tok);
        }
      }

      // Handle "advisor to X", "technical advisor", etc.
      if (advisorNouns.includes(textLower)) {
        // Look for "to" preposition: "advisor to X"
        const toPrep = tokens.find(t => t.dep === 'prep' && t.head === tok.i && t.text.toLowerCase() === 'to');
        if (toPrep) {
          const adviseeTok = tokens.find(t => t.dep === 'pobj' && t.head === toPrep.i);
          if (adviseeTok) {
            // Find the advisor (subject or modifier of "advisor")
            let advisorTok = resolveSubjectToken(tok, tokens);
            if (!advisorTok) {
              // Try finding possessive: "X's advisor"
              advisorTok = tokens.find(t => t.dep === 'poss' && t.head === tok.i);
            }

            if (advisorTok) {
              const advisorSpan = expandNP(advisorTok, tokens);
              const adviseeSpan = expandNP(adviseeTok, tokens);

              const produced = tryCreateRelation(
                text, entities, spans, 'advised_by',
                adviseeSpan.start, adviseeSpan.end, advisorSpan.start, advisorSpan.end, 'DEP',
                tokens, tok.i
              );
              addProducedRelations(produced, tok);
            }
          }
        }
      }

      // Pattern 8: invested_in relations
      const investVerbs = ['invest', 'invested', 'investing'];
      if (investVerbs.includes(lemma) || investVerbs.includes(textLower)) {
        const subjTok = resolveSubjectToken(tok, tokens);

        // "X invested in Y"
        const inPrep = tokens.find(t => t.dep === 'prep' && t.head === tok.i && t.text.toLowerCase() === 'in');
        if (subjTok && inPrep) {
          const objTok = tokens.find(t => t.dep === 'pobj' && t.head === inPrep.i);
          if (objTok) {
            const subjSpan = expandNP(subjTok, tokens);
            const objSpan = expandNP(objTok, tokens);

            const produced = tryCreateRelation(
              text, entities, spans, 'invested_in',
              subjSpan.start, subjSpan.end, objSpan.start, objSpan.end, 'DEP',
              tokens, tok.i
            );
            addProducedRelations(produced, tok);
          }
        }
      }

      // "led the round" pattern for investments
      if ((lemma === 'lead' || textLower === 'led') && textLower !== 'leader') {
        const roundObj = tokens.find(t =>
          (t.dep === 'dobj' || t.dep === 'obj') &&
          t.head === tok.i &&
          (t.text.toLowerCase().includes('round') || t.text.toLowerCase().includes('investment'))
        );

        if (roundObj) {
          const subjTok = resolveSubjectToken(tok, tokens);
          // Look for the company being invested in - often in context
          // This is a complex pattern, may need more work
          if (subjTok) {
            // For now, just mark that we found the pattern
            // Full implementation would need more context analysis
          }
        }
      }

      // Pattern 9: rules/leads ("became king", "was king", "ruled")
      const ruleVerbs = ['rule', 'ruled', 'lead', 'led', 'reign', 'reigned'];
      const kingNouns = ['king', 'queen', 'ruler', 'leader', 'chief'];

      if (ruleVerbs.includes(lemma) || ruleVerbs.includes(textLower)) {
        const subj = tokens.find(t => t.dep === 'nsubj' && t.head === tok.i);
        const obj = tokens.find(t => (t.dep === 'dobj' || t.dep === 'obj') && t.head === tok.i);

        if (subj && obj) {
          const produced = tryCreateRelation(
            text, entities, spans, 'rules',
            subj.start, subj.end, obj.start, obj.end, 'DEP',
            tokens, tok.i
          );
          addProducedRelations(produced, tok);
        }

        // Also check "ruled over X" or "ruled in X"
        const overPrep = tokens.find(t => t.dep === 'prep' && t.head === tok.i &&
          (t.text.toLowerCase() === 'over' || t.text.toLowerCase() === 'in'));
        if (subj && overPrep) {
          const place = tokens.find(t => t.dep === 'pobj' && t.head === overPrep.i);
          if (place) {
            const produced = tryCreateRelation(
              text, entities, spans, 'rules',
              subj.start, subj.end, place.start, place.end, 'DEP',
              tokens, tok.i
            );
            addProducedRelations(produced, tok);
          }
        }
      }

      // "X became king of Y" or "X was king"
      if (kingNouns.includes(lemma) || kingNouns.includes(textLower)) {
        // Look for copula (was, became)
        const copula = tokens.find(t => t.i === tok.head && ['become', 'be', 'was', 'became'].includes(t.lemma.toLowerCase()));
        if (copula) {
          const subj = tokens.find(t => t.dep === 'nsubj' && t.head === copula.i);
          const ofPrep = tokens.find(t => t.dep === 'prep' && t.head === tok.i && t.text.toLowerCase() === 'of');

          if (subj && ofPrep) {
            const place = tokens.find(t => t.dep === 'pobj' && t.head === ofPrep.i);
            if (place) {
              const produced = tryCreateRelation(
                text, entities, spans, 'rules',
                subj.start, subj.end, place.start, place.end, 'DEP',
                tokens, tok.i
              );
              addProducedRelations(produced, tok);
            }
          }
        }
      }

      const leadershipTitles = ['head', 'headmaster', 'headmistress', 'director', 'dean', 'chair', 'warden'];
      if (leadershipTitles.includes(lemma) || leadershipTitles.includes(textLower)) {
        const copula = tokens.find(t =>
          t.i === tok.head &&
          ['become', 'be', 'was', 'were', 'is', 'became'].includes(t.lemma.toLowerCase())
        );
        if (copula) {
          const resolvedSubj = resolveAcademicSubject(
            tokens.find(t => t.dep === 'nsubj' && t.head === copula.i),
            tokens
          );
          if (!resolvedSubj) {
            continue;
          }
          if (resolvedSubj.pos !== 'PRON') {
            updateLastNamedSubject(resolvedSubj);
          }
          if (resolvedSubj) {
            const ofPrep = tokens.find(t =>
              t.dep === 'prep' &&
              (t.head === tok.i || t.head === copula.i) &&
              t.text.toLowerCase() === 'of'
            );
            let orgTok = ofPrep ? tokens.find(t => t.dep === 'pobj' && t.head === ofPrep.i) : undefined;
            if (!orgTok) {
              orgTok = lastSchoolOrg ?? lastNamedOrg ?? undefined;
            }
            if (orgTok) {
              const subjSpan = expandNP(resolvedSubj, tokens);
              const orgHead = chooseSemanticHead(orgTok, tokens);
              const orgSpan = expandNP(orgHead, tokens);
              const produced = tryCreateRelation(
                text, entities, spans, 'leads',
                subjSpan.start, subjSpan.end, orgSpan.start, orgSpan.end, 'DEP',
                tokens, tok.i
              );
              addProducedRelations(produced, tok);

              const subjRef = mapSurfaceToEntity(
                text.slice(subjSpan.start, subjSpan.end),
                entities,
                spans,
                subjSpan
              );
              const isProfessor = !!subjRef && subjRef.entity.canonical.toLowerCase().includes('professor');
              if (isProfessor && lastSchoolOrg) {
                const schoolSpan = expandNP(lastSchoolOrg, tokens);
                const teachingRelations = tryCreateRelation(
                  text, entities, spans, 'teaches_at',
                  subjSpan.start, subjSpan.end,
                  schoolSpan.start, schoolSpan.end,
                  'DEP',
                  tokens, tok.i
                );
                addProducedRelations(teachingRelations, tok);
              }
            }
          }
        }
      }

      // Pattern 8.5: Coordinated PERSON subjects forming a group (e.g., "Harry, Ron, and Hermione formed a trio")
      if (lemma === 'form' && (tok.pos === 'VERB' || tok.dep === 'ROOT')) {
        const subjects = tokens.filter(t => t.dep === 'nsubj' && t.head === tok.i);
        const dobj = tokens.find(t => (t.dep === 'dobj' || t.dep === 'obj') && t.head === tok.i);

        if (subjects.length > 0 && dobj) {
          // Collect all coordinated subjects
          const allSubjects: Token[] = [];
          for (const subj of subjects) {
            allSubjects.push(subj);
            // Add conj children
            allSubjects.push(...collectConjTokens(subj, tokens));
          }

          // Filter to only PERSON entities and map to EntityRefs
          const personSubjects: EntityRef[] = [];
          for (const subjTok of allSubjects) {
            const subjSpan = expandNP(subjTok, tokens);
            const subjRef = mapSurfaceToEntity(
              text.slice(subjSpan.start, subjSpan.end),
              entities,
              spans,
              subjSpan
            );
            if (subjRef && subjRef.entity.type === 'PERSON') {
              personSubjects.push(subjRef);
            }
          }

          // Create pairwise friends_with relations (both directions for symmetry)
          if (personSubjects.length >= 2) {
            for (let i = 0; i < personSubjects.length; i++) {
              for (let j = i + 1; j < personSubjects.length; j++) {
                const subjRef = personSubjects[i];
                const objRef = personSubjects[j];

                // Create forward relation
                const forwardProduced = tryCreateRelation(
                  text, entities, spans, 'friends_with',
                  subjRef.span!.start, subjRef.span!.end,
                  objRef.span!.start, objRef.span!.end,
                  'DEP',
                  tokens, tok.i
                );
                addProducedRelations(forwardProduced, tok);

                // Create inverse relation (friends_with is symmetric)
                const inverseProduced = tryCreateRelation(
                  text, entities, spans, 'friends_with',
                  objRef.span!.start, objRef.span!.end,
                  subjRef.span!.start, subjRef.span!.end,
                  'DEP',
                  tokens, tok.i
                );
                addProducedRelations(inverseProduced, tok);
              }
            }
          }
        }
      }

      // Pattern 9: friends_with ("was friends with", "friends with")
      if (lemma === 'friend' || textLower === 'friends') {
        const uniqueTokensByStart = (items: Token[]): Token[] => {
          const map = new Map<number, Token>();
          for (const item of items) {
            if (!item) continue;
            if (!map.has(item.start)) {
              map.set(item.start, item);
            }
          }
          return Array.from(map.values());
        };

        const resolveToken = (token: Token | undefined | null): Token | null => {
          if (!token) return null;
          if (token.pos === 'PRON') {
            const lower = token.text.toLowerCase();
            if (recentPersons.length) {
              return recentPersons[0];
            }
            if (lower === 'they' && lastNamedSubject) {
              return lastNamedSubject;
            }
            return lastNamedSubject ?? null;
          }
          return token;
        };

        const descriptorPattern = /\b(girl|boy|woman|man|student|friend|friends|child|children|trio|duo|pair|couple|ally|allies|wizard|witch|companion|companions|group|team|crew|squad|siblings|brothers|sisters)\b/i;
        const descriptorEntityPattern = /\b(?:friend|friends|trio|pair|couple|group|team|crew|squad|quest|mission|journey|adventure|travel|voyage)\b/i;
        const descriptorNumberHints: Record<string, number> = {
          both: 2,
          couple: 2,
          pair: 2,
          duo: 2,
          two: 2,
          three: 3,
          trio: 3,
          four: 4,
          five: 5,
          six: 6
        };

        const expandGroupWithPronouns = (group: Token[]): Token[] => {
          const expanded: Token[] = [];
          for (const tok of group) {
            if (tok.pos === 'PRON') {
              const lower = tok.text.toLowerCase();
              if ((lower === 'they' || lower === 'them') && recentPersons.length) {
                const limit = Math.min(3, recentPersons.length);
                expanded.push(...recentPersons.slice(0, limit));
                continue;
              }
              if ((lower === 'she' || lower === 'her' || lower === 'he' || lower === 'him') && recentPersons.length) {
                expanded.push(recentPersons[0]);
                continue;
              }
              if (lastNamedSubject) {
                expanded.push(lastNamedSubject);
                continue;
              }
            }
            expanded.push(tok);
          }
          return expanded;
        };

        const descriptorLimitFromSurface = (surfaceLower: string): number => {
          for (const [hint, value] of Object.entries(descriptorNumberHints)) {
            if (surfaceLower.includes(hint)) {
              return value;
            }
          }
          if (/\b(trio|triad)\b/.test(surfaceLower)) return 3;
          if (/\b(pair|duo|couple)\b/.test(surfaceLower)) return 2;
          if (/\b(friends|children|companions|allies|siblings|group|team|crew|squad)\b/.test(surfaceLower)) {
            return 3;
          }
          return 1;
        };

        const mapRecentTokenToEntity = (token: Token): EntityRef | null => {
          const candidateIds = getEntityCandidatesByOffset(spans, token.start, token.end);
          for (const candidateId of candidateIds) {
            const entity = getEntityById(candidateId);
            if (entity && entity.type === 'PERSON') {
              const matchedSpan = selectEntitySpan(entity.id, spans, { start: token.start, end: token.end });
              return { entity, span: matchedSpan ?? null };
            }
          }
          return mapSurfaceToEntity(
            text.slice(token.start, token.end),
            entities,
            spans,
            { start: token.start, end: token.end }
          );
        };

        const resolveDescriptorRefs = (
          surface: string,
          descriptorSpan?: { start: number; end: number },
          options: { avoidIds?: Set<string>; limit?: number } = {}
        ): EntityRef[] => {
          if (!descriptorPattern.test(surface)) return [];
          const lowerSurface = surface.toLowerCase();
          const desired = options.limit ?? descriptorLimitFromSurface(lowerSurface);
          const available = Math.max(1, Math.min(desired, recentPersons.length || desired));
          const resolved: EntityRef[] = [];
          const seen = new Set<string>();


          for (const recent of recentPersons) {
            const ref = mapRecentTokenToEntity(recent);
            if (
              ref &&
              ref.entity.type === 'PERSON' &&
              !seen.has(ref.entity.id) &&
              !options.avoidIds?.has(ref.entity.id)
            ) {
              const canonicalLower = ref.entity.canonical.toLowerCase();
              if (descriptorEntityPattern.test(canonicalLower)) {
                continue;
              }
              seen.add(ref.entity.id);
              resolved.push(ref);
              if (resolved.length >= available) {
                break;
              }
            }
          }

          if (!resolved.length && lastNamedSubject) {
            const fallback = mapRecentTokenToEntity(lastNamedSubject);
            if (
              fallback &&
              fallback.entity.type === 'PERSON' &&
              !options.avoidIds?.has(fallback.entity.id)
            ) {
              const canonicalLower = fallback.entity.canonical.toLowerCase();
              if (!descriptorEntityPattern.test(canonicalLower)) {
                resolved.push(fallback);
              }
            }
          }

          if (!resolved.length && descriptorSpan) {
            let closestDistance = Infinity;
            const nearest: EntityRef[] = [];
          for (const span of spans) {
            if (span.end > descriptorSpan.start) continue;
            const entity = entityById.get(span.entity_id);
            if (!entity || entity.type !== 'PERSON') continue;
            if (options.avoidIds?.has(entity.id)) continue;
            const distance = descriptorSpan.start - span.end;
            if (distance > 200) continue;
            if (descriptorEntityPattern.test(entity.canonical.toLowerCase())) continue;
            if (distance < closestDistance) {
                closestDistance = distance;
                nearest.length = 0;
                nearest.push({ entity, span });
              } else if (distance === closestDistance) {
                nearest.push({ entity, span });
              }
            }
            if (nearest.length) {
              const limit = Math.max(1, options.limit ?? descriptorLimitFromSurface(lowerSurface));
              for (const ref of nearest) {
                resolved.push(ref);
                if (resolved.length >= limit) break;
              }
            }
          }

          if (resolved.length && L3_DEBUG) {
            console.log(`[FRIENDS-DESCRIPTOR] "${surface.trim()}" -> ${resolved.map(r => r.entity.canonical).join(', ')}`);
          }
          return resolved;
        };

        const mapTokenToRefs = (token: Token): EntityRef[] => {
          const refs: EntityRef[] = [];
          const seen = new Set<string>();
          const pushRef = (ref: EntityRef | null) => {
            if (!ref) return;
            if (seen.has(ref.entity.id)) return;
            seen.add(ref.entity.id);
            refs.push(ref);
          };

          const span = expandNP(token, tokens);
          const surface = text.slice(span.start, span.end);
          const treatAsName = token.pos === 'PROPN' || isNameToken(token);

          if (treatAsName) {
            updateLastNamedSubject(token);
            pushRef(mapSurfaceToEntity(surface, entities, spans, span));
          }

          if (!refs.length && treatAsName && lastNamedSubject) {
            const fallbackSpan = expandNP(lastNamedSubject, tokens);
            pushRef(
              mapSurfaceToEntity(
                text.slice(fallbackSpan.start, fallbackSpan.end),
                entities,
                spans,
                fallbackSpan
              )
            );
          }

          if (!refs.length) {
            resolveDescriptorRefs(surface, span).forEach(pushRef);
          }

          return refs;
        };

        const resolveGroupRefs = (tokenGroup: Token[]): EntityRef[] => {
          const expanded = expandGroupWithPronouns(tokenGroup);
          const resolvedTokens = uniqueTokensByStart(expanded.map(resolveToken).filter(Boolean) as Token[]);
          const refs: EntityRef[] = [];
          const seen = new Set<string>();

          for (const tok of resolvedTokens) {
            const mapped = mapTokenToRefs(tok);
            for (const ref of mapped) {
              if (seen.has(ref.entity.id)) continue;
              seen.add(ref.entity.id);
              refs.push(ref);
            }
          }

          return refs;
        };

        const emitFriends = (subjectTokens: Token[], objectTokens: Token[]) => {
          const subjectRefs = resolveGroupRefs(subjectTokens);
          const objectRefs = resolveGroupRefs(objectTokens);
          if (!subjectRefs.length || !objectRefs.length) return;

          const seenPairs = new Set<string>();
          for (const subjRef of subjectRefs) {
            for (const objRef of objectRefs) {
              if (subjRef.entity.id === objRef.entity.id) continue;
              const key = `${subjRef.entity.id}::${objRef.entity.id}`;
              if (seenPairs.has(key)) continue;
              seenPairs.add(key);
              emitCandidate('friends_with', subjRef, objRef, tok);
            }
          }
        };

        const emitFriendPairsWithin = (tokensList: Token[]) => {
          const refs = resolveGroupRefs(tokensList);
          if (refs.length < 2) return;
          for (let i = 0; i < refs.length; i++) {
            for (let j = i + 1; j < refs.length; j++) {
              emitCandidate('friends_with', refs[i], refs[j], tok);
            }
          }
        };

        const copula = tokens.find(t => t.i === tok.head && ['be', 'was', 'were'].includes(t.lemma.toLowerCase()));
        let baseSubject: Token | undefined;
        if (copula) {
          baseSubject = tokens.find(t => t.dep === 'nsubj' && t.head === copula.i);
        } else {
          baseSubject = tokens.find(t => t.dep === 'nsubj' && t.head === tok.head) || tokens.find(t => t.i === tok.head);
        }

        const subjectGroup = baseSubject
          ? collectConjTokens(baseSubject, tokens)
          : (lastNamedSubject ? [lastNamedSubject] : []);
        if (baseSubject && baseSubject.pos === 'PRON' && lastNamedSubject) {
          subjectGroup.unshift(lastNamedSubject);
        }

        const findWithPrep = (): Token | undefined => {
          const direct = tokens.find(t => t.dep === 'prep' && t.head === tok.i && t.text.toLowerCase() === 'with');
          if (direct) return direct;
          const headTok = tokens.find(t => t.i === tok.head);
          if (!headTok) return undefined;
          return tokens.find(t => t.dep === 'prep' && t.head === headTok.i && t.text.toLowerCase() === 'with');
        };

        const withPrep = findWithPrep();
        if (withPrep) {
          const friend = tokens.find(t => t.dep === 'pobj' && t.head === withPrep.i);
          if (friend) {
            const friendGroup = collectConjTokens(friend, tokens);
            emitFriends(subjectGroup, friendGroup);
          }
        }

        const possTokens = tokens.filter(t => t.dep === 'poss' && t.head === tok.i && (isNameToken(t) || t.pos === 'PRON'));
        if (possTokens.length && copula) {
          const attrTokens = tokens
            .filter(t => (t.dep === 'attr' || t.dep === 'acomp') && t.head === copula.i && (isNameToken(t) || t.pos === 'PRON'))
            .flatMap(a => collectConjTokens(a, tokens));
          emitFriends(possTokens, attrTokens);
        }

        if (!withPrep && !possTokens.length) {
          emitFriendPairsWithin(subjectGroup);
        }
      }

      if (lemma === 'student') {
        const atPrep = tokens.find(t => t.dep === 'prep' && t.head === tok.i && t.text.toLowerCase() === 'at');
        const copula = tokens.find(t => t.i === tok.head && ['be', 'was', 'were', 'is'].includes(t.lemma.toLowerCase()));
        const placeTok = atPrep ? tokens.find(t => t.dep === 'pobj' && t.head === atPrep.i) : undefined;
        if (placeTok && copula) {
          const subjects = tokens.filter(t => t.dep === 'nsubj' && t.head === copula.i);
          const placeSpan = expandNP(placeTok, tokens);
          for (const subj of subjects.flatMap(s => collectConjTokens(s, tokens))) {
            const resolvedSubj = subj.pos === 'PRON' && lastNamedSubject ? lastNamedSubject : subj;
            updateLastNamedSubject(resolvedSubj);
            const subjSpan = expandNP(resolvedSubj, tokens);
            const produced = tryCreateRelation(
              text, entities, spans, 'studies_at',
              subjSpan.start, subjSpan.end, placeSpan.start, placeSpan.end, 'DEP',
              tokens, tok.i
            );
            addProducedRelations(produced, tok);
          }
        }
      }

      if (lemma === 'start') {
        const atPrep = tokens.find(t => t.dep === 'prep' && t.head === tok.i && (t.text.toLowerCase() === 'at' || t.text.toLowerCase() === 'in'));
        const placeTok = atPrep ? tokens.find(t => t.dep === 'pobj' && t.head === atPrep.i) : undefined;
        const subjects = tokens.filter(t => t.dep === 'nsubj' && t.head === tok.i);
        if (placeTok && subjects.length) {
          const placeSpan = expandNP(placeTok, tokens);
          for (const subj of subjects.flatMap(s => collectConjTokens(s, tokens))) {
            const resolvedSubj = subj.pos === 'PRON' && lastNamedSubject ? lastNamedSubject : subj;
            updateLastNamedSubject(resolvedSubj);
            const subjSpan = expandNP(resolvedSubj, tokens);
            const produced = tryCreateRelation(
              text, entities, spans, 'studies_at',
              subjSpan.start, subjSpan.end, placeSpan.start, placeSpan.end, 'DEP',
              tokens, tok.i
            );
            addProducedRelations(produced, tok);
          }
        }
      }

      const livingVerbs = new Set(['live', 'lived', 'reside', 'resided', 'dwell', 'dwelt']);
      if (livingVerbs.has(lemma) || livingVerbs.has(textLower)) {
        const relativeMarker = tokens.find(t =>
          t.text.toLowerCase() === 'where' &&
          t.start >= sent.start &&
          t.start <= tok.start
        );
        let subjTok = resolveSubjectToken(tok, tokens);
        if (subjTok && subjTok.pos === 'PRON') {
          if (lastNamedSubject) {
            subjTok = lastNamedSubject;
          } else if (sent.sentence_index > 0) {
            const prevSentence = sentences[sent.sentence_index - 1];
            const prevSubject = [...prevSentence.tokens].reverse().find(t => t.dep === 'nsubj' && isNameToken(t));
            if (prevSubject) {
              subjTok = prevSubject;
            }
          }
        }
        if (!subjTok && relativeMarker) {
          const candidate = tokens.find(t => t.start > relativeMarker.start && isNameToken(t));
          if (candidate) {
            subjTok = candidate;
          }
        }
        let placeTok = findPrepObject(tok, tokens, ['in', 'at', 'inside', 'within']);
        if (!placeTok) {
          const objTok = tokens.find(t => (t.dep === 'dobj' || t.dep === 'obj') && t.head === tok.i);
          if (objTok) {
            placeTok = findPrepObject(objTok, tokens, ['in', 'at', 'inside', 'within']);
          }
        }
        let placeRefFromRelative: EntityRef | null = null;
        if (!placeTok && relativeMarker) {
          placeRefFromRelative = findNearestEntityBefore(
            relativeMarker.start,
            ['PLACE', 'ORG', 'HOUSE'],
            400
          );
        }

        if (subjTok && (placeTok || placeRefFromRelative)) {
          updateLastNamedSubject(subjTok);
          const subjSpan = expandNP(subjTok, tokens);
          if (relativeMarker && subjSpan.start < subjTok.start && subjTok.start > relativeMarker.start) {
            subjSpan.start = subjTok.start;
          }
          let placeSpan;
          if (placeTok) {
            placeSpan = expandNP(placeTok, tokens);
          } else if (placeRefFromRelative) {
            placeSpan = placeRefFromRelative.span ??
              ensureSpanForEntity(
                placeRefFromRelative.entity,
                { start: tok.start, end: tok.end }
              );
          }
          if (!placeSpan) continue;
          const subjSurface = text.slice(subjSpan.start, subjSpan.end);
          const subjRef = mapSurfaceToEntity(subjSurface, entities, spans, subjSpan);
          if (isDescriptorEntity(subjRef?.entity)) continue;
          const produced = tryCreateRelation(
            text, entities, spans, 'lives_in',
            subjSpan.start, subjSpan.end, placeSpan.start, placeSpan.end, 'DEP',
            tokens, tok.i
          );
          addProducedRelations(produced, tok);
        }
      }

      const leadershipNouns = new Set(['headmaster', 'headmistress', 'head', 'leader']);
      if (leadershipNouns.has(lemma) || leadershipNouns.has(textLower)) {
        const copula = tokens.find(t => t.i === tok.head && ['be', 'was', 'were', 'is', 'became', 'become'].includes(t.lemma.toLowerCase()));
        const subj = copula
          ? tokens.filter(t => t.dep === 'nsubj' && t.head === copula.i)
          : tokens.filter(t => t.dep === 'nsubj' && t.head === tok.i);
        const ofPrep = tokens.find(t => t.dep === 'prep' && t.head === tok.i && t.text.toLowerCase() === 'of');
        const orgTok = ofPrep ? tokens.find(t => t.dep === 'pobj' && t.head === ofPrep.i) : undefined;

        if (orgTok && subj.length) {
          const orgSpan = expandNP(orgTok, tokens);
          const normalizedOrg = normalizeEntityName(text.slice(orgSpan.start, orgSpan.end));
          const targetEntity = entities.find(e => e.canonical.toLowerCase() === normalizedOrg.toLowerCase());
          const targetSpan = targetEntity && spanLookup.get(targetEntity.id) ? spanLookup.get(targetEntity.id)! : orgSpan;
          for (const subjTok of subj.flatMap(s => collectConjTokens(s, tokens))) {
            const resolvedSubj = subjTok.pos === 'PRON' && lastNamedSubject ? lastNamedSubject : subjTok;
            updateLastNamedSubject(resolvedSubj);
            const subjSpan = expandNP(resolvedSubj, tokens);
            const produced = tryCreateRelation(
              text, entities, spans, 'leads',
              subjSpan.start, subjSpan.end, targetSpan.start, targetSpan.end, 'DEP',
              tokens, tok.i
            );
            addProducedRelations(produced, tok);
          }
        }
      }

      if (lemma === 'house' && tok.dep === 'dobj') {
        const apposBases = tokens.filter(t => t.dep === 'appos' && t.head === tok.i && isNameToken(t));
        if (apposBases.length) {
          const enumerated = apposBases.flatMap(base => collectConjTokens(base, tokens));
          let parentEntityEntry = entities
            .map(entity => ({ entity, span: spanLookup.get(entity.id) }))
            .filter(item => item.span && item.span.end <= tok.start && item.entity.type === 'ORG')
            .sort((a, b) => (b.span!.end - a.span!.end))[0];

          if (!parentEntityEntry) {
            const headTok = tokens.find(t => t.i === tok.head);
            if (headTok) {
              const subjects = tokens.filter(t => t.dep === 'nsubj' && t.head === headTok.i);
              for (const subjectTok of subjects) {
                const subjectSpan = expandNP(subjectTok, tokens);
                const subjectEntity = entityFromSpan(subjectSpan.start, subjectSpan.end);
                if (subjectEntity && subjectEntity.type === 'ORG') {
                  parentEntityEntry = {
                    entity: subjectEntity,
                    span: ensureSpanForEntity(subjectEntity, subjectSpan)
                  };
                  break;
                }
              }
            }
          }

          if (!parentEntityEntry && lastNamedOrg) {
            const lastOrgToken = lastNamedOrg;
            const orgEntity = entityFromSpan(lastOrgToken.start, lastOrgToken.end);
            if (orgEntity && orgEntity.type === 'ORG') {
              parentEntityEntry = {
                entity: orgEntity,
                span: ensureSpanForEntity(orgEntity, { start: lastOrgToken.start, end: lastOrgToken.end })
              };
            }
          }

          if (parentEntityEntry) {
            const parentSpan = parentEntityEntry.span!;
            for (const childTok of enumerated) {
              const childSpan = expandNP(childTok, tokens);
              const produced = tryCreateRelation(
                text, entities, spans, 'part_of',
                childSpan.start, childSpan.end, parentSpan.start, parentSpan.end, 'DEP',
                tokens, tok.i
              );
              addProducedRelations(produced, tok);
            }
          }
        }
      }

      // Pattern 10: member_of (sorted into / joined / were in)
      if (lemma === 'sort') {
        const intoPrep = tokens.find(t => t.dep === 'prep' && t.head === tok.i && (t.text.toLowerCase() === 'into' || t.text.toLowerCase() === 'to'));
        if (intoPrep) {
          const house = tokens.find(t => (t.dep === 'pobj' || t.dep === 'attr') && t.head === intoPrep.i);
          const subjects = tokens.filter(t => (t.dep === 'nsubj' || t.dep === 'nsubjpass') && t.head === tok.i);
          if (house && subjects.length) {
            const houseSpan = buildOrgSpan(house, tokens);
            const normalizedOrg = normalizeEntityName(text.slice(houseSpan.start, houseSpan.end));
            const targetEntity = entities.find(e => e.canonical.toLowerCase() === normalizedOrg.toLowerCase());
            const targetSpan = targetEntity && spanLookup.get(targetEntity.id) ? spanLookup.get(targetEntity.id)! : houseSpan;

            for (const subj of subjects.flatMap(s => collectConjTokens(s, tokens))) {
              const resolvedSubj = subj.pos === 'PRON' && lastNamedSubject ? lastNamedSubject : subj;
              updateLastNamedSubject(resolvedSubj);
              const subjSpan = expandNP(resolvedSubj, tokens);
              const produced = tryCreateRelation(
                text, entities, spans, 'member_of',
                subjSpan.start, subjSpan.end, targetSpan.start, targetSpan.end, 'DEP',
                tokens, tok.i
              );
              addProducedRelations(produced, tok);
            }
          }
        }
      }

      if (lemma === 'join') {
        const subjects = tokens.filter(t => t.dep === 'nsubj' && t.head === tok.i);
        const obj = tokens.find(t => (t.dep === 'dobj' || t.dep === 'obj') && t.head === tok.i);
        const intoPrep = tokens.find(t => t.dep === 'prep' && t.head === tok.i && (t.text.toLowerCase() === 'into' || t.text.toLowerCase() === 'to'));
        const target = obj || (intoPrep ? tokens.find(t => t.dep === 'pobj' && t.head === intoPrep.i) : undefined);
        if (target && subjects.length) {
          const orgSpan = buildOrgSpan(target, tokens);
          const normalizedOrg = normalizeEntityName(text.slice(orgSpan.start, orgSpan.end));
          const targetEntity = entities.find(e => e.canonical.toLowerCase() === normalizedOrg.toLowerCase());
          const targetSpan = targetEntity && spanLookup.get(targetEntity.id) ? spanLookup.get(targetEntity.id)! : orgSpan;
          for (const subj of subjects.flatMap(s => collectConjTokens(s, tokens))) {
            const resolvedSubj = subj.pos === 'PRON' && lastNamedSubject ? lastNamedSubject : subj;
            updateLastNamedSubject(resolvedSubj);
            const subjSpan = expandNP(resolvedSubj, tokens);
            const produced = tryCreateRelation(
              text, entities, spans, 'member_of',
              subjSpan.start, subjSpan.end, targetSpan.start, targetSpan.end, 'DEP',
              tokens, tok.i
            );
            addProducedRelations(produced, tok);
          }
        }
      }

      if (lemma === 'be') {
        const inPrep = tokens.find(t => t.dep === 'prep' && t.head === tok.i && (t.text.toLowerCase() === 'in' || t.text.toLowerCase() === 'inside'));
        if (inPrep) {
          const target = tokens.find(t => t.dep === 'pobj' && t.head === inPrep.i);
          const subjects = tokens.filter(t => t.dep === 'nsubj' && t.head === tok.i);
          if (target && subjects.length) {
            const orgSpan = buildOrgSpan(target, tokens);
            const normalizedOrg = normalizeEntityName(text.slice(orgSpan.start, orgSpan.end));
            const targetEntity = entities.find(e => e.canonical.toLowerCase() === normalizedOrg.toLowerCase());
            const targetSpan = targetEntity && spanLookup.get(targetEntity.id) ? spanLookup.get(targetEntity.id)! : orgSpan;
            for (const subj of subjects.flatMap(s => collectConjTokens(s, tokens))) {
              const resolvedSubj = subj.pos === 'PRON' && lastNamedSubject ? lastNamedSubject : subj;
              updateLastNamedSubject(resolvedSubj);
              const subjSpan = expandNP(resolvedSubj, tokens);
              const produced = tryCreateRelation(
                text, entities, spans, 'member_of',
                subjSpan.start, subjSpan.end, targetSpan.start, targetSpan.end, 'DEP',
                tokens, tok.i
              );
              addProducedRelations(produced, tok);
            }
          }
        }
      }

      if (lemma === 'include') {
        const directObjects = tokens.filter(t => (t.dep === 'dobj' || t.dep === 'obj') && t.head === tok.i && isNameToken(t));
        let baseObjects = directObjects;
        if (baseObjects.length === 0) {
          const pobj = tokens.find(t => t.dep === 'pobj' && t.head === tok.i && isNameToken(t));
          if (pobj) baseObjects = [pobj];
        }
        if (baseObjects.length) {
          const childTokens: Token[] = [];
          const seenChildStarts = new Set<number>();
          for (const objTok of baseObjects) {
            for (const child of collectConjTokens(objTok, tokens)) {
              if (!isNameToken(child)) continue;
              if (seenChildStarts.has(child.start)) continue;
              seenChildStarts.add(child.start);
              childTokens.push(child);
            }
          }

          if (childTokens.length) {
            const subjects = tokens.filter(t => (t.dep === 'nsubj' || t.dep === 'nsubjpass') && t.head === tok.i);
            const parentTokenCandidates: Token[] = [];

            for (const subjectTok of subjects) {
              const possTokens = tokens.filter(t => t.dep === 'poss' && t.head === subjectTok.i);
              for (const possTok of possTokens) {
                if (isNameToken(possTok)) {
                  parentTokenCandidates.push(possTok);
                } else if (possTok.pos === 'PRON') {
                  parentTokenCandidates.push(...recentPersons.slice(0, 2));
                }
              }
            }

            if (!parentTokenCandidates.length) {
              if (lastNamedSubject) parentTokenCandidates.push(lastNamedSubject);
              if (!parentTokenCandidates.length) parentTokenCandidates.push(...recentPersons.slice(0, 2));
            }

            const parentEntities: { entity: Entity; span: Span }[] = [];
            const seenParentIds = new Set<string>();
            for (const parentTok of parentTokenCandidates) {
              if (!parentTok) continue;
              const span = expandNP(parentTok, tokens);
              const entity = entityFromSpan(span.start, span.end);
              if (!entity || entity.type !== 'PERSON') continue;
              if (seenParentIds.has(entity.id)) continue;
              seenParentIds.add(entity.id);
              parentEntities.push({ entity, span: ensureSpanForEntity(entity, span) });
              updateLastNamedSubject(parentTok);
            }

            const childEntities: { entity: Entity; span: Span }[] = [];
            const seenChildIds = new Set<string>();
            for (const childTok of childTokens) {
              const span = expandNP(childTok, tokens);
              const entity = entityFromSpan(span.start, span.end);
              if (!entity || entity.type !== 'PERSON') continue;
              if (seenChildIds.has(entity.id)) continue;
              seenChildIds.add(entity.id);
              childEntities.push({ entity, span: ensureSpanForEntity(entity, span) });
            }

            if (parentEntities.length && childEntities.length) {
              for (const child of childEntities) {
                for (const parent of parentEntities) {
                  const produced = tryCreateRelation(
                    text, entities, spans, 'child_of',
                    child.span.start, child.span.end, parent.span.start, parent.span.end, 'DEP',
                    tokens, tok.i
                  );
                  addProducedRelations(produced, tok);
                }
              }
            }
          }
        }
      }

      // Pattern 11: fought_in / defeated ("fought against", "defeated", "killed")
      const combatVerbs = ['fight', 'fought', 'defeat', 'defeated', 'kill', 'killed', 'battle', 'battled', 'face', 'faced', 'faces', 'confront', 'confronted', 'confronts'];
      if (combatVerbs.includes(lemma) || combatVerbs.includes(textLower)) {
        const subj = tokens.find(t => t.dep === 'nsubj' && t.head === tok.i);
        const againstPrep = tokens.find(t => t.dep === 'prep' && t.head === tok.i && t.text.toLowerCase() === 'against');

        if (subj && againstPrep) {
          const enemy = tokens.find(t => t.dep === 'pobj' && t.head === againstPrep.i);
          if (enemy) {
            const produced = tryCreateRelation(
              text, entities, spans, 'enemy_of',
              subj.start, subj.end, enemy.start, enemy.end, 'DEP',
              tokens, tok.i
            );
            addProducedRelations(produced, tok);
          }
        }

        // Direct object for "defeated X" or "killed X"
        if (['defeat', 'defeated', 'kill', 'killed', 'face', 'faced', 'faces', 'confront', 'confronted', 'confronts'].includes(lemma) ||
            ['defeat', 'defeated', 'kill', 'killed', 'face', 'faced', 'faces', 'confront', 'confronted', 'confronts'].includes(textLower)) {
          const obj = tokens.find(t => (t.dep === 'dobj' || t.dep === 'obj') && t.head === tok.i);
          if (subj && obj) {
            const produced = tryCreateRelation(
              text, entities, spans, 'enemy_of',
              subj.start, subj.end, obj.start, obj.end, 'DEP',
              tokens, tok.i
            );
            addProducedRelations(produced, tok);
          }
        }

        // "fought in PLACE"
        if (['fight', 'fought', 'battle', 'battled'].includes(lemma)) {
          const inPrep = tokens.find(t => t.dep === 'prep' && t.head === tok.i && t.text.toLowerCase() === 'in');
          if (subj && inPrep) {
            const place = tokens.find(t => t.dep === 'pobj' && t.head === inPrep.i);
            if (place) {
              const produced = tryCreateRelation(
                text, entities, spans, 'fought_in',
                subj.start, subj.end, place.start, place.end, 'DEP',
                tokens, tok.i
              );
              addProducedRelations(produced, tok);
            }
          }
        }
      }

      // Pattern 11.5: rival ("became a rival to", "is a rival to")
      if (lemma === 'rival' || textLower.includes('rival')) {
        // Find the main verb (e.g., "became", "is", etc.)
        const mainVerb = tokens.find(t =>
          (t.dep === 'ROOT' || t.pos === 'VERB' || t.pos === 'AUX') &&
          (t.lemma === 'become' || t.lemma === 'be' || t.i === tok.i)
        );

        if (mainVerb || lemma === 'rival') {
          const verbIdx = mainVerb ? mainVerb.i : tok.i;

          // Look for subject of the main verb or the sentence
          let subj = tokens.find(t =>
            (t.dep === 'nsubj' && (t.head === verbIdx || t.head === tok.i)) ||
            (t.dep === 'nsubj' && tokens.find(h => h.i === t.head && h.dep === 'attr' && h.head === verbIdx))
          );

          // Resolve pronouns
          if (subj && subj.pos === 'PRON' && lastNamedSubject) {
            subj = lastNamedSubject;
          }
          if (subj && subj.pos !== 'PRON') {
            updateLastNamedSubject(subj);
          }

          // Look for "to" preposition attached to "rival"
          const toPrep = tokens.find(t =>
            t.dep === 'prep' &&
            (t.head === tok.i || (tok.dep === 'attr' && t.head === tok.head)) &&
            t.text.toLowerCase() === 'to'
          );

          if (subj && toPrep) {
            const rival = tokens.find(t => t.dep === 'pobj' && t.head === toPrep.i);
            if (rival) {
              const subjSpan = expandNP(subj, tokens);
              const rivalSpan = expandNP(rival, tokens);
              const produced = tryCreateRelation(
                text, entities, spans, 'enemy_of',
                subjSpan.start, subjSpan.end, rivalSpan.start, rivalSpan.end, 'DEP',
                tokens, tok.i
              );
              addProducedRelations(produced, tok);
            }
          }
        }
      }

      // Pattern 12: conquered ("conquered X")
      if (lemma === 'conquer' || textLower === 'conquered') {
        const subj = tokens.find(t => t.dep === 'nsubj' && t.head === tok.i);
        const obj = tokens.find(t => (t.dep === 'dobj' || t.dep === 'obj') && t.head === tok.i);

        if (subj && obj) {
          const produced = tryCreateRelation(
            text, entities, spans, 'rules',
            subj.start, subj.end, obj.start, obj.end, 'DEP',
            tokens, tok.i
          );
          addProducedRelations(produced, tok);
        }
      }
    }

    const includeTrigger = tokens.find(t => t.lemma.toLowerCase() === 'include') ?? tokens[tokens.length - 1];

    const handleChildrenEnumeration = () => {
      if (handledChildrenSentences.has(sent.start)) return;
      const match = /children\s+include(d)?/.exec(sentenceLower);
      if (!match) return;
      const matchIndex = match.index;
      const afterIndex = match.index + match[0].length;
      const listRaw = sentenceText
        .slice(afterIndex)
        .split(/[.?!;]/)[0]
        .replace(/\bamong others\b.*$/i, '')
        .trim();
      const items = parseList(listRaw);
      if (!items.length) return;

      const listStartAbs = sent.start + afterIndex;
      const childEntities: { entity: Entity; span: Span }[] = [];
      let cursor = listStartAbs;

      for (const surface of items) {
        const located = locateSurface(surface, cursor);
        if (!located) continue;
        cursor = located.end;
        const ref = mapSurfaceToEntity(surface, entities, spans, located);
        if (!ref || ref.entity.type !== 'PERSON') continue;
        if (childEntities.some(r => r.entity.id === ref.entity.id)) continue;
        const span = ref.span
          ?? selectEntitySpan(ref.entity.id, spans, located)
          ?? ensureSpanForEntity(ref.entity, { start: located.start, end: located.end });
        childEntities.push({
          entity: ref.entity,
          span
        });
      }

      if (!childEntities.length) return;

      const possToken = tokens
        .filter(t => t.dep === 'poss' && t.start >= sent.start && t.start <= listStartAbs)
        .filter(t => /^(their|his|her)$/i.test(t.text))
        .sort((a, b) => b.start - a.start)[0];

      const parentCandidates = possToken ? resolvePossessors(possToken) : [];
      if (!parentCandidates.length && lastNamedSubject) parentCandidates.push(lastNamedSubject);
      if (!parentCandidates.length && recentPersons.length) parentCandidates.push(recentPersons[0]);

      const parentToken = parentCandidates.find(t => t.pos !== 'PRON') ?? parentCandidates[0];
      if (!parentToken) return;
      updateLastNamedSubject(parentToken);

      const parentSpan = expandNP(parentToken, tokens);
      const parentEntity = entityFromSpan(parentSpan.start, parentSpan.end);
      if (!parentEntity || parentEntity.type !== 'PERSON') return;
      const parentRef: EntityRef = {
        entity: parentEntity,
        span: ensureSpanForEntity(parentEntity, parentSpan)
      };

      for (const child of childEntities) {
        if (parentRef.entity.id === child.entity.id) continue;
        if (process.env.L3_ENUM_TRACE === '1') {
          console.log('Enumeration parent_of', parentRef.entity.canonical, parentRef.entity.id, '->', child.entity.canonical, child.entity.id);
        }
        emitCandidate('parent_of', parentRef, child, includeTrigger);
      }

      handledChildrenSentences.add(sent.start);
    };

    const handleMembersEnumeration = () => {
      if (handledMemberSentences.has(sent.start)) return;
      const match = /members\s+include(d)?/.exec(sentenceLower);
      if (!match) return;
      const matchIndex = match.index;
      const afterIndex = match.index + match[0].length;
      const listRaw = sentenceText
        .slice(afterIndex)
        .split(/[.?!;]/)[0]
        .replace(/\bamong others\b.*$/i, '')
        .trim();
      const items = parseList(listRaw);
      if (!items.length) return;

      const listStartAbs = sent.start + afterIndex;
      let containerRef = findNearestEntityBefore(
        sent.start + matchIndex,
        ['ORG', 'HOUSE', 'TRIBE'],
        260
      );

      if (!containerRef && lastNamedOrg) {
        const entity = entityFromSpan(lastNamedOrg.start, lastNamedOrg.end);
        if (entity && ['ORG', 'HOUSE', 'TRIBE'].includes(entity.type)) {
          containerRef = {
            entity,
            span: selectEntitySpan(entity.id, spans, { start: lastNamedOrg.start, end: lastNamedOrg.end })
          };
        }
      }

      if (!containerRef) return;

      const memberRefs: EntityRef[] = [];
      let cursor = listStartAbs;

      for (const surface of items) {
        const located = locateSurface(surface, cursor);
        if (!located) continue;
        cursor = located.end;
        const ref = mapSurfaceToEntity(surface, entities, spans, located);
        if (!ref || ref.entity.type !== 'PERSON') continue;
        if (memberRefs.some(r => r.entity.id === ref.entity.id)) continue;
        memberRefs.push({
          entity: ref.entity,
          span: ref.span ?? selectEntitySpan(ref.entity.id, spans, located)
        });
      }

      if (!memberRefs.length) return;
      const containerEntity = containerRef.entity;
      const containerSpan = containerRef.span ?? selectEntitySpan(containerEntity.id, spans);
      if (!containerSpan) return;

      const container = { entity: containerEntity, span: containerSpan };

      for (const member of memberRefs) {
        if (member.entity.id === container.entity.id) continue;
        if (process.env.L3_ENUM_TRACE === '1') {
          console.log('Enumeration member_of', member.entity.canonical, member.entity.id, '->', container.entity.canonical, container.entity.id);
        }
        emitCandidate('member_of', member, container, includeTrigger);
      }

      handledMemberSentences.add(sent.start);
    };

    const handleColonEnumeration = () => {
      const colonIndex = sentenceText.indexOf(':');
      if (colonIndex === -1) return;
      const colonAbs = sent.start + colonIndex;
      if (handledColonPositions.has(colonAbs)) return;

      let remainder = sentenceText.slice(colonIndex + 1);
      if (remainder.trim().length === 0) {
        const nextSent = sentences[sentenceIdx + 1];
        if (nextSent) {
          remainder += ' ' + text.slice(nextSent.start, nextSent.end);
        }
      }

      const listRaw = remainder
        .split(/[.?!;]/)[0]
        .trim();
      const items = parseList(listRaw);
      if (items.length < 2) return;

      let containerRef = findNearestEntityBefore(colonAbs, ['ORG', 'HOUSE', 'TRIBE'], 360);
      if (!containerRef) {
        containerRef = findNearestEntityBefore(colonAbs, ['PLACE'], 320);
      }
      if (!containerRef) return;

      const containerSpan = containerRef.span ?? selectEntitySpan(containerRef.entity.id, spans);
      if (!containerSpan) return;
      const container = { entity: containerRef.entity, span: containerSpan };

      if (process.env.L3_ENUM_TRACE === '1') {
        console.log('Colon enumeration container', container.entity.canonical, container.entity.type, 'at', container.span);
      }

      const partRefs: EntityRef[] = [];
      let cursor = colonAbs + 1;
      for (const surface of items) {
        const located = locateSurface(surface, cursor);
        if (!located) continue;
        cursor = located.end;
        const ref = mapSurfaceToEntity(surface, entities, spans, located);
        if (!ref) continue;
        if (!['ORG', 'HOUSE', 'TRIBE'].includes(ref.entity.type)) continue;
        if (partRefs.some(r => r.entity.id === ref.entity.id)) continue;
        partRefs.push({
          entity: ref.entity,
          span: ref.span ?? selectEntitySpan(ref.entity.id, spans, located)
        });

        if (process.env.L3_ENUM_TRACE === '1') {
          console.log('  part item', ref.entity.canonical, 'range', ref.span ?? selectEntitySpan(ref.entity.id, spans, located));
        }
      }

      if (!partRefs.length) return;

      for (const part of partRefs) {
        if (part.entity.id === container.entity.id) continue;
        if (process.env.L3_ENUM_TRACE === '1') {
          console.log('  emitting part_of', part.entity.canonical, '->', container.entity.canonical);
        }
        emitCandidate('part_of', part, container, includeTrigger);
      }

      handledColonPositions.add(colonAbs);
    };

    handleChildrenEnumeration();
    handleMembersEnumeration();
    handleColonEnumeration();
  }

  return relations;
}

/**
 * Extract relations using regex fallback patterns
 */
function extractRegexRelations(
  text: string,
  entities: Entity[],
  spans: Span[]
): Relation[] {
  const relations: Relation[] = [];

  // Pattern 1: "X, son/daughter/child/offspring/descendant/heir of Y"
  const sonOfPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s*,\s*(?:son|daughter|child|offspring|descendant|heir)\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/g;
  let match: RegExpExecArray | null;

  while ((match = sonOfPattern.exec(text))) {
    const childName = match[1];
    const parentName = match[2];
    const childStart = match.index;
    const childEnd = childStart + childName.length;
    const parentStart = match.index + match[0].lastIndexOf(parentName);
    const parentEnd = parentStart + parentName.length;

    relations.push(...tryCreateRelation(
      text, entities, spans, 'child_of',
      childStart, childEnd, parentStart, parentEnd, 'REGEX'
    ));
  }

  // Pattern 2: "X begat Y"
  const begatPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+begat\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/g;
  while ((match = begatPattern.exec(text))) {
    const parentName = match[1];
    const childName = match[2];
    const parentStart = match.index;
    const parentEnd = parentStart + parentName.length;
    const childStart = match.index + match[0].lastIndexOf(childName);
    const childEnd = childStart + childName.length;

    relations.push(...tryCreateRelation(
      text, entities, spans, 'parent_of',
      parentStart, parentEnd, childStart, childEnd, 'REGEX'
    ));
  }

  // Pattern 3: "X married Y"
  const marriedPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+(?:was\s+)?married\s+(?:to\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/g;
  while ((match = marriedPattern.exec(text))) {
    const name1 = match[1];
    const name2 = match[2];
    const name1Start = match.index;
    const name1End = name1Start + name1.length;
    const name2Start = match.index + match[0].lastIndexOf(name2);
    const name2End = name2Start + name2.length;

    relations.push(...tryCreateRelation(
      text, entities, spans, 'married_to',
      name1Start, name1End, name2Start, name2End, 'REGEX'
    ));
  }

  // Pattern 4: "X traveled/went/journeyed to Y"
  const travelPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+(?:traveled|went|journeyed|came|rode|sailed|flew)\s+to\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/g;
  while ((match = travelPattern.exec(text))) {
    const person = match[1];
    const place = match[2];
    const personStart = match.index;
    const personEnd = personStart + person.length;
    const placeStart = match.index + match[0].lastIndexOf(place);
    const placeEnd = placeStart + place.length;

    relations.push(...tryCreateRelation(
      text, entities, spans, 'traveled_to',
      personStart, personEnd, placeStart, placeEnd, 'REGEX'
    ));
  }

  // Pattern 5: "X studies at Y"
  const studiesPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+(?:studies|studied|is\s+studying)\s+at\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/g;
  while ((match = studiesPattern.exec(text))) {
    const person = match[1];
    const place = match[2];
    const personStart = match.index;
    const personEnd = personStart + person.length;
    const placeStart = match.index + match[0].lastIndexOf(place);
    const placeEnd = placeStart + place.length;

    relations.push(...tryCreateRelation(
      text, entities, spans, 'studies_at',
      personStart, personEnd, placeStart, placeEnd, 'REGEX'
    ));
  }

  const attendedPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\s+(?:attended|attends|is\s+attending)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/g;
  while ((match = attendedPattern.exec(text))) {
    const person = match[1];
    const place = match[2];
    const personStart = match.index;
    const personEnd = personStart + person.length;
    const placeStart = match.index + match[0].lastIndexOf(place);
    const placeEnd = placeStart + place.length;

    relations.push(...tryCreateRelation(
      text, entities, spans, 'attended',
      personStart, personEnd, placeStart, placeEnd, 'REGEX'
    ));
  }

  // Pattern 6: "X teaches at Y"
  const teachesPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+(?:teaches|taught|is\s+teaching)\s+at\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/g;
  while ((match = teachesPattern.exec(text))) {
    const person = match[1];
    const place = match[2];
    const personStart = match.index;
    const personEnd = personStart + person.length;
    const placeStart = match.index + match[0].lastIndexOf(place);
    const placeEnd = placeStart + place.length;

    relations.push(...tryCreateRelation(
      text, entities, spans, 'teaches_at',
      personStart, personEnd, placeStart, placeEnd, 'REGEX'
    ));
  }

  // Pattern 7: "X dwelt/lived/lives in Y"
  const dweltPattern = /\b([A-Z][A-Za-z'']+(?:\s+[A-Z][A-Za-z'']+){0,2})\s+(?:dwelt|live|lives|lived|resides|resided|residing)\s+(?:in|at)\s+([A-Z][A-Za-z'']+(?:\s+[A-Z][A-Za-z'']+){0,2})/g;
  while ((match = dweltPattern.exec(text))) {
    const person = match[1];
    const place = match[2];
    const personStart = match.index;
    const personEnd = personStart + person.length;
    const placeStart = match.index + match[0].lastIndexOf(place);
    const placeEnd = placeStart + place.length;

    relations.push(...tryCreateRelation(
      text, entities, spans, 'lives_in',
      personStart, personEnd, placeStart, placeEnd, 'REGEX'
    ));
  }

  // Pattern 8: "X became king of Y" or "X was king of Y"
  const kingPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+(?:became|was|is)\s+(?:king|queen|ruler)\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/g;
  while ((match = kingPattern.exec(text))) {
    const person = match[1];
    const place = match[2];
    const personStart = match.index;
    const personEnd = personStart + person.length;
    const placeStart = match.index + match[0].lastIndexOf(place);
    const placeEnd = placeStart + place.length;

    relations.push(...tryCreateRelation(
      text, entities, spans, 'rules',
      personStart, personEnd, placeStart, placeEnd, 'REGEX'
    ));
  }

  // Pattern 9: "X ruled Y" or "X reigned over Y"
  const ruledPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+(?:ruled|reigned)\s+(?:over\s+|in\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/g;
  while ((match = ruledPattern.exec(text))) {
    const person = match[1];
    const place = match[2];
    const personStart = match.index;
    const personEnd = personStart + person.length;
    const placeStart = match.index + match[0].lastIndexOf(place);
    const placeEnd = placeStart + place.length;

    relations.push(...tryCreateRelation(
      text, entities, spans, 'rules',
      personStart, personEnd, placeStart, placeEnd, 'REGEX'
    ));
  }

  // Pattern 10: "X conquered Y"
  const conqueredPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+conquered\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/g;
  while ((match = conqueredPattern.exec(text))) {
    const person = match[1];
    const place = match[2];
    const personStart = match.index;
    const personEnd = personStart + person.length;
    const placeStart = match.index + match[0].lastIndexOf(place);
    const placeEnd = placeStart + place.length;

    relations.push(...tryCreateRelation(
      text, entities, spans, 'rules',
      personStart, personEnd, placeStart, placeEnd, 'REGEX'
    ));
  }

  // Pattern 11: "X was the/a/an son/daughter/child/offspring/descendant/heir of Y"
  const sonPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+(?:was|is)\s+(?:(?:the|an?)\s+)?(?:son|daughter|child|offspring|descendant|heir)\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/g;
  while ((match = sonPattern.exec(text))) {
    const child = match[1];
    const parent = match[2];
    const childStart = match.index;
    const childEnd = childStart + child.length;
    const parentStart = match.index + match[0].lastIndexOf(parent);
    const parentEnd = parentStart + parent.length;

    relations.push(...tryCreateRelation(
      text, entities, spans, 'child_of',
      childStart, childEnd, parentStart, parentEnd, 'REGEX'
    ));
  }

  // Pattern 11b: "X was born to Y" or "X born to Y"
  const bornToPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+(?:was\s+)?born\s+to\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/g;
  while ((match = bornToPattern.exec(text))) {
    const child = match[1];
    const parent = match[2];
    const childStart = match.index;
    const childEnd = childStart + child.length;
    const parentStart = match.index + match[0].lastIndexOf(parent);
    const parentEnd = parentStart + parent.length;

    relations.push(...tryCreateRelation(
      text, entities, spans, 'child_of',
      childStart, childEnd, parentStart, parentEnd, 'REGEX'
    ));
  }

  // Pattern 12: "X was friends with Y" or "X and Y were friends"
  const friendsPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+(?:was|were|is)\s+friends\s+with\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/g;
  while ((match = friendsPattern.exec(text))) {
    const person1 = match[1];
    const person2 = match[2];
    const person1Start = match.index;
    const person1End = person1Start + person1.length;
    const person2Start = match.index + match[0].lastIndexOf(person2);
    const person2End = person2Start + person2.length;

    relations.push(...tryCreateRelation(
      text, entities, spans, 'friends_with',
      person1Start, person1End, person2Start, person2End, 'REGEX'
    ));
  }

  // Pattern 13: "X fought against Y" or "X defeated Y" or "X killed Y"
  const combatPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+(?:fought\s+against|defeated|killed)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/g;
  while ((match = combatPattern.exec(text))) {
    const person1 = match[1];
    const person2 = match[2];
    const person1Start = match.index;
    const person1End = person1Start + person1.length;
    const person2Start = match.index + match[0].lastIndexOf(person2);
    const person2End = person2Start + person2.length;

    relations.push(...tryCreateRelation(
      text, entities, spans, 'enemy_of',
      person1Start, person1End, person2Start, person2End, 'REGEX'
    ));
  }

  return relations;
}

/**
 * Deduplicate relations by subject+predicate+object+evidence_span
 * Prefer DEP over REGEX when same relation found
 */
function dedupeRelations(relations: Relation[]): Relation[] {
  const map = new Map<string, Relation>();

  // Rank: dep=2, regex=1
  const rank = (r: Relation) => (r.extractor === 'dep' ? 2 : 1);

  for (const rel of relations) {
    // Include evidence span in key to differentiate same relations in different contexts
    const evidenceKey = rel.evidence[0] ? `${rel.evidence[0].span.start}-${rel.evidence[0].span.end}` : '';
    const key = `${rel.subj}::${rel.pred}::${rel.obj}::${evidenceKey}`;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, rel);
    } else {
      // Prefer higher rank (dep > regex), then higher confidence
      if (rank(rel) > rank(existing) ||
          (rank(rel) === rank(existing) && rel.confidence > existing.confidence)) {
        map.set(key, rel);
      }
    }
  }

  return Array.from(map.values());
}

function expandFamilyResidenceRelations(relations: Relation[], entities: Entity[]): Relation[] {
  const additions: Relation[] = [];
  const surnameCache = new Map<string, Entity[]>();
  const parentSubjects = new Set(relations.filter(rel => rel.pred === 'parent_of').map(rel => rel.subj));

  for (const rel of relations) {
    if (rel.pred !== 'lives_in') continue;
    const subjEntity = entities.find(e => e.id === rel.subj);
    if (!subjEntity) continue;
    const familySurface = [subjEntity.canonical, ...(subjEntity.aliases ?? [])]
      .find(name => /\bfamily$/i.test(name));
    if (!familySurface) continue;
    const surname = familySurface
      .replace(/\bfamily$/i, "")
      .replace(/^the\s+/i, "")
      .trim();
    if (!surname) continue;
    const lowered = surname.toLowerCase();

    if (!surnameCache.has(lowered)) {
      const candidates = entities.filter(e =>
        e.type === 'PERSON' &&
        e.id !== subjEntity.id &&
        e.canonical.toLowerCase().includes(lowered)
      );
      surnameCache.set(lowered, candidates);
    }

    const members = surnameCache.get(lowered) ?? [];
    const placeEntity = entities.find(e => e.id === rel.obj);
    for (const member of members) {
      if (!parentSubjects.has(member.id)) continue;
      const newRelation: Relation = {
        ...rel,
        id: uuid(),
        subj: member.id,
        subj_surface: member.canonical,
        evidence: rel.evidence.map(ev => ({ ...ev })),
        qualifiers: rel.qualifiers ? [...rel.qualifiers] : undefined
      };
      if (L3_DEBUG) {
        const placeName = placeEntity ? placeEntity.canonical : rel.obj;
        console.log(`[FAMILY-RESIDENCE] Propagated ${member.canonical} -> ${placeName} via ${subjEntity.canonical}`);
      }
      additions.push(newRelation);
    }
  }

  return additions;
}

/**
 * Main relation extraction function
 */
export async function extractRelations(
  text: string,
  result: { entities: Entity[]; spans: { entity_id: string; start: number; end: number }[] },
  docId: string
): Promise<Relation[]> {
  const { entities, spans } = result;

  // Parse text to get dependency structure
  const parsed = await parseWithService(text);
  const clauseAwareSentences: ParsedSentence[] = [];

  for (const sent of parsed.sentences) {
    const clauses = detectClauses(sent, text);
    if (!clauses.length) {
      clauseAwareSentences.push(sent);
      continue;
    }

    let addedClause = false;
    for (const clause of clauses) {
      const clauseTokens = sent.tokens.filter(tok =>
        tok.start >= clause.start && tok.end <= clause.end
      );
      if (!clauseTokens.length) continue;

      clauseAwareSentences.push({
        sentence_index: clauseAwareSentences.length,
        tokens: clauseTokens,
        start: clause.start,
        end: clause.end
      });
      addedClause = true;
    }

    if (!addedClause) {
      clauseAwareSentences.push(sent);
    }
  }

  // Extract using dependency patterns (primary)
  const depInputSentences = clauseAwareSentences.length ? clauseAwareSentences : parsed.sentences;
  const depRelations = extractDepRelations(text, entities, spans, depInputSentences);

  // Extract using regex fallback (secondary)
  const regexRelations = extractRegexRelations(text, entities, spans);

  // Merge and deduplicate (dep patterns take priority)
  const bridgedFamilyRelations = expandFamilyResidenceRelations([...depRelations, ...regexRelations], entities);
  const allRelations = [...depRelations, ...regexRelations, ...bridgedFamilyRelations];
  const parentRoleSubjects = new Set(allRelations.filter(rel => rel.pred === 'parent_of').map(rel => rel.subj));
  const familyResidenceKeys = new Set<string>();
  for (const rel of allRelations) {
    if (rel.pred !== 'lives_in') continue;
    const subjEntity = entities.find(e => e.id === rel.subj);
    if (!subjEntity) continue;
    const familyMatch = subjEntity.canonical.match(/\b([A-Za-z][A-Za-z'-]+)\s+family\b/i);
    if (familyMatch) {
      familyResidenceKeys.add(`${familyMatch[1].toLowerCase()}::${rel.obj}`);
    }
  }
  const uniqueRelations = dedupeRelations(allRelations);

  const validRelations = uniqueRelations.filter(rel =>
    entities.some(e => e.id === rel.subj) &&
    entities.some(e => e.id === rel.obj)
  ).filter(rel => {
    if (rel.pred === 'lives_in') {
      const subjEntity = entities.find(e => e.id === rel.subj);
      if (subjEntity && subjEntity.type === 'PERSON') {
        const surname = subjEntity.canonical.toLowerCase().split(/\s+/).pop();
        if (surname && familyResidenceKeys.has(`${surname}::${rel.obj}`) && !parentRoleSubjects.has(rel.subj)) {
          return false;
        }
      }
    }
    return true;
  });

  const seen = new Set<string>();
  const deduped: Relation[] = [];
  for (const rel of validRelations) {
    const key = `${rel.pred}|${rel.subj}|${rel.obj}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(rel);
  }

  return deduped;
}
