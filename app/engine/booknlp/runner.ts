/**
 * BookNLP Runner
 *
 * Executes BookNLP via Python subprocess and returns the clean contract.
 * Supports caching to avoid re-running BookNLP for the same text.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { BookNLPContract, BookNLPResult } from './types';
import { adaptBookNLPContract, parseBookNLPContract } from './adapter';

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface BookNLPConfig {
  /** Path to Python executable (default: python3) */
  pythonPath: string;

  /** BookNLP model size: "small" or "big" */
  model: 'small' | 'big';

  /** Enable caching of BookNLP results */
  enableCache: boolean;

  /** Cache directory (default: .booknlp_cache) */
  cacheDir: string;

  /** Timeout in milliseconds (default: 300000 = 5 minutes) */
  timeoutMs: number;

  /** BookNLP service URL (if using HTTP service instead of subprocess) */
  serviceUrl?: string;

  /** Minimum mention count for character inclusion */
  minMentionCount: number;
}

const DEFAULT_CONFIG: BookNLPConfig = {
  pythonPath: process.env.BOOKNLP_PYTHON || 'python3',
  model: (process.env.BOOKNLP_MODEL as 'small' | 'big') || 'small',
  enableCache: process.env.BOOKNLP_CACHE !== 'false',
  cacheDir: process.env.BOOKNLP_CACHE_DIR || '.booknlp_cache',
  timeoutMs: parseInt(process.env.BOOKNLP_TIMEOUT || '300000', 10),
  serviceUrl: process.env.BOOKNLP_SERVICE_URL,
  minMentionCount: parseInt(process.env.BOOKNLP_MIN_MENTIONS || '2', 10),
};

export function getBookNLPConfig(overrides: Partial<BookNLPConfig> = {}): BookNLPConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

// ============================================================================
// CACHING
// ============================================================================

function getTextHash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function getCachePath(config: BookNLPConfig, textHash: string): string {
  return path.join(config.cacheDir, `${textHash}.json`);
}

function readFromCache(config: BookNLPConfig, textHash: string): BookNLPContract | null {
  if (!config.enableCache) return null;

  const cachePath = getCachePath(config, textHash);
  if (!fs.existsSync(cachePath)) return null;

  try {
    const json = fs.readFileSync(cachePath, 'utf-8');
    return parseBookNLPContract(json);
  } catch (e) {
    console.warn(`[BookNLP] Cache read failed: ${e}`);
    return null;
  }
}

function writeToCache(config: BookNLPConfig, textHash: string, contract: BookNLPContract): void {
  if (!config.enableCache) return;

  try {
    if (!fs.existsSync(config.cacheDir)) {
      fs.mkdirSync(config.cacheDir, { recursive: true });
    }
    const cachePath = getCachePath(config, textHash);
    fs.writeFileSync(cachePath, JSON.stringify(contract, null, 2));
    console.log(`[BookNLP] Cached result to ${cachePath}`);
  } catch (e) {
    console.warn(`[BookNLP] Cache write failed: ${e}`);
  }
}

// ============================================================================
// SUBPROCESS RUNNER
// ============================================================================

async function runBookNLPSubprocess(
  text: string,
  documentId: string,
  config: BookNLPConfig
): Promise<BookNLPContract> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.resolve(__dirname, '../../../scripts/booknlp_runner.py');

    // Write text to temp file
    const tempDir = fs.mkdtempSync('/tmp/booknlp_');
    const inputPath = path.join(tempDir, 'input.txt');
    const outputPath = path.join(tempDir, 'output.json');

    fs.writeFileSync(inputPath, text, 'utf-8');

    const args = [
      scriptPath,
      inputPath,
      '-o', outputPath,
      '--doc-id', documentId,
      '--model', config.model,
    ];

    console.log(`[BookNLP] Running: ${config.pythonPath} ${args.join(' ')}`);

    const proc = spawn(config.pythonPath, args, {
      cwd: path.dirname(scriptPath),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      console.log(`[BookNLP] ${data.toString().trim()}`);
    });

    const timeout = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`BookNLP timed out after ${config.timeoutMs}ms`));
    }, config.timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timeout);

      // Cleanup temp files
      try {
        if (fs.existsSync(outputPath)) {
          const json = fs.readFileSync(outputPath, 'utf-8');
          fs.rmSync(tempDir, { recursive: true });

          try {
            const contract = parseBookNLPContract(json);
            resolve(contract);
          } catch (e) {
            reject(new Error(`Failed to parse BookNLP output: ${e}`));
          }
        } else if (code === 0 && stdout) {
          // Try parsing stdout
          try {
            const contract = parseBookNLPContract(stdout);
            fs.rmSync(tempDir, { recursive: true });
            resolve(contract);
          } catch (e) {
            reject(new Error(`BookNLP produced no output file and stdout is invalid`));
          }
        } else {
          fs.rmSync(tempDir, { recursive: true });
          reject(new Error(`BookNLP exited with code ${code}: ${stderr}`));
        }
      } catch (e) {
        reject(new Error(`Failed to read BookNLP output: ${e}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to start BookNLP: ${err.message}`));
    });
  });
}

// ============================================================================
// HTTP SERVICE RUNNER
// ============================================================================

async function runBookNLPService(
  text: string,
  documentId: string,
  config: BookNLPConfig
): Promise<BookNLPContract> {
  if (!config.serviceUrl) {
    throw new Error('BOOKNLP_SERVICE_URL not configured');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(`${config.serviceUrl}/booknlp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`BookNLP service error ${response.status}: ${body}`);
    }

    const data = await response.json();

    // The existing service returns raw TSV files - we need to transform
    // For now, throw if using old service format
    if (data.booknlp?.files) {
      throw new Error(
        'BookNLP service returned old format. Please update to use booknlp_runner.py'
      );
    }

    return parseBookNLPContract(JSON.stringify(data));
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================================
// MAIN RUNNER
// ============================================================================

/**
 * Run BookNLP on text and return the clean contract
 */
export async function runBookNLP(
  text: string,
  documentId: string,
  config: Partial<BookNLPConfig> = {}
): Promise<BookNLPContract> {
  const fullConfig = getBookNLPConfig(config);
  const textHash = getTextHash(text);

  // Check cache
  const cached = readFromCache(fullConfig, textHash);
  if (cached) {
    console.log(`[BookNLP] Using cached result for ${textHash}`);
    return cached;
  }

  console.log(`[BookNLP] Processing document: ${documentId} (${text.length} chars)`);

  // Run BookNLP
  let contract: BookNLPContract;

  if (fullConfig.serviceUrl) {
    contract = await runBookNLPService(text, documentId, fullConfig);
  } else {
    contract = await runBookNLPSubprocess(text, documentId, fullConfig);
  }

  // Cache result
  writeToCache(fullConfig, textHash, contract);

  return contract;
}

/**
 * Run BookNLP and return ARES-formatted result
 */
export async function runBookNLPAndAdapt(
  text: string,
  documentId: string,
  config: Partial<BookNLPConfig> = {}
): Promise<BookNLPResult> {
  const fullConfig = getBookNLPConfig(config);
  const contract = await runBookNLP(text, documentId, fullConfig);

  return adaptBookNLPContract(contract, {
    includeRawContract: false,
    minMentionCount: fullConfig.minMentionCount,
  });
}

/**
 * Check if BookNLP is available
 */
export async function isBookNLPAvailable(
  config: Partial<BookNLPConfig> = {}
): Promise<{ available: boolean; method: 'subprocess' | 'service'; error?: string }> {
  const fullConfig = getBookNLPConfig(config);

  // Check service first
  if (fullConfig.serviceUrl) {
    try {
      const response = await fetch(`${fullConfig.serviceUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        return { available: true, method: 'service' };
      }
    } catch (e) {
      // Service not available, fall through to subprocess check
    }
  }

  // Check subprocess
  return new Promise((resolve) => {
    const proc = spawn(fullConfig.pythonPath, ['-c', 'from booknlp.booknlp import BookNLP; print("ok")'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    const timeout = setTimeout(() => {
      proc.kill();
      resolve({ available: false, method: 'subprocess', error: 'Timeout checking BookNLP' });
    }, 10000);

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0 && stdout.includes('ok')) {
        resolve({ available: true, method: 'subprocess' });
      } else {
        resolve({
          available: false,
          method: 'subprocess',
          error: 'BookNLP not installed or Python not found',
        });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ available: false, method: 'subprocess', error: err.message });
    });
  });
}
