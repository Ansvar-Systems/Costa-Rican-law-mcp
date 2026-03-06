#!/usr/bin/env tsx
/**
 * Targeted ingestion of MISSING laws only.
 * Reads the manifest, identifies IDs without seed files, and ingests them
 * in reverse order (highest IDs first — newer laws more likely to have text).
 *
 * Usage:
 *   npx tsx scripts/ingest-missing.ts [--limit N] [--min-id N]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEED_DIR = path.resolve(__dirname, '../data/seed');
const MANIFEST_PATH = path.resolve(__dirname, '../data/source/scij-full-corpus-ids.json');
const FAILURE_LOG_PATH = path.resolve(__dirname, '../data/source/scij-ingestion-failures.json');

// Re-use existing modules
const { fetchLegislation } = await import('./lib/fetcher.js');
const { extractTextoCompletoStaticUrl, parseScijLaw, lawUrlPair } = await import('./lib/parser.js');
import type { TargetLaw } from './lib/parser.js';

const SELECTIVE_FORM_URL = 'https://pgrweb.go.cr/scij/Busqueda/Normativa/Normas/nrm_selectiva.aspx';

interface CliArgs {
  limit: number | null;
  minId: number;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let minId = 0;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = Number.parseInt(args[++i], 10);
    } else if (args[i] === '--min-id' && args[i + 1]) {
      minId = Number.parseInt(args[++i], 10);
    }
  }

  return {
    limit: Number.isFinite(limit) ? limit : null,
    minId: Number.isFinite(minId) ? minId : 0,
  };
}

function isPortalErrorPage(html: string): boolean {
  return /PagError\.aspx\?nError=/i.test(html) || /name="aspnetForm"[^>]*action="\.\/*PagError\.aspx/i.test(html);
}

function findMissingIds(manifestIds: number[]): number[] {
  const seedFiles = new Set(fs.readdirSync(SEED_DIR).filter(f => f.endsWith('.json')));
  const seededIds = new Set<number>();

  for (const f of seedFiles) {
    const m = f.match(/cr-scij-(\d+)\.json$/);
    if (m) seededIds.add(Number.parseInt(m[1], 10));
  }

  return manifestIds.filter(id => !seededIds.has(id));
}

function buildTarget(nValor2: number, allIds: number[]): TargetLaw {
  const sortedAll = [...allIds].sort((a, b) => a - b);
  const order = new Map<number, number>();
  sortedAll.forEach((id, idx) => order.set(id, idx + 1));

  const mappedId = `cr-scij-${nValor2}`;
  const seedOrdinal = order.get(nValor2) ?? 1;
  const seedFile = `${String(seedOrdinal).padStart(6, '0')}-${mappedId}.json`;

  return {
    id: mappedId,
    nValor2,
    shortName: `Norma ${nValor2}`,
    titleEn: '',
    seedFile,
    description: `Official SCIJ legislation text (nValor2=${nValor2}).`,
  };
}

async function ingestLaw(
  law: TargetLaw,
): Promise<{ provisions: number; definitions: number }> {
  const seedPath = path.join(SEED_DIR, law.seedFile);

  // Double-check seed doesn't exist
  if (fs.existsSync(seedPath)) {
    const parsed = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
    if (parsed.provisions?.length > 0) {
      return { provisions: parsed.provisions.length, definitions: parsed.definitions?.length ?? 0 };
    }
  }

  const { fichaUrl, textUrl } = lawUrlPair(law.nValor2);

  process.stdout.write(`  Fetching ${law.id} (nValor2=${law.nValor2})...`);

  const fichaHtml = await fetchLegislation(fichaUrl, { method: 'GET', referer: SELECTIVE_FORM_URL });
  let textoHtml: string | null = null;
  let textSource = 'network:nrm';

  // Try nrm_texto_completo first
  let nrmError: unknown;
  try {
    const nrmHtml = await fetchLegislation(textUrl, { method: 'GET', referer: SELECTIVE_FORM_URL });
    if (isPortalErrorPage(nrmHtml)) {
      throw new Error('SCIJ returned PagError for nrm_texto_completo');
    }
    textoHtml = nrmHtml;
  } catch (error) {
    nrmError = error;
  }

  // Fallback to static TextoCompleto URL
  if (!textoHtml) {
    const staticUrl = extractTextoCompletoStaticUrl(fichaHtml);
    if (staticUrl) {
      try {
        const staticHtml = await fetchLegislation(staticUrl, { method: 'GET', referer: fichaUrl });
        if (isPortalErrorPage(staticHtml)) {
          throw new Error('SCIJ returned PagError for TextoCompleto static route');
        }
        textoHtml = staticHtml;
        textSource = 'network:texto-completo';
      } catch (staticError) {
        const nrmReason = nrmError instanceof Error ? nrmError.message : String(nrmError);
        const staticReason = staticError instanceof Error ? staticError.message : String(staticError);
        throw new Error(`nrm failed (${nrmReason}); static failed (${staticReason})`);
      }
    } else {
      const nrmReason = nrmError instanceof Error ? nrmError.message : String(nrmError);
      throw new Error(`nrm failed (${nrmReason}); no static URL`);
    }
  }

  // Save source HTML
  const sourceDir = path.resolve(__dirname, '../data/source');
  fs.writeFileSync(path.join(sourceDir, `${law.id}.ficha.html`), fichaHtml);
  fs.writeFileSync(path.join(sourceDir, `${law.id}.texto.html`), textoHtml);

  const parsed = parseScijLaw(law, fichaHtml, textoHtml);
  if (parsed.provisions.length === 0) {
    throw new Error('No provisions parsed from fetched source text');
  }
  fs.writeFileSync(seedPath, `${JSON.stringify(parsed, null, 2)}\n`);

  console.log(` OK (${parsed.provisions.length} provisions, ${parsed.definitions.length} defs, ${textSource})`);

  return {
    provisions: parsed.provisions.length,
    definitions: parsed.definitions.length,
  };
}

async function main(): Promise<void> {
  const args = parseArgs();

  console.log('Costa Rican Law MCP -- MISSING LAWS Targeted Ingestion');
  console.log('======================================================');
  console.log('Source: https://pgrweb.go.cr/scij');
  if (args.limit) console.log(`--limit ${args.limit}`);
  if (args.minId > 0) console.log(`--min-id ${args.minId}`);
  console.log('');

  // Load manifest
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error('No manifest found. Run --full-corpus first to discover IDs.');
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  const allIds: number[] = manifest.ids;

  // Find missing IDs
  let missingIds = findMissingIds(allIds);
  console.log(`Manifest IDs: ${allIds.length}`);
  console.log(`Missing IDs: ${missingIds.length}`);

  // Filter by min-id
  if (args.minId > 0) {
    missingIds = missingIds.filter(id => id >= args.minId);
    console.log(`Missing above ${args.minId}: ${missingIds.length}`);
  }

  // Sort descending (newest/highest IDs first — more likely to have text)
  missingIds.sort((a, b) => b - a);

  // Apply limit
  if (args.limit) {
    missingIds = missingIds.slice(0, args.limit);
  }

  console.log(`Attempting: ${missingIds.length} laws`);
  console.log('');

  let totalProvisions = 0;
  let totalDefinitions = 0;
  let succeeded = 0;
  const failed: Array<{ id: string; nValor2: number; error: string }> = [];

  for (const nValor2 of missingIds) {
    const law = buildTarget(nValor2, allIds);
    try {
      const result = await ingestLaw(law);
      totalProvisions += result.provisions;
      totalDefinitions += result.definitions;
      succeeded++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const shortMessage = message.replace(/\s+/g, ' ').slice(0, 220);
      console.error(`  FAILED ${law.id}: ${shortMessage}`);
      failed.push({ id: law.id, nValor2: law.nValor2, error: shortMessage });
    }
  }

  fs.writeFileSync(
    FAILURE_LOG_PATH,
    `${JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        mode: 'missing-targeted',
        attempted: missingIds.length,
        succeeded,
        failed: failed.length,
        provisions: totalProvisions,
        definitions: totalDefinitions,
        failures: failed,
      },
      null,
      2,
    )}\n`,
  );

  console.log('');
  console.log('Ingestion summary');
  console.log('-----------------');
  console.log(`Attempted:   ${missingIds.length}`);
  console.log(`Succeeded:   ${succeeded}`);
  console.log(`Failed:      ${failed.length}`);
  console.log(`Provisions:  ${totalProvisions}`);
  console.log(`Definitions: ${totalDefinitions}`);
  console.log(`Seed dir:    ${SEED_DIR}`);
  console.log(`Failure log: ${FAILURE_LOG_PATH}`);
}

main().catch(error => {
  console.error('Fatal ingestion error:', error);
  process.exit(1);
});
