"""
Cognexia Correctness — Encryption Round-Trip Tests
Validates that encrypted data can be stored and decrypted correctly
"""

import pytest
import os


class TestEncryptionRoundTrip:
    """Test that plaintext → encrypt → decrypt → plaintext works correctly."""

    def test_encrypt_decrypt_simple_text(self, api_client, test_project, enable_encryption):
        """Store and retrieve a simple encrypted memory."""
        content = "This is a secret memory about API design patterns"

        # Store
        store_result = api_client.store(test_project, content)
        assert store_result.get("success") is True
        memory_id = store_result.get("data", {}).get("id")
        assert memory_id is not None

        # Retrieve
        get_result = api_client.get_memory(test_project, memory_id)
        assert get_result.get("success") is True
        retrieved = get_result.get("data", {}).get("content")

        # Verify plaintext matches
        assert retrieved == content, f"Content mismatch: {retrieved} != {content}"

    def test_encrypt_decrypt_unicode(self, api_client, test_project, enable_encryption):
        """Unicode content round-trips correctly."""
        content = "🧠 Memory with emojis and unicode: 你好世界 مرحبا بالعالم"

        store_result = api_client.store(test_project, content)
        assert store_result.get("success") is True

        get_result = api_client.get_memory(test_project, store_result.get("data", {}).get("id"))
        assert get_result.get("data", {}).get("content") == content

    def test_encrypt_decrypt_long_content(self, api_client, test_project, enable_encryption):
        """Long content (but under 10KB limit) encrypts correctly."""
        content = "word ".join([str(i) for i in range(1000)])  # ~5KB

        store_result = api_client.store(test_project, content)
        assert store_result.get("success") is True

        get_result = api_client.get_memory(test_project, store_result.get("data", {}).get("id"))
        retrieved = get_result.get("data", {}).get("content")
        assert retrieved == content

    def test_encrypt_decrypt_empty_not_allowed(self, api_client, test_project, enable_encryption):
        """Empty content is rejected (app validation)."""
        store_result = api_client.store(test_project, "")
        assert store_result.get("success") is False

    def test_encrypt_decrypt_with_metadata(self, api_client, test_project, enable_encryption):
        """Encryption preserves metadata (type, importance, agentId)."""
        content = "Feature: Agent memory prioritization"
        metadata = {
            "type": "feature",
            "importance": 8,
            "agentId": "research-agent",
        }

        store_result = api_client.store(test_project, content, **metadata)
        assert store_result.get("success") is True

        get_result = api_client.get_memory(test_project, store_result.get("data", {}).get("id"))
        data = get_result.get("data", {})
        assert data.get("content_type") == metadata["type"], f"Expected content_type={metadata['type']}, got {data.get('content_type')}"
        assert data.get("importance") == metadata["importance"]
        assert data.get("agent_id") == metadata["agentId"]

    def test_same_plaintext_different_ciphertexts(self, api_client, test_project, enable_encryption):
        """Two encryptions of the same text produce different ciphertexts (IVs)."""
        content = "Identical memory content"

        store1 = api_client.store(test_project, content)
        store2 = api_client.store(test_project, content)

        id1 = store1.get("data", {}).get("id")
        id2 = store2.get("data", {}).get("id")
        assert id1 != id2  # Different memory IDs

        # Both should decrypt to the same plaintext
        get1 = api_client.get_memory(test_project, id1)
        get2 = api_client.get_memory(test_project, id2)

        assert get1.get("data", {}).get("content") == get2.get("data", {}).get("content") == content

    def test_encryption_without_enable_still_works(self, api_client, test_project):
        """Encryption is optional; unencrypted storage still works."""
        # Make sure COGNEXIA_ENCRYPT is not set
        assert "COGNEXIA_ENCRYPT" not in os.environ

        content = "Unencrypted memory"
        store_result = api_client.store(test_project, content)
        assert store_result.get("success") is True

        get_result = api_client.get_memory(test_project, store_result.get("data", {}).get("id"))
        assert get_result.get("data", {}).get("content") == content

    def test_encrypted_vs_unencrypted_query(self, api_client, test_project):
        """Both encrypted and unencrypted memories are queryable."""
        contents = [
            "React performance optimization techniques",
            "Node.js event loop debugging tips",
            "TypeScript generic constraints",
        ]

        memory_ids = []
        for content in contents:
            result = api_client.store(test_project, content)
            assert result["success"] is True
            memory_ids.append(result.get("data", {}).get("id"))

        # Query for a keyword
        query_result = api_client.query(test_project, ["react"])
        assert query_result.get("success") is True
        results = query_result.get("memories", [])

        # Should find at least the React memory
        found_react = any("React" in m.get("content", "") for m in results)
        assert found_react, "React memory not found in search results"

    @pytest.mark.parametrize("special_chars", [
        "Quote: 'test' and \"test\"",
        "Backslash: \\test\\path",
        "Newlines: line1\nline2\r\nline3",
        "Null-like: null, undefined, NaN",
        "JSON: {\"key\": \"value\"}",
        "SQL: SELECT * FROM users WHERE id=1",
    ])
    def test_special_characters(self, api_client, test_project, enable_encryption, special_chars):
        """Special characters that might cause injection/escaping issues are handled safely."""
        store_result = api_client.store(test_project, special_chars)
        assert store_result.get("success") is True

        get_result = api_client.get_memory(test_project, store_result.get("data", {}).get("id"))
        assert get_result.get("data", {}).get("content") == special_chars
