/**
 * Progress Storage - Sprint R8
 * Gamification and achievement tracking
 */

import * as fs from 'fs';
import * as path from 'path';

export interface Progress {
  level: number;
  unlockedCategories: string[];
  totalEntities: number;
  totalRelations: number;
  experiencePoints: number;
  lastUpdated: string;
}

export interface ProgressStore {
  [project: string]: Progress;
}

/**
 * Category unlock thresholds
 */
const UNLOCK_THRESHOLDS = {
  PERSON: 0,      // Always unlocked
  PLACE: 10,      // Unlock after 10 entities
  ORG: 20,        // Unlock after 20 entities
  EVENT: 30,      // Unlock after 30 entities
  WORK: 40,       // Unlock after 40 entities
  ITEM: 50,       // Unlock after 50 entities
  SPECIES: 60,    // Unlock after 60 entities
  HOUSE: 70,      // Unlock after 70 entities
  TRIBE: 80,      // Unlock after 80 entities
  TITLE: 90,      // Unlock after 90 entities
};

/**
 * Get path to progress data file
 */
function getProgressPath(): string {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, 'progress.json');
}

/**
 * Load progress store from disk
 */
export function loadProgressStore(): ProgressStore {
  const progressPath = getProgressPath();

  if (!fs.existsSync(progressPath)) {
    const store: ProgressStore = {};
    fs.writeFileSync(progressPath, JSON.stringify(store, null, 2));
    return store;
  }

  const content = fs.readFileSync(progressPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Save progress store to disk
 */
export function saveProgressStore(store: ProgressStore): void {
  const progressPath = getProgressPath();
  fs.writeFileSync(progressPath, JSON.stringify(store, null, 2));
}

/**
 * Get progress for a specific project
 */
export function getProgress(project: string): Progress {
  const store = loadProgressStore();

  if (!store[project]) {
    // Initialize progress for new project
    const progress: Progress = {
      level: 1,
      unlockedCategories: ['PERSON'], // PERSON always unlocked
      totalEntities: 0,
      totalRelations: 0,
      experiencePoints: 0,
      lastUpdated: new Date().toISOString(),
    };

    store[project] = progress;
    saveProgressStore(store);
    return progress;
  }

  return store[project];
}

/**
 * Calculate level from entity/relation counts
 * Formula: level = floor(sqrt(entities/5 + relations/10))
 */
function calculateLevel(entities: number, relations: number): number {
  const score = entities / 5 + relations / 10;
  return Math.max(1, Math.floor(Math.sqrt(score)));
}

/**
 * Calculate experience points
 * Entities = 10 XP each, Relations = 5 XP each
 */
function calculateExperience(entities: number, relations: number): number {
  return entities * 10 + relations * 5;
}

/**
 * Determine which categories should be unlocked
 */
function getUnlockedCategories(totalEntities: number): string[] {
  const unlocked: string[] = [];

  for (const [category, threshold] of Object.entries(UNLOCK_THRESHOLDS)) {
    if (totalEntities >= threshold) {
      unlocked.push(category);
    }
  }

  return unlocked;
}

/**
 * Record an entity action and update progress
 */
export function recordEntityAction(
  project: string,
  actionType: 'entity_created' | 'relation_created' | 'entity_approved'
): Progress {
  const store = loadProgressStore();
  const progress = getProgress(project);

  // Update counts
  if (actionType === 'entity_created' || actionType === 'entity_approved') {
    progress.totalEntities += 1;
  } else if (actionType === 'relation_created') {
    progress.totalRelations += 1;
  }

  // Recalculate level and unlocks
  const previousLevel = progress.level;
  progress.level = calculateLevel(progress.totalEntities, progress.totalRelations);
  progress.experiencePoints = calculateExperience(
    progress.totalEntities,
    progress.totalRelations
  );

  const previousUnlocks = new Set(progress.unlockedCategories);
  progress.unlockedCategories = getUnlockedCategories(progress.totalEntities);

  // Log level ups
  if (progress.level > previousLevel) {
    console.log(`[Progress] ${project}: Level up! ${previousLevel} → ${progress.level}`);
  }

  // Log new unlocks
  for (const category of progress.unlockedCategories) {
    if (!previousUnlocks.has(category)) {
      console.log(`[Progress] ${project}: Unlocked category: ${category}`);
    }
  }

  progress.lastUpdated = new Date().toISOString();

  // Save
  store[project] = progress;
  saveProgressStore(store);

  return progress;
}

/**
 * Get next unlock information
 */
export function getNextUnlock(progress: Progress): {
  category: string;
  threshold: number;
  remaining: number;
} | null {
  const unlocked = new Set(progress.unlockedCategories);

  for (const [category, threshold] of Object.entries(UNLOCK_THRESHOLDS)) {
    if (!unlocked.has(category)) {
      return {
        category,
        threshold,
        remaining: threshold - progress.totalEntities,
      };
    }
  }

  return null; // All categories unlocked
}
