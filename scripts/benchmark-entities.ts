import { performance } from 'node:perf_hooks';
import type { EntitySpan } from '../app/ui/console/src/types/entities';
import { projectEntitiesToVisibleRanges } from '../app/ui/console/src/components/CodeMirrorEditor';

const DOC_LENGTH = 200_000;
const VISIBLE_RANGES = [
  { from: 1_000, to: 8_000 },
  { from: 120_000, to: 126_000 },
];

const entities: EntitySpan[] = Array.from({ length: 5_000 }, (_, i) => {
  const start = i * 40;
  return {
    id: `ent-${i}`,
    start,
    end: start + 20,
    type: 'PERSON',
    text: `Entity ${i}`,
    confidence: 1,
    source: 'natural',
  } as EntitySpan;
});

const start = performance.now();
const plan = projectEntitiesToVisibleRanges(entities, 0, DOC_LENGTH, VISIBLE_RANGES);
const duration = performance.now() - start;

console.log(
  `Filtered ${entities.length} entities to ${plan.spans.length} visible spans in ${duration.toFixed(2)}ms (scanned=${plan.scannedBytes})`,
);
