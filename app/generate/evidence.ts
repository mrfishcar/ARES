import * as fs from 'fs';
import * as path from 'path';

function readDocument(docId: string): string | null {
  const sanitized = docId.replace(/[^a-zA-Z0-9._-]/g, '_');
  const candidates: string[] = [];

  const projectsDir = path.join(process.cwd(), 'data', 'projects');
  if (fs.existsSync(projectsDir)) {
    for (const entry of fs.readdirSync(projectsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const projectBase = path.join(projectsDir, entry.name);
      candidates.push(path.join(projectBase, 'docs', `${docId}.txt`));
      candidates.push(path.join(projectBase, 'docs', `${sanitized}.txt`));
      candidates.push(path.join(projectBase, 'notes', `${docId}.md`));
      candidates.push(path.join(projectBase, 'notes', `${sanitized}.md`));
    }
  }

  candidates.push(path.join(process.cwd(), 'data', `${docId}.txt`));
  candidates.push(path.join(process.cwd(), 'data', `${sanitized}.txt`));
  candidates.push(path.join(process.cwd(), 'data', `${docId}.md`));
  candidates.push(path.join(process.cwd(), 'data', `${sanitized}.md`));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        return fs.readFileSync(candidate, 'utf-8');
      } catch {
        return null;
      }
    }
  }

  return null;
}

export function getParagraphText(docId: string, paragraphIndex: number): string | null {
  if (paragraphIndex < 0) return null;
  const content = readDocument(docId);
  if (!content) return null;

  const paragraphs = content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (paragraphIndex >= paragraphs.length) {
    return null;
  }

  return paragraphs[paragraphIndex] || null;
}
