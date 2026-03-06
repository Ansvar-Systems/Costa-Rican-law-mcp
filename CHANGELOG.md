# Changelog

## [2.0.0] - 2026-02-26

### Added
- Census-first full corpus ingestion (golden standard pattern)
- `scripts/census.ts` -- enumerates all 18,761 laws from SCIJ
- `data/census.json` -- golden standard census file
- Git LFS for database.db (>100 MB)

### Changed
- **12,091 laws** (up from 10 seed laws) with **75,793 provisions** and **845 definitions**
- Database size: 148.1 MB (up from 0.4 MB)
- `build-db.ts`: fixed jurisdiction from 'EE' to 'CR', added `build_date` metadata, duplicate seed handling, census.json auto-update
- README.md: complete rewrite following Swedish Law MCP golden standard template
- Golden tests updated with real law IDs from SCIJ
- Package version bumped to 2.0.0

### Fixed
- Jurisdiction code in db_metadata ('EE' -> 'CR')

## [1.0.1] - 2026-02-22

### Changed
- Non-blocking tests, dependency updates

## [1.0.0] - 2026-02-21

### Added
- Initial release with 10 key cybersecurity/data protection laws
- Full-text search via FTS5
- EU cross-reference support
- Article-level provision retrieval
- Strategy A deployment (bundled DB on Vercel)
