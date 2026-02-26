# Costa Rican Law MCP Server

**The SCIJ alternative for the AI age.**

[![npm version](https://badge.fury.io/js/@ansvar%2Fcosta-rican-law-mcp.svg)](https://www.npmjs.com/package/@ansvar/costa-rican-law-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![GitHub stars](https://img.shields.io/github/stars/Ansvar-Systems/Costa-Rican-law-mcp?style=social)](https://github.com/Ansvar-Systems/Costa-Rican-law-mcp)
[![CI](https://github.com/Ansvar-Systems/Costa-Rican-law-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ansvar-Systems/Costa-Rican-law-mcp/actions/workflows/ci.yml)
[![Provisions](https://img.shields.io/badge/provisions-75%2C042-blue)]()

Query **12,077 Costa Rican laws** -- from the Penal Code and Data Protection Law to the Telecommunications Law, Digital Signatures Act, and more -- directly from Claude, Cursor, or any MCP-compatible client.

If you're building legal tech, compliance tools, or doing Costa Rican legal research, this is your verified reference database.

Built by [Ansvar Systems](https://ansvar.eu) -- Stockholm, Sweden

---

## Why This Exists

Costa Rican legal research means navigating [SCIJ](https://pgrweb.go.cr/scij/) (Sistema Costarricense de Informacion Juridica), downloading HTML pages from an ASP.NET portal, and manually cross-referencing between laws and articles. Whether you're:

- A **lawyer** validating citations in a brief or contract
- A **compliance officer** checking data protection obligations under Ley 8968
- A **legal tech developer** building tools on Costa Rican law
- A **researcher** tracing legislative provisions across 12,077 laws

...you shouldn't need dozens of browser tabs and manual cross-referencing. Ask Claude. Get the exact provision. With context.

This MCP server makes Costa Rican law **searchable, cross-referenceable, and AI-readable**.

---

## Quick Start

### Use Remotely (No Install Needed)

> Connect directly to the hosted version -- zero dependencies, nothing to install.

**Endpoint:** `https://costa-rican-law-mcp.vercel.app/mcp`

| Client | How to Connect |
|--------|---------------|
| **Claude.ai** | Settings > Connectors > Add Integration > paste URL |
| **Claude Code** | `claude mcp add costa-rican-law --transport http https://costa-rican-law-mcp.vercel.app/mcp` |
| **Claude Desktop** | Add to config (see below) |
| **GitHub Copilot** | Add to VS Code settings (see below) |

**Claude Desktop** -- add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "costa-rican-law": {
      "type": "url",
      "url": "https://costa-rican-law-mcp.vercel.app/mcp"
    }
  }
}
```

**GitHub Copilot** -- add to VS Code `settings.json`:

```json
{
  "github.copilot.chat.mcp.servers": {
    "costa-rican-law": {
      "type": "http",
      "url": "https://costa-rican-law-mcp.vercel.app/mcp"
    }
  }
}
```

### Use Locally (npm)

```bash
npx @ansvar/costa-rican-law-mcp
```

**Claude Desktop** -- add to `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "costa-rican-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/costa-rican-law-mcp"]
    }
  }
}
```

**Cursor / VS Code:**

```json
{
  "mcp.servers": {
    "costa-rican-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/costa-rican-law-mcp"]
    }
  }
}
```

---

## Example Queries

Once connected, just ask naturally:

- *"What does Ley 8968 say about data protection consent?"*
- *"Find provisions about delitos informaticos in Costa Rican law"*
- *"Is the Telecommunications Law (Ley 8642) still in force?"*
- *"What does Article 196 bis of the Penal Code say about computer crimes?"*
- *"Search for firma digital requirements across Costa Rican statutes"*
- *"Validate the citation 'Articulo 5 Ley 8968'"*
- *"Build a legal stance on personal data protection in Costa Rica"*

---

## What's Included

| Category | Count | Details |
|----------|-------|---------|
| **Laws** | 12,077 statutes | Census-first from SCIJ (18,761 discovered) |
| **Provisions** | 75,042 articles | Full-text searchable with FTS5 |
| **Legal Definitions** | 809 definitions | Extracted from definition articles |
| **Database Size** | ~147 MB | Optimized SQLite, portable |
| **Weekly Freshness Checks** | Automated | Drift detection against SCIJ |

### Key Laws

| Law | Description | Provisions |
|-----|-------------|-----------|
| Ley 8968 | Data Protection Law | Personal data, consent, data subject rights |
| Ley 9048 | Computer Crime Reform | Cybercrime provisions in the Penal Code |
| Ley 8642 | General Telecommunications Law | Telecom regulation and oversight |
| Ley 8454 | Digital Signatures and Certificates | Electronic documents and PKI |
| Ley 4573 | Penal Code | Criminal law including cyber offenses |
| Ley 8220 | Administrative Simplification | Anti-red-tape obligations |
| Ley 10500 | Communications Interception Modernization | Judicial authorization rules |

**Verified data only** -- every provision is ingested from official SCIJ sources (Procuraduria General de la Republica). Zero LLM-generated content.

---

## Why This Works

**Verbatim Source Text (No LLM Processing):**
- All statute text is ingested from [SCIJ](https://pgrweb.go.cr/scij/) (Procuraduria General de la Republica)
- Provisions are returned **unchanged** from SQLite FTS5 database rows
- Zero LLM summarization or paraphrasing -- the database contains statute text, not AI interpretations

**Smart Context Management:**
- Search returns ranked provisions with BM25 scoring (safe for context)
- Provision retrieval gives exact text by law identifier + article number
- Cross-references help navigate without loading everything at once

**Technical Architecture:**
```
SCIJ HTML --> Parse --> SQLite --> FTS5 snippet() --> MCP response
               ^                        ^
        Provision parser         Verbatim database query
```

### Traditional Research vs. This MCP

| Traditional Approach | This MCP Server |
|---------------------|-----------------|
| Search SCIJ by law number | Search by plain language: *"proteccion datos personales"* |
| Navigate multi-article statutes manually | Get the exact provision with context |
| Manual cross-referencing between laws | `build_legal_stance` aggregates across sources |
| "Is this statute still in force?" --> check manually | `check_currency` tool --> answer in seconds |
| No API, no integration | MCP protocol --> AI-native |

**Traditional:** Search SCIJ --> Navigate ASP.NET portal --> Ctrl+F --> Cross-reference between laws --> Repeat

**This MCP:** *"What are the consent requirements under Ley 8968 and how do they compare to GDPR?"* --> Done.

---

## Available Tools (13)

### Core Legal Research Tools (8)

| Tool | Description |
|------|-------------|
| `search_legislation` | FTS5 full-text search across 75,042 provisions with BM25 ranking. Supports quoted phrases, boolean operators, prefix wildcards |
| `get_provision` | Retrieve specific provision by law identifier + article number (e.g., "cr-ley8968" + "1") |
| `check_currency` | Check if a statute is in force, amended, or repealed |
| `validate_citation` | Validate citation against database -- zero-hallucination check |
| `build_legal_stance` | Aggregate citations from multiple statutes for a legal topic |
| `format_citation` | Format citations per Costa Rican conventions |
| `list_sources` | List all available statutes with metadata, coverage scope, and data provenance |
| `about` | Server info, capabilities, dataset statistics, and coverage summary |

### EU/International Law Integration Tools (5)

| Tool | Description |
|------|-------------|
| `get_eu_basis` | Get EU directives/regulations that a Costa Rican statute references |
| `get_costa_rican_implementations` | Find Costa Rican laws referencing a specific EU act |
| `search_eu_implementations` | Search EU documents with Costa Rican reference counts |
| `get_provision_eu_basis` | Get EU law references for a specific provision |
| `validate_eu_compliance` | Check alignment status of Costa Rican statutes against EU directives |

---

## EU Law Integration

Costa Rica is not an EU member state, but certain Costa Rican laws share principles with EU frameworks:

- **Ley 8968** (Data Protection) shares significant overlap with GDPR principles on consent, data subject rights, and data controller obligations
- **Ley 8454** (Digital Signatures) aligns with eIDAS concepts for electronic signatures and certificates
- Costa Rica participates in multilateral frameworks that share principles with EU data protection

The EU bridge tools allow you to explore these alignment relationships -- checking which Costa Rican provisions correspond to EU requirements, and vice versa.

> **Note:** EU cross-references reflect alignment relationships, not transposition. Costa Rica adopts its own legislative approach.

---

## Data Sources & Freshness

All content is sourced from authoritative Costa Rican legal databases:

- **[SCIJ](https://pgrweb.go.cr/scij/)** -- Sistema Costarricense de Informacion Juridica, operated by the Procuraduria General de la Republica (PGR)

### Data Provenance

| Field | Value |
|-------|-------|
| **Authority** | Procuraduria General de la Republica (PGR) |
| **Retrieval method** | HTML scrape from SCIJ date-range selective search |
| **Language** | Spanish |
| **License** | Government open access |
| **Coverage** | 12,077 laws (64.6% of 18,761 discovered) |
| **Last ingested** | 2026-02-26 |

### Automated Freshness Checks (Weekly)

A [weekly GitHub Actions workflow](.github/workflows/check-freshness.yml) monitors SCIJ for changes:

| Check | Method |
|-------|--------|
| **Portal availability** | HEAD request to SCIJ |
| **Document count** | Database vs. census comparison |
| **Database age** | Build date threshold check |

---

## Security

This project uses multiple layers of automated security scanning:

| Scanner | What It Does | Schedule |
|---------|-------------|----------|
| **CodeQL** | Static analysis for security vulnerabilities | Weekly + PRs |
| **Semgrep** | SAST scanning (OWASP top 10, secrets, TypeScript) | Every push |
| **Gitleaks** | Secret detection across git history | Every push |
| **Trivy** | CVE scanning on filesystem and npm dependencies | Daily |
| **Socket.dev** | Supply chain attack detection | PRs |
| **Dependabot** | Automated dependency updates | Weekly |

See [SECURITY.md](SECURITY.md) for the full policy and vulnerability reporting.

---

## Important Disclaimers

### Legal Advice

> **THIS TOOL IS NOT LEGAL ADVICE**
>
> Statute text is sourced from official SCIJ publications. However:
> - This is a **research tool**, not a substitute for professional legal counsel
> - **Court case coverage is not included** -- do not rely solely on this for case law research
> - **Verify critical citations** against primary sources for court filings
> - **EU cross-references** reflect alignment relationships, not transposition
> - **Coverage is partial** -- 12,077 of 18,761 discovered laws are ingested (SCIJ portal intermittently unavailable for some records)

**Before using professionally, read:** [DISCLAIMER.md](DISCLAIMER.md) | [SECURITY.md](SECURITY.md)

### Client Confidentiality

Queries go through the Claude API. For privileged or confidential matters, use on-premise deployment.

---

## Development

### Setup

```bash
git clone https://github.com/Ansvar-Systems/Costa-Rican-law-mcp
cd Costa-Rican-law-mcp
npm install
npm run build
npm test
```

### Running Locally

```bash
npm run dev                                       # Start MCP server
npx @anthropic/mcp-inspector node dist/index.js   # Test with MCP Inspector
```

### Data Management

```bash
npm run census                           # Enumerate all laws from SCIJ
npm run ingest                           # Ingest curated laws from SCIJ
npm run ingest -- --full-corpus          # Full corpus ingestion
npm run ingest -- --full-corpus --resume # Resume interrupted ingestion
npm run build:db                         # Rebuild SQLite database
npm run check-updates                    # Check for source updates
npm run drift:detect                     # Run drift detection
```

### Performance

- **Search Speed:** <100ms for most FTS5 queries
- **Database Size:** ~147 MB (efficient, portable)
- **Reliability:** 64.6% ingestion success rate (SCIJ portal limitations)

---

## Related Projects: Complete Compliance Suite

This server is part of **Ansvar's Compliance Suite** -- MCP servers that work together for end-to-end compliance coverage:

### [@ansvar/eu-regulations-mcp](https://github.com/Ansvar-Systems/EU_compliance_MCP)
**Query 49 EU regulations directly from Claude** -- GDPR, AI Act, DORA, NIS2, MiFID II, eIDAS, and more. Full regulatory text with article-level search. `npx @ansvar/eu-regulations-mcp`

### [@ansvar/us-regulations-mcp](https://github.com/Ansvar-Systems/US_Compliance_MCP)
**Query US federal and state compliance laws** -- HIPAA, CCPA, SOX, GLBA, FERPA, and more. `npx @ansvar/us-regulations-mcp`

### [@ansvar/security-controls-mcp](https://github.com/Ansvar-Systems/security-controls-mcp)
**Query 261 security frameworks** -- ISO 27001, NIST CSF, SOC 2, CIS Controls, SCF, and more. `npx @ansvar/security-controls-mcp`

### [@ansvar/automotive-cybersecurity-mcp](https://github.com/Ansvar-Systems/Automotive-MCP)
**Query UNECE R155/R156 and ISO 21434** -- Automotive cybersecurity compliance. `npx @ansvar/automotive-cybersecurity-mcp`

**70+ national law MCPs** covering Australia, Brazil, Canada, China, Denmark, Finland, France, Germany, Ghana, Iceland, India, Ireland, Israel, Italy, Japan, Kenya, Netherlands, Nigeria, Norway, Singapore, Slovenia, South Korea, Sweden, Switzerland, Thailand, UAE, UK, and more.

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Priority areas:
- Remaining law ingestion (6,684 of 18,761 IDs pending SCIJ availability)
- EU cross-reference expansion
- Court case law coverage
- Historical statute versions and amendment tracking
- Decreto Ejecutivo and Reglamento coverage

---

## Roadmap

- [x] Core statute database with FTS5 search
- [x] Census-first full corpus discovery (18,761 laws)
- [x] Full corpus ingestion (12,077 laws, 75,042 provisions, 809 definitions)
- [x] EU/international law alignment tools
- [x] Vercel Streamable HTTP deployment
- [x] npm package publication
- [x] Drift detection and weekly freshness checks
- [ ] Remaining law ingestion (SCIJ portal recovery)
- [ ] Decreto Ejecutivo and Reglamento coverage
- [ ] Court case law expansion
- [ ] Historical statute versions (amendment tracking)

---

## Citation

If you use this MCP server in academic research:

```bibtex
@software{costa_rican_law_mcp_2026,
  author = {Ansvar Systems AB},
  title = {Costa Rican Law MCP Server: AI-Powered Legal Research Tool},
  year = {2026},
  url = {https://github.com/Ansvar-Systems/Costa-Rican-law-mcp},
  note = {12,077 Costa Rican laws with 75,042 provisions and 809 definitions}
}
```

---

## License

Apache License 2.0. See [LICENSE](./LICENSE) for details.

### Data Licenses

- **Legislation:** Procuraduria General de la Republica (government open access via SCIJ)
- **EU Metadata:** EUR-Lex (EU public domain)

---

## About Ansvar Systems

We build AI-accelerated compliance and legal research tools for the global market. This MCP server started as our internal reference tool -- turns out everyone building compliance tools has the same research frustrations.

So we're open-sourcing it. Navigating 12,077 laws shouldn't require a law degree.

**[ansvar.eu](https://ansvar.eu)** -- Stockholm, Sweden

---

<p align="center">
  <sub>Built with care in Stockholm, Sweden</sub>
</p>
