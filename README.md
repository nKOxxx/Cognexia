# Cognexia

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/nKOxxx/Cognexia/blob/main/LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org)
[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/nKOxxx/Cognexia/releases)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey.svg)](https://github.com/nKOxxx/Cognexia)

**The missing memory layer for AI agents.** Persistent, searchable, project-isolated memory that survives across sessions — stored 100% locally with optional encryption.

---

## Why Cognexia

Every AI conversation starts from scratch. Context windows fill up. Previous work disappears.

Cognexia gives your AI agents a persistent memory layer backed by SQLite + Markdown, organized per project, with a REST API, a dark-mode browser UI, and a briefing system that keeps agents fully context-aware across sessions.

| Without Cognexia | With Cognexia |
|---|---|
| "What were we building yesterday?" | "Continuing the payment integration..." |
| Lose context after 20 messages | Search entire project history |
| Repeat requirements every session | Agent remembers your preferences |
| Everything mixed together | Each project has isolated memory |
| Memory lost when session ends | 90-day persistent storage with cleanup |

---

## Features

- **37 REST API endpoints** — store, query, graph, sync, encrypt, and manage memories
- **Project isolation** — each project gets its own database, completely sandboxed
- **Memory graph** — visualize how memories connect, with auto-linking by shared entities
- **Hybrid storage** — SQLite for fast search + Markdown files for portability
- **Optional encryption** — AES-256-GCM with blind indexing (search without decrypting)
- **Obsidian integration** — import/export to/from Obsidian vaults
- **Folder sync** — bidirectional sync with any local folder
- **Agent collaboration** — share memories between multiple AI agents
- **Templates** — pre-built memory structures for developers, founders, researchers, and more
- **Electron desktop app** — native macOS/Linux/Windows app with embedded server
- **100% local** — no cloud, no telemetry, no network calls

---

## Quick Start

### Option A: Server (headless)

```bash
git clone https://github.com/nKOxxx/Cognexia.git
cd Cognexia
npm install
./start.sh start
```

Open **http://localhost:10000** in your browser.

### Option B: Desktop App

```bash
git clone https://github.com/nKOxxx/Cognexia.git
cd Cognexia
npm install
npm run start:electron
```

### Option C: npm package (library/CLI)

```bash
npm install cognexia
cognexia init
cognexia store "User prefers dark mode" --type=preference --importance=8
cognexia query "user preferences"
```

---

## Installation

### Requirements

- **Node.js** 16.0.0 or higher ([download](https://nodejs.org))
- **npm** 7+ (included with Node.js)
- **macOS**, **Linux**, or **Windows** (WSL recommended on Windows for `start.sh`)

### Step-by-step

```bash
# 1. Clone the repository
git clone https://github.com/nKOxxx/Cognexia.git
cd Cognexia

# 2. Install dependencies
npm install

# 3. Start the server
./start.sh start

# 4. Verify it's running
curl http://localhost:10000/api/health
```

**Expected output:**
```json
{
  "success": true,
  "data": {
    "status": "running",
    "version": "1.0.0",
    "projects": []
  }
}
```

### Windows (without WSL)

```powershell
# Using the PowerShell launcher (recommended)
.\start.ps1 start
.\start.ps1 stop
.\start.ps1 status

# If script execution is blocked, run once to allow it:
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Or run directly with npm:

```bash
npm start
```

---

## Server Management

```bash
# macOS / Linux
./start.sh start    # Start server (background, port 10000)
./start.sh stop     # Stop server
./start.sh status   # Check if running

# Windows (PowerShell)
.\start.ps1 start
.\start.ps1 stop
.\start.ps1 status
```

**Custom port:**
```bash
PORT=8080 ./start.sh start
```

**Custom data directory:**
```bash
DATA_LAKE_PATH=/Volumes/External/memory ./start.sh start
```

**Logs:**
```bash
tail -f /tmp/cognexia.log
```

---

## UI Overview

Open **http://localhost:10000** to access the memory browser:

- **Projects sidebar** — isolated memory spaces per project, with memory counts. Click `+` to create a new project.
- **Timeline view** — all memories in a card grid, sortable by date, type, or importance. Filter by memory type using the dropdown.
- **Graph view** — visual force-directed map of memories, connected by type. Drag to pan, scroll to zoom.
- **Search** — full-text search across the current project with 300ms debounce.
- **Add / Edit / Delete** — full memory management with type, importance (1–10), and project assignment.
- **Memory types** — `insight`, `goal`, `milestone`, `preference`, `error`, `security`, `decision`, `conversation`

---

## API Reference

### Health & Status

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Server status + project list |
| GET | `/api/projects` | All memory projects |

### Memory Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/memory/store` | Store a new memory |
| POST | `/api/memory/store-encrypted` | Store with AES-256-GCM encryption |
| GET | `/api/memory/query` | Search in a project (`?q=term&project=name`) |
| GET | `/api/memory/query-all` | Search across all projects |
| GET | `/api/memory/recent` | Browse recent memories without searching |
| GET | `/api/memory/timeline` | Memories grouped by date |
| GET | `/api/memory/all` | All memories (used by graph view) |
| GET | `/api/memory/types` | Memory types used in a project |
| GET | `/api/memory/keywords` | Keyword suggestions from recent memories |
| GET | `/api/memory/:id` | Get a single memory |
| PATCH | `/api/memory/:id` | Update memory fields |
| DELETE | `/api/memory/:id` | Soft-delete a memory |
| POST | `/api/memory/bulk-delete` | Delete multiple memories |
| POST | `/api/memory/merge` | Merge two memories into one |

### Memory Graph

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/graph` | Graph data for visualization |
| GET | `/api/graph/clusters` | Memory clusters by shared entities |
| GET | `/api/graph/related/:id` | Find memories related to a given memory |
| POST | `/api/graph/link` | Create an explicit link between memories |
| GET | `/api/graph/path` | Find connection path between two memories |
| POST | `/api/graph/auto-link` | Auto-build relationships from content |
| GET | `/api/graph/stats` | Graph statistics |

### Folder Sync

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sync/status` | Sync history and last sync time |
| POST | `/api/sync/export` | Export project to a local folder |
| POST | `/api/sync/import` | Import from a local folder |
| POST | `/api/sync/sync` | Bidirectional sync with a folder |

### Maintenance

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/cleanup` | Delete old low-importance memories |
| POST | `/api/compress` | Summarize old memories to save space |
| POST | `/api/maintenance` | Full maintenance across all projects |

### Import / Export

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/import` | Import from ChatGPT, Claude, or Cognexia JSON |

### Memory Object

```json
{
  "content": "The payment service uses Stripe webhooks for real-time updates",
  "type": "insight",
  "importance": 8,
  "project": "my-project",
  "agentId": "claude-agent"
}
```

**Fields:**
- `content` — The memory text (required, max 10,000 chars)
- `type` — `insight` | `goal` | `milestone` | `preference` | `error` | `security` | `decision` | `conversation`
- `importance` — 1–10 (default: auto-calculated). Higher values survive cleanup longer.
- `project` — Project name (default: `general`). Created automatically on first use.
- `agentId` — Identifier for the agent storing this memory (default: `default`)

### Example API Usage

```bash
# Store a memory
curl -X POST http://localhost:10000/api/memory/store \
  -H "Content-Type: application/json" \
  -d '{"content":"User prefers concise responses","type":"preference","importance":9,"project":"my-project"}'

# Query memories
curl "http://localhost:10000/api/memory/query?q=user+preferences&project=my-project&limit=5"

# Get timeline
curl "http://localhost:10000/api/memory/timeline?project=my-project&days=7"

# Search all projects
curl "http://localhost:10000/api/memory/query-all?q=payment+integration"
```

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `10000` | Server port |
| `DATA_LAKE_PATH` | `~/.cognexia/data-lake` | Root directory for all data |
| `COGNEXIA_ENCRYPT` | `0` | Set to `1` to enable AES-256-GCM encryption |

### Data Structure

All data is stored locally at `~/.cognexia/`:

```
~/.cognexia/
├── data-lake/
│   ├── memory-general/
│   │   ├── bridge.db          ← SQLite index
│   │   └── memories/
│   │       ├── abc123.md      ← Memory as Markdown file
│   │       └── def456.md
│   ├── memory-my-project/
│   │   ├── bridge.db
│   │   └── memories/
│   └── memory-<any>/          ← Auto-created on first use
├── briefing.md                ← Auto-generated AI briefing
├── briefing.log               ← Briefing system log
└── cognexia.key               ← Encryption key (if enabled)
```

Each memory is stored as both a SQLite record (for fast search) and a Markdown file (for portability and human readability).

### Encryption

Enable optional end-to-end encryption:

```bash
# Enable via environment variable
COGNEXIA_ENCRYPT=1 ./start.sh start

# Or enable at runtime via API
curl -X POST http://localhost:10000/api/crypto/enable

# Check encryption status
curl http://localhost:10000/api/crypto/status
```

Encryption uses **AES-256-GCM** with **blind indexing** — you can search encrypted memories without decrypting them. The key is stored at `~/.cognexia/cognexia.key` with owner-only permissions (`0o600`).

> ⚠️ **Back up your encryption key.** If you lose `~/.cognexia/cognexia.key`, your encrypted memories cannot be recovered.

---

## Briefing System

Cognexia ships with a briefing generator that produces a Markdown context file for pasting into new AI sessions. This solves the memory gap between conversations.

```bash
# Generate a briefing from current memories
node briefing.js

# Seed initial context into Cognexia
node briefing.js --seed

# Quick access alias
echo "alias briefing='cat ~/.cognexia/briefing.md'" >> ~/.zshrc && source ~/.zshrc
# Now just type: briefing
```

**Auto-generate every 30 minutes (cron):**

```bash
crontab -e
# Add this line:
*/30 * * * * node /path/to/Cognexia/briefing.js >> ~/.cognexia/briefing.log 2>&1
```

At the start of each new AI session, paste the briefing contents to instantly restore full context.

---

## Obsidian Integration

**Import from Obsidian vault:**

```bash
curl -X POST http://localhost:10000/api/import \
  -H "Content-Type: application/json" \
  -d '{"format":"obsidian","path":"/Users/you/ObsidianVault","project":"my-project"}'
```

**Export to Obsidian format:**

```bash
curl -X POST http://localhost:10000/api/sync/export \
  -H "Content-Type: application/json" \
  -d '{"project":"my-project","directory":"/Users/you/ObsidianVault/Cognexia"}'
```

Memories are exported as Markdown files with YAML frontmatter compatible with Obsidian.

---

## Folder Sync

Keep a local folder in sync with your Cognexia memories:

```bash
# Export memories to a folder
curl -X POST http://localhost:10000/api/sync/export \
  -H "Content-Type: application/json" \
  -d '{"project":"my-project","directory":"/path/to/folder"}'

# Import memories from a folder
curl -X POST http://localhost:10000/api/sync/import \
  -H "Content-Type: application/json" \
  -d '{"project":"my-project","directory":"/path/to/folder"}'

# Bidirectional sync (last-write-wins for conflicts)
curl -X POST http://localhost:10000/api/sync/sync \
  -H "Content-Type: application/json" \
  -d '{"project":"my-project","directory":"/path/to/folder","direction":"bidirectional"}'
```

---

## Memory Templates

Jumpstart a new project with pre-built memory structures:

```bash
# List available templates
curl http://localhost:10000/api/templates

# Available: software-developer, startup-founder, investor,
#            researcher, product-manager, learning-journal, minimal

# Apply a template to a project
curl -X POST http://localhost:10000/api/templates/apply \
  -H "Content-Type: application/json" \
  -d '{"templateId":"software-developer","project":"my-project"}'
```

---

## Maintenance

Auto-maintenance runs daily at **3 AM** and deletes memories older than 90 days with importance ≤ 3.

**Manual maintenance:**

```bash
# Delete memories older than 90 days with importance ≤ 3
curl -X POST http://localhost:10000/api/cleanup \
  -H "Content-Type: application/json" \
  -d '{"project":"my-project","days":90,"maxImportance":3}'

# Compress old memories (truncate to 200 chars)
curl -X POST http://localhost:10000/api/compress \
  -H "Content-Type: application/json" \
  -d '{"project":"my-project","days":30}'

# Full maintenance across all projects
curl -X POST http://localhost:10000/api/maintenance
```

---

## Desktop App (Electron)

Build and run as a native desktop application:

```bash
# Run in development
npm run start:electron

# Build for current platform
npm run build:electron

# Build for specific platforms
npm run build:electron:mac     # .dmg
npm run build:electron:linux   # .AppImage
npm run build:electron:win     # .exe installer
```

Built apps are output to the `dist/` folder.

**Keyboard shortcuts in the desktop app:**
- `Ctrl+Shift+I` / `Cmd+Shift+I` — Toggle Developer Tools
- `Ctrl+R` / `Cmd+R` — Reload
- `Ctrl+Q` / `Cmd+Q` — Quit

---

## Troubleshooting

### Server won't start

```bash
# Check for port conflicts
lsof -i :10000

# Kill existing process
./start.sh stop

# Check logs
cat /tmp/cognexia.log
```

### `npm install` fails

```bash
# Electron native module rebuild
npm install --ignore-scripts
npm run postinstall

# Or skip Electron for server-only use
npm install --omit=dev
```

### Database errors

```bash
# Check data directory permissions
ls -la ~/.cognexia/data-lake/

# Fix permissions
chmod -R 700 ~/.cognexia/
```

### Search returns no results

- Results are scoped to the last **30 days** by default. Add `&days=365` to extend the range.
- Search only looks at the **current project**. Use `/api/memory/query-all` to search all projects.
- Minimum word length for keyword extraction is **4 characters**.

### Encryption key missing

If you see `Error: encryption key not found`, your key file was deleted or moved.

```bash
# Check if key exists
ls -la ~/.cognexia/cognexia.key

# Generate a new key (WARNING: previously encrypted memories will be unreadable)
curl -X POST http://localhost:10000/api/crypto/enable
```

### Electron app shows blank screen

The Electron app spawns the Node.js server on startup. If the screen is blank:

1. Wait up to 10 seconds for the server to initialize
2. Press `Ctrl+R` to reload
3. Check `Ctrl+Shift+I` → Console for errors

### Rate limiting (429 errors)

Cognexia limits to **100 requests per 15 minutes** per IP. This is intentional for security. If you're hitting this in development, space out your requests or run integration tests with delays.

---

## Privacy & Security

- **100% local** — no network calls, no cloud sync, no telemetry
- **CORS restricted** — only `localhost` origins are accepted
- **Rate limited** — 100 requests per 15 minutes per IP
- **Soft deletes** — deleted memories are marked, not destroyed, until cleanup runs
- **Encryption** — optional AES-256-GCM with blind indexing
- **Input validation** — all inputs are validated and sanitized
- Data lives in `~/.cognexia/` — back it up however you prefer

---

## Contributing

Issues and pull requests are welcome at [github.com/nKOxxx/Cognexia](https://github.com/nKOxxx/Cognexia).

---

## License

[MIT](https://github.com/nKOxxx/Cognexia/blob/main/LICENSE) — Copyright © 2026 Ares
