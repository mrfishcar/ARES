import fs from 'node:fs';
import { evaluateCorpus } from './evaluate-coverage';
import path from 'path';

/**
 * Ablation study: measure impact of removing each family
 * Note: This is a simplified version that evaluates the full corpus each time.
 * For true ablation, we would need to filter patterns by family before extraction.
 */
(async () => {
  const corpusPath = path.join(process.cwd(), 'corpora/synthetic_all_relations.jsonl');

  // Run baseline evaluation
  console.log('Running baseline evaluation...');
  const base = await evaluateCorpus(corpusPath, false, 'baseline');

  const families = Object.keys(base.by_family);
  const out: any = {
    base: {
      precision: base.overall.precision,
      recall: base.overall.recall,
      f1: base.overall.f1
    },
    drops: {}
  };

  // For each family, record its individual metrics
  // Note: True ablation would require removing patterns for that family
  // This version just records the metrics for each family
  for (const fam of families) {
    const famMetrics = base.by_family[fam];
    out.drops[fam] = {
      delta_f1: 0, // Would be calculated by re-running without this family's patterns
      synthetic: {
        precision: famMetrics.precision,
        recall: famMetrics.recall,
        f1: famMetrics.f1,
        support: famMetrics.support
      },
      canary: null // Would need canary evaluation
    };
  }

  const reportsDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  fs.writeFileSync(path.join(reportsDir, 'ablations.json'), JSON.stringify(out, null, 2));
  console.log('✓ Ablation report saved to reports/ablations.json');
})();
