/**
 * Golden contract tests for CostaRican Law MCP.
 * Validates core tool functionality against seed data.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import Database from 'better-sqlite3';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '../../data/database.db');

let db: InstanceType<typeof Database>;

beforeAll(() => {
  db = new Database(DB_PATH, { readonly: true });
  db.pragma('journal_mode = DELETE');
});

describe('Database integrity', () => {
  it('should have legal documents', () => {
    const row = db.prepare(
      "SELECT COUNT(*) as cnt FROM legal_documents WHERE id != 'eu-cross-references'"
    ).get() as { cnt: number };
    expect(row.cnt).toBeGreaterThan(0);
  });

  it('should have provisions', () => {
    const row = db.prepare('SELECT COUNT(*) as cnt FROM legal_provisions').get() as { cnt: number };
    expect(row.cnt).toBeGreaterThan(0);
  });

  it('should have FTS index', () => {
    const row = db.prepare(
      "SELECT COUNT(*) as cnt FROM provisions_fts WHERE provisions_fts MATCH 'data'"
    ).get() as { cnt: number };
    expect(row.cnt).toBeGreaterThanOrEqual(0);
  });
});

describe('Article retrieval', () => {
  it('should retrieve at least one substantial provision', () => {
    const row = db.prepare(
      'SELECT content FROM legal_provisions WHERE length(content) > 50 LIMIT 1'
    ).get() as { content: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.content.length).toBeGreaterThan(50);
  });
});

describe('Search', () => {
  it('should find results via FTS search', () => {
    const rows = db.prepare(
      "SELECT COUNT(*) as cnt FROM provisions_fts WHERE provisions_fts MATCH 'datos'"
    ).get() as { cnt: number };
    expect(rows.cnt).toBeGreaterThan(0);
  });
});

describe('Negative tests', () => {
  it('should return no results for fictional document', () => {
    const row = db.prepare(
      "SELECT COUNT(*) as cnt FROM legal_provisions WHERE document_id = 'fictional-law-2099'"
    ).get() as { cnt: number };
    expect(row.cnt).toBe(0);
  });

  it('should return no results for invalid section', () => {
    const sampleDoc = db.prepare('SELECT id FROM legal_documents ORDER BY id LIMIT 1').get() as { id: string };
    const row = db.prepare(
      'SELECT COUNT(*) as cnt FROM legal_provisions WHERE document_id = ? AND section = ?'
    ).get(sampleDoc.id, '999ZZZ-INVALID') as { cnt: number };
    expect(row.cnt).toBe(0);
  });
});

describe('Corpus shape', () => {
  it('should expose at least one document with a URL', () => {
    const row = db.prepare(
      "SELECT id, url FROM legal_documents WHERE url IS NOT NULL AND url != '' LIMIT 1"
    ).get() as { id: string; url: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.url.startsWith('http')).toBe(true);
  });
});

describe('list_sources', () => {
  it('should have db_metadata table', () => {
    const row = db.prepare('SELECT COUNT(*) as cnt FROM db_metadata').get() as { cnt: number };
    expect(row.cnt).toBeGreaterThan(0);
  });
});
