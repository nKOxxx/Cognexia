# Cognexia

[![npm version](https://img.shields.io/npm/v/cognexia.svg)](https://www.npmjs.com/package/cognexia)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org)

Long-term memory for AI agents. Persistent, searchable, project-isolated memory that survives across sessions — stored 100% locally.

---

## Why

Every AI conversation starts from scratch. Context windows fill up. Previous work disappears.

Cognexia gives agents a persistent memory layer backed by SQLite, organized per project, with a REST API and web UI.

| Without Cognexia | With Cognexia |
|---|---|
| "What were we building yesterday?" | "Continuing the payment integration..." |
| Lose context after 20 messages | Search entire project history |
| Repeat requirements every session | Agent remembers your preferences |
| Everything mixed together | Each project has isolated memory |

---

## Quick Start

```bash
git clone https://github.com/nKOxxx/Cognexia.git
cd Cognexia
npm install
./start.sh start
# → http://localhost:10000
```

**Requirements:** Node.js 16+, macOS/Linux

---

## Usage

### Store a memory

```bash
curl -X POST http://localhost:10000/api/memory/store \
  -H "Content-Type: application/json" \
  -d '{
    "content": "User prefers bullet points over long messages",
    "type": "preference",
    "importance": 9,
    "project": "general"
  }'
```

### Query memories

```bash
# Single project
curl "http://localhost:10000/api/memory/query?q=payment&project=project1"

# All projects
curl "http://localhost:10000/api/memory/query-all?q=payment"
```

### Web UI

Open `http://localhost:10000` — stats dashboard, search, timeline view, dark theme.

---

## Data Lake Structure

```
~/.openclaw/data-lake/
├── memory-general/bridge.db     ← Cross-project knowledge
├── memory-myproject/bridge.db   ← Your project memories
└── memory-<any>/bridge.db       ← Auto-created on first use
```

Each project gets its own SQLite database. Projects are isolated by default; cross-project search available via `query-all`.

---

## API Reference

| Endpoint | Description |
|---|---|
| `GET /` | Web UI |
| `GET /api/health` | Status + project list |
| `GET /api/projects` | All memory projects |
| `POST /api/memory/store` | Store a memory |
| `GET /api/memory/query` | Query single project |
| `GET /api/memory/query-all` | Search all projects |
| `GET /api/memory/timeline` | Memories grouped by date |
| `POST /api/cleanup` | Delete old low-importance memories |
| `POST /api/compress` | Compress old memories |
| `POST /api/maintenance` | Run full maintenance |

### Memory object fields

```json
{
  "content": "Memory content",
  "type": "insight | preference | error | goal | milestone | security",
  "importance": 5,
  "project": "general",
  "agentId": "optional-agent-id",
  "metadata": {}
}
```

`importance` is 1–10. Higher values survive cleanup longer.

---

## Server Management

```bash
./start.sh start    # Start
./start.sh stop     # Stop
./start.sh status   # Check status

# Custom data path
DATA_LAKE_PATH=/Volumes/External/memory ./start.sh start
```

---

## Maintenance

Auto-maintenance runs daily at 3 AM. Manual options:

```bash
# Delete memories older than 90 days with importance ≤ 3
curl -X POST http://localhost:10000/api/cleanup \
  -d '{"project":"general","days":90,"maxImportance":3}'

# Compress memories older than 30 days
curl -X POST http://localhost:10000/api/compress \
  -d '{"project":"general","days":30}'

# Full maintenance across all projects
curl -X POST http://localhost:10000/api/maintenance
```

---

## Privacy

- **100% local** — no cloud, no network calls, no telemetry
- Data stored in `~/.openclaw/data-lake/` — back it up yourself
- Encryption keys stored locally at `~/.openclaw/cognexia.key`

---

## License

[MIT](LICENSE)
