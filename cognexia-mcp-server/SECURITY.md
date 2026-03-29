# Security Audit — Cognexia MCP Server

## Overview

This document is the security audit for the Cognexia MCP server, covering the threat model, attack surfaces, mitigations, and residual risks.

## Trust Model

- The MCP server is a **read-only** bridge. It never writes, updates, or deletes memories.
- Claude Code sends tool call requests over stdio. The server trusts the MCP SDK transport.
- API key (if configured) is the only authentication mechanism.

## Threat Model

### 1. SQL Injection — MITIGATED ✅

**Risk:** An attacker who can influence tool arguments could inject SQL via the `query` parameter or other fields.

**Mitigations:**
- All user inputs pass through **Zod schemas** that validate type, length, and format before any DB operation.
- `query` keyword search uses `LIKE ?` with the parameter bound separately — never string-concatenated.
- All DB operations use `better-sqlite3` prepared statements with positional parameters.
- Project names are restricted to `[a-zA-Z0-9_-]+` and lowercased before use.
- Memory IDs are validated as UUID format.
- No dynamic column or table names from user input — schema is fixed.

**Audit:** Search `buildSearchQuery()` in `src/index.ts` — all user values go into the `args` array bound to `?` placeholders.

### 2. Path Traversal — MITIGATED ✅

**Risk:** A malicious `COGNEXIA_DATA_PATH` env var could point to sensitive system directories.

**Mitigations:**
- Data path is controlled entirely by the server operator via environment variable, not by Claude Code.
- Project subdirectories are constructed as `memory-{sanitized_project}/bridge.db` — no `..` or absolute paths accepted from user input.
- `better-sqlite3` opens files via SQLite's VFS, not arbitrary file reads.

**Audit:** `getProjectDbPath()` — no user-controlled path components.

### 3. Unauthorized Access — MITIGATED ✅

**Risk:** Without API key auth, anyone who can send tool calls can read all memories.

**Mitigations:**
- Optional API key via `COGNEXIA_MCP_API_KEY` env var.
- Constant-time string comparison (`charCodeAt` XOR loop) to prevent timing attacks.
- If no key is configured, server logs a warning on startup.
- All four tools check `validateApiKey()` before processing.

### 4. Rate Limiting — MITIGATED ✅

**Risk:** An authorized or unauthorized caller could overwhelm the server.

**Mitigations:**
- Per-connection rate limiting: 60 requests per 60-second sliding window.
- Connection identified by incrementing counter (stdio transport = single process).
- Returns `{ error: "Rate limit exceeded", retryAfterMs }` with HTTP 429-equivalent code.
- Rate limit map pruned on every check (old entries discarded).

**Audit:** `checkRateLimit()` in `src/index.ts`.

### 5. Sensitive Data in Logs — MITIGATED ✅

**Risk:** Memory content or IDs could appear in server logs, exposing data.

**Mitigations:**
- `log()` function only allows a fixed allowlist of safe keys: `project`, `type`, `count`, `limit`, `offset`, `durationMs`.
- Memory content, full text, tags, and metadata are **never** logged.
- Timestamps and error messages (sanitized) are the only logged metadata.

**Audit:** `log()` function in `src/index.ts` — no content fields.

### 6. Denial of Service via Large Result Sets — MITIGATED ✅

**Risk:** A query with `limit=100` (max) on a project with millions of memories could exhaust memory.

**Mitigations:**
- Hard cap: `MAX_QUERY_RESULTS = 100`.
- Zod schema enforces `max(100)` on `limit`.
- Streaming is not used — all results loaded into memory. This is acceptable at 100-row cap.
- `offset` pagination has no protection against deep pagination DoS, but 100-row cap limits damage.

### 7. Information Disclosure via Project Enumeration — ACKNOWLEDGED ⚠️

**Risk:** `list_projects` reveals the names of all projects in the data lake.

**Mitigation:** This is by design — the server is for authorized Claude Code instances with read access to the same data lake the operator controls. Project names are not considered sensitive.

### 8. No Write Capability — DESIGN ✅

The server intentionally provides no tools to create, update, or delete memories. Claude Code cannot modify the memory store through this server.

### 9. Dependency Vulnerabilities — MITIGATED via patching ✅

Dependencies: `@modelcontextprotocol/sdk`, `better-sqlite3`, `zod`, `uuid`, `express`.

- `better-sqlite3`: native module, update via `npm audit`.
- `@modelcontextprotocol/sdk`: update regularly.
- No `eval()`, no `exec()`, no `child_process` from user input.

## Security Checklist

| Item | Status |
|------|--------|
| SQL injection — parameterized queries only | ✅ |
| SQL injection — Zod input validation | ✅ |
| SQL injection — no dynamic table/column names | ✅ |
| Path traversal prevention | ✅ |
| API key authentication (optional) | ✅ |
| Constant-time key comparison | ✅ |
| Rate limiting (60 req/min per connection) | ✅ |
| No sensitive data in logs | ✅ |
| Read-only DB access (`readonly: true`) | ✅ |
| No `eval` or `exec` from user input | ✅ |
| Max result set cap (100 rows) | ✅ |
| No write/delete/update tools | ✅ |
| HTTPS enforcement (env var) | ✅ (handled by operator's proxy) |

## Configuration Security Recommendations

1. **Set `COGNEXIA_MCP_API_KEY`** — enable authentication even for local use.
2. **Run on a secure workstation** — the stdio transport means the server process has the same privileges as the Claude Code process.
3. **Data lake permissions** — ensure `~/.cognexia/data-lake/` is `0700` (owner-only).
4. **Network exposure** — this server uses stdio by default and is not network-facing. If HTTP mode is added in the future, run behind a TLS-terminating reverse proxy.
5. **Audit logs** — redirect `stderr` to a log file for incident response.

## Reporting Security Issues

Please report vulnerabilities to the Cognexia repository's security advisories or contact the maintainer directly.
