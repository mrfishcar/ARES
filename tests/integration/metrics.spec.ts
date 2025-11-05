/**
 * Integration tests for Metrics System
 * Sprint R3
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getRawMetrics, resetMetrics, incrementIngest, incrementApproved, incrementDismissed } from '../../app/monitor/metrics';

describe('Metrics Integration', () => {
  beforeEach(() => {
    resetMetrics();
  });

  afterEach(() => {
    resetMetrics();
  });

  it('should increment ingest counter', () => {
    const before = getRawMetrics();
    expect(before.ingest_count_total).toBe(0);

    incrementIngest();

    const after = getRawMetrics();
    expect(after.ingest_count_total).toBe(1);
  });

  it('should increment approved counter', () => {
    const before = getRawMetrics();
    expect(before.review_approved_total).toBe(0);

    incrementApproved();

    const after = getRawMetrics();
    expect(after.review_approved_total).toBe(1);
  });

  it('should increment dismissed counter', () => {
    const before = getRawMetrics();
    expect(before.review_dismissed_total).toBe(0);

    incrementDismissed();

    const after = getRawMetrics();
    expect(after.review_dismissed_total).toBe(1);
  });

  it('should track multiple operations', () => {
    incrementIngest();
    incrementIngest();
    incrementApproved();
    incrementDismissed();

    const metrics = getRawMetrics();
    expect(metrics.ingest_count_total).toBe(2);
    expect(metrics.review_approved_total).toBe(1);
    expect(metrics.review_dismissed_total).toBe(1);
  });

  it('should update heartbeat on each operation', () => {
    const before = getRawMetrics();
    const beforeHeartbeat = before.heartbeat_last_updated_at;

    // Wait 10ms to ensure timestamp changes
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    return delay(10).then(() => {
      incrementIngest();

      const after = getRawMetrics();
      const afterHeartbeat = after.heartbeat_last_updated_at;

      expect(new Date(afterHeartbeat).getTime()).toBeGreaterThan(new Date(beforeHeartbeat).getTime());
    });
  });
});
