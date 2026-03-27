# Cognexia

[![npm version](https://img.shields.io/npm/v/cognexia.svg)](https://www.npmjs.com/package/cognexia)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/nKOxxx/Cognexia/blob/main/LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org)

Long-term memory for AI agents. Persistent, searchable, project-isolated memory that survives across sessions — stored 100% locally.

---

## Why

Every AI conversation starts from scratch. Context windows fill up. Previous work disappears.

Cognexia gives agents a persistent memory layer backed by SQLite, organized per project, with a REST API, a clean dark UI, and a briefing system that keeps your AI partners fully context-aware across sessions.

| Without Cognexia | With Cognexia |
| --- | --- |
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

## Briefing System

Cognexia ships with a briefing generator that automatically produces a markdown context file for pasting into new AI sessions. This solves the memory gap between conversations.

### Setup

```bash
# Seed your AI agent's context into Cognexia
node briefing.js --seed

# Generate a briefing file
node briefing.js
# → ~/.cognexia/briefing.md
```

### Schedule automatic updates (every 30 min)

```bash
crontab -e
# Add:
# */30 * * * * node /path/to/Cognexia/briefing.js >> ~/.cognexia/briefing.log 2>&1
```

### Quick access shortcut

```bash
echo "alias briefing='cat ~/.cognexia/briefing.md'" >> ~/.zshrc && source ~/.zshrc
# Now just type: briefing
```

At the start of each new session, paste the briefing file contents to instantly restore full context.

---

## UI

Open `http://localhost:10000` for the memory browser:

- **Projects sidebar** — isolated memory spaces per project, with memory counts
- **Timeline view** — all memories in a card grid, filterable by type and importance
- **Graph view** — visual map of memories, connected by type, zoomable and pannable
- **Search** — full-text search across the current project
- **Add / Edit / Delete** — full memory management with type, importance, and project assignment

---

## API Reference

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/health` | GET | Status + project list |
| `/api/projects` | GET | All memory projects |
| `/api/memory/store` | POST | Store a memory |
| `/api/memory/query` | GET | Query single project (`?q=term&project=name`) |
| `/api/memory/query-all` | GET | Search all projects |
| `/api/memory/timeline` | GET | Memories grouped by date |
| `/api/cleanup` | POST | Delete old low-importance memories |
| `/api/compress` | POST | Compress old memories |
| `/api/maintenance` | POST | Run full maintenance |

### Memory object

```json
{
  "content": "Memory content",
  "type": "insight | goal | milestone | preference | error | security",
  "importance": 7,
  "project": "general",
  "agentId": "my-agent"
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

## Data Structure

```
~/.cognexia/
├── data-lake/
│   ├── memory-general/bridge.db     ← Cross-project knowledge
│   ├── memory-my-project/bridge.db  ← Project-specific memory
│   └── memory-<any>/bridge.db       ← Auto-created on first use
├── briefing.md                      ← Auto-generated briefing file
├── briefing.log                     ← Briefing system log
└── cognexia.key                     ← Encryption key (if enabled)
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
- Data stored in `~/.cognexia/data-lake/` — back it up yourself
- Encryption keys stored locally at `~/.cognexia/cognexia.key`

---

## License

[MIT](https://github.com/nKOxxx/Cognexia/blob/main/LICENSE)
