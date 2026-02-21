/**
 * Parser for Costa Rican legislation pages served by SCIJ (pgrweb.go.cr/scij).
 *
 * Inputs:
 * - ficha HTML (metadata page)
 * - texto completo HTML (full law text)
 *
 * Output:
 * - seed JSON-compatible structure with real provisions and optional definitions
 */

export interface TargetLaw {
  id: string;
  nValor2: number;
  shortName: string;
  titleEn: string;
  seedFile: string;
  description: string;
}

export interface ParsedProvision {
  provision_ref: string;
  chapter?: string;
  section: string;
  title: string;
  content: string;
}

export interface ParsedDefinition {
  term: string;
  definition: string;
  source_provision: string;
}

export interface ParsedSeedDocument {
  id: string;
  type: 'statute';
  title: string;
  title_en: string;
  short_name: string;
  status: 'in_force';
  issued_date: string;
  in_force_date: string;
  url: string;
  description: string;
  provisions: ParsedProvision[];
  definitions: ParsedDefinition[];
}

interface ParsedMetadata {
  normType: string;
  normNumber: string;
  title: string;
  issuedDate: string;
  inForceDate: string;
}

const ENTITY_MAP: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  aacute: 'á',
  Aacute: 'Á',
  eacute: 'é',
  Eacute: 'É',
  iacute: 'í',
  Iacute: 'Í',
  oacute: 'ó',
  Oacute: 'Ó',
  uacute: 'ú',
  Uacute: 'Ú',
  ntilde: 'ñ',
  Ntilde: 'Ñ',
  uuml: 'ü',
  Uuml: 'Ü',
  ordm: 'º',
  ordf: 'ª',
  laquo: '«',
  raquo: '»',
  iexcl: '¡',
  iquest: '¿',
  ccedil: 'ç',
  Ccedil: 'Ç',
  copy: '©',
  reg: '®',
  trade: '™',
};

const ARTICLE_HEADING_RE = /(?:^|\n)\s*ART[IÍ]CULO\s+((?:\d+\s*(?:º|°)?(?:\s*(?:bis|ter|qu[áa]ter|quater|quinquies|sexies))?|[ÚU]NICO))\s*[-.:–]?\s*([^\n]*)/gimu;
const CHAPTER_RE = /(?:^|\n)\s*(CAP[IÍ]TULO\s+[IVXLC0-9A-Z]+[^\n]*)/gimu;

function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_m, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const codePoint = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _m;
    }
    if (entity.startsWith('#')) {
      const codePoint = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _m;
    }
    return ENTITY_MAP[entity] ?? _m;
  });
}

function stripTagsPreserveBreaks(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<li>/gi, '\n- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

function normalizeWhitespace(input: string): string {
  return input
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function toIsoDate(dateDdMmYyyy: string): string {
  const m = dateDdMmYyyy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return '';
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

function asciiSlug(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractMainTextRegion(textoHtml: string): string {
  const startMarker = textoHtml.indexOf('<div id="divTextoPrincipal"');
  if (startMarker === -1) return textoHtml;

  const endMarker = textoHtml.indexOf('<a name="down"', startMarker);
  if (endMarker === -1) {
    return textoHtml.slice(startMarker);
  }
  return textoHtml.slice(startMarker, endMarker);
}

function parseMetadataFromFicha(fichaHtml: string): ParsedMetadata {
  const clean = decodeHtmlEntities(fichaHtml);

  const typeNumMatch = clean.match(/class="tabla_titulo"[^>]*>[\s\S]*?([A-Za-zÁÉÍÓÚÑáéíóúñ ]+)\s*&nbsp;:\s*([0-9A-Za-z.-]+)/i)
    || clean.match(/([A-Za-zÁÉÍÓÚÑáéíóúñ ]+)\s*:\s*([0-9A-Za-z.-]+)\s*&nbsp;&nbsp;&nbsp;del&nbsp;/i);

  const titleMatch = clean.match(/class="nombre_norma"[^>]*>\s*([\s\S]*?)\s*<\/td>/i)
    || clean.match(/<!--Nombre de la norma-->\s*([\s\S]*?)<br>/i);

  const issuedMatch = clean.match(/(?:Ley|Decreto|Reglamento|Resolución|Constitución)[\s\S]{0,120}?\bdel\s*(\d{2}\/\d{2}\/\d{4})/i)
    || clean.match(/\bdel\s*(\d{2}\/\d{2}\/\d{4})/i);
  const inForceMatch = clean.match(/Fecha de vigencia desde:\s*<\/nobr>[\s\S]*?<td[^>]*>\s*(\d{2}\/\d{2}\/\d{4})/i);

  const normType = typeNumMatch?.[1]?.replace(/\s+/g, ' ').trim() ?? 'Norma';
  const normNumber = typeNumMatch?.[2]?.replace(/\s+/g, ' ').trim() ?? '';
  const title = normalizeWhitespace(stripTagsPreserveBreaks(titleMatch?.[1] ?? '')).replace(/\n/g, ' ').trim();

  return {
    normType,
    normNumber,
    title,
    issuedDate: toIsoDate(issuedMatch?.[1] ?? ''),
    inForceDate: toIsoDate(inForceMatch?.[1] ?? ''),
  };
}

function collectChapterAnchors(text: string): Array<{ index: number; chapter: string }> {
  const anchors: Array<{ index: number; chapter: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = CHAPTER_RE.exec(text)) !== null) {
    const chapter = normalizeWhitespace(match[1]);
    anchors.push({ index: match.index, chapter });
  }
  return anchors;
}

function nearestChapter(anchors: Array<{ index: number; chapter: string }>, atIndex: number): string | undefined {
  let found: string | undefined;
  for (const a of anchors) {
    if (a.index <= atIndex) {
      found = a.chapter;
    } else {
      break;
    }
  }
  return found;
}

function buildProvisionRef(section: string): string {
  const normalized = section
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[º°]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '');
  return `art${normalized}`;
}

function parseProvisionsFromText(textoHtml: string): ParsedProvision[] {
  const mainRegion = extractMainTextRegion(textoHtml);
  const decoded = decodeHtmlEntities(mainRegion);
  const plain = normalizeWhitespace(stripTagsPreserveBreaks(decoded));

  const chapters = collectChapterAnchors(plain);

  const matches: Array<{
    start: number;
    end: number;
    section: string;
    headingTail: string;
  }> = [];

  let m: RegExpExecArray | null;
  while ((m = ARTICLE_HEADING_RE.exec(plain)) !== null) {
    const full = m[0];
    const articleIdx = full.search(/ART[IÍ]CULO/i);
    const start = m.index + Math.max(articleIdx, 0);
    const end = m.index + full.length;
    const section = m[1].replace(/[º°]/g, '').replace(/\s+/g, ' ').trim();
    const headingTail = (m[2] ?? '').trim();
    matches.push({ start, end, section, headingTail });
  }

  const provisions: ParsedProvision[] = [];
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const nextStart = i + 1 < matches.length ? matches[i + 1].start : plain.length;
    const rawContent = plain.slice(current.end, nextStart).trim();

    if (rawContent.length < 4) continue;

    const title = current.headingTail.length > 0
      ? `ARTÍCULO ${current.section}. ${current.headingTail}`
      : `ARTÍCULO ${current.section}`;

    const content = rawContent
      .replace(/\n{2,}/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .trim();

    const provisionRef = buildProvisionRef(current.section);
    const chapter = nearestChapter(chapters, current.start);

    provisions.push({
      provision_ref: provisionRef,
      chapter,
      section: current.section,
      title,
      content,
    });
  }

  // Deduplicate by provision_ref, keeping the longest content.
  const deduped = new Map<string, ParsedProvision>();
  for (const p of provisions) {
    const existing = deduped.get(p.provision_ref);
    if (!existing || p.content.length > existing.content.length) {
      deduped.set(p.provision_ref, p);
    }
  }

  return Array.from(deduped.values());
}

function extractDefinitions(provisions: ParsedProvision[]): ParsedDefinition[] {
  const definitions: ParsedDefinition[] = [];

  for (const provision of provisions) {
    const text = provision.content;
    const titleLower = provision.title.toLowerCase();
    const contentLower = text.toLowerCase();

    const isDefinitionsArticle = titleLower.includes('definici')
      || contentLower.includes('se define')
      || contentLower.includes('se entender')
      || contentLower.includes('para los efectos de');

    if (!isDefinitionsArticle) continue;

    const normalized = text.replace(/\n/g, ' ');

    // Pattern: a) Term: definition ... b) Term: definition ...
    const letterPattern = /\b([a-z])\)\s*([^:;]{2,120}):\s*([\s\S]*?)(?=\b[a-z]\)\s*[^:;]{2,120}:|$)/gi;
    let m: RegExpExecArray | null;
    while ((m = letterPattern.exec(normalized)) !== null) {
      const term = normalizeWhitespace(m[2]);
      const definition = normalizeWhitespace(m[3]).replace(/[.;:]$/, '').trim();

      if (term.length < 2 || term.length > 160) continue;
      if (definition.length < 8) continue;

      definitions.push({
        term,
        definition,
        source_provision: provision.provision_ref,
      });
    }
  }

  const unique = new Map<string, ParsedDefinition>();
  for (const d of definitions) {
    const key = `${d.source_provision}:${d.term.toLowerCase()}`;
    if (!unique.has(key)) unique.set(key, d);
  }
  return Array.from(unique.values());
}

export function parseScijLaw(law: TargetLaw, fichaHtml: string, textoHtml: string): ParsedSeedDocument {
  const metadata = parseMetadataFromFicha(fichaHtml);
  const provisions = parseProvisionsFromText(textoHtml);
  const definitions = extractDefinitions(provisions);

  const normShort = metadata.normNumber
    ? `${metadata.normType} ${metadata.normNumber}`.trim()
    : law.shortName;

  return {
    id: law.id,
    type: 'statute',
    title: metadata.title || law.shortName,
    title_en: law.titleEn,
    short_name: normShort,
    status: 'in_force',
    issued_date: metadata.issuedDate,
    in_force_date: metadata.inForceDate,
    url: `https://pgrweb.go.cr/scij/Busqueda/Normativa/Normas/nrm_texto_completo.aspx?nValor1=1&nValor2=${law.nValor2}`,
    description: law.description,
    provisions,
    definitions,
  };
}

export function seedFileFromLaw(law: TargetLaw): string {
  return law.seedFile;
}

export function lawUrlPair(nValor2: number): { fichaUrl: string; textUrl: string } {
  return {
    fichaUrl: `https://pgrweb.go.cr/scij/Busqueda/Normativa/Normas/nrm_norma.aspx?param1=NRM&nValor1=1&nValor2=${nValor2}&nValor3=0&strTipM=FN`,
    textUrl: `https://pgrweb.go.cr/scij/Busqueda/Normativa/Normas/nrm_texto_completo.aspx?nValor1=1&nValor2=${nValor2}`,
  };
}

export function defaultLawIdFromTitle(title: string): string {
  return asciiSlug(title).slice(0, 80);
}
