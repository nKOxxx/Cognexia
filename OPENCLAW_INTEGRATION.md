# Cognexia OpenClaw Integration Guide

**Auto-routing long-term memory for OpenClaw agents.**

## Quick Setup

### 1. Start Cognexia Server
```bash
cd /path/to/Cognexia
./start.sh start
```

### 2. Install Hook
Copy `openclaw-hook.js` to your OpenClaw hooks directory:
```bash
cp openclaw-hook.js ~/.openclaw/hooks/
```

### 3. Enable in OpenClaw Config
Add to `~/.openclaw/config.json`:
```json
{
  "hooks": {
    "messageReceived": ["cognexia-hook.js"],
    "sessionStart": ["cognexia-hook.js"]
  }
}
```

## How It Works

### Auto Project Detection
Cognexia automatically detects which project you're working on:

```
"Work on Gulf Watch"         → Project: gulfwatch
"Project AgentVault bug"     → Project: agentvault  
"2ndCTO milestone"           → Project: 2ndcto
"Remember this for general"  → Project: general
```

### Context Loading
When you switch projects, Cognexia automatically loads:
- 📋 **Recent work** (last 7 days)
- 🎯 **Key decisions/goals** (high importance)
- 💡 **User preferences** (from general memory)

### Auto-Storage
Cognexia automatically stores messages that contain:
- Decisions ("I decided to...")
- Preferences ("I prefer...")
- Goals ("The goal is...")
- Completions ("Shipped the feature")
- Issues ("Found a bug...")
- Security items ("API key...")

## Manual API Usage

### From Agent Code
```javascript
const CognexiaHook = require('./openclaw-hook.js');
const cognexia = new CognexiaHook();

// Store memory
await cognexia.store("API key updated", "security", 9, "agentvault");

// Query memories
const results = await cognexia.query("security keys", "agentvault", 5);

// Load context
const context = await cognexia.loadContext("2ndcto");
```

### HTTP API
```bash
# Store
curl -X POST http://localhost:10000/api/memory/store \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Memory text",
    "type": "insight",
    "importance": 5,
    "project": "general"
  }'

# Query
curl "http://localhost:10000/api/memory/query?q=security&project=general&limit=5"

# Health
curl http://localhost:10000/api/health
```

## Project Structure

Data is organized automatically:
```
~/.openclaw/data-lake/
├── memory-general/          ← Cross-project knowledge
│   └── User preferences, global decisions
├── memory-gulfwatch/        ← Gulf Watch v2 memories
│   └── Incidents, features, decisions
├── memory-agentvault/       ← AgentVault memories
│   └── Security, releases, roadmap
├── memory-2ndcto/           ← 2ndCTO memories
│   └── Client work, milestones
└── memory-<project>/        ← Auto-created per project
```

## Memory Types

| Type | Use For | Auto-Detected |
|------|---------|---------------|
| `security` | Credentials, keys, secrets | ✅ |
| `preference` | User likes/dislikes | ✅ |
| `goal` | Objectives, targets | ✅ |
| `milestone` | Releases, completions | ✅ |
| `decision` | Choices made | ✅ |
| `error` | Bugs, failures | ✅ |
| `insight` | General learnings | ✅ (default) |

## Testing

```bash
# Test the hook
node openclaw-hook.js

# Should output:
# Testing project detection...
# "Work on Gulf Watch": gulfwatch
# "Project AgentVault bug": agentvault
# "2ndCTO milestone": 2ndcto
```

## Troubleshooting

### "Cognexia not running"
Start the server: `./start.sh start`

### "Project not detected"
Use explicit format: "Project: Name" or "Work on Name"

### "Memories not loading"
Check health: `curl http://localhost:10000/api/health`

## Version

**Cognexia v2.3.0 Data Lake Edition**  
**OpenClaw Integration v1.0.0**

---

**Infrastructure that remembers.** 🧠
