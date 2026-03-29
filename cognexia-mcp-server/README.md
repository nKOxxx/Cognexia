# Cognexia MCP Server

MCP server that gives Claude Code read-only access to [Cognexia](https://github.com/nKOxxx/Cognexia) memories — the local, SQLite-backed memory layer for AI agents.

## What it does

Claude Code can query Cognexia's memory database through four tools:

| Tool | Description |
|------|-------------|
| `search_memories` | Full-text search with filters: project, type, importance, date range, keywords |
| `get_memory` | Retrieve a single memory by UUID |
| `list_projects` | List all projects with memory counts |
| `get_memory_stats` | Statistics: total, by type, by importance, recent activity |

## Security

- **Read-only** — Claude Code cannot write, update, or delete memories
- **API key auth** — optional, set `COGNEXIA_MCP_API_KEY`
- **SQL injection safe** — parameterized queries + Zod input validation
- **Rate limiting** — 60 requests/minute per connection
- **No sensitive data in logs** — project names and counts only
- **Constant-time key comparison** — prevents timing attacks

See [SECURITY.md](./SECURITY.md) for the full security audit.

## Installation

```bash
git clone https://github.com/nKOxxx/Cognexia.git
cd Cognexia/cognexia-mcp-server
npm install
npm run build
```

## Configuration

### Claude Code MCP config

Add to your Claude Code MCP settings:

```json
{
  "mcpServers": {
    "cognexia": {
      "command": "node",
      "args": ["/path/to/cognexia-mcp-server/dist/index.js"],
      "env": {
        "COGNEXIA_DATA_PATH": "/Users/ares/.cognexia/data-lake",
        "COGNEXIA_MCP_API_KEY": "your-secret-key"
      }
    }
  }
}
```

### Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `COGNEXIA_DATA_PATH` | No | `~/.cognexia/data-lake` | Path to Cognexia data lake |
| `COGNEXIA_MCP_API_KEY` | No | (none) | API key for authentication |
| `COGNEXIA_MCP_PORT` | No | `3100` | (reserved for future HTTP mode) |

## Usage

### Start the server (development)

```bash
npm run dev
```

### Production

```bash
npm run build
node dist/index.js
```

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install && npm run build
COPY dist/ ./dist/
ENV COGNEXIA_DATA_PATH=/data/.cognexia/data-lake
ENV COGNEXIA_MCP_API_KEY=your-key
CMD ["node", "dist/index.js"]
```

## Example Claude Code sessions

```claude
// Search memories in the "ares" project about payments
/search_memories project=ares query=payment type=insight limit=10

// List all projects
/list_projects

// Get stats for the "general" project
/get_memory_stats project=general

// Retrieve a specific memory
/get_memory id=550e8400-e29b-41d4-a716-446655440000 project=ares
```

## Project structure

```
cognexia-mcp-server/
├── src/
│   └── index.ts          # MCP server (all tools, DB, auth, rate limiting)
├── package.json
├── tsconfig.json
├── README.md
└── SECURITY.md
```

## Data path

By default the server reads from `~/.cognexia/data-lake/`, which contains one SQLite database per project at `memory-<project>/bridge.db`. The server discovers projects automatically by scanning this directory.

## License

MIT
