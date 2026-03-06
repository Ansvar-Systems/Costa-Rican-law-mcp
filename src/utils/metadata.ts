/**
 * Response metadata utilities for Costa Rican Law MCP.
 */

import type Database from '@ansvar/mcp-sqlite';

export interface ResponseMetadata {
  data_source: string;
  jurisdiction: string;
  disclaimer: string;
  freshness?: string;
  note?: string;
  query_strategy?: string;
}

export interface ToolResponse<T> {
  results: T;
  _metadata: ResponseMetadata;
}

export function generateResponseMetadata(
  db: InstanceType<typeof Database>,
): ResponseMetadata {
  let freshness: string | undefined;
  try {
    const row = db.prepare(
      "SELECT value FROM db_metadata WHERE key = 'built_at'"
    ).get() as { value: string } | undefined;
    if (row) freshness = row.value;
  } catch {
    // Ignore
  }

  return {
    data_source: 'SCIJ (pgrweb.go.cr) — Procuraduría General de la República (Costa Rica)',
    jurisdiction: 'CR',
    disclaimer:
      'This data is sourced from Costa Rica’s official legal portal (SCIJ). ' +
      'The authoritative versions are maintained by the Procuraduría General de la República. ' +
      'Always verify with the official portal: pgrweb.go.cr/scij.',
    freshness,
  };
}
