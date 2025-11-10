export interface Entity {
  type?: string;         // existing upstream type, if any
  start?: number;        // char offset (optional)
  end?: number;          // char offset (optional)
  nearestType?: string;  // projected type from hints (optional)
}
export interface Relation {
  family: string;
  subject: Entity;
  object: Entity;
  depPathLen?: number;
  surface?: string;
}

function effectiveType(primary?: string, fallback?: string): string {
  const p = (primary || '').toUpperCase();
  const f = (fallback || '').toUpperCase();
  return p || f || '';
}

export function guard(r: Relation): boolean {
  const fam = r.family.toLowerCase();
  const sType = effectiveType(r.subject.type, r.subject.nearestType);
  const oType = effectiveType(r.object.type, r.object.nearestType);
  const pathLen = r.depPathLen ?? 0;
  const surf = r.surface?.toLowerCase() || '';

  if (pathLen > 4) return false; // global dep window

  if (fam === 'location') {
    const okObj = ['GPE','LOC','FAC'].includes(oType);
    if (!okObj) return false;
    if (/\bin trouble\b|\bat odds\b/.test(surf)) return false; // idioms
  }

  if (fam === 'identity' || fam === 'alias' || /\balias_of\b/.test(surf)) {
    const aka = /\baka\b|also known as|alias of/.test(surf);
    if (!aka && sType && oType && sType !== oType) return false;
  }

  if (fam === 'part-whole' || /part_of|consists_of|includes/.test(surf)) {
    if (!/\b(chapter|wheel|page|room|engine|member|leaf)\b/.test(surf)) return false;
  }

  if (fam === 'communication') {
    if (!['PERSON','ORG'].includes(oType)) return false;
  }

  return true;
}
