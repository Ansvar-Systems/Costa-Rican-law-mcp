/**
 * Rate-limited HTTP client for Costa Rica's official legal portal (SCIJ).
 *
 * Uses curl for reliability with SCIJ's legacy ASP.NET endpoints.
 */

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const USER_AGENT = 'Ansvar-Law-MCP/1.0 (real-ingestion; contact: hello@ansvar.ai)';
const ENV_DELAY_MS = Number.parseInt(process.env.MCP_FETCH_DELAY_MS ?? '', 10);
const MIN_DELAY_MS = Number.isFinite(ENV_DELAY_MS) && ENV_DELAY_MS >= 1000 ? ENV_DELAY_MS : 1200;
const ENV_TIMEOUT_SEC = Number.parseInt(process.env.MCP_FETCH_TIMEOUT_SEC ?? '', 10);
const DEFAULT_TIMEOUT_SEC = Number.isFinite(ENV_TIMEOUT_SEC) && ENV_TIMEOUT_SEC >= 5 ? ENV_TIMEOUT_SEC : 45;
const ENV_MAX_RETRIES = Number.parseInt(process.env.MCP_FETCH_MAX_RETRIES ?? '', 10);
const DEFAULT_MAX_RETRIES = Number.isFinite(ENV_MAX_RETRIES) && ENV_MAX_RETRIES >= 0 ? ENV_MAX_RETRIES : 3;
const DEFAULT_COOKIE_JAR = path.join(os.tmpdir(), 'scij-ingestion-cookies.txt');

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

async function ensureCookieJar(cookieJar: string): Promise<void> {
  try {
    await fs.access(cookieJar);
  } catch {
    await fs.writeFile(cookieJar, '', 'utf-8');
  }
}

export interface FormField {
  key: string;
  value: string;
}

export interface FetchOptions {
  maxRetries?: number;
  accept?: string;
  timeoutSec?: number;
  method?: 'GET' | 'POST';
  formFields?: FormField[];
  referer?: string;
  cookieJar?: string;
}

/**
 * Fetches HTML from SCIJ with throttling + retries + cookie jar persistence.
 */
export async function fetchLegislation(url: string, options: FetchOptions = {}): Promise<string> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const accept = options.accept ?? 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8';
  const timeoutSec = options.timeoutSec ?? DEFAULT_TIMEOUT_SEC;
  const method = options.method ?? 'GET';
  const referer = options.referer ?? 'https://pgrweb.go.cr/scij/';
  const cookieJar = options.cookieJar ?? DEFAULT_COOKIE_JAR;

  await ensureCookieJar(cookieJar);

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await applyRateLimit();

    try {
      const args: string[] = [
        '-fLsS',
        '--http1.1',
        '--max-time',
        String(timeoutSec),
        '-A',
        USER_AGENT,
        '-H',
        `Accept: ${accept}`,
        '-H',
        'Accept-Language: es-CR,es;q=0.9,en;q=0.3',
        '-b',
        cookieJar,
        '-c',
        cookieJar,
      ];

      if (referer) {
        args.push('-e', referer);
      }

      if (method === 'POST') {
        for (const field of options.formFields ?? []) {
          args.push('--data-urlencode', `${field.key}=${field.value}`);
        }
      }

      args.push(url);

      const { stdout } = await execFileAsync('curl', args, {
        maxBuffer: 50 * 1024 * 1024,
      });

      if (!stdout || stdout.trim().length === 0) {
        throw new Error('Empty response body');
      }

      return stdout;
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries) break;
      const backoffMs = Math.min(10000, 1000 * Math.pow(2, attempt));
      await sleep(backoffMs);
    }
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Failed to fetch ${url}: ${reason}`);
}
