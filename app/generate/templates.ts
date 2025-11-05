/**
 * Deterministic Template-Based Lexicalization
 * Maps predicates to natural language sentence templates
 * No AI/LLM - pure template substitution
 */

import type { Predicate, Qualifier } from '../engine/schema';

export interface TemplateContext {
  subjectName: string;
  objectName: string;
  qualifiers?: Qualifier[];
  confidence: number;
}

/**
 * Apply hedging for low-confidence claims
 */
function hedge(confidence: number): string {
  if (confidence < 0.7) {
    return Math.random() < 0.5 ? 'reportedly ' : 'is said to have ';
  }
  return '';
}

/**
 * Format time qualifier if present
 */
function formatTime(qualifiers?: Qualifier[]): string {
  if (!qualifiers) return '';

  const timeQual = qualifiers.find(q => q.type === 'time');
  if (!timeQual) return '';

  return ` in ${timeQual.value}`;
}

/**
 * Format place qualifier if present
 */
function formatPlace(qualifiers?: Qualifier[]): string {
  if (!qualifiers) return '';

  const placeQual = qualifiers.find(q => q.type === 'place');
  if (!placeQual) return '';

  return ` in ${placeQual.value}`;
}

/**
 * Format both time and place qualifiers
 */
function formatQualifiers(qualifiers?: Qualifier[]): string {
  const time = formatTime(qualifiers);
  const place = formatPlace(qualifiers);

  if (time && place) {
    return `${place}${time}`;
  }
  return time || place;
}

/**
 * Template function type
 */
type TemplateFunction = (ctx: TemplateContext) => string;

/**
 * Predicate-to-template mapping
 * Each template returns a complete sentence
 */
export const TEMPLATES: Record<Predicate, TemplateFunction> = {
  // Family relations
  married_to: (ctx) => {
    const h = ctx.confidence < 0.7 ? 'reportedly ' : '';
    const quals = formatQualifiers(ctx.qualifiers);
    return `${ctx.subjectName} ${h}married ${ctx.objectName}${quals}.`;
  },

  parent_of: (ctx) => {
    const h = ctx.confidence < 0.7 ? 'is said to be ' : 'is ';
    return `${ctx.subjectName} ${h}the parent of ${ctx.objectName}.`;
  },

  child_of: (ctx) => {
    const h = ctx.confidence < 0.7 ? 'is said to be ' : 'is ';
    return `${ctx.subjectName} ${h}the child of ${ctx.objectName}.`;
  },

  sibling_of: (ctx) => {
    const h = ctx.confidence < 0.7 ? 'is reportedly ' : 'is ';
    return `${ctx.subjectName} ${h}a sibling of ${ctx.objectName}.`;
  },

  // Organizational relations
  member_of: (ctx) => {
    const h = ctx.confidence < 0.7 ? 'reportedly ' : '';
    const time = formatTime(ctx.qualifiers);
    return `${ctx.subjectName} ${h}was a member of ${ctx.objectName}${time}.`;
  },

  // Location relations
  lives_in: (ctx) => {
    const h = ctx.confidence < 0.7 ? 'reportedly ' : '';
    const time = formatTime(ctx.qualifiers);
    return `${ctx.subjectName} ${h}lived in ${ctx.objectName}${time}.`;
  },

  born_in: (ctx) => {
    const h = ctx.confidence < 0.7 ? 'was reportedly ' : 'was ';
    const time = formatTime(ctx.qualifiers);
    return `${ctx.subjectName} ${h}born in ${ctx.objectName}${time}.`;
  },

  dies_in: (ctx) => {
    const h = ctx.confidence < 0.7 ? 'reportedly ' : '';
    const time = formatTime(ctx.qualifiers);
    return `${ctx.subjectName} ${h}died in ${ctx.objectName}${time}.`;
  },

  // Actions
  traveled_to: (ctx) => {
    const h = ctx.confidence < 0.7 ? 'reportedly ' : '';
    const time = formatTime(ctx.qualifiers);
    return `${ctx.subjectName} ${h}traveled to ${ctx.objectName}${time}.`;
  },

  fought_in: (ctx) => {
    const h = ctx.confidence < 0.7 ? 'reportedly ' : '';
    const time = formatTime(ctx.qualifiers);
    return `${ctx.subjectName} ${h}fought in ${ctx.objectName}${time}.`;
  },

  // Items and possessions
  wields: (ctx) => {
    const h = ctx.confidence < 0.7 ? 'reportedly ' : '';
    const time = formatTime(ctx.qualifiers);
    return `${ctx.subjectName} ${h}wields ${ctx.objectName}${time}.`;
  },

  owns: (ctx) => {
    const h = ctx.confidence < 0.7 ? 'reportedly ' : '';
    return `${ctx.subjectName} ${h}owns ${ctx.objectName}.`;
  },

  uses: (ctx) => {
    const h = ctx.confidence < 0.7 ? 'reportedly ' : '';
    return `${ctx.subjectName} ${h}uses ${ctx.objectName}.`;
  },

  // Work/study relations
  studies_at: (ctx) => {
    const h = ctx.confidence < 0.7 ? 'reportedly ' : '';
    const time = formatTime(ctx.qualifiers);
    return `${ctx.subjectName} ${h}studied at ${ctx.objectName}${time}.`;
  },

  teaches_at: (ctx) => {
    const h = ctx.confidence < 0.7 ? 'reportedly ' : '';
    const time = formatTime(ctx.qualifiers);
    return `${ctx.subjectName} ${h}taught at ${ctx.objectName}${time}.`;
  },

  // Social relations
  friends_with: (ctx) => {
    const h = ctx.confidence < 0.7 ? 'is reportedly ' : 'is ';
    return `${ctx.subjectName} ${h}friends with ${ctx.objectName}.`;
  },

  ally_of: (ctx) => {
    const h = ctx.confidence < 0.7 ? 'is reportedly ' : 'is ';
    const time = formatTime(ctx.qualifiers);
    return `${ctx.subjectName} ${h}an ally of ${ctx.objectName}${time}.`;
  },

  enemy_of: (ctx) => {
    const h = ctx.confidence < 0.7 ? 'is reportedly ' : 'is ';
    const time = formatTime(ctx.qualifiers);
    return `${ctx.subjectName} ${h}an enemy of ${ctx.objectName}${time}.`;
  },

  // Leadership and authority
  leads: (ctx) => {
    const h = ctx.confidence < 0.7 ? 'reportedly ' : '';
    const time = formatTime(ctx.qualifiers);
    return `${ctx.subjectName} ${h}leads ${ctx.objectName}${time}.`;
  },

  rules: (ctx) => {
    const h = ctx.confidence < 0.7 ? 'reportedly ' : '';
    const time = formatTime(ctx.qualifiers);
    return `${ctx.subjectName} ${h}rules ${ctx.objectName}${time}.`;
  },

  // Works and authorship
  authored: (ctx) => {
    const h = ctx.confidence < 0.7 ? 'reportedly ' : '';
    const time = formatTime(ctx.qualifiers);
    return `${ctx.subjectName} ${h}authored ${ctx.objectName}${time}.`;
  },

  mentions: (ctx) => {
    const h = ctx.confidence < 0.7 ? 'reportedly ' : '';
    return `${ctx.subjectName} ${h}mentions ${ctx.objectName}.`;
  },

  // Identity and composition
  alias_of: (ctx) => {
    return `${ctx.subjectName} is also known as ${ctx.objectName}.`;
  },

  part_of: (ctx) => {
    const h = ctx.confidence < 0.7 ? 'is reportedly ' : 'is ';
    return `${ctx.subjectName} ${h}part of ${ctx.objectName}.`;
  },
};

/**
 * Render a relation using its template
 */
export function renderRelation(
  predicate: Predicate,
  subjectName: string,
  objectName: string,
  qualifiers: Qualifier[] | undefined,
  confidence: number
): string {
  const template = TEMPLATES[predicate];

  if (!template) {
    // Fallback for unknown predicates
    return `${subjectName} has relation "${predicate}" with ${objectName}.`;
  }

  return template({
    subjectName,
    objectName,
    qualifiers,
    confidence,
  });
}

/**
 * Extract sortable time from qualifiers for timeline ordering
 */
export function extractSortableTime(qualifiers?: Qualifier[]): number {
  if (!qualifiers) return 0;

  const timeQual = qualifiers.find(q => q.type === 'time');
  if (!timeQual) return 0;

  // Extract year from various formats
  const yearMatch = timeQual.value.match(/\d{1,4}/);
  if (yearMatch) {
    return parseInt(yearMatch[0], 10);
  }

  return 0;
}
