/**
 * Markdown Page Rendering
 * Converts WikiPage structure to Markdown format
 */

import type { WikiPage, Infobox } from './exposition';

/**
 * Render infobox as Markdown table
 */
function renderInfobox(infobox: Infobox): string {
  const lines: string[] = [];

  lines.push('## Infobox');
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('|-------|-------|');

  // Name (always present)
  lines.push(`| **Name** | ${infobox.name} |`);

  // Optional fields
  if (infobox.species) {
    lines.push(`| **Species** | ${infobox.species} |`);
  }

  if (infobox.race) {
    lines.push(`| **Race** | ${infobox.race} |`);
  }

  if (infobox.titles && infobox.titles.length > 0) {
    lines.push(`| **Titles** | ${infobox.titles.join(', ')} |`);
  }

  if (infobox.roles && infobox.roles.length > 0) {
    lines.push(`| **Roles** | ${infobox.roles.join(', ')} |`);
  }

  if (infobox.occupations && infobox.occupations.length > 0) {
    lines.push(`| **Occupations** | ${infobox.occupations.join(', ')} |`);
  }

  if (infobox.affiliations && infobox.affiliations.length > 0) {
    lines.push(`| **Affiliations** | ${infobox.affiliations.join(', ')} |`);
  }

  if (infobox.residence && infobox.residence.length > 0) {
    lines.push(`| **Residence** | ${infobox.residence.join(', ')} |`);
  }

  if (infobox.relatives && infobox.relatives.length > 0) {
    lines.push(`| **Relatives** | ${infobox.relatives.join(', ')} |`);
  }

  if (infobox.abilities && infobox.abilities.length > 0) {
    lines.push(`| **Abilities** | ${infobox.abilities.join(', ')} |`);
  }

  if (infobox.items && infobox.items.length > 0) {
    lines.push(`| **Items** | ${infobox.items.join(', ')} |`);
  }

  if (infobox.aliases && infobox.aliases.length > 0) {
    lines.push(`| **Aliases** | ${infobox.aliases.join(', ')} |`);
  }

  if (infobox.firstAppearance) {
    lines.push(`| **First Appearance** | ${infobox.firstAppearance} |`);
  }

  if (infobox.lastAppearance) {
    lines.push(`| **Last Appearance** | ${infobox.lastAppearance} |`);
  }

  return lines.join('\n');
}

/**
 * Render a section with sentences
 */
function renderSection(title: string, sentences: string[]): string {
  if (sentences.length === 0) {
    return ''; // Don't render empty sections
  }

  const lines: string[] = [];
  lines.push(`## ${title}`);
  lines.push('');

  for (const sentence of sentences) {
    lines.push(sentence);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Convert WikiPage to Markdown
 */
export function toMarkdownPage(page: WikiPage): string {
  const sections: string[] = [];

  // Title
  sections.push(`# ${page.infobox.name}`);
  sections.push('');

  // Infobox
  sections.push(renderInfobox(page.infobox));
  sections.push('');

  // Overview
  if (page.overview) {
    sections.push('## Overview');
    sections.push('');
    sections.push(page.overview);
    sections.push('');
  }

  // Biography (new timeline-based paragraph)
  if (page.biography) {
    sections.push('## Biography');
    sections.push('');
    sections.push(page.biography);
    sections.push('');
  }

  // Relationships (now with suppression logic)
  const relationships = renderSection('Relationships', page.sections.relationships);
  if (relationships) {
    sections.push(relationships);
  }

  // Abilities
  const abilities = renderSection('Abilities', page.sections.abilities);
  if (abilities) {
    sections.push(abilities);
  }

  // Items
  const items = renderSection('Items', page.sections.items);
  if (items) {
    sections.push(items);
  }

  // Affiliations
  const affiliations = renderSection('Affiliations', page.sections.affiliations);
  if (affiliations) {
    sections.push(affiliations);
  }

  // Disputed
  const disputed = renderSection('Disputed Claims', page.sections.disputed);
  if (disputed) {
    sections.push(disputed);
  }

  return sections.join('\n').trim() + '\n';
}

/**
 * Main entry point: generate markdown page for an entity
 */
export function generateMarkdownPage(
  entityId: string,
  entities: any[],
  relations: any[],
  conflicts: any[]
): string {
  // Import compose function here to avoid circular dependency
  const { compose } = require('./exposition');

  const page = compose(entityId, entities, relations, conflicts);
  return toMarkdownPage(page);
}
