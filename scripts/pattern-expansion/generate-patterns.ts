/**
 * Comprehensive Pattern Generator
 *
 * Generates surface and dependency patterns for all 15 relation families,
 * with de-duplication against existing patterns.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  computeSignature,
  PatternSignature,
  SurfacePattern,
  DependencyPattern,
  signaturesMatch
} from './pattern-signature';

interface RelationFamily {
  name: string;
  code: string;
  predicates: string[];
  lexicon: {
    verbs: string[];
    nouns: string[];
    prepositions: string[];
  };
}

interface GenerationConfig {
  max_per_family: number;
  neg_ratio: number;
  hedge_ratio: number;
  skip_if_signature_exists: boolean;
}

const DEFAULT_CONFIG: GenerationConfig = {
  max_per_family: 20,
  neg_ratio: 0.2,
  hedge_ratio: 0.1,
  skip_if_signature_exists: true
};

/**
 * Define all 15 relation families with lexicons
 */
const RELATION_FAMILIES: RelationFamily[] = [
  // A. Kinship / Family Relations
  {
    name: 'Kinship / Family Relations',
    code: 'kinship',
    predicates: ['parent_of', 'child_of', 'sibling_of', 'married_to', 'cousin_of', 'ancestor_of', 'descendant_of'],
    lexicon: {
      verbs: ['married', 'wed', 'begat', 'fathered', 'mothered', 'born', 'related'],
      nouns: ['father', 'mother', 'parent', 'son', 'daughter', 'child', 'offspring', 'sibling', 'brother', 'sister', 'spouse', 'wife', 'husband', 'cousin', 'ancestor', 'descendant', 'heir', 'family'],
      prepositions: ['of', 'to', 'with']
    }
  },

  // B. Ownership / Possession
  {
    name: 'Ownership / Possession',
    code: 'ownership',
    predicates: ['owns', 'owned_by', 'belongs_to', 'property_of', 'possessed_by'],
    lexicon: {
      verbs: ['owns', 'owned', 'possesses', 'possessed', 'belongs', 'acquired', 'holds', 'controls'],
      nouns: ['owner', 'property', 'possession', 'asset', 'belongings', 'estate'],
      prepositions: ['of', 'by', 'to']
    }
  },

  // C. Employment / Affiliation
  {
    name: 'Employment / Affiliation',
    code: 'employment',
    predicates: ['works_for', 'employed_by', 'member_of', 'affiliated_with', 'partner_at', 'serves'],
    lexicon: {
      verbs: ['works', 'employed', 'serves', 'affiliated', 'joined', 'manages', 'leads', 'directs'],
      nouns: ['employee', 'employer', 'member', 'partner', 'staff', 'team', 'colleague', 'manager', 'director'],
      prepositions: ['for', 'by', 'at', 'with', 'of']
    }
  },

  // D. Creation / Authorship
  {
    name: 'Creation / Authorship',
    code: 'creation',
    predicates: ['created_by', 'authored', 'written_by', 'invented_by', 'painted_by', 'built_by', 'composed_by', 'designed_by'],
    lexicon: {
      verbs: ['created', 'authored', 'wrote', 'invented', 'painted', 'built', 'composed', 'designed', 'crafted', 'produced'],
      nouns: ['author', 'creator', 'inventor', 'painter', 'builder', 'composer', 'designer', 'artist', 'work', 'creation'],
      prepositions: ['by', 'of']
    }
  },

  // E. Location / Spatial
  {
    name: 'Location / Spatial',
    code: 'location',
    predicates: ['located_in', 'located_at', 'near', 'within', 'across_from', 'adjacent_to', 'based_in', 'north_of', 'south_of'],
    lexicon: {
      verbs: ['located', 'situated', 'positioned', 'placed', 'stands', 'lies', 'resides'],
      nouns: ['location', 'place', 'position', 'site', 'area', 'region'],
      prepositions: ['in', 'at', 'near', 'by', 'within', 'across', 'beside', 'adjacent', 'north', 'south', 'east', 'west']
    }
  },

  // F. Temporal
  {
    name: 'Temporal',
    code: 'temporal',
    predicates: ['before', 'after', 'during', 'since', 'until', 'on', 'between'],
    lexicon: {
      verbs: ['preceded', 'followed', 'occurred', 'happened', 'began', 'ended'],
      nouns: ['time', 'date', 'period', 'era', 'moment', 'year', 'day'],
      prepositions: ['before', 'after', 'during', 'since', 'until', 'on', 'between']
    }
  },

  // G. Causation / Influence
  {
    name: 'Causation / Influence',
    code: 'causation',
    predicates: ['caused_by', 'led_to', 'influenced_by', 'resulted_from', 'due_to', 'triggered_by'],
    lexicon: {
      verbs: ['caused', 'led', 'influenced', 'resulted', 'triggered', 'sparked', 'prompted', 'induced'],
      nouns: ['cause', 'result', 'consequence', 'effect', 'influence', 'impact'],
      prepositions: ['by', 'to', 'from', 'due']
    }
  },

  // H. Part–Whole / Component
  {
    name: 'Part–Whole / Component',
    code: 'part_whole',
    predicates: ['part_of', 'consists_of', 'includes', 'contains', 'made_of', 'comprises'],
    lexicon: {
      verbs: ['comprises', 'consists', 'includes', 'contains', 'made', 'composed'],
      nouns: ['part', 'component', 'piece', 'element', 'portion', 'section', 'member'],
      prepositions: ['of', 'in', 'within']
    }
  },

  // I. Equivalence / Identity
  {
    name: 'Equivalence / Identity',
    code: 'identity',
    predicates: ['is', 'equals', 'same_as', 'alias_of', 'also_known_as', 'represents'],
    lexicon: {
      verbs: ['is', 'equals', 'represents', 'symbolizes', 'denotes', 'means'],
      nouns: ['alias', 'name', 'title', 'equivalent', 'equal'],
      prepositions: ['as', 'to']
    }
  },

  // J. Event Participation
  {
    name: 'Event Participation',
    code: 'event',
    predicates: ['attended', 'participated_in', 'hosted', 'performed_at', 'witnessed', 'organized'],
    lexicon: {
      verbs: ['attended', 'participated', 'hosted', 'performed', 'witnessed', 'organized', 'joined', 'watched'],
      nouns: ['participant', 'attendee', 'host', 'performer', 'witness', 'organizer', 'event', 'ceremony'],
      prepositions: ['at', 'in', 'during']
    }
  },

  // K. Communication
  {
    name: 'Communication',
    code: 'communication',
    predicates: ['told', 'said_to', 'wrote_to', 'asked', 'informed', 'replied', 'reported', 'spoke_to'],
    lexicon: {
      verbs: ['told', 'said', 'wrote', 'asked', 'informed', 'replied', 'reported', 'spoke', 'communicated', 'contacted'],
      nouns: ['message', 'letter', 'speech', 'communication', 'conversation', 'dialogue'],
      prepositions: ['to', 'with', 'about']
    }
  },

  // L. Power / Control
  {
    name: 'Power / Control',
    code: 'power',
    predicates: ['controlled_by', 'ruled_by', 'commanded_by', 'managed_by', 'governed_by', 'led_by'],
    lexicon: {
      verbs: ['controlled', 'ruled', 'commanded', 'managed', 'governed', 'led', 'dominated', 'directed'],
      nouns: ['ruler', 'king', 'queen', 'leader', 'commander', 'governor', 'master', 'chief'],
      prepositions: ['by', 'over', 'of']
    }
  },

  // M. Measurement / Comparison
  {
    name: 'Measurement / Comparison',
    code: 'comparison',
    predicates: ['greater_than', 'less_than', 'equal_to', 'higher_than', 'similar_to', 'different_from'],
    lexicon: {
      verbs: ['exceeds', 'surpasses', 'equals', 'matches', 'resembles', 'differs'],
      nouns: ['greater', 'less', 'equal', 'higher', 'lower', 'similar', 'different'],
      prepositions: ['than', 'to', 'from']
    }
  },

  // N. Emotional / Social
  {
    name: 'Emotional / Social',
    code: 'emotional',
    predicates: ['loved', 'hated', 'respected', 'disliked', 'admired', 'envied', 'feared'],
    lexicon: {
      verbs: ['loved', 'hated', 'respected', 'disliked', 'admired', 'envied', 'feared', 'trusted', 'despised'],
      nouns: ['lover', 'friend', 'enemy', 'rival', 'admirer'],
      prepositions: ['by', 'of']
    }
  },

  // O. Negation / Uncertainty
  {
    name: 'Negation / Uncertainty',
    code: 'negation',
    predicates: ['not_related_to', 'alleged', 'rumored', 'denied', 'disputed', 'uncertain_link'],
    lexicon: {
      verbs: ['denied', 'disputed', 'alleged', 'rumored', 'claimed', 'doubted'],
      nouns: ['allegation', 'rumor', 'denial', 'dispute', 'claim'],
      prepositions: ['to', 'about', 'regarding']
    }
  }
];

/**
 * Generate surface pattern templates for a given family
 */
function generateSurfaceTemplates(family: RelationFamily, config: GenerationConfig): string[] {
  const templates: string[] = [];
  const { verbs, nouns, prepositions } = family.lexicon;

  // Pattern type 1: X <verb> Y
  for (const verb of verbs.slice(0, 3)) {
    templates.push(`\\b([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*) ${verb} ([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*)`);
  }

  // Pattern type 2: X, <noun> of Y
  for (const noun of nouns.slice(0, 3)) {
    templates.push(`\\b([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*)\\s*,?\\s+${noun} of ([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*)`);
  }

  // Pattern type 3: X <verb> <prep> Y
  for (const verb of verbs.slice(0, 2)) {
    for (const prep of prepositions.slice(0, 2)) {
      templates.push(`\\b([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*) ${verb} ${prep} ([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*)`);
    }
  }

  // Pattern type 4: X and Y <verb> (symmetric)
  for (const verb of verbs.slice(0, 2)) {
    templates.push(`\\b([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*) and ([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*) ${verb}`);
  }

  // Pattern type 5: X was <verb>ed by Y (passive)
  for (const verb of verbs.slice(0, 2)) {
    templates.push(`\\b([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*) (?:was|is) ${verb}(?:ed)? by ([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*)`);
  }

  // Add hard negatives (20%)
  const negCount = Math.floor(templates.length * config.neg_ratio);
  for (let i = 0; i < negCount && i < verbs.length; i++) {
    templates.push(`\\b([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*) (?:not|never) ${verbs[i]} ([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*)`);
  }

  // Add hedged patterns (10%)
  const hedgeCount = Math.floor(templates.length * config.hedge_ratio);
  for (let i = 0; i < hedgeCount && i < verbs.length; i++) {
    templates.push(`\\b([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*) (?:allegedly|reportedly|possibly) ${verbs[i]} ([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*)`);
  }

  return templates.slice(0, config.max_per_family);
}

/**
 * Generate dependency pattern templates for a given family
 */
function generateDependencyTemplates(family: RelationFamily, config: GenerationConfig): string[] {
  const templates: string[] = [];
  const { verbs, nouns, prepositions } = family.lexicon;

  // Pattern type 1: nsubj-verb-obj (X verbs Y)
  for (const verb of verbs.slice(0, 3)) {
    templates.push(`(\\w+):↑nsubj:${verb}:↓(?:dobj|obj):(\\w+)`);
  }

  // Pattern type 2: appositive with noun (X, noun of Y)
  for (const noun of nouns.slice(0, 3)) {
    for (const prep of prepositions.slice(0, 2)) {
      templates.push(`(\\w+):↑appos:${noun}:↓prep:${prep}:↓pobj:(\\w+)`);
    }
  }

  // Pattern type 3: passive (X is verbed by Y)
  for (const verb of verbs.slice(0, 2)) {
    templates.push(`(\\w+):↑nsubjpass:${verb}:↓agent:by:↓pobj:(\\w+)`);
  }

  // Pattern type 4: possessive (X's noun Y)
  for (const noun of nouns.slice(0, 2)) {
    templates.push(`${noun}:↓poss:(\\w+)`);
  }

  // Pattern type 5: copula construction (X is noun of Y)
  for (const noun of nouns.slice(0, 2)) {
    for (const prep of prepositions.slice(0, 2)) {
      templates.push(`(\\w+):↑nsubj:be:↓attr:${noun}:↓prep:${prep}:↓pobj:(\\w+)`);
    }
  }

  return templates.slice(0, config.max_per_family);
}

/**
 * Generate patterns for all families
 */
export async function generatePatterns(
  existingSignatures: Map<string, PatternSignature>,
  config: GenerationConfig = DEFAULT_CONFIG
): Promise<{
  surface: SurfacePattern[];
  dependency: DependencyPattern[];
  stats: { generated: number; skipped: number; by_family: Record<string, { new: number; skipped: number }> };
}> {
  const newSurface: SurfacePattern[] = [];
  const newDependency: DependencyPattern[] = [];
  const stats = {
    generated: 0,
    skipped: 0,
    by_family: {} as Record<string, { new: number; skipped: number }>
  };

  console.log('\n=== Generating New Patterns ===\n');

  for (const family of RELATION_FAMILIES) {
    console.log(`\n${family.name} (${family.code}):`);

    const familyStats = { new: 0, skipped: 0 };

    // Generate surface patterns
    const surfaceTemplates = generateSurfaceTemplates(family, config);
    for (let i = 0; i < surfaceTemplates.length; i++) {
      const template = surfaceTemplates[i];
      const predicate = family.predicates[i % family.predicates.length];

      const sig = computeSignature(template, predicate, family.code, 'surface');

      // Check for duplicates
      let isDuplicate = false;
      if (config.skip_if_signature_exists) {
        for (const existing of existingSignatures.values()) {
          if (signaturesMatch(sig, existing)) {
            isDuplicate = true;
            break;
          }
        }
      }

      if (isDuplicate) {
        familyStats.skipped++;
        stats.skipped++;
      } else {
        newSurface.push({
          id: `new_surf_${family.code}_${String(i).padStart(3, '0')}`,
          regex: template,
          predicate,
          family: family.code,
          lemma_form: template.toLowerCase(),
          examples: []
        });
        existingSignatures.set(sig.hash, sig);
        familyStats.new++;
        stats.generated++;
      }
    }

    // Generate dependency patterns
    const depTemplates = generateDependencyTemplates(family, config);
    for (let i = 0; i < depTemplates.length; i++) {
      const template = depTemplates[i];
      const predicate = family.predicates[i % family.predicates.length];

      const sig = computeSignature(template, predicate, family.code, 'dependency');

      // Check for duplicates
      let isDuplicate = false;
      if (config.skip_if_signature_exists) {
        for (const existing of existingSignatures.values()) {
          if (signaturesMatch(sig, existing)) {
            isDuplicate = true;
            break;
          }
        }
      }

      if (isDuplicate) {
        familyStats.skipped++;
        stats.skipped++;
      } else {
        newDependency.push({
          id: `new_dep_${family.code}_${String(i).padStart(3, '0')}`,
          signature_regex: template,
          predicate,
          family: family.code,
          dep_roles: [],
          lemmas: [],
          examples: []
        });
        existingSignatures.set(sig.hash, sig);
        familyStats.new++;
        stats.generated++;
      }
    }

    stats.by_family[family.code] = familyStats;
    console.log(`  ✓ Generated: ${familyStats.new}, Skipped (duplicate): ${familyStats.skipped}`);
  }

  console.log(`\n✓ Total generated: ${stats.generated}`);
  console.log(`✓ Total skipped: ${stats.skipped}`);

  return { surface: newSurface, dependency: newDependency, stats };
}

/**
 * Save generated patterns
 */
export async function savePatterns(
  surface: SurfacePattern[],
  dependency: DependencyPattern[],
  stats: any
): Promise<void> {
  const outputDir = path.join(process.cwd(), 'patterns');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(outputDir, 'new_surface_patterns.json'),
    JSON.stringify(surface, null, 2)
  );

  fs.writeFileSync(
    path.join(outputDir, 'new_dependency_patterns.json'),
    JSON.stringify(dependency, null, 2)
  );

  fs.writeFileSync(
    path.join(outputDir, 'generation_stats.json'),
    JSON.stringify(stats, null, 2)
  );

  console.log(`\n✓ Saved patterns to ${outputDir}/`);
}

// Main execution
if (require.main === module) {
  // Load existing signatures
  const signaturesPath = path.join(process.cwd(), 'patterns/_signatures_all_relations.json');
  const existingSignatures = new Map<string, PatternSignature>();

  if (fs.existsSync(signaturesPath)) {
    const data = JSON.parse(fs.readFileSync(signaturesPath, 'utf8'));
    for (const sig of data) {
      existingSignatures.set(sig.hash, sig);
    }
    console.log(`Loaded ${existingSignatures.size} existing signatures`);
  }

  generatePatterns(existingSignatures)
    .then(({ surface, dependency, stats }) => savePatterns(surface, dependency, stats))
    .then(() => console.log('\n✓ Pattern generation complete!\n'))
    .catch(console.error);
}
