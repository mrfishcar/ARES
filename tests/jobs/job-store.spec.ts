import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const TEST_DB_PATH = path.join(process.cwd(), 'tmp', 'job-store-test.db');

async function loadStore() {
  const mod = await import('../../app/jobs/job-store');
  return mod;
}

beforeEach(() => {
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  fs.mkdirSync(path.dirname(TEST_DB_PATH), { recursive: true });
  process.env.ARES_DB_PATH = TEST_DB_PATH;
  vi.resetModules();
});

afterEach(() => {
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  const wal = `${TEST_DB_PATH}-wal`;
  const shm = `${TEST_DB_PATH}-shm`;
  if (fs.existsSync(wal)) fs.unlinkSync(wal);
  if (fs.existsSync(shm)) fs.unlinkSync(shm);

  delete process.env.ARES_DB_PATH;
});

describe('job-store', () => {
  it('creates and fetches a job', async () => {
    const { createJob, getJob } = await loadStore();

    const created = await createJob({ inputType: 'rawText', inputRef: 'hello world' });
    const fetched = await getJob(created.id);

    expect(fetched).not.toBeNull();
    expect(fetched?.status).toBe('queued');
    expect(fetched?.inputRef).toBe('hello world');
  });

  it('updates job status and stores results', async () => {
    const { createJob, getJob, updateJobStatus } = await loadStore();

    const created = await createJob({ inputType: 'rawText', inputRef: 'text' });
    await updateJobStatus(created.id, 'running');
    await updateJobStatus(created.id, 'done', { resultJson: '{"ok":true}' });

    const fetched = await getJob(created.id);

    expect(fetched?.status).toBe('done');
    expect(fetched?.resultJson).toBe('{"ok":true}');
    expect(fetched?.errorMessage).toBeNull();
  });

  it('lists queued jobs in order', async () => {
    const { createJob, listQueuedJobs, updateJobStatus } = await loadStore();

    const first = await createJob({ inputType: 'rawText', inputRef: 'one' });
    const second = await createJob({ inputType: 'rawText', inputRef: 'two' });

    await updateJobStatus(first.id, 'running');

    const queued = await listQueuedJobs(5);

    expect(queued.map(j => j.id)).toEqual([second.id]);
  });
});
