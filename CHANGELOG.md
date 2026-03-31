# Changelog

All notable changes to Cognexia are documented here.

---

## [1.0.0] — 2026-03-31

### Summary
First stable release. Comprehensive documentation, full test suite, code quality improvements, and release preparation.

### Added
- Comprehensive `README.md` with installation (macOS/Linux/Windows), quick start, full API reference, configuration, troubleshooting, and privacy sections
- `CHANGELOG.md` (this file)
- Full test suite (`tests/`) covering:
  - Encryption module (AES-256-GCM, blind indexing, key management)
  - Memory library (store, query, timeline, input validation)
  - Memory graph (entity extraction, link creation, path finding)
  - API server (health, store, query, CRUD, maintenance endpoints)
- Global error handler middleware in `server.js`
- Structured request logging middleware (method, path, status, latency)
- `jest.config.js` with proper test configuration and coverage settings
- Project badges: license, Node.js version, version, platform support

### Changed
- Version bumped from `2.3.0` to `1.0.0` (stable public release)
- `package.json`: updated description, added `test:coverage` and `test:watch` scripts, fixed copyright year to 2026

### Fixed
- CORS middleware now properly handles `OPTIONS` preflight requests
- Rate limiter correctly returns `Retry-After` header value in seconds

---

## [2.3.0] — 2026-01

### Summary
Data Lake Edition. Major architectural overhaul to multi-project isolated databases.

### Added
- **Data Lake architecture** — each project gets its own SQLite database at `~/.cognexia/data-lake/memory-<project>/`
- **Hybrid storage** — memories stored as both SQLite records and Markdown files simultaneously
- **Blind indexing encryption** (`crypto.js`) — AES-256-GCM with HMAC-SHA256 searchable indexes
- `/api/memory/store-encrypted` — store memories with client-side encryption
- `/api/memory/query-encrypted` — search encrypted memories via blind index
- `/api/crypto/status` and `/api/crypto/enable` endpoints
- Rate limiting (100 requests per 15 minutes per IP)
- CORS restricted to localhost origins only
- Soft deletes (`deleted_at` column — memories are marked, not destroyed)
- Auto-maintenance at 3 AM daily (cleanup + compression)

### Changed
- All databases now isolated per project (breaking change from v2.2.x single-DB model)
- Memory IDs changed to UUIDs
- Response format standardized to `{ success, data, error, code }`

---

## [2.2.0] — 2025-12

### Summary
Memory browsing, suggestions, and agent collaboration.

### Added
- **Agent Collaboration** (`agent-collaboration.js`) — register agents, share memories, activity audit log
- **Memory Templates** (`memory-templates.js`) — 8 pre-built templates (startup-founder, software-developer, investor, researcher, product-manager, learning-journal, minimal)
- `/api/templates` — list and apply memory templates
- `/api/agents` — agent registration and management
- `/api/agents/share` — share memories between agents
- `/api/memory/keywords` — keyword suggestions from recent memories
- Memory browsing UI improvements: filter by type, sort by importance/date, bulk select

---

## [2.1.0] — 2025-11

### Summary
Folder sync, Obsidian integration, and import/export.

### Added
- **Folder sync** (`/api/sync/*`) — bidirectional sync with local folders, conflict resolution (last-write-wins)
- **Import/Export** (`import-export.js`) — import from ChatGPT JSON, Claude JSON, Obsidian vaults; export to Notion CSV, plain text
- `/api/import` — multipart file upload for importing memories
- **Obsidian integration** — read/write Obsidian-compatible Markdown with YAML frontmatter
- **Electron desktop app** — native macOS, Linux, Windows app with embedded server
- Published memories — `/published` and `/p/:id` for shareable public memory pages

---

## [2.0.0] — 2025-10

### Summary
Complete rebuild. REST API server, Web UI, memory graph, multi-project support.

### Added
- **Express REST API** (`server.js`) replacing the embedded library-only approach
- **Dark-mode Web UI** (`public/index.html`) — Timeline view, Graph view, search, full CRUD
- **Memory Graph** (`memory-graph.js`) — entity extraction, force-directed graph visualization, explicit links, auto-linking, path finding
- Multi-project support via `project` field on every memory
- `/api/memory/timeline` — memories grouped by date
- `/api/memory/all` — full dump for graph rendering
- `/api/graph/*` — graph API (clusters, related, path, auto-link)
- Memory compression endpoint (`/api/compress`)
- HTTPS/reverse proxy support

### Changed
- Port changed from dynamic to fixed `10000`
- Storage path changed to `~/.cognexia/data-lake/`
- Complete UI rebuild (Obsidian-style sidebar)

---

## [1.0.1] — 2025-09

### Security
- Input validation on all store/query inputs
- Path traversal protection for SQLite database path
- CLI input sanitization (strip ANSI escape codes and control characters)
- HTML sanitization helper (`Cognexia.sanitizeHTML`)

---

## [1.0.0] — 2025-08

### Summary
Initial public release as a standalone memory library.

### Added
- `Cognexia` class (`index.js`) — SQLite and Supabase backends
- `store()`, `query()`, `timeline()` core methods
- NLP keyword extraction via `compromise`
- Automatic importance scoring by memory type
- CLI tool (`cli.js`) — `init`, `store`, `query`, `timeline` commands
- `start.sh` launcher script
- MIT License
