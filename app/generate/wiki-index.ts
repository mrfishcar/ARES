/**
 * Wiki Index Generator
 *
 * Creates listing/index pages for wiki:
 * - Category pages (all People, all Places, etc.)
 * - Alphabetical indexes
 * - Statistics pages
 */

import type { EntityType } from '../engine/schema';
import type { HERTQuery } from '../api/hert-query';

export interface IndexPage {
  title: string;
  content: string;
}

/**
 * Wiki Index Generator
 */
export class WikiIndexGenerator {
  constructor(private queryAPI: HERTQuery) {}

  /**
   * Generate category index (e.g., "All People")
   */
  generateCategoryIndex(entityType: EntityType): IndexPage {
    const entities = this.queryAPI.findEntitiesByType(entityType);

    // Sort by name
    const sorted = entities.sort((a, b) => a.canonical.localeCompare(b.canonical));

    let content = `# ${this.getTypeName(entityType)}\n\n`;
    content += `Total: ${entities.length}\n\n`;

    if (entities.length === 0) {
      content += '*No entities of this type found.*\n';
      return { title: this.getTypeName(entityType), content };
    }

    // Group by first letter
    const byLetter = new Map<string, typeof entities>();
    for (const entity of sorted) {
      const firstLetter = entity.canonical[0].toUpperCase();
      if (!byLetter.has(firstLetter)) {
        byLetter.set(firstLetter, []);
      }
      byLetter.get(firstLetter)!.push(entity);
    }

    // Generate alphabetical index
    for (const [letter, letterEntities] of Array.from(byLetter.entries()).sort()) {
      content += `## ${letter}\n\n`;

      for (const entity of letterEntities) {
        content += `- **[${entity.canonical}](${this.slugify(entity.canonical)}.md)** - ${entity.mention_count} mentions`;

        if (entity.aliases.length > 0) {
          content += ` *(aka: ${entity.aliases.slice(0, 2).join(', ')}${entity.aliases.length > 2 ? '...' : ''})*`;
        }

        content += '\n';
      }

      content += '\n';
    }

    return {
      title: this.getTypeName(entityType),
      content,
    };
  }

  /**
   * Generate main index page
   */
  generateMainIndex(): IndexPage {
    const stats = this.queryAPI.getGlobalStats();

    let content = '# Wiki Index\n\n';
    content += 'Welcome to the auto-generated wiki!\n\n';

    content += '## Statistics\n\n';
    content += `- **Total Entities:** ${stats.total_entities}\n`;
    content += `- **Total Relationships:** ${stats.total_relationships}\n`;
    content += `- **Total Mentions (HERTs):** ${stats.total_herts}\n`;
    content += `- **Documents Processed:** ${stats.total_documents}\n`;
    content += `- **Aliases Tracked:** ${stats.total_aliases}\n`;
    content += `- **Disambiguated Senses:** ${stats.total_senses}\n\n`;

    content += '## Browse by Type\n\n';

    const types: EntityType[] = ['PERSON', 'ORG', 'PLACE', 'EVENT', 'DATE', 'ITEM', 'WORK', 'SPECIES', 'HOUSE', 'TRIBE', 'TITLE'];

    for (const type of types) {
      const entities = this.queryAPI.findEntitiesByType(type);
      if (entities.length > 0) {
        const typeName = this.getTypeName(type);
        content += `- **[${typeName}](${this.slugify(typeName)}.md)** (${entities.length} entities)\n`;
      }
    }

    content += '\n## Top Entities by Mentions\n\n';

    // Get all entities and sort by mention count
    const allPeople = this.queryAPI.findEntitiesByType('PERSON');
    const allOrgs = this.queryAPI.findEntitiesByType('ORG');
    const allPlaces = this.queryAPI.findEntitiesByType('PLACE');

    const allEntities = [...allPeople, ...allOrgs, ...allPlaces];
    const topEntities = allEntities.sort((a, b) => b.mention_count - a.mention_count).slice(0, 20);

    content += '| Rank | Name | Type | Mentions |\n';
    content += '|------|------|------|----------|\n';

    topEntities.forEach((entity, i) => {
      content += `| ${i + 1} | [${entity.canonical}](${this.slugify(entity.canonical)}.md) | ${entity.type} | ${entity.mention_count} |\n`;
    });

    content += '\n## Recently Added\n\n';
    content += '*Note: Tracking coming soon*\n\n';

    return {
      title: 'Wiki Index',
      content,
    };
  }

  /**
   * Generate "all pages" alphabetical list
   */
  generateAllPagesIndex(): IndexPage {
    const types: EntityType[] = ['PERSON', 'ORG', 'PLACE', 'EVENT', 'DATE', 'ITEM', 'WORK'];
    const allEntities: Array<{ canonical: string; type: EntityType; mention_count: number }> = [];

    for (const type of types) {
      const entities = this.queryAPI.findEntitiesByType(type);
      allEntities.push(...entities.map(e => ({ canonical: e.canonical, type: e.type || type, mention_count: e.mention_count })));
    }

    // Sort alphabetically
    allEntities.sort((a, b) => a.canonical.localeCompare(b.canonical));

    let content = '# All Pages\n\n';
    content += `Total pages: ${allEntities.length}\n\n`;

    // Group by first letter
    const byLetter = new Map<string, typeof allEntities>();
    for (const entity of allEntities) {
      const firstLetter = entity.canonical[0].toUpperCase();
      if (!byLetter.has(firstLetter)) {
        byLetter.set(firstLetter, []);
      }
      byLetter.get(firstLetter)!.push(entity);
    }

    // Generate quick navigation
    content += '**Quick Navigation:** ';
    content += Array.from(byLetter.keys()).sort().map(letter => `[${letter}](#${letter})`).join(' | ');
    content += '\n\n';

    // Generate alphabetical list
    for (const [letter, letterEntities] of Array.from(byLetter.entries()).sort()) {
      content += `## ${letter}\n\n`;

      for (const entity of letterEntities) {
        content += `- [${entity.canonical}](${this.slugify(entity.canonical)}.md) *(${entity.type})*\n`;
      }

      content += '\n';
    }

    return {
      title: 'All Pages',
      content,
    };
  }

  /**
   * Generate statistics page
   */
  generateStatsPage(): IndexPage {
    const stats = this.queryAPI.getGlobalStats();

    let content = '# Wiki Statistics\n\n';

    content += '## Overall Statistics\n\n';
    content += `- **Total Entities:** ${stats.total_entities}\n`;
    content += `- **Total Relationships:** ${stats.total_relationships}\n`;
    content += `- **Total Mentions (HERTs):** ${stats.total_herts}\n`;
    content += `- **Documents Processed:** ${stats.total_documents}\n`;
    content += `- **Aliases Tracked:** ${stats.total_aliases}\n`;
    content += `- **Disambiguated Senses:** ${stats.total_senses}\n\n`;

    content += '## Entities by Type\n\n';

    const types: EntityType[] = ['PERSON', 'ORG', 'PLACE', 'EVENT', 'DATE', 'ITEM', 'WORK', 'SPECIES', 'HOUSE', 'TRIBE', 'TITLE'];

    content += '| Type | Count |\n';
    content += '|------|-------|\n';

    for (const type of types) {
      const entities = this.queryAPI.findEntitiesByType(type);
      if (entities.length > 0) {
        content += `| ${this.getTypeName(type)} | ${entities.length} |\n`;
      }
    }

    content += '\n## Relationship Types\n\n';
    content += `Total relationships: ${stats.total_relationships}\n\n`;
    content += '*Breakdown by predicate coming soon*\n\n';

    content += '## Coverage Statistics\n\n';
    const avgMentionsPerEntity = stats.total_entities > 0 ? (stats.total_herts / stats.total_entities).toFixed(2) : '0';
    const avgRelationshipsPerEntity = stats.total_entities > 0 ? (stats.total_relationships / stats.total_entities).toFixed(2) : '0';

    content += `- **Average mentions per entity:** ${avgMentionsPerEntity}\n`;
    content += `- **Average relationships per entity:** ${avgRelationshipsPerEntity}\n`;
    content += `- **Entities with aliases:** ${stats.total_aliases}\n`;
    content += `- **Entities with multiple senses:** ${stats.total_senses}\n\n`;

    return {
      title: 'Statistics',
      content,
    };
  }

  /**
   * Helper: Get friendly name for entity type
   */
  private getTypeName(type: EntityType): string {
    const names: Record<EntityType, string> = {
      'PERSON': 'People',
      'ORG': 'Organizations',
      'PLACE': 'Places',
      'EVENT': 'Events',
      'DATE': 'Dates',
      'TIME': 'Times',
      'ITEM': 'Items',
      'OBJECT': 'Objects',
      'WORK': 'Works',
      'MISC': 'Misc',
      'SPECIES': 'Species',
      'HOUSE': 'Houses',
      'TRIBE': 'Tribes',
      'TITLE': 'Titles',
      'RACE': 'Races',
      'CREATURE': 'Creatures',
      'ARTIFACT': 'Artifacts',
      'TECHNOLOGY': 'Technology',
      'MAGIC': 'Magic',
      'LANGUAGE': 'Languages',
      'CURRENCY': 'Currency',
      'MATERIAL': 'Materials',
      'DRUG': 'Drugs & Potions',
      'DEITY': 'Deities',
      'ABILITY': 'Abilities',
      'SKILL': 'Skills',
      'POWER': 'Powers',
      'TECHNIQUE': 'Techniques',
      'SPELL': 'Spells',
    };
    return names[type] || type;
  }

  /**
   * Helper: Convert name to URL-safe slug
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
