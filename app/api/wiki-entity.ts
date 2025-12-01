import * as http from 'http';
import * as path from 'path';
import { loadGraph } from '../storage/storage';
import { HERTQuery, type RelationshipResult } from './hert-query';
import type { Entity } from '../engine/schema';

interface WikiEntityPayload {
  title: string;
  type: string;
  canonical: string;
  aliases: string[];
  mentionCount: number;
  documents: string[];
  relations: RelationshipResult[];
}

function parseRequest(
  req: http.IncomingMessage
): Promise<{ entityName?: string; project?: string }> {
  return new Promise((resolve) => {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const project = url.searchParams.get('project') || 'default';
    const entityName =
      url.searchParams.get('entity') ||
      url.searchParams.get('entityName') ||
      url.searchParams.get('name') ||
      undefined;

    if (req.method !== 'POST') {
      resolve({ entityName, project });
      return;
    }

    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        resolve({
          entityName: parsed.entityName || entityName,
          project: parsed.project || project
        });
      } catch {
        resolve({ entityName, project });
      }
    });
  });
}

function findEntityCandidate(
  entityName: string,
  entities: Entity[],
  queryAPI: HERTQuery
): { eid?: number; canonical: string; type: string; aliases: string[] } | null {
  const searchResults = queryAPI
    .findEntityByName(entityName, { fuzzy: true })
    .sort((a, b) => a.canonical.localeCompare(b.canonical));

  if (searchResults.length > 0) {
    const primary = searchResults[0];
    const typeFromSense = primary.senses.find((s) => !!s.type)?.type;
    return {
      eid: primary.eid,
      canonical: primary.canonical,
      type: primary.type || typeFromSense || 'UNKNOWN',
      aliases: primary.aliases || []
    };
  }

  const needle = entityName.toLowerCase();
  const fallback = entities
    .filter((e) => {
      return (
        e.canonical.toLowerCase().includes(needle) ||
        (e.aliases || []).some((alias) => alias.toLowerCase().includes(needle))
      );
    })
    .sort((a, b) => a.canonical.localeCompare(b.canonical));

  if (fallback.length === 0) {
    return null;
  }

  const first = fallback[0];
  return {
    canonical: first.canonical,
    type: first.type,
    aliases: first.aliases || [],
    eid: first.eid
  };
}

function toMarkdown(wiki: WikiEntityPayload): string {
  const aliasText = wiki.aliases.length ? wiki.aliases.join(', ') : '—';
  const docs = wiki.documents.length ? wiki.documents : [];
  const lines: string[] = [];

  lines.push(`# ${wiki.title}`);
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('|-------|-------|');
  lines.push(`| Type | ${wiki.type} |`);
  lines.push(`| Canonical | ${wiki.canonical} |`);
  lines.push(`| Aliases | ${aliasText} |`);
  lines.push(`| Mentions | ${wiki.mentionCount} |`);
  lines.push(`| Documents | ${docs.join(', ') || '—'} |`);
  lines.push('');

  lines.push('## Mentions');
  lines.push('');
  if (docs.length === 0) {
    lines.push('_No mentions found._');
  } else {
    for (const docId of docs) {
      lines.push(`- Document ${docId}`);
    }
  }
  lines.push('');

  lines.push('## Relations');
  lines.push('');
  if (wiki.relations.length === 0) {
    lines.push('_No relations found._');
  } else {
    const sorted = [...wiki.relations].sort((a, b) => {
      if (a.pred === b.pred) {
        return a.obj_canonical.localeCompare(b.obj_canonical);
      }
      return a.pred.localeCompare(b.pred);
    });
    for (const rel of sorted) {
      lines.push(
        `- ${rel.subj_canonical} —${rel.pred}→ ${rel.obj_canonical} (evidence: ${rel.evidence_count})`
      );
    }
  }
  lines.push('');

  return lines.join('\n');
}

export async function handleWikiEntity(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const { entityName, project } = await parseRequest(req);

  if (!entityName) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing entityName' }));
    return;
  }

  const graphPath = path.join(process.cwd(), 'data', 'projects', project || 'default', 'graph.json');
  const graph = loadGraph(graphPath);

  if (!graph) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Knowledge graph not found' }));
    return;
  }

  const queryAPI = new HERTQuery();
  queryAPI.loadRelations(graph.relations, graph.entities);

  const resolved = findEntityCandidate(entityName, graph.entities, queryAPI);
  if (!resolved) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Entity not found' }));
    return;
  }

  const mentions = resolved.eid !== undefined ? queryAPI.findMentions(resolved.eid) : [];
  const mentionDocs = Array.from(new Set(mentions.map((m) => m.document_id))).sort();
  const relations = resolved.eid !== undefined ? queryAPI.findRelationships(resolved.eid) : [];

  const wikiPayload: WikiEntityPayload = {
    title: resolved.canonical,
    type: resolved.type,
    canonical: resolved.canonical,
    aliases: resolved.aliases,
    mentionCount: mentions.length || 0,
    documents: mentionDocs,
    relations
  };

  const markdown = toMarkdown(wikiPayload);
  res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
  res.end(markdown);
}
