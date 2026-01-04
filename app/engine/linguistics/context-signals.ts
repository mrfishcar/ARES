export const ORG_KEYWORDS = new Set([
  'school', 'junior', 'high', 'jr', 'jr.', 'academy', 'university', 'college',
  'institute', 'institution', 'foundation', 'center', 'centre', 'association',
  'society', 'ministry', 'department', 'bureau', 'corporation', 'company',
  'co', 'inc', 'ltd', 'llc', 'church', 'chapel', 'cathedral',
  'club', 'league', 'council', 'committee', 'board',
]);

export const PLACE_KEYWORDS = new Set([
  'city', 'town', 'village', 'county', 'parish', 'state', 'province',
  'kingdom', 'valley', 'mountain', 'ridge', 'hill', 'river', 'lake',
  'bay', 'harbor', 'harbour', 'island',
  'hall', 'building', 'corridor', 'hallway', 'room', 'office',
  'cafeteria', 'gym', 'park', 'square', 'plaza',
]);

export function nameContainsOrgOrPlaceKeyword(canonical: string): {
  hasOrg: boolean;
  hasPlace: boolean;
} {
  const lower = canonical.toLowerCase();
  let hasOrg = false;
  let hasPlace = false;

  // Use word boundary matching to avoid false positives like "draco" matching "co"
  for (const kw of ORG_KEYWORDS) {
    // Create regex with word boundaries
    const regex = new RegExp(`\\b${kw.replace(/\./g, '\\.')}\\b`, 'i');
    if (regex.test(lower)) {
      hasOrg = true;
      break;
    }
  }
  for (const kw of PLACE_KEYWORDS) {
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    if (regex.test(lower)) {
      hasPlace = true;
      break;
    }
  }

  return { hasOrg, hasPlace };
}

/**
 * PR-1: Personal pronouns should never resolve to ORG/PLACE-ish names.
 */
export function isEntityPronounCompatible(
  pronoun: string,
  entityCanonicalName: string
): boolean {
  const p = pronoun.toLowerCase();
  const { hasOrg, hasPlace } = nameContainsOrgOrPlaceKeyword(
    entityCanonicalName
  );

  const personal = new Set(['he', 'she', 'him', 'her']);
  const possessive = new Set(['his', 'hers', 'its']);
  const plural = new Set(['they', 'them', 'their', 'theirs']);

  if (personal.has(p)) {
    // block if org/place-ish
    if (hasOrg || hasPlace) return false;
    return true;
  }

  if (possessive.has(p)) {
    // "its" can refer to org/place; "his/hers" cannot
    if (p === 'its') {
      return hasOrg || hasPlace;
    }
    // his/hers -> person
    if (hasOrg || hasPlace) return false;
    return true;
  }

  if (plural.has(p)) {
    // "they" can refer to groups, teams, orgs or plural persons.
    // This helper only blocks clearly inanimate buildings.
    if (hasPlace && !hasOrg) {
      // "the hall", "the building" – prefer not
      return false;
    }
    return true;
  }

  // Other pronouns: default allow
  return true;
}
