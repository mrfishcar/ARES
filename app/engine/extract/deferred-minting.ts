/**
 * Deferred Entity Minting - Late Entity Creation
 *
 * Creates entities ONLY after promotion gate has approved clusters.
 * Type inference uses evidence from ALL mentions in the cluster.
 *
 * Key principle: Entity IDs are assigned HERE, not earlier.
 */

import { v4 as uuid } from 'uuid';
import type { Entity, EntityType } from '../schema';
import type { MentionCluster } from './mention-cluster';
import type { StatsCollector } from './extraction-stats';

// ============================================================================
// TYPES
// ============================================================================

export interface TypeEvidence {
  nerVotes: Map<EntityType, number>;
  headwordSignal?: EntityType;
  grammaticalSignal?: EntityType;
  finalType: EntityType;
  confidence: number;
}

export interface EntityMintingResult {
  entity: Entity;
  spans: EntitySpan[];
  typeEvidence: TypeEvidence;
}

export interface EntitySpan {
  entity_id: string;
  start: number;
  end: number;
  surface: string;
}

// ============================================================================
// NER LABEL MAPPING
// ============================================================================

const NER_TO_ENTITY_TYPE: Record<string, EntityType> = {
  PERSON: 'PERSON',
  ORG: 'ORG',
  GPE: 'PLACE',
  LOC: 'PLACE',
  FAC: 'PLACE',
  WORK_OF_ART: 'WORK',
  EVENT: 'EVENT',
  DATE: 'DATE',
  TIME: 'TIME',
  NORP: 'HOUSE',  // Nationalities, religions, political groups
};

// ============================================================================
// HEADWORD PATTERNS (schema vocabulary - closed set)
// ============================================================================

const PLACE_HEADWORDS = new Set([
  'river', 'creek', 'stream', 'mountain', 'mount', 'peak', 'hill', 'valley',
  'lake', 'sea', 'ocean', 'island', 'isle', 'forest', 'wood', 'desert',
  'plain', 'prairie', 'city', 'town', 'village', 'kingdom', 'realm', 'land',
  'cliff', 'ridge', 'canyon', 'gorge', 'haven', 'harbor', 'bay', 'cove',
  'grove', 'glade', 'dale', 'moor', 'heath', 'marsh', 'swamp', 'springs',
  'street', 'avenue', 'road', 'lane', 'drive', 'boulevard', 'highway',
  'park', 'square', 'plaza', 'court', 'place', 'trail', 'path',
  'county', 'parish', 'district', 'province', 'state', 'country', 'nation',
]);

const ORG_HEADWORDS = new Set([
  'school', 'university', 'college', 'academy', 'institute', 'institution',
  'company', 'corporation', 'inc', 'llc', 'ltd', 'corp', 'co',
  'department', 'ministry', 'office', 'bureau', 'agency', 'board',
  'society', 'association', 'foundation', 'organization', 'group',
  'club', 'team', 'band', 'orchestra', 'choir',
  'church', 'temple', 'mosque', 'synagogue',
  'hospital', 'clinic', 'center', 'centre',
  'bank', 'firm', 'enterprise', 'business',
  'times', 'post', 'herald', 'tribune', 'news', 'journal', 'gazette',
]);

const EVENT_HEADWORDS = new Set([
  'battle', 'war', 'conflict', 'siege', 'skirmish', 'campaign',
  'treaty', 'accord', 'pact', 'agreement',
  'council', 'conference', 'summit', 'convention', 'congress',
  'festival', 'celebration', 'ceremony', 'wedding', 'funeral',
  'election', 'referendum', 'vote',
  'trial', 'hearing', 'case',
  'race', 'match', 'game', 'tournament', 'championship',
]);

const WORK_HEADWORDS = new Set([
  'book', 'novel', 'story', 'tale', 'saga', 'chronicle',
  'song', 'poem', 'ballad', 'hymn', 'anthem',
  'film', 'movie', 'show', 'series', 'episode',
  'painting', 'sculpture', 'portrait',
  'album', 'record', 'ep',
  'play', 'opera', 'musical', 'ballet',
]);

const HOUSE_HEADWORDS = new Set([
  'house', 'family', 'clan', 'tribe', 'dynasty', 'lineage',
  'order', 'brotherhood', 'sisterhood', 'guild',
]);

// ============================================================================
// FICTION-SPECIFIC HEADWORD PATTERNS
// ============================================================================

const SPELL_HEADWORDS = new Set([
  // Harry Potter spells
  'curse', 'hex', 'jinx', 'charm', 'spell', 'incantation',
  'expelliarmus', 'stupefy', 'crucio', 'imperio', 'avadakedavra',
  'lumos', 'nox', 'accio', 'expecto', 'patronum', 'riddikulus',
  'petrificus', 'totalus', 'wingardium', 'leviosa', 'alohomora',
  'obliviate', 'protego', 'sectumsempra', 'levicorpus', 'morsmordre',
  // D&D/Fantasy spells
  'fireball', 'lightning', 'bolt', 'teleport', 'resurrection',
  'healing', 'shield', 'barrier', 'blast', 'nova', 'meteor',
  // Generic magic terms
  'enchantment', 'conjuration', 'transmutation', 'evocation',
  'necromancy', 'divination', 'illusion', 'abjuration',
]);

const ARTIFACT_HEADWORDS = new Set([
  // Weapons
  'sword', 'blade', 'dagger', 'axe', 'bow', 'spear', 'staff',
  'wand', 'scepter', 'sceptre', 'mace', 'hammer', 'lance',
  // Jewelry/Wearables
  'ring', 'amulet', 'necklace', 'crown', 'tiara', 'helm',
  'helmet', 'gauntlet', 'glove', 'cloak', 'robe', 'armor',
  'armour', 'shield', 'pendant', 'bracelet', 'circlet',
  // Containers/Objects
  'chalice', 'grail', 'goblet', 'cup', 'orb', 'crystal',
  'stone', 'gem', 'jewel', 'mirror', 'lamp', 'lantern',
  'horn', 'harp', 'lyre', 'tome', 'grimoire', 'scroll',
  // Famous artifacts (headword)
  'excalibur', 'mjolnir', 'sting', 'glamdring', 'anduril',
  'narsil', 'elderberry', 'deathly', 'horcrux',
]);

const CREATURE_HEADWORDS = new Set([
  // Classic fantasy
  'dragon', 'drake', 'wyrm', 'wyvern', 'phoenix', 'griffin',
  'griffon', 'gryphon', 'unicorn', 'pegasus', 'basilisk',
  'hydra', 'chimera', 'manticore', 'sphinx', 'minotaur',
  // Undead/Dark
  'vampire', 'werewolf', 'zombie', 'skeleton', 'wraith',
  'specter', 'spectre', 'ghost', 'phantom', 'lich', 'ghoul',
  'banshee', 'dementor', 'inferi', 'revenant',
  // Humanoid monsters
  'troll', 'ogre', 'giant', 'golem', 'elemental', 'demon',
  'devil', 'imp', 'goblin', 'orc', 'kobold', 'gnoll',
  // Nature/Fey
  'treant', 'ent', 'dryad', 'nymph', 'fairy', 'faerie',
  'pixie', 'sprite', 'brownie', 'leprechaun', 'satyr',
  // Sea creatures
  'kraken', 'leviathan', 'mermaid', 'merman', 'selkie', 'siren',
  // Named creatures (headword position)
  'smaug', 'fawkes', 'buckbeak', 'aragog', 'fluffy', 'norbert',
  'hedwig', 'nagini', 'scabbers', 'crookshanks',
]);

const RACE_HEADWORDS = new Set([
  // Tolkien races
  'elf', 'elves', 'elven', 'elvish', 'elfin',
  'dwarf', 'dwarves', 'dwarven', 'dwarfish',
  'hobbit', 'hobbits', 'halfling', 'halflings',
  'orc', 'orcs', 'orcish', 'uruk', 'uruks',
  'ent', 'ents', 'entish',
  // D&D/Fantasy races
  'human', 'humans', 'mankind',
  'gnome', 'gnomes', 'gnomish',
  'tiefling', 'tieflings',
  'dragonborn',
  'tabaxi', 'kenku', 'aarakocra',
  'goliath', 'goliaths',
  'firbolg', 'firbolgs',
  'triton', 'tritons',
  'genasi',
  // Harry Potter
  'muggle', 'muggles', 'squib', 'squibs',
  'wizard', 'wizards', 'witch', 'witches',
  'veela', 'giant', 'giants', 'centaur', 'centaurs',
  'goblin', 'goblins', 'merpeople', 'werewolves',
]);

const DEITY_HEADWORDS = new Set([
  // Generic
  'god', 'gods', 'goddess', 'goddesses', 'deity', 'deities',
  'titan', 'titans', 'divine', 'immortal', 'immortals',
  'creator', 'allfather', 'skyfather',
  // Greek
  'zeus', 'hera', 'poseidon', 'hades', 'athena', 'apollo',
  'artemis', 'ares', 'aphrodite', 'hermes', 'hephaestus',
  'dionysus', 'demeter', 'persephone',
  // Norse
  'odin', 'thor', 'loki', 'freya', 'freyja', 'frigg', 'tyr',
  'heimdall', 'baldur', 'balder',
  // Egyptian
  'ra', 'osiris', 'isis', 'anubis', 'horus', 'thoth', 'seth',
  // Tolkien divine
  'valar', 'maiar', 'eru', 'iluvatar', 'morgoth', 'melkor',
  'manwe', 'varda', 'ulmo', 'aule', 'yavanna', 'mandos',
  'sauron', 'gandalf', 'saruman', 'radagast',
]);

const ABILITY_HEADWORDS = new Set([
  // Generic abilities
  'ability', 'power', 'skill', 'talent', 'gift',
  'technique', 'art', 'mastery', 'expertise',
  // HP abilities
  'parseltongue', 'legilimency', 'occlumency', 'animagus',
  'metamorphmagus', 'apparition', 'disapparition',
  // Generic powers
  'telepathy', 'telekinesis', 'pyrokinesis', 'cryokinesis',
  'invisibility', 'immortality', 'invulnerability',
  'flight', 'shapeshifting', 'regeneration', 'precognition',
]);

const MATERIAL_HEADWORDS = new Set([
  // Fantasy metals
  'mithril', 'adamantine', 'adamantium', 'orichalcum',
  'vibranium', 'unobtainium', 'carbonadium',
  // Magic materials
  'dragonscale', 'phoenix', 'unicorn', 'basilisk',
  'moonstone', 'sunstone', 'bloodstone', 'soulstone',
  // Tolkien materials
  'galvorn', 'tilkal', 'eog',
]);

const POTION_HEADWORDS = new Set([
  // Generic
  'potion', 'elixir', 'philter', 'philtre', 'draught', 'brew',
  'tonic', 'serum', 'antidote', 'poison', 'venom',
  // HP potions
  'veritaserum', 'polyjuice', 'amortentia', 'felix', 'felicis',
  'wolfsbane', 'skele-gro', 'pepperup',
]);

// ============================================================================
// TYPE INFERENCE
// ============================================================================

/**
 * Infer entity type from cluster evidence
 */
function inferType(cluster: MentionCluster): TypeEvidence {
  const nerVotes: Map<EntityType, number> = new Map();

  // Collect NER votes
  for (const [nerLabel, count] of cluster.nerHints) {
    const entityType = NER_TO_ENTITY_TYPE[nerLabel];
    if (entityType) {
      const current = nerVotes.get(entityType) || 0;
      nerVotes.set(entityType, current + count);
    }
  }

  // Check headword patterns
  const canonical = cluster.canonicalForm.toLowerCase();
  const words = canonical.split(/\s+/);
  const lastWord = words[words.length - 1];

  let headwordSignal: EntityType | undefined;

  // Check all headword patterns - fiction-specific first (more specific)
  if (SPELL_HEADWORDS.has(lastWord)) {
    headwordSignal = 'SPELL';
  } else if (POTION_HEADWORDS.has(lastWord)) {
    headwordSignal = 'ITEM';  // Potions are items
  } else if (ARTIFACT_HEADWORDS.has(lastWord)) {
    headwordSignal = 'ARTIFACT';
  } else if (CREATURE_HEADWORDS.has(lastWord)) {
    headwordSignal = 'CREATURE';
  } else if (RACE_HEADWORDS.has(lastWord)) {
    headwordSignal = 'RACE';
  } else if (DEITY_HEADWORDS.has(lastWord)) {
    headwordSignal = 'DEITY';
  } else if (ABILITY_HEADWORDS.has(lastWord)) {
    headwordSignal = 'ABILITY';
  } else if (MATERIAL_HEADWORDS.has(lastWord)) {
    headwordSignal = 'MATERIAL';
  } else if (PLACE_HEADWORDS.has(lastWord)) {
    headwordSignal = 'PLACE';
  } else if (ORG_HEADWORDS.has(lastWord)) {
    headwordSignal = 'ORG';
  } else if (EVENT_HEADWORDS.has(lastWord)) {
    headwordSignal = 'EVENT';
  } else if (WORK_HEADWORDS.has(lastWord)) {
    headwordSignal = 'WORK';
  } else if (HOUSE_HEADWORDS.has(lastWord)) {
    headwordSignal = 'HOUSE';
  }

  // Also check full canonical name against fiction headwords (for single-word entities)
  if (!headwordSignal && words.length === 1) {
    const singleWord = canonical;
    if (SPELL_HEADWORDS.has(singleWord)) {
      headwordSignal = 'SPELL';
    } else if (ARTIFACT_HEADWORDS.has(singleWord)) {
      headwordSignal = 'ARTIFACT';
    } else if (CREATURE_HEADWORDS.has(singleWord)) {
      headwordSignal = 'CREATURE';
    } else if (DEITY_HEADWORDS.has(singleWord)) {
      headwordSignal = 'DEITY';
    } else if (ABILITY_HEADWORDS.has(singleWord)) {
      headwordSignal = 'ABILITY';
    } else if (POTION_HEADWORDS.has(singleWord)) {
      headwordSignal = 'ITEM';
    }
  }

  // Check grammatical signals from mentions
  let grammaticalSignal: EntityType | undefined;
  for (const mention of cluster.mentions) {
    const { candidate } = mention;

    // Possessive constructions suggest PERSON
    if (candidate.depRole === 'poss') {
      grammaticalSignal = 'PERSON';
      break;
    }

    // Locative prepositions suggest PLACE
    // (handled elsewhere via PP extraction)
  }

  // Determine final type
  let finalType: EntityType = 'PERSON'; // Default fallback
  let confidence = 0.5;

  // Priority 1: Headword patterns (most reliable)
  if (headwordSignal) {
    finalType = headwordSignal;
    confidence = 0.85;
  }
  // Priority 2: Strong NER consensus
  else if (nerVotes.size > 0) {
    let maxVotes = 0;
    let maxType: EntityType = 'PERSON';
    for (const [type, votes] of nerVotes) {
      if (votes > maxVotes) {
        maxVotes = votes;
        maxType = type;
      }
    }
    finalType = maxType;
    // Confidence based on vote proportion
    const totalVotes = Array.from(nerVotes.values()).reduce((a, b) => a + b, 0);
    confidence = 0.6 + 0.3 * (maxVotes / totalVotes);
  }
  // Priority 3: Grammatical signal
  else if (grammaticalSignal) {
    finalType = grammaticalSignal;
    confidence = 0.7;
  }
  // Priority 4: Capitalization heuristic
  else {
    // Check if first letter is capitalized in non-sentence-initial positions
    const hasNonInitialCapital = cluster.mentions.some(
      m => !m.candidate.isSentenceInitial && /^[A-Z]/.test(m.candidate.surface)
    );
    if (hasNonInitialCapital) {
      // Multi-word capitalized = likely PERSON or PLACE
      if (words.length >= 2) {
        finalType = 'PERSON';
        confidence = 0.6;
      } else {
        finalType = 'PERSON';
        confidence = 0.5;
      }
    }
  }

  return {
    nerVotes,
    headwordSignal,
    grammaticalSignal,
    finalType,
    confidence,
  };
}

// ============================================================================
// ENTITY MINTING
// ============================================================================

/**
 * Mint an entity from a promoted cluster
 */
export function mintEntity(
  cluster: MentionCluster,
  docId: string,
  stats?: StatsCollector
): EntityMintingResult {
  const typeEvidence = inferType(cluster);
  const entityId = uuid();

  // Collect unique aliases
  const aliases: string[] = [];
  for (const variant of cluster.aliasVariants) {
    const normalized = variant.trim();
    if (normalized !== cluster.canonicalForm && normalized.length > 0) {
      if (!aliases.includes(normalized)) {
        aliases.push(normalized);
        stats?.recordAliasAttached();
      }
    }
  }

  // Create entity
  const entity: Entity = {
    id: entityId,
    type: typeEvidence.finalType,
    canonical: cluster.canonicalForm,
    aliases,
    confidence: typeEvidence.confidence,
    created_at: new Date().toISOString(),
    attrs: {
      mentionCount: cluster.mentionCount(),
      nerEvidence: Object.fromEntries(typeEvidence.nerVotes),
      headwordSignal: typeEvidence.headwordSignal,
    },
  };

  // Create spans
  const spans: EntitySpan[] = cluster.mentions.map(m => ({
    entity_id: entityId,
    start: m.candidate.start,
    end: m.candidate.end,
    surface: m.candidate.surface,
  }));

  stats?.recordEntityCreated(typeEvidence.finalType);

  return { entity, spans, typeEvidence };
}

/**
 * Mint entities from a list of promoted clusters
 */
export function mintEntities(
  clusters: MentionCluster[],
  docId: string,
  stats?: StatsCollector
): EntityMintingResult[] {
  return clusters.map(cluster => mintEntity(cluster, docId, stats));
}

// ============================================================================
// EXPORT UTILITIES
// ============================================================================

/**
 * Convert minting results to legacy format
 */
export function toLegacyFormat(results: EntityMintingResult[]): {
  entities: Entity[];
  spans: EntitySpan[];
} {
  const entities: Entity[] = [];
  const spans: EntitySpan[] = [];

  for (const result of results) {
    entities.push(result.entity);
    spans.push(...result.spans);
  }

  return { entities, spans };
}
