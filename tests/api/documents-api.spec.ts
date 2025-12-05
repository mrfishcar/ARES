import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startGraphQLServer } from '../../app/api/graphql';
import { clearDocuments, getDocument } from '../../app/storage/documents';
import fs from 'fs';
import path from 'path';
import { ApolloServer } from '@apollo/server';

const TEST_PORT = 4100;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const TEST_DOC_PATH = path.join(process.cwd(), 'tmp', 'documents-api-test.json');

async function createDocumentViaApi(payload: any) {
  const response = await fetch(`${BASE_URL}/api/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await response.json();
  return { status: response.status, json };
}

describe('Document storage API', () => {
  let server: ApolloServer;

  beforeAll(async () => {
    process.env.ARES_DOCUMENTS_PATH = TEST_DOC_PATH;
    if (fs.existsSync(TEST_DOC_PATH)) {
      fs.unlinkSync(TEST_DOC_PATH);
    }
    server = await startGraphQLServer(TEST_PORT);
  });

  afterAll(async () => {
    await server.stop();
    if (fs.existsSync(TEST_DOC_PATH)) {
      fs.unlinkSync(TEST_DOC_PATH);
    }
  });

  beforeEach(() => {
    clearDocuments(TEST_DOC_PATH);
  });

  it('POST /api/documents persists and returns document metadata', async () => {
    const payload = {
      title: 'Test Doc',
      text: 'Hello world',
      extraction: { entities: [], relations: [] },
    };

    const { status, json } = await createDocumentViaApi(payload);

    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.document.id).toBeTruthy();
    expect(json.document.title).toBe(payload.title);

    const saved = getDocument(json.document.id, TEST_DOC_PATH);
    expect(saved?.text).toBe(payload.text);
    expect(saved?.extractionJson).toEqual(payload.extraction);
  });

  it('GET /api/documents lists saved documents', async () => {
    await createDocumentViaApi({ title: 'First', text: 'One', extraction: {} });
    await createDocumentViaApi({ title: 'Second', text: 'Two', extraction: {} });

    const response = await fetch(`${BASE_URL}/api/documents`);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.documents.map((d: any) => d.title).sort()).toEqual(['First', 'Second']);
  });

  it('GET /api/documents/:id returns full stored document', async () => {
    const payload = {
      title: 'Full doc',
      text: 'Full text here',
      extraction: { entities: [{ id: 'e1' }], relations: [] },
    };

    const { json: created } = await createDocumentViaApi(payload);
    const id = created.document.id;

    const response = await fetch(`${BASE_URL}/api/documents/${id}`);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.document.id).toBe(id);
    expect(json.document.text).toBe(payload.text);
    expect(json.document.extractionJson ?? json.document.extraction).toEqual(payload.extraction);
  });

  it('GET /api/documents/:id returns 404 for missing documents', async () => {
    const response = await fetch(`${BASE_URL}/api/documents/missing-id`);
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.ok).toBe(false);
    expect(json.error).toBe('DOCUMENT_NOT_FOUND');
  });
});
