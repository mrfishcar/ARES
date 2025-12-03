import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

export type JobStatus = 'queued' | 'running' | 'done' | 'failed';
export type JobInputType = 'rawText' | 'file' | 'url';

export interface Job {
  id: string;
  status: JobStatus;
  inputType: JobInputType;
  inputRef: string;
  resultJson: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'jobs.db');
let db: Database.Database | null = null;

function ensureDatabase(): Database.Database {
  if (db) return db;

  const dbPath = process.env.ARES_DB_PATH || DEFAULT_DB_PATH;
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      inputType TEXT NOT NULL,
      inputRef TEXT NOT NULL,
      resultJson TEXT,
      errorMessage TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON jobs(status, createdAt);
  `);

  return db;
}

function mapRow(row: any): Job {
  return {
    id: row.id,
    status: row.status as JobStatus,
    inputType: row.inputType as JobInputType,
    inputRef: row.inputRef,
    resultJson: row.resultJson ?? null,
    errorMessage: row.errorMessage ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createJob(input: { inputType: JobInputType; inputRef: string }): Promise<Job> {
  const dbConn = ensureDatabase();
  const now = new Date().toISOString();
  const id = uuidv4();

  const stmt = dbConn.prepare(`
    INSERT INTO jobs (id, status, inputType, inputRef, resultJson, errorMessage, createdAt, updatedAt)
    VALUES (@id, @status, @inputType, @inputRef, NULL, NULL, @createdAt, @updatedAt)
  `);

  stmt.run({
    id,
    status: 'queued',
    inputType: input.inputType,
    inputRef: input.inputRef,
    createdAt: now,
    updatedAt: now,
  });

  return {
    id,
    status: 'queued',
    inputType: input.inputType,
    inputRef: input.inputRef,
    resultJson: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getJob(id: string): Promise<Job | null> {
  const dbConn = ensureDatabase();
  const stmt = dbConn.prepare('SELECT * FROM jobs WHERE id = ?');
  const row = stmt.get(id);
  return row ? mapRow(row) : null;
}

export async function updateJobStatus(
  id: string,
  status: JobStatus,
  extraFields: Partial<Pick<Job, 'resultJson' | 'errorMessage' | 'inputRef'>> = {}
): Promise<void> {
  const dbConn = ensureDatabase();
  const now = new Date().toISOString();

  const stmt = dbConn.prepare(`
    UPDATE jobs
    SET status = @status,
        resultJson = COALESCE(@resultJson, resultJson),
        errorMessage = COALESCE(@errorMessage, errorMessage),
        inputRef = COALESCE(@inputRef, inputRef),
        updatedAt = @updatedAt
    WHERE id = @id
  `);

  stmt.run({
    id,
    status,
    resultJson: extraFields.resultJson ?? null,
    errorMessage: extraFields.errorMessage ?? null,
    inputRef: extraFields.inputRef ?? null,
    updatedAt: now,
  });
}

export async function listQueuedJobs(limit: number): Promise<Job[]> {
  const dbConn = ensureDatabase();
  const stmt = dbConn.prepare(
    "SELECT * FROM jobs WHERE status = 'queued' ORDER BY createdAt ASC LIMIT ?"
  );
  const rows = stmt.all(limit);
  return rows.map(mapRow);
}
