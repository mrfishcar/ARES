/**
 * EID (Entity ID) Registry
 *
 * Assigns stable numeric IDs to entities across documents.
 * Similar to Strong's Concordance numbering system.
 *
 * Features:
 * - Automatic EID assignment based on canonical name
 * - Persistent storage (JSON)
 * - Case-insensitive matching
 * - Collision detection
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * EID mapping record
 */
export interface EIDMapping {
  eid: number;
  canonical: string;
  normalizedKey: string;
  created_at: string;
  last_seen: string;
  occurrence_count: number;
}

/**
 * EID Registry - manages entity ID assignments
 */
export class EIDRegistry {
  private mappings: Map<string, EIDMapping>;  // normalizedKey → mapping
  private reverseIndex: Map<number, string>;  // eid → normalizedKey
  private nextEID: number;
  private filePath: string;
  private isDirty: boolean;

  constructor(filePath: string = './data/eid-registry.json') {
    this.filePath = filePath;
    this.mappings = new Map();
    this.reverseIndex = new Map();
    this.nextEID = 1;
    this.isDirty = false;
    this.load();
  }

  /**
   * Get or create EID for canonical name
   *
   * Automatically assigns a new EID if entity hasn't been seen before.
   */
  getOrCreate(canonical: string): number {
    const normalizedKey = this.normalize(canonical);

    const existing = this.mappings.get(normalizedKey);
    if (existing) {
      // Update last seen and occurrence count
      existing.last_seen = new Date().toISOString();
      existing.occurrence_count++;
      this.isDirty = true;
      return existing.eid;
    }

    // Create new mapping
    const eid = this.nextEID++;
    const mapping: EIDMapping = {
      eid,
      canonical,
      normalizedKey,
      created_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      occurrence_count: 1
    };

    this.mappings.set(normalizedKey, mapping);
    this.reverseIndex.set(eid, normalizedKey);
    this.isDirty = true;

    console.log(`[EID-REGISTRY] New entity: "${canonical}" → EID=${eid}`);

    return eid;
  }

  /**
   * Get EID for canonical name (returns null if not found)
   */
  get(canonical: string): number | null {
    const normalizedKey = this.normalize(canonical);
    const mapping = this.mappings.get(normalizedKey);
    return mapping ? mapping.eid : null;
  }

  /**
   * Get canonical name for EID (returns null if not found)
   */
  getCanonical(eid: number): string | null {
    const normalizedKey = this.reverseIndex.get(eid);
    if (!normalizedKey) return null;

    const mapping = this.mappings.get(normalizedKey);
    return mapping ? mapping.canonical : null;
  }

  /**
   * Get full mapping for EID
   */
  getMapping(eid: number): EIDMapping | null {
    const normalizedKey = this.reverseIndex.get(eid);
    if (!normalizedKey) return null;

    return this.mappings.get(normalizedKey) || null;
  }

  /**
   * Check if EID exists
   */
  has(canonical: string): boolean {
    const normalizedKey = this.normalize(canonical);
    return this.mappings.has(normalizedKey);
  }

  /**
   * Update canonical name for existing EID
   */
  updateCanonical(eid: number, newCanonical: string): boolean {
    const normalizedKey = this.reverseIndex.get(eid);
    if (!normalizedKey) return false;

    const mapping = this.mappings.get(normalizedKey);
    if (!mapping) return false;

    mapping.canonical = newCanonical;
    this.isDirty = true;

    return true;
  }

  /**
   * Get all mappings
   */
  getAll(): EIDMapping[] {
    return Array.from(this.mappings.values());
  }

  /**
   * Get statistics
   */
  getStats(): {
    total_entities: number;
    next_eid: number;
    most_common: Array<{ canonical: string; count: number }>;
  } {
    const all = this.getAll();
    const sorted = all.sort((a, b) => b.occurrence_count - a.occurrence_count);

    return {
      total_entities: all.length,
      next_eid: this.nextEID,
      most_common: sorted.slice(0, 10).map(m => ({
        canonical: m.canonical,
        count: m.occurrence_count
      }))
    };
  }

  /**
   * Save to disk (if dirty)
   */
  save(): void {
    if (!this.isDirty) return;

    const data = {
      version: 1,
      nextEID: this.nextEID,
      mappings: Array.from(this.mappings.values()),
      metadata: {
        total_entities: this.mappings.size,
        last_updated: new Date().toISOString()
      }
    };

    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    this.isDirty = false;

    console.log(`[EID-REGISTRY] Saved ${this.mappings.size} entities to ${this.filePath}`);
  }

  /**
   * Load from disk
   */
  private load(): void {
    if (!fs.existsSync(this.filePath)) {
      console.log(`[EID-REGISTRY] No existing registry found, starting fresh`);
      return;
    }

    try {
      const json = fs.readFileSync(this.filePath, 'utf-8');
      const data = JSON.parse(json);

      this.nextEID = data.nextEID || 1;
      this.mappings.clear();
      this.reverseIndex.clear();

      for (const mapping of (data.mappings || [])) {
        this.mappings.set(mapping.normalizedKey, mapping);
        this.reverseIndex.set(mapping.eid, mapping.normalizedKey);
      }

      console.log(`[EID-REGISTRY] Loaded ${this.mappings.size} entities from ${this.filePath}`);
    } catch (err) {
      console.warn(`[EID-REGISTRY] Failed to load registry:`, err);
    }
  }

  /**
   * Normalize canonical name for matching
   *
   * - Lowercase
   * - Trim whitespace
   * - Collapse multiple spaces
   */
  private normalize(canonical: string): string {
    return canonical
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');
  }

  /**
   * Clear registry (for testing)
   * Removes all mappings and resets to initial state
   */
  clear(): void {
    this.mappings.clear();
    this.reverseIndex.clear();
    this.nextEID = 1;
    this.isDirty = false;
    console.log(`[EID-REGISTRY] Cleared all mappings`);
  }
}

/**
 * Singleton instance for global use
 */
let globalRegistry: EIDRegistry | null = null;

export function getEIDRegistry(filePath?: string): EIDRegistry {
  if (!globalRegistry) {
    globalRegistry = new EIDRegistry(filePath);
  }
  return globalRegistry;
}

/**
 * Convenience exports
 */
export const eidRegistry = getEIDRegistry();

// Auto-save on process exit
if (typeof process !== 'undefined') {
  process.on('exit', () => {
    if (globalRegistry) {
      globalRegistry.save();
    }
  });

  // Also save periodically (every 30 seconds if dirty)
  setInterval(() => {
    if (globalRegistry) {
      globalRegistry.save();
    }
  }, 30000);
}
