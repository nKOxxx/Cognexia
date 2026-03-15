# CLAUDE.md Converter for Mnemo

Bridges centminmod's [CLAUDE.md](https://github.com/centminmod/my-claude-code-setup) memory bank format with Mnemo's persistence system.

## Why This Exists

- **CLAUDE.md** = Great for Claude Code, manual file-based memory
- **Mnemocode** = Universal, compressed, API-driven persistence
- **This converter** = Best of both worlds

## Quick Start

```bash
# Convert single CLAUDE.md to Mnemocode
./claude-md-converter.js --to-mnemo CLAUDE.md > memories.mnemo

# Convert Mnemocode back to CLAUDE.md
./claude-md-converter.js --to-claude memories.mnemo > CLAUDE.md

# Sync entire directories
./claude-md-converter.js --sync \
  --claude-dir ./memory-bank \
  --mnemo-dir ./mnemo-store
```

## Features

### 1. Bidirectional Conversion
- CLAUDE.md → Mnemocode (with full metadata)
- Mnemocode → CLAUDE.md (structured sections)

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

## Integration with Mnemo

```javascript
const { parseClaudeMd, toMnemocode } = require('./claude-md-converter');

// Read CLAUDE.md
const claudeContent = fs.readFileSync('CLAUDE.md', 'utf8');
const memories = parseClaudeMd(claudeContent, 'CLAUDE.md');

// Convert to Mnemocode
const mnemoContent = toMnemocode(memories, {
    project: 'my-project',
    sessionId: 'session_123'
});

// Store in Mnemo
fs.writeFileSync('memory.mnemo', mnemoContent);
```

## Use Cases

### 1. Piggyback on CLAUDE.md Popularity
- Existing CLAUDE.md users can migrate to Mnemo gradually
- Mnemo users can export to CLAUDE.md for Claude Code compatibility

### 2. Hybrid Workflow
- Use CLAUDE.md for active development (Claude Code)
- Use Mnemo for long-term persistence and cross-project memory

### 3. Community Bridge
- Share memories between CLAUDE.md and Mnemo ecosystems
- Contribute to both projects without duplicating work

## Command Reference

| Flag | Description |
|------|-------------|
| `--to-mnemo <file>` | Convert CLAUDE.md to Mnemocode |
| `--to-claude <file>` | Convert Mnemocode to CLAUDE.md |
| `--sync` | Bidirectional directory sync |
| `--claude-dir <dir>` | Source CLAUDE.md directory |
| `--mnemo-dir <dir>` | Target Mnemo directory |
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

### Output (Mnemocode)
```
## MNEMOCODE v1.1
## Source: CLAUDE.md Converter v1.0.0
...

◊MNEMO◊
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
**License:** MIT (same as Mnemo)
