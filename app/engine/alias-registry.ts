/**
 * AID (Alias ID) Registry - Phase 3
 *
 * Maps surface forms (how entities appear in text) to entities (EIDs).
 * This solves the problem of entity variations:
 *   "Gandalf", "Gandalf the Grey", "Gandalf the White", "Mithrandir" → Same EID
 *
 * Architecture:
 * - Each unique surface form gets an AID (24-bit)
 * - Each surface form maps to exactly one EID
 * - Multiple surface forms can map to the same EID
 * - Normalization ensures "gandalf" and "Gandalf" get same AID
 *
 * Storage:
 * - Persistent JSON storage
 * - Indexes: by AID, by surface form, by EID
 * - Auto-save on exit and periodic saves
 */

import * as fs from 'fs';
import * as path from 'path';
import { normalizeForAliasing } from './hert/fingerprint';

/**
 * Alias mapping record
 */
export interface AliasMapping {
  aid: number;              // Alias ID (24-bit)
  surfaceForm: string;      // Original surface form
  normalizedKey: string;    // Normalized for matching
  eid: number;              // Entity this maps to
  entityType?: string;      // Entity type (PERSON, ORG, PLACE, etc.) for type compatibility checks
  language?: string;        // ISO 639-1 code (e.g., 'en', 'es')
  script?: string;          // ISO 15924 code (e.g., 'Latn', 'Cyrl')
  created_at: string;
  last_seen: string;
  occurrence_count: number;
  confidence: number;       // 0-1, how confident is this mapping
}

/**
 * Serialized store format
 */
interface SerializedAliasStore {
  version: number;
  nextAID: number;
  mappings: AliasMapping[];
  metadata: {
    total_aliases: number;
    total_entities: number;
    last_updated: string;
  };
}

/**
 * Alias Registry - manages surface form → entity mappings
 */
export class AliasRegistry {
  private mappings: Map<string, AliasMapping>;  // normalizedKey → mapping
  private byAID: Map<number, AliasMapping>;     // aid → mapping
  private byEID: Map<number, AliasMapping[]>;   // eid → mappings (one entity, many aliases)
  private nextAID: number;
  private filePath: string;
  private isDirty: boolean;

  constructor(filePath: string = './data/alias-registry.json') {
    this.filePath = filePath;
    this.mappings = new Map();
    this.byAID = new Map();
    this.byEID = new Map();
    this.nextAID = 1;
    this.isDirty = false;
    this.load();
  }

  /**
   * Register a surface form → entity mapping
   *
   * If the surface form already exists, returns existing AID.
   * If new, creates new AID and maps it to the given EID.
   *
   * @param surfaceForm - How the entity appears in text
   * @param eid - Entity ID to map to
   * @param confidence - Confidence in this mapping (0-1)
   * @param entityType - Optional entity type for type compatibility checks
   * @param language - Optional language code
   * @param script - Optional script code
   */
  register(
    surfaceForm: string,
    eid: number,
    confidence: number = 1.0,
    entityType?: string,
    language?: string,
    script?: string
  ): number {
    const normalizedKey = normalizeForAliasing(surfaceForm);

    // Check if this exact surface form already exists
    const existing = this.mappings.get(normalizedKey);
    if (existing) {
      // Update existing
      existing.last_seen = new Date().toISOString();
      existing.occurrence_count++;

      // If mapping to different EID, keep higher confidence
      if (existing.eid !== eid) {
        if (confidence > existing.confidence) {
          console.log(`[ALIAS-REGISTRY] Remapping "${surfaceForm}" from EID ${existing.eid} to EID ${eid} (confidence ${confidence.toFixed(2)})`);

          // Remove from old EID index
          const oldList = this.byEID.get(existing.eid);
          if (oldList) {
            const idx = oldList.findIndex(m => m.aid === existing.aid);
            if (idx >= 0) oldList.splice(idx, 1);
          }

          existing.eid = eid;
          existing.confidence = confidence;

          // Add to new EID index
          if (!this.byEID.has(eid)) {
            this.byEID.set(eid, []);
          }
          this.byEID.get(eid)!.push(existing);
        }
      } else if (confidence > existing.confidence) {
        existing.confidence = confidence;
      }

      this.isDirty = true;
      return existing.aid;
    }

    // Create new mapping
    const aid = this.nextAID++;

    // Check AID doesn't exceed 24-bit limit (16,777,215)
    if (aid > 0xFFFFFF) {
      throw new Error('[ALIAS-REGISTRY] AID limit exceeded (24-bit max)');
    }

    const mapping: AliasMapping = {
      aid,
      surfaceForm,
      normalizedKey,
      eid,
      entityType,
      language,
      script,
      created_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      occurrence_count: 1,
      confidence
    };

    this.mappings.set(normalizedKey, mapping);
    this.byAID.set(aid, mapping);

    if (!this.byEID.has(eid)) {
      this.byEID.set(eid, []);
    }
    this.byEID.get(eid)!.push(mapping);

    this.isDirty = true;

    console.log(`[ALIAS-REGISTRY] New alias: "${surfaceForm}" → AID=${aid} → EID=${eid} (confidence: ${confidence.toFixed(2)})`);

    return aid;
  }

  /**
   * Get AID for a surface form
   */
  getAID(surfaceForm: string): number | null {
    const normalizedKey = normalizeForAliasing(surfaceForm);
    const mapping = this.mappings.get(normalizedKey);
    return mapping ? mapping.aid : null;
  }

  /**
   * Get EID for a surface form (resolve alias to entity)
   */
  getEID(surfaceForm: string): number | null {
    const normalizedKey = normalizeForAliasing(surfaceForm);
    const mapping = this.mappings.get(normalizedKey);
    return mapping ? mapping.eid : null;
  }

  /**
   * Get all aliases for an entity
   */
  getAliasesForEntity(eid: number): AliasMapping[] {
    return this.byEID.get(eid) || [];
  }

  /**
   * Get mapping by AID
   */
  getByAID(aid: number): AliasMapping | null {
    return this.byAID.get(aid) || null;
  }

  /**
   * Get mapping by surface form
   */
  getBySurfaceForm(surfaceForm: string): AliasMapping | null {
    const normalizedKey = normalizeForAliasing(surfaceForm);
    return this.mappings.get(normalizedKey) || null;
  }

  /**
   * Check if surface form is registered
   */
  has(surfaceForm: string): boolean {
    const normalizedKey = normalizeForAliasing(surfaceForm);
    return this.mappings.has(normalizedKey);
  }

  /**
   * Merge two entities (move all aliases from sourceEID to targetEID)
   */
  mergeEntities(sourceEID: number, targetEID: number): number {
    const sourceAliases = this.getAliasesForEntity(sourceEID);

    let mergedCount = 0;
    for (const alias of sourceAliases) {
      alias.eid = targetEID;
      mergedCount++;
    }

    // Move to target EID index
    if (mergedCount > 0) {
      if (!this.byEID.has(targetEID)) {
        this.byEID.set(targetEID, []);
      }
      this.byEID.get(targetEID)!.push(...sourceAliases);
      this.byEID.delete(sourceEID);
      this.isDirty = true;

      console.log(`[ALIAS-REGISTRY] Merged ${mergedCount} aliases from EID ${sourceEID} to EID ${targetEID}`);
    }

    return mergedCount;
  }

  /**
   * Get statistics
   */
  getStats(): {
    total_aliases: number;
    total_entities: number;
    avg_aliases_per_entity: number;
    most_aliases: Array<{ eid: number; alias_count: number; aliases: string[] }>;
    most_common_aliases: Array<{ surfaceForm: string; eid: number; count: number }>;
  } {
    const entitiesWithAliases = Array.from(this.byEID.entries())
      .map(([eid, aliases]) => ({
        eid,
        alias_count: aliases.length,
        aliases: aliases.map(a => a.surfaceForm)
      }))
      .sort((a, b) => b.alias_count - a.alias_count);

    const allAliases = Array.from(this.mappings.values())
      .sort((a, b) => b.occurrence_count - a.occurrence_count);

    return {
      total_aliases: this.mappings.size,
      total_entities: this.byEID.size,
      avg_aliases_per_entity: this.mappings.size / Math.max(1, this.byEID.size),
      most_aliases: entitiesWithAliases.slice(0, 10),
      most_common_aliases: allAliases.slice(0, 10).map(a => ({
        surfaceForm: a.surfaceForm,
        eid: a.eid,
        count: a.occurrence_count
      }))
    };
  }

  /**
   * Save to disk (if dirty)
   */
  save(): void {
    if (!this.isDirty) return;

    const data: SerializedAliasStore = {
      version: 1,
      nextAID: this.nextAID,
      mappings: Array.from(this.mappings.values()),
      metadata: {
        total_aliases: this.mappings.size,
        total_entities: this.byEID.size,
        last_updated: new Date().toISOString()
      }
    };

    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    this.isDirty = false;

    console.log(`[ALIAS-REGISTRY] Saved ${this.mappings.size} aliases to ${this.filePath}`);
  }

  /**
   * Load from disk
   */
  private load(): void {
    if (!fs.existsSync(this.filePath)) {
      console.log(`[ALIAS-REGISTRY] No existing registry found, starting fresh`);
      return;
    }

    try {
      const json = fs.readFileSync(this.filePath, 'utf-8');
      const data: SerializedAliasStore = JSON.parse(json);

      this.nextAID = data.nextAID || 1;
      this.mappings.clear();
      this.byAID.clear();
      this.byEID.clear();

      for (const mapping of (data.mappings || [])) {
        this.mappings.set(mapping.normalizedKey, mapping);
        this.byAID.set(mapping.aid, mapping);

        if (!this.byEID.has(mapping.eid)) {
          this.byEID.set(mapping.eid, []);
        }
        this.byEID.get(mapping.eid)!.push(mapping);
      }

      console.log(`[ALIAS-REGISTRY] Loaded ${this.mappings.size} aliases from ${this.filePath}`);
    } catch (err) {
      console.warn(`[ALIAS-REGISTRY] Failed to load registry:`, err);
    }
  }

  /**
   * Clear all aliases
   */
  clear(): void {
    this.mappings.clear();
    this.byAID.clear();
    this.byEID.clear();
    this.isDirty = true;
  }
}

/**
 * Singleton instance for global use
 */
let globalRegistry: AliasRegistry | null = null;

export function getAliasRegistry(filePath?: string): AliasRegistry {
  if (!globalRegistry) {
    globalRegistry = new AliasRegistry(filePath);
  }
  return globalRegistry;
}

/**
 * Convenience export
 */
export const aliasRegistry = getAliasRegistry();

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
