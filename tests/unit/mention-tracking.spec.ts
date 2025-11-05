/**
 * Unit tests for Mention Tracking System (Phase E1)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMention,
  createEntityCluster,
  addMentionToCluster,
  findCandidateClusters,
  mergeClusters,
  resetIdCounters,
  type EntityCluster,
  type Mention
} from '../../app/engine/mention-tracking';
import {
  computeEntityConfidence,
  filterEntitiesByConfidence,
  explainConfidence
} from '../../app/engine/confidence-scoring';

describe('Mention Tracking System', () => {
  beforeEach(() => {
    resetIdCounters();
  });

  it('should generate sequential mention IDs', () => {
    const m1 = createMention('E001', [0, 10], 'Aria Thorne', 0, 'canonical', 0.9);
    const m2 = createMention('E001', [50, 54], 'Aria', 1, 'short_form', 0.85);
    const m3 = createMention('E001', [100, 103], 'She', 2, 'pronoun', 0.5);

    expect(m1.id).toBe('M001');
    expect(m2.id).toBe('M002');
    expect(m3.id).toBe('M003');
  });

  it('should create entity cluster with first mention', () => {
    const mention = createMention('', [0, 10], 'Aria Thorne', 0, 'canonical', 0.9);
    const cluster = createEntityCluster('PERSON', 'Aria Thorne', mention, ['NER'], 0.85);

    expect(cluster.id).toBe('E001');
    expect(cluster.canonical).toBe('Aria Thorne');
    expect(cluster.mentions).toHaveLength(1);
    expect(cluster.mentionCount).toBe(1);
    expect(cluster.firstMention).toBe(0);
  });

  it('should add mentions to cluster and track aliases', () => {
    const m1 = createMention('E001', [0, 10], 'Aria Thorne', 0, 'canonical', 0.9);
    const cluster = createEntityCluster('PERSON', 'Aria Thorne', m1, ['NER'], 0.85);

    const m2 = createMention('E001', [50, 54], 'Aria', 1, 'short_form', 0.85);
    addMentionToCluster(cluster, m2);

    expect(cluster.mentionCount).toBe(2);
    expect(cluster.aliases).toContain('Aria');
  });

  it('should upgrade canonical name when longer form is found', () => {
    const m1 = createMention('E001', [0, 4], 'Aria', 0, 'short_form', 0.85);
    const cluster = createEntityCluster('PERSON', 'Aria', m1, ['NER'], 0.85);

    const m2 = createMention('E001', [50, 61], 'Aria Thorne', 1, 'canonical', 0.9);
    addMentionToCluster(cluster, m2);

    expect(cluster.canonical).toBe('Aria Thorne');
    expect(cluster.aliases).toContain('Aria');
  });

  it('should find candidate clusters by surface form', () => {
    resetIdCounters();
    const m1 = createMention('', [0, 10], 'Aria Thorne', 0, 'canonical', 0.9);
    const cluster1 = createEntityCluster('PERSON', 'Aria Thorne', m1, ['NER'], 0.85);

    const m2 = createMention('', [50, 62], 'Elias Calder', 3, 'canonical', 0.9);
    const cluster2 = createEntityCluster('PERSON', 'Elias Calder', m2, ['NER'], 0.85);

    const clusters = [cluster1, cluster2];

    // Find "Aria" in sentence 2 (should match cluster1 within window)
    const candidates = findCandidateClusters(clusters, 'Aria', 2);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].canonical).toBe('Aria Thorne');

    // Find "Elias" in sentence 5 (should match cluster2 within window: 5-3=2, cluster at sent 3)
    const candidates2 = findCandidateClusters(clusters, 'Elias', 5);
    expect(candidates2).toHaveLength(1);
    expect(candidates2[0].canonical).toBe('Elias Calder');

    // Search outside window (sentence 10, window 3) - should not find cluster1
    const candidates3 = findCandidateClusters(clusters, 'Aria', 10, 3);
    expect(candidates3).toHaveLength(0);
  });

  it('should merge clusters correctly', () => {
    resetIdCounters();
    const m1 = createMention('', [0, 10], 'Aria Thorne', 0, 'canonical', 0.9);
    const cluster1 = createEntityCluster('PERSON', 'Aria Thorne', m1, ['NER'], 0.85);

    const m2 = createMention('', [50, 54], 'Aria', 1, 'short_form', 0.85);
    const cluster2 = createEntityCluster('PERSON', 'Aria', m2, ['FALLBACK'], 0.6);

    const merged = mergeClusters(cluster1, cluster2);

    expect(merged.mentionCount).toBe(2);
    expect(merged.aliases).toContain('Aria');
    expect(merged.sources).toContain('NER');
    expect(merged.sources).toContain('FALLBACK');
  });
});

describe('Entity Confidence Scoring', () => {
  beforeEach(() => {
    resetIdCounters();
  });

  it('should score whitelist entities highly', () => {
    const m = createMention('E001', [0, 7], 'Gandalf', 0, 'canonical', 0.95);
    const cluster = createEntityCluster('PERSON', 'Gandalf', m, ['WHITELIST'], 0.95);

    const confidence = computeEntityConfidence(cluster);
    expect(confidence).toBeGreaterThan(0.9);
  });

  it('should score NER entities moderately', () => {
    const m = createMention('E001', [0, 10], 'Aria Thorne', 0, 'canonical', 0.85);
    const cluster = createEntityCluster('PERSON', 'Aria Thorne', m, ['NER'], 0.85);

    const confidence = computeEntityConfidence(cluster);
    expect(confidence).toBeGreaterThan(0.8);
    expect(confidence).toBeLessThan(0.95);
  });

  it('should penalize single-word generic titles heavily', () => {
    const m = createMention('E001', [0, 9], 'Professor', 0, 'canonical', 0.7);
    const cluster = createEntityCluster('PERSON', 'Professor', m, ['FALLBACK'], 0.4);

    const confidence = computeEntityConfidence(cluster);
    expect(confidence).toBeLessThan(0.5);
  });

  it('should boost confidence for multiple mentions', () => {
    const m1 = createMention('E001', [0, 10], 'Aria Thorne', 0, 'canonical', 0.9);
    const cluster = createEntityCluster('PERSON', 'Aria Thorne', m1, ['NER'], 0.85);

    const baseConfidence = computeEntityConfidence(cluster);

    // Add more mentions
    for (let i = 0; i < 5; i++) {
      const m = createMention('E001', [100 + i * 50, 104 + i * 50], 'Aria', i + 1, 'short_form', 0.85);
      addMentionToCluster(cluster, m);
    }

    const boostedConfidence = computeEntityConfidence(cluster);
    expect(boostedConfidence).toBeGreaterThan(baseConfidence);
  });

  it('should filter entities below threshold', () => {
    resetIdCounters();

    const m1 = createMention('', [0, 10], 'Aria Thorne', 0, 'canonical', 0.9);
    const cluster1 = createEntityCluster('PERSON', 'Aria Thorne', m1, ['NER'], 0.85);

    const m2 = createMention('', [50, 59], 'Professor', 1, 'canonical', 0.4);
    const cluster2 = createEntityCluster('PERSON', 'Professor', m2, ['FALLBACK'], 0.3);

    const m3 = createMention('', [100, 105], 'Couple', 2, 'canonical', 0.4);
    const cluster3 = createEntityCluster('PERSON', 'Couple', m3, ['FALLBACK'], 0.3);

    const clusters = [cluster1, cluster2, cluster3];
    const filtered = filterEntitiesByConfidence(clusters, 0.5);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].canonical).toBe('Aria Thorne');
  });

  it('should explain confidence scores', () => {
    const m = createMention('E001', [0, 10], 'Aria Thorne', 0, 'canonical', 0.9);
    const cluster = createEntityCluster('PERSON', 'Aria Thorne', m, ['NER'], 0.85);

    const explanation = explainConfidence(cluster);

    expect(explanation).toContain('Entity: Aria Thorne');
    expect(explanation).toContain('Base score:');
    expect(explanation).toContain('Mention bonus:');
    expect(explanation).toContain('Final confidence:');
  });
});
