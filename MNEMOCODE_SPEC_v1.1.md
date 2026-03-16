# Cognexiacode Enhancement Specification
## Version 1.1 — Security, Functionality, Efficiency, Operability

---

## 1. SECURITY REQUIREMENTS

### 1.1 API Authentication
**Requirement:** All Cognexia API endpoints must require authentication.

**Implementation:**
- Generate API key on Cognexia server startup (stored in `~/.cognexia/auth.key`)
- Require `Authorization: Bearer <key>` header on all `/api/*` endpoints
- Reject requests with 401 if key missing/invalid
- Hook auto-reads key from `COGNEXIA_API_KEY` env or `~/.cognexia/auth.key`

**Test:** `curl http://localhost:10000/api/memory/query` → 401
**Test:** `curl -H "Authorization: Bearer <key>" ...` → 200

### 1.2 Sensitive Data Scrubbing
**Requirement:** Auto-detect and redact secrets before storage.

**Implementation:**
- Pre-storage regex patterns:
  - API keys: `sk-[a-zA-Z0-9]{20,}` → `[REDACTED_API_KEY]`
  - Passwords: `password[:\s]*["']?[^\s"']+["']?` → `password: [REDACTED]`
  - Tokens: `token[:\s]*["']?[a-zA-Z0-9_-]{10,}` → `token: [REDACTED]`
  - Private keys: `-----BEGIN.*PRIVATE KEY-----` → `[REDACTED_PRIVATE_KEY]`
  - Connection strings with passwords
- Log: `[CognexiaScrub] Redacted 3 sensitive patterns`

### 1.3 Encrypted State Files
**Requirement:** Session state files encrypted at rest.

**Implementation:**
- Use AES-256-GCM encryption
- Key derived from `COGNEXIA_MASTER_KEY` env (or prompt on first run)
- Encrypt: `~/.openclaw/cognexia-session-state.json.enc`
- Auto-decrypt on read, encrypt on write
- Migration: auto-encrypt existing plaintext on first access

### 1.4 Memory Access Controls (Future)
**Requirement:** Per-project ACLs for multi-user scenarios.

**Implementation:**
- Optional: `~/.cognexia/acl.json` with project permissions
- Each memory stores `access: { owner: "agent_id", readers: ["*"], writers: ["owner"] }`
- API checks ACL before returning/storing memory

---

## 2. FUNCTIONALITY REQUIREMENTS

### 2.1 Memory Deduplication
**Requirement:** Prevent storing semantically identical memories.

**Implementation:**
- Before storage, compute embedding of new memory
- Query last 100 memories from same project
- Skip if cosine similarity > 0.92 to any existing
- Log: `[CognexiaDedup] Skipped (92% similar to memory #12345)`

### 2.2 Update vs Append
**Requirement:** Allow updating existing memory instead of creating new.

**Implementation:**
- New endpoint: `POST /api/memory/update`
- Body includes `memoryId` and `updates` object
- Track version history: `versions: [{ content, updatedAt, agentId }]`
- CLI: `./cognexia-session.js update <id> "new content"`

### 2.3 Memory Expiration (TTL)
**Requirement:** Auto-archive old memories based on type.

**Implementation:**
- Config in `~/.cognexia/ttl.json`:
  ```json
  {
    "error": "30d",
    "insight": "365d", 
    "milestone": "never",
    "security": "90d"
  }
  ```
- Daily background job archives expired memories to `~/.cognexia/archive/`
- API: `GET /api/memory/archived` to query old memories

### 2.4 Cross-Reference Linking
**Requirement:** Link related memories (decision → implementation → bug).

**Implementation:**
- Storage accepts `links: ["memory_id_1", "memory_id_2"]`
- UI/recall shows related memories inline
- Auto-detect: if memory mentions "Fixed bug from #12345", auto-link

### 2.5 Export/Backup
**Requirement:** JSON dump for migration or offline analysis.

**Implementation:**
- Endpoint: `GET /api/memory/export?project=X&from=2024-01-01&format=json|csv`
- CLI: `./cognexia-session.js export --project gulfwatch --output backup.json`
- Include metadata: storage date, agent, importance, tags

---

## 3. EFFICIENCY REQUIREMENTS

### 3.1 Batch Storage
**Requirement:** Queue memories and flush periodically, not per-message.

**Implementation:**
- In-memory queue with max size 50
- Flush triggers: 
  - Queue reaches 50 items
  - 30 seconds elapsed since last flush
  - Process shutting down (SIGTERM)
- Endpoint: `POST /api/memory/batch` accepts array
- Retry failed batch items individually

### 3.2 Compression
**Requirement:** Compress large content before storage.

**Implementation:**
- If content > 1KB, gzip compress before storing
- Store with flag `compressed: true`
- Auto-decompress on retrieval
- Save ~60% storage for code blocks/logs

### 3.3 Smart Filtering (Similarity Skip)
**Requirement:** Skip storage if too similar to recent memory.

**Implementation:**
- Maintain last 20 messages in memory
- Before storage, compare embedding to recent buffer
- Skip if similarity > 0.85 to any message in last 10 minutes
- Prevents "fixed typo", "testing", "ok" spam

### 3.4 Lazy Project Loading
**Requirement:** Don't fetch all projects on init.

**Implementation:**
- Remove `loadProjects()` from constructor
- Cache projects only when first mentioned
- Refresh cache every 5 minutes if active
- Improves startup time from ~200ms to ~10ms

---

## 4. OPERABILITY REQUIREMENTS

### 4.1 Health Check Endpoint
**Requirement:** Verify Cognexia server is alive before operations.

**Implementation:**
- Endpoint: `GET /health` returns `{ status: "ok", version: "1.1.0", uptime: 3600 }`
- Hook checks health on init, warns if unreachable
- CLI: `./cognexia-session.js status` shows server health

### 4.2 Circuit Breaker
**Requirement:** If Cognexia is down, queue to disk instead of dropping.

**Implementation:**
- Failed storage attempts → write to `~/.cognexia/pending/<timestamp>.json`
- Background retry every 60 seconds
- On success, delete pending file
- On hook startup, flush all pending files

### 4.3 Metrics Exposure
**Requirement:** Track and expose performance metrics.

**Implementation:**
- Endpoint: `GET /metrics` returns:
  ```json
  {
    "storage": { "total": 1523, "failed": 12, "avg_latency_ms": 45 },
    "queries": { "total": 8921, "avg_latency_ms": 12 },
    "dedup": { "skipped": 234 },
    "compression": { "bytes_saved": 1048576 }
  }
  ```
- Hook logs: `[CognexiaMetrics] Stored 45 memories, skipped 3 duplicates`

### 4.4 Structured Logging
**Requirement:** Consistent, parseable logs.

**Implementation:**
- All logs as JSON: `{"level":"info","component":"CognexiaSmart","message":"...","timestamp":"..."}`
- Levels: debug, info, warn, error
- Config via `COGNEXIA_LOG_LEVEL` env

---

## PRIORITY ORDER

**Phase 1 (Critical):**
1. API Authentication (1.1)
2. Sensitive Data Scrubbing (1.2)
3. Batch Storage (3.1)
4. Health Check (4.1)
5. Circuit Breaker (4.2)

**Phase 2 (Important):**
6. Memory Deduplication (2.1)
7. Smart Filtering (3.3)
8. Encrypted State Files (1.3)
9. Metrics Exposure (4.3)

**Phase 3 (Nice to Have):**
10. Update vs Append (2.2)
11. Memory Expiration (2.3)
12. Cross-Reference Linking (2.4)
13. Compression (3.2)
14. Export/Backup (2.5)
15. Lazy Project Loading (3.4)
16. Memory Access Controls (1.4)

---

## ACCEPTANCE CRITERIA

- [ ] All Phase 1 items implemented and tested
- [ ] No plaintext secrets stored in any memory
- [ ] Server stays responsive under 1000 memories/hour load
- [ ] Zero data loss when server temporarily unavailable
- [ ] All tests pass: `npm test`

---

*Spec version: 1.1*
*Target implementation: Cognexiacode v1.1.0*
