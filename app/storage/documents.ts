import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface StoredDocument {
  id: string;
  title: string;
  text: string;
  extractionJson: any;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_DOCUMENTS_PATH = path.join(process.cwd(), 'data', 'documents.json');

function resolveStoragePath(overridePath?: string): string {
  const envPath = process.env.ARES_DOCUMENTS_PATH?.trim();
  if (overridePath && overridePath.trim().length > 0) {
    return overridePath;
  }
  if (envPath && envPath.length > 0) {
    return envPath;
  }
  return DEFAULT_DOCUMENTS_PATH;
}

function ensureStorageFile(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '[]', 'utf-8');
  }
}

function loadAllDocuments(filePath: string): StoredDocument[] {
  ensureStorageFile(filePath);
  const raw = fs.readFileSync(filePath, 'utf-8');
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as StoredDocument[];
    }
    return [];
  } catch (err) {
    console.error(`[documents] Failed to parse documents file at ${filePath}:`, err);
    return [];
  }
}

function persistDocuments(docs: StoredDocument[], filePath: string) {
  ensureStorageFile(filePath);
  fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), 'utf-8');
}

export function createDocument(
  input: Pick<StoredDocument, 'title' | 'text' | 'extractionJson'>
): StoredDocument {
  const now = new Date().toISOString();
  return {
    id: uuidv4(),
    title: input.title || 'Untitled Document',
    text: input.text,
    extractionJson: input.extractionJson,
    createdAt: now,
    updatedAt: now,
  };
}

export function saveDocument(doc: StoredDocument, filePath?: string): StoredDocument {
  const storagePath = resolveStoragePath(filePath);
  const docs = loadAllDocuments(storagePath);
  const idx = docs.findIndex(d => d.id === doc.id);
  if (idx >= 0) {
    docs[idx] = doc;
  } else {
    docs.push(doc);
  }
  persistDocuments(docs, storagePath);
  return doc;
}

export function getDocument(id: string, filePath?: string): StoredDocument | null {
  const storagePath = resolveStoragePath(filePath);
  const docs = loadAllDocuments(storagePath);
  return docs.find(d => d.id === id) ?? null;
}

export function listDocuments(filePath?: string): StoredDocument[] {
  const storagePath = resolveStoragePath(filePath);
  const docs = loadAllDocuments(storagePath);
  return docs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function clearDocuments(filePath?: string) {
  const storagePath = resolveStoragePath(filePath);
  persistDocuments([], storagePath);
}
