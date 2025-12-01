import { HERTQuery, type EntityMention, type RelationshipResult, type CooccurrenceResult } from '../api/hert-query';

export interface EntityFactProfile {
  core: {
    id: string;
    type: string;
    canonical: string;
    aliases: string[];
  };
  stats: {
    mentionCount: number;
    documentCount: number;
    relationshipCount: number;
  };
  relations: Record<string, RelationshipResult[]>;
  cooccurrences: CooccurrenceResult[];
  keyMentions: EntityMention[];
}

export function buildEntityFactProfile(
  eid: string | number,
  queryAPI: HERTQuery
): EntityFactProfile {
  const numericEID = typeof eid === 'string' ? Number(eid) : eid;
  const entityInfo = queryAPI.findEntityByEID(numericEID);
  const canonical = entityInfo?.canonical || String(eid);
  const aliases = entityInfo?.aliases || [];
  const type = entityInfo?.type || entityInfo?.senses.find((s) => !!s.type)?.type || 'UNKNOWN';

  const mentions = queryAPI.findMentions(numericEID);
  const documents = new Set(mentions.map((m) => m.document_id));

  const relationships = queryAPI.findRelationships(numericEID);
  const relations: Record<string, RelationshipResult[]> = {};
  for (const rel of relationships) {
    const key = rel.pred;
    if (!relations[key]) {
      relations[key] = [];
    }
    relations[key].push(rel);
  }

  Object.keys(relations).forEach((key) => {
    relations[key] = relations[key]
      .slice()
      .sort((a, b) => a.obj_canonical.localeCompare(b.obj_canonical));
  });

  const mentionGroups = new Map<string, { count: number; mention: EntityMention }>();
  for (const mention of mentions) {
    const key = `${mention.document_id}:${mention.location.paragraph}`;
    if (!mentionGroups.has(key)) {
      mentionGroups.set(key, { count: 0, mention });
    }
    const entry = mentionGroups.get(key)!;
    entry.count += 1;
  }

  const keyMentions = Array.from(mentionGroups.values())
    .sort((a, b) => {
      if (b.count === a.count) {
        const docCompare = a.mention.document_id.localeCompare(b.mention.document_id);
        if (docCompare === 0) {
          return a.mention.location.paragraph - b.mention.location.paragraph;
        }
        return docCompare;
      }
      return b.count - a.count;
    })
    .slice(0, 3)
    .map((entry) => entry.mention);

  return {
    core: {
      id: String(eid),
      type,
      canonical,
      aliases
    },
    stats: {
      mentionCount: mentions.length,
      documentCount: documents.size,
      relationshipCount: relationships.length
    },
    relations,
    cooccurrences: queryAPI.findCooccurrences(numericEID),
    keyMentions
  };
}
