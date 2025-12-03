import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createJob } from '../../../../jobs/job-store';

const MAX_TEXT_LENGTH = parseInt(
  process.env.MAX_TEXT_LENGTH || `${2 * 1024 * 1024}`,
  10
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const text = (req.body as any)?.text;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required' });
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return res
        .status(413)
        .json({ error: `Text too large (max ${MAX_TEXT_LENGTH} chars)` });
    }

    const job = await createJob({ inputType: 'rawText', inputRef: text });
    console.log(`[api] created job ${job.id} (length=${text.length})`);

    // For now we DO NOT call any worker trigger URL here.
    // Railway worker should poll the DB for queued jobs and process them.
    // This keeps /api/extraction/start completely safe and fast.
    return res.status(200).json({ jobId: job.id });
  } catch (error) {
    console.error('[api] failed to create job', error);
    return res.status(500).json({ error: 'Failed to start job' });
  }
}