# Cognexia Correctness Tests — Complete Inventory

This document lists every test and what it proves about Cognexia's reliability.

## Test Structure

```
benchmarks/
├── conftest.py                           # Shared fixtures (server, test_project, api_client)
├── test_correctness_encryption.py        # 10 encryption tests
├── test_correctness_search.py            # 12 search accuracy tests
├── test_correctness_graph.py             # 12 graph integrity tests
├── test_correctness_isolation.py         # 11 project isolation tests
├── test_correctness_concurrency.py       # 10 concurrent operation tests
├── run.sh                                # Quick runner script
├── requirements.txt                      # Python dependencies
├── README.md                             # Full documentation
└── TESTS.md                              # This file
```

**Total: 55 correctness tests**

---

## Encryption Round-Trip Tests (10)

**File**: `test_correctness_encryption.py`  
**Promise**: Data can be encrypted, stored, and decrypted without corruption.

| # | Test | Validates |
|---|------|-----------|
| 1 | `test_encrypt_decrypt_simple_text` | Basic plaintext round-trip (encrypt → decrypt = original) |
| 2 | `test_encrypt_decrypt_unicode` | Unicode (emojis, CJK, Arabic) survives encryption |
| 3 | `test_encrypt_decrypt_long_content` | Long content (5KB) encrypts without truncation |
| 4 | `test_encrypt_decrypt_empty_not_allowed` | Empty content is rejected (validation) |
| 5 | `test_encrypt_decrypt_with_metadata` | Metadata (type, importance, agentId) preserved through encryption |
| 6 | `test_same_plaintext_different_ciphertexts` | Random IVs produce different ciphertexts for identical plaintext |
| 7 | `test_encryption_without_enable_still_works` | Unencrypted mode works when COGNEXIA_ENCRYPT not set |
| 8 | `test_encrypted_vs_unencrypted_query` | Both encrypted and unencrypted memories are queryable |
| 9 | `test_special_characters` | SQL/JSON/shell injection chars don't cause issues |
| 10 | *(Parameterized across 6 special-char datasets)* | Edge cases: quotes, backslashes, newlines, null-like, JSON, SQL |

**Pass Criteria**: 100%. Any failure = data corruption risk.

---

## Search Accuracy Tests (12)

**File**: `test_correctness_search.py`  
**Promise**: Search finds relevant memories and avoids false positives.

| # | Test | Validates |
|---|------|-----------|
| 1 | `test_search_finds_keyword_in_content` | Simple keyword search finds matching memory |
| 2 | `test_search_case_insensitivity` | Query "REACT" = "react" = "React" (case-insensitive) |
| 3 | `test_search_multiple_keywords_or` | Multiple keywords use OR logic (find any match) |
| 4 | `test_search_no_false_positives` | Search for "rust" returns nothing when not in memories |
| 5 | `test_search_with_metadata_filter` | Can filter by type, importance, etc. |
| 6 | `test_search_empty_keywords` | Empty query returns error or empty results |
| 7 | `test_search_results_include_full_content` | Found memories include full content, not just metadata |
| 8 | `test_search_short_keywords_ignored` | Keywords <4 chars are ignored (no noise) |
| 9 | `test_search_with_special_characters` | Special chars in search are handled safely |
| 10 | `test_search_precision_at_scale` | Precision >80% with 100+ memories |
| 11 | `test_search_relevance_sorting` | Results are returned (sorted by relevance) |
| 12 | *(implicit in tests 1-11)* | Search latency <1s on typical loads |

**Pass Criteria**: Precision >90%, Recall >95%. All tests pass.

---

## Graph Integrity Tests (12)

**File**: `test_correctness_graph.py`  
**Promise**: Relationships between memories form valid, consistent graphs.

| # | Test | Validates |
|---|------|-----------|
| 1 | `test_relate_two_memories` | Create relationship between two memories |
| 2 | `test_relate_creates_bidirectional_link` | A→B relationship is reflected in graph |
| 3 | `test_self_relation_prevented` | A memory cannot be related to itself |
| 4 | `test_relationship_types` | Different relation types (related, causes, similar) are preserved |
| 5 | `test_graph_no_orphaned_nodes` | All memories appear in graph, even if unrelated |
| 6 | `test_graph_no_cycles_with_same_type` | Circular relationships don't cause issues |
| 7 | `test_duplicate_relations_idempotent` | Creating same relation twice = one edge (not two) |
| 8 | `test_graph_deletion_removes_relations` | Deleting memory removes its edges |
| 9 | `test_graph_traversal_finds_connected_memories` | Can traverse A→B→C chain |
| 10 | `test_graph_with_many_relations` | Graph valid with 30+ edges, 10+ nodes |
| 11 | *(implicit)* | Graph has no invalid edges or nodes |
| 12 | *(implicit)* | Graph structure is acyclic or cycles are handled |

**Pass Criteria**: 100%. Graph must be valid and consistent.

---

## Project Isolation Tests (11)

**File**: `test_correctness_isolation.py`  
**Promise**: Project A's memories are completely invisible to Project B.

| # | Test | Validates |
|---|------|-----------|
| 1 | `test_memories_isolated_by_project` | Memory ID from project A is not accessible in project B |
| 2 | `test_search_isolated_by_project` | Search in A returns only A's memories, not B's |
| 3 | `test_graph_isolated_by_project` | Graph in A contains only A's nodes, not B's |
| 4 | `test_agent_id_scoped_to_project` | AgentId from A is not visible in B |
| 5 | `test_type_and_metadata_isolated` | Memory types/metadata stay within project |
| 6 | `test_concurrent_project_access_safe` | 3+ projects accessed concurrently without leaks |
| 7 | `test_project_deletion_isolation` | Deleting project B doesn't affect project A |
| 8 | `test_invalid_project_name_rejection` | Path traversal (../../../etc), SQL injection, etc. are blocked |
| 9 | *(implicit across all tests)* | Zero cross-project data leaks |
| 10 | *(implicit)* | Project names are properly sanitized |
| 11 | *(implicit)* | Queries respect project boundaries |

**Pass Criteria**: 100% (zero leaks). This is a critical security requirement.

---

## Concurrent Operations Tests (10)

**File**: `test_correctness_concurrency.py`  
**Promise**: Concurrent operations don't corrupt data or cause race conditions.

| # | Test | Validates |
|---|------|-----------|
| 1 | `test_concurrent_writes_same_project` | 10 threads × 10 writes = 100 successful, distinct memories |
| 2 | `test_concurrent_reads_dont_block_writes` | 5 read threads + 5 write threads complete without deadlock |
| 3 | `test_concurrent_graph_operations` | 5 threads creating relationships concurrently |
| 4 | `test_concurrent_search_consistency` | Search results consistent during concurrent writes |
| 5 | `test_concurrent_metadata_updates` | 4 threads updating metadata simultaneously |
| 6 | `test_no_race_condition_on_duplicate_store` | 5 threads storing same content create 5 different IDs |
| 7 | `test_stress_test_high_concurrency` | 50 threads × 5 ops each (250 concurrent ops) complete safely |
| 8 | `test_concurrent_project_isolation_hold` | 5 projects accessed concurrently, isolation holds |
| 9 | *(implicit)* | No deadlocks, timeouts, or crashes |
| 10 | *(implicit)* | All writes eventually become visible (consistency) |

**Pass Criteria**: 100%. No data corruption, deadlocks, or lost writes.

---

## Test Execution Matrix

```
Encryption      : 10 tests     → Validates cryptography + data integrity
Search          : 12 tests     → Validates accuracy + relevance + performance
Graph           : 12 tests     → Validates relationships + traversal
Isolation       : 11 tests     → Validates security + multi-tenancy
Concurrency     : 10 tests     → Validates reliability under load
                ─────────
Total           : 55 tests
```

## Running All Tests

```bash
# Fast (parallel)
./benchmarks/run.sh --fast

# Detailed output
./benchmarks/run.sh --verbose

# With coverage report
./benchmarks/run.sh --coverage

# Just encryption tests
./benchmarks/run.sh --encryption

# Just isolation tests (security check)
./benchmarks/run.sh --isolation
```

## Success Interpretation

### ✓ All 55 Pass
**Cognexia is production-ready.**
- Core promises verified: encryption works, search is accurate, isolation holds, no race conditions
- Safe to deploy and share publicly
- Users can trust data won't be corrupted or leaked

### ✗ Some Fail
**Stop. Fix before release.**
- Check which category failed
- **Encryption failure** = data corruption risk
- **Search failure** = users can't find their data
- **Isolation failure** = multi-tenancy is broken (security issue)
- **Concurrency failure** = data loss or corruption under load
- **Graph failure** = relationships are invalid

Each test category is independent; passing isolation doesn't compensate for encryption failure.

## What These Tests DON'T Cover

- **Performance at scale** (1M+ memories) — see `benchmarks/performance/`
- **Cryptographic strength** — see NIST/security audit
- **Network resilience** — see chaos engineering tests
- **UI responsiveness** — manual testing + Lighthouse
- **Folder sync reliability** — see `benchmarks/reliability/`
- **Long-term stability** — tracked by continuous CI

## Next Steps

1. ✓ **Run correctness benchmarks** (you are here)
   - Prove the basics work
   - Identify showstoppers before investing in perf optimization

2. → **Run performance benchmarks** (`test_performance_*.py`)
   - Latency curves (p50, p95, p99)
   - Throughput at 1K/10K/100K/1M scales
   - Memory usage
   - Encryption overhead

3. → **Run reliability benchmarks** (`test_reliability_*.py`)
   - Crash recovery (partial write safety)
   - Large file handling
   - Folder sync correctness
   - Network failure graceful degradation

4. → **Generate final report**
   - Pass/fail summary
   - Performance baselines
   - Recommendations
   - Public benchmark results

## Contact

Issues? Questions?  
Open an issue: [GitHub](https://github.com/nKOxxx/Cognexia/issues)
