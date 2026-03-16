# CLAUDE.md Converter for Cognexia

Bridges centminmod's [CLAUDE.md](https://github.com/centminmod/my-claude-code-setup) memory bank format with Cognexia's persistence system.

## Why This Exists

- **CLAUDE.md** = Great for Claude Code, manual file-based memory
- **Cognexiacode** = Universal, compressed, API-driven persistence
- **This converter** = Best of both worlds

## Quick Start

```bash
# Convert single CLAUDE.md to Cognexiacode
./claude-md-converter.js --to-cognexia CLAUDE.md > memories.cognexia

# Convert Cognexiacode back to CLAUDE.md
./claude-md-converter.js --to-claude memories.cognexia > CLAUDE.md

# Sync entire directories
./claude-md-converter.js --sync \
  --claude-dir ./memory-bank \
  --cognexia-dir ./cognexia-store
```

## Features

### 1. Bidirectional Conversion
- CLAUDE.md → Cognexiacode (with full metadata)
- Cognexiacode → CLAUDE.md (structured sections)

### 2. Smart Type Detection
Automatically categorizes memories:
- `error` - Bug fixes, issues
- `task` - TODOs, action items
- `decision` - Architecture choices
- `architecture` - Design patterns
- `security` - Auth, encryption
- `insight` - General knowledge

### 3. Tag Extraction
Auto-tags based on content:
- `claude`, `memory`, `critical`, `backend`, `frontend`, `security`, `performance`

### 4. Priority Scoring
Infers importance from headers:
- Critical/Urgent → Priority 9
- Important/Should → Priority 7
- TODO/Task → Priority 5
- Default → Priority 3

## Integration with Cognexia

```javascript
const { parseClaudeMd, toCognexiacode } = require('./claude-md-converter');

// Read CLAUDE.md
const claudeContent = fs.readFileSync('CLAUDE.md', 'utf8');
const memories = parseClaudeMd(claudeContent, 'CLAUDE.md');

// Convert to Cognexiacode
const cognexiaContent = toCognexiacode(memories, {
    project: 'my-project',
    sessionId: 'session_123'
});

// Store in Cognexia
fs.writeFileSync('memory.cognexia', cognexiaContent);
```

## Use Cases

### 1. Piggyback on CLAUDE.md Popularity
- Existing CLAUDE.md users can migrate to Cognexia gradually
- Cognexia users can export to CLAUDE.md for Claude Code compatibility

### 2. Hybrid Workflow
- Use CLAUDE.md for active development (Claude Code)
- Use Cognexia for long-term persistence and cross-project memory

### 3. Community Bridge
- Share memories between CLAUDE.md and Cognexia ecosystems
- Contribute to both projects without duplicating work

## Command Reference

| Flag | Description |
|------|-------------|
| `--to-cognexia <file>` | Convert CLAUDE.md to Cognexiacode |
| `--to-claude <file>` | Convert Cognexiacode to CLAUDE.md |
| `--sync` | Bidirectional directory sync |
| `--claude-dir <dir>` | Source CLAUDE.md directory |
| `--cognexia-dir <dir>` | Target Cognexia directory |
| `--project <name>` | Project identifier |
| `--bidirectional` | Enable two-way sync |

## Example Output

### Input (CLAUDE.md)
```markdown
# CLAUDE.md

## Critical Security Fix
Never store API keys in plain text.

## Architecture Decision
We chose PostgreSQL over MongoDB for ACID compliance.
```

### Output (Cognexiacode)
```
## COGNEXIACODE v1.1
## Source: CLAUDE.md Converter v1.0.0
...

◊COGNEXIA◊
ID:mm_1234567890_abc123
TYPE:security
SRC:CLAUDE.md
TITLE:Critical Security Fix
TAGS:security,critical
PRIORITY:9
CREATED:2026-03-15T18:30:00.000Z
◊BEGIN◊
Never store API keys in plain text.
◊END◊
```

## Future Enhancements

- [ ] Live sync (watch mode)
- [ ] Conflict resolution for bidirectional sync
- [ ] CLAUDE.md template generation
- [ ] Migration tool for existing CLAUDE.md users

---

**Version:** 1.0.0  
**License:** MIT (same as Cognexia)
