/**
 * Rate-limited HTTP fetcher for Costa Rica's official legal portal (SCIJ).
 *
 * Uses curl because some SCIJ endpoints are not reliably reachable via undici/fetch.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const USER_AGENT = 'Ansvar-Law-MCP/1.0 (real-ingestion; contact: hello@ansvar.ai)';
const MIN_DELAY_MS = 1200;

let lastRequestAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function applyRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (elapsed < MIN_DELAY_MS) {
    await sleep(MIN_DELAY_MS - elapsed);
  }
  lastRequestAt = Date.now();
}

export interface FetchOptions {
  maxRetries?: number;
  accept?: string;
  timeoutSec?: number;
}

/**
 * Fetches legislation HTML from SCIJ with throttling + retries.
 */
export async function fetchLegislation(url: string, options: FetchOptions = {}): Promise<string> {
  const maxRetries = options.maxRetries ?? 3;
  const accept = options.accept ?? 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8';
  const timeoutSec = options.timeoutSec ?? 30;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await applyRateLimit();

    try {
      const { stdout } = await execFileAsync(
        'curl',
        [
          '-fLs',
          '--max-time',
          String(timeoutSec),
          '-A',
          USER_AGENT,
          '-H',
          `Accept: ${accept}`,
          '-H',
          'Accept-Language: es-CR,es;q=0.9,en;q=0.3',
          url,
        ],
        {
          maxBuffer: 20 * 1024 * 1024,
        },
      );

      return stdout;
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries) break;
      const backoffMs = Math.min(8000, 1000 * Math.pow(2, attempt));
      await sleep(backoffMs);
    }
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Failed to fetch ${url}: ${reason}`);
}
