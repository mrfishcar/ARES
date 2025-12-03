import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createJob } from '../../../../jobs/job-store';

const MAX_TEXT_LENGTH = parseInt(process.env.MAX_TEXT_LENGTH || `${2 * 1024 * 1024}`, 10);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const text = (req.body as any)?.text;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Text is required' });
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return res.status(413).json({ error: `Text too large (max ${MAX_TEXT_LENGTH} chars)` });
  }

  try {
    const job = await createJob({ inputType: 'rawText', inputRef: text });
    console.log(`[api] created job ${job.id} (length=${text.length})`);

    const triggerUrl = process.env.JOB_WORKER_TRIGGER_URL;
    if (triggerUrl) {
      fetch(triggerUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jobId: job.id }),
        // Fire-and-forget so the API stays fast; errors are logged only.
      }).catch(err => console.error(`[api] worker trigger failed for job ${job.id}`, err));
    }

    return res.status(200).json({ jobId: job.id });
  } catch (error) {
    console.error('[api] failed to create job', error);
    return res.status(500).json({ error: 'Failed to start job' });
  }
}
