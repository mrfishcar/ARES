/**
 * File Upload Handler - Sprint R7
 * POST /upload endpoint with size limits and extension whitelist
 */

import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { v4 as uuidv4 } from 'uuid';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = [
  // Images
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
  // Documents
  '.pdf', '.txt', '.md', '.json', '.csv', '.docx', '.xlsx'
];

interface UploadResult {
  success: boolean;
  fileId?: string;
  filePath?: string;
  url?: string;
  error?: string;
}

/**
 * Parse multipart/form-data upload
 */
function parseMultipart(
  req: http.IncomingMessage,
  boundary: string,
  maxSize: number
): Promise<{ filename: string; data: Buffer }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;

    req.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > maxSize) {
        req.destroy();
        reject(new Error(`File size exceeds ${maxSize} bytes`));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks);
        const boundaryBuffer = Buffer.from(`--${boundary}`);

        // Find file data between boundaries
        const parts = [];
        let start = 0;
        while (start < buffer.length) {
          const boundaryIndex = buffer.indexOf(boundaryBuffer, start);
          if (boundaryIndex === -1) break;

          const nextBoundary = buffer.indexOf(boundaryBuffer, boundaryIndex + boundaryBuffer.length);
          if (nextBoundary === -1) break;

          parts.push(buffer.slice(boundaryIndex, nextBoundary));
          start = nextBoundary;
        }

        if (parts.length === 0) {
          reject(new Error('No file data found'));
          return;
        }

        // Parse first part (should be the file)
        const part = parts[0];
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd === -1) {
          reject(new Error('Invalid multipart format'));
          return;
        }

        const headers = part.slice(0, headerEnd).toString('utf-8');
        const filenameMatch = headers.match(/filename="([^"]+)"/);
        if (!filenameMatch) {
          reject(new Error('No filename found'));
          return;
        }

        const filename = filenameMatch[1];
        const fileData = part.slice(headerEnd + 4, -2); // Skip \r\n\r\n and trailing \r\n

        resolve({ filename, data: fileData });
      } catch (error: any) {
        reject(new Error(`Failed to parse multipart: ${error.message}`));
      }
    });

    req.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Handle file upload request
 */
export async function handleUpload(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  // Only POST allowed
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Method not allowed' }));
    return;
  }

  try {
    // Parse Content-Type header
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=([^;]+)/);
    if (!boundaryMatch) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid Content-Type: multipart/form-data required' }));
      return;
    }

    const boundary = boundaryMatch[1];

    // Parse multipart data
    const { filename, data } = await parseMultipart(req, boundary, MAX_FILE_SIZE);

    // Validate extension
    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: `File type not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`
      }));
      return;
    }

    // Validate filename (no path traversal)
    const basename = path.basename(filename);
    if (basename !== filename || filename.includes('..')) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid filename' }));
      return;
    }

    // Generate unique file ID and path
    const fileId = uuidv4();
    const storedFilename = `${fileId}${ext}`;
    const mediaDir = path.join(process.cwd(), 'media');

    // Ensure media directory exists
    if (!fs.existsSync(mediaDir)) {
      fs.mkdirSync(mediaDir, { recursive: true });
    }

    const filePath = path.join(mediaDir, storedFilename);

    // Write file
    fs.writeFileSync(filePath, data);

    // Return success response
    const result: UploadResult = {
      success: true,
      fileId,
      filePath: `media/${storedFilename}`,
      url: `/media/${storedFilename}`
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));

  } catch (error: any) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: error.message || 'Upload failed'
    }));
  }
}

/**
 * Serve uploaded media files
 */
export function handleMediaServe(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  filepath: string
): void {
  // Validate path (no traversal)
  const basename = path.basename(filepath);
  if (basename !== filepath || filepath.includes('..')) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid file path' }));
    return;
  }

  // Build and validate full path
  const mediaDir = path.join(process.cwd(), 'media');
  const fullPath = path.join(mediaDir, basename);
  const resolvedPath = path.resolve(fullPath);
  const resolvedBase = path.resolve(mediaDir);

  // Verify path is within media directory
  if (!resolvedPath.startsWith(resolvedBase)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Path traversal attempt detected' }));
    return;
  }

  // Check if file exists
  if (!fs.existsSync(resolvedPath)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'File not found' }));
    return;
  }

  // Determine content type from extension
  const ext = path.extname(resolvedPath).toLowerCase();
  const contentTypeMap: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.csv': 'text/csv',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };

  const contentType = contentTypeMap[ext] || 'application/octet-stream';

  // Serve file
  const content = fs.readFileSync(resolvedPath);
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(content);
}
