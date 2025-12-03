import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getJob } from '../../../../jobs/job-store';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const jobId = req.query.jobId as string;
  if (!jobId) {
    return res.status(400).json({ error: 'jobId is required' });
  }

  try {
    const job = await getJob(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status === 'failed') {
      return res.status(200).json({ status: 'failed', errorMessage: job.errorMessage });
    }

    if (job.status !== 'done' || !job.resultJson) {
      return res.status(200).json({ status: job.status });
    }

    const parsed = JSON.parse(job.resultJson);
    return res.status(200).json(parsed);
  } catch (error) {
    console.error('[api] failed to fetch job result', error);
    return res.status(500).json({ error: 'Failed to read job result' });
  }
}
