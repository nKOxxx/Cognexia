# Mnemo 🧠 — The Missing Memory Layer for AI Agents

**Why do AI agents forget everything?** Every conversation starts from scratch. Context windows fill up. Previous work disappears. Multi-day projects become impossible.

**Mnemo solves this.** It's long-term memory for AI agents — permanent, searchable, project-based memory that persists across sessions.

> *"Finally, agents that remember what we talked about yesterday."*

---

## ⚠️ Production Notice

**Mnemo is designed for LOCAL-ONLY, PERSONAL USE:**
- ✅ Your data never leaves your machine
- ⚠️ No cloud backup — you must backup `~/.openclaw/data-lake/` yourself  
- ⚠️ Encryption keys stored locally — protect your machine
- ⚠️ Not for enterprise multi-user deployments (single-user only)

---

## The Problem We Solve

| Without Mnemo | With Mnemo |
|---------------|------------|
| ❌ "What were we building yesterday?" | ✅ "Continuing the payment integration..." |
| ❌ Lose context after 20 messages | ✅ Search entire project history |
| ❌ Repeat requirements every session | ✅ Agent remembers your preferences |
| ❌ No project isolation | ✅ Each project has isolated memory |
| ❌ Everything mixed together | ✅ Cross-project search when needed |

```
Data Lake: ~/.openclaw/data-lake/
├── memory-general/      ← Cross-project knowledge
├── memory-project1/     ← Project 1 memories
├── memory-project2/     ← Project 2 memories
└── memory-<project>/    ← Auto-created per project
```

---

## The Problem

| Without Mnemo | With Mnemo |
|----------------------|-------------------|
| ❌ Forget everything when session ends | ✅ Memories persist forever |
| ❌ Lose context after 20 messages | ✅ Search entire history instantly |
| ❌ Repeat conversations every time | ✅ Agent remembers preferences |
| ❌ No continuity between sessions | ✅ Seamless session resume |
| ❌ All projects mixed together | ✅ Isolated project memories |

---

## Quick Start (2 minutes)

### 1. Start the Server

```bash
cd /path/to/Mnemo
./start.sh start

# ✅ Mnemo running on http://localhost:10000
```

### 2. Store & Query

```bash
# Store to general memory
curl -X POST http://localhost:10000/api/memory/store \
  -H "Content-Type: application/json" \
  -d '{
    "content": "User prefers bullet points over long messages",
    "type": "preference",
    "importance": 9,
    "project": "general"
  }'

# Store to project memory
curl -X POST http://localhost:10000/api/memory/store \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Project Alpha v1.0 released successfully",
    "type": "milestone",
    "importance": 10,
    "project": "project1"
  }'

# Query project memory
curl "http://localhost:10000/api/memory/query?q=release&project=project1"

# Search all projects
curl "http://localhost:10000/api/memory/query-all?q=release"
```

### 3. Open Web UI

```bash
open http://localhost:10000
```

**Web UI Features:**
- 📊 **Stats Dashboard** — Total memories, projects, data size
- 🔍 **Search** — Query across projects with relevance ranking
- 📅 **Timeline View** — Browse memories by date
- 🎨 **Dark Theme** — Easy on the eyes
- 📈 **Importance Visualization** — Visual importance indicators

---

## Architecture

### Data Lake Structure

```
~/.openclaw/data-lake/
├── memory-general/bridge.db       ← Cross-project knowledge
├── memory-myproject/bridge.db     ← Your project memories
├── memory-work/bridge.db          ← Work-related memories
└── memory-<any>/bridge.db         ← Auto-created on first use
```

**Each project gets its own SQLite database.**
- Isolated: Projects can't see each other's memories
- Scalable: Add projects without affecting others
- Efficient: Query only relevant project data

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | **Web UI** — Memory Browser |
| `GET /api/health` | Status + list projects |
| `GET /api/projects` | All memory projects |
| `POST /api/memory/store` | Store a memory |
| `GET /api/memory/query` | Query single project |
| `GET /api/memory/query-all` | Search all projects |
| `GET /api/memory/timeline` | Memory timeline |
| `POST /api/cleanup` | Delete old low-importance memories |
| `POST /api/compress` | Compress old memories |
| `POST /api/maintenance` | Run full maintenance |

---

## OpenClaw Integration

### Auto-Routing by Project

```javascript
// Mention "myproject" → routes to memory-myproject
// Mention "work" → routes to memory-work
// No project mentioned → routes to memory-general
```

### Before (No Memory)
```javascript
// Session 1
User: "Project Alpha needs payment integration"
Ares: "I'll work on that"  // But forgets

// Session 2
User: "Continue with Project Alpha"
Ares: "Which project is that?"  // Lost
```

### After (With Mnemo)
```javascript
// Session 1 - Auto-detects "Project Alpha", stores to that project
await memory.store({
  content: "Project Alpha needs payment integration",
  project: "project1"  // Auto-detected
});

// Session 2 - Query "Project Alpha" → searches project1
const context = await memory.query("Project Alpha status", { project: "project1" });
Ares: "Last time we discussed payment integration for Project Alpha"
```

---

## API Reference

### Store Memory

```bash
POST /api/memory/store
Content-Type: application/json

{
  "content": "Memory content to store",
  "type": "insight",           // insight, preference, error, goal, milestone, security
  "importance": 5,             // 1-10 scale
  "project": "general",        // Project name (auto-creates if new)
  "agentId": "ares",           // Optional: agent identifier
  "metadata": {}               // Optional: extra data
}
```

### Query Memory

```bash
GET /api/memory/query?q=search&project=general&limit=5&days=30

Parameters:
  q       - Search query (required)
  project - Project to search (default: general)
  agentId - Filter by agent (optional)
  limit   - Max results (default: 5)
  days    - Lookback window (default: 30)
```

### Query All Projects

```bash
GET /api/memory/query-all?q=release&limit=10

Searches across ALL project memories, returns aggregated results.
```

### Timeline View

```bash
GET /api/memory/timeline?project=project1&days=7

Returns memories grouped by date:
{
  "2026-02-24": [memory, memory],
  "2026-02-23": [memory]
}
```

---

## Server Management

### Control Script

```bash
./start.sh start    # Start Mnemo
./start.sh stop     # Stop server
./start.sh status   # Check if running
```

### Manual Start

```bash
# Development
node server.js

# Production
DATA_LAKE_PATH=/custom/path node server.js
PORT=8080 node server.js
```

---

## Storage Calculations

**Projections:**

| Usage | Memories/Day | Size/Year | 5-Year Total |
|-------|--------------|-----------|--------------|
| Light | 1 | 5MB | 25MB |
| Normal | 10 | 50MB | 250MB |
| Heavy | 50 | 250MB | 1.25GB |

**Bottom line:** Even heavy usage stays under 1GB for years.

---

## Features

### 🔍 Smart Search
- Keyword matching with relevance scoring
- Searches content, type, and metadata
- Ranked by importance + relevance

### 📊 Importance Ranking
```javascript
// Automatic priority
importance: 10  // Critical security issue
importance: 5   // Normal insight
importance: 2   // Minor note
```

### 🗂️ Project Isolation
- Each project = separate SQLite database
- Query one project or search all
- Auto-create projects on first use

### 🔒 Privacy First
- **100% local**: No cloud, no network calls
- **Your data**: Stays on your machine
- **No tracking**: No analytics, no telemetry

---

## 🧪 Testing Mnemo

### Quick Test (5 minutes)

```bash
# 1. Start Mnemo
cd /path/to/Mnemo
./start.sh start

# 2. Store a test memory
curl -X POST http://localhost:10000/api/memory/store \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Testing Mnemo memory storage - this should persist",
    "type": "insight",
    "importance": 8,
    "project": "test"
  }'

# 3. Query it
curl "http://localhost:10000/api/memory/query?q=testing&project=test"

# 4. Open Web UI
open http://localhost:10000
# Browse to "test" project, verify memory appears

# 5. Test encrypted storage
curl -X POST http://localhost:10000/api/memory/store-encrypted \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Secret API key: sk_test_12345",
    "type": "security",
    "importance": 10,
    "project": "test"
  }'

# 6. Query encrypted memory
curl "http://localhost:10000/api/memory/query-encrypted?q=secret&project=test"

# 7. Check data in database (should be encrypted)
sqlite3 ~/.openclaw/data-lake/memory-test/bridge.db \
  "SELECT ciphertext FROM encrypted_memories LIMIT 1;"
```

### What to Verify

✅ **Basic functionality:**
- Memory stores and retrieves correctly
- Web UI shows memories in browse mode
- Keywords appear in suggestions
- Timeline view works

✅ **Encryption (if enabled):**
- Encrypted values are not human-readable in SQLite
- Query-encrypted returns decrypted content
- Blind indexes work for searching

✅ **Maintenance:**
```bash
# Run cleanup manually
curl -X POST http://localhost:10000/api/cleanup \
  -H "Content-Type: application/json" \
  -d '{"project": "test", "days": 1, "maxImportance": 1}'

# Run full maintenance
curl -X POST http://localhost:10000/api/maintenance
```

---

## Maintenance & Cleanup

Mnemo includes automatic maintenance to keep your data lake healthy.

### Auto-Maintenance (Daily at 3 AM)
```bash
# Runs automatically — no action needed
# - Cleans up old low-importance memories
# - Compresses old long memories
```

### Manual Cleanup
```bash
# Delete memories older than 90 days with importance ≤ 3
curl -X POST http://localhost:10000/api/cleanup \
  -H "Content-Type: application/json" \
  -d '{
    "project": "general",
    "days": 90,
    "maxImportance": 3
  }'

# Cleanup all projects
curl -X POST http://localhost:10000/api/maintenance
```

### Memory Compression
```bash
# Compress memories older than 30 days
curl -X POST http://localhost:10000/api/compress \
  -H "Content-Type: application/json" \
  -d '{
    "project": "general",
    "days": 30
  }'
```

**What compression does:**
- Truncates memories longer than 200 characters
- Adds `compressed: true` to metadata
- Preserves original length in metadata
- Keeps all other fields intact

---

## Deployment Options

### Option 1: Local (Recommended)
```bash
# Your Mac Mini
./start.sh start
# → http://localhost:10000
```
- ✅ Zero config
- ✅ 100% private
- ✅ Works offline
- ✅ Free forever

### Option 2: Custom Data Path
```bash
DATA_LAKE_PATH=/Volumes/External/memory ./start.sh start
```

---

## Comparison

| Feature | Mnemo | Vector DB | File Storage |
|---------|--------------|-----------|--------------|
| Setup | 2 min | 30+ min | 5 min |
| Cost | Free | $70+/mo | Free |
| Search | Smart keywords | Semantic | None |
| Projects | ✅ Isolated | ❌ Shared | ❌ None |
| Local | ✅ Always | ❌ Cloud | ✅ Yes |
| Privacy | ✅ 100% | ⚠️ Cloud | ✅ Yes |

---

## Installation

```bash
# Clone repo
git clone https://github.com/nKOxxx/Mnemo.git
cd Mnemo

# Install dependencies
npm install

# Start server
./start.sh start
```

**Requirements:** Node.js 16+, macOS/Linux

---

## Version History

- **v2.1.0** (Feb 24, 2026) — Web UI & Maintenance
  - Web UI at `/` — Memory Browser with dark theme
  - Auto-cleanup — Deletes old low-importance memories daily
  - Memory compression — Summarizes old long memories
  - Maintenance API — `/api/cleanup`, `/api/compress`, `/api/maintenance`
  - Daily auto-maintenance at 3 AM

- **v2.0.0** (Feb 24, 2026) — Data Lake Edition
  - Multi-project memory isolation
  - Data Lake architecture (~/.openclaw/data-lake/)
  - Auto-create projects on first use
  - Local-first: all data on your machine
  - New API: /api/memory/query-all for cross-project search

- **v1.0.1** — Initial release
  - Single SQLite database
  - Supabase cloud option
  - Basic store/query API

---

## License

MIT - Use it, fork it, build on it.

---

## ⭐ Star & Contribute

**Star the repo:** [github.com/nKOxxx/Mnemo](https://github.com/nKOxxx/Mnemo) — helps others find it

**Open an issue:** Share your use case, report bugs, request features

**Submit a PR:** Code, docs, tests — all contributions welcome

---

## 👥 Contributors

Built by agents, for agents.

| Contributor | Role | Contribution |
|-------------|------|--------------|
| **@ares_agent** | Core Developer | Architecture, SQLite optimization, query engine |
| *You?* | — | [Open an issue](https://github.com/nKOxxx/Mnemo/issues) to get started |

**Want to contribute?**
1. Fork the repo
2. Create a branch: `git checkout -b feature/amazing-feature`
3. Commit your changes
4. Open a Pull Request

---

**Built for the agent economy. Infrastructure that remembers.** 🧠
**Data Lake Edition — Your memories, your machine, your control.**