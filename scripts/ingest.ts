#!/usr/bin/env tsx
/**
 * Costa Rican Law MCP ingestion from SCIJ.
 *
 * Modes:
 * - Curated mode (default): ingest maintained set of core laws.
 * - Full-corpus mode (--full-corpus): discover and ingest all laws (type Ley) by year.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchLegislation, type FormField } from './lib/fetcher.js';
import { extractTextoCompletoStaticUrl, parseScijLaw, lawUrlPair, type TargetLaw } from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = path.resolve(__dirname, '../data/source');
const SEED_DIR = path.resolve(__dirname, '../data/seed');
const MANIFEST_PATH = path.join(SOURCE_DIR, 'scij-full-corpus-ids.json');
const FAILURE_LOG_PATH = path.join(SOURCE_DIR, 'scij-ingestion-failures.json');

const SELECTIVE_FORM_URL = 'https://pgrweb.go.cr/scij/Busqueda/Normativa/Normas/nrm_selectiva.aspx';
const DISCOVERY_RESULT_CAP = 100;

const CURATED_TARGET_LAWS: TargetLaw[] = [
  {
    id: 'cr-ley8968',
    nValor2: 70975,
    shortName: 'Ley 8968',
    titleEn: 'Law for the Protection of Persons Regarding the Processing of Personal Data',
    seedFile: '01-personal-data-protection.json',
    description: 'Official SCIJ consolidated text of Law 8968 on personal data protection and data subject rights.',
  },
  {
    id: 'cr-ley9048',
    nValor2: 73583,
    shortName: 'Ley 9048',
    titleEn: 'Reform of Computer-Related Crimes in the Penal Code',
    seedFile: '02-computer-crimes-reform.json',
    description: 'Official SCIJ text of Law 9048 reforming computer and related crimes in the Penal Code.',
  },
  {
    id: 'cr-ley8642',
    nValor2: 63431,
    shortName: 'Ley 8642',
    titleEn: 'General Telecommunications Law',
    seedFile: '03-telecommunications-law.json',
    description: 'Official SCIJ consolidated text of Costa Rica’s General Telecommunications Law.',
  },
  {
    id: 'cr-ley8454',
    nValor2: 55666,
    shortName: 'Ley 8454',
    titleEn: 'Law on Certificates, Digital Signatures, and Electronic Documents',
    seedFile: '04-digital-signatures.json',
    description: 'Official SCIJ text governing digital signatures, certificates, and electronic documents.',
  },
  {
    id: 'cr-ley8220',
    nValor2: 48116,
    shortName: 'Ley 8220',
    titleEn: 'Law for the Protection of Citizens from Excessive Administrative Requirements',
    seedFile: '05-administrative-burden-reduction.json',
    description: 'Official SCIJ consolidated text of Law 8220 on administrative simplification and anti-red-tape obligations.',
  },
  {
    id: 'cr-codigo-penal-4573',
    nValor2: 5027,
    shortName: 'Ley 4573',
    titleEn: 'Penal Code',
    seedFile: '06-criminal-code.json',
    description: 'Official SCIJ consolidated text of the Costa Rican Penal Code (Law 4573).',
  },
  {
    id: 'cr-ley8148',
    nValor2: 47430,
    shortName: 'Ley 8148',
    titleEn: 'Addition of Computer Crime Provisions to the Penal Code',
    seedFile: '07-computer-crimes-additions.json',
    description: 'Official SCIJ text of Law 8148 adding Articles 196 bis, 217 bis, and 229 bis to the Penal Code.',
  },
  {
    id: 'cr-ley10069',
    nValor2: 95870,
    shortName: 'Ley 10069',
    titleEn: 'Law on Electronic Bills of Exchange and Promissory Notes',
    seedFile: '08-electronic-bills-and-notes.json',
    description: 'Official SCIJ text regulating electronic bills of exchange and promissory notes.',
  },
  {
    id: 'cr-ley10039',
    nValor2: 95388,
    shortName: 'Ley 10039',
    titleEn: 'Law Confirming Electronic Invoice as an Enforceable and Negotiable Instrument',
    seedFile: '09-electronic-invoice-title.json',
    description: 'Official SCIJ text confirming enforceability and negotiability of electronic invoices.',
  },
  {
    id: 'cr-ley10500',
    nValor2: 102475,
    shortName: 'Ley 10500',
    titleEn: 'Law Modernizing Interception of Communications',
    seedFile: '10-communications-intervention-modernization.json',
    description: 'Official SCIJ text modernizing legal rules for judicially authorized communications interception.',
  },
];

const LEGACY_ID_MAP = new Map<number, string>([
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

interface CliArgs {
  limit: number | null;
  useCache: boolean;
  resume: boolean;
  fullCorpus: boolean;
  yearFrom: number;
  yearTo: number;
  maxLaws: number | null;
  lawType: string;
}

interface DiscoveryManifest {
  generated_at: string;
  year_from: number;
  year_to: number;
  law_type: string;
  ids: number[];
}

interface FailedLawEntry {
  id: string;
  nValor2: number;
  error: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const nowYear = new Date().getUTCFullYear();

  let limit: number | null = null;
  let useCache = false;
  let resume = false;
  let fullCorpus = false;
  let yearFrom = 1821;
  let yearTo = nowYear;
  let maxLaws: number | null = null;
  let lawType = 'L  '; // Ley

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--limit' && args[i + 1]) {
      limit = Number.parseInt(args[++i], 10);
    } else if (arg === '--use-cache') {
      useCache = true;
    } else if (arg === '--resume') {
      resume = true;
    } else if (arg === '--full-corpus') {
      fullCorpus = true;
    } else if (arg === '--year-from' && args[i + 1]) {
      yearFrom = Number.parseInt(args[++i], 10);
    } else if (arg === '--year-to' && args[i + 1]) {
      yearTo = Number.parseInt(args[++i], 10);
    } else if (arg === '--max-laws' && args[i + 1]) {
      maxLaws = Number.parseInt(args[++i], 10);
    } else if (arg === '--law-type' && args[i + 1]) {
      lawType = args[++i];
    }
  }

  return {
    limit: Number.isFinite(limit) ? limit : null,
    useCache,
    resume,
    fullCorpus,
    yearFrom,
    yearTo,
    maxLaws: Number.isFinite(maxLaws) ? maxLaws : null,
    lawType,
  };
}

function ensureDirs(): void {
  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.mkdirSync(SEED_DIR, { recursive: true });
}

function clearSeedJsons(): void {
  for (const file of fs.readdirSync(SEED_DIR)) {
    if (!file.endsWith('.json')) continue;
    fs.unlinkSync(path.join(SEED_DIR, file));
  }
}

function readFirstExisting(paths: string[]): string | null {
  for (const p of paths) {
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, 'utf-8');
    if (text.trim().length > 0) return text;
  }
  return null;
}

function extractHiddenInput(html: string, name: string): string {
  const re = new RegExp(`name="${name}"[^>]*value="([^"]*)"`, 'i');
  const match = html.match(re);
  return match?.[1] ?? '';
}

function decodeAmp(value: string): string {
  return value.replace(/&amp;/g, '&');
}

function isPortalErrorPage(html: string): boolean {
  return /PagError\.aspx\?nError=/i.test(html) || /name="aspnetForm"[^>]*action="\.\/*PagError\.aspx/i.test(html);
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
  const leftStart = new Date(startDay * dayMs);
  const leftEnd = new Date(midDay * dayMs);
  const rightStart = new Date((midDay + 1) * dayMs);
  const rightEnd = new Date(endDay * dayMs);

  return [
    { start: leftStart, end: leftEnd },
    { start: rightStart, end: rightEnd },
  ];
}

interface ScijSearchResponse {
  firstPageHtml: string;
  firstPageIds: number[];
  windowInfo: { start: number; end: number; total: number } | null;
  page2Template: string | null;
}

function writeManifest(manifest: DiscoveryManifest): void {
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

function readManifest(): DiscoveryManifest | null {
  if (!fs.existsSync(MANIFEST_PATH)) return null;
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8')) as DiscoveryManifest;
}

async function searchScijRange(
  dateFrom: Date,
  dateTo: Date,
  lawType: string,
): Promise<ScijSearchResponse> {
  const formHtml = await fetchLegislation(SELECTIVE_FORM_URL, {
    method: 'GET',
    referer: SELECTIVE_FORM_URL,
  });

  const dateFromText = formatScijDate(dateFrom);
  const dateToText = formatScijDate(dateTo);

  const formFields: FormField[] = [
    { key: '_ctl0__ctl0_ToolkitScriptManager1_HiddenField', value: extractHiddenInput(formHtml, '_ctl0__ctl0_ToolkitScriptManager1_HiddenField') },
    { key: '__VIEWSTATE', value: extractHiddenInput(formHtml, '__VIEWSTATE') },
    { key: '__VIEWSTATEGENERATOR', value: extractHiddenInput(formHtml, '__VIEWSTATEGENERATOR') },
    { key: '__EVENTVALIDATION', value: extractHiddenInput(formHtml, '__EVENTVALIDATION') },
    { key: '_ctl0:_ctl0:ContentPlaceHolder1:ContentPlaceHolderMenuBusqueda:ddTipoNorma', value: lawType },
    { key: '_ctl0:_ctl0:ContentPlaceHolder1:ContentPlaceHolderMenuBusqueda:txtFechaDesde', value: dateFromText },
    { key: '_ctl0:_ctl0:ContentPlaceHolder1:ContentPlaceHolderMenuBusqueda:txtFechaHasta', value: dateToText },
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

  const windowInfo = parseResultWindow(firstPageHtml);
  const page2Template = extractPage2Template(firstPageHtml);

  return {
    firstPageHtml,
    firstPageIds: collectNormaIds(firstPageHtml),
    windowInfo,
    page2Template,
  };
}

async function collectAllResultPageIds(search: ScijSearchResponse): Promise<number[]> {
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

async function discoverLawIdsForDateRange(
  dateFrom: Date,
  dateTo: Date,
  lawType: string,
): Promise<number[]> {
  const search = await searchScijRange(dateFrom, dateTo, lawType);
  const windowInfo = search.windowInfo;
  const reportedTotal = windowInfo?.total ?? search.firstPageIds.length;
  const saturated = reportedTotal >= DISCOVERY_RESULT_CAP;
  const split = splitDateRange(dateFrom, dateTo);

  // SCIJ appears capped at 100 results for a single search. Split range recursively.
  if (saturated && split) {
    const [left, right] = split;
    const leftIds = await discoverLawIdsForDateRange(left.start, left.end, lawType);
    const rightIds = await discoverLawIdsForDateRange(right.start, right.end, lawType);
    return Array.from(new Set([...leftIds, ...rightIds]));
  }

  if (saturated && !split) {
    process.stdout.write(` [warn:cap@${formatScijDate(dateFrom)}]`);
  }

  return collectAllResultPageIds(search);
}

async function discoverLawIdsForYear(year: number, lawType: string): Promise<number[]> {
  const dateFrom = toUtcDate(year, 1, 1);
  const dateTo = toUtcDate(year, 12, 31);
  return discoverLawIdsForDateRange(dateFrom, dateTo, lawType);
}

async function discoverFullCorpusIds(
  yearFrom: number,
  yearTo: number,
  lawType: string,
): Promise<number[]> {
  const ids = new Set<number>();
  const step = yearFrom <= yearTo ? 1 : -1;

  for (let year = yearFrom; step > 0 ? year <= yearTo : year >= yearTo; year += step) {
    process.stdout.write(`  Discovering year ${year}...`);

    try {
      const yearIds = await discoverLawIdsForYear(year, lawType);
      for (const id of yearIds) ids.add(id);
      console.log(` ${yearIds.length} ids (cumulative ${ids.size})`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const shortMsg = msg.replace(/\s+/g, ' ').slice(0, 220);
      console.log(` FAILED (${shortMsg})`);
    }
  }

  return Array.from(ids.values());
}

function buildFullCorpusTargets(
  idsToBuild: number[],
  allOrderedIds?: number[],
): TargetLaw[] {
  const sortedAll = [...(allOrderedIds ?? idsToBuild)].sort((a, b) => a - b);
  const order = new Map<number, number>();
  sortedAll.forEach((id, idx) => order.set(id, idx + 1));

  const sortedIds = [...idsToBuild].sort((a, b) => a - b);

  return sortedIds.map((nValor2) => {
    const mappedId = LEGACY_ID_MAP.get(nValor2) ?? `cr-scij-${nValor2}`;
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
  });
}

function readSeedCounts(seedPath: string): { provisions: number; definitions: number } {
  const parsed = JSON.parse(fs.readFileSync(seedPath, 'utf-8')) as {
    provisions?: unknown[];
    definitions?: unknown[];
  };

  return {
    provisions: parsed.provisions?.length ?? 0,
    definitions: parsed.definitions?.length ?? 0,
  };
}

async function ingestLaw(
  law: TargetLaw,
  options: { useCache: boolean; resume: boolean },
): Promise<{ provisions: number; definitions: number; skipped: boolean }> {
  const seedPath = path.join(SEED_DIR, law.seedFile);

  if (options.resume && fs.existsSync(seedPath)) {
    const counts = readSeedCounts(seedPath);
    if (counts.provisions > 0) {
      console.log(`  Skipping ${law.id} (existing seed, ${counts.provisions} provisions)`);
      return { ...counts, skipped: true };
    }
    console.log(`  Reprocessing ${law.id} (existing seed has 0 provisions)`);
  }

  const { fichaUrl, textUrl } = lawUrlPair(law.nValor2);

  process.stdout.write(`  Fetching ${law.id} (nValor2=${law.nValor2})...`);

  const fichaCachePaths = [
    path.join(SOURCE_DIR, `${law.id}.ficha.html`),
    `/tmp/meta_${law.nValor2}.html`,
    `/tmp/cr_${law.nValor2}_ficha.html`,
  ];
  const textoCachePaths = [
    path.join(SOURCE_DIR, `${law.id}.texto.html`),
    `/tmp/text_${law.nValor2}.html`,
    `/tmp/cr_${law.nValor2}_texto.html`,
  ];

  const cachedFicha = options.useCache ? readFirstExisting(fichaCachePaths) : null;
  const rawCachedTexto = options.useCache ? readFirstExisting(textoCachePaths) : null;
  const cachedTexto = rawCachedTexto && !isPortalErrorPage(rawCachedTexto) ? rawCachedTexto : null;
  const fichaSource = cachedFicha ? 'cache' : 'network';
  let textSource = cachedTexto ? 'cache' : 'network:nrm';

  const fichaHtml = cachedFicha ?? await fetchLegislation(fichaUrl, { method: 'GET', referer: SELECTIVE_FORM_URL });
  let textoHtml = cachedTexto;

  if (!textoHtml) {
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
          throw new Error(`nrm_texto_completo failed (${nrmReason}); static TextoCompleto failed (${staticReason})`);
        }
      } else {
        const nrmReason = nrmError instanceof Error ? nrmError.message : String(nrmError);
        throw new Error(`nrm_texto_completo failed (${nrmReason}); no static TextoCompleto URL found in ficha`);
      }
    }
  }

  fs.writeFileSync(path.join(SOURCE_DIR, `${law.id}.ficha.html`), fichaHtml);
  fs.writeFileSync(path.join(SOURCE_DIR, `${law.id}.texto.html`), textoHtml);

  const parsed = parseScijLaw(law, fichaHtml, textoHtml);
  if (parsed.provisions.length === 0) {
    throw new Error('No provisions parsed from fetched source text');
  }
  fs.writeFileSync(seedPath, `${JSON.stringify(parsed, null, 2)}\n`);

  const sourceLabel = `${fichaSource}+${textSource}`;
  console.log(` OK (${parsed.provisions.length} provisions, ${parsed.definitions.length} definitions, source=${sourceLabel})`);

  return {
    provisions: parsed.provisions.length,
    definitions: parsed.definitions.length,
    skipped: false,
  };
}

async function main(): Promise<void> {
  const args = parseArgs();

  ensureDirs();

  let laws: TargetLaw[];

  if (args.fullCorpus) {
    console.log('Costa Rican Law MCP -- FULL CORPUS Ingestion from SCIJ');
    console.log('========================================================');
    console.log('Source: https://pgrweb.go.cr/scij');
    console.log(`Mode: full-corpus, law_type="${args.lawType.trim() || args.lawType}"`);
    console.log(`Years: ${args.yearFrom}..${args.yearTo}`);
    if (args.useCache) console.log('--use-cache');
    if (args.resume) console.log('--resume');
    if (args.maxLaws) console.log(`--max-laws ${args.maxLaws}`);
    console.log('');

    const existingManifest = readManifest();

    let idsAll: number[];
    let idsForThisRun: number[];

    const canReuseManifest = !!existingManifest
      && existingManifest.year_from === args.yearFrom
      && existingManifest.year_to === args.yearTo
      && existingManifest.law_type === args.lawType;

    if (args.resume && canReuseManifest) {
      idsAll = existingManifest!.ids;
      idsForThisRun = idsAll;
      console.log(`Loaded manifest with ${idsAll.length} IDs from ${MANIFEST_PATH}`);
    } else {
      const discoveredIds = await discoverFullCorpusIds(args.yearFrom, args.yearTo, args.lawType);

      if (args.resume && existingManifest && existingManifest.law_type === args.lawType) {
        const existingSet = new Set(existingManifest.ids);
        const newIds = discoveredIds.filter(id => !existingSet.has(id));
        idsAll = Array.from(new Set([...existingManifest.ids, ...discoveredIds])).sort((a, b) => a - b);
        idsForThisRun = newIds;
        console.log(`Existing manifest IDs: ${existingManifest.ids.length}`);
        console.log(`Newly discovered IDs: ${newIds.length}`);
      } else {
        idsAll = discoveredIds;
        idsForThisRun = discoveredIds;
      }
    }

    const manifest: DiscoveryManifest = {
      generated_at: new Date().toISOString(),
      year_from: args.yearFrom,
      year_to: args.yearTo,
      law_type: args.lawType,
      ids: [...idsAll].sort((a, b) => a - b),
    };
    writeManifest(manifest);

    laws = buildFullCorpusTargets(idsForThisRun, manifest.ids);

    if (args.maxLaws) {
      laws = laws.slice(0, args.maxLaws);
    }

    if (!args.resume) {
      clearSeedJsons();
    }

    console.log(`Discovered IDs: ${manifest.ids.length}`);
    console.log(`Planned ingestion: ${laws.length} laws`);
    console.log('');
  } else {
    laws = args.limit ? CURATED_TARGET_LAWS.slice(0, args.limit) : CURATED_TARGET_LAWS;

    console.log('Costa Rican Law MCP -- Curated Ingestion from SCIJ');
    console.log('===================================================');
    console.log('Source: https://pgrweb.go.cr/scij');
    console.log(`Target laws: ${laws.length}`);
    if (args.limit) console.log(`--limit ${args.limit}`);
    if (args.useCache) console.log('--use-cache');
    if (args.resume) console.log('--resume');
    console.log('');

    if (!args.resume) {
      clearSeedJsons();
    }
  }

  let totalProvisions = 0;
  let totalDefinitions = 0;
  let skipped = 0;
  let succeeded = 0;
  const failed: FailedLawEntry[] = [];

  for (const law of laws) {
    try {
      const result = await ingestLaw(law, {
        useCache: args.useCache,
        resume: args.resume,
      });
      totalProvisions += result.provisions;
      totalDefinitions += result.definitions;
      if (result.skipped) skipped++;
      else succeeded++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const shortMessage = message.replace(/\s+/g, ' ').slice(0, 220);
      console.error(`  FAILED ${law.id}: ${shortMessage}`);
      failed.push({
        id: law.id,
        nValor2: law.nValor2,
        error: shortMessage,
      });
    }
  }

  fs.writeFileSync(
    FAILURE_LOG_PATH,
    `${JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        full_corpus: args.fullCorpus,
        year_from: args.yearFrom,
        year_to: args.yearTo,
        law_type: args.lawType,
        attempted: laws.length,
        succeeded,
        skipped,
        failed: failed.length,
        failures: failed,
      },
      null,
      2,
    )}\n`,
  );

  console.log('');
  console.log('Ingestion summary');
  console.log('-----------------');
  console.log(`Documents:   ${laws.length}`);
  console.log(`Succeeded:   ${succeeded}`);
  console.log(`Skipped:     ${skipped}`);
  console.log(`Failed:      ${failed.length}`);
  console.log(`Provisions:  ${totalProvisions}`);
  console.log(`Definitions: ${totalDefinitions}`);
  console.log(`Seed dir:    ${SEED_DIR}`);
  console.log(`Failure log: ${FAILURE_LOG_PATH}`);
  if (args.fullCorpus) {
    console.log(`Manifest:    ${MANIFEST_PATH}`);
  }
}

main().catch(error => {
  console.error('Fatal ingestion error:', error);
  process.exit(1);
});
