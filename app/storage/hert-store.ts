/**
 * HERT Store - Reference Storage and Indexing
 *
 * Stores and indexes entity references (HERTs) for fast lookup.
 *
 * Indexes:
 * - By EID: Find all occurrences of an entity
 * - By DID: Find all references in a document
 * - By (EID, DID): Find entity occurrences in specific document
 *
 * Storage format: JSON (array of compact HERT strings)
 */

import * as fs from 'fs';
import * as path from 'path';
import { decodeHERT, type HERT } from '../engine/hert';
import type { DID, EID } from '../engine/hert/types';

/**
 * Reference index structure
 */
interface ReferenceIndex {
  byEID: Map<number, string[]>;           // EID → HERT strings
  byDID: Map<string, string[]>;           // DID (as string) → HERT strings
  byEIDAndDID: Map<string, string[]>;     // "eid:did" → HERT strings
  all: string[];                          // All HERT strings
}

/**
 * Serialized store format
 */
interface SerializedStore {
  version: number;
  all: string[];
  metadata: {
    total_refs: number;
    total_entities: number;
    total_documents: number;
    last_updated: string;
  };
}

/**
 * HERT Store - manages entity reference storage
 */
export class HERTStore {
  private index: ReferenceIndex;
  private filePath: string;
  private isDirty: boolean;

  constructor(filePath: string = './data/herts.json') {
    this.filePath = filePath;
    this.index = {
      byEID: new Map(),
      byDID: new Map(),
      byEIDAndDID: new Map(),
      all: []
    };
    this.isDirty = false;
    this.load();
  }

  /**
   * Add a single HERT reference
   */
  add(hert: string): void {
    this.addMany([hert]);
  }

  /**
   * Add multiple HERT references (batch)
   */
  addMany(herts: string[]): void {
    for (const hert of herts) {
      // Add to all
      this.index.all.push(hert);

      // Decode for indexing
      try {
        const decoded = decodeHERT(hert);

        // Index by EID
        if (!this.index.byEID.has(decoded.eid)) {
          this.index.byEID.set(decoded.eid, []);
        }
        this.index.byEID.get(decoded.eid)!.push(hert);

        // Index by DID (convert BigInt to string for Map key)
        const didKey = decoded.did.toString();
        if (!this.index.byDID.has(didKey)) {
          this.index.byDID.set(didKey, []);
        }
        this.index.byDID.get(didKey)!.push(hert);

        // Index by (EID, DID)
        const compositeKey = `${decoded.eid}:${didKey}`;
        if (!this.index.byEIDAndDID.has(compositeKey)) {
          this.index.byEIDAndDID.set(compositeKey, []);
        }
        this.index.byEIDAndDID.get(compositeKey)!.push(hert);

      } catch (err) {
        console.warn('[HERT-STORE] Failed to decode HERT:', hert, err);
      }
    }

    this.isDirty = true;
  }

  /**
   * Get all references for an entity (across all documents)
   */
  getByEntity(eid: number): string[] {
    return this.index.byEID.get(eid) || [];
  }

  /**
   * Get all references in a document
   */
  getByDocument(did: DID): string[] {
    const didKey = did.toString();
    return this.index.byDID.get(didKey) || [];
  }

  /**
   * Get references for specific entity in specific document
   */
  getByEntityAndDocument(eid: number, did: DID): string[] {
    const compositeKey = `${eid}:${did.toString()}`;
    return this.index.byEIDAndDID.get(compositeKey) || [];
  }

  /**
   * Get all references
   */
  getAll(): string[] {
    return this.index.all;
  }

  /**
   * Decode all HERTs for an entity
   */
  getDecodedByEntity(eid: number): HERT[] {
    const herts = this.getByEntity(eid);
    return herts.map(h => decodeHERT(h));
  }

  /**
   * Decode all HERTs in a document
   */
  getDecodedByDocument(did: DID): HERT[] {
    const herts = this.getByDocument(did);
    return herts.map(h => decodeHERT(h));
  }

  /**
   * Get statistics
   */
  getStats(): {
    total_refs: number;
    total_entities: number;
    total_documents: number;
    top_entities: Array<{ eid: number; count: number }>;
  } {
    const entityCounts: Map<number, number> = new Map();

    for (const [eid, herts] of this.index.byEID.entries()) {
      entityCounts.set(eid, herts.length);
    }

    const topEntities = Array.from(entityCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([eid, count]) => ({ eid, count }));

    return {
      total_refs: this.index.all.length,
      total_entities: this.index.byEID.size,
      total_documents: this.index.byDID.size,
      top_entities: topEntities
    };
  }

  /**
   * Save to disk (if dirty)
   */
  save(): void {
    if (!this.isDirty) return;

    const data: SerializedStore = {
      version: 1,
      all: this.index.all,
      metadata: {
        total_refs: this.index.all.length,
        total_entities: this.index.byEID.size,
        total_documents: this.index.byDID.size,
        last_updated: new Date().toISOString()
      }
    };

    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    this.isDirty = false;

    console.log(`[HERT-STORE] Saved ${this.index.all.length} references to ${this.filePath}`);
  }

  /**
   * Load from disk
   */
  private load(): void {
    if (!fs.existsSync(this.filePath)) {
      console.log('[HERT-STORE] No existing store found, starting fresh');
      return;
    }

    try {
      const json = fs.readFileSync(this.filePath, 'utf-8');
      const data: SerializedStore = JSON.parse(json);

      // Rebuild indexes from stored HERTs
      this.index.all = data.all || [];
      this.index.byEID = new Map();
      this.index.byDID = new Map();
      this.index.byEIDAndDID = new Map();

      for (const hert of this.index.all) {
        try {
          const decoded = decodeHERT(hert);

          // Rebuild EID index
          if (!this.index.byEID.has(decoded.eid)) {
            this.index.byEID.set(decoded.eid, []);
          }
          this.index.byEID.get(decoded.eid)!.push(hert);

          // Rebuild DID index
          const didKey = decoded.did.toString();
          if (!this.index.byDID.has(didKey)) {
            this.index.byDID.set(didKey, []);
          }
          this.index.byDID.get(didKey)!.push(hert);

          // Rebuild composite index
          const compositeKey = `${decoded.eid}:${didKey}`;
          if (!this.index.byEIDAndDID.has(compositeKey)) {
            this.index.byEIDAndDID.set(compositeKey, []);
          }
          this.index.byEIDAndDID.get(compositeKey)!.push(hert);

        } catch (err) {
          console.warn('[HERT-STORE] Skipping invalid HERT during load:', err);
        }
      }

      console.log(`[HERT-STORE] Loaded ${this.index.all.length} references from ${this.filePath}`);
    } catch (err) {
      console.warn('[HERT-STORE] Failed to load store:', err);
    }
  }

  /**
   * Clear all references
   */
  clear(): void {
    this.index.all = [];
    this.index.byEID.clear();
    this.index.byDID.clear();
    this.index.byEIDAndDID.clear();
    this.isDirty = true;
  }
}

/**
 * Singleton instance for global use
 */
let globalStore: HERTStore | null = null;

export function getHERTStore(filePath?: string): HERTStore {
  if (!globalStore) {
    globalStore = new HERTStore(filePath);
  }
  return globalStore;
}

/**
 * Convenience export
 */
export const hertStore = getHERTStore();

// Auto-save on process exit
if (typeof process !== 'undefined') {
  process.on('exit', () => {
    if (globalStore) {
      globalStore.save();
    }
  });

  // Also save periodically (every 30 seconds if dirty)
  setInterval(() => {
    if (globalStore) {
      globalStore.save();
    }
  }, 30000);
}
