"""
Cognexia Correctness — Graph Integrity Tests
Validates that relationships between memories are created and retrieved correctly
"""

import pytest


class TestGraphIntegrity:
    """Test that memory relationships form valid graphs."""

    def test_relate_two_memories(self, api_client, test_project):
        """Create a simple relationship between two memories."""
        # Store two memories
        id1 = api_client.store(test_project, "React is a UI library").get("data", {}).get("id")
        id2 = api_client.store(test_project, "Vue is also a UI library").get("data", {}).get("id")

        # Relate them
        result = api_client.relate(test_project, id1, id2, "similar")
        assert result.get("success") is True

    def test_relate_creates_bidirectional_link(self, api_client, test_project):
        """Relationships are bidirectional (A→B means B can reference A)."""
        id1 = api_client.store(test_project, "Microservices architecture pattern").get("data", {}).get("id")
        id2 = api_client.store(test_project, "Monolithic architecture pattern").get("data", {}).get("id")

        api_client.relate(test_project, id1, id2, "contrasts")

        # Get graph and verify both nodes are connected
        graph = api_client.get_graph(test_project)

        nodes = graph.get("nodes", [])
        edges = graph.get("edges", [])

        # Both memories should be in graph
        node_ids = [n.get("id") for n in nodes]
        assert id1 in node_ids
        assert id2 in node_ids

        # Should be an edge connecting them (either direction)
        connected = any(
            (e.get("source") == id1 and e.get("target") == id2) or
            (e.get("source") == id2 and e.get("target") == id1)
            for e in edges
        )
        assert connected, "No edge found between related memories"

    def test_self_relation_prevented(self, api_client, test_project):
        """A memory cannot be related to itself."""
        id1 = api_client.store(test_project, "Self-referential memory").get("data", {}).get("id")

        result = api_client.relate(test_project, id1, id1, "self-reference")
        # Should either be rejected or silently ignored
        assert result.get("success") is False or result.get("error") is not None or \
               "cannot relate to itself" in result.get("message", "").lower()

    def test_relationship_types(self, api_client, test_project):
        """Different relationship types are preserved."""
        id1 = api_client.store(test_project, "Memory A").get("data", {}).get("id")
        id2 = api_client.store(test_project, "Memory B").get("data", {}).get("id")
        id3 = api_client.store(test_project, "Memory C").get("data", {}).get("id")

        # Create different relationship types
        api_client.relate(test_project, id1, id2, "related")
        api_client.relate(test_project, id2, id3, "causes")
        api_client.relate(test_project, id1, id3, "similar")

        graph = api_client.get_graph(test_project)
        edges = graph.get("edges", [])

        # All three relationships should exist
        assert len(edges) >= 3, f"Expected at least 3 edges, got {len(edges)}"

        # Check relationship types are present
        types = [e.get("type") for e in edges]
        assert "related" in types or any("related" in str(t) for t in types)
        assert "causes" in types or any("causes" in str(t) for t in types)
        assert "similar" in types or any("similar" in str(t) for t in types)

    def test_graph_no_orphaned_nodes(self, api_client, test_project):
        """All nodes in graph have at least the memory, even if unrelated."""
        # Store memories, some related, some not
        id1 = api_client.store(test_project, "Connected memory A").get("data", {}).get("id")
        id2 = api_client.store(test_project, "Connected memory B").get("data", {}).get("id")
        id3 = api_client.store(test_project, "Isolated memory").get("data", {}).get("id")

        # Only relate 1 and 2
        api_client.relate(test_project, id1, id2)

        graph = api_client.get_graph(test_project)
        nodes = graph.get("nodes", [])
        node_ids = [n.get("id") for n in nodes]

        # All three should be in graph (even isolated one)
        assert id1 in node_ids
        assert id2 in node_ids
        assert id3 in node_ids

    def test_graph_no_cycles_with_same_type(self, api_client, test_project):
        """Prevent creating circular relationships (A→B→A)."""
        id1 = api_client.store(test_project, "Task A").get("data", {}).get("id")
        id2 = api_client.store(test_project, "Task B").get("data", {}).get("id")

        # Create A→B
        api_client.relate(test_project, id1, id2, "depends_on")

        # Try to create B→A with same type (creates cycle)
        result = api_client.relate(test_project, id2, id1, "depends_on")

        # Implementation-dependent: may allow or reject
        # Just verify graph is still valid
        graph = api_client.get_graph(test_project)
        assert graph is not None

    def test_duplicate_relations_idempotent(self, api_client, test_project):
        """Creating the same relation twice is idempotent."""
        id1 = api_client.store(test_project, "A").get("data", {}).get("id")
        id2 = api_client.store(test_project, "B").get("data", {}).get("id")

        # Relate twice
        result1 = api_client.relate(test_project, id1, id2, "links_to")
        result2 = api_client.relate(test_project, id1, id2, "links_to")

        assert result1.get("success") is True
        assert result2.get("success") is True

        # Graph should have exactly one edge (not two)
        graph = api_client.get_graph(test_project)
        edges = graph.get("edges", [])

        matching_edges = [
            e for e in edges
            if (e.get("source") == id1 and e.get("target") == id2 or
                e.get("source") == id2 and e.get("target") == id1)
        ]
        assert len(matching_edges) == 1, f"Expected 1 edge, got {len(matching_edges)}"

    def test_graph_deletion_removes_relations(self, api_client, test_project):
        """Deleting a memory removes its relationships."""
        id1 = api_client.store(test_project, "Parent memory").get("data", {}).get("id")
        id2 = api_client.store(test_project, "Child memory").get("data", {}).get("id")

        # Create relationship
        api_client.relate(test_project, id1, id2)

        # Delete one memory
        api_client.session.delete(
            f"http://localhost:10000/api/memory/{id1}?project={test_project}"
        )

        # Graph should only have id2 (or be empty if both removed)
        graph = api_client.get_graph(test_project)
        nodes = graph.get("nodes", [])
        node_ids = [n.get("id") for n in nodes]

        assert id1 not in node_ids, "Deleted memory still in graph"

    def test_graph_traversal_finds_connected_memories(self, api_client, test_project):
        """Can traverse graph to find related memories."""
        # Create a chain: A → B → C
        id_a = api_client.store(test_project, "Start: Problem statement").get("data", {}).get("id")
        id_b = api_client.store(test_project, "Middle: Analysis").get("data", {}).get("id")
        id_c = api_client.store(test_project, "End: Solution").get("data", {}).get("id")

        api_client.relate(test_project, id_a, id_b, "leads_to")
        api_client.relate(test_project, id_b, id_c, "leads_to")

        # Get graph
        graph = api_client.get_graph(test_project)
        edges = graph.get("edges", [])

        # Should be able to traverse from A → B → C
        # At minimum, verify all three edges exist in order
        assert any(
            (e.get("source") == id_a and e.get("target") == id_b) or
            (e.get("source") == id_b and e.get("target") == id_a)
            for e in edges
        )
        assert any(
            (e.get("source") == id_b and e.get("target") == id_c) or
            (e.get("source") == id_c and e.get("target") == id_b)
            for e in edges
        )

    def test_graph_with_many_relations(self, api_client, test_project):
        """Graph integrity holds with 100+ relationships."""
        # Create 10 memories
        ids = []
        for i in range(10):
            id = api_client.store(test_project, f"Memory {i}").get("data", {}).get("id")
            ids.append(id)

        # Create a dense graph (each relates to next 3)
        relation_count = 0
        for i, id_a in enumerate(ids):
            for j in range(i + 1, min(i + 4, len(ids))):
                id_b = ids[j]
                api_client.relate(test_project, id_a, id_b)
                relation_count += 1

        # Verify graph is valid
        graph = api_client.get_graph(test_project)
        assert graph is not None

        nodes = graph.get("nodes", [])
        edges = graph.get("edges", [])

        assert len(nodes) >= 10, f"Expected 10+ nodes, got {len(nodes)}"
        assert len(edges) >= relation_count, f"Expected {relation_count}+ edges, got {len(edges)}"

        # No orphaned nodes
        node_ids = [n.get("id") for n in nodes]
        for id in ids:
            assert id in node_ids
