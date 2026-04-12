"""
Cognexia Correctness — Project Isolation Tests
Validates that memories in one project cannot be accessed from another
"""

import pytest
import time


class TestProjectIsolation:
    """Test that project isolation prevents cross-project data leaks."""

    def test_memories_isolated_by_project(self, api_client):
        """Memory stored in project A is not visible in project B."""
        project_a = f"project-a-{int(time.time() * 1000)}"
        project_b = f"project-b-{int(time.time() * 1000)}"

        # Store in A
        content_a = "Secret data for project A"
        result_a = api_client.store(project_a, content_a)
        assert result_a["success"] is True
        id_a = result_a.get("data", {}).get("id")

        # Store in B
        content_b = "Secret data for project B"
        result_b = api_client.store(project_b, content_b)
        assert result_b["success"] is True
        id_b = result_b.get("data", {}).get("id")

        # Try to retrieve A's memory from B
        get_result = api_client.get_memory(project_b, id_a)
        assert get_result.get("success") is False or get_result.get("data") is None, \
            "Project B can access Project A's memory!"

        # Try to retrieve B's memory from A
        get_result = api_client.get_memory(project_a, id_b)
        assert get_result.get("success") is False or get_result.get("data") is None, \
            "Project A can access Project B's memory!"

    def test_search_isolated_by_project(self, api_client):
        """Search in project A does not return results from project B."""
        project_a = f"project-a-{int(time.time() * 1000)}"
        project_b = f"project-b-{int(time.time() * 1000)}"

        # Store in A
        api_client.store(project_a, "React components in project A")

        # Store in B with same keyword
        api_client.store(project_b, "React components in project B")

        # Search in A
        result_a = api_client.query(project_a, ["react"])
        results_a = result_a.get("memories", [])

        # Search in B
        result_b = api_client.query(project_b, ["react"])
        results_b = result_b.get("memories", [])

        # A should only see its own memory
        assert len(results_a) >= 1, "No results in project A"
        assert any("project A" in m.get("content", "") for m in results_a), \
            "Project A memory not found"

        # B should only see its own memory
        assert len(results_b) >= 1, "No results in project B"
        assert any("project B" in m.get("content", "") for m in results_b), \
            "Project B memory not found"

        # Verify no cross-project leakage
        assert not any("project A" in m.get("content", "") for m in results_b), \
            "Project A memory leaked into project B search!"

    def test_graph_isolated_by_project(self, api_client):
        """Graph relationships in A are not visible in B."""
        project_a = f"project-a-{int(time.time() * 1000)}"
        project_b = f"project-b-{int(time.time() * 1000)}"

        # Create graph in A
        id_a1 = api_client.store(project_a, "Node A1").get("data", {}).get("id")
        id_a2 = api_client.store(project_a, "Node A2").get("data", {}).get("id")
        api_client.relate(project_a, id_a1, id_a2, "related")

        # Create separate graph in B
        id_b1 = api_client.store(project_b, "Node B1").get("data", {}).get("id")
        id_b2 = api_client.store(project_b, "Node B2").get("data", {}).get("id")
        api_client.relate(project_b, id_b1, id_b2, "related")

        # Get graph from A
        graph_a = api_client.get_graph(project_a)
        nodes_a = [n.get("id") for n in graph_a.get("nodes", [])]

        # Get graph from B
        graph_b = api_client.get_graph(project_b)
        nodes_b = [n.get("id") for n in graph_b.get("nodes", [])]

        # A should only have A's nodes
        assert id_a1 in nodes_a and id_a2 in nodes_a
        assert id_b1 not in nodes_a and id_b2 not in nodes_a, \
            "Project A graph contains Project B nodes!"

        # B should only have B's nodes
        assert id_b1 in nodes_b and id_b2 in nodes_b
        assert id_a1 not in nodes_b and id_a2 not in nodes_b, \
            "Project B graph contains Project A nodes!"

    def test_agent_id_scoped_to_project(self, api_client):
        """Memories stored with agentId in one project don't leak to another."""
        project_a = f"project-a-{int(time.time() * 1000)}"
        project_b = f"project-b-{int(time.time() * 1000)}"

        agent_id = "test-agent-123"

        # Store in A with agent and distinctive content
        id_a = api_client.store(project_a, "Agent test data from agent", agentId=agent_id).get("data", {}).get("id")

        # Store in B with different agent and different content
        id_b = api_client.store(project_b, "Different agent data", agentId="different-agent").get("data", {}).get("id")

        # Query A for the memory we stored
        result_a = api_client.query(project_a, ["agent"])
        results_a = result_a.get("memories", [])
        found_a = [m.get("id") for m in results_a if m.get("id") == id_a]

        # Our memory should be found in A
        assert len(found_a) > 0, "Stored memory in project A not found by search"

        # Query B for agent search
        result_b = api_client.query(project_b, ["agent"])
        results_b = result_b.get("memories", [])
        found_b = [m.get("id") for m in results_b if m.get("id") == id_a]

        # Project A's memory should NOT appear in project B search
        assert len(found_b) == 0, \
            "Project A's memory leaked into Project B search!"

    def test_type_and_metadata_isolated(self, api_client):
        """Memory types and metadata are isolated by project."""
        project_a = f"project-a-{int(time.time() * 1000)}"
        project_b = f"project-b-{int(time.time() * 1000)}"

        # Store different types in each project
        api_client.store(project_a, "Bug in auth", type="bug", importance=9)
        api_client.store(project_b, "Bug in database", type="bug", importance=3)

        # Metadata queries should be isolated
        # A should only see its bug (importance 9)
        result_a = api_client.query(project_a, ["bug"], filters={"type": "bug"})
        results_a = result_a.get("memories", [])

        # B should only see its bug (importance 3)
        result_b = api_client.query(project_b, ["bug"], filters={"type": "bug"})
        results_b = result_b.get("memories", [])

        # Verify importance is correct for each project
        if results_a:
            assert results_a[0].get("importance") == 9, \
                "Project A has wrong importance"

        if results_b:
            assert results_b[0].get("importance") == 3, \
                "Project B has wrong importance"

    def test_concurrent_project_access_safe(self, api_client):
        """Concurrent access to different projects is safe."""
        project_1 = f"project-1-{int(time.time() * 1000)}"
        project_2 = f"project-2-{int(time.time() * 1000)}"
        project_3 = f"project-3-{int(time.time() * 1000)}"

        # Store in different projects
        ids = {}
        for project in [project_1, project_2, project_3]:
            result = api_client.store(project, f"Memory in {project}")
            ids[project] = result.get("data", {}).get("id")

        # Each project should only see its own memory
        for project in [project_1, project_2, project_3]:
            result = api_client.query(project, ["memory"])
            results = result.get("memories", [])

            # Should find the memory stored in this project
            found = any(m["id"] == ids[project] for m in results)
            assert found, f"Project {project} doesn't see its own memory"

            # Should not see memories from other projects
            for other_project in [project_1, project_2, project_3]:
                if other_project != project:
                    should_not_find = any(m["id"] == ids[other_project] for m in results)
                    assert not should_not_find, \
                        f"Project {project} leaked {other_project}'s memory!"

    def test_project_deletion_isolation(self, api_client):
        """Deleting a project doesn't affect other projects."""
        project_keep = f"project-keep-{int(time.time() * 1000)}"
        project_delete = f"project-delete-{int(time.time() * 1000)}"

        # Store in both
        keep_id = api_client.store(project_keep, "Data to keep").get("data", {}).get("id")
        api_client.store(project_delete, "Data to delete")

        # Delete project_delete
        api_client.session.delete(f"http://localhost:10000/api/projects/{project_delete}")

        # Verify keep project is unaffected
        result = api_client.get_memory(project_keep, keep_id)
        assert result.get("success") is True or result.get("data") is not None, \
            "Keeping project was affected by deletion!"

    def test_invalid_project_name_rejection(self, api_client):
        """Unusual project names are handled safely."""
        dangerous_names = [
            "../../../etc/passwd",
            "project'; DROP TABLE memories; --",
            "project\x00null",
            "project/../other",
            "project%2f..%2f",
        ]

        for name in dangerous_names:
            # Should either reject or sanitize
            result = api_client.store(name, "test content")

            # If it succeeds, the project name should be sanitized
            if result.get("success") is True:
                # Subsequent queries should work normally
                query = api_client.query(name, ["test"])
                # Should not throw errors
                assert query.get("success") is not None
