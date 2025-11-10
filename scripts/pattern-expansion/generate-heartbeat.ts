/**
 * Heartbeat Report Generator
 *
 * Generates comprehensive testing ladder metrics and recommendations
 */

import * as fs from 'fs';
import * as path from 'path';

interface FamilyMetrics {
  family: string;
  precision: number;
  recall: number;
  f1: number;
  tp: number;
  fp: number;
  fn: number;
  total_gold: number;
  total_extracted: number;
  uncovered_phrases: string[];
  top_fn: string[];
  top_fp: string[];
}

interface GuardRail {
  type: 'entity_type_filter' | 'distance_window' | 'lexicon' | 'idiom_block';
  description: string;
  examples: string[];
}

interface FamilyAnalysis {
  family: string;
  status: 'ready' | 'needs_work' | 'blocked';
  metrics: {
    synthetic: FamilyMetrics;
    canary?: FamilyMetrics;
  };
  error_analysis: {
    top_fn_with_reason: Array<{ example: string; reason: string; pattern_hint: string }>;
    top_fp_with_reason: Array<{ example: string; reason: string; fix_hint: string }>;
  };
  recommended_guardrails: GuardRail[];
  hybrid_mode_ready: boolean;
}

interface Heartbeat {
  timestamp: string;
  ladder_rung: string;
  overall_synthetic: {
    precision: number;
    recall: number;
    f1: number;
    total_tp: number;
    total_fp: number;
    total_fn: number;
  };
  overall_canary?: {
    precision: number;
    recall: number;
    f1: number;
  };
  families: Record<string, FamilyAnalysis>;
  uncovered_patterns: {
    surface_ngrams: string[];
    dep_motifs: string[];
  };
  recommendations: {
    families_for_hybrid: string[];
    next_patterns_to_add: string[];
    critical_fixes: string[];
  };
}

/**
 * Analyze why a false negative occurred
 */
function analyzeFN(example: string, family: string): { reason: string; pattern_hint: string } {
  // Common FN patterns
  if (example.includes('--[painted_by]-->') || example.includes('--[written_by]-->') || example.includes('--[created_by]-->')) {
    return {
      reason: 'Passive voice predicate used instead of active',
      pattern_hint: 'Add active voice patterns: "X painted Y", "X wrote Y", "X created Y"'
    };
  }

  if (example.includes(' --[') && example.split(' ')[0].length <= 4) {
    return {
      reason: 'Entity name split incorrectly (e.g., "Leonardo" instead of "Leonardo da Vinci")',
      pattern_hint: 'Improve NER for multi-word entity names'
    };
  }

  if (family === 'ownership' && example.includes('--[belongs_to]-->')) {
    return {
      reason: 'Missing ownership pattern for "belongs to"',
      pattern_hint: 'Add pattern: nsubj(belongs, SUBJ) + obl(belongs, OBJ)'
    };
  }

  if (family === 'location' && example.includes('--[located_in]-->')) {
    return {
      reason: 'Missing location patterns',
      pattern_hint: 'Add patterns for: "is located in", "stands in", "situated in"'
    };
  }

  if (family === 'communication' && example.includes('--[wrote_to]-->')) {
    return {
      reason: 'Missing communication patterns for "wrote to"',
      pattern_hint: 'Add pattern: nsubj(wrote, SUBJ) + obl:to(wrote, OBJ)'
    };
  }

  return {
    reason: 'Pattern not in signature library',
    pattern_hint: `Add ${family} patterns for this case`
  };
}

/**
 * Analyze why a false positive occurred
 */
function analyzeFP(example: string, family: string): { reason: string; fix_hint: string } {
  if (example.includes('UNKNOWN')) {
    return {
      reason: 'Entity extraction failed - created relation with UNKNOWN entities',
      fix_hint: 'Filter out relations where subject or object is UNKNOWN/empty'
    };
  }

  if (family === 'location' && example.includes('--[lives_in]-->')) {
    return {
      reason: 'Location pattern incorrectly triggering on "lives in" (should be employment/residence)',
      fix_hint: 'Add type filter: OBJECT must be GPE/LOC/FAC, block when "lives" is verb'
    };
  }

  if (family === 'power' && example.includes('--[rules]-->')) {
    return {
      reason: 'Power relation extracted with insufficient context',
      fix_hint: 'Add type filter: SUBJECT must be PERSON, OBJECT must be GPE/ORG/LOC'
    };
  }

  return {
    reason: 'Overly broad pattern matching',
    fix_hint: 'Add type compatibility filters or increase pattern specificity'
  };
}

/**
 * Recommend precision guardrails for a family
 */
function recommendGuardrails(family: string, metrics: FamilyMetrics): GuardRail[] {
  const guardrails: GuardRail[] = [];

  // Check if many FPs with UNKNOWN
  const unknownFPs = metrics.top_fp.filter(fp => fp.includes('UNKNOWN')).length;
  if (unknownFPs > 2) {
    guardrails.push({
      type: 'entity_type_filter',
      description: 'Filter out relations with UNKNOWN or empty entities',
      examples: ['if (rel.subject === "UNKNOWN" || !rel.subject) skip']
    });
  }

  // Family-specific guardrails
  if (family === 'ownership') {
    guardrails.push({
      type: 'entity_type_filter',
      description: 'Subject must be PERSON or ORG; Object cannot be DATE or QUANTITY',
      examples: ['SUBJECT ∈ {PERSON, ORG}', 'OBJECT ∉ {DATE, QUANTITY}']
    });
  }

  if (family === 'location') {
    guardrails.push({
      type: 'entity_type_filter',
      description: 'Object must be GPE, LOC, or FAC',
      examples: ['OBJECT ∈ {GPE, LOC, FAC}']
    });
    guardrails.push({
      type: 'idiom_block',
      description: 'Block idiomatic uses of "in"',
      examples: ['"in trouble", "in love", "in doubt"']
    });
  }

  if (family === 'part_whole') {
    guardrails.push({
      type: 'lexicon',
      description: 'Require head nouns in part-whole lexicon',
      examples: ['chapter→book', 'wheel→car', 'state→country']
    });
  }

  if (family === 'identity') {
    guardrails.push({
      type: 'entity_type_filter',
      description: 'Subject and object must have type compatibility or alias evidence',
      examples: ['Both PERSON or both GPE', 'Or one is alias of other']
    });
  }

  if (family === 'communication') {
    guardrails.push({
      type: 'distance_window',
      description: 'Cap dependency path length to ≤4 edges for prepositional cues',
      examples: ['path_length(nsubj, obl:to) ≤ 4']
    });
  }

  return guardrails;
}

/**
 * Generate comprehensive heartbeat report
 */
export function generateHeartbeat(
  syntheticCoverage: Record<string, FamilyMetrics>,
  canaryCoverage?: Record<string, FamilyMetrics>
): Heartbeat {
  const families: Record<string, FamilyAnalysis> = {};

  let totalTP = 0, totalFP = 0, totalFN = 0, totalGold = 0;

  for (const [familyName, syntheticMetrics] of Object.entries(syntheticCoverage)) {
    totalTP += syntheticMetrics.tp;
    totalFP += syntheticMetrics.fp;
    totalFN += syntheticMetrics.fn;
    totalGold += syntheticMetrics.total_gold;

    const canaryMetrics = canaryCoverage?.[familyName];

    // Analyze errors
    const top_fn_with_reason = syntheticMetrics.top_fn.slice(0, 5).map(ex => ({
      example: ex,
      ...analyzeFN(ex, familyName)
    }));

    const top_fp_with_reason = syntheticMetrics.top_fp.slice(0, 5).map(ex => ({
      example: ex,
      ...analyzeFP(ex, familyName)
    }));

    // Recommend guardrails
    const recommended_guardrails = recommendGuardrails(familyName, syntheticMetrics);

    // Determine status and hybrid readiness
    const f1 = syntheticMetrics.f1;
    const precision = syntheticMetrics.precision;
    const recall = syntheticMetrics.recall;

    let status: 'ready' | 'needs_work' | 'blocked' = 'blocked';
    if (f1 >= 0.70 && precision >= 0.70) {
      status = 'ready';
    } else if (recall >= 0.50 || f1 >= 0.40) {
      status = 'needs_work';
    }

    const hybrid_mode_ready = (
      precision >= 0.70 &&
      recall >= 0.50 &&
      f1 >= 0.60 &&
      syntheticMetrics.fp < syntheticMetrics.tp * 2  // FP < 2×TP
    );

    families[familyName] = {
      family: familyName,
      status,
      metrics: {
        synthetic: syntheticMetrics,
        canary: canaryMetrics
      },
      error_analysis: {
        top_fn_with_reason,
        top_fp_with_reason
      },
      recommended_guardrails,
      hybrid_mode_ready
    };
  }

  const overall_precision = totalTP > 0 ? totalTP / (totalTP + totalFP) : 0;
  const overall_recall = totalGold > 0 ? totalTP / totalGold : 0;
  const overall_f1 = overall_precision + overall_recall > 0
    ? 2 * (overall_precision * overall_recall) / (overall_precision + overall_recall)
    : 0;

  // Generate recommendations
  const families_for_hybrid = Object.entries(families)
    .filter(([_, analysis]) => analysis.hybrid_mode_ready)
    .map(([name, _]) => name);

  const critical_fixes = [];

  // Identify critical fixes
  if (Object.values(families).some(f => f.metrics.synthetic.top_fp.some(fp => fp.includes('UNKNOWN')))) {
    critical_fixes.push('Filter UNKNOWN entities from relation extraction');
  }

  const passiveVoiceFamilies = Object.entries(families)
    .filter(([_, f]) => f.error_analysis.top_fn_with_reason.some(fn => fn.reason.includes('Passive voice')))
    .map(([name, _]) => name);

  if (passiveVoiceFamilies.length > 0) {
    critical_fixes.push(`Add active voice patterns for: ${passiveVoiceFamilies.join(', ')}`);
  }

  const entitySplitFamilies = Object.entries(families)
    .filter(([_, f]) => f.error_analysis.top_fn_with_reason.some(fn => fn.reason.includes('split incorrectly')))
    .map(([name, _]) => name);

  if (entitySplitFamilies.length > 0) {
    critical_fixes.push('Improve NER for multi-word entity names');
  }

  // Next patterns to add
  const next_patterns_to_add = Object.entries(families)
    .filter(([_, f]) => f.status !== 'ready')
    .sort((a, b) => {
      // Prioritize by potential impact: recall × total_gold
      const impactA = a[1].metrics.synthetic.recall * a[1].metrics.synthetic.total_gold;
      const impactB = b[1].metrics.synthetic.recall * b[1].metrics.synthetic.total_gold;
      return impactB - impactA;
    })
    .slice(0, 5)
    .flatMap(([name, analysis]) =>
      analysis.error_analysis.top_fn_with_reason.slice(0, 2).map(fn => fn.pattern_hint)
    );

  return {
    timestamp: new Date().toISOString(),
    ladder_rung: 'R1 - Synthetic Coverage Baseline',
    overall_synthetic: {
      precision: overall_precision,
      recall: overall_recall,
      f1: overall_f1,
      total_tp: totalTP,
      total_fp: totalFP,
      total_fn: totalFN
    },
    families,
    uncovered_patterns: {
      surface_ngrams: [],  // TODO: Extract from uncovered phrases
      dep_motifs: []       // TODO: Mine from failed cases
    },
    recommendations: {
      families_for_hybrid,
      next_patterns_to_add,
      critical_fixes
    }
  };
}

// Main execution
if (require.main === module) {
  const reportsDir = path.join(process.cwd(), 'reports');

  // Load synthetic coverage
  const syntheticPath = path.join(reportsDir, 'relation_coverage.json');
  const syntheticCoverage = JSON.parse(fs.readFileSync(syntheticPath, 'utf8'));

  // Generate heartbeat
  const heartbeat = generateHeartbeat(syntheticCoverage);

  // Save heartbeat
  fs.writeFileSync(
    path.join(reportsDir, 'heartbeat.json'),
    JSON.stringify(heartbeat, null, 2)
  );

  console.log('\n=== Testing Ladder Heartbeat ===\n');
  console.log(`Rung: ${heartbeat.ladder_rung}`);
  console.log(`Overall P/R/F1: ${(heartbeat.overall_synthetic.precision * 100).toFixed(1)}% / ${(heartbeat.overall_synthetic.recall * 100).toFixed(1)}% / ${(heartbeat.overall_synthetic.f1 * 100).toFixed(1)}%`);
  console.log(`\nFamilies ready for hybrid mode: ${heartbeat.recommendations.families_for_hybrid.join(', ') || 'None'}`);
  console.log(`\nCritical fixes needed:`);
  heartbeat.recommendations.critical_fixes.forEach((fix, i) => {
    console.log(`  ${i + 1}. ${fix}`);
  });

  console.log(`\n✓ Saved heartbeat to ${reportsDir}/heartbeat.json`);
}
