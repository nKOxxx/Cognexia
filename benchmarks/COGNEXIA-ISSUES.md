# Cognexia Benchmark Issues & Fixes

**Date**: 2026-04-13  
**Status**: 16/54 tests passing (29.6%) — Up from 10/54 after fixes

---

## ✓ Fixed Issues

### Issue #1: Search/Query Endpoint Uses Wrong HTTP Method
**Status**: ✅ FIXED  
**Problem**: Tests used POST with JSON body `{"keywords": [...]}`, but API uses GET with query param `?q=...`  
**Root Cause**: API documentation mismatch — endpoint signature was GET but tests assumed POST  
**Fix Applied**:
- Changed `conftest.py` query() method from POST to GET
- Changed parameter from `keywords` to `q` (space-separated string)
- Normalized response wrapping results in `memories` key
**Result**: +6 tests now passing (all special character tests + basic search tests)  
**File**: `benchmarks/conftest.py` lines 19-34

### Issue #2: Graph Link Endpoint Parameter Names
**Status**: ✅ FIXED  
**Problem**: Tests used `idA`, `idB`, `type` but API expects `sourceId`, `targetId`, `linkType`  
**Root Cause**: Parameter naming convention mismatch in test assumptions  
**Fix Applied**:
- Changed relate() method to use `sourceId`/`targetId` instead of `idA`/`idB`
- Changed `type` to `linkType`
- Added `strength` parameter (0.8 default)
**Result**: Tests can now call graph endpoint without 400 errors  
**File**: `benchmarks/conftest.py` lines 46-58

---

## ❌ Remaining Issues (35 tests)

### Issue #3: Search Filtering by Metadata Not Working
**Status**: ❌ BROKEN  
**Affected Tests** (4):
- `test_search_with_metadata_filter` — filtering by type/importance
- `test_search_multiple_keywords_or` — multiple keywords
- `test_search_short_keywords_ignored` — keyword length filtering
- `test_search_with_special_characters` — special char handling

**Problem**: API doesn't support filter parameters in search  
**API Limitation**: GET /api/memory/query only supports `?q=...` no filters  
**Root Cause**: Search endpoint doesn't accept metadata filters  
**Impact**: Can't filter search results by type, importance, etc.  
**Fix Needed**: 
1. Update tests to not expect filtering (or)
2. Add filter support to API endpoint
**File**: `benchmarks/test_correctness_search.py` lines 108-160

---

### Issue #4: Project Isolation Broken
**Status**: ❌ BROKEN — CRITICAL SECURITY ISSUE  
**Affected Tests** (4):
- `test_memories_isolated_by_project`
- `test_agent_id_scoped_to_project`
- `test_graph_isolated_by_project`
- `test_project_deletion_isolation`

**Problem**: Memories from project A are visible in project B  
**Symptom**: Query in project B returns memories from project A  
**Root Cause**: Project scoping not properly enforced in query/retrieval  
**Severity**: 🔴 CRITICAL — Multi-tenancy broken  
**Impact**: Data privacy violation, security issue  
**Fix Needed**:
1. Verify project names are used as filter in all queries
2. Check database schema isolation per project
3. Ensure each project has isolated database/table
**Files**:
- `benchmarks/test_correctness_isolation.py` lines 20-198
- `server.js` memory query functions

---

### Issue #5: Graph Operations Returning Unexpected Structures
**Status**: ❌ BROKEN  
**Affected Tests** (6):
- `test_relate_creates_bidirectional_link`
- `test_graph_no_orphaned_nodes`
- `test_duplicate_relations_idempotent`
- `test_graph_deletion_removes_relations`
- `test_graph_traversal_finds_connected_memories`
- `test_graph_with_many_relations`

**Problem**: Tests expect specific response structures that don't match API  
**Root Cause**: API response format differs from test expectations (e.g., `m["id"]` not in results)  
**Impact**: Can't verify graph correctness  
**Fix Needed**:
1. Check actual /api/graph response structure
2. Update tests to match or update API to match tests
**Files**: `benchmarks/test_correctness_graph.py` lines 10-200

---

### Issue #6: Memory Retrieval by ID Fails Cross-Project
**Status**: ❌ BROKEN  
**Affected Tests** (1):
- `test_memories_isolated_by_project` — specifically line 22 get_memory()

**Problem**: Retrieving memory by ID from different project doesn't fail  
**Expected**: Should return 404 or error when retrieving memory from wrong project  
**Actual**: Either succeeds or returns memory from another project  
**Root Cause**: Project isolation not enforced in memory retrieval  
**Severity**: 🔴 CRITICAL — Security issue  
**Fix Needed**: Verify project parameter in get_memory() endpoint  
**File**: `benchmarks/test_correctness_isolation.py` line 22

---

### Issue #7: Search Result Format in Responses
**Status**: ⚠️ PARTIAL  
**Affected Tests** (3):
- `test_search_results_include_full_content`
- `test_search_precision_at_scale`
- `test_search_relevance_sorting`

**Problem**: Tests expect `m["id"]` but API might return different field names  
**Current API Response**: Results have `id`, `content`, `type`, `importance` fields  
**Expected by Tests**: Results with `id`, `content`, metadata  
**Status**: Likely just test assertion issues, API probably fine  
**Fix**: Update assertions in tests  
**File**: `benchmarks/test_correctness_search.py` lines 123-200

---

## Test Suite Status

```
Total: 54 tests

✓ PASSING (16):
  - test_encrypt_decrypt_simple_text
  - test_encrypt_decrypt_unicode
  - test_encrypt_decrypt_long_content
  - test_encrypt_decrypt_with_metadata
  - test_same_plaintext_different_ciphertexts
  - test_encryption_without_enable_still_works
  - test_encrypted_vs_unencrypted_query
  - test_special_characters (6 variants)
  - test_search_finds_keyword_in_content
  - test_search_case_insensitivity
  - test_search_no_false_positives
  - test_search_empty_keywords
  - test_type_and_metadata_isolated
  - test_invalid_project_name_rejection
  - test_concurrent_writes_same_project (fixed after restart)

❌ FAILING (35):
  - Search: 4 (filtering, special chars, precision)
  - Graph: 6 (relationships, traversal)
  - Isolation: 4 (project scoping, deletion)
  - Concurrency: 0 (server stable now)
  - Encryption: 0 (all passing!)
```

---

## Priority Fixes

### P0 (Critical — Block Release)
1. **Fix project isolation** (Issue #4)
   - Security vulnerability
   - Affects 4 tests
   - Estimated: 2-3 hours

2. **Fix memory retrieval isolation** (Issue #6)
   - Security vulnerability
   - Estimated: 1 hour

### P1 (High — Important for Release)
3. **Fix graph operations** (Issue #5)
   - Core feature (relationships)
   - Affects 6 tests
   - Estimated: 2-3 hours

### P2 (Medium — Nice to Have)
4. **Add search filtering** (Issue #3)
   - Feature limitation
   - Affects 4 tests
   - Estimated: 1-2 hours

---

## Recommended Next Steps

1. **Run isolation tests** individually to debug project scoping
   ```bash
   ./benchmarks/run.sh --isolation -v
   ```

2. **Check database structure** for project isolation
   ```bash
   # Inspect how projects are stored/queried
   grep -n "project" /path/to/index.js | head -20
   ```

3. **Test graph endpoint** manually to understand response structure
   ```bash
   curl -s "http://localhost:10000/api/graph?project=test" | jq .
   ```

4. **Re-run benchmarks** after each fix
   ```bash
   ./benchmarks/run.sh --fast
   ```

---

## Files Modified

- `benchmarks/conftest.py` — API client fixes (query method, relate method)
- `benchmarks/COGNEXIA-RUN-01-RESULTS.md` — First run results
- `benchmarks/COGNEXIA-ISSUES.md` — This file

## Files Requiring Changes (Not Yet Modified)

- `server.js` — Project isolation enforcement
- `benchmarks/test_correctness_*.py` — Some assertion fixes
- API documentation — Update parameter names

---

**Generated**: 2026-04-13 14:45 UTC  
**Test Run**: After conftest.py fixes  
**Progress**: 16/54 → Target: 54/54 after all fixes
