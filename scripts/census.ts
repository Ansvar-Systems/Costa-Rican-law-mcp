#!/usr/bin/env tsx
/**
 * Costa Rican Law MCP — Census Script (Golden Standard)
 *
 * Enumerates ALL Costa Rican legislation (type "Ley") from SCIJ
 * (pgrweb.go.cr/scij) by performing date-range selective searches
 * across the full legislative history (1821–present).
 *
 * Writes data/census.json in golden standard format.
 *
 * Usage:
 *   npx tsx scripts/census.ts                     # Full census (1821–present)
 *   npx tsx scripts/census.ts --year-from 2000    # Only from 2000 onward
 *   npx tsx scripts/census.ts --reuse-manifest    # Use existing manifest IDs
 *
 * Source: SCIJ (Sistema Costarricense de Información Jurídica)
 *         operated by the Procuraduría General de la República (PGR)
 *         https://pgrweb.go.cr/scij
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchLegislation, type FormField } from './lib/fetcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../data');
const CENSUS_PATH = path.join(DATA_DIR, 'census.json');
const MANIFEST_PATH = path.join(DATA_DIR, 'source/scij-full-corpus-ids.json');
const SEED_DIR = path.join(DATA_DIR, 'seed');

const SELECTIVE_FORM_URL = 'https://pgrweb.go.cr/scij/Busqueda/Normativa/Normas/nrm_selectiva.aspx';
const DISCOVERY_RESULT_CAP = 100;

// ---------- interfaces ----------

interface CensusLaw {
  id: string;
  nValor2: number;
  title: string;
  classification: 'ingestable' | 'inaccessible' | 'metadata_only';
  url: string;
  seedFile?: string;
}

interface CensusOutput {
  generated_at: string;
  source: string;
  description: string;
  stats: {
    total: number;
    class_ingestable: number;
    class_inaccessible: number;
    class_metadata_only: number;
  };
  ingestion?: {
    completed_at: string;
    total_laws: number;
    total_provisions: number;
    coverage_pct: string;
  };
  laws: CensusLaw[];
}

interface CliArgs {
  yearFrom: number;
  yearTo: number;
  reuseManifest: boolean;
  lawType: string;
}

// ---------- helpers ----------

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const nowYear = new Date().getUTCFullYear();

  let yearFrom = 1821;
  let yearTo = nowYear;
  let reuseManifest = false;
  let lawType = 'L  '; // Ley

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--year-from' && args[i + 1]) {
      yearFrom = Number.parseInt(args[++i], 10);
    } else if (arg === '--year-to' && args[i + 1]) {
      yearTo = Number.parseInt(args[++i], 10);
    } else if (arg === '--reuse-manifest') {
      reuseManifest = true;
    } else if (arg === '--law-type' && args[i + 1]) {
      lawType = args[++i];
    }
  }

  return { yearFrom, yearTo, reuseManifest, lawType };
}

function extractHiddenInput(html: string, name: string): string {
  const re = new RegExp(`name="${name}"[^>]*value="([^"]*)"`, 'i');
  const match = html.match(re);
  return match?.[1] ?? '';
}

function decodeAmp(value: string): string {
  return value.replace(/&amp;/g, '&');
}

function collectNormaIds(html: string): number[] {
  const ids: number[] = [];
  const re = /chkNorma(\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const id = Number.parseInt(match[1], 10);
    if (Number.isFinite(id)) ids.push(id);
  }
  return Array.from(new Set(ids));
}

function parseResultWindow(html: string): { start: number; end: number; total: number } | null {
  const m = html.match(/Resultados\s+(\d+)\s*-\s*(\d+)\s+de\s+(\d+)/i);
  if (!m) return null;
  const start = Number.parseInt(m[1], 10);
  const end = Number.parseInt(m[2], 10);
  const total = Number.parseInt(m[3], 10);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(total)) return null;
  if (start <= 0 || end <= 0 || total <= 0) return null;
  return { start, end, total };
}

function extractPage2Template(html: string): string | null {
  const m = html.match(/href="([^"]*nrm_resultado_selectiva\.aspx[^"]*param2=2[^"]*)"/i);
  return m ? decodeAmp(m[1]) : null;
}

function buildPaginatedUrl(page2Template: string, page: number): string {
  const absolute = page2Template.startsWith('http')
    ? page2Template
    : new URL(page2Template, 'https://pgrweb.go.cr').toString();
  if (/([?&]param2=)\d+/i.test(absolute)) {
    return absolute.replace(/([?&]param2=)\d+/i, `$1${page}`);
  }
  const sep = absolute.includes('?') ? '&' : '?';
  return `${absolute}${sep}param2=${page}`;
}

function formatScijDate(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = date.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function toUtcDate(year: number, month1Based: number, day: number): Date {
  return new Date(Date.UTC(year, month1Based - 1, day));
}

function splitDateRange(start: Date, end: Date): [{ start: Date; end: Date }, { start: Date; end: Date }] | null {
  const dayMs = 24 * 60 * 60 * 1000;
  const startDay = Math.floor(start.getTime() / dayMs);
  const endDay = Math.floor(end.getTime() / dayMs);
  if (startDay >= endDay) return null;
  const midDay = Math.floor((startDay + endDay) / 2);
  return [
    { start: new Date(startDay * dayMs), end: new Date(midDay * dayMs) },
    { start: new Date((midDay + 1) * dayMs), end: new Date(endDay * dayMs) },
  ];
}

// ---------- SCIJ search ----------

async function searchScijRange(
  dateFrom: Date,
  dateTo: Date,
  lawType: string,
): Promise<{ firstPageIds: number[]; windowInfo: { start: number; end: number; total: number } | null; page2Template: string | null; firstPageHtml: string }> {
  const formHtml = await fetchLegislation(SELECTIVE_FORM_URL, {
    method: 'GET',
    referer: SELECTIVE_FORM_URL,
  });

  const formFields: FormField[] = [
    { key: '_ctl0__ctl0_ToolkitScriptManager1_HiddenField', value: extractHiddenInput(formHtml, '_ctl0__ctl0_ToolkitScriptManager1_HiddenField') },
    { key: '__VIEWSTATE', value: extractHiddenInput(formHtml, '__VIEWSTATE') },
    { key: '__VIEWSTATEGENERATOR', value: extractHiddenInput(formHtml, '__VIEWSTATEGENERATOR') },
    { key: '__EVENTVALIDATION', value: extractHiddenInput(formHtml, '__EVENTVALIDATION') },
    { key: '_ctl0:_ctl0:ContentPlaceHolder1:ContentPlaceHolderMenuBusqueda:ddTipoNorma', value: lawType },
    { key: '_ctl0:_ctl0:ContentPlaceHolder1:ContentPlaceHolderMenuBusqueda:txtFechaDesde', value: formatScijDate(dateFrom) },
    { key: '_ctl0:_ctl0:ContentPlaceHolder1:ContentPlaceHolderMenuBusqueda:txtFechaHasta', value: formatScijDate(dateTo) },
    { key: '_ctl0:_ctl0:ContentPlaceHolder1:ContentPlaceHolderMenuBusqueda:txtAnnoDesde', value: String(dateFrom.getUTCFullYear()) },
    { key: '_ctl0:_ctl0:ContentPlaceHolder1:ContentPlaceHolderMenuBusqueda:txtAnnoHasta', value: String(dateTo.getUTCFullYear()) },
    { key: '_ctl0:_ctl0:ContentPlaceHolder1:ContentPlaceHolderMenuBusqueda:ddResultados', value: '100' },
    { key: '_ctl0:_ctl0:ContentPlaceHolder1:ContentPlaceHolderMenuBusqueda:ddOrden', value: 'FECHA' },
    { key: '_ctl0:_ctl0:ContentPlaceHolder1:ContentPlaceHolderMenuBusqueda:ddModo', value: 'DESC' },
    { key: '_ctl0:_ctl0:ContentPlaceHolder1:ContentPlaceHolderMenuBusqueda:cmdBuscar', value: 'Buscar' },
  ];

  const firstPageHtml = await fetchLegislation(SELECTIVE_FORM_URL, {
    method: 'POST',
    formFields,
    referer: SELECTIVE_FORM_URL,
  });

  return {
    firstPageHtml,
    firstPageIds: collectNormaIds(firstPageHtml),
    windowInfo: parseResultWindow(firstPageHtml),
    page2Template: extractPage2Template(firstPageHtml),
  };
}

async function collectAllResultPageIds(search: { firstPageIds: number[]; windowInfo: { start: number; end: number; total: number } | null; page2Template: string | null }): Promise<number[]> {
  const idSet = new Set<number>(search.firstPageIds);

  if (search.windowInfo && search.page2Template) {
    const perPage = Math.max(1, search.windowInfo.end - search.windowInfo.start + 1);
    const totalPages = Math.ceil(search.windowInfo.total / perPage);

    for (let page = 2; page <= totalPages; page++) {
      if (page % 20 === 0 || page === totalPages) {
        process.stdout.write(` [p${page}/${totalPages}]`);
      }
      const pageUrl = buildPaginatedUrl(search.page2Template, page);
      const pageHtml = await fetchLegislation(pageUrl, {
        method: 'GET',
        referer: SELECTIVE_FORM_URL,
      });
      for (const id of collectNormaIds(pageHtml)) {
        idSet.add(id);
      }
    }
  }

  return Array.from(idSet.values());
}

async function discoverIdsForDateRange(
  dateFrom: Date,
  dateTo: Date,
  lawType: string,
): Promise<number[]> {
  const search = await searchScijRange(dateFrom, dateTo, lawType);
  const reportedTotal = search.windowInfo?.total ?? search.firstPageIds.length;
  const saturated = reportedTotal >= DISCOVERY_RESULT_CAP;
  const split = splitDateRange(dateFrom, dateTo);

  if (saturated && split) {
    const [left, right] = split;
    const leftIds = await discoverIdsForDateRange(left.start, left.end, lawType);
    const rightIds = await discoverIdsForDateRange(right.start, right.end, lawType);
    return Array.from(new Set([...leftIds, ...rightIds]));
  }

  if (saturated && !split) {
    process.stdout.write(` [warn:cap@${formatScijDate(dateFrom)}]`);
  }

  return collectAllResultPageIds(search);
}

async function discoverFullCorpusIds(
  yearFrom: number,
  yearTo: number,
  lawType: string,
): Promise<number[]> {
  const ids = new Set<number>();

  for (let year = yearFrom; year <= yearTo; year++) {
    process.stdout.write(`  Discovering year ${year}...`);

    try {
      const dateFrom = toUtcDate(year, 1, 1);
      const dateTo = toUtcDate(year, 12, 31);
      const yearIds = await discoverIdsForDateRange(dateFrom, dateTo, lawType);
      for (const id of yearIds) ids.add(id);
      console.log(` ${yearIds.length} ids (cumulative ${ids.size})`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(` FAILED (${msg.replace(/\s+/g, ' ').slice(0, 200)})`);
    }
  }

  return Array.from(ids.values()).sort((a, b) => a - b);
}

// ---------- main ----------

async function main(): Promise<void> {
  const args = parseArgs();

  console.log('Costa Rican Law MCP — Census');
  console.log('============================\n');
  console.log('  Source:  SCIJ (pgrweb.go.cr/scij)');
  console.log('  Authority: Procuraduria General de la Republica (PGR)');
  console.log(`  Method:  Date-range selective search (${args.yearFrom}–${args.yearTo})`);
  console.log('  License: Government open access\n');

  let allIds: number[];

  if (args.reuseManifest && fs.existsSync(MANIFEST_PATH)) {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8')) as { ids: number[] };
    allIds = manifest.ids.sort((a: number, b: number) => a - b);
    console.log(`  Reusing existing manifest: ${allIds.length} IDs\n`);
  } else {
    console.log('  Starting discovery from SCIJ...\n');
    allIds = await discoverFullCorpusIds(args.yearFrom, args.yearTo, args.lawType);
    console.log('');
  }

  // Cross-reference with existing seed files to classify
  const seedFiles = fs.existsSync(SEED_DIR)
    ? new Set(
        fs.readdirSync(SEED_DIR)
          .filter(f => f.endsWith('.json'))
          .map(f => {
            // Extract nValor2 from filename like "000001-cr-scij-1234.json"
            const m = f.match(/cr-scij-(\d+)\.json$/);
            return m ? Number.parseInt(m[1], 10) : null;
          })
          .filter((id): id is number => id !== null),
      )
    : new Set<number>();

  // Also capture curated IDs
  const curatedIdMap = new Map<number, string>([
    [70975, 'cr-ley8968'],
    [73583, 'cr-ley9048'],
    [63431, 'cr-ley8642'],
    [55666, 'cr-ley8454'],
    [48116, 'cr-ley8220'],
    [5027, 'cr-codigo-penal-4573'],
    [47430, 'cr-ley8148'],
    [95870, 'cr-ley10069'],
    [95388, 'cr-ley10039'],
    [102475, 'cr-ley10500'],
  ]);

  const curatedSeedFiles = new Set(
    fs.existsSync(SEED_DIR)
      ? fs.readdirSync(SEED_DIR)
          .filter(f => f.endsWith('.json'))
          .map(f => {
            for (const [nv2, id] of curatedIdMap.entries()) {
              if (f.includes(id)) return nv2;
            }
            return null;
          })
          .filter((id): id is number => id !== null)
      : [],
  );

  const allSeedIds = new Set([...seedFiles, ...curatedSeedFiles]);

  // Build census law entries
  const laws: CensusLaw[] = allIds.map((nValor2) => {
    const mappedId = curatedIdMap.get(nValor2) ?? `cr-scij-${nValor2}`;
    const ingested = allSeedIds.has(nValor2);

    return {
      id: mappedId,
      nValor2,
      title: `Norma ${nValor2}`, // SCIJ doesn't expose titles in index — title extracted at ingest time
      classification: ingested ? 'ingestable' as const : 'ingestable' as const,
      url: `https://pgrweb.go.cr/scij/Busqueda/Normativa/Normas/nrm_texto_completo.aspx?nValor1=1&nValor2=${nValor2}`,
    };
  });

  // Count ingestion stats
  let totalProvisions = 0;
  let totalDefinitions = 0;
  let ingestedCount = 0;

  if (fs.existsSync(SEED_DIR)) {
    const seedJsonFiles = fs.readdirSync(SEED_DIR).filter(f => f.endsWith('.json'));
    ingestedCount = seedJsonFiles.length;

    for (const f of seedJsonFiles) {
      try {
        const seed = JSON.parse(fs.readFileSync(path.join(SEED_DIR, f), 'utf-8')) as {
          provisions?: unknown[];
          definitions?: unknown[];
        };
        totalProvisions += seed.provisions?.length ?? 0;
        totalDefinitions += seed.definitions?.length ?? 0;
      } catch {
        // skip corrupt files
      }
    }
  }

  // Build census output
  const census: CensusOutput = {
    generated_at: new Date().toISOString(),
    source: 'SCIJ — pgrweb.go.cr/scij (Procuraduria General de la Republica)',
    description: 'Full census of Costa Rican legislation (type: Ley) from SCIJ',
    stats: {
      total: laws.length,
      class_ingestable: laws.filter(l => l.classification === 'ingestable').length,
      class_inaccessible: laws.filter(l => l.classification === 'inaccessible').length,
      class_metadata_only: laws.filter(l => l.classification === 'metadata_only').length,
    },
    ingestion: ingestedCount > 0
      ? {
          completed_at: new Date().toISOString(),
          total_laws: ingestedCount,
          total_provisions: totalProvisions,
          coverage_pct: ((ingestedCount / laws.length) * 100).toFixed(1),
        }
      : undefined,
    laws,
  };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CENSUS_PATH, JSON.stringify(census, null, 2) + '\n');

  console.log(`${'='.repeat(50)}`);
  console.log('CENSUS COMPLETE');
  console.log('='.repeat(50));
  console.log(`  Total laws discovered:  ${laws.length}`);
  console.log(`  Ingestable:             ${census.stats.class_ingestable}`);
  console.log(`  Inaccessible:           ${census.stats.class_inaccessible}`);
  console.log(`  Metadata only:          ${census.stats.class_metadata_only}`);
  if (census.ingestion) {
    console.log('');
    console.log(`  Already ingested:       ${ingestedCount} (${census.ingestion.coverage_pct}%)`);
    console.log(`  Total provisions:       ${totalProvisions}`);
    console.log(`  Total definitions:      ${totalDefinitions}`);
  }
  console.log(`\n  Output: ${CENSUS_PATH}`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
