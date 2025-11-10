/**
 * Vercel API Route - Entity Extraction Endpoint
 * Allows frontend to call backend extraction pipeline
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required' });
    }

    // TODO: Import and call extraction pipeline
    // This requires the backend extraction to be deployed
    // For now, return mock data indicating backend needed

    return res.status(503).json({
      error: 'Backend extraction service not deployed',
      message: 'Parser service must be deployed to public endpoint',
      fallback: 'Using client-side algorithm patterns',
      recommendation: 'Deploy scripts/parser_service.py to Railway/Render/Heroku'
    });

  } catch (error) {
    console.error('Extraction API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}
