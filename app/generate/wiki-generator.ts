/**
 * Wiki Page Generator
 *
 * Generates Fandom-style wiki pages from HERT data
 * - Type-specific templates (PERSON, PLACE, ORG, EVENT, etc.)
 * - Data-only generation (no hallucination)
 * - Source citations for all claims
 */

import type { EntityType } from '../engine/schema';
import type { HERTQuery, EntitySearchResult, EntityMention, RelationshipResult } from '../api/hert-query';
import { decodeHERT } from '../engine/hert';

export interface WikiPageOptions {
  includeSourceQuotes?: boolean;
  maxQuotesPerSection?: number;
  includeCitations?: boolean;
}

export interface WikiSection {
  title: string;
  content: string;
  subsections?: WikiSection[];
}

export interface WikiPage {
  title: string;
  entityType: EntityType;
  infobox: Record<string, string | string[]>;
  sections: WikiSection[];
  categories: string[];
}

/**
 * Main wiki generator class
 */
export class WikiGenerator {
  constructor(private queryAPI: HERTQuery) {}

  /**
   * Generate a complete wiki page for an entity
   */
  generatePage(eid: number, options: WikiPageOptions = {}): WikiPage | null {
    const entity = this.queryAPI.findEntityByEID(eid);
    if (!entity) return null;

    const opts = {
      includeSourceQuotes: options.includeSourceQuotes ?? true,
      maxQuotesPerSection: options.maxQuotesPerSection ?? 5,
      includeCitations: options.includeCitations ?? true,
    };

    // Generate type-specific page
    switch (entity.type) {
      case 'PERSON':
        return this.generatePersonPage(entity, opts);
      case 'PLACE':
        return this.generatePlacePage(entity, opts);
      case 'ORG':
        return this.generateOrgPage(entity, opts);
      case 'EVENT':
        return this.generateEventPage(entity, opts);
      case 'DATE':
        return this.generateDatePage(entity, opts);
      case 'ITEM':
        return this.generateItemPage(entity, opts);
      case 'WORK':
        return this.generateWorkPage(entity, opts);
      default:
        return this.generateGenericPage(entity, opts);
    }
  }

  /**
   * Generate Person page
   */
  private generatePersonPage(entity: EntitySearchResult, opts: WikiPageOptions): WikiPage {
    const stats = this.queryAPI.getEntityStats(entity.eid);
    const relationships = this.queryAPI.findRelationships(entity.eid);

    // Build infobox
    const infobox: Record<string, string | string[]> = {
      'Name': entity.canonical,
      'Type': 'Person',
      'Aliases': entity.aliases.length > 0 ? entity.aliases : ['None'],
      'Mentions': `${entity.mention_count} times`,
      'Documents': `${entity.document_count} documents`,
    };

    if (stats) {
      infobox['Relationships'] = `${stats.relationship_count}`;
    }

    // Build sections
    const sections: WikiSection[] = [];

    // Biography section
    const bioSection = this.generateBiographySection(entity, opts);
    if (bioSection.content) {
      sections.push(bioSection);
    }

    // Relationships section
    const relSection = this.generateRelationshipsSection(entity, relationships);
    if (relSection.content) {
      sections.push(relSection);
    }

    // Affiliations
    const affSection = this.generateAffiliationsSection(entity, relationships);
    if (affSection.content) {
      sections.push(affSection);
    }

    // Appearances
    sections.push(this.generateAppearancesSection(entity));

    // Related entities
    sections.push(this.generateRelatedSection(entity));

    return {
      title: entity.canonical,
      entityType: 'PERSON',
      infobox,
      sections,
      categories: ['People', 'Characters'],
    };
  }

  /**
   * Generate Place page
   */
  private generatePlacePage(entity: EntitySearchResult, opts: WikiPageOptions): WikiPage {
    const relationships = this.queryAPI.findRelationships(entity.eid);

    const infobox: Record<string, string | string[]> = {
      'Name': entity.canonical,
      'Type': 'Place',
      'Aliases': entity.aliases.length > 0 ? entity.aliases : ['None'],
      'Mentions': `${entity.mention_count} times`,
    };

    const sections: WikiSection[] = [];

    // Description
    sections.push(this.generateDescriptionSection(entity, opts));

    // Residents
    const residentsSection = this.generateResidentsSection(entity, relationships);
    if (residentsSection.content) {
      sections.push(residentsSection);
    }

    // Events at this location
    const eventsSection = this.generateEventsAtLocationSection(entity, relationships);
    if (eventsSection.content) {
      sections.push(eventsSection);
    }

    // Connected locations
    const connectedSection = this.generateConnectedLocationsSection(entity, relationships);
    if (connectedSection.content) {
      sections.push(connectedSection);
    }

    sections.push(this.generateAppearancesSection(entity));
    sections.push(this.generateRelatedSection(entity));

    return {
      title: entity.canonical,
      entityType: 'PLACE',
      infobox,
      sections,
      categories: ['Locations', 'Places'],
    };
  }

  /**
   * Generate Organization page
   */
  private generateOrgPage(entity: EntitySearchResult, opts: WikiPageOptions): WikiPage {
    const relationships = this.queryAPI.findRelationships(entity.eid);

    const infobox: Record<string, string | string[]> = {
      'Name': entity.canonical,
      'Type': 'Organization',
      'Aliases': entity.aliases.length > 0 ? entity.aliases : ['None'],
      'Mentions': `${entity.mention_count} times`,
      'Status': entity.mention_count > 0 ? 'Active' : 'Unknown',
    };

    const sections: WikiSection[] = [];

    sections.push(this.generateDescriptionSection(entity, opts));

    // Leadership
    const leadershipSection = this.generateLeadershipSection(entity, relationships);
    if (leadershipSection.content) {
      sections.push(leadershipSection);
    }

    // Members
    const membersSection = this.generateMembersSection(entity, relationships);
    if (membersSection.content) {
      sections.push(membersSection);
    }

    // Related organizations
    const relatedOrgsSection = this.generateRelatedOrgsSection(entity, relationships);
    if (relatedOrgsSection.content) {
      sections.push(relatedOrgsSection);
    }

    sections.push(this.generateAppearancesSection(entity));
    sections.push(this.generateRelatedSection(entity));

    return {
      title: entity.canonical,
      entityType: 'ORG',
      infobox,
      sections,
      categories: ['Organizations'],
    };
  }

  /**
   * Generate Event page
   */
  private generateEventPage(entity: EntitySearchResult, opts: WikiPageOptions): WikiPage {
    const relationships = this.queryAPI.findRelationships(entity.eid);

    const infobox: Record<string, string | string[]> = {
      'Name': entity.canonical,
      'Type': 'Event',
      'Mentions': `${entity.mention_count} times`,
    };

    const sections: WikiSection[] = [];

    sections.push(this.generateDescriptionSection(entity, opts));

    // Participants
    const participantsSection = this.generateParticipantsSection(entity, relationships);
    if (participantsSection.content) {
      sections.push(participantsSection);
    }

    // Related events
    const relatedEventsSection = this.generateRelatedEventsSection(entity, relationships);
    if (relatedEventsSection.content) {
      sections.push(relatedEventsSection);
    }

    sections.push(this.generateAppearancesSection(entity));

    return {
      title: entity.canonical,
      entityType: 'EVENT',
      infobox,
      sections,
      categories: ['Events'],
    };
  }

  /**
   * Generate Date page
   */
  private generateDatePage(entity: EntitySearchResult, opts: WikiPageOptions): WikiPage {
    const infobox: Record<string, string | string[]> = {
      'Date': entity.canonical,
      'Type': 'Date',
      'Mentions': `${entity.mention_count} times`,
    };

    const sections: WikiSection[] = [];
    sections.push(this.generateDescriptionSection(entity, opts));
    sections.push(this.generateAppearancesSection(entity));

    return {
      title: entity.canonical,
      entityType: 'DATE',
      infobox,
      sections,
      categories: ['Dates', 'Timeline'],
    };
  }

  /**
   * Generate Item page
   */
  private generateItemPage(entity: EntitySearchResult, opts: WikiPageOptions): WikiPage {
    const relationships = this.queryAPI.findRelationships(entity.eid);

    const infobox: Record<string, string | string[]> = {
      'Name': entity.canonical,
      'Type': 'Item',
      'Aliases': entity.aliases.length > 0 ? entity.aliases : ['None'],
      'Mentions': `${entity.mention_count} times`,
    };

    const sections: WikiSection[] = [];

    sections.push(this.generateDescriptionSection(entity, opts));

    // Ownership
    const ownershipSection = this.generateOwnershipSection(entity, relationships);
    if (ownershipSection.content) {
      sections.push(ownershipSection);
    }

    sections.push(this.generateAppearancesSection(entity));
    sections.push(this.generateRelatedSection(entity));

    return {
      title: entity.canonical,
      entityType: 'ITEM',
      infobox,
      sections,
      categories: ['Items', 'Objects'],
    };
  }

  /**
   * Generate Work page (books, documents, etc.)
   */
  private generateWorkPage(entity: EntitySearchResult, opts: WikiPageOptions): WikiPage {
    const relationships = this.queryAPI.findRelationships(entity.eid);

    const infobox: Record<string, string | string[]> = {
      'Title': entity.canonical,
      'Type': 'Work',
      'Mentions': `${entity.mention_count} times`,
    };

    const sections: WikiSection[] = [];

    sections.push(this.generateDescriptionSection(entity, opts));

    // Author
    const authorSection = this.generateAuthorSection(entity, relationships);
    if (authorSection.content) {
      sections.push(authorSection);
    }

    sections.push(this.generateAppearancesSection(entity));

    return {
      title: entity.canonical,
      entityType: 'WORK',
      infobox,
      sections,
      categories: ['Works', 'Literature'],
    };
  }

  /**
   * Generate generic page for unknown types
   */
  private generateGenericPage(entity: EntitySearchResult, opts: WikiPageOptions): WikiPage {
    const infobox: Record<string, string | string[]> = {
      'Name': entity.canonical,
      'Type': entity.type || 'Unknown',
      'Mentions': `${entity.mention_count} times`,
    };

    const sections: WikiSection[] = [];
    sections.push(this.generateDescriptionSection(entity, opts));
    sections.push(this.generateAppearancesSection(entity));
    sections.push(this.generateRelatedSection(entity));

    return {
      title: entity.canonical,
      entityType: entity.type || 'ITEM',
      infobox,
      sections,
      categories: ['Entities'],
    };
  }

  // ========================================
  // Section Generators
  // ========================================

  private generateBiographySection(entity: EntitySearchResult, opts: WikiPageOptions): WikiSection {
    const mentions = this.queryAPI.findMentions(entity.eid, { limit: opts.maxQuotesPerSection });

    let content = '';

    if (mentions.length > 0 && opts.includeSourceQuotes) {
      content += 'From source documents:\n\n';

      for (const mention of mentions) {
        // In a real implementation, we'd fetch the actual text from the document
        // For now, show the HERT reference
        content += `> ${mention.hert_readable}\n`;
        if (opts.includeCitations) {
          content += `> — *Document ${mention.document_id}*, paragraph ${mention.location.paragraph}\n\n`;
        }
      }
    }

    if (!content) {
      content = `${entity.canonical} is mentioned ${entity.mention_count} times across ${entity.document_count} documents.\n`;
    }

    return {
      title: 'Biography',
      content,
    };
  }

  private generateDescriptionSection(entity: EntitySearchResult, opts: WikiPageOptions): WikiSection {
    const mentions = this.queryAPI.findMentions(entity.eid, { limit: opts.maxQuotesPerSection });

    let content = `${entity.canonical} appears ${entity.mention_count} times across ${entity.document_count} documents.\n\n`;

    if (mentions.length > 0 && opts.includeSourceQuotes) {
      content += '### Source References\n\n';
      for (const mention of mentions) {
        content += `- ${mention.hert_readable}`;
        if (opts.includeCitations) {
          content += ` (*Document ${mention.document_id}, paragraph ${mention.location.paragraph}*)`;
        }
        content += '\n';
      }
    }

    return {
      title: 'Description',
      content,
    };
  }

  private generateRelationshipsSection(entity: EntitySearchResult, relationships: RelationshipResult[]): WikiSection {
    if (relationships.length === 0) {
      return { title: 'Relationships', content: '' };
    }

    // Group by relationship type
    const family: string[] = [];
    const professional: string[] = [];
    const social: string[] = [];

    for (const rel of relationships) {
      const line = this.formatRelationship(rel, entity.eid);

      if (['parent_of', 'child_of', 'sibling_of', 'married_to'].includes(rel.pred)) {
        family.push(line);
      } else if (['teaches_at', 'works_at', 'member_of', 'leads', 'attended', 'studied_at'].includes(rel.pred)) {
        professional.push(line);
      } else {
        social.push(line);
      }
    }

    let content = '';

    if (family.length > 0) {
      content += '### Family\n\n';
      family.forEach(line => content += `- ${line}\n`);
      content += '\n';
    }

    if (professional.length > 0) {
      content += '### Professional\n\n';
      professional.forEach(line => content += `- ${line}\n`);
      content += '\n';
    }

    if (social.length > 0) {
      content += '### Social\n\n';
      social.forEach(line => content += `- ${line}\n`);
      content += '\n';
    }

    return {
      title: 'Relationships',
      content: content || 'No relationships found.\n',
    };
  }

  private formatRelationship(rel: RelationshipResult, entityEID: number): string {
    const isSubject = rel.subj_eid === entityEID;
    const otherEntity = isSubject ? rel.obj_canonical : rel.subj_canonical;
    const pred = rel.pred.replace(/_/g, ' ');

    if (isSubject) {
      return `**${otherEntity}** - ${pred} (confidence: ${rel.confidence.toFixed(2)})`;
    } else {
      // Reverse relationship
      return `**${otherEntity}** - ${pred} with ${rel.subj_canonical} (confidence: ${rel.confidence.toFixed(2)})`;
    }
  }

  private generateAffiliationsSection(entity: EntitySearchResult, relationships: RelationshipResult[]): WikiSection {
    const affiliations = relationships.filter(r =>
      ['member_of', 'works_at', 'teaches_at', 'leads', 'founded'].some(pred => r.pred.includes(pred))
    );

    if (affiliations.length === 0) {
      return { title: 'Affiliations', content: '' };
    }

    let content = '';
    for (const rel of affiliations) {
      content += `- **${rel.obj_canonical}** - ${rel.pred.replace(/_/g, ' ')}\n`;
    }

    return {
      title: 'Affiliations',
      content,
    };
  }

  private generateAppearancesSection(entity: EntitySearchResult): WikiSection {
    const mentions = this.queryAPI.findMentions(entity.eid);

    // Group by document
    const byDoc = new Map<string, number>();
    for (const mention of mentions) {
      byDoc.set(mention.document_id, (byDoc.get(mention.document_id) || 0) + 1);
    }

    let content = `Total mentions: ${entity.mention_count} across ${entity.document_count} documents\n\n`;

    if (byDoc.size > 0) {
      content += '| Document | Mentions |\n';
      content += '|----------|----------|\n';

      for (const [docId, count] of Array.from(byDoc.entries()).sort((a, b) => b[1] - a[1])) {
        content += `| ${docId} | ${count} |\n`;
      }
    }

    return {
      title: 'Appearances',
      content,
    };
  }

  private generateRelatedSection(entity: EntitySearchResult): WikiSection {
    const cooccurrences = this.queryAPI.findCooccurrences(entity.eid, { limit: 10 });

    if (cooccurrences.length === 0) {
      return {
        title: 'Related Entities',
        content: 'No related entities found.\n',
      };
    }

    let content = '';
    for (const cooccur of cooccurrences) {
      content += `- **${cooccur.entity2_canonical}** (co-occurs ${cooccur.cooccurrence_count} times)\n`;
    }

    return {
      title: 'Related Entities',
      content,
    };
  }

  private generateResidentsSection(entity: EntitySearchResult, relationships: RelationshipResult[]): WikiSection {
    const residents = relationships.filter(r => r.pred === 'lives_in' && r.obj_eid === entity.eid);

    if (residents.length === 0) {
      return { title: 'Residents', content: '' };
    }

    let content = '';
    for (const rel of residents) {
      content += `- ${rel.subj_canonical}\n`;
    }

    return {
      title: 'Residents',
      content,
    };
  }

  private generateEventsAtLocationSection(entity: EntitySearchResult, relationships: RelationshipResult[]): WikiSection {
    const events = relationships.filter(r =>
      ['fought_in', 'occurred_at'].some(pred => r.pred.includes(pred)) && r.obj_eid === entity.eid
    );

    if (events.length === 0) {
      return { title: 'Events', content: '' };
    }

    let content = '';
    for (const rel of events) {
      content += `- **${rel.subj_canonical}** - ${rel.pred.replace(/_/g, ' ')}\n`;
    }

    return {
      title: 'Events',
      content,
    };
  }

  private generateConnectedLocationsSection(entity: EntitySearchResult, relationships: RelationshipResult[]): WikiSection {
    const locations = relationships.filter(r =>
      r.pred === 'part_of'
    );

    if (locations.length === 0) {
      return { title: 'Connected Locations', content: '' };
    }

    let content = '';
    for (const rel of locations) {
      const other = rel.subj_eid === entity.eid ? rel.obj_canonical : rel.subj_canonical;
      content += `- **${other}** - ${rel.pred.replace(/_/g, ' ')}\n`;
    }

    return {
      title: 'Connected Locations',
      content,
    };
  }

  private generateLeadershipSection(entity: EntitySearchResult, relationships: RelationshipResult[]): WikiSection {
    const leaders = relationships.filter(r => r.pred === 'leads' && r.obj_eid === entity.eid);

    if (leaders.length === 0) {
      return { title: 'Leadership', content: '' };
    }

    let content = '';
    for (const rel of leaders) {
      content += `- **${rel.subj_canonical}** - Leader\n`;
    }

    return {
      title: 'Leadership',
      content,
    };
  }

  private generateMembersSection(entity: EntitySearchResult, relationships: RelationshipResult[]): WikiSection {
    const members = relationships.filter(r => r.pred === 'member_of' && r.obj_eid === entity.eid);

    if (members.length === 0) {
      return { title: 'Members', content: '' };
    }

    let content = '';
    for (const rel of members) {
      content += `- ${rel.subj_canonical}\n`;
    }

    return {
      title: 'Members',
      content,
    };
  }

  private generateRelatedOrgsSection(entity: EntitySearchResult, relationships: RelationshipResult[]): WikiSection {
    const orgs = relationships.filter(r =>
      ['part_of', 'partner_with', 'acquired'].includes(r.pred)
    );

    if (orgs.length === 0) {
      return { title: 'Related Organizations', content: '' };
    }

    let content = '';
    for (const rel of orgs) {
      const other = rel.subj_eid === entity.eid ? rel.obj_canonical : rel.subj_canonical;
      content += `- **${other}** - ${rel.pred.replace(/_/g, ' ')}\n`;
    }

    return {
      title: 'Related Organizations',
      content,
    };
  }

  private generateParticipantsSection(entity: EntitySearchResult, relationships: RelationshipResult[]): WikiSection {
    const participants = relationships.filter(r =>
      r.obj_eid === entity.eid && ['fought_in', 'attended', 'participated_in'].some(pred => r.pred.includes(pred))
    );

    if (participants.length === 0) {
      return { title: 'Participants', content: '' };
    }

    let content = '';
    for (const rel of participants) {
      content += `- **${rel.subj_canonical}**\n`;
    }

    return {
      title: 'Participants',
      content,
    };
  }

  private generateRelatedEventsSection(entity: EntitySearchResult, relationships: RelationshipResult[]): WikiSection {
    const events = relationships.filter(r => r.subj_eid === entity.eid || r.obj_eid === entity.eid);

    if (events.length === 0) {
      return { title: 'Related Events', content: '' };
    }

    let content = '';
    for (const rel of events) {
      const other = rel.subj_eid === entity.eid ? rel.obj_canonical : rel.subj_canonical;
      content += `- **${other}** - ${rel.pred.replace(/_/g, ' ')}\n`;
    }

    return {
      title: 'Related Events',
      content,
    };
  }

  private generateOwnershipSection(entity: EntitySearchResult, relationships: RelationshipResult[]): WikiSection {
    const owners = relationships.filter(r => r.pred === 'owns' && r.obj_eid === entity.eid);

    if (owners.length === 0) {
      return { title: 'Ownership', content: '' };
    }

    let content = '';
    for (const rel of owners) {
      content += `- **${rel.subj_canonical}** - Owner\n`;
    }

    return {
      title: 'Ownership',
      content,
    };
  }

  private generateAuthorSection(entity: EntitySearchResult, relationships: RelationshipResult[]): WikiSection {
    const authors = relationships.filter(r => r.pred === 'authored' && r.obj_eid === entity.eid);

    if (authors.length === 0) {
      return { title: 'Author', content: '' };
    }

    let content = '';
    for (const rel of authors) {
      content += `- **${rel.subj_canonical}**\n`;
    }

    return {
      title: 'Author',
      content,
    };
  }
}

/**
 * Convert WikiPage to Markdown
 */
export function renderWikiPageToMarkdown(page: WikiPage): string {
  let markdown = '';

  // Title
  markdown += `# ${page.title}\n\n`;

  // Infobox (as table)
  markdown += '## Quick Info\n\n';
  markdown += '| | |\n';
  markdown += '|---|---|\n';

  for (const [key, value] of Object.entries(page.infobox)) {
    const valueStr = Array.isArray(value) ? value.join(', ') : value;
    markdown += `| **${key}** | ${valueStr} |\n`;
  }

  markdown += '\n';

  // Sections
  for (const section of page.sections) {
    if (!section.content) continue;

    markdown += `## ${section.title}\n\n`;
    markdown += section.content;
    markdown += '\n';

    // Subsections
    if (section.subsections) {
      for (const subsection of section.subsections) {
        if (!subsection.content) continue;

        markdown += `### ${subsection.title}\n\n`;
        markdown += subsection.content;
        markdown += '\n';
      }
    }
  }

  // Categories (footer)
  if (page.categories.length > 0) {
    markdown += '---\n\n';
    markdown += `**Categories:** ${page.categories.join(' | ')}\n`;
  }

  return markdown;
}
