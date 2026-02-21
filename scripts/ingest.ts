#!/usr/bin/env tsx
/**
 * Costa Rican Law MCP -- real-data ingestion from SCIJ.
 *
 * Fetches legislation from the official legal portal:
 *   https://pgrweb.go.cr/scij
 *
 * Writes 10 real seed JSON files into data/seed/.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { fetchLegislation } from './lib/fetcher.js';
import { parseScijLaw, lawUrlPair, type TargetLaw } from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = path.resolve(__dirname, '../data/source');
const SEED_DIR = path.resolve(__dirname, '../data/seed');

const TARGET_LAWS: TargetLaw[] = [
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

function parseArgs(): { limit: number | null; useCache: boolean } {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let useCache = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = Number.parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--use-cache') {
      useCache = true;
    }
  }

  return { limit: Number.isFinite(limit) ? limit : null, useCache };
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

async function ingestLaw(
  law: TargetLaw,
  options: { useCache: boolean },
): Promise<{ provisions: number; definitions: number }> {
  const { fichaUrl, textUrl } = lawUrlPair(law.nValor2);

  process.stdout.write(`  Fetching ${law.shortName} (nValor2=${law.nValor2})...`);

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
  const cachedTexto = options.useCache ? readFirstExisting(textoCachePaths) : null;

  const fichaHtml = cachedFicha ?? await fetchLegislation(fichaUrl);
  const textoHtml = cachedTexto ?? await fetchLegislation(textUrl);

  fs.writeFileSync(path.join(SOURCE_DIR, `${law.id}.ficha.html`), fichaHtml);
  fs.writeFileSync(path.join(SOURCE_DIR, `${law.id}.texto.html`), textoHtml);

  const parsed = parseScijLaw(law, fichaHtml, textoHtml);
  const seedPath = path.join(SEED_DIR, law.seedFile);
  fs.writeFileSync(seedPath, `${JSON.stringify(parsed, null, 2)}\n`);

  const sourceLabel = (cachedFicha && cachedTexto) ? 'cache' : 'network';
  console.log(` OK (${parsed.provisions.length} provisions, ${parsed.definitions.length} definitions, source=${sourceLabel})`);

  return {
    provisions: parsed.provisions.length,
    definitions: parsed.definitions.length,
  };
}

async function main(): Promise<void> {
  const { limit, useCache } = parseArgs();
  const laws = limit ? TARGET_LAWS.slice(0, limit) : TARGET_LAWS;

  console.log('Costa Rican Law MCP -- Real Ingestion from SCIJ');
  console.log('================================================');
  console.log('Source: https://pgrweb.go.cr/scij');
  console.log(`Target laws: ${laws.length}`);
  if (limit) console.log(`--limit ${limit}`);
  if (useCache) console.log('--use-cache');
  console.log('');

  ensureDirs();
  clearSeedJsons();

  let totalProvisions = 0;
  let totalDefinitions = 0;

  for (const law of laws) {
    try {
      const result = await ingestLaw(law, { useCache });
      totalProvisions += result.provisions;
      totalDefinitions += result.definitions;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  FAILED ${law.shortName}: ${message}`);
      throw error;
    }
  }

  console.log('');
  console.log('Ingestion summary');
  console.log('-----------------');
  console.log(`Documents:   ${laws.length}`);
  console.log(`Provisions:  ${totalProvisions}`);
  console.log(`Definitions: ${totalDefinitions}`);
  console.log(`Seed dir:    ${SEED_DIR}`);
}

main().catch(error => {
  console.error('Fatal ingestion error:', error);
  process.exit(1);
});
