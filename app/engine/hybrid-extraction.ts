/**
 * Hybrid Extraction Pipeline - Integration Adapter
 *
 * Wires together all Phase 1-4 enhancements:
 * 1. Enhanced coref with appositive possessives
 * 2. Relation feature extraction
 * 3. Learned re-scorer
 * 4. Domain lexicon validation
 *
 * Provides ablation switches for testing each component's contribution.
 */

import type { Entity, Relation, EntityType } from './schema';
import type { Sentence } from './segment';
import type { CorefLinks } from './coref';
import type { EntityProfile } from './entity-profiler';

// Enhanced modules
import {
  detectAppositivePossessives,
  resolveAppositivePossessives,
  buildCorefChains,
  type ScoredCorefChain
} from './coref-enhanced';

import {
  extractRelationFeatures,
  relationToCandidate,
  type RelationCandidate
} from './relation-features';

import {
  RelationRescorer,
  DEFAULT_RESCORER_CONFIG,
  type RescorerConfig
} from './relation-rescorer';

import {
  validateTypeConstraints,
  validateGraphConsistency,
  getApplicableRules,
  type ConsistencyViolation
} from './domain-lexicon';

/**
 * Hybrid extraction configuration
 * Each flag can be toggled for ablation testing
 */
export interface HybridConfig {
  // Phase 1: Enhanced coref
  useEnhancedCoref: boolean;           // Use appositive possessives + scored chains
  useAppositivePossessives: boolean;   // Extract "His father Arthur" patterns

  // Phase 2: Feature extraction
  extractFeatures: boolean;            // Extract features for all relations

  // Phase 3: Re-scoring
  useRescorer: boolean;                // Apply learned re-scorer
  rescorerConfig?: RescorerConfig;     // Re-scorer configuration

  // Phase 4: Domain lexicon
  useDomainLexicon: boolean;           // Apply lexicon-based relation enhancement
  validateTypeConstraints: boolean;    // Enforce type constraints
  validateGraphConsistency: boolean;   // Check for cycles and conflicts

  // Logging
  logFeatures: boolean;                // Log extracted features to console
  logViolations: boolean;              // Log consistency violations
}

/**
 * Default hybrid configuration
 * All enhancements enabled for maximum precision
 */
export const DEFAULT_HYBRID_CONFIG: HybridConfig = {
  useEnhancedCoref: true,
  useAppositivePossessives: true,
  extractFeatures: true,
  useRescorer: true,
  rescorerConfig: DEFAULT_RESCORER_CONFIG,
  useDomainLexicon: true,
  validateTypeConstraints: true,
  validateGraphConsistency: true,
  logFeatures: false,
  logViolations: true
};

/**
 * Load config from environment variables
 * For ablation testing: --no-coref, --no-lex, --no-rescore
 */
export function loadHybridConfigFromEnv(): HybridConfig {
  const env = process.env;

  return {
    useEnhancedCoref: env.ARES_USE_ENHANCED_COREF !== 'off',
    useAppositivePossessives: env.ARES_USE_APPOSITIVE !== 'off',
    extractFeatures: env.ARES_EXTRACT_FEATURES !== 'off',
    useRescorer: env.ARES_USE_RESCORER !== 'off',
    useDomainLexicon: env.ARES_USE_LEXICON !== 'off',
    validateTypeConstraints: env.ARES_VALIDATE_TYPES !== 'off',
    validateGraphConsistency: env.ARES_VALIDATE_GRAPH !== 'off',
    logFeatures: env.ARES_LOG_FEATURES === 'on',
    logViolations: env.ARES_LOG_VIOLATIONS !== 'off'
  };
}

/**
 * Hybrid extraction result
 */
export interface HybridExtractionResult {
  // Enhanced entities and relations
  entities: Entity[];
  relations: Relation[];

  // Enhanced coref data
  corefChains?: ScoredCorefChain[];
  appositives?: Array<{
    possessorEntityId: string;
    roleEntityId: string;
    predicate: string;
    evidence: { start: number; end: number; text: string };
  }>;

  // Re-scorer decisions
  rescorerDecisions?: Array<{
    relation: Relation;
    accepted: boolean;
    score: number;
    reason: string;
  }>;

  // Validation results
  violations?: ConsistencyViolation[];

  // Statistics
  stats: {
    totalRelations: number;
    acceptedRelations: number;
    rejectedByRescorer: number;
    rejectedByTypeConstraints: number;
    rejectedByConsistency: number;
  };
}

/**
 * Hybrid extraction pipeline
 */
export class HybridExtractor {
  private config: HybridConfig;
  private rescorer?: RelationRescorer;
  private patternReliability: Map<string, number>;

  constructor(config: HybridConfig = DEFAULT_HYBRID_CONFIG) {
    this.config = config;

    if (config.useRescorer) {
      this.rescorer = new RelationRescorer(config.rescorerConfig);
    }

    // Initialize pattern reliability map
    // TODO: Load from historical data
    this.patternReliability = new Map([
      ['dependency_parent_of', 0.85],
      ['regex_married_to', 0.80],
      ['narrative_parent_of', 0.85],
      ['narrative_married_to', 0.90],
      ['possessive_parent_of', 0.80]
    ]);
  }

  /**
   * Enhance coreference resolution
   */
  enhanceCoref(
    corefLinks: CorefLinks,
    entities: Entity[],
    text: string
  ): {
    enhancedCoref: CorefLinks;
    corefChains: ScoredCorefChain[];
    appositives?: ReturnType<typeof resolveAppositivePossessives>;
  } {
    let enhancedCoref = corefLinks;
    const corefChains = buildCorefChains(corefLinks, entities, text);

    let appositives: ReturnType<typeof resolveAppositivePossessives> | undefined;

    // Phase 1.1: Appositive possessives
    if (this.config.useAppositivePossessives) {
      const detectedAppositives = detectAppositivePossessives(text, entities);
      appositives = resolveAppositivePossessives(
        detectedAppositives,
        corefLinks,
        entities,
        text
      );

      if (this.config.logFeatures) {
        console.log(`[HybridExtractor] Detected ${detectedAppositives.length} appositive possessives`);
        console.log(`[HybridExtractor] Resolved ${appositives.length} appositive relations`);
      }
    }

    return { enhancedCoref, corefChains, appositives };
  }

  /**
   * Extract and score relation candidates
   */
  scoreRelations(
    relations: Relation[],
    entities: Entity[],
    corefChains: ScoredCorefChain[],
    fullText: string
  ): {
    candidates: RelationCandidate[];
    rescorerDecisions: Array<{
      relation: Relation;
      accepted: boolean;
      score: number;
      originalScore: number;
      reason: string;
    }>;
  } {
    const candidates: RelationCandidate[] = [];
    const rescorerDecisions: Array<{
      relation: Relation;
      accepted: boolean;
      score: number;
      originalScore: number;
      reason: string;
    }> = [];

    // Phase 2: Extract features
    for (const relation of relations) {
      const candidate = relationToCandidate(
        relation,
        fullText,
        entities,
        corefChains,
        this.patternReliability,
        {
          patternId: `${relation.extractor}_${relation.pred}`
        }
      );

      candidates.push(candidate);

      if (this.config.logFeatures) {
        console.log(`[HybridExtractor] Features for ${relation.pred}(${relation.subj}, ${relation.obj}):`);
        console.log(JSON.stringify(candidate.features, null, 2));
      }
    }

    // Phase 3: Re-score
    if (this.config.useRescorer && this.rescorer) {
      const scoredBatch = this.rescorer.rescoreBatch(candidates);

      for (const { candidate, decision } of scoredBatch) {
        // Find corresponding relation
        const relation = relations.find(
          r => r.subj === candidate.subjEntityId &&
               r.obj === candidate.objEntityId &&
               r.pred === candidate.predicate
        );

        if (relation) {
          rescorerDecisions.push({
            relation,
            accepted: decision.accept,
            score: decision.score,
            originalScore: decision.originalScore,
            reason: decision.reason
          });
        }
      }

      if (this.config.logFeatures) {
        const stats = this.rescorer.getStatistics(scoredBatch);
        console.log(`[HybridExtractor] Re-scorer stats:`, stats);
      }
    } else {
      // If rescorer disabled, accept all relations
      for (const relation of relations) {
        rescorerDecisions.push({
          relation,
          accepted: true,
          score: relation.confidence,
          originalScore: relation.confidence,
          reason: 'rescorer disabled'
        });
      }
    }

    return { candidates, rescorerDecisions };
  }

  /**
   * Validate relations using domain lexicon
   */
  validateRelations(
    relations: Relation[],
    entities: Entity[]
  ): {
    validRelations: Relation[];
    violations: ConsistencyViolation[];
    rejectedByType: number;
  } {
    const validRelations: Relation[] = [];
    const violations: ConsistencyViolation[] = [];
    let rejectedByType = 0;

    // Build entity map for validation
    const entityMap = new Map(entities.map(e => [e.id, { type: e.type }]));

    // Phase 4.1: Type constraint validation
    if (this.config.validateTypeConstraints) {
      for (const relation of relations) {
        const subjEntity = entities.find(e => e.id === relation.subj);
        const objEntity = entities.find(e => e.id === relation.obj);

        if (!subjEntity || !objEntity) continue;

        if (validateTypeConstraints(relation, subjEntity, objEntity)) {
          validRelations.push(relation);
        } else {
          rejectedByType++;

          if (this.config.logViolations) {
            console.log(
              `[HybridExtractor] Type constraint violation: ${relation.pred}(${subjEntity.type}, ${objEntity.type})`
            );
          }
        }
      }
    } else {
      validRelations.push(...relations);
    }

    // Phase 4.2: Graph consistency validation
    if (this.config.validateGraphConsistency) {
      const graphViolations = validateGraphConsistency(validRelations, entityMap);
      violations.push(...graphViolations);

      if (this.config.logViolations && graphViolations.length > 0) {
        console.log(`[HybridExtractor] Found ${graphViolations.length} graph consistency violations`);

        for (const violation of graphViolations) {
          console.log(`  - ${violation.type}: ${violation.message}`);
        }
      }
    }

    return { validRelations, violations, rejectedByType };
  }

  /**
   * Run full hybrid extraction pipeline
   */
  extract(
    entities: Entity[],
    relations: Relation[],
    corefLinks: CorefLinks,
    text: string
  ): HybridExtractionResult {
    const startTime = Date.now();

    // Track statistics
    const stats = {
      totalRelations: relations.length,
      acceptedRelations: 0,
      rejectedByRescorer: 0,
      rejectedByTypeConstraints: 0,
      rejectedByConsistency: 0
    };

    // Phase 1: Enhanced coref
    let corefChains: ScoredCorefChain[] = [];
    let appositives: ReturnType<typeof resolveAppositivePossessives> | undefined;

    if (this.config.useEnhancedCoref) {
      const corefResult = this.enhanceCoref(corefLinks, entities, text);
      corefChains = corefResult.corefChains;
      appositives = corefResult.appositives;

      // Convert appositives to relations
      if (appositives) {
        for (const appositive of appositives) {
          // Create relation from appositive
          const relation: Relation = {
            id: `appositive_${appositive.evidence.start}_${appositive.evidence.end}`,
            subj: appositive.roleEntityId,  // e.g., Arthur
            pred: appositive.predicate as any,  // e.g., parent_of
            obj: appositive.possessorEntityId,  // e.g., Ron
            evidence: [{
              doc_id: 'current',
              span: appositive.evidence,
              sentence_index: 0,
              source: 'RULE' as const
            }],
            confidence: appositive.confidence,
            extractor: 'regex'
          };

          relations.push(relation);
        }
      }
    }

    // Phase 2 & 3: Feature extraction and re-scoring
    let rescorerDecisions: Array<{
      relation: Relation;
      accepted: boolean;
      score: number;
      originalScore: number;
      reason: string;
    }> = [];

    if (this.config.extractFeatures || this.config.useRescorer) {
      const scoringResult = this.scoreRelations(relations, entities, corefChains, text);
      rescorerDecisions = scoringResult.rescorerDecisions;

      // Filter relations based on rescorer decisions
      if (this.config.useRescorer) {
        relations = rescorerDecisions
          .filter(d => d.accepted)
          .map(d => d.relation);

        stats.rejectedByRescorer = rescorerDecisions.filter(d => !d.accepted).length;
      }
    }

    // Phase 4: Domain lexicon validation
    let violations: ConsistencyViolation[] = [];

    if (this.config.useDomainLexicon) {
      const validationResult = this.validateRelations(relations, entities);
      relations = validationResult.validRelations;
      violations = validationResult.violations;
      stats.rejectedByTypeConstraints = validationResult.rejectedByType;
      stats.rejectedByConsistency = violations.filter(v => v.type === 'cycle').length;
    }

    stats.acceptedRelations = relations.length;

    const elapsedTime = Date.now() - startTime;

    if (this.config.logFeatures) {
      console.log(`[HybridExtractor] Pipeline completed in ${elapsedTime}ms`);
      console.log(`[HybridExtractor] Stats:`, stats);
    }

    return {
      entities,
      relations,
      corefChains: this.config.useEnhancedCoref ? corefChains : undefined,
      appositives: this.config.useAppositivePossessives ? appositives : undefined,
      rescorerDecisions: this.config.useRescorer ? rescorerDecisions : undefined,
      violations: this.config.validateGraphConsistency ? violations : undefined,
      stats
    };
  }
}

/**
 * Create hybrid extractor from environment config
 */
export function createHybridExtractor(): HybridExtractor {
  const config = loadHybridConfigFromEnv();
  return new HybridExtractor(config);
}
