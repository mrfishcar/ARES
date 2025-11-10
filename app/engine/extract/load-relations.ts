import fs from 'node:fs';
import path from 'node:path';

export type PatternsMode = 'baseline' | 'expanded' | 'hybrid';
type Family = string;

function loadJSON<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
}

function resolvePatternsForFamilies(families: Family[]) {
  const dep = loadJSON<any[]>(path.resolve('patterns/new_dependency_patterns.json'));
  const surf = loadJSON<any[]>(path.resolve('patterns/new_surface_patterns.json'));
  const filter = (x: any) => families.includes(String(x.family || '').toLowerCase());
  return { dependency: dep.filter(filter), surface: surf.filter(filter) };
}

export function loadRelationPatterns(mode: PatternsMode) {
  if (mode === 'baseline') {
    return {
      dependency: loadJSON<any[]>(path.resolve('patterns/_existing_dependency.json')),
      surface: loadJSON<any[]>(path.resolve('patterns/_existing_surface.json'))
    };
  }
  if (mode === 'expanded') {
    return {
      dependency: loadJSON<any[]>(path.resolve('patterns/new_dependency_patterns.json')),
      surface: loadJSON<any[]>(path.resolve('patterns/new_surface_patterns.json'))
    };
  }
  // hybrid
  const cfg = loadJSON<{allow: Family[]}>(path.resolve('config/hybrid_families.json'));
  return resolvePatternsForFamilies(cfg.allow.map(f => f.toLowerCase()));
}
