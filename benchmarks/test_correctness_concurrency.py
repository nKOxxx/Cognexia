"""
Cognexia Correctness — Concurrent Operations Tests
Validates that concurrent writes don't corrupt data or cause race conditions
"""

import pytest
import threading
import time
import json
from concurrent.futures import ThreadPoolExecutor, as_completed


class TestConcurrentOperations:
    """Test that concurrent operations maintain data integrity."""

    def test_concurrent_writes_same_project(self, api_client, test_project):
        """Multiple threads writing to same project concurrently."""
        num_threads = 10
        writes_per_thread = 10
        written_ids = []
        lock = threading.Lock()

        def write_memories(thread_id):
            ids = []
            for i in range(writes_per_thread):
                result = api_client.store(
                    test_project,
                    f"Memory from thread {thread_id}, iteration {i}"
                )
                if result.get("success") is True:
                    ids.append(result.get("data", {}).get("id"))
            with lock:
                written_ids.extend(ids)

        # Run concurrent writes
        with ThreadPoolExecutor(max_workers=num_threads) as executor:
            futures = [executor.submit(write_memories, i) for i in range(num_threads)]
            for future in as_completed(futures):
                future.result()

        # All writes should have succeeded
        expected_total = num_threads * writes_per_thread
        assert len(written_ids) == expected_total, \
            f"Expected {expected_total} writes, got {len(written_ids)}"

        # All memories should be retrievable
        for memory_id in written_ids:
            result = api_client.get_memory(test_project, memory_id)
            assert result.get("success") is True, \
                f"Failed to retrieve memory {memory_id}"

    def test_concurrent_reads_dont_block_writes(self, api_client, test_project):
        """Concurrent reads don't block writes."""
        # Pre-populate with memories
        ids = []
        for i in range(20):
            result = api_client.store(test_project, f"Memory {i}")
            ids.append(result.get("data", {}).get("id"))

        # Concurrent reads and writes
        def read_memories():
            for _ in range(5):
                api_client.query(test_project, ["memory"])

        def write_memories():
            for i in range(5):
                api_client.store(test_project, f"New memory {i}")

        with ThreadPoolExecutor(max_workers=10) as executor:
            read_futures = [executor.submit(read_memories) for _ in range(5)]
            write_futures = [executor.submit(write_memories) for _ in range(5)]

            for future in as_completed(read_futures + write_futures):
                future.result()  # Should not raise

    def test_concurrent_graph_operations(self, api_client, test_project):
        """Concurrent relationship creation doesn't corrupt graph."""
        # Create memories
        ids = []
        for i in range(10):
            result = api_client.store(test_project, f"Node {i}")
            ids.append(result.get("data", {}).get("id"))

        # Concurrently create relationships
        def create_relations(thread_id):
            for i in range(len(ids) - 1):
                api_client.relate(
                    test_project,
                    ids[i],
                    ids[i + 1],
                    f"relation-{thread_id}"
                )

        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(create_relations, i) for i in range(5)]
            for future in as_completed(futures):
                future.result()

        # Graph should be consistent
        graph = api_client.get_graph(test_project)
        assert graph.get("success") is True

        nodes = graph.get("nodes", [])
        edges = graph.get("edges", [])

        # All nodes should be in graph
        node_ids = [n.get("id") for n in nodes]
        for id in ids:
            assert id in node_ids, f"Node {id} missing from graph"

        # Graph should have edges (no corruption)
        assert len(edges) > 0, "Graph has no edges"

    def test_concurrent_search_consistency(self, api_client, test_project):
        """Search results are consistent under concurrent writes."""
        # Store initial memories
        for i in range(10):
            api_client.store(test_project, f"Python memory {i}")

        found_counts = []
        lock = threading.Lock()

        def search_and_count():
            result = api_client.query(test_project, ["python"])
            count = len(result.get("memories", []))
            with lock:
                found_counts.append(count)

        def add_memory():
            for i in range(5):
                api_client.store(test_project, f"Python new {i}")
                time.sleep(0.01)  # Small delay to interleave operations

        # Start adding memories
        with ThreadPoolExecutor(max_workers=10) as executor:
            add_future = executor.submit(add_memory)

            # Search concurrently
            search_futures = [executor.submit(search_and_count) for _ in range(5)]

            add_future.result()
            for future in as_completed(search_futures):
                future.result()

        # All searches should find at least the initial 10
        for count in found_counts:
            assert count >= 10, f"Search found only {count} memories"

    def test_concurrent_metadata_updates(self, api_client, test_project):
        """Concurrent metadata updates don't cause corruption."""
        # Store a memory
        memory_id = api_client.store(test_project, "Base memory")["id"]

        # Concurrent updates to different aspects
        def update_type(value):
            api_client.store(test_project, "Type update", type=value, override_id=memory_id)

        def update_importance(value):
            api_client.store(test_project, "Importance update", importance=value, override_id=memory_id)

        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = [
                executor.submit(update_type, "task"),
                executor.submit(update_type, "feature"),
                executor.submit(update_importance, 5),
                executor.submit(update_importance, 8),
            ]
            for future in as_completed(futures):
                future.result()

        # Memory should still be retrievable and consistent
        result = api_client.get_memory(test_project, memory_id)
        assert result.get("success") is True

    def test_no_race_condition_on_duplicate_store(self, api_client, test_project):
        """Storing identical content concurrently creates separate memories."""
        content = "Identical content from concurrent threads"
        stored_ids = []
        lock = threading.Lock()

        def store_same_content():
            result = api_client.store(test_project, content)
            if result.get("success") is True:
                with lock:
                    stored_ids.append(result.get("data", {}).get("id"))

        # Store same content from 5 threads simultaneously
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(store_same_content) for _ in range(5)]
            for future in as_completed(futures):
                future.result()

        # All should succeed and create different IDs
        assert len(stored_ids) == 5, f"Expected 5 IDs, got {len(stored_ids)}"

        # All IDs should be unique
        assert len(set(stored_ids)) == 5, "Duplicate IDs created"

        # All should be retrievable with same content
        for memory_id in stored_ids:
            result = api_client.get_memory(test_project, memory_id)
            assert result.get("data", {}).get("content") == content

    def test_stress_test_high_concurrency(self, api_client, test_project):
        """System handles high concurrency (50+ simultaneous operations)."""
        num_threads = 50
        operations_per_thread = 5

        def mixed_operations(thread_id):
            for i in range(operations_per_thread):
                # Mix of operations
                if i % 3 == 0:
                    api_client.store(test_project, f"Thread {thread_id} write {i}")
                elif i % 3 == 1:
                    api_client.query(test_project, ["thread"])
                else:
                    graph = api_client.get_graph(test_project)
                    assert graph.get("success") is True

        with ThreadPoolExecutor(max_workers=num_threads) as executor:
            futures = [executor.submit(mixed_operations, i) for i in range(num_threads)]
            for future in as_completed(futures):
                future.result()  # Should not raise

        # System should still be responsive
        final_query = api_client.query(test_project, ["thread"])
        assert final_query.get("success") is True

    def test_concurrent_project_isolation_hold(self, api_client):
        """Project isolation holds under concurrent access to multiple projects."""
        projects = [f"project-{i}" for i in range(5)]

        def project_operations(project_id, project_name):
            project = projects[project_id]
            for i in range(10):
                api_client.store(project, f"Data in {project_name} iteration {i}")
            api_client.query(project, [project_name])

        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [
                executor.submit(project_operations, i, f"project-{i}")
                for i in range(5)
            ]
            for future in as_completed(futures):
                future.result()

        # Verify isolation holds
        for project in projects:
            result = api_client.query(project, ["data"])
            results = result.get("memories", [])
            project_name = project.split("-")[1]

            # Each project should only see its own data
            for memory in results:
                assert f"project-{project_name}" in memory.get("content", ""), \
                    f"Project {project} contains data from another project"
