export interface Entity { type?: string }
export interface Relation {
  family: string;
  subject: Entity;
  object: Entity;
  depPathLen?: number;
  surface?: string;
}

export function guard(r: Relation): boolean {
  const fam = r.family.toLowerCase();
  const sType = (r.subject.type || '').toUpperCase();
  const oType = (r.object.type || '').toUpperCase();
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
